import prisma from "@/lib/db";
import { PlanTier, getPlanConfig } from "./plans";
import { getWorkspacePlan } from "./gate";

export interface WorkspaceCreditInfo {
  plan: PlanTier;
  planName: string;
  tagline: string;
  status: string;
  creditsTotal: number; // -1 = unlimited
  creditsUsed: number;
  creditsLeft: number; // -1 = unlimited
  percentUsed: number;
  isUnlimited: boolean;
  canAccessAI: boolean;
  canGenerateVideo: boolean;
  maxSocialAccounts: number;
  connectedAccounts: number;
}

export async function getWorkspaceCreditInfo(workspaceId: string): Promise<WorkspaceCreditInfo> {
  try {
    const [{ plan, status }, accountCount] = await Promise.all([
      getWorkspacePlan(workspaceId),
      prisma.socialAccount.count({ where: { workspaceId } }),
    ]);

    const config = getPlanConfig(plan);
    const isUnlimited = config.aiCreditsPerMonth === -1;
    const creditsTotal = config.aiCreditsPerMonth;

    // Count generations this calendar month from Post and ArticleRun
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [aiPostsCount, articleRunsCount] = await Promise.all([
      prisma.post.count({
        where: {
          workspaceId,
          createdAt: { gte: startOfMonth },
          OR: [
            { source: { contains: "AI", mode: "insensitive" } },
            { campaignTopic: { not: null } },
            { imagePrompt: { not: null } },
          ],
        },
      }).catch(() => 0),
      prisma.articleRun.count({
        where: {
          workspaceId,
          createdAt: { gte: startOfMonth },
        },
      }).catch(() => 0),
    ]);

    const creditsUsed = aiPostsCount + articleRunsCount * 5;

    let creditsLeft = 0;
    let percentUsed = 0;

    if (isUnlimited) {
      creditsLeft = -1;
      percentUsed = 0;
    } else if (creditsTotal === 0) {
      creditsLeft = 0;
      percentUsed = 100;
    } else {
      creditsLeft = Math.max(0, creditsTotal - creditsUsed);
      percentUsed = Math.min(100, Math.round((creditsUsed / creditsTotal) * 100));
    }

    return {
      plan,
      planName: config.name,
      tagline: config.tagline,
      status,
      creditsTotal,
      creditsUsed,
      creditsLeft,
      percentUsed,
      isUnlimited,
      canAccessAI: config.canAccessAI,
      canGenerateVideo: config.canGenerateVideo,
      maxSocialAccounts: config.maxSocialAccounts,
      connectedAccounts: accountCount,
    };
  } catch (error) {
    console.warn("[getWorkspaceCreditInfo] Fallback to free default:", error);
    return {
      plan: "FREE",
      planName: "Free Starter",
      tagline: "Essential manual social posting & scheduling",
      status: "ACTIVE",
      creditsTotal: 0,
      creditsUsed: 0,
      creditsLeft: 0,
      percentUsed: 0,
      isUnlimited: false,
      canAccessAI: false,
      canGenerateVideo: false,
      maxSocialAccounts: 2,
      connectedAccounts: 0,
    };
  }
}
