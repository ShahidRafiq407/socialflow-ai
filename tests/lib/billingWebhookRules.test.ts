// ============================================================================
// WEBHOOK RULES — WHAT A PAYMENT IS ALLOWED TO BUY
//
// WHY THIS EXISTS: two of the three rules in `webhookRules.ts` are the only thing
// standing between a $1 charge and an Agency plan, and neither is a type error when
// it breaks.
//
//   `custom_data` travels in the checkout URL. A buyer can edit it before paying, so
//   an event whose variant we do not recognise can *claim* to be Agency while the
//   receipt says $1. `trustPlan` is the only place that is checked, and it is checked
//   against the amount actually charged.
//
//   The trial is a Single Payment product, so it emits `order_created` and nothing
//   else — no `subscription_created` ever arrives. That means the trial is granted
//   from an order, which is the one grant path with no subscription behind it to
//   verify against. If `purchaseKind` stops recognising the order, a paying customer
//   gets nothing; if `trialGrantDecision` stops checking, an unlimited number of
//   three-day trials can be had for free.
//
// Every case below is one of those two failures, or a case where refusing would be
// the bug: a real variant charging its own price, sales tax on top of $1, and the
// redelivery of an order that has already been applied.
// ============================================================================

import { describe, expect, it, vi } from "vitest";

import { PLAN_CATALOG, type PlanTier } from "@/lib/billing/plans";
import type {
  BillingCycleValue,
  LemonEventFacts,
  ParsedCustomData,
  VariantRef,
} from "@/lib/billing/lemonsqueezy";
import {
  PRICE_FLOOR_RATIO,
  listPriceCents,
  purchaseKind,
  trialDays,
  trialGrantDecision,
  trustPlan,
  type TrialRow,
} from "@/lib/billing/webhookRules";

const ORDER_DATE = new Date(Date.UTC(2026, 8, 5, 12, 0, 0));
/** Any "now" the decision could fall back to. Deliberately not the order date. */
const NOW = new Date(Date.UTC(2026, 8, 9, 3, 0, 0));

const TRIAL_CENTS = Math.round((PLAN_CATALOG.TRIAL.oneTimePrice ?? 1) * 100);

function custom(patch: Partial<ParsedCustomData> = {}): ParsedCustomData {
  return { userId: "user_1", purpose: null, cycle: null, packId: null, intent: null, claimId: null, ...patch };
}

/** A configured variant, i.e. one whose price is set in the Lemon Squeezy dashboard. */
function variant(patch: Partial<VariantRef> = {}): VariantRef {
  return {
    variantId: "999001",
    numeric: "999001",
    uuid: null,
    kind: "subscription",
    plan: "PRO",
    cycle: "monthly",
    envVar: "LEMONSQUEEZY_VARIANT_PRO_MONTHLY",
    ...patch,
  };
}

function facts(patch: Partial<LemonEventFacts> = {}): LemonEventFacts {
  return {
    eventName: "order_created",
    testMode: false,
    resourceType: "orders",
    resourceId: "ord_1",
    custom: custom(),
    customerId: "cus_1",
    subscriptionId: null,
    orderId: "ord_1",
    productId: "prod_1",
    variantId: "999001",
    variantName: null,
    productName: null,
    userEmail: "buyer@example.com",
    userName: null,
    lsStatus: "paid",
    status: null,
    cancelled: false,
    pauseMode: null,
    pauseResumesAt: null,
    trialEndsAt: null,
    renewsAt: null,
    endsAt: null,
    createdAt: ORDER_DATE,
    updatedAt: null,
    billingAnchor: null,
    cardBrand: null,
    cardLastFour: null,
    amountCents: null,
    currency: "USD",
    amountUsdCents: null,
    billingReason: null,
    refunded: false,
    receiptUrl: null,
    purchase: null,
    plan: null,
    cycle: null,
    packId: null,
    ...patch,
  };
}

function row(patch: Partial<TrialRow> = {}): TrialRow {
  return { plan: "FREE", lsSubscriptionId: null, lsOrderId: null, trialEndsAt: null, ...patch };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("listPriceCents", () => {
  it("reads the one-time price for the trial, not a monthly one", () => {
    expect(listPriceCents("TRIAL", "monthly")).toBe(TRIAL_CENTS);
    // A one-time product has no cycle, so asking for yearly must not change it.
    expect(listPriceCents("TRIAL", "yearly")).toBe(TRIAL_CENTS);
  });

  it("reads the whole yearly price, not a twelfth of it", () => {
    // The webhook compares against one charge, and a yearly charge is the full
    // amount. Dividing by twelve here would let $19 buy a year of Agency.
    for (const tier of ["GO", "PRO", "AGENCY"] as PlanTier[]) {
      expect(listPriceCents(tier, "yearly")).toBe(Math.round(PLAN_CATALOG[tier].priceYearly * 100));
      expect(listPriceCents(tier, "monthly")).toBe(Math.round(PLAN_CATALOG[tier].priceMonthly * 100));
    }
  });

  it("has no price for Free, so nothing is ever compared against zero", () => {
    expect(listPriceCents("FREE", "monthly")).toBeNull();
  });
});

describe("purchaseKind", () => {
  it("believes a configured variant over anything the checkout says", () => {
    const kind = purchaseKind(
      facts({
        purchase: variant({ kind: "trial", plan: "TRIAL" }),
        custom: custom({ purpose: "AGENCY" }),
      })
    );
    expect(kind).toBe("trial");
  });

  it("routes a trial order whose variant id has not been configured yet", () => {
    // The whole reason this fallback exists: with `purchase` null and the order
    // ignored, a customer pays $1 and receives nothing, because a Single Payment
    // product never sends a subscription event to pick up the slack.
    expect(purchaseKind(facts({ custom: custom({ purpose: "TRIAL" }) }))).toBe("trial");
    expect(purchaseKind(facts({ custom: custom({ intent: "trial" }) }))).toBe("trial");
  });

  it("routes a top-up by its pack id alone", () => {
    expect(purchaseKind(facts({ custom: custom({ packId: "boost" }) }))).toBe("topup");
    expect(purchaseKind(facts({ custom: custom({ purpose: "TOPUP" }) }))).toBe("topup");
  });

  it("says nothing when the event says nothing", () => {
    expect(purchaseKind(facts())).toBeNull();
    // A plan purchase is deliberately not inferred here: its subscription events
    // carry the plan, and the order alone must not grant one.
    expect(purchaseKind(facts({ custom: custom({ purpose: "PRO" }) }))).toBeNull();
  });
});

describe("trustPlan", () => {
  it("refuses $1 buying Agency", () => {
    const trust = trustPlan(
      facts({
        eventName: "order_created",
        purchase: null,
        plan: "AGENCY",
        cycle: "monthly",
        amountUsdCents: TRIAL_CENTS,
        custom: custom({ purpose: "AGENCY" }),
      })
    );
    expect(trust.ok).toBe(false);
    if (!trust.ok) expect(trust.summary).toContain("AGENCY");
  });

  it("refuses a yearly plan paid for at the monthly price", () => {
    const trust = trustPlan(
      facts({
        purchase: null,
        plan: "PRO",
        cycle: "yearly",
        amountUsdCents: Math.round(PLAN_CATALOG.PRO.priceMonthly * 100),
      })
    );
    expect(trust.ok).toBe(false);
  });

  it("refuses, rather than guesses, when there is no amount to check", () => {
    // A subscription event carries no total. Refusing turns into a 500, which is a
    // retry, which is another chance for the variant lookup to settle it properly.
    const trust = trustPlan(
      facts({ eventName: "subscription_created", purchase: null, plan: "AGENCY", amountUsdCents: null, amountCents: null })
    );
    expect(trust.ok).toBe(false);
    if (!trust.ok) expect(trust.summary).toContain("variant ids");
  });

  it("accepts a recognised variant whatever it charged", () => {
    // The price of a configured variant is set in the dashboard, and nothing in the
    // checkout URL can change it — including a $0 charge on a 100% discount code.
    const trust = trustPlan(
      facts({ purchase: variant({ plan: "AGENCY" }), plan: "AGENCY", amountUsdCents: 0 })
    );
    expect(trust.ok).toBe(true);
  });

  it("accepts a launch discount down to the floor", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const list = Math.round(PLAN_CATALOG.PRO.priceMonthly * 100);
      const atFloor = Math.round(list * PRICE_FLOOR_RATIO);
      expect(trustPlan(facts({ purchase: null, plan: "PRO", cycle: "monthly", amountUsdCents: atFloor })).ok).toBe(true);
      // And one cent under the floor is still allowed by the +1 slack, so rounding
      // a half-price coupon down can never refuse a real payment.
      expect(trustPlan(facts({ purchase: null, plan: "PRO", cycle: "monthly", amountUsdCents: atFloor - 1 })).ok).toBe(true);
      // Half of half is not a discount.
      expect(trustPlan(facts({ purchase: null, plan: "PRO", cycle: "monthly", amountUsdCents: Math.round(list * 0.25) })).ok).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it("settles in the charged currency when USD is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const list = Math.round(PLAN_CATALOG.GO.priceMonthly * 100);
      expect(
        trustPlan(facts({ purchase: null, plan: "GO", cycle: "monthly", amountUsdCents: null, amountCents: list })).ok
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("has nothing to check when no plan is claimed", () => {
    expect(trustPlan(facts({ purchase: null, plan: null })).ok).toBe(true);
    expect(trustPlan(facts({ purchase: null, plan: "FREE" })).ok).toBe(true);
  });

  it("defaults a missing cycle to monthly, which is the cheaper claim", () => {
    // Falling back to yearly would set the floor at half a year's price and refuse
    // an ordinary monthly payment.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const monthly = Math.round(PLAN_CATALOG.PRO.priceMonthly * 100);
      expect(trustPlan(facts({ purchase: null, plan: "PRO", cycle: null, amountUsdCents: monthly })).ok).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("trialGrantDecision", () => {
  const paid = facts({
    custom: custom({ purpose: "TRIAL", claimId: "claim_1" }),
    amountUsdCents: TRIAL_CENTS,
    orderId: "ord_1",
  });

  it("grants three days from the order date", () => {
    const decision = trialGrantDecision(paid, null, NOW);
    expect(decision.kind).toBe("grant");
    if (decision.kind !== "grant") return;
    expect(decision.days).toBe(trialDays());
    expect(decision.startedAt.toISOString()).toBe(ORDER_DATE.toISOString());
    expect(decision.endsAt.getTime() - ORDER_DATE.getTime()).toBe(trialDays() * 86_400_000);
    // Not "now": a webhook redelivered four days later must not restart the clock.
    expect(decision.endsAt.getTime()).toBeLessThan(NOW.getTime() + trialDays() * 86_400_000);
  });

  it("falls back to now when the order carries no date", () => {
    const decision = trialGrantDecision(facts({ ...paid, createdAt: null }), null, NOW);
    expect(decision.kind).toBe("grant");
    if (decision.kind === "grant") expect(decision.startedAt.toISOString()).toBe(NOW.toISOString());
  });

  it("refuses an order that did not pay for the trial", () => {
    const decision = trialGrantDecision(facts({ ...paid, amountUsdCents: 1 }), null, NOW);
    expect(decision.kind).toBe("refuse");
  });

  it("refuses an order with no amount at all", () => {
    const decision = trialGrantDecision(
      facts({ ...paid, amountUsdCents: null, amountCents: null }),
      null,
      NOW
    );
    expect(decision.kind).toBe("refuse");
  });

  it("allows tax and currency rounding on top", () => {
    expect(trialGrantDecision(facts({ ...paid, amountUsdCents: TRIAL_CENTS + 21 }), null, NOW).kind).toBe("grant");
    // Two cents of slack underneath, for a conversion that lands just short.
    expect(trialGrantDecision(facts({ ...paid, amountUsdCents: TRIAL_CENTS - 2 }), null, NOW).kind).toBe("grant");
  });

  it("never overwrites a live subscription", () => {
    // Someone on Agency who buys the $1 trial keeps Agency. The order is settled so
    // Lemon Squeezy stops retrying, and it can be refunded by hand.
    const decision = trialGrantDecision(paid, row({ plan: "AGENCY", lsSubscriptionId: "sub_9" }), NOW);
    expect(decision.kind).toBe("noop");
    if (decision.kind === "noop") expect(decision.summary).toContain("already has a subscription");
  });

  it("gives one trial per account, not one per order", () => {
    const decision = trialGrantDecision(paid, row({ plan: "TRIAL", lsOrderId: "ord_earlier" }), NOW);
    expect(decision.kind).toBe("noop");
    if (decision.kind === "noop") expect(decision.summary).toContain("already had its trial");
  });

  it("still applies a redelivery of the same order", () => {
    // The idempotency table is the first line, but a redelivery that gets past it
    // must land on the same period rather than be treated as a second trial.
    expect(trialGrantDecision(paid, row({ plan: "TRIAL", lsOrderId: "ord_1" }), NOW).kind).toBe("grant");
  });

  it("grants to an account whose row exists but has never trialled", () => {
    expect(trialGrantDecision(paid, row({ plan: "FREE" }), NOW).kind).toBe("grant");
  });

  it("checks the money before it checks anything else", () => {
    // An underpaid order on a subscribed account is refused rather than quietly
    // settled, because the amount is the part worth investigating.
    const decision = trialGrantDecision(
      facts({ ...paid, amountUsdCents: 1 }),
      row({ plan: "AGENCY", lsSubscriptionId: "sub_9" }),
      NOW
    );
    expect(decision.kind).toBe("refuse");
  });
});

describe("the trial's shape", () => {
  it("is a one-time product, which is why it is granted from an order", () => {
    // If this ever becomes a subscription with a trial period, `applyTrialOrder` is
    // the wrong path for it and this suite is testing the wrong thing.
    expect(PLAN_CATALOG.TRIAL.oneTimePrice).toBeDefined();
    expect(PLAN_CATALOG.TRIAL.priceMonthly).toBe(0);
    expect(trialDays()).toBeGreaterThan(0);
  });

  it("costs less than every plan it opens up", () => {
    const trialPrice = listPriceCents("TRIAL", "monthly") ?? 0;
    for (const tier of ["GO", "PRO", "AGENCY"] as PlanTier[]) {
      for (const cycle of ["monthly", "yearly"] as BillingCycleValue[]) {
        // The floor rule only guards the gap while there is one.
        expect(trialPrice).toBeLessThan(Math.round((listPriceCents(tier, cycle) ?? 0) * PRICE_FLOOR_RATIO));
      }
    }
  });
});
