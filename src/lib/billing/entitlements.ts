// ============================================================================
// ENTITLEMENTS — THE LAYER THAT SAYS NO
//
// Three files sit under this one and each answers a different question.
// `plans.ts` says what a plan is allowed to do. `meter.ts` says what a call cost.
// `wallet.ts` says what is left to spend. None of them knows who is asking.
//
// This file is where a Clerk user id turns into a live answer. It reads the
// `Subscription` row, works out which plan is actually in force right now — which
// is not always the plan the row names — and then refuses or permits a specific
// action against three independent limits:
//
//   the feature switch   Go has no Goal tab. No amount of credits changes that.
//   the per-period cap   Go is not sold with five quick articles, so a Go account
//                        with credits to spare still does not get a fifth.
//   the credit balance   what is actually left in the wallet.
//
// All three have to hold. They are separate on purpose: credits alone would let a
// top-up buy a feature the plan does not include, and features alone would let a
// $19 account render a hundred videos.
//
// CONCURRENCY
//
// A cap that is read and then written is a cap two simultaneous requests walk
// straight through. So the counter is claimed atomically — incremented first, then
// compared against the ceiling, and rolled back if it went over. Credits get the
// same treatment one level down, in `wallet.ts`, where every mutation opens with
// `SELECT … FOR UPDATE`. Neither limit depends on requests arriving politely.
//
// THE SHAPE CALL SITES SHOULD USE
//
// `runAction()`. It gates, reserves, opens the metering scope, runs the work, and
// settles or refunds — so a route cannot accidentally do five of those six things.
// `beginAction`/`completeAction`/`failAction` exist for the streaming routes that
// cannot wrap their work in a single closure.
// ============================================================================

import prisma from "@/lib/db";
import { getAction, type ActionKey } from "./actions";
import {
  FEATURE_LABELS,
  PLAN_TIERS,
  UNLIMITED,
  formatCap,
  getEntitlements,
  getPlanConfig,
  isUnlimited,
  lowestPlanWith,
  planRank,
  type FeatureKey,
  type PlanEntitlements,
  type PlanTier,
} from "./plans";
import { getActionCostMicros, withMeterContext } from "./meter";
import { costMicrosToCredits } from "./modelPricing";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { getAccountBlock, type AccountBlock } from "@/lib/admin/block";
import {
  attachLedgerCost,
  debitCredits,
  getWalletBalance,
  refundCredits,
  releaseHold,
  reserveCredits,
  settleHold,
  type WalletBalance,
} from "./wallet";

/**
 * How long past `periodEnd` a subscription nobody renewed keeps its features.
 *
 * Not a loophole: credits are granted per period and the grant is keyed to
 * `periodStart`, so a stale row cannot mint anything. All this window protects is
 * a paying customer whose renewal webhook was delayed — they keep the tab they
 * paid for instead of being dropped to Free by our own plumbing.
 */
const STALE_PERIOD_GRACE_MS = 7 * 24 * 60 * 60_000;

/** Mirrors the Prisma `SubscriptionStatus` enum without importing the client type. */
export type SubscriptionStatusValue =
  | "NONE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "UNPAID"
  | "CANCELLED"
  | "EXPIRED"
  | "PAUSED";

// ─────────────────────────────────────────────────────────────────────────────
// The plan in force
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanContext {
  userId: string;
  /** The plan actually in force, after status and dates have been applied. */
  plan: PlanTier;
  /** What the row says. Differs from `plan` when the subscription lapsed. */
  storedPlan: PlanTier;
  status: SubscriptionStatusValue;
  entitlements: PlanEntitlements;
  /** The window per-period caps count against. */
  periodStart: Date;
  periodEnd: Date;
  trialEndsAt: Date | null;
  /** When a cancelled subscription loses access. */
  endsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  isTrial: boolean;
  /** Paid plan whose period ended and whose renewal never arrived. */
  stale: boolean;
  /** From a Lemon Squeezy test store. Never grants live entitlements. */
  testMode: boolean;
  /** Set when an admin suspended the account. No feature is available while set. */
  blocked?: AccountBlock | null;
}

/**
 * The counting window for an account with no live subscription.
 *
 * Free has caps too, and a cap needs a boundary to reset on. A lapsed row's
 * `periodStart` is the wrong boundary — it would freeze the Free counters at
 * whatever the last paid period was — so account-less counting uses the calendar
 * month in UTC. UTC rather than local time because the reset must not move when
 * the server does.
 */
function calendarPeriod(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/** A context for someone with nothing to their name. */
function freeContext(userId: string, now: Date, patch?: Partial<PlanContext>): PlanContext {
  const period = calendarPeriod(now);
  return {
    userId,
    plan: "FREE",
    storedPlan: "FREE",
    status: "NONE",
    entitlements: getEntitlements("FREE"),
    periodStart: period.start,
    periodEnd: period.end,
    trialEndsAt: null,
    endsAt: null,
    cancelAtPeriodEnd: false,
    isTrial: false,
    stale: false,
    testMode: false,
    ...patch,
  };
}

/**
 * The plan a user is actually on right now.
 *
 * One row read, then a decision per status. The statuses that keep access are the
 * ones where the customer has not chosen to leave:
 *
 *   TRIALING   the trial's own entitlements, until `trialEndsAt` passes
 *   ACTIVE     the plan, until `periodEnd` plus the stale grace
 *   PAST_DUE   the plan — a card expired, which is not the same as leaving
 *   CANCELLED  the plan, until `endsAt`: they paid for this period
 *
 * PAUSED, UNPAID, EXPIRED and NONE all resolve to Free. So does a test-mode
 * subscription in production, because a test store's checkout is free to anyone
 * who finds the link.
 */
export async function getPlanContext(userId: string, now = new Date()): Promise<PlanContext> {
  if (!userId) return freeContext("", now);

  // The admin's plan and model changes are read from the database at most once
  // per cache window. This is the one place every metered path passes through,
  // so refreshing here is what makes a change made in the back office live on
  // every serverless instance without a deploy.
  await ensureRuntimeConfig();

  // A blocked account has no plan. Every gate refuses it with a message that
  // names the block rather than a made-up plan boundary.
  const block = await getAccountBlock(userId);
  if (block) {
    return freeContext(userId, now, {
      entitlements: { ...getEntitlements("FREE"), features: [], caps: {} },
      blocked: block,
    });
  }

  let sub: {
    plan: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    trialEndsAt: Date | null;
    endsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    testMode: boolean;
  } | null = null;

  try {
    sub = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        plan: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        trialEndsAt: true,
        endsAt: true,
        cancelAtPeriodEnd: true,
        testMode: true,
      },
    });
  } catch (err) {
    // A database that cannot be read must not hand out Agency. Free is the safe
    // direction for a failure: the customer sees an upgrade prompt they can
    // complain about, rather than us silently giving work away.
    console.error("[entitlements] subscription read failed", err);
    return freeContext(userId, now);
  }

  if (!sub) return freeContext(userId, now);

  const status = sub.status as SubscriptionStatusValue;
  const storedPlan = sub.plan as PlanTier;
  const testMode = sub.testMode === true;

  const base = {
    userId,
    storedPlan,
    status,
    trialEndsAt: sub.trialEndsAt,
    endsAt: sub.endsAt,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    testMode,
  };

  if (testMode && process.env.NODE_ENV === "production") {
    return freeContext(userId, now, base);
  }

  const trialOver = sub.trialEndsAt !== null && sub.trialEndsAt.getTime() <= now.getTime();
  const accessEndsAt = sub.endsAt ?? sub.periodEnd;
  const cancelledOver = accessEndsAt.getTime() <= now.getTime();
  const stale = sub.periodEnd.getTime() + STALE_PERIOD_GRACE_MS <= now.getTime();

  let plan: PlanTier = "FREE";
  switch (status) {
    case "TRIALING":
      // The trial's own entitlements, never the plan it will become. A trial is
      // sold as a subscription with a 3-day trial on it, so the row says GO from
      // the moment it starts — and Go's allowance for $1 would be the whole
      // business model given away.
      plan = trialOver ? "FREE" : "TRIAL";
      break;
    case "ACTIVE":
    case "PAST_DUE":
      plan = stale ? "FREE" : storedPlan;
      break;
    case "CANCELLED":
      plan = cancelledOver ? "FREE" : storedPlan;
      break;
    default:
      plan = "FREE";
  }

  // A lapsed account counts against the calendar month, not against the period it
  // stopped paying for — otherwise its Free counters would never reset again.
  const period =
    plan === "FREE"
      ? calendarPeriod(now)
      : { start: sub.periodStart, end: sub.periodEnd };

  return {
    ...base,
    plan,
    entitlements: getEntitlements(plan),
    periodStart: period.start,
    periodEnd: period.end,
    isTrial: plan === "TRIAL",
    stale: plan !== "FREE" && stale,
  };
}

/** For the many call sites that only need the tier. */
export async function getAccountPlan(userId: string): Promise<PlanTier> {
  return (await getPlanContext(userId)).plan;
}

/** Accepts a user id or an already-loaded context, so nothing reads twice. */
export type PlanSource = string | PlanContext;

async function contextOf(source: PlanSource): Promise<PlanContext> {
  return typeof source === "string" ? getPlanContext(source) : source;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refusals
//
// Every check returns the same shape, and every refusal carries enough to render
// a useful prompt: which limit was hit, what the ceiling was, and the cheapest
// plan that lifts it. A refusal that only says "not allowed" turns into a support
// ticket; one that says "Go includes 4 quick articles a month, you have used 4"
// turns into an upgrade.
// ─────────────────────────────────────────────────────────────────────────────

export type GateReason =
  | "FEATURE_LOCKED"
  | "CAP_REACHED"
  | "INSUFFICIENT_CREDITS"
  | "STORAGE_FULL"
  | "WORKSPACE_LIMIT"
  | "ACCOUNT_LIMIT"
  | "SEAT_LIMIT"
  | "UNKNOWN_ACTION";

export interface GateResult {
  allowed: boolean;
  plan: PlanTier;
  reason?: GateReason;
  /** One sentence, written to be shown to the customer as-is. */
  message?: string;
  /** The cheapest plan that would have allowed this. */
  requiredPlan?: PlanTier;
  feature?: FeatureKey;
  /** Per-period ceiling and how much of it is gone, for CAP_REACHED. */
  cap?: number;
  used?: number;
  /** Credits asked for, credits available, and the gap, for INSUFFICIENT_CREDITS. */
  credits?: number;
  available?: number;
  shortfall?: number;
  /** Megabytes, for STORAGE_FULL. */
  limitMb?: number;
  usedMb?: number;
}

const ALLOWED = (plan: PlanTier): GateResult => ({ allowed: true, plan });

/** The HTTP status a refusal should become. Payment problems are 402, not 403. */
export function gateStatus(reason: GateReason | undefined): number {
  switch (reason) {
    case "INSUFFICIENT_CREDITS":
      return 402;
    case "UNKNOWN_ACTION":
      return 400;
    default:
      return 403;
  }
}

/** Thrown by the `require*` helpers and by `runAction`. */
export class EntitlementError extends Error {
  readonly gate: GateResult;
  readonly status: number;

  constructor(gate: GateResult) {
    super(gate.message ?? "This plan does not allow that.");
    this.name = "EntitlementError";
    this.gate = gate;
    this.status = gateStatus(gate.reason);
  }
}

export function isEntitlementError(err: unknown): err is EntitlementError {
  return err instanceof EntitlementError;
}

/** The JSON body a refused route should return. */
export function gateToResponseBody(gate: GateResult): Record<string, unknown> {
  return {
    error: gate.message ?? "Not included in your plan.",
    reason: gate.reason,
    plan: gate.plan,
    requiredPlan: gate.requiredPlan,
    feature: gate.feature,
    cap: gate.cap,
    used: gate.used,
    credits: gate.credits,
    available: gate.available,
    shortfall: gate.shortfall,
    // Carried so a refusal can be drawn as a usage bar rather than only read as a
    // sentence. Only STORAGE_FULL sets them; everywhere else they are undefined and
    // drop out of the JSON.
    limitMb: gate.limitMb,
    usedMb: gate.usedMb,
    upgrade: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The feature switch
// ─────────────────────────────────────────────────────────────────────────────

/** Whether the plan includes this feature at all. Reads no counters. */
export async function checkFeature(
  source: PlanSource,
  feature: FeatureKey
): Promise<GateResult> {
  const ctx = await contextOf(source);
  if (ctx.entitlements.features.includes(feature)) return ALLOWED(ctx.plan);

  const requiredPlan = lowestPlanWith(feature);
  return {
    allowed: false,
    plan: ctx.plan,
    reason: "FEATURE_LOCKED",
    feature,
    requiredPlan,
    message: `${FEATURE_LABELS[feature]} is included from ${getPlanConfig(requiredPlan).name} upwards.`,
  };
}

/** Same, as an assertion. */
export async function requireFeature(
  source: PlanSource,
  feature: FeatureKey
): Promise<PlanContext> {
  const ctx = await contextOf(source);
  const gate = await checkFeature(ctx, feature);
  if (!gate.allowed) throw new EntitlementError(gate);
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// The per-period cap
//
// `FeatureUsage` holds one row per (user, feature, period). The row is claimed
// before the work is authorised and rolled back if anything downstream refuses,
// which is the opposite of the obvious order and the only one that is safe: read
// then write leaves a window two requests both fit through.
// ─────────────────────────────────────────────────────────────────────────────

/** How much of a capped feature this period has already used. */
export async function getFeatureUsed(
  userId: string,
  feature: FeatureKey,
  periodStart: Date
): Promise<number> {
  try {
    const row = await prisma.featureUsage.findUnique({
      where: { userId_feature_periodStart: { userId, feature, periodStart } },
      select: { used: true },
    });
    return row?.used ?? 0;
  } catch (err) {
    console.error("[entitlements] getFeatureUsed failed", { feature, err });
    // Counting failed, so the cap cannot be enforced. Report the ceiling as
    // consumed: a wrongly-refused action is a complaint, a wrongly-allowed one is
    // money spent that nobody authorised.
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Every capped feature's usage this period, for the billing page's meters. */
export async function getFeatureUsageMap(
  source: PlanSource
): Promise<Record<string, { used: number; cap: number }>> {
  const ctx = await contextOf(source);
  const features = Object.keys(ctx.entitlements.caps) as FeatureKey[];
  if (features.length === 0) return {};

  try {
    const rows = await prisma.featureUsage.findMany({
      where: { userId: ctx.userId, periodStart: ctx.periodStart, feature: { in: features } },
      select: { feature: true, used: true },
    });
    const byFeature = new Map(rows.map((row) => [row.feature, row.used]));
    const out: Record<string, { used: number; cap: number }> = {};
    for (const feature of features) {
      out[feature] = {
        used: byFeature.get(feature) ?? 0,
        cap: ctx.entitlements.caps[feature] ?? UNLIMITED,
      };
    }
    return out;
  } catch (err) {
    console.error("[entitlements] getFeatureUsageMap failed", err);
    return {};
  }
}

/**
 * Takes `quantity` off the period's allowance and returns the new total.
 *
 * Atomic: the increment happens in the database, so the number that comes back is
 * this request's place in the queue and not a stale read. The caller compares it
 * against the ceiling and calls `releaseFeatureUsage` if it went over.
 */
async function claimFeatureUsage(
  userId: string,
  feature: FeatureKey,
  periodStart: Date,
  periodEnd: Date,
  quantity: number
): Promise<number> {
  const where = { userId_feature_periodStart: { userId, feature, periodStart } };
  try {
    const row = await prisma.featureUsage.upsert({
      where,
      create: { userId, feature, periodStart, periodEnd, used: quantity },
      update: { used: { increment: quantity } },
      select: { used: true },
    });
    return row.used;
  } catch (err) {
    // Two first-of-the-period requests raced to create the row. One won; this one
    // increments what the winner wrote.
    if ((err as { code?: string })?.code === "P2002") {
      const row = await prisma.featureUsage.update({
        where,
        data: { used: { increment: quantity } },
        select: { used: true },
      });
      return row.used;
    }
    throw err;
  }
}

/** Gives a claim back when the action it was taken for did not happen. */
async function releaseFeatureUsage(
  userId: string,
  feature: FeatureKey,
  periodStart: Date,
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;
  try {
    // GREATEST in SQL rather than a read-modify-write, so a double release cannot
    // drive the counter negative and hand out a free allowance.
    await prisma.$executeRaw`
      UPDATE "FeatureUsage"
         SET "used" = GREATEST(0, "used" - ${quantity}), "updatedAt" = NOW()
       WHERE "userId" = ${userId}
         AND "feature" = ${feature}
         AND "periodStart" = ${periodStart}
    `;
  } catch (err) {
    console.error("[entitlements] releaseFeatureUsage failed", { feature, err });
  }
}

/** The cap check on its own, without claiming anything. */
export async function checkCap(
  source: PlanSource,
  feature: FeatureKey,
  quantity = 1
): Promise<GateResult> {
  const ctx = await contextOf(source);
  const cap = ctx.entitlements.caps[feature];
  if (cap === undefined || isUnlimited(cap)) return ALLOWED(ctx.plan);

  const used = await getFeatureUsed(ctx.userId, feature, ctx.periodStart);
  if (used + quantity <= cap) return ALLOWED(ctx.plan);

  const requiredPlan = nextPlanWithMoreCap(ctx.plan, feature, cap);
  return {
    allowed: false,
    plan: ctx.plan,
    reason: "CAP_REACHED",
    feature,
    cap,
    used: Math.min(used, cap),
    requiredPlan,
    message: capMessage(ctx, feature, cap, requiredPlan),
  };
}

/**
 * The cheapest plan above this one whose ceiling for the feature is genuinely
 * higher. Skips the trial, and skips a plan that happens to include the feature at
 * the same cap — "upgrade to Pro for the same 4 articles" is worse than no prompt.
 */
function nextPlanWithMoreCap(
  current: PlanTier,
  feature: FeatureKey,
  cap: number
): PlanTier | undefined {
  const ladder = ([...PLAN_TIERS] as PlanTier[])
    .filter((tier) => tier !== "TRIAL" && planRank(tier) > planRank(current))
    .sort((a, b) => planRank(a) - planRank(b));

  for (const tier of ladder) {
    const ent = getEntitlements(tier);
    if (!ent.features.includes(feature)) continue;
    const next = ent.caps[feature];
    if (next === undefined || isUnlimited(next) || next > cap) return tier;
  }
  return undefined;
}

function resetsOn(date: Date): string {
  try {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function capMessage(
  ctx: PlanContext,
  feature: FeatureKey,
  cap: number,
  requiredPlan: PlanTier | undefined
): string {
  const label = FEATURE_LABELS[feature];
  const window = ctx.isTrial ? "in the trial" : "this billing period";
  const head = `${label}: ${cap} ${cap === 1 ? "use" : "uses"} ${window} on ${getPlanConfig(ctx.plan).name}, and you have used ${cap === 1 ? "it" : "them all"}.`;

  if (!requiredPlan) return `${head} Resets ${resetsOn(ctx.periodEnd)}.`;

  const nextCap = getEntitlements(requiredPlan).caps[feature];
  const nextText = nextCap === undefined || isUnlimited(nextCap) ? "unlimited" : formatCap(nextCap);
  return `${head} ${getPlanConfig(requiredPlan).name} includes ${nextText}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The three checks together
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionCheck extends GateResult {
  action: ActionKey;
  /** Credits this action would cost at the requested quantity. */
  cost: number;
}

/**
 * Everything an action has to satisfy, checked without changing anything.
 *
 * This is what the UI asks so a button can be disabled with the real reason on it,
 * and what a route can ask before doing expensive preparation. It is deliberately
 * not what authorises the work: between this check and the work there is a window,
 * and `beginAction` is what closes it.
 */
export async function checkAction(
  source: PlanSource,
  action: ActionKey | string,
  options: { quantity?: number } = {}
): Promise<ActionCheck> {
  const ctx = await contextOf(source);
  const quantity = Math.max(1, Math.round(options.quantity ?? 1));

  let spec;
  try {
    spec = getAction(action);
  } catch {
    return {
      allowed: false,
      plan: ctx.plan,
      action: action as ActionKey,
      cost: 0,
      reason: "UNKNOWN_ACTION",
      message: `Unknown action "${action}".`,
    };
  }

  const cost = spec.credits * quantity;
  const base = { action: spec.key, cost };

  const feature = await checkFeature(ctx, spec.feature);
  if (!feature.allowed) return { ...feature, ...base };

  const cap = await checkCap(ctx, spec.countsAgainst ?? spec.feature, quantity);
  if (!cap.allowed) return { ...cap, ...base };

  if (cost > 0) {
    const wallet = await getWalletBalance(ctx.userId, ctx.plan);
    if (wallet.available < cost) {
      return { ...base, ...insufficient(ctx, cost, wallet.available) };
    }
  }

  return { ...ALLOWED(ctx.plan), ...base };
}

function insufficient(ctx: PlanContext, cost: number, available: number): GateResult {
  const canTopUp = ctx.entitlements.canBuyTopUps;
  return {
    allowed: false,
    plan: ctx.plan,
    reason: "INSUFFICIENT_CREDITS",
    credits: cost,
    available,
    shortfall: Math.max(0, cost - available),
    requiredPlan: nextPlanWithMoreCredits(ctx.plan),
    message: `This needs ${cost} credits and ${available} ${available === 1 ? "is" : "are"} left. ${
      canTopUp
        ? "Top up, or move to a larger plan."
        : "Your allowance resets " + resetsOn(ctx.periodEnd) + "."
    }`,
  };
}

function nextPlanWithMoreCredits(current: PlanTier): PlanTier | undefined {
  const here = getEntitlements(current).monthlyCredits;
  return ([...PLAN_TIERS] as PlanTier[])
    .filter((tier) => tier !== "TRIAL" && planRank(tier) > planRank(current))
    .sort((a, b) => planRank(a) - planRank(b))
    .find((tier) => {
      const credits = getEntitlements(tier).monthlyCredits;
      return isUnlimited(credits) || credits > here;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorising the work
//
// `beginAction` is the only function in the product that turns "may they?" into
// "they may, and it has been paid for". It claims the period counter and takes the
// credits in that order, and if either fails it undoes the other — so a refusal
// never leaves a phantom use behind and a charge never happens for work that was
// then refused.
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionTicket {
  ok: boolean;
  gate: GateResult;
  userId: string;
  action: ActionKey;
  feature: FeatureKey;
  countsAgainst: FeatureKey;
  plan: PlanTier;
  /** Credits committed: reserved if the action reserves, already debited if not. */
  credits: number;
  quantity: number;
  periodStart: Date;
  workspaceId: string | null;
  referenceId: string | null;
  /** Set when the credits are held rather than spent. Settle or release it. */
  holdId?: string;
  /** Set when the credits were debited outright. */
  ledgerId?: string;
  /** When authorisation completed, for matching usage rows back to this charge. */
  startedAt: Date;
  /** True when a period counter was incremented and must be given back on failure. */
  claimed: boolean;
}

function refusedTicket(
  ctx: PlanContext,
  action: string,
  gate: GateResult,
  patch: Partial<ActionTicket> = {}
): ActionTicket {
  return {
    ok: false,
    gate,
    userId: ctx.userId,
    action: action as ActionKey,
    feature: (gate.feature ?? "post.manual") as FeatureKey,
    countsAgainst: (gate.feature ?? "post.manual") as FeatureKey,
    plan: ctx.plan,
    credits: 0,
    quantity: 1,
    periodStart: ctx.periodStart,
    workspaceId: null,
    referenceId: null,
    startedAt: new Date(),
    claimed: false,
    ...patch,
  };
}

/**
 * Gates an action and takes payment for it.
 *
 * Never throws for a refusal — the ticket's `ok` is false and `gate` says why, so
 * a route can turn it straight into a response. It does throw if the database is
 * unreachable, which is a 500 and not a plan decision.
 */
export async function beginAction(args: {
  userId: string;
  action: ActionKey | string;
  workspaceId?: string | null;
  referenceId?: string | null;
  quantity?: number;
  /** A context already loaded this request, to save a read. */
  context?: PlanContext;
  /**
   * Per-unit price to charge instead of the catalogue's. Used when the price
   * depends on a runtime choice the catalogue cannot know — the chat model an
   * admin added with its own credit price.
   */
  unitCredits?: number;
}): Promise<ActionTicket> {
  const ctx = args.context ?? (await getPlanContext(args.userId));
  const quantity = Math.max(1, Math.round(args.quantity ?? 1));
  const workspaceId = args.workspaceId ?? null;
  const referenceId = args.referenceId ?? null;

  let spec;
  try {
    spec = getAction(args.action);
  } catch {
    return refusedTicket(ctx, String(args.action), {
      allowed: false,
      plan: ctx.plan,
      reason: "UNKNOWN_ACTION",
      message: `Unknown action "${args.action}".`,
    });
  }

  const countsAgainst = spec.countsAgainst ?? spec.feature;
  const unit =
    typeof args.unitCredits === "number" && Number.isFinite(args.unitCredits) && args.unitCredits >= 0
      ? Math.round(args.unitCredits)
      : spec.credits;
  const credits = unit * quantity;

  const featureGate = await checkFeature(ctx, spec.feature);
  if (!featureGate.allowed) {
    return refusedTicket(ctx, spec.key, featureGate, {
      feature: spec.feature,
      countsAgainst,
    });
  }

  // ── the period counter, claimed before it is checked ──────────────────────
  const cap = ctx.entitlements.caps[countsAgainst];
  const capped = cap !== undefined && !isUnlimited(cap);
  let claimed = false;

  if (capped) {
    const used = await claimFeatureUsage(
      ctx.userId,
      countsAgainst,
      ctx.periodStart,
      ctx.periodEnd,
      quantity
    );
    claimed = true;

    if (used > (cap as number)) {
      await releaseFeatureUsage(ctx.userId, countsAgainst, ctx.periodStart, quantity);
      const requiredPlan = nextPlanWithMoreCap(ctx.plan, countsAgainst, cap as number);
      return refusedTicket(ctx, spec.key, {
        allowed: false,
        plan: ctx.plan,
        reason: "CAP_REACHED",
        feature: countsAgainst,
        cap: cap as number,
        used: Math.min(used - quantity, cap as number),
        requiredPlan,
        message: capMessage(ctx, countsAgainst, cap as number, requiredPlan),
      });
    }
  }

  // ── the credits ──────────────────────────────────────────────────────────
  const base = {
    ok: true as boolean,
    gate: ALLOWED(ctx.plan),
    userId: ctx.userId,
    action: spec.key,
    feature: spec.feature,
    countsAgainst,
    plan: ctx.plan,
    credits,
    quantity,
    periodStart: ctx.periodStart,
    workspaceId,
    referenceId,
    startedAt: new Date(),
    claimed,
  } satisfies ActionTicket;

  if (credits <= 0) return base;

  const undoClaim = async () => {
    if (claimed) await releaseFeatureUsage(ctx.userId, countsAgainst, ctx.periodStart, quantity);
  };

  if (spec.reserve) {
    const hold = await reserveCredits({
      userId: ctx.userId,
      action: spec.key,
      credits,
      workspaceId,
      referenceId,
      ttlMs: spec.reserveMs,
      plan: ctx.plan,
    });
    if (!hold.ok) {
      await undoClaim();
      return refusedTicket(ctx, spec.key, insufficient(ctx, credits, hold.available ?? 0), {
        feature: spec.feature,
        countsAgainst,
      });
    }
    return { ...base, holdId: hold.holdId };
  }

  const debit = await debitCredits({
    userId: ctx.userId,
    action: spec.key,
    credits,
    workspaceId,
    referenceId,
    plan: ctx.plan,
  });
  if (!debit.ok) {
    await undoClaim();
    return refusedTicket(ctx, spec.key, insufficient(ctx, credits, debit.available ?? 0), {
      feature: spec.feature,
      countsAgainst,
    });
  }

  return { ...base, ledgerId: debit.ledgerId };
}

/**
 * Closes out a ticket whose work succeeded.
 *
 * A reservation becomes a debit; an outright debit only gets its measured cost
 * written back. `credits` may be lower than what was reserved — a campaign that
 * produced three posts instead of eight should charge for three — and `settleHold`
 * clamps it to what was actually held.
 *
 * `measureCost` walks the usage rows this action produced and writes their total
 * onto the ledger row. That is what makes "is `article.deep` at 350 credits still
 * right" answerable from our own tables instead of from a provider invoice. It is
 * off by default because usage rows are written fire-and-forget and may not have
 * landed by the time a request finishes; the nightly reconcile picks them up.
 */
export async function completeAction(args: {
  ticket: ActionTicket;
  credits?: number;
  /**
   * How many units the run actually delivered, when that is fewer than were
   * authorised. A 5-slide deck that returned 3 slides gives two slides back to the
   * period counter as well as to the balance — a cap counts what the customer got.
   */
  quantity?: number;
  costMicros?: number | null;
  measureCost?: boolean;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; balance?: number }> {
  const { ticket } = args;
  if (!ticket.ok) return { ok: false };

  if (args.quantity !== undefined && ticket.claimed) {
    const delivered = Math.max(0, Math.min(ticket.quantity, Math.round(args.quantity)));
    const unused = ticket.quantity - delivered;
    if (unused > 0) {
      await releaseFeatureUsage(ticket.userId, ticket.countsAgainst, ticket.periodStart, unused);
    }
  }

  let costMicros = args.costMicros ?? null;
  if (costMicros === null && args.measureCost) {
    const measured = await getActionCostMicros(ticket.userId, ticket.action, ticket.startedAt);
    costMicros = measured.costMicros > 0 ? measured.costMicros : null;
  }

  if (ticket.holdId) {
    const settled = await settleHold({
      holdId: ticket.holdId,
      userId: ticket.userId,
      credits: args.credits,
      costMicros,
      referenceType: args.referenceType ?? null,
      referenceId: args.referenceId ?? ticket.referenceId,
      note: args.note ?? null,
    });
    return { ok: settled.ok, balance: settled.balance };
  }

  if (ticket.ledgerId && costMicros !== null) {
    await attachLedgerCost(ticket.ledgerId, costMicros);
  }
  return { ok: true };
}

/**
 * Undoes a ticket whose work failed.
 *
 * Releases the reservation or refunds the debit, and gives the period counter
 * back. A failed generation must not consume a Trial's single video: the customer
 * did not get the video, so they did not use it.
 */
export async function failAction(
  ticket: ActionTicket,
  options: { refund?: boolean; note?: string | null } = {}
): Promise<void> {
  if (!ticket.ok) return;
  const refund = options.refund !== false;

  if (ticket.claimed) {
    await releaseFeatureUsage(
      ticket.userId,
      ticket.countsAgainst,
      ticket.periodStart,
      ticket.quantity
    );
  }

  if (!refund) return;

  if (ticket.holdId) {
    await releaseHold(ticket.holdId, ticket.userId);
    return;
  }

  if (ticket.ledgerId && ticket.credits > 0) {
    await refundCredits({
      userId: ticket.userId,
      credits: ticket.credits,
      action: ticket.action,
      workspaceId: ticket.workspaceId,
      referenceType: "reversal",
      referenceId: ticket.referenceId,
      // Keyed to the ledger row it reverses, so a retry of the error handler
      // cannot refund twice.
      idempotencyKey: `reverse:${ticket.ledgerId}`,
      spentInPeriodStart: ticket.periodStart,
      note: options.note ?? "Refunded: the work failed",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The wrapper call sites should reach for
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The product surface a usage row is filed under, derived from the action key.
 *
 * `ai.post.campaign` → "ai", `chat.message` → "chat", `article.deep` → "article".
 * Overridable, because the same action runs from more than one place: a video
 * rendered by the autopilot should read "goals", not "media".
 */
function surfaceOf(action: string): string {
  const head = action.split(".")[0];
  return head || "unknown";
}

export interface RunActionOptions {
  userId: string;
  action: ActionKey | string;
  workspaceId?: string | null;
  referenceId?: string | null;
  quantity?: number;
  /** A plan context already loaded this request. */
  context?: PlanContext;
  /** Overrides the `feature` column on the usage rows this produces. */
  surface?: string;
  /** Look up what the work actually cost and write it onto the ledger row. */
  measureCost?: boolean;
}

/**
 * Gate, charge, meter, run, settle — in one call.
 *
 * Every model-touching route should look like this. The work runs inside a
 * `withMeterContext` scope, so every call it makes lands in the usage table
 * attributed to this user and this action without the route threading anything
 * down; and it runs inside a try/finally that refunds on failure, so a crash
 * cannot leave a charge for work nobody received.
 *
 * Throws `EntitlementError` when the plan refuses. Routes should catch it and
 * reply `gateStatus(err.gate.reason)` with `gateToResponseBody(err.gate)`.
 */
export async function runAction<T>(
  options: RunActionOptions & {
    /** Adjust the final charge from the result — fewer posts, fewer credits. */
    settle?: (result: T) => {
      credits?: number;
      costMicros?: number | null;
      referenceId?: string | null;
    };
  },
  fn: (ticket: ActionTicket) => Promise<T>
): Promise<T> {
  const ticket = await beginAction({
    userId: options.userId,
    action: options.action,
    workspaceId: options.workspaceId,
    referenceId: options.referenceId,
    quantity: options.quantity,
    context: options.context,
  });

  if (!ticket.ok) throw new EntitlementError(ticket.gate);

  try {
    const result = await withMeterContext(
      {
        userId: ticket.userId,
        workspaceId: ticket.workspaceId,
        feature: options.surface ?? surfaceOf(ticket.action),
        action: ticket.action,
        referenceId: ticket.referenceId,
      },
      () => fn(ticket)
    );

    const settlement = options.settle?.(result) ?? {};
    await completeAction({
      ticket,
      credits: settlement.credits,
      costMicros: settlement.costMicros ?? null,
      measureCost: options.measureCost,
      referenceId: settlement.referenceId ?? ticket.referenceId,
    });

    return result;
  } catch (err) {
    await failAction(ticket, { note: `Refunded: ${errorNote(err)}` });
    throw err;
  }
}

function errorNote(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 180);
}

/** Gates an action and throws on refusal, for callers that settle by hand. */
export async function requireAction(args: {
  userId: string;
  action: ActionKey | string;
  workspaceId?: string | null;
  referenceId?: string | null;
  quantity?: number;
  context?: PlanContext;
  unitCredits?: number;
}): Promise<ActionTicket> {
  const ticket = await beginAction(args);
  if (!ticket.ok) throw new EntitlementError(ticket.gate);
  return ticket;
}

// ─────────────────────────────────────────────────────────────────────────────
// The limits that are not actions
//
// Nothing here spends credits. These are the shape-of-account limits — how many
// workspaces, how many connected profiles, how much media on disk — and they are
// checked at the moment something is created rather than when it is used.
// ─────────────────────────────────────────────────────────────────────────────

/** May this account create another workspace? */
export async function checkWorkspaceLimit(source: PlanSource): Promise<GateResult> {
  const ctx = await contextOf(source);
  const limit = ctx.entitlements.workspaces;
  if (isUnlimited(limit)) return ALLOWED(ctx.plan);

  const owned = await prisma.workspace.count({ where: { userId: ctx.userId } });
  if (owned < limit) return ALLOWED(ctx.plan);

  const requiredPlan = ([...PLAN_TIERS] as PlanTier[])
    .filter((tier) => tier !== "TRIAL" && planRank(tier) > planRank(ctx.plan))
    .sort((a, b) => planRank(a) - planRank(b))
    .find((tier) => {
      const next = getEntitlements(tier).workspaces;
      return isUnlimited(next) || next > limit;
    });

  return {
    allowed: false,
    plan: ctx.plan,
    reason: "WORKSPACE_LIMIT",
    cap: limit,
    used: owned,
    requiredPlan,
    message: `${getPlanConfig(ctx.plan).name} includes ${limit} ${limit === 1 ? "workspace" : "workspaces"}.${
      requiredPlan
        ? ` ${getPlanConfig(requiredPlan).name} includes ${formatCap(getEntitlements(requiredPlan).workspaces)}.`
        : ""
    }`,
  };
}

/** May another social profile be connected to this workspace? */
export async function checkSocialAccountLimit(
  source: PlanSource,
  workspaceId: string
): Promise<GateResult> {
  const ctx = await contextOf(source);
  const limit = ctx.entitlements.socialAccountsPerWorkspace;
  if (isUnlimited(limit)) return ALLOWED(ctx.plan);

  const connected = await prisma.socialAccount.count({ where: { workspaceId } });
  if (connected < limit) return ALLOWED(ctx.plan);

  return {
    allowed: false,
    plan: ctx.plan,
    reason: "ACCOUNT_LIMIT",
    cap: limit,
    used: connected,
    message: `This workspace is at its limit of ${limit} connected ${
      limit === 1 ? "profile" : "profiles"
    }. Disconnect one to add another.`,
  };
}

/** Megabytes of media this account is holding, across every workspace it owns. */
export async function getStorageUsedMb(userId: string): Promise<number> {
  try {
    const agg = await prisma.mediaAsset.aggregate({
      where: { workspace: { userId } },
      _sum: { size: true },
    });
    return Math.round(((agg._sum.size ?? 0) / (1024 * 1024)) * 10) / 10;
  } catch (err) {
    console.error("[entitlements] getStorageUsedMb failed", err);
    return 0;
  }
}

/**
 * Is there room for `addBytes` more?
 *
 * Checked before an upload or a render is stored, because the hosting tiers this
 * runs on — a free Supabase bucket among them — have their own ceiling, and hitting
 * it breaks every account at once rather than one.
 */
export async function checkStorage(source: PlanSource, addBytes = 0): Promise<GateResult> {
  const ctx = await contextOf(source);
  const limitMb = ctx.entitlements.storageMb;
  if (isUnlimited(limitMb)) return ALLOWED(ctx.plan);

  const usedMb = await getStorageUsedMb(ctx.userId);
  const addMb = addBytes / (1024 * 1024);
  if (usedMb + addMb <= limitMb) return ALLOWED(ctx.plan);

  return {
    allowed: false,
    plan: ctx.plan,
    reason: "STORAGE_FULL",
    limitMb,
    usedMb,
    requiredPlan: nextPlanWithMoreStorage(ctx.plan, limitMb),
    message: `Media storage is full: ${usedMb} MB of ${limitMb} MB used. Delete assets or move to a larger plan.`,
  };
}

function nextPlanWithMoreStorage(current: PlanTier, limitMb: number): PlanTier | undefined {
  return ([...PLAN_TIERS] as PlanTier[])
    .filter((tier) => tier !== "TRIAL" && planRank(tier) > planRank(current))
    .sort((a, b) => planRank(a) - planRank(b))
    .find((tier) => {
      const next = getEntitlements(tier).storageMb;
      return isUnlimited(next) || next > limitMb;
    });
}

/**
 * Tool-call loops the chat may take in one turn.
 *
 * A cost control disguised as a capability: each loop is a full model call, so the
 * difference between Go's allowance and Agency's is the difference between one
 * answer and eight rounds of research.
 */
export async function getChatToolLoopLimit(source: PlanSource): Promise<number> {
  const ctx = await contextOf(source);
  return ctx.entitlements.chatMaxToolLoops;
}

/** How far back analytics may be read on this plan. */
export async function getAnalyticsRetentionDays(source: PlanSource): Promise<number> {
  const ctx = await contextOf(source);
  return ctx.entitlements.analyticsRetentionDays;
}

/** Which image model this plan's renders go to. */
export async function getImageQuality(source: PlanSource): Promise<"standard" | "premium"> {
  const ctx = await contextOf(source);
  return ctx.entitlements.imageQuality;
}

// ─────────────────────────────────────────────────────────────────────────────
// What the billing page reads
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountSummary {
  context: PlanContext;
  wallet: WalletBalance;
  /** Per-period counters for every capped feature on this plan. */
  usage: Record<string, { used: number; cap: number }>;
  storage: { usedMb: number; limitMb: number };
  workspaces: { used: number; limit: number };
}

/** Everything the billing tab needs about one account, in one round of reads. */
export async function getAccountSummary(userId: string): Promise<AccountSummary> {
  const context = await getPlanContext(userId);
  const [wallet, usage, usedMb, workspaceCount] = await Promise.all([
    getWalletBalance(userId, context.plan),
    getFeatureUsageMap(context),
    getStorageUsedMb(userId),
    prisma.workspace.count({ where: { userId } }).catch(() => 0),
  ]);

  return {
    context,
    wallet,
    usage,
    storage: { usedMb, limitMb: context.entitlements.storageMb },
    workspaces: { used: workspaceCount, limit: context.entitlements.workspaces },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Is the price right?
//
// The one question this whole layer exists to keep answerable. Credits are charged
// from `actions.ts`; cost is measured from `UsageEvent`. If the two drift apart,
// an action is being sold below what it costs, and this is where that shows up —
// in our own tables, weeks before it shows up on an invoice.
//
// Matched by action key over a window rather than row by row: usage rows are
// written by the provider and carry no ledger id, and for a pricing decision the
// aggregate is the number that matters anyway.
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceAccuracyRow {
  action: string;
  /** Credits actually charged, net of refunds. */
  chargedCredits: number;
  /** Measured list cost of the model calls, in micro-dollars. */
  measuredMicros: number;
  /** That cost expressed in credits, for a like-for-like comparison. */
  measuredCredits: number;
  /** Charged minus measured. Negative means the action is sold at a loss. */
  marginCredits: number;
  calls: number;
}

export async function getPriceAccuracy(
  since: Date,
  userId?: string
): Promise<PriceAccuracyRow[]> {
  try {
    const scope = userId ? { userId } : {};
    const [ledger, usage] = await Promise.all([
      prisma.creditLedger.groupBy({
        by: ["action", "kind"],
        where: { ...scope, createdAt: { gte: since }, kind: { in: ["DEBIT", "REFUND"] } },
        _sum: { credits: true },
      }),
      prisma.usageEvent.groupBy({
        by: ["action"],
        where: { ...scope, createdAt: { gte: since }, action: { not: null } },
        _sum: { costMicros: true },
        _count: { _all: true },
      }),
    ]);

    const charged = new Map<string, number>();
    for (const row of ledger) {
      const key = row.action ?? "unknown";
      // DEBIT rows are negative and REFUND rows positive, so the net charge is the
      // negation of their sum.
      charged.set(key, (charged.get(key) ?? 0) - (row._sum.credits ?? 0));
    }

    const measured = new Map<string, { micros: number; calls: number }>();
    for (const row of usage) {
      const key = row.action ?? "unknown";
      measured.set(key, {
        micros: row._sum.costMicros ?? 0,
        calls: row._count._all,
      });
    }

    const keys = new Set([...charged.keys(), ...measured.keys()]);
    return [...keys]
      .map((action) => {
        const chargedCredits = charged.get(action) ?? 0;
        const measuredMicros = measured.get(action)?.micros ?? 0;
        const measuredCredits = Math.round(costMicrosToCredits(measuredMicros) * 100) / 100;
        return {
          action,
          chargedCredits,
          measuredMicros,
          measuredCredits,
          marginCredits: Math.round((chargedCredits - measuredCredits) * 100) / 100,
          calls: measured.get(action)?.calls ?? 0,
        };
      })
      .sort((a, b) => a.marginCredits - b.marginCredits);
  } catch (err) {
    console.error("[entitlements] getPriceAccuracy failed", err);
    return [];
  }
}

