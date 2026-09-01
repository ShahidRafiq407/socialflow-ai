import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getRecentGrowthActivity, getWorkspaceGrowthGoal } from "@/actions/goals";
import { getWordPressSite } from "@/actions/wordpressSite";
import {
  getAttribution,
  getLeadEvents,
  getPublishHistory,
  getTrackingStatus,
} from "@/lib/growth/metrics";
import { getAppBaseUrl } from "@/lib/media/urls";
import { GoalHQShell } from "@/components/dashboard/goals/GoalHQShell";
import type { GoalHQData } from "@/components/dashboard/goals/types";

export const dynamic = "force-dynamic";

/** Display names for the platforms, derived from the connected accounts only. */
const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  twitter: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
};

export default async function LeadGoalPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    include: { socialAccounts: true, brandDNA: true },
  });

  // No workspace means onboarding never finished. There is nothing honest to
  // show here, and inventing a placeholder workspace is what used to put a
  // stranger's business name on this page.
  if (!workspace) redirect("/onboarding");

  const workspaceId = workspace.id;

  const [goalView, activity, history, leads, attribution, tracking, wordpress] = await Promise.all([
    getWorkspaceGrowthGoal(workspaceId),
    getRecentGrowthActivity(workspaceId).catch(() => []),
    getPublishHistory(workspaceId, { limit: 200 }).catch(() => []),
    getLeadEvents(workspaceId, { limit: 100 }).catch(() => []),
    getAttribution(workspaceId).catch(() => ({ byPlatform: [], byPillar: [], byChannel: [] })),
    getTrackingStatus(workspaceId),
    getWordPressSite(workspaceId),
  ]);

  const connectedPlatforms = Array.from(
    new Set(
      (workspace.socialAccounts || []).map((account: any) => {
        const key = String(account.platform || "").toLowerCase();
        return PLATFORM_LABEL[key] || account.platform;
      })
    )
  ) as string[];

  const name = (workspace.name || "").trim();
  const industry = (workspace.industry || "").trim();

  const data: GoalHQData = {
    workspaceId,
    workspaceName: name,
    industry,
    website: (workspace.website || "").trim(),
    // Mirrors the engine's own refusal condition: with neither a name nor an
    // industry it will not guess what the business sells.
    hasBrandDNA: Boolean(name || industry),

    goal: goalView.goal,
    kpis: goalView.kpis,
    strategy: goalView.strategy,
    metrics: goalView.metrics,
    needsSetup: goalView.needsSetup,

    connectedPlatforms,

    activity,
    history,
    leads,
    attribution,
    tracking,
    wordpress,

    appBaseUrl: getAppBaseUrl(),
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-7xl mx-auto p-4 md:p-8">
      <GoalHQShell data={data} />
    </div>
  );
}
