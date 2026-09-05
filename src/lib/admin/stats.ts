// ============================================================================
// ADMIN STATS — THE NUMBERS THE BUSINESS RUNS ON
//
// One read builds the overview: how many people signed up and when, how many
// are on each plan, what came in (Lemon Squeezy payments, net of their fee),
// what went out to Google (measured list cost from UsageEvent), what the
// affiliate program owes, and the difference — the operating margin before
// hosting.
//
// Revenue is read from BillingEvent, not Subscription: a subscription row says
// what someone is entitled to, an event says money actually moved. Test-mode
// events are excluded everywhere, and refunds are subtracted.
//
// Every query is guarded and returns zero on failure, because an overview that
// throws is a back office nobody can open.
// ============================================================================

import prisma from "@/lib/db";
import { netAfterFees } from "@/lib/billing/lemonsqueezy";
import { PLAN_TIERS, type PlanTier } from "@/lib/billing/plans";
import { ensureAdminSchema } from "./schema";

export type StatsRange = "7d" | "30d" | "90d" | "12m" | "all";

export interface DailyPoint {
  /** YYYY-MM-DD */
  day: string;
  value: number;
}

export interface AdminOverview {
  range: StatsRange;
  since: string | null;

  users: {
    total: number;
    newInRange: number;
    active7d: number;
    active30d: number;
    blocked: number;
    admins: number;
    signupsByDay: DailyPoint[];
  };

  plans: {
    /** Live paid subscriptions by tier (ACTIVE / TRIALING / PAST_DUE / CANCELLED-but-inside-period). */
    byTier: Record<PlanTier, number>;
    trialing: number;
    pastDue: number;
    cancelling: number;
    /** Monthly recurring revenue at list price, from live subscriptions. */
    mrrUsd: number;
  };

  revenue: {
    grossCents: number;
    refundedCents: number;
    netCents: number;
    /** After Lemon Squeezy's 5% + $0.50 per transaction. */
    afterFeesCents: number;
    payments: number;
    topUpCents: number;
    byDay: DailyPoint[];
  };

  costs: {
    /** Measured list cost of every model call, micro-dollars. */
    aiMicros: number;
    calls: number;
    failedCalls: number;
    byModel: Array<{ model: string; calls: number; costMicros: number }>;
    byFeature: Array<{ feature: string; calls: number; costMicros: number }>;
    byDayMicros: DailyPoint[];
  };

  credits: {
    granted: number;
    spent: number;
    refunded: number;
    adjusted: number;
    /** Outstanding balance across every wallet. */
    outstanding: number;
    held: number;
  };

  affiliate: {
    referrals: number;
    converted: number;
    commissionLockedCents: number;
    commissionAvailableCents: number;
    commissionPaidCents: number;
    payoutsRequested: number;
    payoutsRequestedCents: number;
  };

  /** afterFees − ai cost − affiliate paid. Before hosting and everything else. */
  profit: {
    grossProfitCents: number;
    marginPercent: number;
  };

  health: {
    openErrors: number;
    errors24h: number;
    unprocessedWebhooks: number;
    unattributedCalls: number;
    feedbackDown7d: number;
    feedbackUp7d: number;
    pendingPayouts: number;
  };
}

function sinceFor(range: StatsRange): Date | null {
  const now = Date.now();
  switch (range) {
    case "7d":
      return new Date(now - 7 * 86_400_000);
    case "30d":
      return new Date(now - 30 * 86_400_000);
    case "90d":
      return new Date(now - 90 * 86_400_000);
    case "12m":
      return new Date(now - 365 * 86_400_000);
    default:
      return null;
  }
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Fills every day between `since` and today so a chart has no gaps. */
function fillDays(since: Date | null, points: Map<string, number>, maxDays = 366): DailyPoint[] {
  const end = new Date();
  const start = since ?? new Date(end.getTime() - 30 * 86_400_000);
  const out: DailyPoint[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < maxDays) {
    const key = dayKey(cursor);
    out.push({ day: key, value: points.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

const PAYMENT_EVENTS = ["order_created", "subscription_payment_success", "subscription_payment_recovered"];
const REFUND_EVENTS = ["order_refunded", "subscription_payment_refunded"];

async function safe<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[admin-stats]", err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function getAdminOverview(range: StatsRange = "30d"): Promise<AdminOverview> {
  await ensureAdminSchema();
  const since = sinceFor(range);
  const inRange = since ? { gte: since } : undefined;
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d1 = new Date(now.getTime() - 86_400_000);

  const [
    totalUsers,
    newUsers,
    active7d,
    active30d,
    blocked,
    admins,
    signupRows,
    subs,
    payments,
    refunds,
    usageAgg,
    usageFailed,
    usageByModel,
    usageByFeature,
    usageRows,
    ledger,
    wallets,
    referrals,
    commissions,
    payoutsRequested,
    openErrors,
    errors24h,
    unprocessedWebhooks,
    unattributed,
    feedback7d,
  ] = await Promise.all([
    safe(0, () => prisma.user.count()),
    safe(0, () => prisma.user.count({ where: inRange ? { createdAt: inRange } : undefined })),
    safe(0, () => prisma.user.count({ where: { lastSeenAt: { gte: d7 } } })),
    safe(0, () => prisma.user.count({ where: { lastSeenAt: { gte: d30 } } })),
    safe(0, () => prisma.user.count({ where: { blockedAt: { not: null } } })),
    safe(0, () => prisma.user.count({ where: { role: "ADMIN" } })),
    safe([] as Array<{ createdAt: Date }>, () =>
      prisma.user.findMany({
        where: { createdAt: { gte: since ?? d30 } },
        select: { createdAt: true },
      })
    ),
    safe([] as Array<{ plan: string; status: string; cycle: string; cancelAtPeriodEnd: boolean; endsAt: Date | null; periodEnd: Date; testMode: boolean }>, () =>
      prisma.subscription.findMany({
        where: { testMode: false },
        select: { plan: true, status: true, cycle: true, cancelAtPeriodEnd: true, endsAt: true, periodEnd: true, testMode: true },
      })
    ),
    safe([] as Array<{ amountCents: number | null; createdAt: Date; eventName: string }>, () =>
      prisma.billingEvent.findMany({
        where: { testMode: false, processed: true, eventName: { in: PAYMENT_EVENTS }, ...(inRange ? { createdAt: inRange } : {}) },
        select: { amountCents: true, createdAt: true, eventName: true },
      })
    ),
    safe({ _sum: { amountCents: 0 } } as { _sum: { amountCents: number | null } }, () =>
      prisma.billingEvent.aggregate({
        where: { testMode: false, processed: true, eventName: { in: REFUND_EVENTS }, ...(inRange ? { createdAt: inRange } : {}) },
        _sum: { amountCents: true },
      })
    ),
    safe({ _count: { _all: 0 }, _sum: { costMicros: 0 } } as { _count: { _all: number }; _sum: { costMicros: number | null } }, () =>
      prisma.usageEvent.aggregate({
        where: inRange ? { createdAt: inRange } : undefined,
        _count: { _all: true },
        _sum: { costMicros: true },
      })
    ),
    safe(0, () => prisma.usageEvent.count({ where: { ok: false, ...(inRange ? { createdAt: inRange } : {}) } })),
    // groupBy calls sit in block bodies: Prisma's groupBy generic breaks when a
    // contextual return type is pushed into it, so the result is bound first.
    safe([] as Array<{ model: string; _count: { _all: number }; _sum: { costMicros: number | null } }>, async () => {
      const rows = await prisma.usageEvent.groupBy({
        by: ["model"],
        where: inRange ? { createdAt: inRange } : undefined,
        _count: { _all: true },
        _sum: { costMicros: true },
      });
      return rows;
    }),
    safe([] as Array<{ feature: string; _count: { _all: number }; _sum: { costMicros: number | null } }>, async () => {
      const rows = await prisma.usageEvent.groupBy({
        by: ["feature"],
        where: inRange ? { createdAt: inRange } : undefined,
        _count: { _all: true },
        _sum: { costMicros: true },
      });
      return rows;
    }),
    safe([] as Array<{ createdAt: Date; costMicros: number }>, () =>
      prisma.usageEvent.findMany({
        where: { createdAt: { gte: since ?? d30 } },
        select: { createdAt: true, costMicros: true },
      })
    ),
    safe([] as Array<{ kind: string; _sum: { credits: number | null } }>, async () => {
      const rows = await prisma.creditLedger.groupBy({
        by: ["kind"],
        where: inRange ? { createdAt: inRange } : undefined,
        _sum: { credits: true },
      });
      return rows;
    }),
    safe({ _sum: { grantBalance: 0, topUpBalance: 0, heldCredits: 0 } } as { _sum: { grantBalance: number | null; topUpBalance: number | null; heldCredits: number | null } }, () =>
      prisma.creditWallet.aggregate({ _sum: { grantBalance: true, topUpBalance: true, heldCredits: true } })
    ),
    safe([] as Array<{ status: string; _count: { _all: number } }>, async () => {
      const rows = await prisma.referral.groupBy({
        by: ["status"],
        where: inRange ? { createdAt: inRange } : undefined,
        _count: { _all: true },
      });
      return rows;
    }),
    safe([] as Array<{ status: string; _sum: { amountCents: number | null } }>, async () => {
      const rows = await prisma.commission.groupBy({ by: ["status"], _sum: { amountCents: true } });
      return rows;
    }),
    safe({ _count: { _all: 0 }, _sum: { amountCents: 0 } } as { _count: { _all: number }; _sum: { amountCents: number | null } }, () =>
      prisma.payout.aggregate({
        where: { status: { in: ["REQUESTED", "APPROVED"] } },
        _count: { _all: true },
        _sum: { amountCents: true },
      })
    ),
    safe(0, () => prisma.errorEvent.count({ where: { resolvedAt: null } })),
    safe(0, () => prisma.errorEvent.count({ where: { resolvedAt: null, lastSeen: { gte: d1 } } })),
    safe(0, () => prisma.billingEvent.count({ where: { processed: false } })),
    safe(0, () =>
      prisma.usageEvent.count({ where: { createdAt: { gte: d30 }, OR: [{ userId: null }, { feature: "unknown" }] } })
    ),
    safe([] as Array<{ rating: number; _count: { _all: number } }>, async () => {
      const rows = await prisma.chatFeedback.groupBy({ by: ["rating"], where: { createdAt: { gte: d7 } }, _count: { _all: true } });
      return rows;
    }),
  ]);

  // ── users ────────────────────────────────────────────────────────────────
  const signupPoints = new Map<string, number>();
  for (const row of signupRows) {
    const key = dayKey(row.createdAt);
    signupPoints.set(key, (signupPoints.get(key) ?? 0) + 1);
  }

  // ── plans ────────────────────────────────────────────────────────────────
  const byTier = Object.fromEntries(PLAN_TIERS.map((t) => [t, 0])) as Record<PlanTier, number>;
  let trialing = 0;
  let pastDue = 0;
  let cancelling = 0;
  let mrrUsd = 0;
  const { PLAN_CATALOG } = await import("@/lib/billing/plans");
  for (const sub of subs) {
    const live =
      sub.status === "ACTIVE" ||
      sub.status === "TRIALING" ||
      sub.status === "PAST_DUE" ||
      (sub.status === "CANCELLED" && (sub.endsAt ?? sub.periodEnd).getTime() > now.getTime());
    if (!live) continue;
    const tier = (sub.status === "TRIALING" ? "TRIAL" : sub.plan) as PlanTier;
    if (tier in byTier) byTier[tier] += 1;
    if (sub.status === "TRIALING") trialing += 1;
    if (sub.status === "PAST_DUE") pastDue += 1;
    if (sub.cancelAtPeriodEnd || sub.status === "CANCELLED") cancelling += 1;
    if (sub.status !== "TRIALING" && tier !== "FREE" && tier !== "TRIAL") {
      const plan = PLAN_CATALOG[tier];
      if (plan) mrrUsd += sub.cycle === "YEARLY" ? plan.priceYearly / 12 : plan.priceMonthly;
    }
  }
  // Everyone without a live paid row is Free.
  const paidLive = Object.entries(byTier).reduce((sum, [tier, n]) => (tier === "FREE" ? sum : sum + n), 0);
  byTier.FREE = Math.max(0, totalUsers - paidLive);

  // ── revenue ──────────────────────────────────────────────────────────────
  const revenuePoints = new Map<string, number>();
  let grossCents = 0;
  let topUpCents = 0;
  let paymentCount = 0;
  for (const row of payments) {
    const cents = row.amountCents ?? 0;
    if (cents <= 0) continue;
    grossCents += cents;
    paymentCount += 1;
    if (row.eventName === "order_created") topUpCents += 0; // orders include first payments; top-ups are separated below
    const key = dayKey(row.createdAt);
    revenuePoints.set(key, (revenuePoints.get(key) ?? 0) + cents);
  }
  // Top-ups: an order whose ledger row is a TOPUP in the same window. Approximated
  // from the ledger because BillingEvent does not store the purchase kind.
  const topUpLedger = ledger.find((row) => row.kind === "TOPUP");
  topUpCents = Math.max(0, topUpLedger?._sum.credits ?? 0); // 1 credit = 1 cent
  const refundedCents = Math.abs(refunds._sum.amountCents ?? 0);
  const netCents = Math.max(0, grossCents - refundedCents);
  // Fees are per transaction, so they are applied per payment rather than once.
  const afterFeesCents = Math.max(
    0,
    payments.reduce((sum, row) => sum + netAfterFees(row.amountCents ?? 0), 0) - refundedCents
  );

  // ── costs ────────────────────────────────────────────────────────────────
  const costPoints = new Map<string, number>();
  for (const row of usageRows) {
    const key = dayKey(row.createdAt);
    costPoints.set(key, (costPoints.get(key) ?? 0) + row.costMicros);
  }
  const aiMicros = usageAgg._sum.costMicros ?? 0;

  // ── credits ──────────────────────────────────────────────────────────────
  const sumKind = (kind: string) => ledger.find((row) => row.kind === kind)?._sum.credits ?? 0;
  const credits = {
    granted: sumKind("GRANT") + sumKind("TOPUP"),
    spent: Math.abs(sumKind("DEBIT")),
    refunded: sumKind("REFUND"),
    adjusted: sumKind("ADJUSTMENT"),
    outstanding: (wallets._sum.grantBalance ?? 0) + (wallets._sum.topUpBalance ?? 0),
    held: wallets._sum.heldCredits ?? 0,
  };

  // ── affiliate ────────────────────────────────────────────────────────────
  const refCount = (status: string) => referrals.find((row) => row.status === status)?._count._all ?? 0;
  const comCents = (status: string) => commissions.find((row) => row.status === status)?._sum.amountCents ?? 0;
  const affiliate = {
    referrals: referrals.reduce((sum, row) => sum + row._count._all, 0),
    converted: refCount("CONVERTED"),
    commissionLockedCents: comCents("LOCKED"),
    commissionAvailableCents: comCents("AVAILABLE"),
    commissionPaidCents: comCents("CASHED_OUT"),
    payoutsRequested: payoutsRequested._count._all,
    payoutsRequestedCents: payoutsRequested._sum.amountCents ?? 0,
  };

  // ── profit ───────────────────────────────────────────────────────────────
  const aiCents = Math.round(aiMicros / 10_000);
  const grossProfitCents = afterFeesCents - aiCents - affiliate.commissionPaidCents;
  const marginPercent = afterFeesCents > 0 ? Math.round((grossProfitCents / afterFeesCents) * 100) : 0;

  const fb = (rating: number) => feedback7d.find((row) => row.rating === rating)?._count._all ?? 0;

  return {
    range,
    since: since?.toISOString() ?? null,
    users: {
      total: totalUsers,
      newInRange: newUsers,
      active7d,
      active30d,
      blocked,
      admins,
      signupsByDay: fillDays(since, signupPoints),
    },
    plans: { byTier, trialing, pastDue, cancelling, mrrUsd: Math.round(mrrUsd * 100) / 100 },
    revenue: {
      grossCents,
      refundedCents,
      netCents,
      afterFeesCents,
      payments: paymentCount,
      topUpCents,
      byDay: fillDays(since, revenuePoints),
    },
    costs: {
      aiMicros,
      calls: usageAgg._count._all,
      failedCalls: usageFailed,
      byModel: usageByModel
        .map((row) => ({ model: row.model, calls: row._count._all, costMicros: row._sum.costMicros ?? 0 }))
        .sort((a, b) => b.costMicros - a.costMicros),
      byFeature: usageByFeature
        .map((row) => ({ feature: row.feature, calls: row._count._all, costMicros: row._sum.costMicros ?? 0 }))
        .sort((a, b) => b.costMicros - a.costMicros),
      byDayMicros: fillDays(since, costPoints),
    },
    credits,
    affiliate,
    profit: { grossProfitCents, marginPercent },
    health: {
      openErrors,
      errors24h,
      unprocessedWebhooks,
      unattributedCalls: unattributed,
      feedbackDown7d: fb(-1),
      feedbackUp7d: fb(1),
      pendingPayouts: payoutsRequested._count._all,
    },
  };
}
