import prisma from "@/lib/db";
import {
  LeadChannel,
  LeadEventItem,
  PublishHistoryItem,
  TrackingStatus,
} from "@/lib/types/growth";
import { buildShortUrl, buildTagSnippet } from "@/lib/growth/ctaLinks";

/**
 * Everything in this file is COUNTED, never estimated. If a number cannot be
 * measured (organic reach, for example) it is not produced here — the UI labels
 * those separately as estimates.
 */

/** A confirmed lead is one of these. NEW/LOST are not counted toward the goal. */
export const COUNTED_LEAD_STATUSES = ["CONFIRMED", "QUALIFIED", "WON"];

/** Minimum sample before we trust the workspace's own conversion rates. */
export const MEASURED_MODE_MIN_CLICKS = 20;
export const MEASURED_MODE_MIN_LEADS = 3;
export const MEASURED_MODE_MIN_POSTS = 3;

export interface GrowthMetrics {
  /** Start of the goal window these counts cover. */
  windowStart: string | null;
  clicks: number;
  uniqueClicks: number;
  leads: number;
  socialLeads: number;
  websiteLeads: number;
  manualLeads: number;
  postsPublished: number;
  articlesPublished: number;
  publishFailures: number;

  /** Lifetime totals — used to derive conversion rates from a bigger sample. */
  lifetimeClicks: number;
  lifetimeLeads: number;
  lifetimePosts: number;

  /** True when the lifetime sample is big enough to replace benchmarks. */
  isMeasured: boolean;
}

const EMPTY_METRICS: GrowthMetrics = {
  windowStart: null,
  clicks: 0,
  uniqueClicks: 0,
  leads: 0,
  socialLeads: 0,
  websiteLeads: 0,
  manualLeads: 0,
  postsPublished: 0,
  articlesPublished: 0,
  publishFailures: 0,
  lifetimeClicks: 0,
  lifetimeLeads: 0,
  lifetimePosts: 0,
  isMeasured: false,
};

export async function getGrowthMetrics(
  workspaceId: string,
  windowStart?: Date | string | null
): Promise<GrowthMetrics> {
  const since = windowStart ? new Date(windowStart) : null;
  const inWindow = since && !isNaN(since.getTime()) ? since : null;

  try {
    const p = prisma as any;
    const leadWhere = {
      workspaceId,
      status: { in: COUNTED_LEAD_STATUSES },
      ...(inWindow ? { occurredAt: { gte: inWindow } } : {}),
    };

    const [
      clicks,
      uniqueClicks,
      leadRows,
      postsPublished,
      articlesPublished,
      publishFailures,
      lifetimeClicks,
      lifetimeLeads,
      lifetimePosts,
    ] = await Promise.all([
      p.linkClick.count({
        where: { workspaceId, ...(inWindow ? { createdAt: { gte: inWindow } } : {}) },
      }),
      p.linkClick.count({
        where: {
          workspaceId,
          isUnique: true,
          ...(inWindow ? { createdAt: { gte: inWindow } } : {}),
        },
      }),
      p.leadEvent.groupBy({
        by: ["channel", "source"],
        where: leadWhere,
        _count: { _all: true },
      }),
      p.publishLog.count({
        where: {
          workspaceId,
          status: "PUBLISHED",
          channel: "SOCIAL",
          ...(inWindow ? { publishedAt: { gte: inWindow } } : {}),
        },
      }),
      p.publishLog.count({
        where: {
          workspaceId,
          status: "PUBLISHED",
          channel: "WEBSITE",
          ...(inWindow ? { publishedAt: { gte: inWindow } } : {}),
        },
      }),
      p.publishLog.count({
        where: {
          workspaceId,
          status: "FAILED",
          ...(inWindow ? { publishedAt: { gte: inWindow } } : {}),
        },
      }),
      p.linkClick.count({ where: { workspaceId } }),
      p.leadEvent.count({ where: { workspaceId, status: { in: COUNTED_LEAD_STATUSES } } }),
      p.publishLog.count({ where: { workspaceId, status: "PUBLISHED" } }),
    ]);

    let leads = 0;
    let socialLeads = 0;
    let websiteLeads = 0;
    let manualLeads = 0;

    for (const row of leadRows as any[]) {
      const n = row?._count?._all || 0;
      leads += n;
      if (row.channel === "WEBSITE") websiteLeads += n;
      else socialLeads += n;
      if (row.source === "MANUAL") manualLeads += n;
    }

    return {
      windowStart: inWindow ? inWindow.toISOString() : null,
      clicks,
      uniqueClicks,
      leads,
      socialLeads,
      websiteLeads,
      manualLeads,
      postsPublished,
      articlesPublished,
      publishFailures,
      lifetimeClicks,
      lifetimeLeads,
      lifetimePosts,
      isMeasured:
        lifetimeClicks >= MEASURED_MODE_MIN_CLICKS &&
        lifetimeLeads >= MEASURED_MODE_MIN_LEADS &&
        lifetimePosts >= MEASURED_MODE_MIN_POSTS,
    };
  } catch (error) {
    // A missing table (before `prisma db push`) must not break the dashboard
    console.warn("[getGrowthMetrics] falling back to zeros:", error);
    return { ...EMPTY_METRICS, windowStart: inWindow ? inWindow.toISOString() : null };
  }
}

export interface PublishHistoryFilters {
  channel?: LeadChannel | "ALL";
  platform?: string | "ALL";
  status?: "PUBLISHED" | "FAILED" | "ALL";
  from?: string | Date | null;
  to?: string | Date | null;
  limit?: number;
}

/**
 * Permanent "aaj maine ye post is platform par ki" history. Read from
 * PublishLog, which is never purged, so live links survive the Post cleanup.
 */
export async function getPublishHistory(
  workspaceId: string,
  filters: PublishHistoryFilters = {}
): Promise<PublishHistoryItem[]> {
  try {
    const p = prisma as any;
    const where: any = { workspaceId };

    if (filters.channel && filters.channel !== "ALL") where.channel = filters.channel;
    if (filters.platform && filters.platform !== "ALL") where.platform = filters.platform;
    if (filters.status && filters.status !== "ALL") where.status = filters.status;
    if (filters.from || filters.to) {
      where.publishedAt = {};
      if (filters.from) where.publishedAt.gte = new Date(filters.from);
      if (filters.to) where.publishedAt.lte = new Date(filters.to);
    }

    const rows = await p.publishLog.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: Math.min(200, filters.limit || 100),
    });

    const linkIds = Array.from(
      new Set(rows.map((r: any) => r.trackedLinkId).filter(Boolean))
    ) as string[];

    const links = linkIds.length
      ? await p.trackedLink.findMany({
          where: { id: { in: linkIds } },
          select: { id: true, code: true, clickCount: true, leadCount: true },
        })
      : [];

    const linkMap = new Map<string, any>(links.map((l: any) => [l.id, l]));

    return rows.map((r: any) => {
      const link = r.trackedLinkId ? linkMap.get(r.trackedLinkId) : null;
      return {
        id: r.id,
        channel: r.channel,
        platform: r.platform,
        format: r.format,
        status: r.status,
        liveUrl: r.liveUrl,
        mediaUrl: r.mediaUrl,
        mediaType: r.mediaType,
        excerpt: r.excerpt,
        topic: r.topic,
        keyword: r.keyword,
        error: r.error,
        publishedAt: new Date(r.publishedAt).toISOString(),
        postId: r.postId,
        clicks: link?.clickCount || 0,
        leads: link?.leadCount || 0,
        shortUrl: link?.code ? buildShortUrl(link.code) : null,
        isAutopilot: Boolean(r.goalId),
      } satisfies PublishHistoryItem;
    });
  } catch (error) {
    console.warn("[getPublishHistory] returning empty history:", error);
    return [];
  }
}

export async function getLeadEvents(
  workspaceId: string,
  filters: { channel?: LeadChannel | "ALL"; status?: string | "ALL"; limit?: number } = {}
): Promise<LeadEventItem[]> {
  try {
    const p = prisma as any;
    const where: any = { workspaceId };
    if (filters.channel && filters.channel !== "ALL") where.channel = filters.channel;
    if (filters.status && filters.status !== "ALL") where.status = filters.status;

    const rows = await p.leadEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: Math.min(200, filters.limit || 100),
    });

    // Attribute each lead back to the post/article that produced it
    const postIds = Array.from(new Set(rows.map((r: any) => r.postId).filter(Boolean))) as string[];
    const logs = postIds.length
      ? await p.publishLog.findMany({
          where: { postId: { in: postIds } },
          select: { postId: true, excerpt: true, topic: true, platform: true },
        })
      : [];
    const logMap = new Map<string, any>(logs.map((l: any) => [l.postId, l]));

    return rows.map((r: any) => {
      const log = r.postId ? logMap.get(r.postId) : null;
      return {
        id: r.id,
        source: r.source,
        channel: r.channel,
        platform: r.platform || log?.platform || null,
        action: r.action,
        leadType: r.leadType,
        contactName: r.contactName,
        contactInfo: r.contactInfo,
        value: r.value,
        note: r.note,
        status: r.status,
        occurredAt: new Date(r.occurredAt).toISOString(),
        postId: r.postId,
        attributedTo: log?.topic || log?.excerpt || null,
      } satisfies LeadEventItem;
    });
  } catch (error) {
    console.warn("[getLeadEvents] returning empty list:", error);
    return [];
  }
}

/** Per-platform and per-pillar attribution built from tracked links. */
export interface AttributionRow {
  key: string;
  clicks: number;
  leads: number;
  conversionRate: number | null;
}

export async function getAttribution(workspaceId: string): Promise<{
  byPlatform: AttributionRow[];
  byPillar: AttributionRow[];
  byChannel: AttributionRow[];
}> {
  try {
    const p = prisma as any;
    const links = await p.trackedLink.findMany({
      where: { workspaceId },
      select: { platform: true, pillar: true, channel: true, clickCount: true, leadCount: true },
    });

    const build = (field: "platform" | "pillar" | "channel"): AttributionRow[] => {
      const map = new Map<string, { clicks: number; leads: number }>();
      for (const l of links as any[]) {
        const key = (l[field] || "").trim();
        if (!key) continue;
        const cur = map.get(key) || { clicks: 0, leads: 0 };
        cur.clicks += l.clickCount || 0;
        cur.leads += l.leadCount || 0;
        map.set(key, cur);
      }
      return Array.from(map.entries())
        .map(([key, v]) => ({
          key,
          clicks: v.clicks,
          leads: v.leads,
          conversionRate: v.clicks > 0 ? Number(((v.leads / v.clicks) * 100).toFixed(1)) : null,
        }))
        .sort((a, b) => b.leads - a.leads || b.clicks - a.clicks);
    };

    return {
      byPlatform: build("platform"),
      byPillar: build("pillar"),
      byChannel: build("channel"),
    };
  } catch (error) {
    console.warn("[getAttribution] empty:", error);
    return { byPlatform: [], byPillar: [], byChannel: [] };
  }
}

export async function getTrackingStatus(workspaceId: string): Promise<TrackingStatus> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        website: true,
        trackingKey: true,
        trackingDomain: true,
        trackingVerifiedAt: true,
      } as any,
    });

    const key = (ws as any)?.trackingKey || null;
    const verifiedAt = (ws as any)?.trackingVerifiedAt
      ? new Date((ws as any).trackingVerifiedAt)
      : null;

    const leadsCaptured = await (prisma as any).leadEvent
      .count({ where: { workspaceId, source: "WEBSITE_TAG" } })
      .catch(() => 0);

    return {
      installed: Boolean(verifiedAt),
      trackingKey: key,
      domain: (ws as any)?.trackingDomain || (ws as any)?.website || null,
      verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
      snippet: key ? buildTagSnippet(key) : "",
      leadsCaptured,
      stale: Boolean(
        verifiedAt && Date.now() - verifiedAt.getTime() > 7 * 24 * 60 * 60 * 1000
      ),
    };
  } catch (error) {
    console.warn("[getTrackingStatus] unavailable:", error);
    return {
      installed: false,
      trackingKey: null,
      domain: null,
      verifiedAt: null,
      snippet: "",
      leadsCaptured: 0,
      stale: false,
    };
  }
}
