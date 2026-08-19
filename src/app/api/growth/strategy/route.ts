import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { generateGrowthStrategy, LeadType } from "@/lib/agents/growthEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspaceId,
      leadTarget = 150,
      leadType = "QUALIFIED_LEADS",
      timeframeDays = 60,
      targetPlatforms = ["LinkedIn", "Instagram", "X", "TikTok"],
      customGuidance,
    } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Set up Server-Sent Events (SSE) stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (event: string, data: any) => {
      try {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        await writer.write(encoder.encode(payload));
      } catch (err) {
        console.warn("[Growth Strategy SSE] Client disconnected or write failed:", err);
      }
    };

    // Execute agentic workflow in background while streaming
    (async () => {
      try {
        await sendEvent("strategy_started", {
          message: `Initializing Autonomous Growth Engine for ${leadTarget} ${leadType.replace(/_/g, " ")} (${timeframeDays} days)...`,
          timestamp: new Date().toISOString(),
        });

        const strategy = await generateGrowthStrategy({
          workspaceId,
          userId,
          leadTarget: Number(leadTarget),
          leadType: leadType as LeadType,
          timeframeDays: Number(timeframeDays),
          targetPlatforms,
          customGuidance,
          onProgress: async (step, status = "running") => {
            await sendEvent("agent_step", {
              step,
              status,
              timestamp: new Date().toISOString(),
            });
          },
        });

        // 1. Persist to Redis Cache for instant ultra-fast retrieval
        try {
          const { cacheSet } = await import("@/lib/redis");
          await cacheSet(`growth:strategy:${workspaceId}`, strategy, 86400 * 30);
          await cacheSet(`growth:meta:${workspaceId}`, {
            leadTarget: Number(leadTarget),
            leadType,
            timeframeDays: Number(timeframeDays),
            targetPlatforms,
            updatedAt: new Date().toISOString(),
          }, 86400 * 30);
        } catch (cacheErr) {
          console.warn("[Growth Strategy SSE] Redis cache warning:", cacheErr);
        }

        // 2. Persist or upsert to database
        try {
          await (prisma as any).growthGoal.upsert({
            where: { workspaceId },
            create: {
              workspaceId,
              leadTarget: Number(leadTarget),
              leadType,
              timeframeDays: Number(timeframeDays),
              startDate: new Date(),
              targetPlatforms,
              status: "ON_TRACK",
              statusReason: `Active growth strategy calculated for ${leadTarget} leads over ${timeframeDays} days.`,
              strategy: strategy as any,
              decisions: strategy.decisions as any,
              experiments: strategy.experiments as any,
            },
            update: {
              leadTarget: Number(leadTarget),
              leadType,
              timeframeDays: Number(timeframeDays),
              targetPlatforms,
              status: "ON_TRACK",
              statusReason: `Active growth strategy recalculated for ${leadTarget} leads over ${timeframeDays} days.`,
              strategy: strategy as any,
              decisions: strategy.decisions as any,
              experiments: strategy.experiments as any,
              updatedAt: new Date(),
            },
          });
        } catch (dbErr) {
          console.warn("[Growth Strategy SSE] Non-fatal DB upsert warning:", dbErr);
        }

        await sendEvent("strategy_completed", {
          success: true,
          strategy,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error("[Growth Strategy SSE] Error:", err);
        await sendEvent("strategy_error", {
          error: err.message || "Failed to generate growth strategy",
        });
      } finally {
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
    console.error("[Growth Strategy Route] Fatal error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
