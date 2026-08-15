import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { runCampaignGraph } from "@/lib/agents/campaignGraph";

export const dynamic = "force-dynamic";
export const revalidate = 0;
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
});

// Registry to track active run abort controllers for user cancellation
const activeRuns = new Map<string, AbortController>();

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
        return NextResponse.json({ success: true, message: "Campaign workflow cancelled." });
      }
      return NextResponse.json({ success: true, message: "Workflow signal terminated." });
    }

    if (step === "generate-campaign") {
      const { platforms, contentTypes, topic } = body;

      if (!platforms || !contentTypes) {
        return NextResponse.json({ error: "platforms and contentTypes are required." }, { status: 400 });
      }

      const workspace = await prisma.workspace.findFirst({ where: { userId } });

      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
      }

      const currentRunId = runId || `run_${Date.now()}`;
      const abortController = new AbortController();
      activeRuns.set(currentRunId, abortController);

      // Listen for HTTP client disconnect
      req.signal.addEventListener("abort", () => {
        abortController.abort();
        activeRuns.delete(currentRunId);
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

          // Send immediate 2KB stream preamble to flush any server / proxy buffers instantly
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
              },
              (event) => {
                sendSSE(event);
              }
            );

            // Persist generated campaign posts into Prisma Database
            const savedPostIds: string[] = [];
            const campaignPayload = resultState.generatedContent || { platforms: {} };

            if (campaignPayload.platforms) {
              for (const [platformId, formats] of Object.entries(
                campaignPayload.platforms as Record<string, Record<string, any>>
              )) {
                for (const [formatName, content] of Object.entries(formats)) {
                  const imageUrl: string | null = content.imageUrl || null;
                  const imagePrompt: string | null = content.visualPrompt || content.imagePrompt || null;
                  const caption = content.caption || "";
                  const hashtags = Array.isArray(content.hashtags)
                    ? content.hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
                    : "";
                  const fullContent = hashtags ? `${caption}\n\n${hashtags}` : caption;
                  const platformDisplayName = platformId.charAt(0).toUpperCase() + platformId.slice(1);

                  try {
                    const post = await prisma.post.create({
                      data: {
                        workspaceId: workspace.id,
                        platform: `${platformDisplayName} ${formatName}`,
                        content: fullContent,
                        imageUrl: imageUrl,
                        imagePrompt: imagePrompt,
                        status: "PENDING_APPROVAL",
                      },
                    });
                    savedPostIds.push(post.id);
                  } catch (dbErr) {
                    console.error("Failed to save post to Prisma:", dbErr);
                  }
                }
              }
            }

            // Final SSE event
            sendSSE({
              type: "workflow_completed",
              agentId: "system",
              data: {
                campaign: campaignPayload,
                savedPostIds,
                totalSaved: savedPostIds.length,
                resultState,
              },
            });

            activeRuns.delete(currentRunId);
            controller.close();
          } catch (err: any) {
            activeRuns.delete(currentRunId);

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
