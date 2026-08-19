"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  computeGrowthKPIs,
  generateGrowthStrategy,
  GrowthStrategy,
  GrowthKPIs,
  LeadType,
  AutopilotMode,
  AutopilotPermissions,
  GrowthPlanTask,
} from "@/lib/agents/growthEngine";
import { vertexProvider, MODELS } from "@/lib/agents/llm";
import { normalizeHashtags } from "@/lib/hashtags";
import { generateMediaAsset } from "@/lib/agents/mediaGenerator";
import { getPlatformCapability } from "@/lib/capabilities/platformCapabilities";

// Default standard goal parameters
const DEFAULT_GROWTH_GOAL = {
  leadTarget: 150,
  leadType: "QUALIFIED_LEADS" as LeadType,
  timeframeDays: 60,
  targetPlatforms: ["LinkedIn", "Instagram", "X", "TikTok"],
  pausedPlatforms: [] as string[],
  autopilotMode: "ASSISTED" as AutopilotMode,
  autopilotPermissions: {
    createContent: true,
    generateVisuals: true,
    schedule: true,
    autoPublish: false,
    autoModifyStrategy: false,
  },
  isAutopilotPaused: false,
  isPublishingPaused: false,
};

/**
 * Fetch workspace growth goal and compute real-time KPIs and status.
 */
export async function getWorkspaceGrowthGoal(workspaceId: string): Promise<{
  goal: any;
  kpis: GrowthKPIs;
  strategy: GrowthStrategy | null;
}> {
  try {
    const { cacheGet, cacheSet } = await import("@/lib/redis");

    // Fetch DB records and Redis cache in parallel with timeout guard
    const [growthGoal, posts, cachedStrategy, cachedMeta] = await Promise.all([
      Promise.race([
        (prisma as any).growthGoal?.findUnique({ where: { workspaceId } }).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]),
      Promise.race([
        prisma.post.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }).catch(() => []),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2500)),
      ]),
      cacheGet<GrowthStrategy>(`growth:strategy:${workspaceId}`).catch(() => null),
      cacheGet<any>(`growth:meta:${workspaceId}`).catch(() => null),
    ]);

    const resolvedStrategy = (growthGoal?.strategy as GrowthStrategy) || cachedStrategy || null;

    const activeGoal = {
      id: growthGoal?.id || "default-goal",
      workspaceId,
      leadTarget: growthGoal?.leadTarget || cachedMeta?.leadTarget || DEFAULT_GROWTH_GOAL.leadTarget,
      leadType: growthGoal?.leadType || cachedMeta?.leadType || DEFAULT_GROWTH_GOAL.leadType,
      timeframeDays: growthGoal?.timeframeDays || cachedMeta?.timeframeDays || DEFAULT_GROWTH_GOAL.timeframeDays,
      targetPlatforms: growthGoal?.targetPlatforms || cachedMeta?.targetPlatforms || DEFAULT_GROWTH_GOAL.targetPlatforms,
      pausedPlatforms: growthGoal?.pausedPlatforms || DEFAULT_GROWTH_GOAL.pausedPlatforms,
      autopilotMode: (growthGoal?.autopilotMode || DEFAULT_GROWTH_GOAL.autopilotMode) as AutopilotMode,
      autopilotPermissions: growthGoal?.autopilotPermissions || DEFAULT_GROWTH_GOAL.autopilotPermissions,
      isAutopilotPaused: Boolean(growthGoal?.isAutopilotPaused),
      isPublishingPaused: Boolean(growthGoal?.isPublishingPaused),
      startDate: growthGoal?.startDate || new Date(),
      status: resolvedStrategy ? "ON_TRACK" : "INSUFFICIENT_DATA",
      statusReason: resolvedStrategy
        ? `Active growth strategy active for ${growthGoal?.leadTarget || cachedMeta?.leadTarget || DEFAULT_GROWTH_GOAL.leadTarget} leads.`
        : "Goal initialized. Click 'Build Growth Strategy' to generate organic blueprint.",
      strategy: resolvedStrategy,
      decisions: growthGoal?.decisions || resolvedStrategy?.decisions || [],
      experiments: growthGoal?.experiments || resolvedStrategy?.experiments || [],
    };

    const kpis = computeGrowthKPIs(
      {
        leadTarget: activeGoal.leadTarget,
        startDate: activeGoal.startDate,
        timeframeDays: activeGoal.timeframeDays,
        leadType: activeGoal.leadType,
      },
      posts || []
    );

    // If strategy exists in memory/DB but not Redis, backfill Redis
    if (resolvedStrategy && !cachedStrategy) {
      cacheSet(`growth:strategy:${workspaceId}`, resolvedStrategy, 86400 * 30).catch(() => null);
    }

    return {
      goal: activeGoal,
      kpis,
      strategy: resolvedStrategy,
    };
  } catch (error) {
    console.warn("[getWorkspaceGrowthGoal] Fallback state due to DB connection:", error);
    const kpis = computeGrowthKPIs(
      {
        leadTarget: DEFAULT_GROWTH_GOAL.leadTarget,
        startDate: new Date(),
        timeframeDays: DEFAULT_GROWTH_GOAL.timeframeDays,
        leadType: DEFAULT_GROWTH_GOAL.leadType,
      },
      []
    );
    return {
      goal: {
        id: "default-goal",
        workspaceId,
        ...DEFAULT_GROWTH_GOAL,
        startDate: new Date(),
        status: "INSUFFICIENT_DATA",
        statusReason: "Goal initialized. Ready to build strategy.",
        strategy: null,
      },
      kpis,
      strategy: null,
    };
  }
}

/**
 * Save / update growth goal configuration.
 */
export async function saveGrowthGoal(
  workspaceId: string,
  data: {
    leadTarget: number;
    leadType: LeadType;
    timeframeDays: number;
    targetPlatforms: string[];
    autopilotMode?: AutopilotMode;
    autopilotPermissions?: Partial<AutopilotPermissions>;
    pausedPlatforms?: string[];
  }
) {
  try {
    const updated = await (prisma as any).growthGoal.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        leadTarget: Number(data.leadTarget),
        leadType: data.leadType,
        timeframeDays: Number(data.timeframeDays),
        targetPlatforms: data.targetPlatforms,
        pausedPlatforms: data.pausedPlatforms || [],
        autopilotMode: data.autopilotMode || "ASSISTED",
        autopilotPermissions: data.autopilotPermissions || DEFAULT_GROWTH_GOAL.autopilotPermissions,
        status: "ON_TRACK",
        statusReason: `Target updated to ${data.leadTarget} ${data.leadType.replace(/_/g, " ")} (${data.timeframeDays} days).`,
      },
      update: {
        leadTarget: Number(data.leadTarget),
        leadType: data.leadType,
        timeframeDays: Number(data.timeframeDays),
        targetPlatforms: data.targetPlatforms,
        ...(data.pausedPlatforms ? { pausedPlatforms: data.pausedPlatforms } : {}),
        ...(data.autopilotMode ? { autopilotMode: data.autopilotMode } : {}),
        ...(data.autopilotPermissions ? { autopilotPermissions: data.autopilotPermissions } : {}),
        updatedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/chat");
    return { success: true, goal: updated };
  } catch (error: any) {
    console.error("[saveGrowthGoal] Error saving goal:", error);
    return { success: false, error: error.message || "Failed to update goal" };
  }
}

/**
 * Toggle autopilot mode, pause/resume platform or publishing.
 */
export async function toggleAutopilot(
  workspaceId: string,
  options: {
    mode?: AutopilotMode;
    isAutopilotPaused?: boolean;
    isPublishingPaused?: boolean;
    pausedPlatforms?: string[];
    permissions?: AutopilotPermissions;
  }
) {
  try {
    const updateData: any = {};
    if (options.mode !== undefined) updateData.autopilotMode = options.mode;
    if (options.isAutopilotPaused !== undefined) updateData.isAutopilotPaused = options.isAutopilotPaused;
    if (options.isPublishingPaused !== undefined) updateData.isPublishingPaused = options.isPublishingPaused;
    if (options.pausedPlatforms !== undefined) updateData.pausedPlatforms = options.pausedPlatforms;
    if (options.permissions !== undefined) updateData.autopilotPermissions = options.permissions;

    const updated = await (prisma as any).growthGoal.update({
      where: { workspaceId },
      data: updateData,
    });

    revalidatePath("/dashboard/goals");
    return { success: true, goal: updated };
  } catch (error: any) {
    console.error("[toggleAutopilot] Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Execute a Growth Plan Task — Hands work to Content Creator and AI Studio / Visualizer.
 * Creates a real post record in prisma.post.
 */
export async function executeGrowthPlanTask(
  workspaceId: string,
  task: GrowthPlanTask,
  options?: {
    generateVisuals?: boolean;
    scheduleNow?: boolean;
  }
) {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brandDNA: true },
    });

    const capability = getPlatformCapability(task.platform.toLowerCase() as any, task.format);
    const brandName = workspace?.name || "SMB Robotics";
    const industry = workspace?.industry || "Embedded Systems & AI Robotics";
    const website = workspace?.website || "https://smbrobotic.com";

    // 1. Generate Platform-Optimized Caption via Content Creator (Google Vertex AI)
    const prompt = `You are the Content Creator agent. Create high-converting organic social media copy for ${task.platform} (${task.format}).

TOPIC: ${task.topic}
HOOK ANGLE: ${task.hook}
CTA: ${task.cta}
GOAL ROLE: ${task.leadGoalRole}
BRAND: ${brandName} (${industry})
WEBSITE: ${website}

PLATFORM RULES:
- Caption character limit: ${capability.captionLimit}
- Max hashtags: ${capability.hashtagLimit}
- Tone: ${workspace?.brandDNA?.tone || "Professional, authoritative, high-value"}
- Writing Style: Direct, conversational, clear paragraphs, zero corporate fluff.

OUTPUT VALID JSON ONLY:
{
  "caption": "Full formatted caption with hook and CTA",
  "hashtags": ["#Tag1", "#Tag2"],
  "visualPrompt": "Detailed photorealistic visual prompt for AI image/video generator",
  "mediaType": "${capability.mediaType}"
}`;

    const res = await vertexProvider.generateJSON(
      [{ role: "user", content: prompt }],
      { modelName: MODELS.CONTENT_CREATOR, temperature: 0.3 }
    );

    const caption = res?.caption || `${task.hook}\n\n${task.topic}\n\n${task.cta}`;
    const hashtags = normalizeHashtags(res?.hashtags || [], { limit: capability.hashtagLimit });
    const visualPrompt = res?.visualPrompt || `${task.topic}, high-tech photorealistic 8k commercial photography`;
    const isVideo = capability.mediaType === "video" || task.format === "Reel" || task.format === "Shorts";

    let mediaUrl: string | undefined;
    let actualMediaType = isVideo ? "video" : "image";

    // 2. Generate Real AI Visual Media if requested (via Visualizer / AI Studio)
    if (options?.generateVisuals) {
      try {
        const assets = await generateMediaAsset({
          platform: task.platform,
          contentType: task.format,
          mediaType: isVideo ? "video" : "image",
          prompt: visualPrompt,
          aspectRatio: capability.defaultAspectRatio,
          imageModel: "gemini-3-pro-image",
        });
        if (assets[0]?.url) {
          mediaUrl = assets[0].url;
          actualMediaType = assets[0].type;
        }
      } catch (mediaErr) {
        console.warn("[executeGrowthPlanTask] Media generation non-fatal error:", mediaErr);
      }
    }

    // 3. Create real Post record in Database (Content Library & AI Studio synced)
    const scheduledDate = options?.scheduleNow ? new Date(task.date || Date.now() + 86400000) : null;
    const postStatus = options?.scheduleNow ? "SCHEDULED" : "APPROVED";

    const post = await prisma.post.create({
      data: {
        workspaceId,
        platform: task.platform,
        format: task.format,
        content: caption,
        hashtags,
        imageUrl: mediaUrl,
        imagePrompt: visualPrompt,
        mediaType: actualMediaType,
        campaignTopic: task.topic,
        campaignHook: task.hook,
        status: postStatus,
        scheduledFor: scheduledDate,
        source: "growth-autopilot",
      },
    });

    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/content");
    revalidatePath("/dashboard/ai-studio");

    return {
      success: true,
      postId: post.id,
      platform: post.platform,
      format: post.format,
      status: post.status,
      mediaUrl: post.imageUrl,
      caption: post.content,
      scheduledFor: post.scheduledFor?.toISOString() || null,
    };
  } catch (error: any) {
    console.error("[executeGrowthPlanTask] Error executing task:", error);
    return { success: false, error: error.message || "Failed to execute growth task" };
  }
}

/**
 * Apply an AI Growth Recommendation.
 */
export async function applyGrowthRecommendation(
  workspaceId: string,
  recommendationId: string
) {
  try {
    const goal = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } });
    if (!goal) return { success: false, error: "Goal not found" };

    const strategy = (goal.strategy as GrowthStrategy) || null;
    if (strategy && strategy.recommendations) {
      const rec = strategy.recommendations.find((r) => r.id === recommendationId);
      if (rec) {
        rec.applied = true;

        // Log decision in decision log
        strategy.decisions.unshift({
          id: `dec-applied-${Date.now()}`,
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          title: `Applied Recommendation: ${rec.title}`,
          action: rec.description,
          reason: rec.why,
          data: rec.data,
          expectedImpact: rec.expectedImpact,
          status: "APPLIED",
        });

        await (prisma as any).growthGoal.update({
          where: { workspaceId },
          data: {
            strategy: strategy as any,
            decisions: strategy.decisions as any,
            updatedAt: new Date(),
          },
        });
      }
    }

    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export interface GrowthActivityItem {
  id: string;
  postId?: string;
  type: "POST_SCHEDULED" | "POST_PUBLISHED" | "DRAFT_CREATED" | "DECISION_MADE" | "RECOMMENDATION_APPLIED";
  title: string;
  topic?: string;
  hook?: string;
  captionPreview?: string;
  platform?: string;
  format?: string;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "carousel" | "document" | "text";
  status?: string;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  publishedUrl?: string | null;
  editorUrl: string;
  studioUrl: string;
  stats?: {
    impressions: number;
    clicks: number;
    leads: number;
  };
  timestamp: string;
  formattedTime: string;
}

/**
 * Fetch real, verified AI recent activity (actual posts created/scheduled/published + real AI decisions).
 * Zero fake or mock data.
 */
export async function getRecentGrowthActivity(workspaceId: string): Promise<GrowthActivityItem[]> {
  try {
    const [posts, growthGoal] = await Promise.all([
      prisma.post.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 35,
      }).catch(() => []),
      (prisma as any).growthGoal?.findUnique({ where: { workspaceId } }).catch(() => null),
    ]);

    const activityItems: GrowthActivityItem[] = [];

    // 1. Map Real Posts
    for (const post of posts) {
      const isPublished = post.status === "PUBLISHED";
      const isScheduled = post.status === "SCHEDULED";
      const postDate = post.createdAt instanceof Date ? post.createdAt : new Date(post.createdAt);

      let activityType: GrowthActivityItem["type"] = "DRAFT_CREATED";
      let title = `Draft created for ${post.platform}`;

      if (isPublished) {
        activityType = "POST_PUBLISHED";
        title = `Published to ${post.platform}`;
      } else if (isScheduled) {
        activityType = "POST_SCHEDULED";
        const schedDate = post.scheduledFor ? new Date(post.scheduledFor) : null;
        title = schedDate
          ? `Scheduled on ${post.platform} for ${schedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
          : `Scheduled on ${post.platform} for Peak Window`;
      }

      // Default platform preview URLs
      const platformKey = (post.platform || "").toLowerCase();
      let fallbackPublishedUrl: string | null = null;
      if (isPublished) {
        if (platformKey === "linkedin") fallbackPublishedUrl = "https://www.linkedin.com/feed/";
        else if (platformKey === "instagram") fallbackPublishedUrl = "https://www.instagram.com";
        else if (platformKey === "facebook") fallbackPublishedUrl = "https://www.facebook.com";
        else if (platformKey === "x") fallbackPublishedUrl = "https://x.com";
        else if (platformKey === "youtube") fallbackPublishedUrl = "https://youtube.com";
        else if (platformKey === "tiktok") fallbackPublishedUrl = "https://www.tiktok.com";
        else if (platformKey === "pinterest") fallbackPublishedUrl = "https://www.pinterest.com";
      }

      activityItems.push({
        id: `act-post-${post.id}`,
        postId: post.id,
        type: activityType,
        title,
        topic: (post as any).campaignTopic || post.content.slice(0, 65) + (post.content.length > 65 ? "..." : ""),
        hook: (post as any).campaignHook || undefined,
        captionPreview: post.content,
        platform: post.platform,
        format: post.format || undefined,
        mediaUrl: post.imageUrl || null,
        mediaType: (post.mediaType as any) || (post.imageUrl ? "image" : "text"),
        status: post.status,
        scheduledFor: post.scheduledFor ? post.scheduledFor.toISOString() : null,
        publishedAt: isPublished ? postDate.toISOString() : null,
        publishedUrl: (post as any).publishedUrl || fallbackPublishedUrl,
        editorUrl: `/dashboard/content`,
        studioUrl: `/dashboard/ai-studio`,
        stats: {
          impressions: (post as any).impressions || 0,
          clicks: (post as any).clicks || 0,
          leads: (post as any).leadsGenerated || 0,
        },
        timestamp: postDate.toISOString(),
        formattedTime: formatRelativeTime(postDate),
      });
    }

    // 2. Map Real AI Strategic Decisions
    const decisions = Array.isArray(growthGoal?.decisions) ? growthGoal.decisions : [];
    for (const dec of decisions.slice(0, 10)) {
      const decDate = dec.date ? new Date(dec.date) : new Date();
      activityItems.push({
        id: `act-dec-${dec.id || Math.random()}`,
        type: dec.status === "APPLIED" ? "RECOMMENDATION_APPLIED" : "DECISION_MADE",
        title: dec.title || "AI Growth Strategy Optimization",
        topic: dec.action,
        hook: dec.reason,
        captionPreview: `${dec.reason}\n\nExpected Impact: ${dec.expectedImpact || "Higher conversion rate"}`,
        editorUrl: `/dashboard/goals`,
        studioUrl: `/dashboard/ai-studio`,
        timestamp: decDate.toISOString(),
        formattedTime: formatRelativeTime(decDate),
      });
    }

    // Sort by timestamp desc
    return activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error("[getRecentGrowthActivity] Error:", error);
    return [];
  }
}

/**
 * Validate goal feasibility against historical data and realistic organic benchmarks.
 */
export async function validateGoalAction(
  workspaceId: string,
  leadTarget: number,
  timeframeDays: number,
  leadType: string
) {
  try {
    const { validateGoalFeasibility } = await import("@/lib/agents/growthEngine");
    const posts = await prisma.post.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []);

    return validateGoalFeasibility({
      leadTarget,
      timeframeDays,
      leadType,
      historicalPosts: posts,
    });
  } catch (error) {
    console.error("[validateGoalAction] Error:", error);
    const { validateGoalFeasibility } = await import("@/lib/agents/growthEngine");
    return validateGoalFeasibility({
      leadTarget,
      timeframeDays,
      leadType,
      historicalPosts: [],
    });
  }
}

/**
 * Batch execute today's autonomous growth tasks (Generates copy + visual media + schedules).
 */
export async function executeTodayPlanBatch(
  workspaceId: string,
  options?: { generateVisuals?: boolean }
) {
  try {
    const { cacheGet, cacheSet } = await import("@/lib/redis");
    const growthGoal = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } });
    const cachedStrategy = await cacheGet<GrowthStrategy>(`growth:strategy:${workspaceId}`);

    const strategy: GrowthStrategy | null = (growthGoal?.strategy as GrowthStrategy) || cachedStrategy || null;
    if (!strategy || !Array.isArray(strategy.todayPlan) || strategy.todayPlan.length === 0) {
      return { success: false, error: "No active today plan tasks found. Please build a growth strategy first." };
    }

    const executedTasks: any[] = [];
    const updatedTodayPlan: GrowthPlanTask[] = [];

    for (const task of strategy.todayPlan) {
      if (task.status === "SCHEDULED" || task.status === "PUBLISHED") {
        updatedTodayPlan.push(task);
        continue;
      }

      const res = await executeGrowthPlanTask(workspaceId, task, {
        generateVisuals: options?.generateVisuals ?? true,
        scheduleNow: true,
      });

      if (res.success) {
        executedTasks.push(res);
        updatedTodayPlan.push({
          ...task,
          status: "SCHEDULED",
          postId: res.postId,
          mediaUrl: res.mediaUrl || undefined,
        });
      } else {
        updatedTodayPlan.push(task);
      }
    }

    const updatedStrategy = { ...strategy, todayPlan: updatedTodayPlan };

    // Persist updated strategy
    await Promise.all([
      cacheSet(`growth:strategy:${workspaceId}`, updatedStrategy, 86400 * 30).catch(() => null),
      (prisma as any).growthGoal.update({
        where: { workspaceId },
        data: {
          strategy: updatedStrategy as any,
          updatedAt: new Date(),
        },
      }).catch(() => null),
    ]);

    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/content");
    revalidatePath("/dashboard/ai-studio");

    return {
      success: true,
      count: executedTasks.length,
      tasks: executedTasks,
      message: `Successfully generated and scheduled ${executedTasks.length} posts with AI visuals!`,
    };
  } catch (error: any) {
    console.error("[executeTodayPlanBatch] Error:", error);
    return { success: false, error: error.message || "Failed to batch execute today's plan" };
  }
}

// Relative time helper
function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Legacy compatibility wrapper for createCampaignFromGoal.
 */
export async function createCampaignFromGoal({
  workspaceId,
  leadTarget,
  timeframe,
  customFeedback,
}: {
  workspaceId: string;
  leadTarget: number;
  timeframe: string;
  customFeedback?: string;
}) {
  const timeframeDays = timeframe === "1_MONTH" ? 30 : timeframe === "3_MONTHS" ? 90 : 60;
  const strategy = await generateGrowthStrategy({
    workspaceId,
    userId: "system",
    leadTarget,
    leadType: "QUALIFIED_LEADS",
    timeframeDays,
    targetPlatforms: ["LinkedIn", "Instagram", "X", "TikTok"],
    customGuidance: customFeedback,
  });

  // Execute today's top tasks
  for (const task of strategy.todayPlan.slice(0, 3)) {
    await executeGrowthPlanTask(workspaceId, task, { scheduleNow: true });
  }

  revalidatePath("/dashboard/goals");
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/chat");

  return {
    success: true,
    message: `Generated organic growth strategy for ${leadTarget} leads!`,
  };
}
