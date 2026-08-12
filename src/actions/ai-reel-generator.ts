"use server";

import { GroqProvider } from "@/lib/providers/GroqProvider";
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
}

const groq = new GroqProvider();

export async function generateAIReelPackage(topic: string, numScenes: number = 4): Promise<AIReelPackage> {
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

    let jsonStr = await groq.generateJSON(messages, { temperature: 0.7 });
    
    if (!jsonStr) {
      throw new Error("Failed to receive JSON from Groq AI");
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

    return {
      success: true,
      title: parsedData.title || promptTopic,
      fullScript: parsedData.fullScript || scenes.map(s => s.voiceoverText).join(" "),
      scenes
    };
  } catch (error: any) {
    console.error("AI Reel Generation error:", error);
    return {
      success: false,
      error: error.message || "Failed to generate AI Reel script and scenes"
    };
  }
}
