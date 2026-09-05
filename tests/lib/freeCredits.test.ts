// ============================================================================
// FREE CREDITS — THE ONE GRANT NO PAYMENT TRIGGERS
//
// Every other grant in this system starts with money moving: Lemon Squeezy takes a
// payment, sends a webhook, `syncPeriodGrant` runs. A Free account never produces
// that event, so nothing ever granted it the 70 credits its plan card promises —
// and the two AI actions Free is actually sold on, the scheduler's best-time pick
// and the brand scan, are both priced actions. They were refused with
// INSUFFICIENT_CREDITS on the first press, for the entire life of the account.
//
// `ensureFreeGrant` closes that lazily, on the first balance read or first spend.
// Lazy means it sits on a hot path, and a grant on a hot path has exactly two ways
// to be wrong: hand out the credits twice, or hand out 70 where 5,000 were already
// there. Both are pinned below against a wallet that behaves like the real row —
// including the ledger's unique key, which is what actually settles two requests
// spending in the same millisecond.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEntitlements, type PlanTier } from "@/lib/billing/plans";
import type { PlanContext } from "@/lib/billing/entitlements";

const USER = "user_free_1";
const NEVER_GRANTED = new Date(0);
const FREE_CREDITS = getEntitlements("FREE").monthlyCredits;

/** August 2026 in UTC — the window `calendarPeriod` hands a Free account. */
const PERIOD_START = new Date(Date.UTC(2026, 7, 1));
const PERIOD_END = new Date(Date.UTC(2026, 8, 1));
const LAST_MONTH = new Date(Date.UTC(2026, 6, 1));
/** A paid period that began mid-month, which is the case that must not be lost. */
const MID_MONTH = new Date(Date.UTC(2026, 7, 14));

interface Row {
  id: string;
  userId: string;
  grantBalance: number;
  topUpBalance: number;
  heldCredits: number;
  monthlyGrant: number;
  grantPeriodStart: Date;
  grantPeriodEnd: Date;
  lifetimeGranted: number;
  lifetimeSpent: number;
}

function row(patch: Partial<Row> = {}): Row {
  return {
    id: "wallet_1",
    userId: USER,
    grantBalance: 0,
    topUpBalance: 0,
    heldCredits: 0,
    monthlyGrant: FREE_CREDITS,
    grantPeriodStart: NEVER_GRANTED,
    grantPeriodEnd: PERIOD_END,
    lifetimeGranted: 0,
    lifetimeSpent: 0,
    ...patch,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A wallet that behaves like the row rather than like a spy.
 *
 * Every failure worth catching here is stateful — granted twice, granted backwards,
 * two requests racing on the same first spend — so counting calls would prove
 * nothing. This keeps one mutable row, applies `{ increment }` the way Prisma does,
 * and rejects a repeated ledger `idempotencyKey` with P2002, which is the guard the
 * real race lands on once the row lock lets the second writer through.
 */
function fakeDb(initial: Row | null) {
  const state: { row: Row | null } = { row: initial };
  const ledger: Array<{ kind: string; credits: number; key: string | null; note: string | null }> =
    [];
  const keys = new Set<string>();
  const counts = { transactions: 0, upserts: 0 };

  const makeTx = (added: string[]) => ({
    $queryRaw: async () => (state.row ? [{ ...state.row }] : []),
    creditWallet: {
      update: async ({ data }: any) => {
        const current = state.row!;
        for (const [field, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in (value as object)) {
            (current as any)[field] += (value as { increment: number }).increment;
          } else {
            (current as any)[field] = value;
          }
        }
        return { ...current };
      },
    },
    creditLedger: {
      create: async ({ data }: any) => {
        if (data.idempotencyKey) {
          if (keys.has(data.idempotencyKey)) {
            throw Object.assign(new Error("duplicate key"), { code: "P2002" });
          }
          keys.add(data.idempotencyKey);
          added.push(data.idempotencyKey);
        }
        ledger.push({
          kind: data.kind,
          credits: data.credits,
          key: data.idempotencyKey ?? null,
          note: data.note ?? null,
        });
        return { id: `ledger_${ledger.length}` };
      },
    },
  });

  /**
   * Serialised, and rolled back on a throw. Both matter.
   *
   * `lockWallet` takes the row `FOR UPDATE`, so a second writer cannot get past it
   * until the first has committed; without the same here, two grants interleave in a
   * way Postgres would never permit and a race test would be proving nothing. And an
   * aborted transaction leaves nothing behind — that is what makes the duplicate
   * ledger key a guard rather than a half-written grant with the credits already
   * added to `lifetimeGranted`.
   */
  let queue: Promise<unknown> = Promise.resolve();

  const $transaction = vi.fn(async (fn: (t: unknown) => unknown) => {
    const run = queue.then(async () => {
      counts.transactions += 1;
      const rowBefore = state.row ? { ...state.row } : null;
      const ledgerMark = ledger.length;
      const added: string[] = [];
      try {
        return await fn(makeTx(added));
      } catch (err) {
        state.row = rowBefore;
        ledger.length = ledgerMark;
        for (const key of added) keys.delete(key);
        throw err;
      }
    });
    queue = run.catch(() => undefined);
    return run;
  });

  const db = {
    creditWallet: {
      findUnique: vi.fn(async () => (state.row ? { ...state.row } : null)),
      upsert: vi.fn(async ({ create }: any) => {
        counts.upserts += 1;
        if (!state.row) state.row = row({ ...create, id: "wallet_created" });
        return { id: state.row.id };
      }),
    },
    featureUsage: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    // A new signup has no subscription row at all, which is exactly how the default
    // Free plan is expressed: nothing to read, so nothing to bill.
    subscription: { findUnique: vi.fn(async () => null) },
    mediaAsset: { aggregate: vi.fn(async () => ({ _sum: { size: 0 } })) },
    workspace: { count: vi.fn(async () => 0) },
    $transaction,
  };

  return { db, state, ledger, counts };
}

type Harness = ReturnType<typeof fakeDb>;

async function loadWallet(harness: Harness) {
  vi.doMock("@/lib/db", () => ({ default: harness.db }));
  return import("@/lib/billing/wallet");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/admin/runtimeConfig");
  vi.doUnmock("@/lib/admin/block");
});

describe("ensureFreeGrant", () => {
  it("gives a brand-new Free account this month's credits", async () => {
    const harness = fakeDb(row());
    const { ensureFreeGrant } = await loadWallet(harness);

    const result = await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(result.granted).toBe(true);
    expect(result.credits).toBe(FREE_CREDITS);
    expect(harness.state.row?.grantBalance).toBe(FREE_CREDITS);
    expect(harness.state.row?.monthlyGrant).toBe(FREE_CREDITS);
    expect(harness.state.row?.grantPeriodStart).toEqual(PERIOD_START);
    expect(harness.state.row?.grantPeriodEnd).toEqual(PERIOD_END);
    expect(harness.state.row?.lifetimeGranted).toBe(FREE_CREDITS);
  });

  it("writes one GRANT row keyed to the period, so a replay is refusable", async () => {
    const harness = fakeDb(row());
    const { ensureFreeGrant } = await loadWallet(harness);

    await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(harness.ledger).toHaveLength(1);
    expect(harness.ledger[0]).toMatchObject({
      kind: "GRANT",
      credits: FREE_CREDITS,
      key: `grant:${USER}:${PERIOD_START.toISOString()}`,
    });
  });

  it("names the month in the note, so the ledger reads as a period not an event", async () => {
    const harness = fakeDb(row());
    const { ensureFreeGrant } = await loadWallet(harness);

    await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(harness.ledger[0]?.note).toBe("Free plan credits for 2026-08");
  });

  it("is a no-op the second time in the same month, and never opens a transaction", async () => {
    const harness = fakeDb(row());
    const { ensureFreeGrant } = await loadWallet(harness);

    await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);
    const opened = harness.counts.transactions;
    const second = await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(second.granted).toBe(false);
    expect(second.reason).toBe("already_granted");
    // The point of the cheap read: the common case must not cost a transaction.
    expect(harness.counts.transactions).toBe(opened);
    // And above all, not twice the credits.
    expect(harness.state.row?.grantBalance).toBe(FREE_CREDITS);
    expect(harness.state.row?.lifetimeGranted).toBe(FREE_CREDITS);
  });

  it("stays quiet on every later spend in the month, however many there are", async () => {
    const harness = fakeDb(row());
    const { ensureFreeGrant } = await loadWallet(harness);

    for (let i = 0; i < 25; i += 1) {
      await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);
    }

    expect(harness.counts.transactions).toBe(1);
    expect(harness.ledger.filter((entry) => entry.kind === "GRANT")).toHaveLength(1);
  });
});

describe("ensureFreeGrant leaves paid wallets alone", () => {
  /**
   * The expensive mistake. A Pro subscription that renewed on the 14th carries a
   * `grantPeriodStart` inside the calendar month a Free context would ask for, so a
   * guard written as "grant if the period differs" would hand a paying customer 70
   * credits in place of the 5,000 they bought — on their next page load, every month.
   * `>=` is what stops it, and this is the test that would notice if it became `>`.
   */
  it("never overwrites a larger grant whose period started mid-month", async () => {
    const paid = row({
      grantBalance: 4_800,
      monthlyGrant: 5_000,
      grantPeriodStart: MID_MONTH,
      lifetimeGranted: 5_000,
    });
    const harness = fakeDb(paid);
    const { ensureFreeGrant } = await loadWallet(harness);

    const result = await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("already_granted");
    expect(harness.counts.transactions).toBe(0);
    expect(harness.state.row?.grantBalance).toBe(4_800);
    expect(harness.state.row?.monthlyGrant).toBe(5_000);
    expect(harness.state.row?.grantPeriodStart).toEqual(MID_MONTH);
  });

  it("refuses when the wallet was granted for exactly this period", async () => {
    const harness = fakeDb(row({ grantBalance: 12, grantPeriodStart: PERIOD_START }));
    const { ensureFreeGrant } = await loadWallet(harness);

    const result = await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(result.reason).toBe("already_granted");
    expect(harness.counts.transactions).toBe(0);
    // Twelve credits left from a month already granted stay twelve, not seventy.
    expect(harness.state.row?.grantBalance).toBe(12);
  });
});

describe("ensureFreeGrant across the month boundary", () => {
  it("grants again once the calendar month rolls over, expiring what was unspent", async () => {
    const harness = fakeDb(
      row({ grantBalance: 12, topUpBalance: 0, grantPeriodStart: LAST_MONTH, lifetimeGranted: 70 })
    );
    const { ensureFreeGrant } = await loadWallet(harness);

    const result = await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(result.granted).toBe(true);
    expect(result.credits).toBe(FREE_CREDITS);
    expect(result.expired).toBe(12);
    expect(harness.state.row?.grantBalance).toBe(FREE_CREDITS);
    // The expiry is written rather than silent, so "where did my credits go" has an answer.
    expect(harness.ledger.map((entry) => entry.kind)).toEqual(["EXPIRY", "GRANT"]);
    expect(harness.ledger[0]?.credits).toBe(-12);
  });

  it("creates the wallet when the account has never had one", async () => {
    const harness = fakeDb(null);
    const { ensureFreeGrant } = await loadWallet(harness);

    const result = await ensureFreeGrant(USER, PERIOD_START, PERIOD_END);

    expect(harness.counts.upserts).toBe(1);
    expect(result.granted).toBe(true);
    expect(result.credits).toBe(FREE_CREDITS);
    expect(harness.state.row?.grantBalance).toBe(FREE_CREDITS);
  });

  it("grants once when two spends race on the first press of the month", async () => {
    const harness = fakeDb(row());
    const { ensureFreeGrant } = await loadWallet(harness);

    // Both read the epoch before either writes, which is the whole difficulty: the
    // cheap `>=` read cannot separate them, so the unique ledger key has to.
    const [first, second] = await Promise.all([
      ensureFreeGrant(USER, PERIOD_START, PERIOD_END),
      ensureFreeGrant(USER, PERIOD_START, PERIOD_END),
    ]);

    const granted = [first, second].filter((r) => r.granted);
    expect(granted).toHaveLength(1);
    expect(harness.ledger.filter((entry) => entry.kind === "GRANT")).toHaveLength(1);
    expect(harness.state.row?.grantBalance).toBe(FREE_CREDITS);
    expect(harness.state.row?.lifetimeGranted).toBe(FREE_CREDITS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Through the gate
//
// The unit above is only half the fix. The other half is that the gate calls it at
// all, and calls it for Free alone — so these go through `checkAction`, the function
// every metered press in the product passes through, with a context handed in rather
// than read from a subscription row.
// ─────────────────────────────────────────────────────────────────────────────

function context(plan: PlanTier): PlanContext {
  return {
    userId: USER,
    plan,
    storedPlan: plan,
    status: plan === "FREE" ? "NONE" : "ACTIVE",
    entitlements: getEntitlements(plan),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    trialEndsAt: null,
    endsAt: null,
    cancelAtPeriodEnd: false,
    isTrial: false,
    stale: false,
    testMode: false,
  };
}

async function loadEntitlements(harness: Harness) {
  vi.doMock("@/lib/db", () => ({ default: harness.db }));
  vi.doMock("@/lib/admin/runtimeConfig", () => ({ ensureRuntimeConfig: async () => undefined }));
  vi.doMock("@/lib/admin/block", () => ({ getAccountBlock: async () => null }));
  return import("@/lib/billing/entitlements");
}

describe("checkAction on a Free account", () => {
  it("allows the plan's own headline feature on the very first press", async () => {
    const harness = fakeDb(row());
    const { checkAction } = await loadEntitlements(harness);

    const gate = await checkAction(context("FREE"), "schedule.bestTime");

    // This is the bug in one line. Before the grant existed the answer here was
    // INSUFFICIENT_CREDITS, on a freshly created account, for the feature the Free
    // plan card is sold on.
    expect(gate.reason).toBeUndefined();
    expect(gate.allowed).toBe(true);
    expect(harness.state.row?.grantBalance).toBe(FREE_CREDITS);
  });

  it("allows the brand scan onboarding opens with", async () => {
    const harness = fakeDb(row());
    const { checkAction } = await loadEntitlements(harness);

    const gate = await checkAction(context("FREE"), "brand.analyze");

    expect(gate.allowed).toBe(true);
    expect(gate.cost).toBe(2);
  });

  it("grants on the balance read too, not only on a spend", async () => {
    const harness = fakeDb(row());
    const { getAccountSummary } = await loadEntitlements(harness);

    // The month the meter counts against, derived the way `calendarPeriod` does.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const summary = await getAccountSummary(USER);

    expect(summary.context.plan).toBe("FREE");
    expect(summary.wallet.balance).toBe(FREE_CREDITS);
    expect(summary.wallet.monthlyGrant).toBe(FREE_CREDITS);
    // The wallet's period has to be the period the meter shows, or the billing tab
    // draws a reset date the wallet does not share.
    expect(summary.wallet.grantPeriodStart).toEqual(monthStart);
  });

  it("still refuses once the month's credits are spent", async () => {
    const harness = fakeDb(row({ grantBalance: 0, grantPeriodStart: PERIOD_START }));
    const { checkAction } = await loadEntitlements(harness);

    const gate = await checkAction(context("FREE"), "schedule.bestTime");

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("INSUFFICIENT_CREDITS");
    // Free cannot buy its way out, so the message must point at the reset, not a top-up.
    expect(gate.message).toContain("allowance resets");
  });
});

describe("checkAction on a paid account", () => {
  it("does not reach the Free grant, so a mid-month paid period survives", async () => {
    const paid = row({
      grantBalance: 0,
      monthlyGrant: 5_000,
      grantPeriodStart: MID_MONTH,
      lifetimeGranted: 5_000,
    });
    const harness = fakeDb(paid);
    const { checkAction } = await loadEntitlements(harness);

    // A Pro account that has spent its 5,000 credits. The refusal is correct; what
    // must not happen is 70 credits appearing to soften it.
    const gate = await checkAction(context("PRO"), "schedule.bestTime");

    expect(gate.reason).toBe("INSUFFICIENT_CREDITS");
    expect(harness.counts.transactions).toBe(0);
    expect(harness.state.row?.grantBalance).toBe(0);
    expect(harness.state.row?.monthlyGrant).toBe(5_000);
    expect(harness.state.row?.grantPeriodStart).toEqual(MID_MONTH);
  });

  it("leaves a trial's larger grant untouched", async () => {
    const trial = row({
      grantBalance: 400,
      monthlyGrant: getEntitlements("TRIAL").monthlyCredits,
      grantPeriodStart: MID_MONTH,
    });
    const harness = fakeDb(trial);
    const { checkAction } = await loadEntitlements(harness);

    const gate = await checkAction({ ...context("TRIAL"), isTrial: true }, "schedule.bestTime");

    expect(gate.allowed).toBe(true);
    expect(harness.counts.transactions).toBe(0);
    expect(harness.state.row?.grantBalance).toBe(400);
  });
});
