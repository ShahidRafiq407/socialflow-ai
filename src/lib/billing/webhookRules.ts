// ============================================================================
// WEBHOOK RULES — THE DECISIONS A PAYMENT EVENT TRIGGERS, WITH NO I/O
//
// These three questions decide what a payment is worth:
//
//   1. What was bought?            `purchaseKind`
//   2. Is the event allowed to     `trustPlan`
//      name the plan it names?
//   3. Does this order start a     `trialGrantDecision`
//      trial, and for how long?
//
// They live here rather than inside the route handler for one reason: a Next.js
// `route.ts` may only export its HTTP methods, so anything defined there cannot be
// reached by a test. These are the rules that stand between a $1 charge and an
// Agency plan, and rules that decide what money buys should be pinned by tests
// rather than by reading them carefully once.
//
// Everything here is a pure function of the event (plus, for the trial, the row
// that already exists and the current time, both passed in). No database, no
// network, no clock.
// ============================================================================

import { PLAN_CATALOG, type PlanTier } from "./plans";
import {
  TRIAL_PRICE_CENTS,
  type BillingCycleValue,
  type LemonEventFacts,
  type PurchaseKind,
} from "./lemonsqueezy";

/**
 * What was bought, with the checkout's own word for it as the fallback.
 *
 * `facts.purchase` is the trustworthy answer — it means the variant on the payload
 * is one we configured. But an order for the $1 trial produces no subscription
 * event, so if the variant ids have not been filled in and we ignore the order too,
 * a customer pays and receives nothing at all. So the checkout's stated purpose is
 * allowed to route the event, and the money is checked before anything is granted.
 */
export function purchaseKind(facts: LemonEventFacts): PurchaseKind | null {
  if (facts.purchase !== null) return facts.purchase.kind;
  if (facts.custom.purpose === "TRIAL" || facts.custom.intent === "trial") return "trial";
  if (facts.custom.purpose === "TOPUP" || facts.custom.packId !== null) return "topup";
  return null;
}

/** A plan's list price for one cycle, in USD cents. */
export function listPriceCents(plan: PlanTier, cycle: BillingCycleValue): number | null {
  const config = PLAN_CATALOG[plan];
  if (!config) return null;
  if (config.oneTimePrice !== undefined) return Math.round(config.oneTimePrice * 100);
  const dollars = cycle === "yearly" ? config.priceYearly : config.priceMonthly;
  return dollars > 0 ? Math.round(dollars * 100) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Is this event allowed to name a plan?
//
// `readEventFacts` falls back to `custom_data.purpose` when the variant id on the
// payload is not one we have configured. That fallback is load-bearing — it is how
// a checkout built by hand still finds its plan — and it is also the one place a
// buyer has any say over what they are granted, because `custom_data` travels in
// the checkout URL and can be edited before paying.
//
// So a plan that came from custom data alone has to agree with the money. A variant
// we recognise needs no such check: the price is the product's, set in the Lemon
// Squeezy dashboard, and nothing in the URL can change it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Half price, as the floor.
 *
 * Not the exact price: Lemon Squeezy's `total` is after any discount code we chose
 * to issue, so an exact match would refuse our own promotions. Half is loose enough
 * for a real launch discount and nowhere near loose enough for the attack this
 * guards against, which is paying the $1 trial and claiming Agency.
 */
export const PRICE_FLOOR_RATIO = 0.5;

export type PlanTrust = { ok: true } | { ok: false; summary: string };

export function trustPlan(facts: LemonEventFacts): PlanTrust {
  // The variant is one of ours: whatever it charges is what it charges.
  if (facts.purchase !== null) return { ok: true };
  // Nothing claimed, nothing to abuse. `reconcileSubscription` uses the stored plan.
  if (facts.plan === null || facts.plan === "FREE") return { ok: true };

  const claimed = facts.plan;
  const cycle = facts.cycle ?? "monthly";
  const expected = listPriceCents(claimed, cycle);
  const paid = facts.amountUsdCents ?? facts.amountCents;

  if (paid === null) {
    // A subscription event carries no total, so there is nothing to check it
    // against. Refusing means Lemon Squeezy retries, and a retry is also another
    // chance for the variant lookup to succeed and settle this properly.
    return {
      ok: false,
      summary: `Variant ${facts.variantId ?? "?"} is not one of ours, so "${claimed}" is only what the checkout claimed. Set the variant ids and this will settle on retry.`,
    };
  }

  if (expected !== null && paid + 1 < Math.round(expected * PRICE_FLOOR_RATIO)) {
    return {
      ok: false,
      summary: `Refused: the checkout claimed ${claimed} (${cycle}, list $${(expected / 100).toFixed(2)}) but only $${(paid / 100).toFixed(2)} was charged.`,
    };
  }

  console.warn(
    "[ls-webhook] plan taken from custom_data, checked against the amount paid:",
    claimed,
    cycle,
    paid
  );
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// The $1 trial
//
// The trial is a SINGLE PAYMENT product, not a subscription with a trial period, so
// it never produces a `subscription_created` — the only thing Lemon Squeezy sends is
// one `order_created`. That is why the trial is granted from an order while every
// plan is granted from a subscription event.
//
// Three things can be wrong with such an order, and each has a different answer:
// it underpaid (refuse, and let Lemon Squeezy retry in case the total arrives late),
// the account is already subscribed (record it, change nothing — a $1 order must
// never overwrite a paying plan), or this person has already had their trial
// (record it, grant nothing).
// ─────────────────────────────────────────────────────────────────────────────

/** The part of the stored subscription these rules need. */
export interface TrialRow {
  plan: PlanTier;
  lsSubscriptionId: string | null;
  lsOrderId: string | null;
  trialEndsAt: Date | null;
}

export type TrialDecision =
  /** Not applied, so the webhook answers 500 and Lemon Squeezy tries again. */
  | { kind: "refuse"; summary: string }
  /** Applied — the event is settled — but nothing about the account changes. */
  | { kind: "noop"; summary: string }
  | { kind: "grant"; startedAt: Date; endsAt: Date; days: number };

/** How long a trial lasts, from the plan table rather than from a literal here. */
export function trialDays(): number {
  return PLAN_CATALOG.TRIAL.trialDays ?? 3;
}

export function trialGrantDecision(
  facts: LemonEventFacts,
  existing: TrialRow | null,
  now: Date
): TrialDecision {
  const expected = listPriceCents("TRIAL", "monthly") ?? TRIAL_PRICE_CENTS;
  const paid = facts.amountUsdCents ?? facts.amountCents;

  // Underpaying is the only way this is worth attacking, so only that is refused.
  // Paying more — sales tax on top, a rounded-up currency conversion — is fine.
  if (paid === null || paid + 2 < expected) {
    return {
      kind: "refuse",
      summary: `Refused: a trial order should charge $${(expected / 100).toFixed(2)} but this one was $${paid === null ? "?" : (paid / 100).toFixed(2)}.`,
    };
  }

  // A real subscription must never be overwritten by a $1 order. Anyone who buys
  // the trial while subscribed keeps what they are paying for, and the order is
  // recorded so it can be refunded by hand.
  if (existing?.lsSubscriptionId) {
    return {
      kind: "noop",
      summary: "Trial order recorded, but this account already has a subscription, so nothing changed.",
    };
  }

  // One per person. Keyed on the order id rather than on a claim row so that a
  // redelivery of THIS order still applies (and grants nothing extra, because the
  // period grant is keyed on the period start), while a second, later trial does
  // not.
  const already =
    existing?.plan === "TRIAL" && existing.lsOrderId !== null && existing.lsOrderId !== facts.orderId;
  if (already) {
    return {
      kind: "noop",
      summary: "Trial order recorded; this account has already had its trial, so no new period was granted.",
    };
  }

  const startedAt = facts.createdAt ?? now;
  const days = trialDays();
  return {
    kind: "grant",
    startedAt,
    endsAt: new Date(startedAt.getTime() + days * 24 * 60 * 60_000),
    days,
  };
}
