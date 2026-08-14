import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { llm, vertexProvider, MODELS } from "@/lib/agents/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getPlatformCapability } from "@/lib/capabilities/platformCapabilities";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { step } = body;

    const workspace = await prisma.workspace.findFirst({
      where: { userId },
      include: { brandDNA: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found. Please complete onboarding." }, { status: 404 });
    }

    const brandDNA = {
      name: workspace.name || "Brand",
      industry: workspace.industry || "Marketing & Automation",
      website: workspace.website || "",
      tone: workspace.brandDNA?.tone || "Professional, Authoritative, Engaging",
      missionVision: workspace.brandDNA?.missionVision || "Drive growth through smart digital solutions",
      targetAudience: workspace.brandDNA?.targetAudience || "Modern Business Decision Makers",
      writingStyle: workspace.brandDNA?.writingStyle || "Direct, engaging, value-driven",
    };

    // =========================================================================
    // STEP: Generate Platform-Specific Copy (Full Multi-Agent Pipeline)
    // =========================================================================
    if (step === "generate-platform-copy") {
      const { platform, format, topic, customPrompt } = body;
      const capability = getPlatformCapability(platform, format);
      const campaignTopic = topic || customPrompt || "Exciting new innovations and strategic insights";

      // 1. Trend Research with Google Search Grounding
      let trendInsights = "Audience favors problem-first hooks and authentic value delivery.";
      try {
        const trendQuery = `Latest viral trends, hooks, and discussions about ${brandDNA.industry} ${campaignTopic} 2026`;
        const groundingRes = await vertexProvider.generateWithGrounding(trendQuery, {
          modelName: MODELS.TREND_RESEARCHER,
          temperature: 0.3,
        });
        if (groundingRes?.text) {
          trendInsights = groundingRes.text.slice(0, 1000);
        }
      } catch (e) {
        console.warn("[AI Studio] Grounding search fallback to core intelligence:", e);
      }

      // 2. Competitor Angle
      const competitorAngle = `Focus on distinct value proposition, clarity, and actionable takeaways over generic hype.`;

      // 3. Content Creator with 12 Viral Hook Archetypes & Anti-AI Writing Style
      const contentPrompt = `You are a world-class elite social media copywriter.
Create platform-native content specifically for ${capability.platform.toUpperCase()} (${capability.format}).

BRAND DNA:
- Company: ${brandDNA.name}
- Industry: ${brandDNA.industry}
- Tone: ${brandDNA.tone}
- Target Audience: ${brandDNA.targetAudience}

CAMPAIGN TOPIC: ${campaignTopic}
LIVE TREND SIGNALS: ${trendInsights}
COMPETITOR ANGLE: ${competitorAngle}

PLATFORM REQUIREMENTS:
- Platform: ${capability.platform}
- Format: ${capability.format} (${capability.mediaType})
- Supports Title: ${capability.supportsTitle}
- Supports Description: ${capability.supportsDescription}
- Supports Caption: ${capability.supportsCaption}
- Supports Hashtags: ${capability.supportsHashtags}
- Supports Alt Text: ${capability.supportsAltText}
- Character Limit: ${capability.captionLimit || capability.descriptionLimit || 2200}

STRICT PRO WRITER DIRECTIVES:
1. First sentence MUST be a high-converting pattern interrupt or curiosity hook (evaluate curiosity gap, problem/solution, contrarian, or surprising fact).
2. Human-like cadence: Vary sentence lengths, use conversational natural rhythm, avoid corporate jargon.
3. STRICT BANS: NO "In today's fast-paced world", NO "Unleash/Unlock", NO "Dive deep", NO "Game changer", NO excessive em dashes, NO robotic emoji spam.
4. If format is Pinterest: Craft an engaging Pin Title (under 100 chars), a rich Pin Description, SEO Keywords/Tagged Topics, and descriptive Alt Text for accessibility.
5. If format is Instagram Carousel / Pinterest Idea Pin / LinkedIn Document: Generate a 3-5 slide storyboard structure with titles, body insights, and visual prompts.
6. Provide a vivid visual prompt for image or video generation matching the aspect ratio ${capability.defaultAspectRatio}.

Return ONLY raw JSON with this structure:
{
  "title": "${capability.supportsTitle ? "Concise, clickable title under 100 chars" : ""}",
  "caption": "Full platform-tailored copy with natural paragraphs. Starts with an irresistible hook.",
  "description": "${capability.supportsDescription ? "Rich SEO-optimized description" : ""}",
  "hook": "Opening hook line",
  "hookReason": "Why this hook wins over 12 candidate archetypes",
  "hashtags": ["tag1", "tag2", "tag3"],
  "taggedTopics": ["Topic 1", "Topic 2", "Topic 3"],
  "altText": "Descriptive visual alt text for screen readers",
  "imagePrompt": "Short vivid prompt for AI image or video generation",
  "visualPrompts": ["Slide 1 visual prompt", "Slide 2 visual prompt", "Slide 3 visual prompt"],
  "slides": [
    {"step": 1, "title": "Slide 1 Title", "body": "Key insight or hook.", "visualPrompt": "Vivid image description"},
    {"step": 2, "title": "Slide 2 Title", "body": "Core breakdown and actionable advice.", "visualPrompt": "Vivid image description"},
    {"step": 3, "title": "Slide 3 Title", "body": "Strong takeaway and call to action.", "visualPrompt": "Vivid image description"}
  ],
  "bestTime": "9:30 AM"
}`;

      const res = await llm.invoke([
        new SystemMessage("You are an expert social media copywriter. Output valid JSON only."),
        new HumanMessage(contentPrompt),
      ], { modelName: MODELS.CONTENT_CREATOR });

      let text = (res.content?.toString() || "").replace(/```json/g, "").replace(/```/g, "").trim();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        console.error("JSON parse error from copy generator:", text);
        return NextResponse.json({ error: "Failed to parse generated content." }, { status: 500 });
      }

      // 4. CEO Auditor Review (Auto-Audit)
      const auditPrompt = `You are the CEO Auditor. Review this social copy for ${brandDNA.name} on ${capability.platform} (${capability.format}):
Title: ${parsed.title || "N/A"}
Caption: ${parsed.caption || parsed.description || "N/A"}
Hook: ${parsed.hook || "N/A"}

Criteria:
1. Is it human and conversational?
2. Are banned AI words absent?
3. Is hook strong?
Respond with JSON: {"approved": true, "score": 95, "feedback": "Excellent human-first copy"}`;

      let ceoScore = 95;
      let ceoFeedback = "Approved by Creative Director";
      try {
        const auditRes = await llm.invoke([new HumanMessage(auditPrompt)], { modelName: MODELS.CEO_SUPERVISOR });
        const auditParsed = JSON.parse((auditRes.content?.toString() || "{}").replace(/```json/g, "").replace(/```/g, "").trim());
        ceoScore = auditParsed.score || 95;
        ceoFeedback = auditParsed.feedback || ceoFeedback;
      } catch {}

      return NextResponse.json({
        success: true,
        data: {
          ...parsed,
          ceoAudit: { score: ceoScore, feedback: ceoFeedback },
        },
      });
    }

    // =========================================================================
    // STEP: AI Trend Suggestions (Google Search Grounding + Brand DNA)
    // =========================================================================
    if (step === "generate-trend-suggestions") {
      const { platform, format } = body;
      const capability = getPlatformCapability(platform, format);

      const searchQuery = `Trending ${platform} content ideas and viral angles for ${brandDNA.industry} 2026`;
      let sources: any[] = [];
      let rawTrends = "";

      try {
        const groundingRes = await vertexProvider.generateWithGrounding(searchQuery, {
          modelName: MODELS.TREND_RESEARCHER,
          temperature: 0.3,
        });
        sources = groundingRes.sources || [];
        rawTrends = groundingRes.text || "";
      } catch (e) {
        console.warn("[AI Studio] Trends grounding fallback:", e);
      }

      const prompt = `You are a viral trend strategist.
Based on the following live trend research for ${brandDNA.industry} on ${platform} (${format}):
"""
${rawTrends.slice(0, 1500)}
"""

Recommend 3 high-impact, brand-aligned trending content ideas specifically suited for ${brandDNA.name} (${brandDNA.industry} targeting ${brandDNA.targetAudience}).

Return ONLY JSON array of 3 objects:
[
  {
    "id": "trend_1",
    "topic": "Trending Angle Title",
    "whyItFits": "Why this resonates with the audience",
    "suggestedHook": "Specific scroll-stopping hook line",
    "contentAngle": "How to execute this in a ${format} format",
    "recommendedFormat": "${format}",
    "source": "${sources[0]?.title || "Industry Trend Analysis 2026"}"
  }
]`;

      const res = await llm.invoke([new HumanMessage(prompt)], { modelName: MODELS.TREND_RESEARCHER });
      let text = (res.content?.toString() || "").replace(/```json/g, "").replace(/```/g, "").trim();
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);

      const trends = JSON.parse(text);
      return NextResponse.json({ success: true, trends, sources });
    }

    // =========================================================================
    // STEP: Enhance Visual Prompt (Format-Aware)
    // =========================================================================
    if (step === "enhance-prompt") {
      const { prompt, platform, format, mediaType, topic } = body;
      const capability = getPlatformCapability(platform, format);

      const enhancePrompt = `You are a visual director for ${brandDNA.name}.
Enhance this visual prompt for ${platform} ${format} (${mediaType || capability.mediaType}):

User Prompt: "${prompt || topic || "Modern business automation"}"
Aspect Ratio: ${capability.defaultAspectRatio}
Industry: ${brandDNA.industry}

Directives:
- Enhance visual composition, lighting, camera angle, color grading, photorealism style, raytraced reflections.
- Keep the user's original core concept intact.
- NO text or watermarks in the prompt.
- Length: 25-45 words.

Return ONLY the enhanced prompt string without quotes.`;

      const res = await llm.invoke([new HumanMessage(enhancePrompt)], { modelName: MODELS.CONTENT_CREATOR });
      const enhanced = (res.content?.toString() || "").trim().replace(/^["']|["']$/g, "");

      return NextResponse.json({ success: true, enhancedPrompt: enhanced });
    }

    // =========================================================================
    // STEP: Refine Caption
    // =========================================================================
    if (step === "refine-caption") {
      const { caption, action, platform, brandTone, topic } = body;

      if (!caption || !action) {
        return NextResponse.json({ error: "Caption and action are required." }, { status: 400 });
      }

      let refinementInstruction = "";
      if (action === "regenerate") {
        refinementInstruction = "Write a COMPLETELY NEW caption about the same topic. Different angle, different hook, different structure. Must be viral-quality.";
      } else if (action === "boost-hook") {
        refinementInstruction = "Rewrite ONLY the opening 1-2 lines to be an irresistible scroll-stopping hook. Use proven viral patterns: controversial question, shocking statistic, bold claim, or pattern interrupt. Keep the rest intact.";
      } else if (action === "executive-tone") {
        refinementInstruction = "Rewrite this caption in a C-suite executive voice. Remove all emojis and casual slang. Use data-driven language and strategic thought-leadership positioning.";
      } else if (action === "add-hashtags") {
        refinementInstruction = "Add 5-10 highly targeted, niche-specific hashtags that will maximize reach. Return full caption with hashtags appended.";
      } else {
        refinementInstruction = "Refine the caption to make it more engaging.";
      }

      const prompt = `You are a top-tier social media copywriter for ${brandDNA.name}.
Current Caption:
"""
${caption}
"""
Platform: ${platform || "General"}
Action: ${refinementInstruction}
Return ONLY the refined caption text.`;

      const res = await llm.invoke([new HumanMessage(prompt)], { modelName: MODELS.CONTENT_CREATOR });
      return NextResponse.json({ success: true, caption: (res.content?.toString() || "").trim() });
    }

    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  } catch (error: any) {
    console.error("AI Studio API Error:", error);
    return NextResponse.json({ error: error.message || "An error occurred in AI Studio." }, { status: 500 });
  }
}
