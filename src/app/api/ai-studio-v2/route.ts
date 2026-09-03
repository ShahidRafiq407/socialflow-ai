import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { normalizeHashtags } from "@/lib/hashtags";
import { runCampaignGraph } from "@/lib/agents/campaignGraph";
import { createRunControls, type RunControls } from "@/lib/agents/runControls";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// 300 is a hard platform ceiling, not a tuning choice: Vercel's Hobby plan rejects any
// higher value at DEPLOY time ("maxDuration must be between 1 and 300"), so an 800 here
// does not buy a longer run — it stops the whole app from shipping. Pro allows 800; until
// the project is on it, this is the number.
//
// A campaign renders its media one format at a time and a single image can need a couple
// of minutes, so a big run genuinely does not fit. It is made to fit rather than killed:
// `CAMPAIGN_RUN_BUDGET_MS` in campaignGraph keeps the whole run inside this ceiling and
// abandons the formats that do not fit, each reported as skipped. Being killed by the
// platform instead means the stream just stops — a spinner that never resolves and never
// errors, which is the failure this pairing exists to prevent.
export const maxDuration = 300;

// Zod schema for structured request validation
const GenerateCampaignSchema = z.object({
  step: z.string().optional(),
  action: z.string().optional(),
  runId: z.string().optional(),
  campaignId: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  contentTypes: z.record(z.array(z.string())).optional(),
  topic: z.string().optional(),
  resumeState: z.any().optional(),
  resumeFromAgent: z.string().optional(),
  /** Which unit of work a skip targets (a format family label). Optional. */
  scope: z.string().optional(),
});

// Registry to track active run abort controllers for user cancellation
const activeRuns = new Map<string, AbortController>();
/**
 * Live steering handles for the same runs. Kept beside `activeRuns` because a skip and a
 * cancel arrive the same way — a second request naming the runId — and differ only in how
 * much they throw away.
 */
const activeControls = new Map<string, RunControls>();

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parseResult = GenerateCampaignSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parseResult.error.format() }, { status: 400 });
    }

    const body = parseResult.data;
    const { step, action, runId } = body;

    // Handle User Cancellation Request
    if (action === "cancel" || step === "cancel-campaign") {
      const targetRunId = runId || body.campaignId;
      if (targetRunId && activeRuns.has(targetRunId)) {
        activeRuns.get(targetRunId)?.abort();
        activeRuns.delete(targetRunId);
        activeControls.delete(targetRunId);
        return NextResponse.json({ success: true, message: "Campaign workflow cancelled." });
      }
      return NextResponse.json({ success: true, message: "Workflow signal terminated." });
    }

    // Skip the unit of work the run is stuck on, WITHOUT ending the run. The stream stays
    // open, every finished family keeps its media, and the campaign carries on at the next
    // format — the post that was skipped simply ships without media for the user to
    // finish in the content editor.
    if (action === "skip-step") {
      const targetRunId = runId || body.campaignId;
      const controls = targetRunId ? activeControls.get(targetRunId) : undefined;
      if (!controls) {
        // The run is not on this instance (or already finished). Say so rather than
        // reporting a success the user will never see take effect.
        return NextResponse.json(
          { success: false, message: "This run is no longer accepting a skip." },
          { status: 409 }
        );
      }
      controls.requestSkip(body.scope);
      return NextResponse.json({ success: true, message: "Skipping the current step." });
    }

    if (step === "generate-campaign") {
      const { platforms, contentTypes, topic } = body;

      if (!platforms || !contentTypes) {
        return NextResponse.json({ error: "platforms and contentTypes are required." }, { status: 400 });
      }

      const workspace = await prisma.workspace.findFirst({
        ...(await activeWorkspaceQuery(userId)),
        include: { brandDNA: true, competitors: true },
      });

      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found. Please create or configure your workspace first." }, { status: 404 });
      }

      // Check plan AI access
      const { checkAIAccess } = await import("@/lib/billing/gate");
      const gate = await checkAIAccess(workspace.id);
      if (!gate.allowed) {
        return NextResponse.json(
          {
            error: "UPGRADE_REQUIRED",
            reason: gate.reason,
            requiredPlan: gate.requiredPlan,
            message: gate.message,
          },
          { status: 403 }
        );
      }

      const currentRunId = runId || `run_${Date.now()}`;
      const abortController = new AbortController();
      const runControls = createRunControls();
      activeRuns.set(currentRunId, abortController);
      activeControls.set(currentRunId, runControls);

      // Listen for HTTP client disconnect
      req.signal.addEventListener("abort", () => {
        abortController.abort();
        activeRuns.delete(currentRunId);
        activeControls.delete(currentRunId);
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendSSE = (event: any) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } catch (e) {
              // Stream closed
            }
          };

          // Send immediate stream preamble to flush any server / proxy buffers instantly
          const preamble = `: ${" ".repeat(1024)}\n\n`;
          controller.enqueue(encoder.encode(preamble));

          // Immediately announce engine readiness
          sendSSE({
            type: "workflow_started",
            agentId: "system",
            data: { message: "Multi-Agent Campaign Pipeline Active", timestamp: Date.now() },
          });

          try {
            const resultState = await runCampaignGraph(
              {
                userId,
                workspaceId: workspace.id,
                platforms,
                contentTypes,
                topic,
                signal: abortController.signal,
                controls: runControls,
                workspaceData: workspace,
                resumeState: body.resumeState,
                resumeFromAgent: body.resumeFromAgent,
              },
              (event) => {
                sendSSE(event);
              }
            );

            // Persist generated campaign posts into Prisma Database
            const savedPostIds: string[] = [];
            const campaignPayload = resultState.generatedContent || { platforms: {} };

            // Do NOT auto-save posts to Content Library on generation.
            // Posts are saved only when the user explicitly clicks "Save Draft" or "Publish / Schedule" in AI Studio.

            // Final SSE event
            sendSSE({
              type: "workflow_completed",
              agentId: "system",
              // Do NOT ship `resultState` back over SSE. It re-serializes
              // `generatedContent` + `generatedAssets` (duplicate base64 media),
              // bloating the final event and risking image loss in the editor.
              data: {
                campaign: campaignPayload,
                // The CEO audit verdict has to ride along on the final event.
                // The graph emits its own `workflow_completed` with the audit,
                // but this one lands last, so without it a client that keys off
                // the last event would show a campaign with no verdict.
                audit: resultState.auditResult ?? null,
                savedPostIds,
                totalSaved: savedPostIds.length,
              },
            });

            activeRuns.delete(currentRunId);
            activeControls.delete(currentRunId);
            controller.close();
          } catch (err: any) {
            activeRuns.delete(currentRunId);
            activeControls.delete(currentRunId);

            if (err?.isCancelled || abortController.signal.aborted) {
              sendSSE({
                type: "workflow_cancelled",
                agentId: "system",
                data: { message: "Campaign generation cancelled by user." },
              });
            } else {
              console.error("Multi-Agent Campaign Error:", err);
              sendSSE({
                type: "agent_error",
                agentId: "system",
                data: { message: err.message || "An unexpected error occurred during execution." },
              });
            }
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform, max-age=0",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Content-Encoding": "none",
        },
      });
    }

    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "An error occurred." }, { status: 500 });
  }
}
