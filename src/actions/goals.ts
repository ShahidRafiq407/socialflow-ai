"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  computeGrowthKPIs,
  generateGrowthStrategy,
  GrowthStrategy,
  GrowthKPIs,
  LeadType,
  LeadSource,
  AutopilotMode,
  AutopilotPermissions,
  GrowthPlanTask,
  GoalFeasibilityResult,
} from "@/lib/agents/growthEngine";
import { vertexProvider, MODELS } from "@/lib/agents/llm";
import { normalizeHashtags } from "@/lib/hashtags";
import { generateMediaAsset } from "@/lib/agents/mediaGenerator";
import { getPlatformCapability } from "@/lib/capabilities/platformCapabilities";
import { EMPTY_METRICS, getGrowthMetrics, GrowthMetrics } from "@/lib/growth/metrics";
import {
  LINK_PLACEHOLDER,
  createTrackedLink,
  injectTrackedLink,
  isCaptionLinkClickable,
  resolveDestination,
  stripLinkPlaceholder,
} from "@/lib/growth/ctaLinks";
import { AUTOPILOT_ORIGIN, recordPublishLog } from "@/lib/publishing/dispatch";
import { auth } from "@clerk/nextjs/server";
import { isInternalCall, INTERNAL_CALL_TOKEN } from "@/lib/growth/internalCall";
import { leadTypeLabel } from "@/lib/types/growth";

/**
 * Lead Goal HQ server actions.
 *
 * Three rules hold everywhere in this file:
 *  1. Nothing about the user's business is hard-coded. If Brand DNA / the goal /
 *     a CTA destination is missing, the caller is told — no placeholder brand,
 *     no invented URL.
 *  2. No number is fabricated. Clicks, leads and published counts come from
 *     LinkClick / LeadEvent / PublishLog rows. Reach is the only estimate and it
 *     is labelled as one.
 *  3. Every export is a public HTTP endpoint that takes a workspace id from the
 *     caller, so each one proves the signed-in user owns that workspace before
 *     touching it. The two server-internal callers (autopilot cron, SSE execute
 *     route) pass INTERNAL_CALL_TOKEN instead, because they have already
 *     authenticated by other means.
 */

// ============================================================================
// INTERNAL HELPERS (not exported — a "use server" module may only export async fns)
// ============================================================================

const NOT_YOURS = "You do not have access to this workspace.";

/**
 * How many generation tasks run at the same time. This is a Vertex AI rate-limit
 * guard, not a product setting, so it lives here instead of being sent from the
 * browser — the UI just says "in parallel" and does not invent a number.
 */
const GENERATION_LANES = 3;

/** True when the signed-in user owns `workspaceId`, or the caller is our own server code. */
async function ownsWorkspace(workspaceId: string, internalToken?: string | null): Promise<boolean> {
  if (!workspaceId) return false;
  if (isInternalCall(internalToken)) return true;

  const { userId } = await auth().catch(() => ({ userId: null }) as any);
  if (!userId) return false;

  const owned = await prisma.workspace
    .findFirst({ where: { id: workspaceId, userId }, select: { id: true } })
    .catch(() => null);

  return Boolean(owned);
}

/** Runs `fn` over `items` with at most `limit` in flight. Order of results is preserved. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

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

function asRecord(value: any): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

function normalizeLeadSources(value: any): LeadSource[] {
  const list = Array.isArray(value) ? value : [];
  const out = list
    .map((v) => String(v).toUpperCase())
    .filter((v): v is LeadSource => v === "SOCIAL" || v === "WEBSITE");
  return out.length ? Array.from(new Set(out)) : ["SOCIAL"];
}

/** Reads the strategy from the goal row, falling back to the Redis copy. */
async function loadStrategy(workspaceId: string, goalRow?: any): Promise<GrowthStrategy | null> {
  if (goalRow?.strategy) return goalRow.strategy as GrowthStrategy;
  try {
    const { cacheGet } = await import("@/lib/redis");
    return (await cacheGet<GrowthStrategy>(`growth:strategy:${workspaceId}`)) || null;
  } catch {
    return null;
  }
}

/** Writes the strategy to both the goal row and the Redis cache. */
async function storeStrategy(workspaceId: string, strategy: GrowthStrategy): Promise<void> {
  const { cacheSet } = await import("@/lib/redis");
  await Promise.all([
    cacheSet(`growth:strategy:${workspaceId}`, strategy, 86400 * 30).catch(() => null),
    (prisma as any).growthGoal
      .update({
        where: { workspaceId },
        data: {
          strategy: strategy as any,
          ...(Array.isArray(strategy.decisions) ? { decisions: strategy.decisions as any } : {}),
          ...(Array.isArray(strategy.experiments) ? { experiments: strategy.experiments as any } : {}),
          updatedAt: new Date(),
        },
      })
      .catch(() => null),
  ]);
}

/** Applies a patch to one task inside todayPlan/weeklyPlan and persists it. */
async function patchStrategyTask(
  workspaceId: string,
  taskId: string,
  patch: Partial<GrowthPlanTask>
): Promise<GrowthStrategy | null> {
  const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
  const strategy = await loadStrategy(workspaceId, goalRow);
  if (!strategy) return null;

  const apply = (list: GrowthPlanTask[] | undefined) =>
    Array.isArray(list) ? list.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) : [];

  const next: GrowthStrategy = {
    ...strategy,
    todayPlan: apply(strategy.todayPlan),
    weeklyPlan: apply(strategy.weeklyPlan),
  };

  await storeStrategy(workspaceId, next);
  return next;
}

function findTask(strategy: GrowthStrategy | null, taskId: string): GrowthPlanTask | null {
  if (!strategy) return null;
  return (
    strategy.todayPlan?.find((t) => t.id === taskId) ||
    strategy.weeklyPlan?.find((t) => t.id === taskId) ||
    null
  );
}

function revalidateGoalSurfaces() {
  revalidatePath("/dashboard/goals");
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/ai-studio");
}

// ============================================================================
// GOAL READ
// ============================================================================

export interface WorkspaceGoalView {
  /** null when the user has not created a goal yet — nothing is assumed. */
  goal: any | null;
  kpis: GrowthKPIs;
  strategy: GrowthStrategy | null;
  metrics: GrowthMetrics;
  needsSetup: boolean;
}

/**
 * Reads the goal and computes KPIs from measured rows. When no goal exists the
 * caller gets `needsSetup: true` and `goal: null` — the old behaviour of
 * inventing a 150-lead/60-day default goal is gone.
 */
export async function getWorkspaceGrowthGoal(workspaceId: string): Promise<WorkspaceGoalView> {
  const zeroKpis = (): GrowthKPIs =>
    computeGrowthKPIs({ leadTarget: 0, startDate: new Date(), timeframeDays: 1 }, null);

  try {
    if (!(await ownsWorkspace(workspaceId))) {
      return {
        goal: null,
        kpis: zeroKpis(),
        strategy: null,
        metrics: EMPTY_METRICS,
        needsSetup: true,
      };
    }

    const goalRow = await Promise.race([
      (prisma as any).growthGoal?.findUnique({ where: { workspaceId } }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);

    if (!goalRow) {
      const metrics = await getGrowthMetrics(workspaceId, null);
      return { goal: null, kpis: zeroKpis(), strategy: null, metrics, needsSetup: true };
    }

    const [strategy, metrics] = await Promise.all([
      loadStrategy(workspaceId, goalRow),
      getGrowthMetrics(workspaceId, goalRow.startDate),
    ]);

    const kpis = computeGrowthKPIs(
      {
        leadTarget: goalRow.leadTarget,
        startDate: goalRow.startDate,
        timeframeDays: goalRow.timeframeDays,
        leadType: goalRow.leadType,
      },
      metrics
    );

    const goal = {
      id: goalRow.id,
      workspaceId,
      leadTarget: goalRow.leadTarget,
      leadType: goalRow.leadType as LeadType,
      customLeadTypeName: goalRow.customLeadTypeName || null,
      timeframeDays: goalRow.timeframeDays,
      startDate: goalRow.startDate,
      targetPlatforms: goalRow.targetPlatforms || [],
      pausedPlatforms: goalRow.pausedPlatforms || [],
      leadSources: normalizeLeadSources(goalRow.leadSources),
      ctaDestinations: asRecord(goalRow.ctaDestinations) || {},
      dailyPostCap: goalRow.dailyPostCap ?? null,
      articlesPerWeek: goalRow.articlesPerWeek ?? null,
      graceMinutes: goalRow.graceMinutes ?? 15,
      lastPlanRunAt: goalRow.lastPlanRunAt ? new Date(goalRow.lastPlanRunAt).toISOString() : null,
      lastPlanError: goalRow.lastPlanError || null,
      autopilotMode: (goalRow.autopilotMode || "AUTOPILOT") as AutopilotMode,
      autopilotPermissions: goalRow.autopilotPermissions || null,
      isAutopilotPaused: Boolean(goalRow.isAutopilotPaused),
      isPublishingPaused: Boolean(goalRow.isPublishingPaused),
      // Status is the computed one — never a stored guess
      status: kpis.status,
      statusReason: kpis.statusReason,
      strategy,
      decisions: goalRow.decisions || strategy?.decisions || [],
      experiments: goalRow.experiments || strategy?.experiments || [],
      createdAt: goalRow.createdAt ? new Date(goalRow.createdAt).toISOString() : null,
      updatedAt: goalRow.updatedAt ? new Date(goalRow.updatedAt).toISOString() : null,
    };

    // Backfill the Redis copy so the next read is instant
    if (strategy && !goalRow.strategy) {
      const { cacheSet } = await import("@/lib/redis");
      cacheSet(`growth:strategy:${workspaceId}`, strategy, 86400 * 30).catch(() => null);
    }

    return { goal, kpis, strategy, metrics, needsSetup: false };
  } catch (error) {
    console.error("[getWorkspaceGrowthGoal] error:", error);
    const metrics = await getGrowthMetrics(workspaceId, null).catch(
      () =>
        ({
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
        }) as GrowthMetrics
    );
    return { goal: null, kpis: zeroKpis(), strategy: null, metrics, needsSetup: true };
  }
}

// ============================================================================
// GOAL WRITE
// ============================================================================

export interface SaveGoalInput {
  leadTarget: number;
  leadType: LeadType;
  customLeadTypeName?: string | null;
  timeframeDays: number;
  targetPlatforms: string[];
  leadSources?: LeadSource[];
  ctaDestinations?: Record<string, string> | null;
  dailyPostCap?: number | null;
  articlesPerWeek?: number | null;
  graceMinutes?: number | null;
  autopilotMode?: AutopilotMode;
  autopilotPermissions?: Partial<AutopilotPermissions>;
  pausedPlatforms?: string[];
  /** Set true only after the user has seen the honest range and still wants it. */
  acceptAggressive?: boolean;
  /** Restart the measurement window from today. */
  restartWindow?: boolean;
}

/**
 * Creates or updates the goal. A HIGHLY_AGGRESSIVE target is refused once with
 * the real expected range — that is the "500 leads in 1 week is not possible"
 * guard, and it is returned as data so the UI can offer the recommended target.
 */
export async function saveGrowthGoal(
  workspaceId: string,
  data: SaveGoalInput
): Promise<{ success: boolean; goal?: any; error?: string; feasibility?: GoalFeasibilityResult }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const leadTarget = Math.max(1, Math.round(Number(data.leadTarget) || 0));
    const timeframeDays = Math.max(1, Math.round(Number(data.timeframeDays) || 0));
    const leadSources = normalizeLeadSources(data.leadSources);
    const targetPlatforms = Array.isArray(data.targetPlatforms) ? data.targetPlatforms : [];

    if (!leadSources.includes("WEBSITE") && targetPlatforms.length === 0) {
      return {
        success: false,
        error: "Pick at least one platform, or add Website as a lead source.",
      };
    }

    const { validateGoalFeasibility } = await import("@/lib/types/growth");
    const feasibility = validateGoalFeasibility({
      leadTarget,
      timeframeDays,
      leadType: data.leadType,
      channelCount: targetPlatforms.length || 1,
      leadSources,
      articlesPerWeek: data.articlesPerWeek ?? undefined,
    });

    if (feasibility.feasibilityLevel === "HIGHLY_AGGRESSIVE" && !data.acceptAggressive) {
      return {
        success: false,
        feasibility,
        error: `${leadTarget} ${leadTypeLabel(data.leadType, leadTarget === 1 ? 1 : 2)} in ${timeframeDays} days is not achievable organically. The honest range at this pace is ${feasibility.estimatedRealisticMin}–${feasibility.estimatedRealisticMax}. Recommended target: ${feasibility.recommendedTarget}.`,
      };
    }

    // Daily cap defaults to the pace the funnel actually needs, +1 head-room,
    // so autopilot never floods the account.
    const derivedCap =
      data.dailyPostCap != null
        ? Math.max(1, Math.round(Number(data.dailyPostCap)))
        : Math.max(1, Math.min(8, Math.ceil(leadTarget / Math.max(1, timeframeDays)) + 1));

    const articlesPerWeek = leadSources.includes("WEBSITE")
      ? Math.max(1, Math.min(7, Math.round(Number(data.articlesPerWeek ?? 2))))
      : null;

    const graceMinutes = Math.max(0, Math.min(720, Math.round(Number(data.graceMinutes ?? 15))));
    const ctaDestinations = asRecord(data.ctaDestinations);

    const shared = {
      leadTarget,
      leadType: data.leadType,
      customLeadTypeName: data.customLeadTypeName || null,
      timeframeDays,
      targetPlatforms,
      leadSources,
      ctaDestinations: ctaDestinations as any,
      dailyPostCap: derivedCap,
      articlesPerWeek,
      graceMinutes,
      ...(data.pausedPlatforms ? { pausedPlatforms: data.pausedPlatforms } : {}),
      ...(data.autopilotMode ? { autopilotMode: data.autopilotMode } : {}),
      ...(data.autopilotPermissions ? { autopilotPermissions: data.autopilotPermissions as any } : {}),
    };

    const updated = await (prisma as any).growthGoal.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        ...shared,
        autopilotMode: data.autopilotMode || "AUTOPILOT",
        startDate: new Date(),
        status: "INSUFFICIENT_DATA",
        statusReason: "Goal saved. Build the plan to start.",
      },
      update: {
        ...shared,
        ...(data.restartWindow ? { startDate: new Date() } : {}),
        updatedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/chat");
    return { success: true, goal: updated, feasibility };
  } catch (error: any) {
    console.error("[saveGrowthGoal] error:", error);
    return { success: false, error: error?.message || "Failed to save the goal." };
  }
}

/** "Reset" counterpart of Save — removes the goal and its cached strategy. */
export async function resetGrowthGoal(workspaceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    await (prisma as any).growthGoal.delete({ where: { workspaceId } }).catch(() => null);
    const { cacheSet } = await import("@/lib/redis");
    await cacheSet(`growth:strategy:${workspaceId}`, null as any, 1).catch(() => null);
    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to reset the goal." };
  }
}

export async function toggleAutopilot(
  workspaceId: string,
  options: {
    mode?: AutopilotMode;
    isAutopilotPaused?: boolean;
    isPublishingPaused?: boolean;
    pausedPlatforms?: string[];
    permissions?: AutopilotPermissions;
    dailyPostCap?: number;
    graceMinutes?: number;
    articlesPerWeek?: number;
  }
) {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const updateData: any = {};
    if (options.mode !== undefined) updateData.autopilotMode = options.mode;
    if (options.isAutopilotPaused !== undefined) updateData.isAutopilotPaused = options.isAutopilotPaused;
    if (options.isPublishingPaused !== undefined) updateData.isPublishingPaused = options.isPublishingPaused;
    if (options.pausedPlatforms !== undefined) updateData.pausedPlatforms = options.pausedPlatforms;
    if (options.permissions !== undefined) updateData.autopilotPermissions = options.permissions;
    if (options.dailyPostCap !== undefined) updateData.dailyPostCap = Math.max(1, Math.min(20, options.dailyPostCap));
    if (options.graceMinutes !== undefined) updateData.graceMinutes = Math.max(0, Math.min(720, options.graceMinutes));
    if (options.articlesPerWeek !== undefined)
      updateData.articlesPerWeek = Math.max(0, Math.min(7, options.articlesPerWeek));

    if (Object.keys(updateData).length === 0) return { success: true };

    const updated = await (prisma as any).growthGoal.update({
      where: { workspaceId },
      data: updateData,
    });

    revalidatePath("/dashboard/goals");
    return { success: true, goal: updated };
  } catch (error: any) {
    console.error("[toggleAutopilot] error:", error);
    return { success: false, error: error?.message || "No goal to update yet." };
  }
}

/** Saves a CTA destination for one platform (or `default`) — fixes needsDestination. */
export async function saveCtaDestination(
  workspaceId: string,
  platform: string,
  destination: string
): Promise<{ success: boolean; error?: string; ctaDestinations?: Record<string, string> }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const key = (platform || "default").toLowerCase();
    const trimmed = (destination || "").trim();

    const goal = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } });
    if (!goal) return { success: false, error: "Save the goal first." };

    const map = asRecord(goal.ctaDestinations) || {};
    if (trimmed) {
      try {
        // Throws for garbage input — the user gets a real error instead of a dead link
        new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      } catch {
        return { success: false, error: "That does not look like a valid URL." };
      }
      map[key] = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    } else {
      delete map[key];
    }

    await (prisma as any).growthGoal.update({
      where: { workspaceId },
      data: { ctaDestinations: (Object.keys(map).length ? map : null) as any },
    });

    revalidatePath("/dashboard/goals");
    return { success: true, ctaDestinations: map };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to save the destination." };
  }
}

export async function persistGrowthStrategy(
  workspaceId: string,
  strategy: GrowthStrategy
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    await storeStrategy(workspaceId, strategy);
    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to save the plan." };
  }
}

// ============================================================================
// FEASIBILITY
// ============================================================================

/**
 * Instant, LLM-free feasibility check. Uses the workspace's own measured
 * conversion rates when there is enough data, otherwise published benchmarks —
 * and says which one it used.
 */
export async function validateGoalAction(
  workspaceId: string,
  leadTarget: number,
  timeframeDays: number,
  leadType: string,
  leadSources?: LeadSource[],
  articlesPerWeek?: number
): Promise<GoalFeasibilityResult & { isMeasured: boolean; measuredNote?: string }> {
  const { validateGoalFeasibility } = await import("@/lib/types/growth");

  let channelCount = 4;
  let metrics: GrowthMetrics | null = null;

  try {
    if (!(await ownsWorkspace(workspaceId))) throw new Error(NOT_YOURS);
    const [accounts, m] = await Promise.all([
      prisma.socialAccount.count({ where: { workspaceId } }).catch(() => 0),
      getGrowthMetrics(workspaceId, null).catch(() => null),
    ]);
    if (accounts > 0) channelCount = accounts;
    metrics = m;
  } catch {
    /* falls through to benchmark-only validation, which reads nothing */
  }

  const base = validateGoalFeasibility({
    leadTarget,
    timeframeDays,
    leadType,
    channelCount,
    leadSources,
    articlesPerWeek,
  });

  if (!metrics?.isMeasured || metrics.lifetimePosts === 0) {
    return { ...base, isMeasured: false };
  }

  // Measured override: this workspace's real leads-per-post beats any benchmark.
  // 6 posts/day is the sustainable organic ceiling we plan against.
  const SUSTAINABLE_POSTS_PER_DAY = 6;
  const leadsPerPost = metrics.lifetimeLeads / metrics.lifetimePosts;
  const realisticMax = Math.max(1, Math.round(leadsPerPost * SUSTAINABLE_POSTS_PER_DAY * timeframeDays));
  const realisticMin = Math.max(1, Math.round(realisticMax * 0.5));
  const recommended = Math.max(1, Math.round((realisticMin + realisticMax) / 2));

  const level =
    leadTarget <= realisticMax * 1.1
      ? "REALISTIC"
      : leadTarget <= realisticMax * 2.2
        ? "MODERATE"
        : "HIGHLY_AGGRESSIVE";

  return {
    ...base,
    feasibilityLevel: level,
    isFeasible: level !== "HIGHLY_AGGRESSIVE",
    estimatedRealisticMin: realisticMin,
    estimatedRealisticMax: realisticMax,
    recommendedTarget: recommended,
    dailyPaceRealistic: Number((recommended / Math.max(1, timeframeDays)).toFixed(2)),
    explanation: `Based on your own tracked data (${metrics.lifetimeLeads} confirmed leads from ${metrics.lifetimePosts} published posts, ${metrics.lifetimeClicks} clicks), ${realisticMin}–${realisticMax} ${leadTypeLabel(leadType)} in ${timeframeDays} days is what this account currently produces.`,
    isMeasured: true,
    measuredNote: `Measured from ${metrics.lifetimePosts} posts, ${metrics.lifetimeClicks} clicks, ${metrics.lifetimeLeads} confirmed leads.`,
  };
}

// ============================================================================
// SOCIAL TASK EXECUTION
// ============================================================================

export interface ExecuteTaskResult {
  success: boolean;
  taskId?: string;
  postId?: string;
  platform?: string;
  format?: string;
  status?: string;
  mediaUrl?: string | null;
  caption?: string;
  hashtags?: string[];
  shortUrl?: string | null;
  scheduledFor?: string | null;
  needsDestination?: boolean;
  warning?: string;
  error?: string;
}

/**
 * Generates the caption (+ optional AI media) for one social task, creates the
 * real Post row, attaches a tracked short link and schedules it.
 *
 * The post is marked with `settings.origin = "growth-autopilot"` — `source` is
 * NOT used for this, because `source` gets overwritten with the live URL at
 * publish time.
 */
export async function executeGrowthPlanTask(
  workspaceId: string,
  task: GrowthPlanTask,
  options?: {
    generateVisuals?: boolean;
    scheduleNow?: boolean;
    /** Server-side only (SSE route / cron) — enables a real Stop. */
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
    /** INTERNAL_CALL_TOKEN when called by the cron / SSE route instead of a user. */
    internalToken?: string;
  }
): Promise<ExecuteTaskResult> {
  try {
    if (!(await ownsWorkspace(workspaceId, options?.internalToken))) {
      return { success: false, taskId: task.id, error: NOT_YOURS };
    }

    const [workspace, goal] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, include: { brandDNA: true } }),
      (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null),
    ]);

    if (!workspace) return { success: false, taskId: task.id, error: "Workspace not found." };

    const brandName = (workspace.name || "").trim();
    const industry = (workspace.industry || "").trim();
    if (!brandName && !industry) {
      return {
        success: false,
        taskId: task.id,
        error:
          "Add your business name and industry (Brand DNA) first — the AI will not guess what your business does.",
      };
    }

    if (options?.signal?.aborted) {
      return { success: false, taskId: task.id, error: "Stopped by user." };
    }

    const capability = getPlatformCapability(task.platform.toLowerCase() as any, task.format);
    const dna: any = workspace.brandDNA || {};
    const clickable = isCaptionLinkClickable(task.platform);

    options?.onProgress?.(`Writing ${task.platform} ${task.format} copy…`);

    const brandLines = [
      brandName && `Business: ${brandName}`,
      industry && `What they do: ${industry}`,
      dna.targetAudience && `Target audience: ${dna.targetAudience}`,
      dna.tone && `Brand tone: ${dna.tone}`,
      dna.writingStyle && `Writing style: ${dna.writingStyle}`,
      Array.isArray(dna.forbiddenWords) && dna.forbiddenWords.length
        ? `Never use these words: ${dna.forbiddenWords.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are the Content Creator agent writing one organic ${task.platform} ${task.format} post for a real business.

${brandLines}

TASK
Topic: ${task.topic}
Hook angle: ${task.hook}
${task.angle ? `Angle: ${task.angle}` : ""}
CTA intent: ${task.cta || "Invite the reader to get in touch"}
Role in the lead goal: ${task.leadGoalRole}

PLATFORM RULES
- Hard caption limit: ${capability.captionLimit} characters. Stay under it.
- Max hashtags: ${capability.hashtagLimit}
- Media type: ${capability.mediaType}
${clickable ? "- Links in the caption ARE clickable on this platform." : "- Links in the caption are NOT clickable on this platform, so the CTA must tell the reader the link is in the bio."}

LINK RULE (critical)
Put the exact placeholder ${LINK_PLACEHOLDER} where the link belongs in the CTA.
Never write a real URL, never write a domain name, never invent a landing page.

WRITING RULES
- Specific and useful. No corporate filler, no "in today's fast-paced world".
- Only claim things that follow from the business description above. Do not invent
  clients, awards, numbers or case studies.

OUTPUT VALID JSON ONLY:
{
  "caption": "full caption including the hook and a CTA containing ${LINK_PLACEHOLDER}",
  "hashtags": ["#Tag1"],
  "visualPrompt": "detailed prompt for an image/video generator, describing the visual only",
  "mediaType": "${capability.mediaType}"
}`;

    const res = await vertexProvider.generateJSON([{ role: "user", content: prompt }], {
      modelName: MODELS.CONTENT_CREATOR,
      temperature: 0.4,
    });

    if (options?.signal?.aborted) {
      return { success: false, taskId: task.id, error: "Stopped by user." };
    }

    let caption: string =
      (typeof res?.caption === "string" && res.caption.trim()) ||
      `${task.hook}\n\n${task.topic}\n\n${task.cta || ""}\n\n${LINK_PLACEHOLDER}`;
    const hashtags = normalizeHashtags(res?.hashtags || [], { limit: capability.hashtagLimit });
    const visualPrompt =
      (typeof res?.visualPrompt === "string" && res.visualPrompt.trim()) ||
      `${task.topic} — clean, professional commercial photography, no text overlay`;

    const isVideo =
      capability.mediaType === "video" ||
      /reel|short|video/i.test(task.format || "");

    let mediaUrl: string | undefined;
    let actualMediaType = isVideo ? "video" : "image";
    let mediaWarning: string | undefined;

    if (options?.generateVisuals) {
      options?.onProgress?.(`Generating ${isVideo ? "video" : "image"}…`);
      try {
        const assets = await generateMediaAsset({
          platform: task.platform,
          contentType: task.format,
          mediaType: isVideo ? "video" : "image",
          prompt: visualPrompt,
          aspectRatio: capability.defaultAspectRatio,
          imageModel: MODELS.VISUALIZER,
          topic: task.topic,
          signal: options?.signal,
          onProgress: options?.onProgress,
        } as any);
        if (assets[0]?.url) {
          mediaUrl = assets[0].url;
          actualMediaType = assets[0].type;
        }
      } catch (mediaErr: any) {
        if (mediaErr?.name === "AbortError" || options?.signal?.aborted) {
          return { success: false, taskId: task.id, error: "Stopped by user." };
        }
        mediaWarning = `Copy is ready but the visual failed: ${mediaErr?.message || "media generation error"}`;
        console.warn("[executeGrowthPlanTask] media generation failed:", mediaErr);
      }
    }

    // ── Schedule time: never instant. The grace window is what makes autopilot
    //    safe — the user can still delete the post before it goes live.
    const graceMinutes = Math.max(0, Number(goal?.graceMinutes ?? 15));
    let scheduledDate: Date | null = null;
    if (options?.scheduleNow) {
      const earliest = new Date(Date.now() + graceMinutes * 60 * 1000);
      const planned = task.date ? new Date(task.date) : null;
      scheduledDate =
        planned && !isNaN(planned.getTime()) && planned.getTime() > earliest.getTime() ? planned : earliest;
    }

    const post = await prisma.post.create({
      data: {
        workspaceId,
        platform: task.platform,
        format: task.format,
        content: stripLinkPlaceholder(caption),
        hashtags,
        imageUrl: mediaUrl,
        imagePrompt: visualPrompt,
        mediaType: actualMediaType,
        campaignTopic: task.topic,
        campaignHook: task.hook,
        status: options?.scheduleNow ? "SCHEDULED" : "APPROVED",
        scheduledFor: scheduledDate,
        settings: {
          origin: AUTOPILOT_ORIGIN,
          goalId: goal?.id || null,
          taskId: task.id,
          pillarId: task.pillarId || null,
        } as any,
      },
    });

    // ── Tracked CTA link. Needs the postId for attribution, so it is created
    //    after the post and written back into the caption.
    const destination = resolveDestination({
      ctaDestinations: asRecord(goal?.ctaDestinations),
      workspaceWebsite: workspace.website,
      platform: task.platform,
    });

    let shortUrl: string | null = null;
    let trackedLinkId: string | null = null;
    let needsDestination = false;

    if (destination) {
      const link = await createTrackedLink({
        workspaceId,
        platform: task.platform,
        destination,
        postId: post.id,
        goalId: goal?.id || null,
        channel: "SOCIAL",
        pillar: task.pillarId || null,
      });
      if (link) {
        shortUrl = link.shortUrl;
        trackedLinkId = link.id;
        caption = injectTrackedLink(caption, link.shortUrl, { clickable });
      }
    } else {
      needsDestination = true;
      caption = stripLinkPlaceholder(caption);
    }

    const finalCaption = shortUrl ? caption : stripLinkPlaceholder(caption);

    await prisma.post.update({
      where: { id: post.id },
      data: {
        content: finalCaption,
        settings: {
          origin: AUTOPILOT_ORIGIN,
          goalId: goal?.id || null,
          taskId: task.id,
          pillarId: task.pillarId || null,
          trackedLinkId,
          shortUrl,
        } as any,
      },
    });

    if (scheduledDate) {
      const { scheduleEnqueue } = await import("@/lib/redis");
      await scheduleEnqueue(post.id, scheduledDate.getTime()).catch(() => {});
    }

    await patchStrategyTask(workspaceId, task.id, {
      status: options?.scheduleNow ? "SCHEDULED" : "APPROVED",
      postId: post.id,
      mediaUrl: mediaUrl || undefined,
      shortUrl: shortUrl || undefined,
      needsDestination,
      error: undefined,
    }).catch(() => null);

    revalidateGoalSurfaces();

    return {
      success: true,
      taskId: task.id,
      postId: post.id,
      platform: post.platform,
      format: post.format || task.format,
      status: post.status,
      mediaUrl: mediaUrl || null,
      caption: finalCaption,
      hashtags,
      shortUrl,
      scheduledFor: scheduledDate ? scheduledDate.toISOString() : null,
      needsDestination,
      warning:
        mediaWarning ||
        (needsDestination
          ? `No CTA link is set for ${task.platform}, so this post cannot generate a tracked lead. Add a destination URL in the Goal tab.`
          : undefined),
    };
  } catch (error: any) {
    const message =
      error?.name === "AbortError" ? "Stopped by user." : error?.message || "Failed to execute the task.";
    console.error("[executeGrowthPlanTask] error:", error);
    await patchStrategyTask(workspaceId, task.id, { status: "FAILED", error: message }).catch(() => null);
    return { success: false, taskId: task.id, error: message };
  }
}

// ============================================================================
// ARTICLE TASK EXECUTION (Website lead source)
// ============================================================================

export interface ExecuteArticleResult {
  success: boolean;
  taskId?: string;
  keyword?: string;
  title?: string;
  liveUrl?: string | null;
  shortUrl?: string | null;
  wordCount?: number;
  seoScore?: number;
  hasSchema?: boolean;
  logId?: string | null;
  error?: string;
}

/**
 * Writes and publishes one SEO article to the user's own WordPress site.
 *
 * Reuses the existing article pipeline (SERP analysis → generateSeoArticle →
 * publishToWordPress) so the goal and the Article Writer tab share one engine
 * and one connection. Nothing about the topic is hard-coded: the keyword comes
 * from the plan the AI built for this business.
 */
export async function executeGrowthArticleTask(
  workspaceId: string,
  task: GrowthPlanTask,
  options?: {
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
    /** INTERNAL_CALL_TOKEN when called by the cron / SSE route instead of a user. */
    internalToken?: string;
  }
): Promise<ExecuteArticleResult> {
  const keyword = (task.keyword || task.topic || "").trim();

  try {
    if (!(await ownsWorkspace(workspaceId, options?.internalToken))) {
      return { success: false, taskId: task.id, error: NOT_YOURS };
    }
    if (!keyword) {
      return { success: false, taskId: task.id, error: "This article task has no keyword." };
    }

    const { getWordPressConfig } = await import("@/lib/wordpress/siteConfig");
    const [workspace, goal, wp] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, include: { brandDNA: true } }),
      (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null),
      getWordPressConfig(workspaceId),
    ]);

    if (!workspace) return { success: false, taskId: task.id, error: "Workspace not found." };
    if (!wp) {
      return {
        success: false,
        taskId: task.id,
        error:
          "No verified WordPress site is connected, so the article cannot be published. Connect your site first.",
      };
    }
    if (options?.signal?.aborted) return { success: false, taskId: task.id, error: "Stopped by user." };

    const dna: any = workspace.brandDNA || {};

    options?.onProgress?.(`Analysing search results for “${keyword}”…`);
    const { fetchSerpAnalysis } = await import("@/actions/serp");
    const serp = await fetchSerpAnalysis(keyword).catch(() => ({ success: false } as any));

    if (options?.signal?.aborted) return { success: false, taskId: task.id, error: "Stopped by user." };

    options?.onProgress?.("Writing the schema-rich SEO article…");
    const { generateSeoArticle } = await import("@/lib/agents/workers/article-generator");
    const article = await generateSeoArticle({
      keyword,
      title: task.topic && task.topic !== keyword ? task.topic : undefined,
      serpData: serp?.success ? serp.data : undefined,
      brandName: workspace.name || undefined,
      brandTone: dna.tone || undefined,
      targetAudience: dna.targetAudience || undefined,
      industry: workspace.industry || undefined,
      articleSize: "medium",
      targetWebsite: wp.siteUrl,
    } as any);

    if (options?.signal?.aborted) return { success: false, taskId: task.id, error: "Stopped by user." };

    // ── Tracked CTA inside the article body. The link is created first (there is
    //    no Post row for an article) and points back at the user's own
    //    destination with UTMs, so website leads are attributed to this article.
    const destination = resolveDestination({
      ctaDestinations: asRecord(goal?.ctaDestinations),
      workspaceWebsite: workspace.website || wp.siteUrl,
      platform: "website",
    });

    let shortUrl: string | null = null;
    let trackedLinkId: string | null = null;

    if (destination) {
      const link = await createTrackedLink({
        workspaceId,
        platform: "Website",
        destination,
        goalId: goal?.id || null,
        channel: "WEBSITE",
        pillar: task.pillarId || null,
      });
      if (link) {
        shortUrl = link.shortUrl;
        trackedLinkId = link.id;
        // Attribution token: the link's own id doubles as utm_content, so the
        // website tag can trace a form submit back to this article.
        await (prisma as any).trackedLink
          .update({ where: { id: link.id }, data: { postId: link.id } })
          .catch(() => null);
      }
    }

    let html = article.content || "";
    if (shortUrl) {
      const ctaBlock = `\n<p><strong><a href="${shortUrl}" rel="noopener">${
        task.cta || `Talk to ${workspace.name || "our team"} about ${keyword}`
      }</a></strong></p>\n`;
      html = html.includes(LINK_PLACEHOLDER)
        ? html.split(LINK_PLACEHOLDER).join(shortUrl)
        : `${html}${ctaBlock}`;
    } else {
      html = stripLinkPlaceholder(html);
    }

    options?.onProgress?.("Publishing to WordPress…");
    const { publishToWordPress } = await import("@/actions/wordpress");
    const result = await publishToWordPress(
      { siteUrl: wp.siteUrl, username: wp.username, appPassword: wp.appPassword },
      {
        title: article.title,
        content: html,
        status: (wp.defaultStatus as "publish" | "draft") || "publish",
        excerpt: article.excerpt || article.metaDescription,
        categories: wp.defaultCategoryId ? [wp.defaultCategoryId] : undefined,
        author: wp.defaultAuthorId || undefined,
        type: wp.postType || "posts",
        schemaMarkup: article.schemaMarkup,
        focusKeyword: keyword,
        seoPlugin: wp.enableYoastSeo ? "yoast" : "universal",
        meta: {
          _yoast_wpseo_title: article.metaTitle,
          _yoast_wpseo_metadesc: article.metaDescription,
        },
      }
    );

    const logId = await recordPublishLog({
      workspaceId,
      goalId: goal?.id || null,
      trackedLinkId,
      channel: "WEBSITE",
      platform: "Website",
      format: "SEO Article",
      status: result.success ? "PUBLISHED" : "FAILED",
      liveUrl: result.postUrl || null,
      excerpt: article.metaDescription || article.excerpt || article.title,
      topic: article.title,
      keyword,
      error: result.success ? null : result.error || "WordPress rejected the article.",
    });

    if (!result.success) {
      await patchStrategyTask(workspaceId, task.id, {
        status: "FAILED",
        error: result.error || "WordPress publish failed.",
      }).catch(() => null);
      return {
        success: false,
        taskId: task.id,
        keyword,
        title: article.title,
        logId,
        error: result.error || "WordPress rejected the article.",
      };
    }

    await patchStrategyTask(workspaceId, task.id, {
      status: "PUBLISHED",
      liveUrl: result.postUrl || undefined,
      shortUrl: shortUrl || undefined,
      error: undefined,
    }).catch(() => null);

    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/article-writer");

    return {
      success: true,
      taskId: task.id,
      keyword,
      title: article.title,
      liveUrl: result.postUrl || null,
      shortUrl,
      wordCount: article.seoMetrics?.wordCount,
      seoScore: article.seoMetrics?.seoScore,
      hasSchema: Boolean(article.schemaMarkup && article.schemaMarkup.trim().length > 10),
      logId,
    };
  } catch (error: any) {
    const message =
      error?.name === "AbortError" ? "Stopped by user." : error?.message || "Failed to publish the article.";
    console.error("[executeGrowthArticleTask] error:", error);
    await patchStrategyTask(workspaceId, task.id, { status: "FAILED", error: message }).catch(() => null);
    return { success: false, taskId: task.id, keyword, error: message };
  }
}

// ============================================================================
// BATCH — PARALLEL
// ============================================================================

/**
 * Runs every pending task in today's plan, three at a time. Concurrency 3 keeps
 * us inside Vertex rate limits while still being far faster than the old
 * sequential loop (that is the "workflow parallel" requirement).
 */
export async function executeTodayPlanBatch(
  workspaceId: string,
  options?: {
    generateVisuals?: boolean;
    taskIds?: string[];
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
    /** INTERNAL_CALL_TOKEN when called by the cron / SSE route instead of a user. */
    internalToken?: string;
  }
) {
  try {
    if (!(await ownsWorkspace(workspaceId, options?.internalToken))) {
      return { success: false, error: NOT_YOURS };
    }

    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
    const strategy = await loadStrategy(workspaceId, goalRow);

    if (!strategy || !Array.isArray(strategy.todayPlan) || strategy.todayPlan.length === 0) {
      return { success: false, error: "No plan yet. Build the growth plan first." };
    }

    const pausedPlatforms: string[] = (goalRow?.pausedPlatforms || []).map((p: string) => p.toLowerCase());
    const dailyCap = Math.max(1, Number(goalRow?.dailyPostCap ?? 8));

    const pending = strategy.todayPlan.filter((t) => {
      if (options?.taskIds?.length && !options.taskIds.includes(t.id)) return false;
      if (t.status === "SCHEDULED" || t.status === "PUBLISHED") return false;
      if (t.channel !== "WEBSITE" && pausedPlatforms.includes((t.platform || "").toLowerCase())) return false;
      return true;
    });

    const socialTasks = pending.filter((t) => t.channel !== "WEBSITE").slice(0, dailyCap);
    const articleTasks = pending.filter((t) => t.channel === "WEBSITE");
    const queue = [...socialTasks, ...articleTasks];

    if (queue.length === 0) {
      return { success: true, count: 0, tasks: [], message: "Nothing left to run in today's plan." };
    }

    const results = await runWithConcurrency(queue, GENERATION_LANES, async (task) => {
      if (options?.signal?.aborted) {
        return { success: false, taskId: task.id, error: "Stopped by user." };
      }
      if (task.channel === "WEBSITE") {
        return executeGrowthArticleTask(workspaceId, task, {
          signal: options?.signal,
          onProgress: options?.onProgress,
          internalToken: INTERNAL_CALL_TOKEN,
        });
      }
      return executeGrowthPlanTask(workspaceId, task, {
        generateVisuals: options?.generateVisuals ?? true,
        scheduleNow: true,
        signal: options?.signal,
        onProgress: options?.onProgress,
        internalToken: INTERNAL_CALL_TOKEN,
      });
    });

    const succeeded = results.filter((r: any) => r.success);
    const failed = results.filter((r: any) => !r.success);
    const skippedByCap = pending.filter((t) => t.channel !== "WEBSITE").length - socialTasks.length;

    revalidateGoalSurfaces();

    return {
      success: succeeded.length > 0,
      count: succeeded.length,
      tasks: results,
      failedCount: failed.length,
      skippedByCap,
      message:
        succeeded.length === 0
          ? failed[0]?.error || "No task could be completed."
          : `${succeeded.length} task${succeeded.length === 1 ? "" : "s"} done${
              failed.length ? `, ${failed.length} failed` : ""
            }${skippedByCap > 0 ? ` — ${skippedByCap} held back by your daily cap of ${dailyCap}` : ""}.`,
    };
  } catch (error: any) {
    console.error("[executeTodayPlanBatch] error:", error);
    return { success: false, error: error?.message || "Failed to run today's plan." };
  }
}

// ============================================================================
// PER-TASK CONTROLS (every button has its counterpart)
// ============================================================================

/** Edit caption — Save counterpart of the inline editor. */
export async function updateGrowthTaskCaption(
  workspaceId: string,
  taskId: string,
  caption: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
    const strategy = await loadStrategy(workspaceId, goalRow);
    const task = findTask(strategy, taskId);
    if (!task?.postId) return { success: false, error: "This task has no generated post yet." };

    await prisma.post.update({
      where: { id: task.postId },
      data: { content: (caption || "").trim() },
    });

    revalidateGoalSurfaces();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to save the caption." };
  }
}

/** Replace (upload) or Remove media — pass `null` to remove. */
export async function setGrowthTaskMedia(
  workspaceId: string,
  taskId: string,
  mediaUrl: string | null,
  mediaType?: "image" | "video"
): Promise<{ success: boolean; mediaUrl?: string | null; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
    const strategy = await loadStrategy(workspaceId, goalRow);
    const task = findTask(strategy, taskId);
    if (!task?.postId) return { success: false, error: "This task has no generated post yet." };

    let finalUrl = mediaUrl;
    if (finalUrl && finalUrl.startsWith("data:")) {
      const { uploadBase64ToStorage } = await import("@/lib/supabase");
      finalUrl = await uploadBase64ToStorage(finalUrl, `goal-${taskId}-${Date.now()}.png`);
      if (!finalUrl) return { success: false, error: "Upload failed. Try a smaller file." };
    }

    await prisma.post.update({
      where: { id: task.postId },
      data: {
        imageUrl: finalUrl,
        mediaType: finalUrl ? mediaType || "image" : "text",
      },
    });

    await patchStrategyTask(workspaceId, taskId, { mediaUrl: finalUrl || undefined });
    revalidateGoalSurfaces();
    return { success: true, mediaUrl: finalUrl };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to update the media." };
  }
}

/** Regenerate just the visual, keeping the caption. */
export async function regenerateGrowthTaskMedia(
  workspaceId: string,
  taskId: string,
  options?: { prompt?: string; signal?: AbortSignal }
): Promise<{ success: boolean; mediaUrl?: string; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
    const strategy = await loadStrategy(workspaceId, goalRow);
    const task = findTask(strategy, taskId);
    if (!task?.postId) return { success: false, error: "This task has no generated post yet." };

    const post = await prisma.post.findUnique({ where: { id: task.postId } });
    if (!post) return { success: false, error: "Post not found." };

    const capability = getPlatformCapability(post.platform.toLowerCase() as any, post.format || task.format);
    const isVideo = post.mediaType === "video" || /reel|short|video/i.test(post.format || "");

    const assets = await generateMediaAsset({
      platform: post.platform,
      contentType: post.format || task.format,
      mediaType: isVideo ? "video" : "image",
      prompt: (options?.prompt || post.imagePrompt || task.topic || "").trim(),
      aspectRatio: capability.defaultAspectRatio,
      imageModel: MODELS.VISUALIZER,
      topic: task.topic,
      signal: options?.signal,
    } as any);

    const url = assets[0]?.url;
    if (!url) return { success: false, error: "The generator returned no media." };

    await prisma.post.update({
      where: { id: post.id },
      data: { imageUrl: url, mediaType: assets[0].type, imagePrompt: options?.prompt || post.imagePrompt },
    });
    await patchStrategyTask(workspaceId, taskId, { mediaUrl: url });

    revalidateGoalSurfaces();
    return { success: true, mediaUrl: url };
  } catch (error: any) {
    const message =
      error?.name === "AbortError" ? "Stopped by user." : error?.message || "Failed to regenerate the visual.";
    return { success: false, error: message };
  }
}

/** Delete — removes the generated post and puts the task back to pending. */
export async function deleteGrowthTaskPost(
  workspaceId: string,
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
    const strategy = await loadStrategy(workspaceId, goalRow);
    const task = findTask(strategy, taskId);

    if (task?.postId) {
      const { removeFromScheduleQueue } = await import("@/lib/redis");
      await removeFromScheduleQueue(task.postId).catch(() => {});
      await prisma.post.delete({ where: { id: task.postId } }).catch(() => null);
    }

    await patchStrategyTask(workspaceId, taskId, {
      status: "PENDING_APPROVAL",
      postId: undefined,
      mediaUrl: undefined,
      shortUrl: undefined,
      liveUrl: undefined,
      error: undefined,
    });

    revalidateGoalSurfaces();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to delete the post." };
  }
}

/**
 * Drops a task out of the plan entirely — the counterpart to "it appeared on my
 * screen and I do not want it".
 *
 * `deleteGrowthTaskPost` only throws away what was generated and leaves the task
 * waiting to be generated again; this removes the row itself, so neither you nor
 * autopilot will see it today. The plan is rebuilt from the goal, so a removed
 * task comes back on the next Rebuild — which is the honest behaviour: the goal
 * still needs that post to be reachable.
 */
export async function removeGrowthTask(
  workspaceId: string,
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
    const strategy = await loadStrategy(workspaceId, goalRow);
    if (!strategy) return { success: false, error: "There is no plan to remove it from." };

    const task = findTask(strategy, taskId);
    if (!task) return { success: false, error: "That task is not in the plan any more." };
    if (task.status === "PUBLISHED") {
      return {
        success: false,
        error: "This one is already live, so it cannot be removed from the plan. Delete it under Published instead.",
      };
    }

    // A scheduled post would still fire from the queue after the task is gone.
    if (task.postId) {
      const { removeFromScheduleQueue } = await import("@/lib/redis");
      await removeFromScheduleQueue(task.postId).catch(() => {});
      await prisma.post.delete({ where: { id: task.postId } }).catch(() => null);
    }

    const drop = (list: GrowthPlanTask[] | undefined) =>
      Array.isArray(list) ? list.filter((t) => t.id !== taskId) : [];

    await storeStrategy(workspaceId, {
      ...strategy,
      todayPlan: drop(strategy.todayPlan),
      weeklyPlan: drop(strategy.weeklyPlan),
    });

    revalidateGoalSurfaces();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to remove that task." };
  }
}

/** Publish now — skips the remaining grace window for one task. */
export async function publishGrowthTaskNow(
  workspaceId: string,
  taskId: string
): Promise<{ success: boolean; liveUrl?: string | null; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } }).catch(() => null);
    if (goalRow?.isPublishingPaused) {
      return { success: false, error: "Publishing is paused. Resume it in the Autopilot tab first." };
    }

    const strategy = await loadStrategy(workspaceId, goalRow);
    const task = findTask(strategy, taskId);
    if (!task?.postId) return { success: false, error: "Generate this task first." };

    // Make it due, then run the shared dispatcher so the atomic claim and the
    // permanent PublishLog row behave exactly like the cron path.
    await prisma.post.update({
      where: { id: task.postId },
      data: { status: "SCHEDULED", scheduledFor: new Date(Date.now() - 1000) },
    });

    const { publishDuePosts } = await import("@/lib/publishing/dispatch");
    const result = await publishDuePosts({ postIds: [task.postId], limit: 1 });
    const outcome = result.results[0];

    if (!outcome || outcome.status === "FAILED") {
      await patchStrategyTask(workspaceId, taskId, {
        status: "FAILED",
        error: outcome?.error || "Publish failed.",
      });
      return { success: false, error: outcome?.error || "Publish failed." };
    }

    await patchStrategyTask(workspaceId, taskId, {
      status: "PUBLISHED",
      liveUrl: outcome.liveUrl || undefined,
      error: undefined,
    });

    revalidateGoalSurfaces();
    return { success: true, liveUrl: outcome.liveUrl || null };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to publish." };
  }
}

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

export async function applyGrowthRecommendation(
  workspaceId: string,
  recommendationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } });
    if (!goalRow) return { success: false, error: "No goal to apply this to." };

    const strategy = await loadStrategy(workspaceId, goalRow);
    const rec = strategy?.recommendations?.find((r) => r.id === recommendationId);
    if (!strategy || !rec) return { success: false, error: "Recommendation not found." };

    rec.applied = true;
    strategy.decisions = [
      {
        id: `dec-applied-${recommendationId}`,
        date: new Date().toISOString(),
        title: `Applied: ${rec.title}`,
        action: rec.description,
        reason: rec.why,
        data: rec.data,
        expectedImpact: rec.expectedImpact,
        status: "APPLIED",
      },
      ...(Array.isArray(strategy.decisions) ? strategy.decisions : []),
    ];

    await storeStrategy(workspaceId, strategy);
    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to apply the recommendation." };
  }
}

/** Dismiss counterpart of Apply. */
export async function dismissGrowthRecommendation(
  workspaceId: string,
  recommendationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } });
    const strategy = await loadStrategy(workspaceId, goalRow);
    if (!strategy?.recommendations) return { success: false, error: "Nothing to dismiss." };

    strategy.recommendations = strategy.recommendations.filter((r) => r.id !== recommendationId);
    await storeStrategy(workspaceId, strategy);
    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to dismiss." };
  }
}

// ============================================================================
// ACTIVITY FEED
// ============================================================================

export interface GrowthActivityItem {
  id: string;
  postId?: string;
  type: "POST_SCHEDULED" | "POST_PUBLISHED" | "POST_FAILED" | "DRAFT_CREATED" | "ARTICLE_PUBLISHED" | "DECISION_MADE" | "RECOMMENDATION_APPLIED";
  title: string;
  topic?: string;
  hook?: string;
  captionPreview?: string;
  platform?: string;
  format?: string;
  channel?: "SOCIAL" | "WEBSITE";
  mediaUrl?: string | null;
  mediaType?: string;
  status?: string;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  /** Real platform URL only. Null means the platform returned none — the UI says so. */
  publishedUrl?: string | null;
  shortUrl?: string | null;
  editorUrl: string;
  studioUrl: string;
  /** Measured only. Reach is not available from the platform APIs, so it is absent. */
  stats?: { clicks: number; leads: number };
  error?: string | null;
  timestamp: string;
  formattedTime: string;
}

/**
 * Honest activity feed: published items come from PublishLog (permanent, with the
 * real live URL), upcoming items from the Post table, and strategy decisions from
 * the goal row. No fabricated platform feed links, no zero-filled stat blocks.
 */
export async function getRecentGrowthActivity(workspaceId: string): Promise<GrowthActivityItem[]> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return [];
    const { getPublishHistory } = await import("@/lib/growth/metrics");

    const [history, upcoming, goalRow] = await Promise.all([
      getPublishHistory(workspaceId, { limit: 40 }),
      prisma.post
        .findMany({
          where: { workspaceId, status: { in: ["SCHEDULED", "APPROVED", "DRAFT", "PUBLISHING"] } },
          orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
          take: 25,
        })
        .catch(() => []),
      (prisma as any).growthGoal?.findUnique({ where: { workspaceId } }).catch(() => null),
    ]);

    const items: GrowthActivityItem[] = [];

    for (const row of history) {
      const when = new Date(row.publishedAt);
      const isArticle = row.channel === "WEBSITE";
      const failed = row.status === "FAILED";

      items.push({
        id: `log-${row.id}`,
        postId: row.postId || undefined,
        type: failed ? "POST_FAILED" : isArticle ? "ARTICLE_PUBLISHED" : "POST_PUBLISHED",
        title: failed
          ? `Failed on ${row.platform}`
          : isArticle
            ? `Article published on your website`
            : `Published to ${row.platform}`,
        topic: row.topic || undefined,
        captionPreview: row.excerpt,
        platform: row.platform,
        format: row.format || undefined,
        channel: row.channel,
        mediaUrl: row.mediaUrl,
        mediaType: row.mediaType || undefined,
        status: row.status,
        publishedAt: when.toISOString(),
        publishedUrl: row.liveUrl || null,
        shortUrl: row.shortUrl || null,
        editorUrl: "/dashboard/goals",
        studioUrl: isArticle ? "/dashboard/article-writer" : "/dashboard/ai-studio",
        stats: { clicks: row.clicks, leads: row.leads },
        error: row.error || null,
        timestamp: when.toISOString(),
        formattedTime: formatRelativeTime(when),
      });
    }

    for (const post of upcoming as any[]) {
      const when = post.scheduledFor ? new Date(post.scheduledFor) : new Date(post.createdAt);
      const isScheduled = post.status === "SCHEDULED" || post.status === "PUBLISHING";
      items.push({
        id: `post-${post.id}`,
        postId: post.id,
        type: isScheduled ? "POST_SCHEDULED" : "DRAFT_CREATED",
        title: isScheduled
          ? `Scheduled on ${post.platform} for ${when.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : `Ready for ${post.platform}`,
        topic: post.campaignTopic || undefined,
        hook: post.campaignHook || undefined,
        captionPreview: post.content,
        platform: post.platform,
        format: post.format || undefined,
        channel: "SOCIAL",
        mediaUrl: post.imageUrl || null,
        mediaType: post.mediaType || undefined,
        status: post.status,
        scheduledFor: post.scheduledFor ? new Date(post.scheduledFor).toISOString() : null,
        publishedAt: null,
        publishedUrl: null,
        editorUrl: "/dashboard/content",
        studioUrl: "/dashboard/ai-studio",
        error: post.publishError || null,
        timestamp: when.toISOString(),
        formattedTime: formatRelativeTime(when),
      });
    }

    const decisions = Array.isArray(goalRow?.decisions) ? goalRow.decisions : [];
    for (const dec of decisions.slice(0, 10)) {
      const decDate = dec?.date ? new Date(dec.date) : new Date();
      const when = isNaN(decDate.getTime()) ? new Date() : decDate;
      items.push({
        id: `dec-${dec?.id || when.getTime()}`,
        type: dec?.status === "APPLIED" ? "RECOMMENDATION_APPLIED" : "DECISION_MADE",
        title: dec?.title || "Strategy decision",
        topic: dec?.action,
        hook: dec?.reason,
        captionPreview: [dec?.reason, dec?.expectedImpact && `Expected impact: ${dec.expectedImpact}`]
          .filter(Boolean)
          .join("\n\n"),
        editorUrl: "/dashboard/goals",
        studioUrl: "/dashboard/goals",
        timestamp: when.toISOString(),
        formattedTime: formatRelativeTime(when),
      });
    }

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error("[getRecentGrowthActivity] error:", error);
    return [];
  }
}

// ============================================================================
// STRATEGY GENERATION (non-streaming entry point; the SSE route is preferred)
// ============================================================================

export async function buildGrowthStrategyAction(
  workspaceId: string,
  userId: string
): Promise<{ success: boolean; strategy?: GrowthStrategy; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
    const goalRow = await (prisma as any).growthGoal.findUnique({ where: { workspaceId } });
    if (!goalRow) return { success: false, error: "Save your goal first." };

    const strategy = await generateGrowthStrategy({
      workspaceId,
      userId,
      leadTarget: goalRow.leadTarget,
      leadType: goalRow.leadType,
      timeframeDays: goalRow.timeframeDays,
      targetPlatforms: goalRow.targetPlatforms || [],
      leadSources: normalizeLeadSources(goalRow.leadSources),
      articlesPerWeek: goalRow.articlesPerWeek ?? undefined,
      ctaDestinations: asRecord(goalRow.ctaDestinations),
    });

    await storeStrategy(workspaceId, strategy);
    revalidatePath("/dashboard/goals");
    return { success: true, strategy };
  } catch (error: any) {
    console.error("[buildGrowthStrategyAction] error:", error);
    return { success: false, error: error?.message || "Failed to build the plan." };
  }
}
