// ============================================================================
// LEMON SQUEEZY WEBHOOK — WHERE MONEY BECOMES ENTITLEMENT
//
// This is the only place in the codebase that upgrades an account. Nothing else
// writes a plan, and nothing else mints credits. Everything a customer is allowed
// to do traces back to a signed event that arrived here.
//
// Four rules it is built around.
//
//   1. Verify first, parse second. The signature is over the raw bytes, so the
//      body is read as text and only parsed once the HMAC matches. An unsigned or
//      wrongly-signed request is a stranger and gets 401 without touching the DB.
//
//   2. Record before applying. The `BillingEvent` row is inserted on the event's
//      unique id BEFORE any state changes. A redelivery collides on that unique
//      index and returns 200 without applying anything twice. Lemon Squeezy
//      retries on any non-2xx, so "at least once" is the delivery guarantee we
//      actually have and idempotency is not optional.
//
//   3. Derive the period, never guess it. Lemon Squeezy reports `renews_at`, not
//      a period start. Walking one cycle back from `renews_at` gives the same
//      answer on every delivery of every event about that period — which is what
//      makes the credit grant's idempotency key stable.
//
//   4. Fail loudly. An event we could not apply is stored with its error and
//      returns 500 so Lemon Squeezy tries again. Swallowing it would mean a paid
//      customer on the Free plan and no record of why.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { PlanTier } from "@/lib/billing/plans";
import { TOPUP_PACKS } from "@/lib/billing/plans";
import {
  readEventFacts,
  verifyWebhookSignature,
  webhookEventId,
  lemonWebhookConfigured,
  ensureVariantResolution,
  getSubscription,
  factsFromSubscription,
  isHandledEvent,
  type BillingCycleValue,
  type LemonEventFacts,
  type LemonWebhookPayload,
} from "@/lib/billing/lemonsqueezy";
// The money rules — what was bought, whether the event may name the plan it names,
// and whether an order starts a trial. They live outside this file because a route
// handler may only export its HTTP methods, and rules this expensive to get wrong
// need tests. See `tests/lib/billingWebhookRules.test.ts`.
import { purchaseKind, trustPlan, trialGrantDecision } from "@/lib/billing/webhookRules";
import {
  syncPeriodGrant,
  applyPlanChangeGrant,
  addTopUpCredits,
  removeTopUpCredits,
} from "@/lib/billing/wallet";
import type { SubscriptionStatusValue } from "@/lib/billing/entitlements";
import { attachTrialCheckout } from "@/lib/billing/trial-guard";
import { markReferralConverted, rejectReferralForRefund } from "@/lib/affiliate/referral";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";

// `node:crypto` and Prisma both need the Node runtime; the raw body needs it too.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Finding the account
//
// Lemon Squeezy knows nothing about our users. The link is `custom_data.user_id`,
// attached when we created the checkout — so that is checked first and trusted,
// but only after confirming the id belongs to a real user. Everything after it is
// a fallback for a purchase that did not come through our checkout: a link built
// by hand in the dashboard, a subscription created by support, a plan changed
// inside the customer portal.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveUserId(facts: LemonEventFacts): Promise<string | null> {
  if (facts.custom.userId) {
    const user = await prisma.user.findUnique({
      where: { id: facts.custom.userId },
      select: { id: true },
    });
    if (user) return user.id;
    console.error("[ls-webhook] custom_data.user_id does not exist", facts.custom.userId);
  }

  if (facts.subscriptionId) {
    const row = await prisma.subscription.findUnique({
      where: { lsSubscriptionId: facts.subscriptionId },
      select: { userId: true },
    });
    if (row) return row.userId;
  }

  if (facts.customerId) {
    const row = await prisma.subscription.findFirst({
      where: { lsCustomerId: facts.customerId },
      orderBy: { updatedAt: "desc" },
      select: { userId: true },
    });
    if (row) return row.userId;
  }

  // Last resort. The email on a Lemon Squeezy purchase is the one the buyer typed
  // at checkout, which is usually but not always their account email — so this is
  // the fallback, not the first choice.
  if (facts.userEmail) {
    const user = await prisma.user.findUnique({
      where: { email: facts.userEmail.toLowerCase() },
      select: { id: true },
    });
    if (user) return user.id;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The period
//
// `renews_at` is the next charge date, so the current period runs from one cycle
// before it. That derivation is deterministic: the same event redelivered, or a
// different event about the same period, both produce the same `periodStart` and
// therefore the same grant key. A period start invented from `Date.now()` would
// mint a fresh allowance on every retry.
// ─────────────────────────────────────────────────────────────────────────────

function oneCycleBefore(end: Date, cycle: BillingCycleValue): Date {
  const start = new Date(end);
  if (cycle === "yearly") start.setFullYear(start.getFullYear() - 1);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

function oneCycleAfter(start: Date, cycle: BillingCycleValue): Date {
  const end = new Date(start);
  if (cycle === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

interface ResolvedPeriod {
  periodStart: Date;
  periodEnd: Date;
  /** The plan whose allowance this period buys — TRIAL while the trial runs. */
  effectivePlan: PlanTier;
}

/**
 * What the account is entitled to right now, and for how long.
 *
 * The trial is its own period with its own allowance. That is the whole reason
 * `TRIAL` exists as a tier: the subscription says GO from the moment it is created,
 * and paying $1 must not buy a month of Go.
 */
function resolvePeriod(
  facts: LemonEventFacts,
  storedPlan: PlanTier,
  fallbackCycle: BillingCycleValue
): ResolvedPeriod {
  const cycle = facts.cycle ?? fallbackCycle;
  const plan = facts.plan ?? storedPlan;
  const onTrial = facts.status === "TRIALING" && facts.trialEndsAt !== null;

  if (onTrial && facts.trialEndsAt) {
    const start = facts.createdAt ?? new Date();
    return { periodStart: start, periodEnd: facts.trialEndsAt, effectivePlan: "TRIAL" };
  }

  if (facts.renewsAt) {
    return {
      periodStart: oneCycleBefore(facts.renewsAt, cycle),
      periodEnd: facts.renewsAt,
      effectivePlan: plan,
    };
  }

  // A cancelled subscription stops renewing but keeps its period until `ends_at`.
  if (facts.endsAt) {
    return {
      periodStart: oneCycleBefore(facts.endsAt, cycle),
      periodEnd: facts.endsAt,
      effectivePlan: plan,
    };
  }

  const start = facts.createdAt ?? new Date();
  return { periodStart: start, periodEnd: oneCycleAfter(start, cycle), effectivePlan: plan };
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing the subscription
//
// One function writes the `Subscription` row, and it is the only one. Every event
// that says something about a subscription's state routes through here, so there
// is a single answer to "what does our database think this customer is on".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lemon Squeezy has no field that names the payment method.
 *
 * A card purchase reports `card_brand` and `card_last_four`; PayPal reports both
 * as null. So "card" is recorded when a brand is present and nothing is recorded
 * otherwise — the UI says the method is managed at Lemon Squeezy rather than
 * inventing a name for it. Guessing "paypal" from an absent brand would be wrong
 * for every subscription created before those fields were populated.
 */
function paymentMethodOf(facts: LemonEventFacts): string | null {
  return facts.cardBrand ? "card" : null;
}

interface ReconcileOutcome {
  plan: PlanTier;
  effectivePlan: PlanTier;
  status: SubscriptionStatusValue;
  periodStart: Date;
  periodEnd: Date;
  granted: number;
  grantKind: "period" | "plan-change" | "none";
}

/**
 * Bring the database in line with what Lemon Squeezy says, then settle the credits.
 *
 * Grant order matters. `syncPeriodGrant` is tried first: it grants a full
 * allowance only when this is a period we have not granted for, and refuses
 * otherwise. Only when it refuses do we consider a mid-period plan change, which
 * tops up the difference. Calling them the other way round would let an upgrade
 * that also started a new billing period collect both.
 */
async function reconcileSubscription(
  userId: string,
  facts: LemonEventFacts,
  options: { statusOverride?: SubscriptionStatusValue; cancelAtPeriodEnd?: boolean } = {}
): Promise<ReconcileOutcome> {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, cycle: true, status: true, periodStart: true, lsCustomerId: true },
  });

  const storedPlan = (existing?.plan ?? "FREE") as PlanTier;
  const fallbackCycle: BillingCycleValue = existing?.cycle === "YEARLY" ? "yearly" : "monthly";

  const status = options.statusOverride ?? facts.status ?? (existing?.status as SubscriptionStatusValue) ?? "NONE";
  const { periodStart, periodEnd, effectivePlan } = resolvePeriod(facts, storedPlan, fallbackCycle);

  // The plan on the row is what they are paying for; `effectivePlan` is what they
  // may use today. They differ for exactly three days, during the trial.
  const plan = facts.plan ?? storedPlan;
  const cycle = facts.cycle ?? fallbackCycle;

  const cancelAtPeriodEnd = options.cancelAtPeriodEnd ?? facts.cancelled;

  const data = {
    plan,
    status,
    cycle: cycle === "yearly" ? ("YEARLY" as const) : ("MONTHLY" as const),
    lsCustomerId: facts.customerId ?? existing?.lsCustomerId ?? null,
    lsSubscriptionId: facts.subscriptionId,
    lsOrderId: facts.orderId,
    lsProductId: facts.productId,
    lsVariantId: facts.variantId,
    lsVariantName: facts.variantName,
    periodStart,
    periodEnd,
    trialEndsAt: facts.trialEndsAt,
    renewsAt: facts.renewsAt,
    endsAt: facts.endsAt,
    cancelAtPeriodEnd,
    cardBrand: facts.cardBrand,
    cardLastFour: facts.cardLastFour,
    paymentMethod: paymentMethodOf(facts),
    testMode: facts.testMode,
    // The stored portal links were signed for the old state; make them refetch.
    portalUrlsFetchedAt: null,
  };

  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  // Credits are granted only for a plan that is actually live. A paused, expired
  // or unpaid subscription gets its row updated and nothing else.
  const grantable =
    status === "TRIALING" || status === "ACTIVE" || status === "PAST_DUE" || status === "CANCELLED";

  if (!grantable || effectivePlan === "FREE") {
    return { plan, effectivePlan, status, periodStart, periodEnd, granted: 0, grantKind: "none" };
  }

  const period = await syncPeriodGrant({
    userId,
    plan: effectivePlan,
    periodStart,
    periodEnd,
    note:
      effectivePlan === "TRIAL"
        ? "Trial credits — 3 days"
        : undefined,
  });

  if (period.granted) {
    return {
      plan,
      effectivePlan,
      status,
      periodStart,
      periodEnd,
      granted: period.credits,
      grantKind: "period",
    };
  }

  // Same period, different plan: an upgrade taken mid-month. Tops up the
  // difference and does nothing on a downgrade.
  if (storedPlan !== effectivePlan) {
    const change = await applyPlanChangeGrant({ userId, toPlan: effectivePlan, periodStart });
    if (change.granted) {
      return {
        plan,
        effectivePlan,
        status,
        periodStart,
        periodEnd,
        granted: change.credits,
        grantKind: "plan-change",
      };
    }
  }

  return { plan, effectivePlan, status, periodStart, periodEnd, granted: 0, grantKind: "none" };
}

/**
 * The same, for an event that names a subscription without describing it.
 *
 * A `subscription_payment_success` is an invoice: it proves money moved but says
 * nothing about the new renewal date. Fetching the subscription is what turns it
 * into a renewal we can grant for — and it is also the repair path for a
 * `subscription_updated` that never arrived.
 */
async function reconcileFromApi(
  userId: string,
  lsSubscriptionId: string,
  custom: Record<string, unknown> | undefined,
  options: { statusOverride?: SubscriptionStatusValue } = {}
): Promise<ReconcileOutcome | null> {
  const live = await getSubscription(lsSubscriptionId);
  if (!live.ok) {
    console.error("[ls-webhook] could not read subscription", lsSubscriptionId, live.error);
    return null;
  }
  return reconcileSubscription(userId, factsFromSubscription(live.data, custom), options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-ups
//
// A one-off credit pack. The order id is the idempotency key, so a redelivered
// `order_created` cannot hand out a second pack even if the replay guard above
// were somehow bypassed. Two independent guards for the one operation in this
// file that creates value out of nothing.
// ─────────────────────────────────────────────────────────────────────────────

async function applyTopUp(userId: string, facts: LemonEventFacts): Promise<number> {
  const packId = facts.packId;
  const pack = TOPUP_PACKS.find((candidate) => candidate.id === packId);
  if (!pack) return 0;

  const orderId = facts.orderId ?? facts.resourceId ?? "unknown";
  const result = await addTopUpCredits({
    userId,
    credits: pack.credits,
    idempotencyKey: `ls-order:${orderId}`,
    note: `${pack.label} top-up`,
  });

  return result.ok ? pack.credits : 0;
}

/**
 * A refunded top-up, clawed back as far as it can be.
 *
 * `removeTopUpCredits` takes from the pack rather than from the plan's allowance,
 * and stops at zero — a customer we have just refunded should not be left with a
 * negative balance they have to earn their way out of.
 */
async function clawBackTopUp(userId: string, facts: LemonEventFacts): Promise<number> {
  const pack = TOPUP_PACKS.find((candidate) => candidate.id === facts.packId);
  if (!pack) return 0;

  const orderId = facts.orderId ?? facts.resourceId ?? "unknown";
  const result = await removeTopUpCredits({
    userId,
    credits: pack.credits,
    idempotencyKey: `ls-refund:${orderId}`,
    note: `Refund of ${pack.label} (Lemon Squeezy order ${orderId})`,
  });

  return result.recovered ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// What each event means
//
// Read as business rules. Anything that needed defending is defended above, so
// this reads as a list of decisions rather than a list of null checks.
// ─────────────────────────────────────────────────────────────────────────────

interface ApplyResult {
  applied: boolean;
  summary: string;
}

// `purchaseKind`, `trustPlan` and `trialGrantDecision` are in
// `@/lib/billing/webhookRules`. Read them there — they are the rules that decide
// what a payment is worth, and they are covered by tests.

// ─────────────────────────────────────────────────────────────────────────────
// The $1 trial
//
// The trial is a SINGLE PAYMENT product, not a subscription with a trial period, so
// it never produces a `subscription_created` — the only thing Lemon Squeezy sends
// is one `order_created`. That is why the trial is granted from an order here while
// every plan is granted from a subscription event.
//
// The shape has a real advantage: with nothing recurring, "cancel any time, your
// card is not kept" needs no cancellation flow behind it. The account is on TRIAL
// for three days and then falls back to Free by itself, because `effectivePlanFor`
// reads `trialEndsAt` rather than trusting the row's plan.
// ─────────────────────────────────────────────────────────────────────────────

async function applyTrialOrder(userId: string, facts: LemonEventFacts): Promise<ApplyResult> {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, lsSubscriptionId: true, lsOrderId: true, trialEndsAt: true },
  });

  const decision = trialGrantDecision(facts, existing, new Date());
  if (decision.kind === "refuse") return { applied: false, summary: decision.summary };
  if (decision.kind === "noop") return { applied: true, summary: decision.summary };

  const { startedAt, endsAt, days } = decision;

  // Read by `resolvePeriod` as a trial period: three days, TRIAL's allowance, and
  // no renewal date, which is what stops it looking like a monthly plan.
  const outcome = await reconcileSubscription(
    userId,
    {
      ...facts,
      plan: "TRIAL",
      cycle: "monthly",
      status: "TRIALING",
      subscriptionId: null,
      createdAt: startedAt,
      trialEndsAt: endsAt,
      renewsAt: null,
      endsAt: null,
      cancelled: false,
    },
    { statusOverride: "TRIALING", cancelAtPeriodEnd: false }
  );

  // Close the loop on the one-per-person guard. Only reached after real money, so
  // this is also what tells an abandoned checkout apart from a taken-up trial.
  if (facts.custom.claimId) {
    await attachTrialCheckout(facts.custom.claimId, { lsCustomerId: facts.customerId });
  }

  return {
    applied: true,
    summary:
      outcome.granted > 0
        ? `Trial started; ${outcome.granted.toLocaleString()} credits for ${days} days, until ${endsAt.toISOString().slice(0, 10)}`
        : `Trial recorded; the allowance for this period was already granted`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A refunded trial
// ─────────────────────────────────────────────────────────────────────────────

/** A refunded trial ends it there and then. */
async function revokeTrial(userId: string, facts: LemonEventFacts): Promise<ApplyResult> {
  const now = new Date();
  const updated = await prisma.subscription.updateMany({
    where: { userId, plan: "TRIAL", lsSubscriptionId: null },
    data: { status: "EXPIRED", trialEndsAt: now, endsAt: now, periodEnd: now, cancelAtPeriodEnd: false },
  });
  void facts;
  return {
    applied: true,
    summary: updated.count > 0 ? "Trial refunded; access ended" : "Trial refund recorded",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Affiliate settlement
//
// A referred customer's first paid plan going live is the moment the referral
// earns. `markReferralConverted` is idempotent (only a PENDING referral
// converts), so firing it on every subscription and invoice event that reports
// a live paid plan still pays exactly once. A trial is not a conversion: the
// $1 trial buys nothing for the promoter until real money moves.
// ─────────────────────────────────────────────────────────────────────────────

function isPaidActivation(outcome: ReconcileOutcome, testMode: boolean): boolean {
  return (
    !testMode &&
    outcome.status === "ACTIVE" &&
    outcome.effectivePlan !== "TRIAL" &&
    outcome.effectivePlan !== "FREE"
  );
}

async function settleReferralCommission(
  userId: string,
  outcome: ReconcileOutcome,
  facts: LemonEventFacts
): Promise<void> {
  if (!isPaidActivation(outcome, facts.testMode)) return;
  try {
    await markReferralConverted(userId, {
      plan: outcome.effectivePlan,
      amountCents: facts.amountCents ?? facts.amountUsdCents ?? null,
    });
  } catch (err) {
    // Bookkeeping must never fail a payment.
    console.error("[ls-webhook] referral commission failed:", err);
  }
}

async function applyEvent(userId: string, facts: LemonEventFacts): Promise<ApplyResult> {
  const subscriptionId = facts.subscriptionId;

  // A plan named only by the checkout URL has to agree with the money that moved.
  const trust = trustPlan(facts);
  if (!trust.ok) return { applied: false, summary: trust.summary };

  switch (facts.eventName) {
    // ── Orders ──────────────────────────────────────────────────────────────
    // Every purchase produces one, including the first payment of a subscription.
    // Subscriptions are granted from their own events, which carry the plan and the
    // period — acting on both is how a customer ends up with two allowances. Orders
    // are therefore only acted on for the two things that have no subscription
    // behind them at all: a credit pack and the one-off $1 trial.
    case "order_created": {
      const kind = purchaseKind(facts);
      if (kind === "trial") return applyTrialOrder(userId, facts);
      if (kind !== "topup") {
        return { applied: true, summary: "Order recorded; the subscription events carry the plan" };
      }
      const credits = await applyTopUp(userId, facts);
      return {
        applied: credits > 0,
        summary: credits > 0 ? `${credits.toLocaleString()} top-up credits added` : "Top-up already credited",
      };
    }

    case "order_refunded": {
      const kind = purchaseKind(facts);
      if (kind === "trial") return revokeTrial(userId, facts);
      if (kind !== "topup") {
        // A refunded subscription order takes the affiliate commission with it.
        try {
          await rejectReferralForRefund(userId);
        } catch (err) {
          console.error("[ls-webhook] referral refund rejection failed:", err);
        }
        return { applied: true, summary: "Refund recorded" };
      }
      const recovered = await clawBackTopUp(userId, facts);
      return { applied: true, summary: `Top-up refunded; ${recovered.toLocaleString()} credits recovered` };
    }

    // ── Subscription lifecycle ──────────────────────────────────────────────
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed":
    case "subscription_unpaused":
    case "subscription_plan_changed": {
      if (!subscriptionId) return { applied: false, summary: "No subscription id on the event" };
      const outcome = await reconcileSubscription(userId, facts);
      await settleReferralCommission(userId, outcome, facts);
      // Close the loop on the trial guard: the claim row said "allowed", and this
      // is the event that says it was actually taken up. Best-effort by design —
      // a bookkeeping update must never fail a payment.
      if (facts.custom.claimId) {
        await attachTrialCheckout(facts.custom.claimId, {
          lsCustomerId: facts.customerId,
          lsSubscriptionId: subscriptionId,
        });
      }
      return {
        applied: true,
        summary:
          outcome.granted > 0
            ? `${outcome.effectivePlan} active; ${outcome.granted.toLocaleString()} credits granted (${outcome.grantKind})`
            : `${outcome.effectivePlan} active; no new credits for this period`,
      };
    }

    // Cancelled is not "over". The customer keeps what they paid for until
    // `ends_at`, and `cancelAtPeriodEnd` is what makes the UI say so.
    case "subscription_cancelled": {
      if (!subscriptionId) return { applied: false, summary: "No subscription id on the event" };
      const outcome = await reconcileSubscription(userId, facts, {
        statusOverride: "CANCELLED",
        cancelAtPeriodEnd: true,
      });
      return {
        applied: true,
        summary: `Cancelled; access until ${outcome.periodEnd.toISOString().slice(0, 10)}`,
      };
    }

    case "subscription_expired": {
      if (!subscriptionId) return { applied: false, summary: "No subscription id on the event" };
      await reconcileSubscription(userId, facts, { statusOverride: "EXPIRED", cancelAtPeriodEnd: false });
      return { applied: true, summary: "Subscription expired; the account is on Free" };
    }

    case "subscription_paused": {
      if (!subscriptionId) return { applied: false, summary: "No subscription id on the event" };
      await reconcileSubscription(userId, facts, { statusOverride: "PAUSED" });
      return { applied: true, summary: "Subscription paused" };
    }

    // ── Invoices ────────────────────────────────────────────────────────────
    // An invoice says money moved but not what the subscription now looks like, so
    // the subscription is fetched. That also makes this the repair path for a
    // `subscription_updated` that was never delivered: a renewal grants its credits
    // from whichever of the two events arrives, and the shared period arithmetic
    // means it can never grant from both.
    case "subscription_payment_success":
    case "subscription_payment_recovered": {
      if (!subscriptionId) return { applied: false, summary: "No subscription id on the invoice" };
      const outcome = await reconcileFromApi(userId, subscriptionId, undefined);
      if (!outcome) return { applied: false, summary: "Could not read the subscription from Lemon Squeezy" };
      await settleReferralCommission(userId, outcome, facts);
      return {
        applied: true,
        summary:
          outcome.granted > 0
            ? `Payment ${facts.billingReason ?? "received"}; ${outcome.granted.toLocaleString()} credits granted`
            : `Payment ${facts.billingReason ?? "received"}; allowance already granted for this period`,
      };
    }

    // Past due, not cut off. Lemon Squeezy retries the card for several days, and
    // ending someone's access on the first failed attempt loses the customer over
    // an expired card. `getPlanContext` keeps PAST_DUE on the plan, and the billing
    // page shows the banner that gets it fixed.
    case "subscription_payment_failed": {
      if (!subscriptionId) return { applied: false, summary: "No subscription id on the invoice" };
      const outcome = await reconcileFromApi(userId, subscriptionId, undefined, {
        statusOverride: "PAST_DUE",
      });
      if (!outcome) {
        await prisma.subscription.updateMany({
          where: { userId, lsSubscriptionId: subscriptionId },
          data: { status: "PAST_DUE" },
        });
      }
      return { applied: true, summary: "Payment failed; the subscription is past due" };
    }

    case "subscription_payment_refunded": {
      // Lemon Squeezy moves the money. Whether that also ends the subscription is
      // their decision, and it arrives as its own `subscription_*` event. The
      // affiliate commission dies here — whatever state it is in — because the
      // money it was earned from has gone back.
      try {
        await rejectReferralForRefund(userId);
      } catch (err) {
        console.error("[ls-webhook] referral refund rejection failed:", err);
      }
      return { applied: true, summary: "Subscription payment refunded" };
    }

    default:
      return { applied: false, summary: `No handler for ${facts.eventName}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The endpoint
// ─────────────────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/**
 * Claims this delivery, or reports that it has already been dealt with.
 *
 * The row is written before anything is applied, keyed on the event's own id. A
 * redelivery collides, and the collision is then inspected rather than assumed:
 * a row that was stored but never successfully processed — the endpoint crashed,
 * the database blinked, the account did not exist yet — is claimed again and
 * retried. Treating every collision as "already done" would turn one transient
 * failure into a permanently unfulfilled purchase.
 */
async function claimEvent(
  eventId: string,
  facts: LemonEventFacts,
  userId: string | null,
  payload: LemonWebhookPayload
): Promise<{ rowId: string } | { alreadyProcessed: true }> {
  const data = {
    eventId,
    eventName: facts.eventName,
    userId,
    lsCustomerId: facts.customerId,
    lsSubscriptionId: facts.subscriptionId,
    lsOrderId: facts.orderId,
    plan: (facts.plan ?? null) as never,
    status: (facts.status ?? null) as never,
    amountCents: facts.amountCents ?? facts.amountUsdCents ?? null,
    currency: facts.currency ?? (facts.amountUsdCents !== null ? "USD" : null),
    payload: payload as unknown as Prisma.InputJsonValue,
    testMode: facts.testMode,
  };

  try {
    const row = await prisma.billingEvent.create({ data, select: { id: true } });
    return { rowId: row.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    const existing = await prisma.billingEvent.findUnique({
      where: { eventId },
      select: { id: true, processed: true },
    });
    if (!existing) throw err;
    if (existing.processed) return { alreadyProcessed: true };

    // Seen but never finished. Refresh what we know and let it run again.
    await prisma.billingEvent.update({
      where: { id: existing.id },
      data: { userId: userId ?? undefined, error: null },
    });
    return { rowId: existing.id };
  }
}

export async function POST(req: Request) {
  // The secret and the variant ids may have been set from the back office rather
  // than the environment, so the cache is warmed before anything reads them.
  await ensureRuntimeConfig();

  if (!lemonWebhookConfigured()) {
    // Refusing is the only safe answer: without the secret nothing can be verified,
    // and an unverified event is an upgrade request from an anonymous stranger.
    return NextResponse.json({ ok: false, error: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    console.error("[ls-webhook] signature rejected");
    return NextResponse.json({ ok: false, error: "BAD_SIGNATURE" }, { status: 401 });
  }

  let payload: LemonWebhookPayload;
  try {
    payload = JSON.parse(raw) as LemonWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }

  // Webhooks carry the numeric variant id, but the settings may hold the buy link
  // instead — the UUID in the checkout URL. Without this the variant would not be
  // recognised as ours and every purchase would fall back to what the checkout
  // claimed. Done after the signature check so an unverified request cannot make us
  // call out, and cached for the life of the process.
  await ensureVariantResolution();

  const facts = readEventFacts(payload);
  if (!facts.eventName) {
    return NextResponse.json({ ok: false, error: "NO_EVENT_NAME" }, { status: 400 });
  }

  const eventId = webhookEventId(payload, raw);
  const userId = await resolveUserId(facts);

  let rowId: string;
  try {
    const claim = await claimEvent(eventId, facts, userId, payload);
    if ("alreadyProcessed" in claim) {
      return NextResponse.json({ ok: true, duplicate: true, event: facts.eventName });
    }
    rowId = claim.rowId;
  } catch (err) {
    console.error("[ls-webhook] could not record the event", eventId, err);
    return NextResponse.json({ ok: false, error: "RECORD_FAILED" }, { status: 500 });
  }

  // An event we do not act on is still worth keeping — it is the audit trail for
  // "what did Lemon Squeezy actually tell us" — but it is finished with here.
  if (!isHandledEvent(facts.eventName)) {
    await prisma.billingEvent.update({
      where: { id: rowId },
      data: { processed: true, processedAt: new Date(), error: null },
    });
    return NextResponse.json({ ok: true, ignored: facts.eventName });
  }

  if (!userId) {
    // Money arrived and we cannot say whose it is. The row keeps the whole payload
    // so it can be attached by hand, and the 500 makes Lemon Squeezy try again in
    // case the account is a few seconds behind the payment.
    const detail = `No account for customer ${facts.customerId ?? "?"} / ${facts.userEmail ?? "no email"}`;
    console.error("[ls-webhook] unattributable event", facts.eventName, detail);
    await prisma.billingEvent.update({
      where: { id: rowId },
      data: { error: `NO_ACCOUNT: ${detail}` },
    });
    return NextResponse.json({ ok: false, error: "NO_ACCOUNT" }, { status: 500 });
  }

  try {
    const result = await applyEvent(userId, facts);
    await prisma.billingEvent.update({
      where: { id: rowId },
      data: {
        processed: result.applied,
        processedAt: result.applied ? new Date() : null,
        error: result.applied ? null : result.summary,
      },
    });

    if (!result.applied) {
      console.error("[ls-webhook] not applied", facts.eventName, result.summary);
      return NextResponse.json({ ok: false, error: result.summary }, { status: 500 });
    }

    return NextResponse.json({ ok: true, event: facts.eventName, detail: result.summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ls-webhook] handler threw", facts.eventName, err);
    await prisma.billingEvent
      .update({ where: { id: rowId }, data: { error: message.slice(0, 500) } })
      .catch(() => undefined);
    return NextResponse.json({ ok: false, error: "HANDLER_FAILED" }, { status: 500 });
  }
}
