"use server";

import prisma from "@/lib/db";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { getWorkspaceAnalytics, WorkspaceAnalyticsData, PostPerformanceRow } from "./analytics";
import { getWorkspaceCreditInfo, WorkspaceCreditInfo } from "@/lib/billing/credits";
import { approvePost, rejectPost } from "./content";
import { publishNow } from "./publish";
import { fetchLiveTrendingNews, TrendItem } from "./trends";
import { PLATFORM_BEST_TIMES, getNextBestTime } from "@/lib/bestPublishTime";

export interface DashboardPostItem {
  id: string;
  platform: string;
  format: string | null;
  content: string;
  imageUrl: string | null;
  status: string;
  scheduledFor: string | null;
  createdAt: string;
  campaignTopic: string | null;
  publishError?: string | null;
}

export interface DashboardPeakTime {
  platform: string;
  label: string;
  reason: string;
  nextDateIso: string;
  isPeakToday: boolean;
}

export interface WeeklyCalendarDay {
  date: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  posts: DashboardPostItem[];
}

/**
 * Every KPI is counted from real database rows (LinkClick, LeadEvent,
 * PublishLog, Post) or from the shared analytics series. Nothing here is
 * estimated or extrapolated.
 */
export interface ProductionKpiMetrics {
  /** Tracked link clicks — the measured engagement signal on social posts. */
  clicks: {
    this7d: number;
    /** vs the previous 7 days. */
    growthPct: number;
  };
  /** Confirmed / qualified / won leads attributed to this workspace. */
  leads: {
    gained30d: number;
    growthPct: number;
  };
  /** Posts that actually went out (social channels only). */
  published: {
    this30d: number;
    today: number;
    failures30d: number;
  };
  scheduled: {
    today: number;
    upcomingWeek: number;
    pendingApproval: number;
  };
  goal: {
    title: string;
    target: number;
    achieved: number;
    percentComplete: number;
    remaining: number;
    estDate: string;
    hasGoal: boolean;
  };
}

/** One social network, its publish count and latest platform-reported metrics. */
export interface DashboardPlatformPerformance {
  platform: string;
  connected: boolean;
  handle: string;
  published: number;
  /** Latest platform-insights snapshot (followers/impressions/engagement). */
  insight: DashboardPlatformInsight | null;
}

/** Mirrors the PlatformInsight table for the client. */
export interface DashboardPlatformInsight {
  state: "live" | "unavailable" | "error" | string;
  message: string | null;
  fetchedAt: string;
  followers: number | null;
  impressions30d: number | null;
  views30d: number | null;
  likes30d: number | null;
  comments30d: number | null;
  shares30d: number | null;
  engagementRate: number | null;
}

/** A real publish event with the clicks/leads that tracked link collected. */

export interface DashboardOverviewData {
  user: {
    name: string;
    email: string;
    firstName: string;
  };
  workspace: {
    id: string;
    name: string;
    industry: string;
    website: string;
    createdAt: string;
  };
  brandTone: string | null;
  credits: WorkspaceCreditInfo;
  analytics: WorkspaceAnalyticsData;
  kpis: ProductionKpiMetrics;
  upcomingPosts: DashboardPostItem[];
  pendingPosts: DashboardPostItem[];
  failedPosts: DashboardPostItem[];
  weeklyCalendar: WeeklyCalendarDay[];
  peakTimes: DashboardPeakTime[];
  topPerformer: PostPerformanceRow | null;
  platformPerformance: DashboardPlatformPerformance[];
  growthGoal: {
    leadTarget: number;
    leadType: string;
    timeframeDays: number;
    startDate: string;
    status: string;
    autopilotMode: string;
    isAutopilotPaused: boolean;
  } | null;
  connectedPlatforms: {
    platform: string;
    handle: string;
    isConnected: boolean;
  }[];
  generatedAt: string;
}

const SUPPORTED_PLATFORMS = ["INSTAGRAM", "LINKEDIN", "FACEBOOK", "YOUTUBE", "TIKTOK", "PINTEREST"] as const;

function pctGrowth(cur: number, prev: number): number {
  if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
  return cur > 0 ? 100 : 0;
}

export async function getDashboardOverviewData(): Promise<DashboardOverviewData | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;

    const [user, workspace] = await Promise.all([
      currentUser().catch(() => null),
      prisma.workspace.findFirst({
        ...(await activeWorkspaceQuery(userId)),
        include: {
          brandDNA: true,
          growthGoal: true,
          socialAccounts: true,
        },
      }),
    ]);

    if (!workspace) return null;

    const workspaceId = workspace.id;
    const realUserName = user?.firstName
      ? `${user.firstName} ${user.lastName || ""}`.trim()
      : user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "User";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Analytics (90-day series), credit info, queue lists and count queries run
    // together. Live trends are intentionally NOT fetched here — the dashboard
    // must render fast from the database alone.
    const [
      analyticsData,
      creditInfo,
      posts,
      scheduledTodayCount,
      scheduledUpcomingWeekCount,
      pendingApprovalCount,
    ] = await Promise.all([
      getWorkspaceAnalytics(workspaceId),
      getWorkspaceCreditInfo(workspaceId),
      prisma.post.findMany({
        where: {
          workspaceId,
          status: { notIn: ["PUBLISHING"] },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }).catch(() => []),
      prisma.post.count({
        where: {
          workspaceId,
          status: "SCHEDULED",
          scheduledFor: { gte: startOfToday, lte: endOfToday },
        },
      }).catch(() => 0),
      prisma.post.count({
        where: {
          workspaceId,
          status: "SCHEDULED",
          scheduledFor: { gte: now, lte: sevenDaysAhead },
        },
      }).catch(() => 0),
      prisma.post.count({
        where: {
          workspaceId,
          status: "PENDING_APPROVAL",
        },
      }).catch(() => 0),
    ]);

    // ── Real KPIs from the analytics series (today is the last bucket) ──────
    const series = analyticsData.series || [];
    const len = series.length;
    const sumRange = (
      field: "clicks" | "leads" | "posts" | "failed",
      from: number,
      to: number
    ): number => {
      const start = Math.max(0, from);
      const end = Math.max(start, to);
      return series.slice(start, end).reduce((acc, p) => acc + (Number(p[field]) || 0), 0);
    };

    const clicks7d = sumRange("clicks", len - 7, len);
    const clicksPrev7d = sumRange("clicks", len - 14, len - 7);
    const leads30d = sumRange("leads", len - 30, len);
    const leadsPrev30d = sumRange("leads", len - 60, len - 30);
    const published30d = sumRange("posts", len - 30, len);
    const publishedToday = sumRange("posts", len - 1, len);
    const failures30d = sumRange("failed", len - 30, len);

    // ── Goal progress: use the goal's own measured window when one exists ───
    const goalTarget = workspace.growthGoal?.leadTarget || 100;
    const goalAchieved =
      analyticsData.goal && analyticsData.goal.leadsAchieved !== undefined
        ? analyticsData.goal.leadsAchieved
        : analyticsData.totals.leads;
    const percentComplete = Math.min(100, Math.round((goalAchieved / goalTarget) * 100));
    const remaining = Math.max(0, goalTarget - goalAchieved);

    let estDate = "In Progress";
    if (workspace.growthGoal?.startDate && workspace.growthGoal?.timeframeDays) {
      const finishDate = new Date(
        new Date(workspace.growthGoal.startDate).getTime() +
          workspace.growthGoal.timeframeDays * 24 * 60 * 60 * 1000
      );
      estDate = finishDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    const kpis: ProductionKpiMetrics = {
      clicks: { this7d: clicks7d, growthPct: pctGrowth(clicks7d, clicksPrev7d) },
      leads: { gained30d: leads30d, growthPct: pctGrowth(leads30d, leadsPrev30d) },
      published: {
        this30d: published30d,
        today: publishedToday,
        failures30d,
      },
      scheduled: {
        today: scheduledTodayCount,
        upcomingWeek: scheduledUpcomingWeekCount,
        pendingApproval: pendingApprovalCount,
      },
      goal: {
        title: workspace.growthGoal?.leadType?.replace(/_/g, " ") || "Lead Pipeline",
        target: goalTarget,
        achieved: goalAchieved,
        percentComplete,
        remaining,
        estDate,
        hasGoal: Boolean(workspace.growthGoal),
      },
    };

    // ── Queue lists from the Post rows ───────────────────────────────────────
    const upcomingPosts: DashboardPostItem[] = [];
    const pendingPosts: DashboardPostItem[] = [];
    const failedPosts: DashboardPostItem[] = [];

    for (const p of posts) {
      const item: DashboardPostItem = {
        id: p.id,
        platform: p.platform,
        format: p.format,
        content: p.content,
        imageUrl: p.imageUrl,
        status: p.status,
        scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        campaignTopic: p.campaignTopic,
        publishError: p.publishError || null,
      };
      if (p.status === "SCHEDULED") upcomingPosts.push(item);
      else if (p.status === "PENDING_APPROVAL") pendingPosts.push(item);
      else if (p.status === "FAILED") failedPosts.push(item);
    }

    // ── 7-Day Rolling Calendar Runway (Today + next 6 days) ──────────────────
    const weeklyCalendar: WeeklyCalendarDay[] = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      const dateStr = d.toISOString().split("T")[0];
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

      const dayPosts = posts
        .filter((p) => {
          if (!p.scheduledFor) return false;
          const sTime = new Date(p.scheduledFor).getTime();
          return sTime >= startOfDay.getTime() && sTime <= endOfDay.getTime();
        })
        .map((p) => ({
          id: p.id,
          platform: p.platform,
          format: p.format,
          content: p.content,
          imageUrl: p.imageUrl,
          status: p.status,
          scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
          campaignTopic: p.campaignTopic,
          publishError: p.publishError || null,
        }));

      weeklyCalendar.push({
        date: dateStr,
        dayName: dayNames[d.getDay()],
        dayNumber: d.getDate(),
        isToday: offset === 0,
        posts: dayPosts,
      });
    }

    // ── Audience Peak Times Radar ──────────────────────────────────────────
    const peakTimes: DashboardPeakTime[] = [];
    for (const plat of SUPPORTED_PLATFORMS) {
      const spec = PLATFORM_BEST_TIMES[plat.toLowerCase()];
      if (spec) {
        const nextDate = getNextBestTime(plat.toLowerCase(), now);
        peakTimes.push({
          platform: plat,
          label: spec.label,
          reason: spec.reason,
          nextDateIso: nextDate.toISOString(),
          isPeakToday: nextDate.toDateString() === now.toDateString(),
        });
      }
    }

    // ── Top Performer Content Spotlight ────────────────────────────────────
    const rawPosts = analyticsData.posts || [];
    const sortedPosts = [...rawPosts].sort(
      (a, b) => (b.clicks + b.leads * 3) - (a.clicks + a.leads * 3)
    );
    const topPerformer =
      sortedPosts.length > 0 && (sortedPosts[0].clicks > 0 || sortedPosts[0].leads > 0)
        ? sortedPosts[0]
        : sortedPosts[0] || null;

    // ── Per-platform results (published + platform-reported insights) ───────
    const analyticsByKey = new Map(
      (analyticsData.platforms || []).map((row) => [row.key, row])
    );

    const connectedMap = new Map(
      (workspace.socialAccounts || []).map((acc) => [
        acc.platform.toUpperCase(),
        acc.handle || "@connected",
      ])
    );

    const insightRows = await prisma.platformInsight
      .findMany({ where: { workspaceId } })
      .catch(() => []);

    const platformPerformance: DashboardPlatformPerformance[] = [];
    for (const platform of SUPPORTED_PLATFORMS) {
      const row = analyticsByKey.get(platform.toLowerCase());
      const connected = connectedMap.has(platform);
      if (!connected && !(row && row.published > 0)) continue;

      const insight = insightRows.find((r) => r.platform === platform);
      platformPerformance.push({
        platform,
        connected,
        handle: connectedMap.get(platform) || "",
        published: row?.published || 0,
        insight: insight
          ? {
              state: insight.state,
              message: insight.message,
              fetchedAt: insight.fetchedAt.toISOString(),
              followers: insight.followers,
              impressions30d: insight.impressions30d,
              views30d: insight.views30d,
              likes30d: insight.likes30d,
              comments30d: insight.comments30d,
              shares30d: insight.shares30d,
              engagementRate: insight.engagementRate,
            }
          : null,
      });
    }
    platformPerformance.sort(
      (a, b) => Number(b.connected) - Number(a.connected) || b.published - a.published
    );

    const connectedPlatforms = SUPPORTED_PLATFORMS.map((plat) => ({
      platform: plat,
      handle: connectedMap.get(plat) || "",
      isConnected: connectedMap.has(plat),
    }));

    return {
      user: {
        name: realUserName,
        email: user?.emailAddresses?.[0]?.emailAddress || "",
        firstName: user?.firstName || realUserName.split(" ")[0] || "User",
      },
      workspace: {
        id: workspace.id,
        name: workspace.name || "My Workspace",
        industry: workspace.industry || "Digital Marketing",
        website: workspace.website || "",
        createdAt: workspace.createdAt.toISOString(),
      },
      brandTone: workspace.brandDNA?.tone || null,
      credits: creditInfo,
      analytics: analyticsData,
      kpis,
      upcomingPosts: upcomingPosts.slice(0, 5),
      pendingPosts: pendingPosts.slice(0, 5),
      failedPosts: failedPosts.slice(0, 5),
      weeklyCalendar,
      peakTimes,
      topPerformer,
      platformPerformance,
      growthGoal: workspace.growthGoal
        ? {
            leadTarget: workspace.growthGoal.leadTarget,
            leadType: workspace.growthGoal.leadType,
            timeframeDays: workspace.growthGoal.timeframeDays,
            startDate: workspace.growthGoal.startDate.toISOString(),
            status: workspace.growthGoal.status,
            autopilotMode: workspace.growthGoal.autopilotMode,
            isAutopilotPaused: workspace.growthGoal.isAutopilotPaused,
          }
        : null,
      connectedPlatforms,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[getDashboardOverviewData] Error:", error);
    return null;
  }
}

export async function approveDashboardPost(postId: string) {
  const result = await approvePost(postId);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/content");
  return result;
}

export async function rejectDashboardPost(postId: string, reason: string) {
  const result = await rejectPost(postId, reason);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/content");
  return result;
}

export async function retryDashboardPost(postId: string) {
  const result = await publishNow(postId);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/content");
  return result;
}

export async function fetchDashboardTrends(
  industry?: string
): Promise<{ success: boolean; trends: TrendItem[]; query: string }> {
  try {
    const query = (industry || "").trim() || "Social Media Marketing AI";
    const res = await fetchLiveTrendingNews(query, 4);
    return res;
  } catch (err: any) {
    return { success: false, trends: [], query: industry || "Marketing" };
  }
}
