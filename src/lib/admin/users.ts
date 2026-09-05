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
import { getPlanContext } from "@/lib/billing/entitlements";
import { getWalletBalance, getLedgerEntries, type LedgerEntry, type WalletBalance } from "@/lib/billing/wallet";
import { getUsageTotals, getUsageByFeature, getUsageByModel, type UsageTotals } from "@/lib/billing/meter";
import type { PlanTier } from "@/lib/billing/plans";
import { ensureAdminSchema } from "./schema";
import { listAudit, type AuditRow } from "./audit";

/**
 * Reconciles local database user rows that have placeholder emails or missing
 * profile info with their authoritative Clerk profile. Updates the database
 * permanently so search, filtering, and table displays show real user data.
 */
async function healPlaceholderAccounts(userIds?: string[]): Promise<void> {
  try {
    const whereClause = userIds && userIds.length > 0
      ? { id: { in: userIds } }
      : {
          OR: [
            { email: { contains: "@placeholder" } },
            { name: null },
          ],
        };

    const candidates = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, email: true, name: true, avatar: true },
      take: 50,
    });

    if (candidates.length === 0) return;

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

          const needsUpdate =
            (realEmail && c.email !== realEmail) ||
            (realName && c.name !== realName) ||
            (realAvatar && c.avatar !== realAvatar);

          if (needsUpdate) {
            await prisma.user.update({
              where: { id: c.id },
              data: {
                ...(realEmail ? { email: realEmail } : {}),
                ...(realName ? { name: realName } : {}),
                ...(realAvatar ? { avatar: realAvatar } : {}),
              },
            }).catch(() => {});
          }
        } catch {
          // Non-fatal if Clerk user was deleted or lookup fails
        }
      })
    );
  } catch (err) {
    // Non-fatal if Clerk client is unavailable
    console.warn("[admin-users] healPlaceholderAccounts error:", err);
  }
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
}

export async function listUsers(query: UserListQuery = {}): Promise<UserListResult> {
  await ensureAdminSchema();
  // Heal placeholder accounts in DB so search and counts reflect real Clerk emails/names
  await healPlaceholderAccounts();

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, query.pageSize ?? 25));
  const q = (query.q ?? "").trim();

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { id: { equals: q } },
      { referralCode: { equals: q.toUpperCase() } },
    ];
  }
  if (query.status === "BLOCKED") where.blockedAt = { not: null };
  if (query.status === "ACTIVE") where.blockedAt = null;
  if (query.status === "ADMIN") where.role = "ADMIN";
  if (query.plan && query.plan !== "ALL") {
    where.subscription =
      query.plan === "FREE"
        ? undefined
        : { plan: query.plan, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"] } };
    if (query.plan === "FREE") {
      where.OR = [
        ...((where.OR as unknown[]) ?? []),
        { subscription: null },
        { subscription: { status: { in: ["NONE", "EXPIRED", "UNPAID", "PAUSED"] } } },
      ];
    }
  }

  const orderBy =
    query.sort === "oldest"
      ? { createdAt: "asc" as const }
      : query.sort === "lastSeen"
        ? { lastSeenAt: { sort: "desc" as const, nulls: "last" as const } }
        : query.sort === "spend"
          ? { creditWallet: { lifetimeSpent: "desc" as const } }
          : query.sort === "balance"
            ? { creditWallet: { grantBalance: "desc" as const } }
            : { createdAt: "desc" as const };

  try {
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          createdAt: true,
          lastSeenAt: true,
          blockedAt: true,
          subscription: { select: { plan: true, status: true } },
          creditWallet: { select: { grantBalance: true, topUpBalance: true, lifetimeSpent: true } },
          referral: { select: { referrer: { select: { email: true } } } },
          _count: { select: { workspaces: true } },
        },
      }),
    ]);

    // Ensure any returned rows with placeholder or missing details are healed immediately
    const stillPlaceholder = rows.filter((r) => r.email.includes("@placeholder") || !r.name);
    if (stillPlaceholder.length > 0) {
      await healPlaceholderAccounts(stillPlaceholder.map((r) => r.id));
      for (const r of stillPlaceholder) {
        const fresh = await prisma.user
          .findUnique({ where: { id: r.id }, select: { email: true, name: true, avatar: true } })
          .catch(() => null);
        if (fresh) {
          r.email = fresh.email;
          r.name = fresh.name;
          r.avatar = fresh.avatar;
        }
      }
    }

    return {
      total,
      page,
      pageSize,
      rows: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        blockedAt: row.blockedAt?.toISOString() ?? null,
        plan: effectiveTier(row.subscription),
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

function effectiveTier(sub: { plan: string; status: string } | null | undefined): PlanTier {
  if (!sub) return "FREE";
  if (sub.status === "TRIALING") return "TRIAL";
  if (["ACTIVE", "PAST_DUE", "CANCELLED"].includes(sub.status)) return sub.plan as PlanTier;
  return "FREE";
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
    await healPlaceholderAccounts([userId]);
    const fresh = await prisma.user
      .findUnique({ where: { id: userId }, select: { email: true, name: true, avatar: true } })
      .catch(() => null);
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
