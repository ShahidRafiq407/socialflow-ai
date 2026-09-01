"use server";

import prisma from "@/lib/db";
import { COUNTED_LEAD_STATUSES, getGrowthMetrics } from "@/lib/growth/metrics";

/**
 * Workspace analytics — REAL MEASURED DATA ONLY.
 *
 * Every number in the returned payload is counted from a database row:
 *   - LinkClick      → clicks (and unique clicks)
 *   - LeadEvent      → leads (only CONFIRMED / QUALIFIED / WON count)
 *   - PublishLog     → what actually went out (posts, articles, failures)
 *   - TrackedLink    → per-post click / lead totals
 *   - GrowthGoal     → the user's own target and window
 *
 * Nothing here is estimated, extrapolated, or invented. When the database is
 * unreachable the payload comes back empty (zeros / empty arrays) so the UI
 * shows its honest "no data yet" state instead of a fake dashboard.
 */

/** Longest window the UI can request (days). The series covers this span. */
const ANALYTICS_WINDOW_DAYS = 90;

export interface AnalyticsSeriesPoint {
  /** UTC day bucket, `YYYY-MM-DD` */
  date: string;
  /** Preformatted label, e.g. "Sep 1" — deterministic, no locale drift */
  label: string;
  clicks: number;
  leads: number;
  published: number;
}

export interface PlatformAnalyticsRow {
  /** Canonical key, e.g. "instagram" */
  key: string;
  label: string;
  connected: boolean;
  published: number;
  clicks: number;
  leads: number;
  conversionRate: number | null;
}

export interface PostPerformanceRow {
  id: string;
  channel: string;
  platform: string;
  format: string | null;
  status: string;
  excerpt: string;
  topic: string | null;
  liveUrl: string | null;
  publishedAt: string;
  clicks: number;
  leads: number;
}

export interface LeadStatusRow {
  status: string;
  count: number;
}

export interface AnalyticsTotals {
  clicks: number;
  uniqueClicks: number;
  leads: number;
  socialLeads: number;
  websiteLeads: number;
  manualLeads: number;
  postsPublished: number;
  articlesPublished: number;
  publishFailures: number;
}

export interface AnalyticsPipeline {
  pendingApproval: number;
  approved: number;
  scheduled: number;
  failed: number;
  articles: number;
  mediaAssets: number;
  chatSessions: number;
  activeAutomations: number;
  connectedPlatforms: number;
}

export interface WorkspaceAnalyticsData {
  workspaceName: string;
  industry: string;
  generatedAt: string;
  windowDays: number;
  goal: {
    leadTarget: number;
    leadsAchieved: number;
    leadType: string;
    daysElapsed: number;
    daysTotal: number;
  } | null;
  totals: AnalyticsTotals;
  series: AnalyticsSeriesPoint[];
  leadStatuses: LeadStatusRow[];
  platforms: PlatformAnalyticsRow[];
  posts: PostPerformanceRow[];
  pipeline: AnalyticsPipeline;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  twitter: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  website: "Website",
  threads: "Threads",
  reddit: "Reddit",
};

/** Canonical platform key from any stored spelling ("Instagram Reel" → "instagram"). */
function platformKey(raw: string): string {
  const p = String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!p) return "";
  if (p.includes("instagram") || p.includes("ig")) return "instagram";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("facebook") || p === "fb") return "facebook";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("youtube") || p === "yt") return "youtube";
  if (p.includes("pinterest")) return "pinterest";
  if (p.includes("website") || p.includes("wordpress")) return "website";
  if (p === "x" || p.includes("twitter")) return "x";
  if (p.includes("threads")) return "threads";
  if (p.includes("reddit")) return "reddit";
  return p;
}

function platformLabel(raw: string): string {
  const key = platformKey(raw);
  if (PLATFORM_LABELS[key]) return PLATFORM_LABELS[key];
  return String(raw || "").trim() || "Unknown";
}

function dayKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(dateKey: string): string {
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  return `${MONTHS[month - 1] || "?"} ${day}`;
}

function emptyPayload(windowDays: number): WorkspaceAnalyticsData {
  return {
    workspaceName: "",
    industry: "",
    generatedAt: new Date().toISOString(),
    windowDays,
    goal: null,
    totals: {
      clicks: 0,
      uniqueClicks: 0,
      leads: 0,
      socialLeads: 0,
      websiteLeads: 0,
      manualLeads: 0,
      postsPublished: 0,
      articlesPublished: 0,
      publishFailures: 0,
    },
    series: [],
    leadStatuses: [],
    platforms: [],
    posts: [],
    pipeline: {
      pendingApproval: 0,
      approved: 0,
      scheduled: 0,
      failed: 0,
      articles: 0,
      mediaAssets: 0,
      chatSessions: 0,
      activeAutomations: 0,
      connectedPlatforms: 0,
    },
  };
}

export async function getWorkspaceAnalytics(
  workspaceId: string
): Promise<WorkspaceAnalyticsData> {
  if (!workspaceId) return emptyPayload(ANALYTICS_WINDOW_DAYS);

  const p = prisma as any;

  try {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setUTCHours(0, 0, 0, 0);
    windowStart.setUTCDate(windowStart.getUTCDate() - (ANALYTICS_WINDOW_DAYS - 1));

    const [
      workspace,
      goal,
      clickRows,
      leadRows,
      publishRows,
      lifetimePlatformPublish,
      trackedLinkGroups,
      leadPlatformGroups,
      leadStatusGroups,
      recentLogs,
      postStatusGroups,
      articleCount,
      mediaCount,
      chatCount,
      activeAutomationCount,
    ] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, industry: true, socialAccounts: { select: { platform: true } } },
      }).catch(() => null),

      (p.growthGoal?.findFirst ? p.growthGoal.findFirst({ where: { workspaceId } }) : Promise.resolve(null)).catch(() => null),

      p.linkClick.findMany({
        where: { workspaceId, createdAt: { gte: windowStart } },
        select: { createdAt: true, isUnique: true },
      }).catch(() => []),

      p.leadEvent.findMany({
        where: {
          workspaceId,
          status: { in: COUNTED_LEAD_STATUSES },
          occurredAt: { gte: windowStart },
        },
        select: { occurredAt: true, channel: true, source: true },
      }).catch(() => []),

      p.publishLog.findMany({
        where: { workspaceId, publishedAt: { gte: windowStart } },
        select: { publishedAt: true, status: true, channel: true },
      }).catch(() => []),

      p.publishLog.groupBy({
        by: ["platform"],
        where: { workspaceId, status: "PUBLISHED", channel: "SOCIAL" },
        _count: { _all: true },
      }).catch(() => []),

      p.trackedLink.groupBy({
        by: ["platform"],
        where: { workspaceId },
        _sum: { clickCount: true, leadCount: true },
      }).catch(() => []),

      p.leadEvent.groupBy({
        by: ["platform"],
        where: { workspaceId, status: { in: COUNTED_LEAD_STATUSES } },
        _count: { _all: true },
      }).catch(() => []),

      p.leadEvent.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true },
      }).catch(() => []),

      p.publishLog.findMany({
        where: { workspaceId, status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 100,
      }).catch(() => []),

      p.post.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true },
      }).catch(() => []),

      p.contentPost.count({ where: { workspaceId } }).catch(() => 0),
      p.mediaAsset.count({ where: { workspaceId } }).catch(() => 0),
      p.chatSession.count({ where: { workspaceId } }).catch(() => 0),
      p.automationRule.count({ where: { workspaceId, isActive: true } }).catch(() => 0),
    ]);

    // ── Goal window (real, counted by the shared metrics module) ─────────────
    let goalView: WorkspaceAnalyticsData["goal"] = null;
    let goalMetrics: Awaited<ReturnType<typeof getGrowthMetrics>> | null = null;
    if (goal) {
      const start = goal.startDate ? new Date(goal.startDate) : null;
      goalMetrics = await getGrowthMetrics(
        workspaceId,
        start && !isNaN(start.getTime()) ? start : null
      ).catch(() => null);

      const daysTotal = Math.max(1, Number(goal.timeframeDays) || 1);
      const daysElapsed = start
        ? Math.max(0, Math.min(daysTotal, Math.floor((Date.now() - start.getTime()) / 86400000)))
        : 0;

      goalView = {
        leadTarget: Math.max(0, Number(goal.leadTarget) || 0),
        leadsAchieved: goalMetrics?.leads || 0,
        leadType: String(goal.leadType || "QUALIFIED_LEADS"),
        daysElapsed,
        daysTotal,
      };
    }

    // ── Daily series (90 UTC day buckets, gaps included) ─────────────────────
    const buckets = new Map<string, { clicks: number; leads: number; published: number }>();
    for (let i = 0; i < ANALYTICS_WINDOW_DAYS; i++) {
      const d = new Date(windowStart);
      d.setUTCDate(windowStart.getUTCDate() + i);
      buckets.set(dayKeyUTC(d), { clicks: 0, leads: 0, published: 0 });
    }

    for (const row of clickRows as any[]) {
      const key = dayKeyUTC(new Date(row.createdAt));
      const b = buckets.get(key);
      if (b) b.clicks += 1;
    }
    for (const row of leadRows as any[]) {
      const key = dayKeyUTC(new Date(row.occurredAt));
      const b = buckets.get(key);
      if (b) b.leads += 1;
    }
    for (const row of publishRows as any[]) {
      if (row.status !== "PUBLISHED") continue;
      const key = dayKeyUTC(new Date(row.publishedAt));
      const b = buckets.get(key);
      if (b) b.published += 1;
    }

    const series: AnalyticsSeriesPoint[] = Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({ date, label: dayLabel(date), ...v }));

    // ── Window totals (counted from the rows above) ──────────────────────────
    const totals: AnalyticsTotals = {
      clicks: clickRows.length,
      uniqueClicks: (clickRows as any[]).filter((r) => r.isUnique).length,
      leads: leadRows.length,
      socialLeads: (leadRows as any[]).filter((r) => r.channel !== "WEBSITE").length,
      websiteLeads: (leadRows as any[]).filter((r) => r.channel === "WEBSITE").length,
      manualLeads: (leadRows as any[]).filter((r) => r.source === "MANUAL").length,
      postsPublished: (publishRows as any[]).filter(
        (r) => r.status === "PUBLISHED" && r.channel !== "WEBSITE"
      ).length,
      articlesPublished: (publishRows as any[]).filter(
        (r) => r.status === "PUBLISHED" && r.channel === "WEBSITE"
      ).length,
      publishFailures: (publishRows as any[]).filter((r) => r.status === "FAILED").length,
    };

    // ── Per-platform rows (connected ∪ platforms with real activity) ─────────
    const connectedKeys = new Set<string>(
      ((workspace?.socialAccounts as any[]) || [])
        .map((a: any) => platformKey(String(a.platform || "")))
        .filter(Boolean)
    );

    const platformStats = new Map<string, { published: number; clicks: number; leads: number }>();
    const ensure = (key: string) => {
      if (!platformStats.has(key)) platformStats.set(key, { published: 0, clicks: 0, leads: 0 });
      return platformStats.get(key)!;
    };

    for (const row of lifetimePlatformPublish as any[]) {
      const key = platformKey(String(row.platform || ""));
      if (!key) continue;
      ensure(key).published += row?._count?._all || 0;
    }
    for (const row of trackedLinkGroups as any[]) {
      const key = platformKey(String(row.platform || ""));
      if (!key) continue;
      const entry = ensure(key);
      entry.clicks += row?._sum?.clickCount || 0;
      entry.leads += row?._sum?.leadCount || 0;
    }
    for (const row of leadPlatformGroups as any[]) {
      const key = platformKey(String(row.platform || ""));
      if (!key) continue;
      ensure(key).leads += row?._count?._all || 0;
    }

    const platforms: PlatformAnalyticsRow[] = Array.from(
      new Set([...connectedKeys, ...platformStats.keys()])
    )
      .map((key) => {
        const s = platformStats.get(key) || { published: 0, clicks: 0, leads: 0 };
        return {
          key,
          label: PLATFORM_LABELS[key] || key,
          connected: connectedKeys.has(key),
          published: s.published,
          clicks: s.clicks,
          leads: s.leads,
          conversionRate: s.clicks > 0 ? Number(((s.leads / s.clicks) * 100).toFixed(1)) : null,
        };
      })
      .sort((a, b) => b.leads - a.leads || b.clicks - a.clicks || b.published - a.published);

    // ── Recent post performance (real clicks + leads per published item) ─────
    const linkIds = Array.from(
      new Set((recentLogs as any[]).map((r: any) => r.trackedLinkId).filter(Boolean))
    ) as string[];
    const links = linkIds.length
      ? await p.trackedLink
          .findMany({
            where: { id: { in: linkIds } },
            select: { id: true, clickCount: true, leadCount: true },
          })
          .catch(() => [])
      : [];
    const linkMap = new Map<string, any>((links as any[]).map((l: any) => [l.id, l]));

    const posts: PostPerformanceRow[] = (recentLogs as any[]).map((r: any) => {
      const link = r.trackedLinkId ? linkMap.get(r.trackedLinkId) : null;
      return {
        id: r.id,
        channel: String(r.channel || "SOCIAL"),
        platform: platformLabel(String(r.platform || "")),
        format: r.format || null,
        status: String(r.status || "PUBLISHED"),
        excerpt: String(r.excerpt || ""),
        topic: r.topic || null,
        liveUrl: r.liveUrl || null,
        publishedAt: new Date(r.publishedAt).toISOString(),
        clicks: link?.clickCount || 0,
        leads: link?.leadCount || 0,
      };
    });

    // ── Lead status breakdown (lifetime) ─────────────────────────────────────
    const leadStatuses: LeadStatusRow[] = (leadStatusGroups as any[]).map((row: any) => ({
      status: String(row.status || "CONFIRMED"),
      count: row?._count?._all || 0,
    }));

    // ── Content pipeline (real row counts) ───────────────────────────────────
    const statusCount = (name: string) =>
      (postStatusGroups as any[]).find((g: any) => String(g.status) === name)?._count?._all || 0;

    const pipeline: AnalyticsPipeline = {
      pendingApproval: statusCount("PENDING_APPROVAL"),
      approved: statusCount("APPROVED"),
      scheduled: statusCount("SCHEDULED"),
      failed: statusCount("FAILED"),
      articles: Number(articleCount) || 0,
      mediaAssets: Number(mediaCount) || 0,
      chatSessions: Number(chatCount) || 0,
      activeAutomations: Number(activeAutomationCount) || 0,
      connectedPlatforms: connectedKeys.size,
    };

    return {
      workspaceName: String(workspace?.name || "").trim(),
      industry: String(workspace?.industry || "").trim(),
      generatedAt: new Date().toISOString(),
      windowDays: ANALYTICS_WINDOW_DAYS,
      goal: goalView,
      totals,
      series,
      leadStatuses,
      platforms,
      posts,
      pipeline,
    };
  } catch (error) {
    console.warn("[getWorkspaceAnalytics] database unreachable, returning empty analytics:", error);
    return emptyPayload(ANALYTICS_WINDOW_DAYS);
  }
}
