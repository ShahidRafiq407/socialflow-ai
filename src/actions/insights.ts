"use server";

import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { fetchPlatformInsights } from "@/lib/insights";
import { INSIGHT_STALENESS_MS } from "@/lib/insights/types";
import type { PlatformInsightSnapshot } from "@/lib/insights/types";

export interface InsightView {
  platform: string;
  state: string;
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

function toView(row: {
  platform: string;
  state: string;
  message: string | null;
  fetchedAt: Date;
  followers: number | null;
  impressions30d: number | null;
  views30d: number | null;
  likes30d: number | null;
  comments30d: number | null;
  shares30d: number | null;
  engagementRate: number | null;
}): InsightView {
  return {
    platform: row.platform,
    state: row.state,
    message: row.message,
    fetchedAt: row.fetchedAt.toISOString(),
    followers: row.followers,
    impressions30d: row.impressions30d,
    views30d: row.views30d,
    likes30d: row.likes30d,
    comments30d: row.comments30d,
    shares30d: row.shares30d,
    engagementRate: row.engagementRate,
  };
}

/**
 * Refresh platform insights for one workspace. Stale snapshots (older than
 * INSIGHT_STALENESS_MS) are refetched from the platform APIs; everything else
 * is returned as stored. Never throws: every provider failure becomes an
 * honest "unavailable"/"error" row instead of a broken page.
 */
export async function syncWorkspaceInsights(workspaceIdArg?: string, force = false): Promise<InsightView[]> {
  try {
    let workspaceId = workspaceIdArg;
    if (!workspaceId) {
      const { userId } = await auth();
      if (!userId) return [];
      const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));
      if (!workspace) return [];
      workspaceId = workspace.id;
    }

    const [accounts, existingRows] = await Promise.all([
      prisma.socialAccount.findMany({
        where: { workspaceId },
        select: {
          id: true,
          platform: true,
          accessToken: true,
          refreshToken: true,
          accountId: true,
          handle: true,
          tokenExpiresAt: true,
        },
      }),
      prisma.platformInsight.findMany({
        where: { workspaceId },
        select: {
          platform: true,
          fetchedAt: true,
        },
      }),
    ]);

    const freshMap = new Map(existingRows.map((r) => [r.platform, r.fetchedAt.getTime()]));
    const now = Date.now();

    const results: InsightView[] = [];

    for (const account of accounts) {
      const platform = String(account.platform).toUpperCase();
      const storedAt = freshMap.get(platform) || 0;
      if (!force && storedAt > 0 && now - storedAt < INSIGHT_STALENESS_MS) {
        const stored = await prisma.platformInsight.findUnique({
          where: { workspaceId_platform: { workspaceId, platform } },
        });
        if (stored) {
          results.push(toView(stored));
          continue;
        }
      }

      let snapshot: PlatformInsightSnapshot;
      try {
        snapshot = await fetchPlatformInsights(account);
      } catch {
        snapshot = {
          platform,
          state: "error",
          message: "Insights sync failed.",
          fetchedAt: new Date().toISOString(),
          followers: null,
          impressions30d: null,
          views30d: null,
          likes30d: null,
          comments30d: null,
          shares30d: null,
          engagementRate: null,
        };
      }

      const upserted = await prisma.platformInsight.upsert({
        where: { workspaceId_platform: { workspaceId, platform } },
        create: {
          workspaceId,
          platform,
          state: snapshot.state,
          message: snapshot.message,
          fetchedAt: new Date(snapshot.fetchedAt),
          followers: snapshot.followers,
          impressions30d: snapshot.impressions30d,
          views30d: snapshot.views30d,
          likes30d: snapshot.likes30d,
          comments30d: snapshot.comments30d,
          shares30d: snapshot.shares30d,
          engagementRate: snapshot.engagementRate,
        },
        update: {
          state: snapshot.state,
          message: snapshot.message,
          fetchedAt: new Date(snapshot.fetchedAt),
          followers: snapshot.followers,
          impressions30d: snapshot.impressions30d,
          views30d: snapshot.views30d,
          likes30d: snapshot.likes30d,
          comments30d: snapshot.comments30d,
          shares30d: snapshot.shares30d,
          engagementRate: snapshot.engagementRate,
        },
      });

      results.push(toView(upserted));
    }

    return results;
  } catch (error) {
    console.error("[syncWorkspaceInsights] Error:", error);
    return [];
  }
}

/** Cron entry point: refresh insights for every workspace that has accounts. */
export async function syncAllWorkspacesInsights(): Promise<{ workspaces: number; refreshed: number }> {
  const groups = await prisma.socialAccount
    .groupBy({
      by: ["workspaceId"],
      _count: { _all: true },
    })
    .catch(() => []);

  let refreshed = 0;
  for (const group of groups) {
    const views = await syncWorkspaceInsights(group.workspaceId, true).catch(() => [] as InsightView[]);
    refreshed += views.filter((v) => v.state === "live" || v.state === "error").length;
  }
  return { workspaces: groups.length, refreshed };
}
