import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { GrowthPlanTask, GrowthStrategy } from "@/lib/types/growth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Streaming task executor for Lead Goal HQ.
 *
 * Why a route and not just the server action: the client holds an
 * `AbortController`, so hitting **Stop** aborts this request, which aborts the
 * `AbortSignal` handed to the LLM and media generators. That makes Stop real
 * rather than cosmetic, and it lets the UI show per-task progress while several
 * tasks run in parallel.
 */

/** Runs `fn` over `items` with at most `limit` in flight. */
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

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId: string = body.workspaceId;
    const taskIds: string[] | undefined = Array.isArray(body.taskIds) ? body.taskIds : undefined;
    const generateVisuals: boolean = body.generateVisuals !== false;
    const scheduleNow: boolean = body.scheduleNow !== false;
    const concurrency = Math.max(1, Math.min(4, Number(body.concurrency) || 3));

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { checkAIAccess } = await import("@/lib/billing/gate");
    const gate = await checkAIAccess(workspaceId);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.message || "Upgrade required", reason: gate.reason, requiredPlan: gate.requiredPlan },
        { status: 403 }
      );
    }

    // ── Resolve the tasks to run from the saved plan
    const goalRow = await (prisma as any).growthGoal
      .findUnique({ where: { workspaceId } })
      .catch(() => null);

    let strategy: GrowthStrategy | null = (goalRow?.strategy as GrowthStrategy) || null;
    if (!strategy) {
      const { cacheGet } = await import("@/lib/redis");
      strategy = await cacheGet<GrowthStrategy>(`growth:strategy:${workspaceId}`).catch(() => null);
    }

    if (!strategy || !Array.isArray(strategy.todayPlan) || strategy.todayPlan.length === 0) {
      return NextResponse.json(
        { error: "No plan to run yet. Build the growth plan first." },
        { status: 400 }
      );
    }

    if (goalRow?.isPublishingPaused && scheduleNow) {
      return NextResponse.json(
        { error: "Publishing is paused. Resume it in the Autopilot tab, or generate without scheduling." },
        { status: 400 }
      );
    }

    const pausedPlatforms: string[] = (goalRow?.pausedPlatforms || []).map((p: string) =>
      String(p).toLowerCase()
    );
    const dailyCap = Math.max(1, Number(goalRow?.dailyPostCap ?? 8));

    const eligible = strategy.todayPlan.filter((t: GrowthPlanTask) => {
      if (taskIds?.length && !taskIds.includes(t.id)) return false;
      if (t.status === "SCHEDULED" || t.status === "PUBLISHED") return false;
      if (t.channel !== "WEBSITE" && pausedPlatforms.includes(String(t.platform || "").toLowerCase()))
        return false;
      return true;
    });

    const socialTasks = eligible.filter((t) => t.channel !== "WEBSITE").slice(0, dailyCap);
    const articleTasks = eligible.filter((t) => t.channel === "WEBSITE");
    const queue = [...socialTasks, ...articleTasks];
    const skippedByCap = eligible.filter((t) => t.channel !== "WEBSITE").length - socialTasks.length;

    // ── SSE plumbing
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    let closed = false;

    const send = async (event: string, data: any) => {
      if (closed) return;
      try {
        await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch {
        closed = true;
      }
    };

    // The client's Stop aborts the request; propagate that into generation.
    const controller = new AbortController();
    req.signal.addEventListener("abort", () => controller.abort(), { once: true });

    (async () => {
      const { executeGrowthPlanTask, executeGrowthArticleTask } = await import("@/actions/goals");

      try {
        await send("batch_started", {
          total: queue.length,
          social: socialTasks.length,
          articles: articleTasks.length,
          skippedByCap,
          dailyCap,
          concurrency,
          message:
            queue.length === 0
              ? "Nothing left to run in today's plan."
              : `Running ${queue.length} task${queue.length === 1 ? "" : "s"}, ${concurrency} at a time.`,
        });

        if (queue.length === 0) {
          await send("batch_done", { total: 0, succeeded: 0, failed: 0, results: [] });
          return;
        }

        const results = await runWithConcurrency(queue, concurrency, async (task) => {
          if (controller.signal.aborted) {
            await send("task_done", { taskId: task.id, success: false, error: "Stopped by user." });
            return { success: false, taskId: task.id, error: "Stopped by user." };
          }

          await send("task_started", {
            taskId: task.id,
            platform: task.platform,
            format: task.format,
            channel: task.channel || "SOCIAL",
            topic: task.topic,
            keyword: task.keyword || null,
          });

          const onProgress = (message: string) => {
            void send("task_progress", { taskId: task.id, message });
          };

          const result =
            task.channel === "WEBSITE"
              ? await executeGrowthArticleTask(workspaceId, task, {
                  signal: controller.signal,
                  onProgress,
                })
              : await executeGrowthPlanTask(workspaceId, task, {
                  generateVisuals,
                  scheduleNow,
                  signal: controller.signal,
                  onProgress,
                });

          await send("task_done", { ...result, taskId: task.id });
          return result;
        });

        const succeeded = results.filter((r: any) => r?.success).length;
        await send("batch_done", {
          total: results.length,
          succeeded,
          failed: results.length - succeeded,
          skippedByCap,
          aborted: controller.signal.aborted,
          results,
        });
      } catch (err: any) {
        await send("batch_error", {
          error:
            err?.name === "AbortError" || controller.signal.aborted
              ? "Stopped by user."
              : err?.message || "Failed to run the plan.",
        });
      } finally {
        closed = true;
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[growth/execute] fatal:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
