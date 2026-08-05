import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { llm } from "@/lib/agents/llm";
import { HumanMessage } from "@langchain/core/messages";
import { fetchLiveTrendingNews } from "@/actions/trends";
import { marketingGraph } from "@/lib/agents/graph";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Allow up to 5 minutes for the agent pipeline
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { step } = body;

    // =========================================================================
    // STEP: Generate Campaign
    // =========================================================================
    if (step === "generate-campaign") {
      const { platforms, contentTypes } = body;

      if (!platforms || !contentTypes) {
        return NextResponse.json(
          { error: "platforms and contentTypes are required." },
          { status: 400 }
        );
      }

      const workspace = await prisma.workspace.findFirst({
        where: { userId },
      });

      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found. Please complete onboarding first." }, { status: 404 });
      }

      // Initialize the LangGraph State
      const initialState = {
        messages: [new HumanMessage("Generate the best viral campaign.")],
        workspaceId: workspace.id,
        platforms,
        contentTypes,
        brandContext: "",
        trendContext: "",
        competitorContext: "",
        campaignPayload: null,
        nextWorker: "",
      };

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const lgStream = await marketingGraph.stream(initialState);
            
            let finalState: any = { ...initialState };

            for await (const chunk of lgStream) {
              // chunk is an object with a single key representing the node name
              const nodeName = Object.keys(chunk)[0];
              finalState = { ...finalState, ...(chunk as any)[nodeName] }; // Accumulate latest state

              // Send progress update
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: "progress", 
                  node: nodeName,
                  payload: (chunk as any)[nodeName]
                })}\n\n`)
              );
            }

            if (!finalState || !finalState.campaignPayload) {
              throw new Error("Graph failed to generate a campaign payload.");
            }

            const campaign = finalState.campaignPayload;
            const savedPostIds: string[] = [];

            // DEBUG: Log the full campaign payload to see AI output structure
            console.log("[AI Studio] Full campaign payload:", JSON.stringify(campaign, null, 2));

            if (campaign.platforms) {
              for (const [platformId, formats] of Object.entries(campaign.platforms as Record<string, Record<string, any>>)) {
                for (const [formatName, content] of Object.entries(formats)) {
                  let imageUrl: string | null = content.imageUrl || null;
                  let imagePrompt: string | null = content.visualPrompt || null;
                  const caption = content.caption || "";
                  const hashtags = Array.isArray(content.hashtags) ? content.hashtags.map((h: string) => h.startsWith("#") ? h : `#${h}`).join(" ") : "";
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
                    console.error(`Failed to save post for ${platformId}/${formatName}:`, dbErr);
                  }
                }
              }
            }

            console.log(`[AI Studio] Saved ${savedPostIds.length} posts to database.`);

            // Send final completion event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "complete", 
                campaign: finalState.campaignPayload,
                savedPostIds,
                totalSaved: savedPostIds.length 
              })}\n\n`)
            );
            
            controller.close();
          } catch (err: any) {
            console.error("LangGraph AI Studio Error:", err);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: err.message || "Failed to generate campaign" })}\n\n`)
            );
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        },
      });
    }

    // =========================================================================
    // STEP: Refine Caption
    // =========================================================================
    if (step === "refine-caption") {
      const { caption, action, platform, brandTone, topic } = body;

      if (!caption || !action) {
        return NextResponse.json(
          { error: "Caption and action are required." },
          { status: 400 }
        );
      }

      let refinementInstruction = "";
      if (action === "regenerate") {
        refinementInstruction = "Write a COMPLETELY NEW caption about the same topic. Different angle, different hook, different structure. Must be viral-quality.";
      } else if (action === "boost-hook") {
        refinementInstruction = "Rewrite ONLY the opening 1-2 lines to be an irresistible scroll-stopping hook. Use proven viral patterns: controversial question, shocking statistic, bold claim, or pattern interrupt. Keep the rest of the caption intact.";
      } else if (action === "executive-tone") {
        refinementInstruction = "Rewrite this caption in a C-suite executive voice. Remove all emojis, casual language, and slang. Use data-driven language, strategic framing, and thought-leadership positioning.";
      } else if (action === "add-hashtags") {
        refinementInstruction = "Add 10-15 highly targeted, niche-specific hashtags that will maximize reach. Mix popular (500K+ posts) with niche (10K-100K posts) hashtags. Return the full caption with hashtags appended.";
      } else {
        refinementInstruction = "Refine the caption to make it more engaging.";
      }

      const prompt = `You are a top-tier social media copywriter.

Current Caption:
"""
${caption}
"""

Topic: ${topic || "General"}
Platform: ${platform || "General"}
Brand Tone: ${brandTone || "Professional"}

Action to Perform:
${refinementInstruction}

Return ONLY the refined caption text. Do not include quotes or markdown formatting around the output unless it's intended for the actual social media post. Do not include conversational filler.`;

      const res = await llm.invoke([new HumanMessage(prompt)]);
      const refinedText = (res.content || "").toString().trim();

      return NextResponse.json({ success: true, caption: refinedText });
    }

    return NextResponse.json({ error: "Invalid step." }, { status: 400 });

  } catch (error: any) {
    console.error("AI Studio API Error:", error);
    return NextResponse.json(
      { error: error.message || "An error occurred in AI Studio." },
      { status: 500 }
    );
  }
}
