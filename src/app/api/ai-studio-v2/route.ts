import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { normalizeHashtags } from "@/lib/hashtags";
import { runCampaignGraph } from "@/lib/agents/campaignGraph";
import { createRunControls, type RunControls } from "@/lib/agents/runControls";
import { computeFormatFamilies } from "@/lib/agents/formatFamilies";
import { DEFAULT_DECK_SLIDES } from "@/lib/agents/mediaGenerator";
import { ticketOrRefusal } from "@/lib/billing/route";
import { completeAction, failAction, type ActionTicket } from "@/lib/billing/entitlements";
import { withMeterContext } from "@/lib/billing/meter";

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

      // ─────────────────────────────────────────────────────────────────────
      // WHAT THIS RUN COSTS, DECIDED BEFORE IT STARTS
      //
      // A campaign is two charges, and it has to be. The spine — grounded
      // research, the competitor read, the shared creative, the CEO audit — is
      // one `ai.post.campaign`. Every target past the first is a per-platform
      // adaptation off a family's creative core, so those are `ai.post.variant`,
      // reserved up front and settled down to the posts that actually came back.
      //
      // That last part is not politeness. A run that hits `CAMPAIGN_RUN_BUDGET_MS`
      // abandons its tail families and reports them skipped; charging the plan for
      // the posts the platform's own timeout ate would be charging for our
      // limitation. Media is not counted here at all — every render is charged per
      // asset inside `generateMediaAsset`.
      // ─────────────────────────────────────────────────────────────────────
      const families = computeFormatFamilies(platforms, contentTypes, {
        deckSlides: DEFAULT_DECK_SLIDES,
      });
      const plannedTargets = families.reduce((acc, f) => acc + f.members.length, 0);

      if (plannedTargets === 0) {
        return NextResponse.json(
          { error: "None of the requested platform and format combinations can be produced." },
          { status: 400 }
        );
      }

      const currentRunId = runId || `run_${Date.now()}`;

      const spine = await ticketOrRefusal({
        userId,
        action: "ai.post.campaign",
        workspaceId: workspace.id,
        referenceId: currentRunId,
      });
      if (spine.refusal) return spine.refusal;

      let variantTicket: ActionTicket | null = null;
      if (plannedTargets > 1) {
        const extra = await ticketOrRefusal({
          userId,
          action: "ai.post.variant",
          workspaceId: workspace.id,
          referenceId: currentRunId,
          quantity: plannedTargets - 1,
        });
        if (extra.refusal) {
          // The spine was granted and nothing has run yet. Hand it back now rather
          // than leaving a hold for the sweeper to find in five minutes — the
          // customer would see credits missing for a run that never happened.
          await failAction(spine.ticket, {
            note: "Refunded: the run was refused before it started",
          });
          return extra.refusal;
        }
        variantTicket = extra.ticket;
      }

      /** Credits per adaptation, so a short run settles to what it delivered. */
      const perVariant =
        variantTicket && plannedTargets > 1 ? variantTicket.credits / (plannedTargets - 1) : 0;

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

      /**
       * Turns the two reservations into charges, against the number of posts the run
       * actually handed back. Called exactly once per run — on the success path with
       * the delivered count, and on the failure path with zero.
       */
      const settleRun = async (delivered: number, note: string) => {
        try {
          if (delivered <= 0) {
            await failAction(spine.ticket, { note });
            if (variantTicket) await failAction(variantTicket, { note });
            return;
          }

          await completeAction({
            ticket: spine.ticket,
            measureCost: true,
            referenceType: "campaign",
            referenceId: currentRunId,
          });

          if (variantTicket) {
            const extras = Math.max(0, Math.min(plannedTargets - 1, delivered - 1));
            if (extras === 0) {
              // One post came back out of several planned. The spine paid for it;
              // the adaptations never happened, so the hold goes back whole.
              await failAction(variantTicket, {
                note: "Refunded: no additional platform was produced",
              });
            } else {
              await completeAction({
                ticket: variantTicket,
                credits: Math.round(perVariant * extras),
                quantity: extras,
                measureCost: true,
                referenceType: "campaign",
                referenceId: currentRunId,
              });
            }
          }
        } catch (billingErr) {
          // A settle that throws must not take the stream down with it: the customer
          // has their campaign, and an unsettled hold expires on its own. Loud in the
          // logs because it means a hold is sitting on a balance until it does.
          console.error("[ai-studio-v2] settling the campaign charge failed:", billingErr);
        }
      };

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
            // The scope every model call inside the graph is attributed to. Without
            // it the graph's text calls land in the usage table with no owner, and
            // its media renders — which are charged at their own choke point — have
            // nobody to charge.
            const resultState = await withMeterContext(
              {
                userId,
                workspaceId: workspace.id,
                feature: "ai-studio",
                action: "ai.post.campaign",
                referenceId: currentRunId,
              },
              () =>
                runCampaignGraph(
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
                )
            );

            // Persist generated campaign posts into Prisma Database
            const savedPostIds: string[] = [];
            const campaignPayload = resultState.generatedContent || { platforms: {} };

            // What the run is charged for: one row per (platform, format) that has a
            // post on it. A family the time budget abandoned has no entry here, so it
            // is not billed.
            const delivered = Object.values(campaignPayload.platforms || {}).reduce(
              (acc: number, formats: any) => acc + Object.keys(formats || {}).length,
              0
            );
            await settleRun(delivered, "Refunded: the campaign produced no post");

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

            const cancelled = err?.isCancelled || abortController.signal.aborted;
            // A cancelled run has produced nothing the user can use, so it costs
            // nothing. The media it managed to render before the cancel was charged
            // and kept by its own choke point, which is the right split: the render
            // happened, the campaign did not.
            await settleRun(
              0,
              cancelled ? "Refunded: cancelled before delivery" : "Refunded: the campaign failed"
            );

            if (cancelled) {
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
