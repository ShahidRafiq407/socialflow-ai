// ============================================================================
// NOTIFICATIONS — SERVER ACTION
//
// The bell used to show a hardcoded "All Systems Operational" row and a red dot
// that never went away. This derives the list from what actually happened in the
// caller's active workspace: failed publishes first, then things that need a
// decision, then receipts, then setup gaps.
//
// No new table: "read" state is a timestamp the client keeps per workspace, and
// every item carries `at` so the unread count is a comparison, not a counter
// that can drift.
// ============================================================================

"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { resolveActiveWorkspaceId } from "@/lib/workspace/active";

export type NotificationTone = "error" | "warning" | "success" | "info";

export interface NotificationItem {
  id: string;
  tone: NotificationTone;
  title: string;
  body: string;
  href: string;
  /** ISO timestamp the event happened, or null for standing setup advice. */
  at: string | null;
}

export interface NotificationFeed {
  items: NotificationItem[];
  /** Items with a timestamp — the only ones that can be "new". */
  latestAt: string | null;
}

const LOOKBACK_DAYS = 7;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getNotifications(): Promise<NotificationFeed> {
  const { userId } = await auth();
  if (!userId) return { items: [], latestAt: null };

  const workspaceId = await resolveActiveWorkspaceId(userId);
  if (!workspaceId) return { items: [], latestAt: null };

  const since = daysAgo(LOOKBACK_DAYS);
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [failedLogs, publishedLogs, pending, nextScheduled, blockedRuns, leads, expiring, workspace, accountCount] =
    await Promise.all([
      prisma.publishLog
        .findMany({
          where: { workspaceId, status: "FAILED", publishedAt: { gte: since } },
          select: { id: true, platform: true, error: true, excerpt: true, publishedAt: true },
          orderBy: { publishedAt: "desc" },
          take: 5,
        })
        .catch(() => []),
      prisma.publishLog
        .findMany({
          where: { workspaceId, status: "PUBLISHED", publishedAt: { gte: since } },
          select: { id: true, platform: true, topic: true, excerpt: true, liveUrl: true, publishedAt: true },
          orderBy: { publishedAt: "desc" },
          take: 4,
        })
        .catch(() => []),
      prisma.post
        .count({ where: { workspaceId, status: "PENDING_APPROVAL" } })
        .catch(() => 0),
      prisma.post
        .findFirst({
          where: { workspaceId, status: "SCHEDULED", scheduledFor: { not: null } },
          select: { id: true, platform: true, scheduledFor: true },
          orderBy: { scheduledFor: "asc" },
        })
        .catch(() => null),
      prisma.articleRun
        .findMany({
          where: { workspaceId, status: { in: ["blocked", "failed"] }, updatedAt: { gte: since } },
          select: { id: true, status: true, blockedReason: true, blockedBy: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 3,
        })
        .catch(() => []),
      prisma.leadEvent
        .count({ where: { workspaceId, occurredAt: { gte: since } } })
        .catch(() => 0),
      prisma.socialAccount
        .findMany({
          where: { workspaceId, tokenExpiresAt: { not: null, lte: soon } },
          select: { id: true, platform: true, handle: true, tokenExpiresAt: true },
          take: 5,
        })
        .catch(() => []),
      prisma.workspace
        .findUnique({
          where: { id: workspaceId },
          select: { name: true, trackingKey: true, brandDNA: { select: { tone: true } } },
        })
        .catch(() => null),
      prisma.socialAccount.count({ where: { workspaceId } }).catch(() => 0),
    ]);

  const items: NotificationItem[] = [];

  for (const log of failedLogs) {
    items.push({
      id: `publish-failed-${log.id}`,
      tone: "error",
      title: `${log.platform} publish failed`,
      body: (log.error || log.excerpt || "The platform rejected this post.").slice(0, 180),
      href: "/dashboard/content",
      at: log.publishedAt.toISOString(),
    });
  }

  for (const run of blockedRuns) {
    items.push({
      id: `article-${run.status}-${run.id}`,
      tone: run.status === "failed" ? "error" : "warning",
      title: run.status === "failed" ? "Article run failed" : `Article run blocked at ${run.blockedBy || "a gate"}`,
      body: (run.blockedReason || "Open the Article Writer to see what it is waiting on.").slice(0, 180),
      href: "/dashboard/article-writer",
      at: run.updatedAt.toISOString(),
    });
  }

  for (const account of expiring) {
    const expired = account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= Date.now();
    items.push({
      id: `token-${account.id}`,
      tone: expired ? "error" : "warning",
      title: `${account.platform} ${expired ? "needs reconnecting" : "access expires soon"}`,
      body: expired
        ? `Publishing to ${account.handle || account.platform} will fail until you reconnect it.`
        : `The access token for ${account.handle || account.platform} expires within a week.`,
      href: "/dashboard/integrations",
      at: account.tokenExpiresAt ? account.tokenExpiresAt.toISOString() : null,
    });
  }

  if (pending > 0) {
    items.push({
      id: "pending-approval",
      tone: "warning",
      title: `${pending} post${pending === 1 ? "" : "s"} waiting for approval`,
      body: "Nothing goes live until you approve or reject them.",
      href: "/dashboard/content",
      at: null,
    });
  }

  if (nextScheduled?.scheduledFor) {
    items.push({
      id: `scheduled-${nextScheduled.id}`,
      tone: "info",
      title: `Next post goes live on ${nextScheduled.platform}`,
      body: nextScheduled.scheduledFor.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      href: "/dashboard/content",
      at: null,
    });
  }

  if (leads > 0) {
    items.push({
      id: "leads-week",
      tone: "success",
      title: `${leads} lead${leads === 1 ? "" : "s"} captured this week`,
      body: "Open Lead Goal to see where they came from.",
      href: "/dashboard/goals",
      at: null,
    });
  }

  for (const log of publishedLogs) {
    items.push({
      id: `published-${log.id}`,
      tone: "success",
      title: `Published to ${log.platform}`,
      body: (log.topic || log.excerpt || "").slice(0, 180),
      href: log.liveUrl || "/dashboard/analytics",
      at: log.publishedAt.toISOString(),
    });
  }

  if (accountCount === 0) {
    items.push({
      id: "setup-accounts",
      tone: "info",
      title: "No social accounts connected yet",
      body: "Connect a platform so posts can actually be published.",
      href: "/dashboard/integrations",
      at: null,
    });
  }

  if (workspace && !workspace.brandDNA?.tone) {
    items.push({
      id: "setup-brand",
      tone: "info",
      title: "Brand DNA is incomplete",
      body: "Set a tone of voice so generated content sounds like you.",
      href: "/dashboard/brand",
      at: null,
    });
  }

  if (workspace && !workspace.trackingKey) {
    items.push({
      id: "setup-tracking",
      tone: "info",
      title: "Website tag not installed",
      body: "Install it to attribute website leads to the posts that earned them.",
      href: "/dashboard/plugins",
      at: null,
    });
  }

  return {
    items,
    latestAt:
      items.reduce<string | null>(
        (latest, item) => (item.at && (!latest || item.at > latest) ? item.at : latest),
        null
      ) ?? null,
  };
}


