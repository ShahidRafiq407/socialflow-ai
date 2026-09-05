// ============================================================================
// ADMIN — USERS
//
// The list and the detail view. The list is one query with the joins the table
// needs (plan, balance, workspaces, last seen); the detail view is everything
// known about one account, assembled from the billing, usage, affiliate and
// admin tables. Nothing here mutates — mutations are in actions/admin.ts so
// they can be audited.
// ============================================================================

import prisma from "@/lib/db";
import { clerkClient } from "@clerk/nextjs/server";
import { getPlanContext, effectivePlanFor, STALE_PERIOD_GRACE_MS } from "@/lib/billing/entitlements";
import { getWalletBalance, getLedgerEntries, type LedgerEntry, type WalletBalance } from "@/lib/billing/wallet";
import { getUsageTotals, getUsageByFeature, getUsageByModel, type UsageTotals } from "@/lib/billing/meter";
import type { PlanTier } from "@/lib/billing/plans";
import { ensureAdminSchema } from "./schema";
import { listAudit, type AuditRow } from "./audit";

/** What Clerk knows about an account, once it has been reconciled. */
interface HealedProfile {
  email: string;
  name: string | null;
  avatar: string | null;
}

/**
 * Reconciles local database user rows that have placeholder emails or missing
 * profile info with their authoritative Clerk profile. Updates the database
 * permanently so search, filtering, and table displays show real user data.
 *
 * Returns what it wrote, keyed by user id, so the caller can patch rows it
 * already has in hand instead of re-reading each one.
 */
async function healPlaceholderAccounts(userIds: string[]): Promise<Map<string, HealedProfile>> {
  const healed = new Map<string, HealedProfile>();
  if (userIds.length === 0) return healed;
  try {
    const candidates = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true, avatar: true },
    });
    if (candidates.length === 0) return healed;

    const clerk = await clerkClient();
    await Promise.allSettled(
      candidates.map(async (c) => {
        try {
          const clerkUser = await clerk.users.getUser(c.id);
          const realEmail = clerkUser?.emailAddresses?.[0]?.emailAddress;
          const realName = clerkUser?.firstName
            ? `${clerkUser.firstName} ${clerkUser.lastName || ""}`.trim()
            : null;
          const realAvatar = clerkUser?.imageUrl || null;

          const next: HealedProfile = {
            email: realEmail || c.email,
            name: realName ?? c.name,
            avatar: realAvatar ?? c.avatar,
          };
          const changed =
            next.email !== c.email || next.name !== c.name || next.avatar !== c.avatar;
          if (!changed) return;

          await prisma.user
            .update({
              where: { id: c.id },
              data: {
                ...(realEmail ? { email: realEmail } : {}),
                ...(realName ? { name: realName } : {}),
                ...(realAvatar ? { avatar: realAvatar } : {}),
              },
            })
            .catch(() => {});
          healed.set(c.id, next);
        } catch {
          // Non-fatal if Clerk user was deleted or lookup fails
        }
      })
    );
  } catch (err) {
    // Non-fatal if Clerk client is unavailable
    console.warn("[admin-users] healPlaceholderAccounts error:", err);
  }
  return healed;
}

export type UserSort = "newest" | "oldest" | "lastSeen" | "spend" | "balance";

export interface UserListQuery {
  q?: string;
  plan?: PlanTier | "ALL";
  status?: "ALL" | "ACTIVE" | "BLOCKED" | "ADMIN";
  sort?: UserSort;
  page?: number;
  pageSize?: number;
}

export interface UserListRow {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  lastSeenAt: string | null;
  blockedAt: string | null;
  plan: PlanTier;
  subscriptionStatus: string;
  balance: number;
  lifetimeSpent: number;
  workspaces: number;
  referredBy: string | null;
}

export interface UserListResult {
  rows: UserListRow[];
  total: number;
  page: number;
  pageSize: number;
  /** True when a computed sort had to stop counting; the UI can say so. */
  truncated?: boolean;
}

/** Ordering by a value the database cannot sort on reads at most this many rows. */
const COMPUTED_SORT_LIMIT = 20_000;

/**
 * The subscription shapes that currently grant a trial, expressed as a Prisma
 * filter. Mirrors the TRIALING branch of `effectivePlanFor`.
 */
function trialGrantingFilter(now: Date, excludeTestMode: boolean) {
  return {
    status: "TRIALING",
    ...(excludeTestMode ? { testMode: false } : {}),
    OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: now } }],
  };
}

/**
 * The subscription shapes that currently grant a paid tier. Mirrors the ACTIVE /
 * PAST_DUE / CANCELLED branches of `effectivePlanFor`, including the seven-day
 * grace a renewal webhook gets to land in.
 */
function paidGrantingFilter(now: Date, excludeTestMode: boolean, plan?: PlanTier) {
  return {
    plan: plan ? { equals: plan } : { in: ["GO", "PRO", "AGENCY"] },
    ...(excludeTestMode ? { testMode: false } : {}),
    OR: [
      {
        status: { in: ["ACTIVE", "PAST_DUE"] },
        periodEnd: { gt: new Date(now.getTime() - STALE_PERIOD_GRACE_MS) },
      },
      {
        status: "CANCELLED",
        OR: [{ endsAt: { gt: now } }, { endsAt: null, periodEnd: { gt: now } }],
      },
    ],
  };
}

/** Any subscription that grants something other than Free right now. */
function anyGrantingFilter(now: Date, excludeTestMode: boolean) {
  return { OR: [trialGrantingFilter(now, excludeTestMode), paidGrantingFilter(now, excludeTestMode)] };
}

export async function listUsers(query: UserListQuery = {}): Promise<UserListResult> {
  await ensureAdminSchema();

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, query.pageSize ?? 25));
  const q = (query.q ?? "").trim();
  const now = new Date();
  // A test-store subscription is free to anyone who finds the checkout link, so
  // in production it grants nothing — the filter has to agree with entitlements.
  const excludeTestMode = process.env.NODE_ENV === "production";

  // Every clause is ANDed. Writing `where.OR` twice (once for search, once for
  // the Free filter) silently dropped the search, so "Free accounts matching
  // acme" listed every Free account instead.
  const clauses: Record<string, unknown>[] = [];
  if (q) {
    clauses.push({
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { id: { equals: q } },
        { referralCode: { equals: q.toUpperCase() } },
      ],
    });
  }
  if (query.status === "BLOCKED") clauses.push({ blockedAt: { not: null } });
  if (query.status === "ACTIVE") clauses.push({ blockedAt: null });
  if (query.status === "ADMIN") clauses.push({ role: "ADMIN" });

  if (query.plan && query.plan !== "ALL") {
    if (query.plan === "FREE") {
      // The exact complement of "grants something", so the buckets partition and
      // a lapsed paid account lands here instead of nowhere.
      clauses.push({
        OR: [
          { subscription: { is: null } },
          { subscription: { NOT: anyGrantingFilter(now, excludeTestMode) } },
        ],
      });
    } else if (query.plan === "TRIAL") {
      clauses.push({ subscription: trialGrantingFilter(now, excludeTestMode) });
    } else {
      clauses.push({ subscription: paidGrantingFilter(now, excludeTestMode, query.plan) });
    }
  }

  const where: Record<string, unknown> = clauses.length > 0 ? { AND: clauses } : {};

  const orderBy =
    query.sort === "oldest"
      ? { createdAt: "asc" as const }
      : query.sort === "lastSeen"
        ? { lastSeenAt: { sort: "desc" as const, nulls: "last" as const } }
        : { createdAt: "desc" as const };

  // `balance` is grantBalance + topUpBalance, which no column holds, and both
  // money sorts have to put accounts with no wallet row last rather than first
  // (a LEFT JOIN NULL sorts first on DESC in Postgres). Both are computed here.
  const computedSort = query.sort === "balance" || query.sort === "spend" ? query.sort : null;

  const selection = {
    id: true,
    email: true,
    name: true,
    avatar: true,
    role: true,
    createdAt: true,
    lastSeenAt: true,
    blockedAt: true,
    subscription: {
      select: {
        plan: true,
        status: true,
        periodEnd: true,
        trialEndsAt: true,
        endsAt: true,
        testMode: true,
      },
    },
    creditWallet: { select: { grantBalance: true, topUpBalance: true, lifetimeSpent: true } },
    referral: { select: { referrer: { select: { email: true } } } },
    _count: { select: { workspaces: true } },
  } as const;

  try {
    // When the sort key is something no column holds, rank ids in memory first
    // and let the page query fetch exactly those; otherwise Postgres orders and
    // pages as usual.
    let pageIds: string[] | null = null;
    let rankedTotal: number | null = null;
    let truncated = false;

    if (computedSort) {
      const scored = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: COMPUTED_SORT_LIMIT + 1,
        select: {
          id: true,
          creditWallet: { select: { grantBalance: true, topUpBalance: true, lifetimeSpent: true } },
        },
      });
      truncated = scored.length > COMPUTED_SORT_LIMIT;
      if (truncated) {
        console.warn(
          `[admin-users] "${computedSort}" sort ranked the newest ${COMPUTED_SORT_LIMIT} matches only.`
        );
      }
      const ranked = scored.slice(0, COMPUTED_SORT_LIMIT);
      const keyOf = (r: (typeof ranked)[number]) =>
        computedSort === "balance"
          ? (r.creditWallet?.grantBalance ?? 0) + (r.creditWallet?.topUpBalance ?? 0)
          : (r.creditWallet?.lifetimeSpent ?? 0);
      // No wallet row means nothing granted and nothing spent, which belongs at
      // the bottom of "most" — not at the top, where a LEFT JOIN NULL lands.
      ranked.sort((a, b) => {
        const byKey = keyOf(b) - keyOf(a);
        if (byKey !== 0) return byKey;
        const aHas = a.creditWallet ? 1 : 0;
        const bHas = b.creditWallet ? 1 : 0;
        return bHas - aHas || a.id.localeCompare(b.id);
      });

      rankedTotal = truncated ? null : ranked.length;
      pageIds = ranked.slice((page - 1) * pageSize, page * pageSize).map((r) => r.id);
    }

    const [total, fetched] = await Promise.all([
      rankedTotal ?? prisma.user.count({ where }),
      pageIds
        ? prisma.user.findMany({ where: { id: { in: pageIds } }, select: selection })
        : prisma.user.findMany({
            where,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: selection,
          }),
    ]);

    let rows = fetched;
    if (pageIds) {
      const byId = new Map(fetched.map((r) => [r.id, r]));
      rows = pageIds.map((id) => byId.get(id)).filter((r): r is (typeof fetched)[number] => !!r);
    }

    // Reconcile only what this page shows, and only when it looks unreconciled.
    // The old code walked up to 50 accounts through Clerk before the list query
    // even ran, on every render, and then re-read each healed row one at a time.
    const needsHeal = rows.filter((r) => r.email.includes("@placeholder") || !r.name);
    if (needsHeal.length > 0) {
      const healed = await healPlaceholderAccounts(needsHeal.map((r) => r.id));
      for (const row of rows) {
        const fresh = healed.get(row.id);
        if (!fresh) continue;
        row.email = fresh.email;
        row.name = fresh.name;
        row.avatar = fresh.avatar;
      }
    }

    return {
      total,
      page,
      pageSize,
      ...(truncated ? { truncated } : {}),
      rows: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        blockedAt: row.blockedAt?.toISOString() ?? null,
        // The same decision the dashboard and the entitlements make, so a lapsed
        // account cannot read as paying here and Free there.
        plan: effectivePlanFor(row.subscription, now),
        subscriptionStatus: row.subscription?.status ?? "NONE",
        balance: (row.creditWallet?.grantBalance ?? 0) + (row.creditWallet?.topUpBalance ?? 0),
        lifetimeSpent: row.creditWallet?.lifetimeSpent ?? 0,
        workspaces: row._count.workspaces,
        referredBy: row.referral?.referrer?.email ?? null,
      })),
    };
  } catch (err) {
    console.error("[admin-users] list failed", err);
    return { rows: [], total: 0, page, pageSize };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────────────────────

export interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  blockedBy: string | null;
  adminNotes: string | null;
  referralCode: string | null;

  plan: {
    effective: PlanTier;
    stored: PlanTier;
    status: string;
    cycle: string;
    periodStart: string;
    periodEnd: string;
    trialEndsAt: string | null;
    endsAt: string | null;
    cancelAtPeriodEnd: boolean;
    lsCustomerId: string | null;
    lsSubscriptionId: string | null;
    testMode: boolean;
    portalUrl: string | null;
  } | null;

  wallet: WalletBalance;
  ledger: LedgerEntry[];
  usage30d: UsageTotals;
  usageByFeature: Array<{ feature: string; calls: number; costMicros: number }>;
  usageByModel: Array<{ model: string; calls: number; costMicros: number }>;
  featureUsage: Array<{ feature: string; used: number; periodStart: string; periodEnd: string }>;

  workspaces: Array<{
    id: string;
    name: string;
    industry: string | null;
    createdAt: string;
    socialAccounts: number;
    posts: number;
    chatSessions: number;
    articleRuns: number;
  }>;

  payments: Array<{
    id: string;
    eventName: string;
    amountCents: number | null;
    currency: string | null;
    plan: string | null;
    status: string | null;
    processed: boolean;
    error: string | null;
    testMode: boolean;
    createdAt: string;
  }>;

  affiliate: {
    referredBy: { id: string; email: string } | null;
    referralStatus: string | null;
    referralsMade: number;
    converted: number;
    commissionCents: { locked: number; available: number; paid: number; rejected: number };
    payouts: Array<{ id: string; amountCents: number; method: string; status: string; createdAt: string; paidAt: string | null }>;
  };

  trialClaims: Array<{ id: string; decision: string; reason: string | null; riskScore: number; riskFlags: string[]; createdAt: string }>;
  notifications: Array<{ id: string; tone: string; title: string; body: string | null; readAt: string | null; createdAt: string; sentBy: string | null }>;
  feedback: Array<{ id: string; rating: number; comment: string | null; model: string | null; messageExcerpt: string | null; createdAt: string }>;
  audit: AuditRow[];
}

export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  await ensureAdminSchema();
  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        referral: { select: { status: true, referrer: { select: { id: true, email: true } } } },
        workspaces: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            industry: true,
            createdAt: true,
            _count: { select: { socialAccounts: true, posts: true, chatSessions: true, articleRuns: true } },
          },
        },
        billingEvents: { orderBy: { createdAt: "desc" }, take: 50 },
        trialClaims: { orderBy: { createdAt: "desc" }, take: 10 },
        notifications: { orderBy: { createdAt: "desc" }, take: 30 },
        chatFeedback: { orderBy: { createdAt: "desc" }, take: 30 },
        payouts: { orderBy: { createdAt: "desc" }, take: 30 },
        featureUsage: { orderBy: { periodStart: "desc" }, take: 30 },
        _count: { select: { referralsMade: true } },
      },
    })
    .catch(() => null);
  if (!user) return null;

  if (user.email.includes("@placeholder") || !user.name || !user.avatar) {
    const fresh = (await healPlaceholderAccounts([userId])).get(userId);
    if (fresh) {
      user.email = fresh.email;
      user.name = fresh.name;
      user.avatar = fresh.avatar;
    }
  }

  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [ctx, wallet, ledger, usage30d, usageByFeature, usageByModel, commissions, converted, audit] = await Promise.all([
    getPlanContext(userId),
    getWalletBalance(userId),
    getLedgerEntries(userId, 100),
    getUsageTotals(userId, since30),
    getUsageByFeature(userId, since30),
    getUsageByModel(userId, since30),
    prisma.commission.groupBy({ by: ["status"], where: { referrerId: userId }, _sum: { amountCents: true } }).catch(() => []),
    prisma.referral.count({ where: { referrerId: userId, status: "CONVERTED" } }).catch(() => 0),
    listAudit(50, userId),
  ]);

  const com = (status: string) =>
    (commissions as Array<{ status: string; _sum: { amountCents: number | null } }>).find((c) => c.status === status)?._sum
      .amountCents ?? 0;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    blockedAt: user.blockedAt?.toISOString() ?? null,
    blockedReason: user.blockedReason,
    blockedBy: user.blockedBy,
    adminNotes: user.adminNotes,
    referralCode: user.referralCode,

    plan: user.subscription
      ? {
          effective: ctx.plan,
          stored: user.subscription.plan as PlanTier,
          status: user.subscription.status,
          cycle: user.subscription.cycle,
          periodStart: user.subscription.periodStart.toISOString(),
          periodEnd: user.subscription.periodEnd.toISOString(),
          trialEndsAt: user.subscription.trialEndsAt?.toISOString() ?? null,
          endsAt: user.subscription.endsAt?.toISOString() ?? null,
          cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
          lsCustomerId: user.subscription.lsCustomerId,
          lsSubscriptionId: user.subscription.lsSubscriptionId,
          testMode: user.subscription.testMode,
          portalUrl: user.subscription.portalUrl,
        }
      : null,

    wallet,
    ledger,
    usage30d,
    usageByFeature,
    usageByModel,
    featureUsage: user.featureUsage.map((row) => ({
      feature: row.feature,
      used: row.used,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
    })),

    workspaces: user.workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      industry: ws.industry,
      createdAt: ws.createdAt.toISOString(),
      socialAccounts: ws._count.socialAccounts,
      posts: ws._count.posts,
      chatSessions: ws._count.chatSessions,
      articleRuns: ws._count.articleRuns,
    })),

    payments: user.billingEvents.map((event) => ({
      id: event.id,
      eventName: event.eventName,
      amountCents: event.amountCents,
      currency: event.currency,
      plan: event.plan,
      status: event.status,
      processed: event.processed,
      error: event.error,
      testMode: event.testMode,
      createdAt: event.createdAt.toISOString(),
    })),

    affiliate: {
      referredBy: user.referral?.referrer ?? null,
      referralStatus: user.referral?.status ?? null,
      referralsMade: user._count.referralsMade,
      converted,
      commissionCents: {
        locked: com("LOCKED"),
        available: com("AVAILABLE"),
        paid: com("CASHED_OUT"),
        rejected: com("REJECTED"),
      },
      payouts: user.payouts.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    },

    trialClaims: user.trialClaims.map((claim) => ({
      id: claim.id,
      decision: claim.decision,
      reason: claim.reason,
      riskScore: claim.riskScore,
      riskFlags: claim.riskFlags,
      createdAt: claim.createdAt.toISOString(),
    })),
    notifications: user.notifications.map((n) => ({
      id: n.id,
      tone: n.tone,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      sentBy: n.sentBy,
    })),
    feedback: user.chatFeedback.map((f) => ({
      id: f.id,
      rating: f.rating,
      comment: f.comment,
      model: f.model,
      messageExcerpt: f.messageExcerpt,
      createdAt: f.createdAt.toISOString(),
    })),
    audit,
  };
}
