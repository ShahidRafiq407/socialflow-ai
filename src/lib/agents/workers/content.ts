import { AgentStateType } from "../graph/state";
import { llm, MODELS } from "../llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  contentDoctrine,
  ENGAGEMENT_CLOSE_RULE,
  PROMOTION_BAN_RULE,
  VISUAL_PROMPT_RULE,
} from "../contentStrategy";

export async function contentWorkerNode(state: AgentStateType) {
  console.log("--- [Content Creator Agent] Writing Pro-Level Viral Copy ---");

  // Brand DNA is voice and audience here, not a brief. Dumping the whole record into
  // the prompt is what used to hand the writer an offer to sell; `writingStyle` also
  // arrives as a JSON blob in some workspaces, so it is only used when it is prose.
  const brand = (state.brandDNA || {}) as Record<string, any>;
  const rawStyle = typeof brand.writingStyle === "string" ? brand.writingStyle.trim() : "";
  const strategyBrand = {
    name: brand.name || brand.companyName || null,
    industry: brand.industry || null,
    tone: typeof brand.tone === "string" ? brand.tone : null,
    writingStyle: rawStyle.startsWith("{") ? null : rawStyle || null,
    targetAudience: typeof brand.targetAudience === "string" ? brand.targetAudience : null,
    keywords: Array.isArray(brand.keywords) ? brand.keywords : null,
  };

  const prompt = `You are a subject-matter writer with a social growth instinct. You are NOT an advertiser.
Your job is to turn research into posts people learn from, argue with, and reply to.

${contentDoctrine({ brand: strategyBrand, topic: null, seed: `worker:${(state.platforms || []).join(",")}` })}

TRENDS: ${state.trendData}
TOPICAL GAP TO AIM AT: ${state.competitorData}
PLATFORMS REQUESTED: ${JSON.stringify(state.platforms)}
FORMATS PER PLATFORM: ${JSON.stringify(state.contentTypes)}

CRITICAL "PRO WRITER" INSTRUCTIONS:
Do NOT just "write a viral caption". You must deeply analyze and apply the following architecture to EVERY caption:
1. Target Audience & Platform: Match the exact tone expected by the platform (e.g. LinkedIn = professional but vulnerable, TikTok = fast-paced, IG = aesthetic/aspirational).
2. Emotional Trigger & Curiosity Gap: Make the reader feel something instantly and withhold just enough info to force them to read more.
3. First 1-2 Second Hook: The very first sentence MUST be a pattern interrupt. (e.g. not "Here are 3 ways", but rather "I spent 4 years doing X wrong. Here is the exact fix.")
4. Language & Tone: Use conversational language, vary your sentence lengths wildly (some very short. some longer to build rhythm), and include natural imperfections.
5. STRICT BANS: NO generic AI phrases ("In today's fast-paced digital world", "Unlock the power of", "Dive into"). NO overuse of em-dashes. NO robotic headings or emojis on every line. NO unnecessary explanations.
6. Generate 3-5 hook variations internally, but output only the FINAL selected hook and a 1-sentence reason why you chose it.
7. ${ENGAGEMENT_CLOSE_RULE}
8. ${PROMOTION_BAN_RULE}

VISUAL ASSETS (For Visualizer Agent):
- For "imagePrompt": Write ONE short (max 15 words) vivid, text-free image description for AI generation (e.g., "cinematic lighting, minimalist desk setup, moody blue tones").
- For "visualPrompts": Array of short prompts (max 15 words) for multi-slide formats (Carousel, Thread).
- For "overlayText": Text for every slide.
- ${VISUAL_PROMPT_RULE}

Return ONLY raw JSON in this EXACT structure:
{
  "topic": "Central campaign topic",
  "hookSelectionReason": "I chose Hook A because...",
  "platforms": {
    "<PLATFORM>": {
      "<FORMAT>": {
        "caption": "Your masterful, human-sounding caption with \\n\\n for paragraphs. Starts with the killer hook.",
        "imagePrompt": "Short vivid 1-image prompt",
        "visualPrompts": ["slide 1 image prompt", "slide 2 image prompt"],
        "overlayText": [
          {"step": 1, "title": "Slide Title", "body": "1-2 sentences of value.", "theme": "gradient-purple"}
        ],
        "hashtags": ["#tag1", "#tag2"],
        "bestTime": "9:00 AM"
      }
    }
  }
}
Do NOT output any markdown blocks or text outside the JSON.`;

  // We use withStructuredOutput (which triggers generateJSON in our adapter)
  const res = await llm.withStructuredOutput(null).invoke([
    new SystemMessage(prompt),
    new HumanMessage("Write the content. Informational, not promotional. Return ONLY valid JSON with no extra text.")
  ], {
    modelName: MODELS.CONTENT_CREATOR
  });

  let parsed: any = null;
  try {
    if (typeof res.content === "object" && res.content !== null) {
      parsed = res.content;
    } else {
      let text = (res.content?.toString() || "")
        .replace(/```json/g, "").replace(/```/g, "").trim();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
      parsed = JSON.parse(text);
    }
  } catch (err) {
    console.error("Failed to parse Content JSON:", err, "Raw response content:", res.content);
    throw new Error("Content Creator returned invalid JSON.");
  }

  return {
    campaignPayload: parsed
  };
}
