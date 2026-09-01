import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { generateGrowthStrategy } from "@/lib/agents/growthEngine";
import { LeadSource, LeadType } from "@/lib/types/growth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Streaming plan builder.
 *
 * Every input comes from the goal the user saved — there are no default target,
 * timeframe or platform values here. Without a saved goal the request is
 * refused, because inventing one would put numbers on screen the user never
 * chose. The client holds an `AbortController`, so Stop aborts this request and
 * the abort propagates into the LLM calls.
 */

function normalizeLeadSources(value: any): LeadSource[] {
  const list = Array.isArray(value) ? value : [];
  const out = list
    .map((v) => String(v).toUpperCase())
    .filter((v): v is LeadSource => v === "SOCIAL" || v === "WEBSITE");
  return out.length ? Array.from(new Set(out)) : ["SOCIAL"];
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const workspaceId: string = body.workspaceId;
    const customGuidance: string | undefined = body.customGuidance || undefined;

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
        {
          error: gate.message || "Upgrade required",
          reason: gate.reason,
          requiredPlan: gate.requiredPlan,
        },
        { status: 403 }
      );
    }

    // ── The plan is built from the saved goal, never from defaults.
    const goal = await (prisma as any).growthGoal
      .findUnique({ where: { workspaceId } })
      .catch(() => null);

    if (!goal) {
      return NextResponse.json(
        { error: "Save your goal first — the plan is built from your target, timeframe and platforms." },
        { status: 400 }
      );
    }

    const leadSources = normalizeLeadSources(goal.leadSources);
    const pausedPlatforms: string[] = (goal.pausedPlatforms || []).map((p: string) =>
      String(p).toLowerCase()
    );
    const targetPlatforms: string[] = (goal.targetPlatforms || []).filter(
      (p: string) => !pausedPlatforms.includes(String(p).toLowerCase())
    );

    if (targetPlatforms.length === 0 && !leadSources.includes("WEBSITE")) {
      return NextResponse.json(
        {
          error:
            "Every platform on this goal is paused. Un-pause one in the Autopilot tab, or add Website as a lead source.",
        },
        { status: 400 }
      );
    }

    // ── SSE plumbing
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    let closed = false;

    const sendEvent = async (event: string, data: any) => {
      if (closed) return;
      try {
        await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch {
        closed = true;
      }
    };

    // Stop from the client aborts the request; forward that into generation.
    const controller = new AbortController();
    req.signal.addEventListener("abort", () => controller.abort(), { once: true });

    (async () => {
      try {
        await sendEvent("strategy_started", {
          leadTarget: goal.leadTarget,
          leadType: goal.leadType,
          timeframeDays: goal.timeframeDays,
          targetPlatforms,
          leadSources,
          message: `Building a plan for ${goal.leadTarget} ${String(goal.leadType)
            .replace(/_/g, " ")
            .toLowerCase()} in ${goal.timeframeDays} days.`,
          timestamp: new Date().toISOString(),
        });

        const strategy = await generateGrowthStrategy({
          workspaceId,
          userId,
          leadTarget: Number(goal.leadTarget),
          leadType: goal.leadType as LeadType,
          timeframeDays: Number(goal.timeframeDays),
          targetPlatforms,
          leadSources,
          articlesPerWeek: goal.articlesPerWeek ?? undefined,
          ctaDestinations: (goal.ctaDestinations as Record<string, string>) || null,
          customGuidance,
          signal: controller.signal,
          onProgress: async (step, status = "running") => {
            await sendEvent("agent_step", { step, status, timestamp: new Date().toISOString() });
          },
        });

        if (controller.signal.aborted) {
          await sendEvent("strategy_error", { error: "Stopped by user." });
          return;
        }

        // Cache for instant reads, then persist. Status is left to
        // computeGrowthKPIs — nothing is written here that was not measured.
        try {
          const { cacheSet } = await import("@/lib/redis");
          await cacheSet(`growth:strategy:${workspaceId}`, strategy, 86400 * 30);
        } catch (cacheErr) {
          console.warn("[growth/strategy] cache warning:", cacheErr);
        }

        try {
          await (prisma as any).growthGoal.update({
            where: { workspaceId },
            data: {
              strategy: strategy as any,
              decisions: strategy.decisions as any,
              experiments: strategy.experiments as any,
              lastPlanError: strategy.warnings?.length ? strategy.warnings.join(" ") : null,
              updatedAt: new Date(),
            },
          });
        } catch (dbErr) {
          console.warn("[growth/strategy] persist warning:", dbErr);
        }

        await sendEvent("strategy_completed", {
          success: true,
          strategy,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        const aborted = err?.name === "AbortError" || controller.signal.aborted;
        if (!aborted) console.error("[growth/strategy] error:", err);
        await sendEvent("strategy_error", {
          error: aborted ? "Stopped by user." : err?.message || "Failed to build the plan.",
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
    console.error("[growth/strategy] fatal:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
