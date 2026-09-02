import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { acquireNamedLock, releaseNamedLock, scheduleEnqueue } from "@/lib/redis";
import { publishDuePosts, purgePublishedPosts } from "@/lib/publishing/dispatch";
import { getBestTimeSpec, getNextBestTimeFromSpec } from "@/lib/bestPublishTime";
import { getClickTimingBuckets } from "@/lib/growth/metrics";
import { learnBestTime } from "@/lib/growth/learning";
import { generateGrowthStrategy } from "@/lib/agents/growthEngine";
import { GrowthPlanTask, GrowthStrategy, LeadSource } from "@/lib/types/growth";
import { normalizePlatformToEnum } from "@/lib/publishers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Autonomous daily engine — "bina user review posting karta rahe ga".
 *
 * Runs per workspace that has an AUTOPILOT goal inside its window:
 *   1. Catch-up — if today's plan has not run yet, build/refresh it and execute
 *      today's tasks. A day missed while the app was closed is picked up on the
 *      next run, which is what makes this survive a once-a-day Vercel Hobby cron.
 *   2. Schedule each post at max(next best time, now + graceMinutes) so the user
 *      always has a window to delete something before it goes live.
 *   3. Publish everything already due.
 *   4. Retention — autopilot Post rows are purged after 3 days; the permanent
 *      PublishLog row (and its live link) is never touched.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` for Vercel Cron, or `?key=<CRON_SECRET>`
 * so an external scheduler (cron-job.org, Upstash QStash) can hit it every few
 * minutes for exact publish times.
 */

const LOCK_NAME = "growth-autopilot";

interface WorkspaceOutcome {
  workspaceId: string;
  planBuilt: boolean;
  tasksRun: number;
  tasksFailed: number;
  articlesRun: number;
  skipped?: string;
  error?: string;
}

function isSameLocalDay(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function normalizeLeadSources(value: any): LeadSource[] {
  const list = Array.isArray(value) ? value : [];
  const out = list
    .map((v) => String(v).toUpperCase())
    .filter((v): v is LeadSource => v === "SOCIAL" || v === "WEBSITE");
  return out.length ? Array.from(new Set(out)) : ["SOCIAL"];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const keyParam = url.searchParams.get("key");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && keyParam !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locked = await acquireNamedLock(LOCK_NAME, 280);
  if (!locked) {
    return NextResponse.json({ message: "Autopilot already running — skipped" }, { status: 200 });
  }

  const outcomes: WorkspaceOutcome[] = [];
  const now = new Date();

  try {
    const goals = await (prisma as any).growthGoal
      .findMany({
        where: { autopilotMode: "AUTOPILOT", isAutopilotPaused: false },
        take: 50,
      })
      .catch(() => [] as any[]);

    for (const goal of goals as any[]) {
      const outcome: WorkspaceOutcome = {
        workspaceId: goal.workspaceId,
        planBuilt: false,
        tasksRun: 0,
        tasksFailed: 0,
        articlesRun: 0,
      };

      try {
        // ── Goal window
        const start = new Date(goal.startDate);
        const end = new Date(start.getTime() + goal.timeframeDays * 24 * 60 * 60 * 1000);
        if (now > end) {
          outcome.skipped = "Goal timeframe has ended.";
          outcomes.push(outcome);
          continue;
        }

        const workspace = await prisma.workspace.findUnique({ where: { id: goal.workspaceId } });
        if (!workspace) {
          outcome.skipped = "Workspace missing.";
          outcomes.push(outcome);
          continue;
        }

        // ── Already ran today? Then only publishing work remains.
        const ranToday = isSameLocalDay(goal.lastPlanRunAt ? new Date(goal.lastPlanRunAt) : null, now);

        if (!ranToday) {
          const leadSources = normalizeLeadSources(goal.leadSources);
          const pausedPlatforms: string[] = (goal.pausedPlatforms || []).map((p: string) =>
            String(p).toLowerCase()
          );

          // Only platforms that are actually connected can be posted to.
          const accounts = await prisma.socialAccount
            .findMany({ where: { workspaceId: goal.workspaceId }, select: { platform: true } })
            .catch(() => [] as any[]);
          const connected = new Set(
            (accounts as any[]).map((a) => String(a.platform).toLowerCase())
          );

          const usablePlatforms = (goal.targetPlatforms || []).filter((p: string) => {
            const key = String(p).toLowerCase();
            if (pausedPlatforms.includes(key)) return false;
            const enumName = normalizePlatformToEnum(p);
            return enumName ? connected.has(String(enumName).toLowerCase()) : false;
          });

          if (usablePlatforms.length === 0 && !leadSources.includes("WEBSITE")) {
            await (prisma as any).growthGoal
              .update({
                where: { workspaceId: goal.workspaceId },
                data: {
                  lastPlanRunAt: now,
                  lastPlanError:
                    "No connected platform is available for this goal. Connect an account or un-pause a platform.",
                },
              })
              .catch(() => null);
            outcome.skipped = "No connected platform available.";
            outcomes.push(outcome);
            continue;
          }

          // ── Build (or refresh) today's plan
          let strategy: GrowthStrategy | null = (goal.strategy as GrowthStrategy) || null;
          const strategyIsStale =
            !strategy ||
            !Array.isArray(strategy.todayPlan) ||
            strategy.todayPlan.length === 0 ||
            strategy.todayPlan.every(
              (t: GrowthPlanTask) => t.status === "SCHEDULED" || t.status === "PUBLISHED"
            );

          if (strategyIsStale) {
            strategy = await generateGrowthStrategy({
              workspaceId: goal.workspaceId,
              userId: workspace.userId,
              leadTarget: goal.leadTarget,
              leadType: goal.leadType,
              timeframeDays: goal.timeframeDays,
              targetPlatforms: usablePlatforms,
              leadSources,
              articlesPerWeek: goal.articlesPerWeek ?? undefined,
              ctaDestinations: (goal.ctaDestinations as Record<string, string>) || null,
            });

            await (prisma as any).growthGoal
              .update({
                where: { workspaceId: goal.workspaceId },
                data: {
                  strategy: strategy as any,
                  decisions: strategy.decisions as any,
                  experiments: strategy.experiments as any,
                },
              })
              .catch(() => null);

            const { cacheSet } = await import("@/lib/redis");
            await cacheSet(`growth:strategy:${goal.workspaceId}`, strategy, 86400 * 30).catch(() => null);
            outcome.planBuilt = true;
          }

          // ── Execute today's tasks (parallel, capped)
          const dailyCap = Math.max(1, Number(goal.dailyPostCap ?? 3));
          const pending = (strategy?.todayPlan || []).filter(
            (t: GrowthPlanTask) => t.status !== "SCHEDULED" && t.status !== "PUBLISHED"
          );
          const socialTasks = pending
            .filter(
              (t) =>
                t.channel !== "WEBSITE" &&
                !pausedPlatforms.includes(String(t.platform || "").toLowerCase())
            )
            .slice(0, dailyCap);
          const articleTasks = leadSources.includes("WEBSITE")
            ? pending.filter((t) => t.channel === "WEBSITE")
            : [];

          const { executeGrowthPlanTask, executeGrowthArticleTask } = await import("@/actions/goals");
          const { INTERNAL_CALL_TOKEN } = await import("@/lib/growth/internalCall");

          const socialResults = await Promise.all(
            socialTasks.map((task) =>
              executeGrowthPlanTask(goal.workspaceId, task, {
                generateVisuals: goal.autopilotPermissions?.generateVisuals !== false,
                scheduleNow: true,
                internalToken: INTERNAL_CALL_TOKEN,
              }).catch((err: any) => ({ success: false, error: err?.message, taskId: task.id }))
            )
          );

          // ── Grace window: nothing autopilot creates may go live instantly.
          const graceMs = Math.max(0, Number(goal.graceMinutes ?? 15)) * 60 * 1000;
          // Learn posting windows from this workspace's own clicks, once for the
          // batch; each platform without enough data falls back to the table.
          const timingBuckets = await getClickTimingBuckets(goal.workspaceId).catch(() => []);
          for (const r of socialResults as any[]) {
            if (!r?.success || !r.postId) continue;
            const platformKey = String(r.platform || "").toLowerCase();
            const spec = learnBestTime(platformKey, timingBuckets)?.spec || getBestTimeSpec(platformKey);
            const best = getNextBestTimeFromSpec(spec, now);
            const earliest = new Date(now.getTime() + graceMs);
            const when = best.getTime() > earliest.getTime() ? best : earliest;

            await prisma.post
              .update({ where: { id: r.postId }, data: { status: "SCHEDULED", scheduledFor: when } })
              .catch(() => null);
            await scheduleEnqueue(r.postId, when.getTime()).catch(() => {});
          }

          const articleResults = articleTasks.length
            ? await Promise.all(
                articleTasks.map((task) =>
                  executeGrowthArticleTask(goal.workspaceId, task, {
                    internalToken: INTERNAL_CALL_TOKEN,
                  }).catch((err: any) => ({
                    success: false,
                    error: err?.message,
                    taskId: task.id,
                  }))
                )
              )
            : [];

          outcome.tasksRun = (socialResults as any[]).filter((r) => r?.success).length;
          outcome.articlesRun = (articleResults as any[]).filter((r) => r?.success).length;
          outcome.tasksFailed =
            (socialResults as any[]).filter((r) => !r?.success).length +
            (articleResults as any[]).filter((r) => !r?.success).length;

          const firstError =
            (socialResults as any[]).find((r) => !r?.success)?.error ||
            (articleResults as any[]).find((r) => !r?.success)?.error ||
            null;

          await (prisma as any).growthGoal
            .update({
              where: { workspaceId: goal.workspaceId },
              data: {
                lastPlanRunAt: now,
                lastPlanError:
                  outcome.tasksRun + outcome.articlesRun === 0 && firstError ? String(firstError) : null,
              },
            })
            .catch(() => null);
        } else {
          outcome.skipped = "Today's plan already ran.";
        }

        // ── Retention + publish anything due for this workspace
        await purgePublishedPosts([goal.workspaceId]).catch(() => null);

        if (!goal.isPublishingPaused) {
          const published = await publishDuePosts({
            workspaceIds: [goal.workspaceId],
            limit: 20,
          }).catch(() => null);
          if (published) {
            outcome.tasksFailed += published.failed;
          }
        }
      } catch (err: any) {
        outcome.error = err?.message || "Autopilot run failed.";
        await (prisma as any).growthGoal
          .update({
            where: { workspaceId: goal.workspaceId },
            data: { lastPlanRunAt: now, lastPlanError: outcome.error },
          })
          .catch(() => null);
      }

      outcomes.push(outcome);
    }

    // Publish any remaining due autopilot posts across workspaces (catch-up for
    // days when the app was closed and nothing else ran).
    const catchUp = await publishDuePosts({ limit: 50, autopilotOnly: true }).catch(() => null);

    await releaseNamedLock(LOCK_NAME);

    return NextResponse.json(
      {
        message: goals.length === 0 ? "No active autopilot goals" : "Autopilot run complete",
        goals: goals.length,
        outcomes,
        catchUpPublished: catchUp?.published || 0,
        catchUpFailed: catchUp?.failed || 0,
        ranAt: now.toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    await releaseNamedLock(LOCK_NAME).catch(() => {});
    console.error("[growth-autopilot] fatal:", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
