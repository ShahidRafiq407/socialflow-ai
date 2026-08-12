"use server";

import { GroqProvider } from "@/lib/providers/GroqProvider";
import { searchStockMedia } from "./stock-media";

export interface ReelScene {
  id: number;
  text: string;
  keyword: string;
  durationSeconds: number;
  videoUrl?: string;
  mediaType?: "video" | "image";
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
        content: `You are an expert viral Instagram Reel and TikTok content creator. 
Generate a high-converting, viral vertical video script package formatted as JSON.
Respond ONLY with valid JSON in this exact structure:
{
  "title": "Short Catchy Reel Title",
  "fullScript": "Full spoken voiceover script string",
  "scenes": [
    {
      "id": 1,
      "text": "Punchy caption overlay for scene 1 (max 8 words)",
      "keyword": "exact stock video search keyword (e.g. gym workout, luxury office, city skyline)",
      "durationSeconds": 4
    }
  ]
}`
      },
      {
        role: "user",
        content: `Create a viral Reel script breakdown for topic: "${promptTopic}". Generate exactly ${numScenes} short punchy scenes.`
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
      // Clean up markdown wrapper if any
      const cleaned = String(jsonStr).replace(/```json/g, "").replace(/```/g, "").trim();
      parsedData = JSON.parse(cleaned);
    }

    const rawScenes = parsedData.scenes || [];
    const scenes: ReelScene[] = [];

    // Automatically match stock videos from Pixabay for each scene
    for (let i = 0; i < rawScenes.length; i++) {
      const s = rawScenes[i];
      const searchWord = s.keyword || promptTopic;
      
      let videoUrl = "";
      try {
        // Search vertical stock video from Pixabay
        const stockRes = await searchStockMedia(searchWord, "video", 1, 20, "popular", "vertical");
        if (stockRes.success && stockRes.hits && stockRes.hits.length > 0) {
          // Pick top hit
          videoUrl = stockRes.hits[0].url;
        } else {
          // Fallback to broader keyword
          const fallbackRes = await searchStockMedia("business", "video", 1, 20, "popular", "vertical");
          if (fallbackRes.success && fallbackRes.hits && fallbackRes.hits.length > 0) {
            videoUrl = fallbackRes.hits[i % fallbackRes.hits.length].url;
          }
        }
      } catch (err) {
        console.error(`Stock fetch error for scene ${i + 1}:`, err);
      }

      scenes.push({
        id: i + 1,
        text: s.text || `Scene ${i + 1}`,
        keyword: searchWord,
        durationSeconds: s.durationSeconds || 4,
        videoUrl: videoUrl || "",
        mediaType: "video"
      });
    }

    return {
      success: true,
      title: parsedData.title || promptTopic,
      fullScript: parsedData.fullScript || scenes.map(s => s.text).join(" "),
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
