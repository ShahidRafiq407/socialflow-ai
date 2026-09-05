// ============================================================================
// WALLET — THE BALANCE, AND THE ONLY CODE ALLOWED TO MOVE IT
//
// `meter.ts` records what the work cost us. This file records what the customer
// has left, and it is the file that says no. The two are deliberately separate:
// the meter must never be able to block a generation, and the wallet must never
// be able to lose a credit. Different jobs, so different failure policies.
//
// EVERY MOVEMENT IS A ROW
//
// `CreditWallet` holds two integers and both are derived state. The truth is
// `CreditLedger`, which is append-only and records the balance each row produced.
// If the two ever disagree, the ledger wins and the wallet can be rebuilt from it.
// That is why nothing here changes a balance without writing a ledger row in the
// same transaction — not even the expiry sweep.
//
// TWO BALANCES
//
// The period grant expires; a purchased top-up does not. Debits take the grant
// first, so a customer who tops up mid-period never watches their purchase burn
// while credits they had already paid for sit unspent behind it.
//
// RESERVATIONS
//
// A deep article costs 350 credits and takes twenty minutes. Checking the balance
// and spending it twenty minutes later is a race that two browser tabs win every
// time. Expensive actions therefore reserve first: `heldCredits` rises inside the
// same transaction that checks the funds, and the hold becomes a debit on success
// or is released on failure. `expiresAt` covers the case where the process dies
// still holding it — a hold nobody can release is a balance nobody can spend.
//
// CONCURRENCY
//
// Every mutation runs in a transaction that opens with `SELECT … FOR UPDATE` on
// the wallet row. That costs one extra round trip and makes read-modify-write
// correct without depending on an isolation level or a retry loop. These are
// once-per-action paths, not once-per-token, so the round trip is affordable —
// and the alternative, clever conditional SQL, is the kind of thing that is
// quietly wrong for a year.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { getEntitlements, isUnlimited, type PlanTier } from "./plans";

/** How long a hold lives when the caller does not say. */
const DEFAULT_HOLD_MS = 10 * 60_000;

/** An unlimited plan still spends against a balance; this is what it is granted. */
const UNLIMITED_GRANT = 1_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  walletId: string;
  /** This period's plan grant, what is left of it. */
  grantBalance: number;
  /** Purchased credits. Never expire. */
  topUpBalance: number;
  /** Reserved by runs that are still in flight. */
  heldCredits: number;
  /** grant + top-up: paid for and not yet spent. */
  balance: number;
  /** balance − holds: what a new action may actually draw on. */
  available: number;
  /** What the plan grants each period. */
  monthlyGrant: number;
  grantPeriodStart: Date;
  grantPeriodEnd: Date;
  lifetimeGranted: number;
  lifetimeSpent: number;
  /** Share of this period's grant already spent, 0-100. */
  percentUsed: number;
}

export type SpendFailure = "INSUFFICIENT_CREDITS" | "NO_WALLET";

export interface ReserveResult {
  ok: boolean;
  holdId?: string;
  reason?: SpendFailure;
  /** How many more credits were needed. Shown in the upgrade prompt. */
  shortfall?: number;
  available?: number;
}

export interface DebitResult {
  ok: boolean;
  ledgerId?: string;
  reason?: SpendFailure;
  shortfall?: number;
  available?: number;
  /** Balance after the charge, so a caller can render it without re-reading. */
  balance?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Creating and reading
// ─────────────────────────────────────────────────────────────────────────────

/** The grant for a plan, with UNLIMITED translated into a real integer. */
export function grantForPlan(plan: PlanTier): number {
  const credits = getEntitlements(plan).monthlyCredits;
  return isUnlimited(credits) ? UNLIMITED_GRANT : Math.max(0, credits);
}

/**
 * `grantForPlan` reads `PLAN_ENTITLEMENTS`, which the back office patches in place
 * once the settings cache has loaded — so on an instance that has not loaded it
 * yet, the same call returns the number that shipped with the build instead of the
 * number the admin set. A wrong answer here is not cosmetic: it is written into
 * `monthlyGrant` and into a ledger row keyed for idempotency, so the replay that
 * would have corrected it is a no-op and the customer keeps the wrong allowance
 * for the period.
 *
 * Every function below that grants awaits this first. It never throws and it is a
 * no-op once warm, so the cost on the hot path is a resolved promise.
 */
async function warmPlanConfig(): Promise<void> {
  await ensureRuntimeConfig();
}

/** A month from `from`, which is the period length when no subscription says otherwise. */
function oneMonthAfter(from: Date): Date {
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);
  return to;
}

/**
 * The `grantPeriodStart` of a wallet that has never been granted to.
 *
 * Any real billing period is later than this, which is exactly the property
 * `syncPeriodGrant` relies on.
 */
const NEVER_GRANTED = new Date(0);

/**
 * The wallet for this account, created empty if it does not exist yet.
 *
 * Deliberately does not grant anything. Granting happens in one place —
 * `syncPeriodGrant` — so that the idempotency key which makes a webhook replay
 * safe is the only route by which credits ever appear.
 *
 * A new wallet's `grantPeriodStart` is the epoch, not the period passed in. It
 * means "nothing has ever been granted", so whichever arrives first — the webhook
 * or a dashboard page load that creates the wallet as a side effect — the first
 * real grant is still in the future and still happens. Seeding it with the caller's
 * period would make the two orderings behave differently, and the losing one would
 * silently cost a new subscriber their first month of credits.
 */
export async function ensureWallet(
  userId: string,
  plan: PlanTier = "FREE",
  periodStart?: Date,
  periodEnd?: Date
): Promise<string> {
  await warmPlanConfig();
  const start = periodStart ?? new Date();
  const end = periodEnd ?? oneMonthAfter(start);

  const wallet = await prisma.creditWallet.upsert({
    where: { userId },
    create: {
      userId,
      grantBalance: 0,
      topUpBalance: 0,
      monthlyGrant: grantForPlan(plan),
      grantPeriodStart: NEVER_GRANTED,
      grantPeriodEnd: end,
    },
    update: {},
    select: { id: true },
  });

  return wallet.id;
}

/**
 * The balance, for display and for gates that only need to read.
 *
 * Creates the wallet on first read rather than failing, because the alternative is
 * a dashboard that 500s for anyone who signed up before this table existed.
 */
export async function getWalletBalance(
  userId: string,
  plan: PlanTier = "FREE"
): Promise<WalletBalance> {
  let row = await prisma.creditWallet.findUnique({ where: { userId } });

  if (!row) {
    await ensureWallet(userId, plan);
    row = await prisma.creditWallet.findUnique({ where: { userId } });
  }

  if (!row) {
    // Only reachable if the create raced and lost, which upsert makes impossible.
    const now = new Date();
    return {
      walletId: "",
      grantBalance: 0,
      topUpBalance: 0,
      heldCredits: 0,
      balance: 0,
      available: 0,
      monthlyGrant: grantForPlan(plan),
      grantPeriodStart: now,
      grantPeriodEnd: oneMonthAfter(now),
      lifetimeGranted: 0,
      lifetimeSpent: 0,
      percentUsed: 0,
    };
  }

  const balance = row.grantBalance + row.topUpBalance;
  const spentThisPeriod = Math.max(0, row.monthlyGrant - row.grantBalance);

  return {
    walletId: row.id,
    grantBalance: row.grantBalance,
    topUpBalance: row.topUpBalance,
    heldCredits: row.heldCredits,
    balance,
    available: Math.max(0, balance - row.heldCredits),
    monthlyGrant: row.monthlyGrant,
    grantPeriodStart: row.grantPeriodStart,
    grantPeriodEnd: row.grantPeriodEnd,
    lifetimeGranted: row.lifetimeGranted,
    lifetimeSpent: row.lifetimeSpent,
    percentUsed:
      row.monthlyGrant > 0
        ? Math.min(100, Math.round((spentThisPeriod / row.monthlyGrant) * 100))
        : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The primitives every mutation is built from
// ─────────────────────────────────────────────────────────────────────────────

export type LedgerKind = "GRANT" | "TOPUP" | "DEBIT" | "REFUND" | "ADJUSTMENT" | "EXPIRY";

interface LockedWallet {
  id: string;
  grantBalance: number;
  topUpBalance: number;
  heldCredits: number;
  monthlyGrant: number;
  grantPeriodStart: Date;
  lifetimeGranted: number;
  lifetimeSpent: number;
}

type Tx = Prisma.TransactionClient;

/**
 * Takes a row lock on the wallet for the rest of the transaction.
 *
 * This is what makes "read the balance, decide, write the balance" safe against a
 * second request doing the same thing a millisecond later. Postgres holds the lock
 * until commit; the transaction bodies here are a handful of statements long.
 */
async function lockWallet(tx: Tx, userId: string): Promise<LockedWallet | null> {
  const rows = await tx.$queryRaw<LockedWallet[]>`
    SELECT "id", "grantBalance", "topUpBalance", "heldCredits", "monthlyGrant",
           "grantPeriodStart", "lifetimeGranted", "lifetimeSpent"
      FROM "CreditWallet"
     WHERE "userId" = ${userId}
       FOR UPDATE
  `;
  return rows[0] ?? null;
}

interface LedgerWrite {
  walletId: string;
  userId: string;
  kind: LedgerKind;
  /** Positive for money in, negative for money out. Signed, always. */
  credits: number;
  balanceAfter: number;
  action?: string | null;
  workspaceId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  costMicros?: number | null;
  idempotencyKey?: string | null;
  note?: string | null;
}

async function writeLedger(tx: Tx, entry: LedgerWrite): Promise<string> {
  const row = await tx.creditLedger.create({
    data: {
      userId: entry.userId,
      walletId: entry.walletId,
      kind: entry.kind,
      credits: entry.credits,
      balanceAfter: entry.balanceAfter,
      action: entry.action ?? null,
      workspaceId: entry.workspaceId ?? null,
      referenceType: entry.referenceType ?? null,
      referenceId: entry.referenceId ?? null,
      costMicros: entry.costMicros ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
      note: entry.note ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

/** True when an error is Postgres refusing a duplicate unique value. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "P2002" || code === "23505";
}

/**
 * How a debit is split across the two balances: grant first, top-up for the rest.
 * Returns what is actually chargeable, which is less than `credits` only when the
 * balance moved between the check and the charge.
 */
function splitCharge(wallet: LockedWallet, credits: number) {
  const balance = wallet.grantBalance + wallet.topUpBalance;
  const charge = Math.min(credits, balance);
  const fromGrant = Math.min(charge, wallet.grantBalance);
  return { charge, fromGrant, fromTopUp: charge - fromGrant, balanceAfter: balance - charge };
}

// ─────────────────────────────────────────────────────────────────────────────
// Granting
// ─────────────────────────────────────────────────────────────────────────────

export interface GrantResult {
  granted: boolean;
  credits: number;
  /** Grant credits removed because the previous period ended unspent. */
  expired: number;
  reason?: "already_granted" | "no_wallet";
}

/**
 * Puts this period's credits in the wallet, exactly once.
 *
 * Lemon Squeezy redelivers webhooks on any non-2xx and an operator can redeliver
 * by hand, so "grant on renewal" has to be safe to run five times. Two independent
 * guards make it so: the wallet records which period it granted for and refuses to
 * grant backwards, and the ledger row carries a unique key built from the period
 * start. Either alone would do; together they also survive a wallet restored from
 * a backup, which is the case that actually bites.
 *
 * Unspent grant credits are removed rather than rolled over — that is what the
 * plan sold — but they leave an EXPIRY row, so a customer asking "where did my 400
 * credits go" gets an answer rather than a shrug.
 */
export async function syncPeriodGrant(args: {
  userId: string;
  plan: PlanTier;
  periodStart: Date;
  periodEnd: Date;
  note?: string;
}): Promise<GrantResult> {
  const { userId, plan, periodStart, periodEnd } = args;
  await warmPlanConfig();
  await ensureWallet(userId, plan, periodStart, periodEnd);

  const credits = grantForPlan(plan);
  const key = `grant:${userId}:${periodStart.toISOString()}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      if (!wallet) return { granted: false, credits: 0, expired: 0, reason: "no_wallet" as const };

      // An older period arriving late — a webhook redelivered out of order, or an
      // operator replaying history. Never grant backwards.
      //
      // Strictly greater, not greater-or-equal: a wallet created moments ago by
      // `ensureWallet` already carries this exact `periodStart`, and refusing on
      // equality would mean a brand-new subscriber never receives their first
      // grant. Equality is settled by the unique ledger key below, which is the
      // only guard that can tell a first grant from a replay of one.
      if (wallet.grantPeriodStart.getTime() > periodStart.getTime()) {
        return { granted: false, credits: 0, expired: 0, reason: "already_granted" as const };
      }

      const expired = wallet.grantBalance;
      if (expired > 0) {
        await writeLedger(tx, {
          walletId: wallet.id,
          userId,
          kind: "EXPIRY",
          credits: -expired,
          balanceAfter: wallet.topUpBalance,
          note: `Unused grant credits at the end of the period starting ${wallet.grantPeriodStart.toISOString().slice(0, 10)}`,
        });
      }

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          grantBalance: credits,
          monthlyGrant: credits,
          grantPeriodStart: periodStart,
          grantPeriodEnd: periodEnd,
          lifetimeGranted: { increment: credits },
        },
      });

      await writeLedger(tx, {
        walletId: wallet.id,
        userId,
        kind: "GRANT",
        credits,
        balanceAfter: credits + wallet.topUpBalance,
        idempotencyKey: key,
        note: args.note ?? `${plan} plan credits for the period starting ${periodStart.toISOString().slice(0, 10)}`,
      });

      return { granted: true, credits, expired };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { granted: false, credits: 0, expired: 0, reason: "already_granted" };
    }
    throw err;
  }
}

/**
 * This month's credits for an account nobody is billing.
 *
 * Every other grant in the system is triggered by money moving: Lemon Squeezy takes
 * a payment, sends a webhook, and `syncPeriodGrant` runs. A Free account never
 * generates that event, so without this it never receives a credit — and the two AI
 * actions Free is actually sold on, the scheduler's best-time pick and the brand
 * scan, both cost credits and would be refused with INSUFFICIENT_CREDITS for the
 * entire life of the account. The plan card promises "60 posts a month"; this is
 * what makes that true.
 *
 * It is deliberately lazy rather than a cron. Free accounts are the many, most of
 * them dormant, and a nightly sweep over all of them would spend a transaction each
 * to hand out credits nobody asked for. Instead the grant happens the first time an
 * account looks at its balance or spends from it, which for a dormant account is
 * never — a wallet that has never been read costs us nothing to leave alone.
 *
 * Cheap enough to sit on a hot path: the common case is one indexed read that finds
 * the period already granted and returns without opening a transaction. Correct even
 * when it is not cheap, because `syncPeriodGrant` is idempotent on
 * `grant:${userId}:${periodStart}` — two requests racing on the first spend of the
 * month produce one grant and one no-op, not 140 credits.
 *
 * The period must be the same UTC calendar month `freeContext` reports as the
 * period, or the meter would show a boundary the wallet does not share.
 */
export async function ensureFreeGrant(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<GrantResult> {
  const row = await prisma.creditWallet.findUnique({
    where: { userId },
    select: { grantPeriodStart: true },
  });

  // Greater-or-equal, unlike the guard inside `syncPeriodGrant`. There it has to let
  // equality through, because `ensureWallet` may have just stamped this exact period
  // on a wallet that has never been granted to. Here that case is already excluded:
  // a never-granted wallet carries the epoch, which is earlier than any real period.
  // A wallet stamped with a period at or after this one has had its grant — either
  // this month's, or a larger one from a paid plan whose period started mid-month
  // and which this must not overwrite.
  if (row && row.grantPeriodStart.getTime() >= periodStart.getTime()) {
    return { granted: false, credits: 0, expired: 0, reason: "already_granted" };
  }

  return syncPeriodGrant({
    userId,
    plan: "FREE",
    periodStart,
    periodEnd,
    note: `Free plan credits for ${periodStart.toISOString().slice(0, 7)}`,
  });
}

/**
 * Mid-period plan change.
 *
 * An upgrade takes effect immediately — Lemon Squeezy has already charged the
 * prorated difference, so withholding the credits until the next renewal would be
 * taking money for nothing. Only the difference is granted, so upgrading twice in
 * a period cannot be farmed for a second full allowance.
 *
 * A downgrade claws nothing back. The new, smaller `monthlyGrant` simply applies
 * from the next renewal. Reaching into a balance somebody is halfway through
 * spending is the sort of thing that generates a chargeback, not a saving.
 */
export async function applyPlanChangeGrant(args: {
  userId: string;
  toPlan: PlanTier;
  periodStart: Date;
}): Promise<GrantResult> {
  const { userId, toPlan, periodStart } = args;
  await warmPlanConfig();
  await ensureWallet(userId, toPlan, periodStart);

  const target = grantForPlan(toPlan);
  const key = `plan-change:${userId}:${periodStart.toISOString()}:${toPlan}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      if (!wallet) return { granted: false, credits: 0, expired: 0, reason: "no_wallet" as const };

      const topUp = Math.max(0, target - wallet.monthlyGrant);

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          monthlyGrant: target,
          ...(topUp > 0
            ? { grantBalance: { increment: topUp }, lifetimeGranted: { increment: topUp } }
            : {}),
        },
      });

      if (topUp === 0) return { granted: false, credits: 0, expired: 0 };

      await writeLedger(tx, {
        walletId: wallet.id,
        userId,
        kind: "GRANT",
        credits: topUp,
        balanceAfter: wallet.grantBalance + topUp + wallet.topUpBalance,
        idempotencyKey: key,
        note: `Upgrade to ${toPlan}: the difference in this period's allowance`,
      });

      return { granted: true, credits: topUp, expired: 0 };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { granted: false, credits: 0, expired: 0, reason: "already_granted" };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reservations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sets credits aside for a run that has not finished yet.
 *
 * The check and the reservation happen under the same row lock, which is the whole
 * point: two tabs starting a deep article with 400 credits left produce one hold
 * and one refusal, not two runs and a negative balance.
 */
export async function reserveCredits(args: {
  userId: string;
  action: string;
  credits: number;
  workspaceId?: string | null;
  referenceId?: string | null;
  ttlMs?: number;
  plan?: PlanTier;
}): Promise<ReserveResult> {
  const { userId, action, credits } = args;
  if (credits <= 0) return { ok: true };

  await ensureWallet(userId, args.plan ?? "FREE");

  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId);
    if (!wallet) return { ok: false, reason: "NO_WALLET" as const };

    const available = wallet.grantBalance + wallet.topUpBalance - wallet.heldCredits;
    if (available < credits) {
      return {
        ok: false,
        reason: "INSUFFICIENT_CREDITS" as const,
        shortfall: credits - Math.max(0, available),
        available: Math.max(0, available),
      };
    }

    const hold = await tx.creditHold.create({
      data: {
        walletId: wallet.id,
        credits,
        action,
        workspaceId: args.workspaceId ?? null,
        referenceId: args.referenceId ?? null,
        expiresAt: new Date(Date.now() + (args.ttlMs ?? DEFAULT_HOLD_MS)),
      },
      select: { id: true },
    });

    await tx.creditWallet.update({
      where: { id: wallet.id },
      data: { heldCredits: { increment: credits } },
    });

    return { ok: true, holdId: hold.id, available: available - credits };
  });
}

/**
 * Turns a hold into a real charge.
 *
 * `credits` may be lower than the amount held — a campaign that produced three
 * platform variants instead of the six it reserved for should pay for three. It is
 * never allowed to be higher: a run that costs more than it reserved is a pricing
 * bug, and charging past the reservation would be spending money the customer was
 * never shown.
 *
 * Idempotent on the hold: a settle that has already happened returns the same
 * ledger row rather than charging twice.
 */
export async function settleHold(args: {
  holdId: string;
  userId: string;
  credits?: number;
  costMicros?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}): Promise<DebitResult> {
  const { holdId, userId } = args;

  return prisma.$transaction(async (tx) => {
    const hold = await tx.creditHold.findUnique({ where: { id: holdId } });
    if (!hold) return { ok: false, reason: "NO_WALLET" as const };

    if (hold.settledAt) {
      const existing = await tx.creditLedger.findFirst({
        where: { idempotencyKey: `hold:${holdId}` },
        select: { id: true, balanceAfter: true },
      });
      return { ok: true, ledgerId: existing?.id, balance: existing?.balanceAfter };
    }

    const wallet = await lockWallet(tx, userId);
    if (!wallet) return { ok: false, reason: "NO_WALLET" as const };

    const want = Math.max(0, Math.min(args.credits ?? hold.credits, hold.credits));
    const { charge, fromGrant, fromTopUp, balanceAfter } = splitCharge(wallet, want);

    await tx.creditHold.update({
      where: { id: holdId },
      data: { settledAt: new Date() },
    });

    await tx.creditWallet.update({
      where: { id: wallet.id },
      data: {
        grantBalance: { decrement: fromGrant },
        topUpBalance: { decrement: fromTopUp },
        heldCredits: { decrement: Math.min(hold.credits, wallet.heldCredits) },
        lifetimeSpent: { increment: charge },
      },
    });

    const ledgerId = await writeLedger(tx, {
      walletId: wallet.id,
      userId,
      kind: "DEBIT",
      credits: -charge,
      balanceAfter,
      action: hold.action,
      workspaceId: hold.workspaceId,
      referenceType: args.referenceType ?? null,
      referenceId: args.referenceId ?? hold.referenceId,
      costMicros: args.costMicros ?? null,
      idempotencyKey: `hold:${holdId}`,
      note: args.note ?? null,
    });

    return { ok: true, ledgerId, balance: balanceAfter };
  });
}

/**
 * Gives a hold back without charging for it.
 *
 * Called when a run fails. Writes no ledger row on purpose: nothing moved, and a
 * ledger full of "reserved then released" rows makes the statement unreadable for
 * the customer who only wants to see what they were charged.
 */
export async function releaseHold(holdId: string, userId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const hold = await tx.creditHold.findUnique({ where: { id: holdId } });
      if (!hold || hold.settledAt) return;

      const wallet = await lockWallet(tx, userId);
      if (!wallet) return;

      await tx.creditHold.update({
        where: { id: holdId },
        data: { settledAt: new Date() },
      });

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { heldCredits: { decrement: Math.min(hold.credits, wallet.heldCredits) } },
      });
    });
  } catch (err) {
    // A hold that fails to release is recovered by the sweeper within its TTL, so
    // this is worth logging and not worth failing the caller's error path over.
    console.error("[wallet] releaseHold failed", { holdId, err });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct charges
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charges immediately. For actions short enough that a reservation would be
 * ceremony — a rewrite, a best-time pick, one chat turn.
 *
 * Pass `idempotencyKey` whenever the caller can be retried (a webhook, a queued
 * job, a route a user can double-click). Two calls with the same key produce one
 * charge; the second returns the first one's ledger row.
 */
export async function debitCredits(args: {
  userId: string;
  action: string;
  credits: number;
  workspaceId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  costMicros?: number | null;
  idempotencyKey?: string | null;
  note?: string | null;
  plan?: PlanTier;
}): Promise<DebitResult> {
  const { userId, action, credits } = args;
  if (credits <= 0) return { ok: true };

  await ensureWallet(userId, args.plan ?? "FREE");

  const attempt = async (): Promise<DebitResult> =>
    prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      if (!wallet) return { ok: false, reason: "NO_WALLET" as const };

      const balance = wallet.grantBalance + wallet.topUpBalance;
      const available = balance - wallet.heldCredits;
      if (available < credits) {
        return {
          ok: false,
          reason: "INSUFFICIENT_CREDITS" as const,
          shortfall: credits - Math.max(0, available),
          available: Math.max(0, available),
        };
      }

      const { charge, fromGrant, fromTopUp, balanceAfter } = splitCharge(wallet, credits);

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          grantBalance: { decrement: fromGrant },
          topUpBalance: { decrement: fromTopUp },
          lifetimeSpent: { increment: charge },
        },
      });

      const ledgerId = await writeLedger(tx, {
        walletId: wallet.id,
        userId,
        kind: "DEBIT",
        credits: -charge,
        balanceAfter,
        action,
        workspaceId: args.workspaceId ?? null,
        referenceType: args.referenceType ?? null,
        referenceId: args.referenceId ?? null,
        costMicros: args.costMicros ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        note: args.note ?? null,
      });

      return { ok: true, ledgerId, balance: balanceAfter };
    });

  try {
    return await attempt();
  } catch (err) {
    if (args.idempotencyKey && isUniqueViolation(err)) {
      const existing = await prisma.creditLedger.findFirst({
        where: { idempotencyKey: args.idempotencyKey },
        select: { id: true, balanceAfter: true },
      });
      return { ok: true, ledgerId: existing?.id, balance: existing?.balanceAfter };
    }
    throw err;
  }
}

/**
 * Puts credits back after a charge that should not have stood — a generation that
 * failed after being debited, or an operator making something right.
 *
 * Refunds land in the grant balance when the period they were spent in is still
 * running, and in the top-up balance otherwise. Refunding a spent grant into a
 * period that has already renewed would hand over credits that expire in an hour.
 */
export async function refundCredits(args: {
  userId: string;
  credits: number;
  action?: string | null;
  workspaceId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  note?: string | null;
  /** The period the original charge belonged to, when the caller knows it. */
  spentInPeriodStart?: Date | null;
}): Promise<DebitResult> {
  const { userId, credits } = args;
  if (credits <= 0) return { ok: true };

  const attempt = async (): Promise<DebitResult> =>
    prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      if (!wallet) return { ok: false, reason: "NO_WALLET" as const };

      const samePeriod =
        !args.spentInPeriodStart ||
        args.spentInPeriodStart.getTime() >= wallet.grantPeriodStart.getTime();

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: samePeriod
          ? { grantBalance: { increment: credits }, lifetimeSpent: { decrement: credits } }
          : { topUpBalance: { increment: credits }, lifetimeSpent: { decrement: credits } },
      });

      const balanceAfter = wallet.grantBalance + wallet.topUpBalance + credits;
      const ledgerId = await writeLedger(tx, {
        walletId: wallet.id,
        userId,
        kind: "REFUND",
        credits,
        balanceAfter,
        action: args.action ?? null,
        workspaceId: args.workspaceId ?? null,
        referenceType: args.referenceType ?? null,
        referenceId: args.referenceId ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        note: args.note ?? null,
      });

      return { ok: true, ledgerId, balance: balanceAfter };
    });

  try {
    return await attempt();
  } catch (err) {
    if (args.idempotencyKey && isUniqueViolation(err)) {
      const existing = await prisma.creditLedger.findFirst({
        where: { idempotencyKey: args.idempotencyKey },
        select: { id: true, balanceAfter: true },
      });
      return { ok: true, ledgerId: existing?.id, balance: existing?.balanceAfter };
    }
    throw err;
  }
}

/**
 * Takes back a top-up that was refunded, without touching the plan's allowance.
 *
 * `debitCredits` deliberately spends the monthly grant before the pack, which is
 * right for work but wrong here: clawing back a refunded pack must come out of the
 * pack. Anything already spent is simply gone — the balance is never driven
 * negative, because leaving a refunded customer unable to use the product is a
 * worse outcome than absorbing the difference.
 */
export async function removeTopUpCredits(args: {
  userId: string;
  credits: number;
  idempotencyKey: string;
  note?: string | null;
}): Promise<DebitResult & { recovered?: number; unrecovered?: number }> {
  const { userId, credits } = args;
  if (credits <= 0) return { ok: true, recovered: 0, unrecovered: 0 };

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      if (!wallet) return { ok: false, reason: "NO_WALLET" as const };

      const recovered = Math.min(credits, Math.max(0, wallet.topUpBalance));
      const unrecovered = credits - recovered;

      if (recovered === 0) {
        return { ok: true, recovered: 0, unrecovered, balance: wallet.grantBalance + wallet.topUpBalance };
      }

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { topUpBalance: { decrement: recovered } },
      });

      const balanceAfter = wallet.grantBalance + wallet.topUpBalance - recovered;
      const ledgerId = await writeLedger(tx, {
        walletId: wallet.id,
        userId,
        kind: "ADJUSTMENT",
        credits: -recovered,
        balanceAfter,
        idempotencyKey: args.idempotencyKey,
        note:
          args.note ??
          (unrecovered > 0
            ? `Refunded top-up: ${recovered} credits recovered, ${unrecovered} already spent`
            : `Refunded top-up: ${recovered} credits recovered`),
      });

      return { ok: true, ledgerId, balance: balanceAfter, recovered, unrecovered };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await prisma.creditLedger.findFirst({
        where: { idempotencyKey: args.idempotencyKey },
        select: { id: true, balanceAfter: true },
      });
      return { ok: true, ledgerId: existing?.id, balance: existing?.balanceAfter, recovered: 0 };
    }
    throw err;
  }
}

/**
 * Credits a purchased top-up pack.
 *
 * Always carries an idempotency key derived from the Lemon Squeezy order id, so a
 * redelivered `order_created` cannot hand out a second pack.
 */
export async function addTopUpCredits(args: {
  userId: string;
  credits: number;
  idempotencyKey: string;
  note?: string | null;
  plan?: PlanTier;
}): Promise<DebitResult> {
  const { userId, credits } = args;
  if (credits <= 0) return { ok: true };

  await ensureWallet(userId, args.plan ?? "FREE");

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      if (!wallet) return { ok: false, reason: "NO_WALLET" as const };

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          topUpBalance: { increment: credits },
          lifetimeGranted: { increment: credits },
        },
      });

      const balanceAfter = wallet.grantBalance + wallet.topUpBalance + credits;
      const ledgerId = await writeLedger(tx, {
        walletId: wallet.id,
        userId,
        kind: "TOPUP",
        credits,
        balanceAfter,
        idempotencyKey: args.idempotencyKey,
        note: args.note ?? `${credits.toLocaleString()} credit top-up`,
      });

      return { ok: true, ledgerId, balance: balanceAfter };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await prisma.creditLedger.findFirst({
        where: { idempotencyKey: args.idempotencyKey },
        select: { id: true, balanceAfter: true },
      });
      return { ok: true, ledgerId: existing?.id, balance: existing?.balanceAfter };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator adjustments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An admin adds or removes credits by hand. Always an ADJUSTMENT row with a note,
 * never a GRANT or DEBIT, so a customer's statement and the pricing post-mortems
 * can tell a manual correction from a plan grant or a real spend.
 *
 * Positive amounts land on the top-up balance, which never expires — a goodwill
 * credit that vanished at the next renewal would be a broken promise. Negative
 * amounts come off the top-up balance first, then the grant, and stop at zero.
 */
export async function adjustCredits(args: {
  userId: string;
  credits: number;
  note: string;
  idempotencyKey?: string;
  plan?: PlanTier;
}): Promise<DebitResult & { applied?: number }> {
  const { userId } = args;
  const credits = Math.round(args.credits);
  if (!Number.isFinite(credits) || credits === 0) return { ok: true, applied: 0 };

  await ensureWallet(userId, args.plan ?? "FREE");

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      if (!wallet) return { ok: false, reason: "NO_WALLET" as const };

      let applied = credits;
      let topUpDelta = 0;
      let grantDelta = 0;

      if (credits > 0) {
        topUpDelta = credits;
      } else {
        const remove = Math.min(-credits, wallet.topUpBalance + wallet.grantBalance);
        const fromTopUp = Math.min(remove, wallet.topUpBalance);
        topUpDelta = -fromTopUp;
        grantDelta = -(remove - fromTopUp);
        applied = -remove;
      }

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          topUpBalance: { increment: topUpDelta },
          grantBalance: { increment: grantDelta },
          ...(applied > 0 ? { lifetimeGranted: { increment: applied } } : {}),
        },
      });

      const balanceAfter = wallet.grantBalance + wallet.topUpBalance + applied;
      const ledgerId = await writeLedger(tx, {
        walletId: wallet.id,
        userId,
        kind: "ADJUSTMENT",
        credits: applied,
        balanceAfter,
        idempotencyKey: args.idempotencyKey ?? null,
        note: args.note,
      });

      return { ok: true, ledgerId, balance: balanceAfter, applied };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await prisma.creditLedger.findFirst({
        where: { idempotencyKey: args.idempotencyKey },
        select: { id: true, balanceAfter: true },
      });
      return { ok: true, ledgerId: existing?.id, balance: existing?.balanceAfter, applied: 0 };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Housekeeping and reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Releases holds whose run died without releasing them.
 *
 * Run from the cron. Without it, a serverless function killed mid-article leaves
 * 350 credits reserved forever and the customer's balance is quietly wrong.
 */
export async function sweepExpiredHolds(now = new Date()): Promise<number> {
  try {
    const stale = await prisma.creditHold.findMany({
      where: { settledAt: null, expiresAt: { lt: now } },
      select: { id: true, credits: true, walletId: true },
      take: 500,
    });
    if (stale.length === 0) return 0;

    let released = 0;
    for (const hold of stale) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.creditHold.updateMany({
          where: { id: hold.id, settledAt: null },
          data: { settledAt: now },
        });
        // Another sweeper, or the run itself, got there first.
        if (updated.count === 0) return;

        const wallet = await tx.creditWallet.findUnique({
          where: { id: hold.walletId },
          select: { heldCredits: true },
        });
        await tx.creditWallet.update({
          where: { id: hold.walletId },
          data: {
            heldCredits: { decrement: Math.min(hold.credits, wallet?.heldCredits ?? 0) },
          },
        });
        released += 1;
      });
    }
    return released;
  } catch (err) {
    console.error("[wallet] sweepExpiredHolds failed", err);
    return 0;
  }
}

/**
 * Writes the measured list cost back onto the ledger row that paid for it.
 *
 * This is the loop that keeps the price list honest: `actions.ts` says a deep
 * article costs 350 credits, the meter says the run cost $1.91, and this column is
 * where the two meet. Never throws — a missing cost figure is a worse report, not
 * a broken generation.
 */
export async function attachLedgerCost(ledgerId: string, costMicros: number): Promise<void> {
  try {
    await prisma.creditLedger.update({
      where: { id: ledgerId },
      data: { costMicros: Math.max(0, Math.round(costMicros)) },
    });
  } catch (err) {
    console.error("[wallet] attachLedgerCost failed", { ledgerId, err });
  }
}

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  credits: number;
  balanceAfter: number;
  action: string | null;
  note: string | null;
  costMicros: number | null;
  createdAt: Date;
}

/** The customer's own statement, newest first. */
export async function getLedgerEntries(userId: string, limit = 50): Promise<LedgerEntry[]> {
  try {
    const rows = await prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 200),
      select: {
        id: true,
        kind: true,
        credits: true,
        balanceAfter: true,
        action: true,
        note: true,
        costMicros: true,
        createdAt: true,
      },
    });
    return rows as LedgerEntry[];
  } catch (err) {
    console.error("[wallet] getLedgerEntries failed", err);
    return [];
  }
}

/**
 * Credits spent per action since a date, for the "where did the month go" panel.
 * Debits are stored negative; this returns positive numbers, because nobody wants
 * to read a spend report in minus signs.
 */
export async function getSpendByAction(
  userId: string,
  since: Date
): Promise<Array<{ action: string; credits: number; count: number; costMicros: number }>> {
  try {
    const rows = await prisma.creditLedger.groupBy({
      by: ["action"],
      where: { userId, kind: "DEBIT", createdAt: { gte: since } },
      _sum: { credits: true, costMicros: true },
      _count: { _all: true },
    });
    return rows
      .map((row) => ({
        action: row.action ?? "unknown",
        credits: Math.abs(row._sum.credits ?? 0),
        count: row._count._all,
        costMicros: row._sum.costMicros ?? 0,
      }))
      .sort((a, b) => b.credits - a.credits);
  } catch (err) {
    console.error("[wallet] getSpendByAction failed", err);
    return [];
  }
}
















