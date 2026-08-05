import { AgentStateType } from "../graph/state";
import { llm } from "../llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export async function contentWorkerNode(state: AgentStateType) {
  console.log("--- [Content Creator Agent] Writing Viral Copy ---");

  const prompt = `You are an elite Social Media Content Creator Agent.
Your job is to synthesize all research into viral social media posts.

BRAND DNA: ${JSON.stringify(state.brandDNA)}
TRENDS: ${state.trendData}
UNIQUE COMPETITOR ANGLE: ${state.competitorData}

PLATFORMS REQUESTED: ${JSON.stringify(state.platforms)}
FORMATS PER PLATFORM: ${JSON.stringify(state.contentTypes)}

CRITICAL INSTRUCTIONS:
1. Write extremely engaging LONG-FORM captions. THE FIRST LINE MUST BE A SHOCKING, CURIOSITY-INDUCING VIRAL HOOK (e.g. 'Stop doing X', 'The secret to Y', 'Nobody tells you this about Z'). Use blank lines (\\n\\n) between short paragraphs for readability. End with a clear CTA.
2. For "imagePrompt": Write ONE short (max 20 words), vivid, text-free image description for Pollinations AI (e.g. "futuristic robot arm in factory, cinematic lighting, vibrant blue tones"). Used for single-image formats.
3. For "visualPrompts": For multi-slide formats (Carousel, Idea Pin, Thread), return array of 3-5 SHORT image prompts (max 15 words each), one per slide. For single formats return array with 1 prompt matching imagePrompt.
4. For "overlayText": Generate overlay for EVERY slide of EVERY format. Each object MUST have: "step" (number), "title" (3-6 words, punchy), "body" (1-2 sentences of value), "theme" (one of: gradient-purple, gradient-blue, gradient-orange, gradient-dark, gradient-green).
5. Return ONLY raw JSON. NO literal newlines inside strings. Use \\n for line breaks in captions.

JSON Template:
{
  "topic": "Central campaign topic",
  "viralHook": "Killer 1-liner hook",
  "platforms": {
    "<PLATFORM>": {
      "<FORMAT>": {
        "caption": "Long-form caption with \\n\\n for paragraphs",
        "imagePrompt": "Short vivid 1-image prompt for Pollinations",
        "visualPrompts": ["short slide 1 prompt", "short slide 2 prompt"],
        "overlayText": [
          {"step": 1, "title": "Slide Title", "body": "Slide explanation here.", "theme": "gradient-purple"},
          {"step": 2, "title": "Next Point", "body": "More value here.", "theme": "gradient-blue"}
        ],
        "hashtags": ["#tag1", "#tag2"],
        "bestTime": "9:00 AM"
      }
    }
  }
}
Do NOT output anything except the JSON.`;

  const res = await llm.invoke([
    new SystemMessage(prompt),
    new HumanMessage("Write the viral content. Return ONLY valid JSON with no extra text.")
  ]);

  let parsed = null;
  try {
    let text = (res.content?.toString() || "")
      .replace(/```json/g, "").replace(/```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    parsed = JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse Content JSON:", err);
    throw new Error("Content Creator returned invalid JSON.");
  }

  return {
    campaignPayload: parsed
  };
}
