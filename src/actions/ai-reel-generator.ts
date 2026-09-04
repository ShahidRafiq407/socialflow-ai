"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { llm, MODELS } from "@/lib/agents/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { runAction, isEntitlementError } from "@/lib/billing/entitlements";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { searchStockMedia } from "./stock-media";

export interface ReelScene {
  id: number;
  text: string;
  voiceoverText: string;
  keyword: string;
  durationSeconds: number;
  videoUrl: string;
  mediaType: "video" | "image";
}

export interface AIReelPackage {
  success: boolean;
  title?: string;
  fullScript?: string;
  scenes?: ReelScene[];
  error?: string;
  /** Set when the plan, not the model, is what stopped this. */
  upgrade?: boolean;
}

/**
 * Writes a multi-scene reel script and finds a stock clip for each scene.
 *
 * Gated and charged here because the Video Studio modal calls this straight from
 * the browser, which makes it a public endpoint: before this it wrote a script on
 * the frontier model for anyone who could reach the action, with no session, no
 * plan check and no usage row.
 *
 * `numScenes` is clamped — the caller asks for 1, 3 or 4, and an unclamped value
 * would multiply the stock searches without changing the price.
 */
export async function generateAIReelPackage(
  topic: string,
  numScenes: number = 4
): Promise<AIReelPackage> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Please sign in to generate a reel script." };

  const workspace = await prisma.workspace
    .findFirst({ ...(await activeWorkspaceQuery(userId)), select: { id: true } })
    .catch(() => null);

  const scenes = Math.max(1, Math.min(6, Math.round(numScenes) || 4));

  try {
    return await runAction(
      {
        userId,
        action: "media.reelScript",
        workspaceId: workspace?.id ?? null,
        referenceId: (topic || "").trim().slice(0, 120) || null,
        surface: "media",
        measureCost: true,
      },
      () => buildReelPackage(topic, scenes)
    );
  } catch (err: any) {
    if (isEntitlementError(err)) {
      return { success: false, error: err.gate.message, upgrade: true };
    }
    console.error("AI Reel Generation error:", err);
    return {
      success: false,
      error: err?.message || "Failed to generate AI Reel script and scenes",
    };
  }
}

async function buildReelPackage(topic: string, numScenes: number): Promise<AIReelPackage> {
  try {
    const promptTopic = topic && topic.trim() ? topic.trim() : "5 Effective Growth Hacks for 2026";
    const messages = [
      {
        role: "system",
        content: `You are an expert viral Instagram Reel and TikTok scriptwriter.

Your job is to create a multi-scene vertical video script that goes VIRAL.

RULES:
1. Each scene MUST have a "keyword" that is a SIMPLE, CONCRETE, VISUAL search term for finding stock video footage. Use real-world visual terms like "woman typing laptop", "city skyline night", "gym workout", "coffee shop morning", "stock market chart screen", "team meeting office". Do NOT use abstract concepts like "growth mindset" or "productivity strategy" — these return irrelevant stock footage.
2. Each scene duration must be between 6 and 10 seconds (longer scenes, NOT 3-4 seconds).
3. "text" is the bold caption overlay shown on screen (max 10 words, punchy).
4. "voiceoverText" is the spoken narration for that scene (1-2 natural sentences, conversational tone).
5. Generate exactly ${numScenes} scenes.

Respond ONLY with valid JSON in this structure:
{
  "title": "Catchy Reel Title",
  "fullScript": "Complete voiceover script combining all scenes",
  "scenes": [
    {
      "id": 1,
      "text": "Bold caption overlay text",
      "voiceoverText": "Spoken narration for this scene.",
      "keyword": "simple visual stock video search term",
      "durationSeconds": 7
    }
  ]
}`
      },
      {
        role: "user",
        content: `Create a viral Reel script for: "${promptTopic}". Make it engaging, emotional, and visually stunning. Use CONCRETE visual keywords for stock video matching.`
      }
    ];

    let res = await llm.withStructuredOutput(null).invoke(messages.map(m => {
        if (m.role === 'system') return new SystemMessage(m.content);
        return new HumanMessage(m.content);
    }), { modelName: MODELS.CONTENT_CREATOR });
    
    let jsonStr = res.content?.toString() || "";
    
    if (!jsonStr) {
      throw new Error("Failed to receive JSON from Vertex AI");
    }

    let parsedData: any;
    try {
      parsedData = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
    } catch {
      const cleaned = String(jsonStr).replace(/```json/g, "").replace(/```/g, "").trim();
      parsedData = JSON.parse(cleaned);
    }

    const rawScenes = parsedData.scenes || [];
    const scenes: ReelScene[] = [];

    // Fetch unique stock videos for each scene
    const usedVideoUrls = new Set<string>();

    for (let i = 0; i < rawScenes.length; i++) {
      const s = rawScenes[i];
      const searchWord = s.keyword || promptTopic;
      const duration = Math.max(6, Math.min(10, s.durationSeconds || 7));
      
      let videoUrl = "";
      
      try {
        // Search vertical stock video from Pixabay with the scene keyword
        const stockRes = await searchStockMedia(searchWord, "video", 1, 40, "popular", "vertical");
        if (stockRes.success && stockRes.hits && stockRes.hits.length > 0) {
          // Find a video URL not already used
          for (const hit of stockRes.hits) {
            if (!usedVideoUrls.has(hit.url) && hit.url) {
              videoUrl = hit.url;
              usedVideoUrls.add(hit.url);
              break;
            }
          }
          // If all used, just pick first
          if (!videoUrl) videoUrl = stockRes.hits[0].url;
        }
        
        // Fallback: try simpler keyword (first word only)
        if (!videoUrl) {
          const simpleWord = searchWord.split(" ")[0];
          const fallback1 = await searchStockMedia(simpleWord, "video", 1, 30, "popular", "vertical");
          if (fallback1.success && fallback1.hits && fallback1.hits.length > 0) {
            for (const hit of fallback1.hits) {
              if (!usedVideoUrls.has(hit.url) && hit.url) {
                videoUrl = hit.url;
                usedVideoUrls.add(hit.url);
                break;
              }
            }
          }
        }
        
        // Final fallback: generic topic-related
        if (!videoUrl) {
          const genericTerms = ["business office", "technology", "nature landscape", "city skyline", "motivation"];
          const fallback2 = await searchStockMedia(genericTerms[i % genericTerms.length], "video", 1, 20, "popular", "vertical");
          if (fallback2.success && fallback2.hits && fallback2.hits.length > 0) {
            videoUrl = fallback2.hits[i % fallback2.hits.length].url;
          }
        }
      } catch (err) {
        console.error(`Stock fetch error for scene ${i + 1}:`, err);
      }

      scenes.push({
        id: i + 1,
        text: s.text || `Scene ${i + 1}`,
        voiceoverText: s.voiceoverText || s.text || "",
        keyword: searchWord,
        durationSeconds: duration,
        videoUrl: videoUrl || "",
        mediaType: "video"
      });
    }

    // Nothing usable came back, so nothing is owed. Throwing rather than returning
    // `{ success: false }` is what makes that true: `runAction` refunds on a throw
    // and keeps the charge on a resolved value, however unhappy that value is.
    if (scenes.length === 0) {
      throw new Error("The script came back empty. Try a more specific topic.");
    }

    return {
      success: true,
      title: parsedData.title || promptTopic,
      fullScript: parsedData.fullScript || scenes.map(s => s.voiceoverText).join(" "),
      scenes
    };
  } catch (error: any) {
    // Rethrown for the same reason: the refund is the caller's `runAction`, and it
    // only happens if this leaves as an error. `generateAIReelPackage` turns it back
    // into the `{ success: false }` the modal expects.
    throw error;
  }
}
