import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { llm, vertexProvider, MODELS } from "@/lib/agents/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getPlatformCapability } from "@/lib/capabilities/platformCapabilities";
import { generateMediaAsset, VisualizerError } from "@/lib/agents/mediaGenerator";
import { cacheGet, cacheSet } from "@/lib/redis";

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
    // STEP: Generate Platform-Specific Copy & Media Prompt (Multi-Agent)
    // =========================================================================
    if (step === "generate-platform-copy") {
      const { platform, format, topic, customPrompt, duration } = body;
      const capability = getPlatformCapability(platform, format);
      const campaignTopic = topic || customPrompt || "Exciting new innovations and strategic insights";
      const isVideoFormat = capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(format);

      // Check Redis Cache
      const copyCacheKey = `aistudio:copy:${platform}:${format}:${Buffer.from(campaignTopic).toString("base64").slice(0, 36)}:${duration || 5}`;
      const cachedCopy = await cacheGet<any>(copyCacheKey);
      if (cachedCopy) {
        console.log(`[AI Studio] Returning Redis cached copy for ${platform} ${format}`);
        return NextResponse.json({ success: true, data: cachedCopy, fromCache: true });
      }

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
        console.warn("[AI Studio] Grounding search fallback:", e);
      }

      // 2. Competitor Angle
      const competitorAngle = `Focus on distinct value proposition, clarity, and actionable takeaways over generic hype.`;

      // 3. Content Creator Agent with 12 Viral Hook Archetypes & Format-Native Directives
      const contentPrompt = `You are a world-class elite social media copywriter and creative director.
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
- Format: ${capability.format}
- Media Type: ${capability.mediaType.toUpperCase()}
- Default Aspect Ratio: ${capability.defaultAspectRatio}
- Character Limit: ${capability.captionLimit || capability.descriptionLimit || 2200}

STRICT PRO WRITER DIRECTIVES:
1. CAPTION:
   - First sentence MUST be a high-converting pattern interrupt or curiosity hook (curiosity gap, problem/solution, contrarian, or surprising fact).
   - Vary sentence lengths for conversational, human rhythm.
   - STRICT BANS: NO "In today's fast-paced world", NO "Unleash/Unlock", NO "Dive deep", NO "Game changer", NO excessive em dashes, NO robotic emoji spam.
   - Include a single, strong call to action (CTA) and relevant hashtags.

2. MEDIA GENERATION PROMPT (${isVideoFormat ? "CRITICAL: VIDEO PROMPT REQUIRED" : "IMAGE PROMPT"}):
   ${
     isVideoFormat
       ? `- The prompt MUST be for a REAL VIDEO generation (NEVER an image prompt).
   - Framing: ${capability.defaultAspectRatio} vertical social media video.
   - Describe: subject, scene environment, dynamic physical action, camera movement (e.g. tracking shot, close-up to wide reveal), lighting, visual style, pacing, and visual hook in the first 1-2 seconds.
   - Duration-aware storytelling (approx ${duration || 5} seconds).
   - NO text in the prompt itself.`
       : `- Describe a high-end, vivid visual image composition matching ${capability.defaultAspectRatio} aspect ratio, lighting, color grading, photorealism style.`
   }

3. If format is Pinterest: Craft an engaging Pin Title (under 100 chars), rich Pin Description, SEO Keywords/Tagged Topics, and Alt Text.
4. If format is Carousel / Idea Pin / Document / Multi-Image:
   - Must generate a 3 to 5 slide high-value educational teaching infographic storyboard.
   - Slide 1: High-impact Hook Headline + Sub-hook insight
   - Slide 2: Core Problem Breakdown / Technical challenge
   - Slide 3: Deep Strategic Insight / Step-by-step actionable framework
   - Slide 4: Real-world Implementation / Case benchmark
   - Slide 5: High-leverage Takeaway / Call to action (CTA)
   - For each slide:
     - "step": 1, 2, 3, etc.
     - "title": Punchy, bold headline (e.g. "The 2026 Robotics Shift", "Why Physical AI Changes Scaling", "Key Architecture Blueprint")
     - "body": Rich, informative, educational teaching takeaway text (2-3 sentences packed with value, metrics, or actionable advice).
     - "visualPrompt": Clean aesthetic background description with modern negative space tailored for typography overlay, high-tech engineering or brand context.

Return ONLY raw JSON with this EXACT structure:
{
  "title": "${capability.supportsTitle ? "Concise, clickable title under 100 chars" : ""}",
  "caption": "Full platform-tailored copy with natural paragraphs. Starts with an irresistible hook.",
  "description": "${capability.supportsDescription ? "Rich SEO-optimized description" : ""}",
  "hook": "Opening hook line",
  "hookReason": "Why this hook wins",
  "hashtags": ["tag1", "tag2", "tag3"],
  "taggedTopics": ["Topic 1", "Topic 2", "Topic 3"],
  "altText": "Descriptive visual alt text for accessibility",
  "videoPrompt": "${isVideoFormat ? "Complete, production-ready video generation prompt describing subject, scene, action, camera movement, lighting, and 9:16 framing" : ""}",
  "imagePrompt": "${!isVideoFormat ? "Vivid image prompt" : ""}",
  "mediaGenerationPrompt": "Complete prompt for AI media engine",
  "slides": [
    {"step": 1, "title": "Slide 1 Hook Headline", "body": "High-impact opening insight and premise.", "visualPrompt": "Vivid clean aesthetic backdrop"},
    {"step": 2, "title": "Slide 2 Problem Breakdown", "body": "Core technical or business challenge explained clearly.", "visualPrompt": "Vivid clean aesthetic backdrop"},
    {"step": 3, "title": "Slide 3 Key Actionable Framework", "body": "Actionable steps, benchmarks, or educational takeaway.", "visualPrompt": "Vivid clean aesthetic backdrop"},
    {"step": 4, "title": "Slide 4 Real-World Case", "body": "Measurable results and implementation strategy.", "visualPrompt": "Vivid clean aesthetic backdrop"},
    {"step": 5, "title": "Slide 5 Executive Summary & CTA", "body": "Final conclusion with high-converting call to action.", "visualPrompt": "Vivid clean aesthetic backdrop"}
  ],
  "bestTime": "9:30 AM"
}`;

      const res = await llm.invoke([
        new SystemMessage("You are an expert social media copywriter and creative director. Output valid JSON only."),
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
      const auditPrompt = `You are the CEO Auditor. Review this social copy and visual prompt for ${brandDNA.name} on ${capability.platform} (${capability.format}):
Title: ${parsed.title || "N/A"}
Caption: ${parsed.caption || parsed.description || "N/A"}
Hook: ${parsed.hook || "N/A"}
Media Prompt: ${parsed.videoPrompt || parsed.imagePrompt || parsed.mediaGenerationPrompt || "N/A"}

Criteria:
1. Is it human and conversational without AI clichés?
2. Is the visual prompt appropriate for ${capability.mediaType.toUpperCase()} (${capability.defaultAspectRatio})?
Respond with JSON: {"approved": true, "score": 95, "feedback": "Approved"}`;

      let ceoScore = 95;
      let ceoFeedback = "Approved by Creative Director";
      try {
        const auditRes = await llm.invoke([new HumanMessage(auditPrompt)], { modelName: MODELS.CEO_SUPERVISOR });
        const auditParsed = JSON.parse((auditRes.content?.toString() || "{}").replace(/```json/g, "").replace(/```/g, "").trim());
        ceoScore = auditParsed.score || 95;
        ceoFeedback = auditParsed.feedback || ceoFeedback;
      } catch {}

      const finalPrompt = isVideoFormat
        ? (parsed.videoPrompt || parsed.mediaGenerationPrompt || parsed.imagePrompt || "")
        : (parsed.imagePrompt || parsed.mediaGenerationPrompt || "");

      const resultPayload = {
        ...parsed,
        prompt: finalPrompt,
        videoPrompt: isVideoFormat ? finalPrompt : undefined,
        imagePrompt: !isVideoFormat ? finalPrompt : undefined,
        mediaGenerationPrompt: finalPrompt,
        ceoAudit: { score: ceoScore, feedback: ceoFeedback },
      };

      // Save to Redis Cache (24 hours TTL)
      await cacheSet(copyCacheKey, resultPayload, 86400);

      return NextResponse.json({
        success: true,
        data: resultPayload,
      });
    }

    // =========================================================================
    // STEP: Auto-Prompt From Script (Complete & Format-Aware)
    // =========================================================================
    if (step === "auto-prompt-from-script") {
      const { caption, platform, format, topic, duration } = body;
      if (!caption || !caption.trim()) {
        return NextResponse.json({
          error: "Caption is required for auto-prompt generation. Please write or generate a caption first.",
        }, { status: 400 });
      }

      const capability = getPlatformCapability(platform, format);
      const isVideoFormat = capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(format);

      // Check Redis Cache
      const scriptPromptCacheKey = `aistudio:script_prompt:${platform}:${format}:${Buffer.from(caption.trim().slice(0, 120)).toString("base64").slice(0, 36)}`;
      const cachedPrompt = await cacheGet<any>(scriptPromptCacheKey);
      if (cachedPrompt) {
        return NextResponse.json({ success: true, prompt: cachedPrompt.prompt, mediaType: cachedPrompt.mediaType, fromCache: true });
      }

      const promptGenInstruction = isVideoFormat
        ? `You are an elite video director.
Read this video script / caption:
"""
${caption.trim()}
"""

Platform: ${platform} (${format})
Aspect Ratio: ${capability.defaultAspectRatio}
Duration: ${duration || 5} seconds
Brand: ${brandDNA.name} (${brandDNA.industry})

Write a COMPLETE, production-ready AI VIDEO GENERATION PROMPT.
Directives:
- Framing: ${capability.defaultAspectRatio} vertical framing for short-form social video.
- Structure:
  1. Scene & Environment: Set the visual location and atmosphere.
  2. Subject & Action: Clear, dynamic subject performing engaging physical action.
  3. Camera Movement: Dynamic motion (e.g. close-up hook to tracking wide shot).
  4. Lighting & Style: Photorealistic, cinematic lighting, crisp detail.
  5. Pacing: Engaging first 1-2 seconds visual hook.
- NO text overlays or watermarks in prompt.
- Length: 45-80 words of vivid, high-density cinematic detail.

Return ONLY the plain text prompt string with no quotes or extra text.`
        : `You are an elite visual director.
Read this post caption:
"""
${caption || topic || "Modern business technology"}
"""
Platform: ${platform} (${format})
Aspect Ratio: ${capability.defaultAspectRatio}
Brand: ${brandDNA.name}

Write a complete, vivid AI image generation prompt describing composition, lighting, subject, and style.
Return ONLY the prompt string.`;

      const res = await llm.invoke([new HumanMessage(promptGenInstruction)], { modelName: MODELS.CONTENT_CREATOR });
      const promptResult = (res.content?.toString() || "").trim().replace(/^["']|["']$/g, "");

      const promptPayload = { prompt: promptResult, mediaType: capability.mediaType };
      await cacheSet(scriptPromptCacheKey, promptPayload, 86400);

      return NextResponse.json({
        success: true,
        prompt: promptResult,
        mediaType: capability.mediaType,
      });
    }

    // =========================================================================
    // STEP: Real Media Generation (Visualizer Agent + Validation)
    // =========================================================================
    if (step === "generate-media") {
      const { platform, format, mediaType, prompt, aspectRatio, duration, topic, videoTask, sourceImage, sourceVideo, style, quality, imageModel } = body;
      const capability = getPlatformCapability(platform, format);
      const isVideoFormat = capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(format);
      const targetMediaType = isVideoFormat ? "video" : (mediaType || capability.mediaType || "image");

      if (isVideoFormat && targetMediaType !== "video") {
        return NextResponse.json({
          error: "Validation failed: Reel and video formats strictly require mediaType='video'.",
        }, { status: 400 });
      }

      if (!prompt || !prompt.trim()) {
        return NextResponse.json({ error: "Prompt is required for media generation." }, { status: 400 });
      }

      const targetAspect = aspectRatio || capability.defaultAspectRatio || "9:16";

      // Check Redis Cache for identical media prompt & settings (only if no source attachment)
      const mediaCacheKey = `aistudio:media:${platform}:${format}:${targetMediaType}:${targetAspect}:${videoTask || "auto"}:${style || "default"}:${Buffer.from(prompt.trim()).toString("base64").slice(0, 40)}`;
      if (!sourceImage && !sourceVideo) {
        const cachedMedia = await cacheGet<any>(mediaCacheKey);
        if (cachedMedia) {
          console.log(`[AI Studio] Returning Redis cached media asset for ${platform} ${format}`);
          return NextResponse.json({ success: true, asset: cachedMedia, fromCache: true });
        }
      }

      try {
        console.log(`[AI Studio] Generating ${targetMediaType} for ${platform} ${format} (Task: ${videoTask || "auto"}) with prompt: "${prompt.slice(0, 60)}..."`);
        const mediaAssets = await generateMediaAsset({
          platform,
          contentType: format,
          mediaType: targetMediaType as any,
          prompt,
          aspectRatio: targetAspect,
          topic: topic || brandDNA.name,
          videoTask,
          sourceImage,
          sourceVideo,
          style,
          quality,
          imageModel,
        });

        const asset = mediaAssets[0];
        if (!asset || !asset.url) {
          throw new VisualizerError("VISUALIZER_ASSET_MISSING", "Visualizer failed to return an asset URL.");
        }

        const assetPayload = {
          assetId: asset.id,
          platform,
          format,
          mediaType: asset.type,
          status: "completed",
          url: asset.url,
          thumbnailUrl: asset.url,
          prompt: asset.prompt,
          model: asset.model,
          settings: {
            aspectRatio: targetAspect,
            duration: isVideoFormat ? `${duration || 5}s` : undefined,
          },
        };

        // Cache media asset in Redis (24 hours TTL)
        await cacheSet(mediaCacheKey, assetPayload, 86400);

        return NextResponse.json({
          success: true,
          asset: assetPayload,
        });
      } catch (err: any) {
        console.error(`[AI Studio] Media generation failed:`, err);
        return NextResponse.json({
          success: false,
          status: "failed",
          error: err.message || "Media synthesis failed on backend provider.",
        }, { status: 500 });
      }
    }

    // =========================================================================
    // STEP: AI Trend Suggestions (Google Search Grounding + Brand DNA)
    // =========================================================================
    if (step === "generate-trend-suggestions") {
      const { platform, format } = body;
      const capability = getPlatformCapability(platform, format);

      // Check Redis Cache (1 hour TTL for live trend signals)
      const trendCacheKey = `aistudio:trends:${platform}:${format}:${Buffer.from(brandDNA.industry).toString("base64").slice(0, 36)}`;
      const cachedTrends = await cacheGet<any>(trendCacheKey);
      if (cachedTrends) {
        console.log(`[AI Studio] Returning Redis cached trend suggestions for ${platform} ${format}`);
        return NextResponse.json({ success: true, trends: cachedTrends, fromCache: true });
      }

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
    "whyItFits": "Short 1-sentence reason why this matches your brand positioning",
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
      // Cache trends in Redis (1 hour TTL)
      await cacheSet(trendCacheKey, trends, 3600);

      return NextResponse.json({ success: true, trends, sources });
    }

    // =========================================================================
    // STEP: Enhance Visual Prompt (Format-Aware)
    // =========================================================================
    if (step === "enhance-prompt") {
      const { prompt, platform, format, mediaType, topic } = body;
      const capability = getPlatformCapability(platform, format);
      const isVideoFormat = capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(format);

      // Check Redis Cache
      const enhanceCacheKey = `aistudio:enhanced_prompt:${platform}:${format}:${Buffer.from((prompt || topic || "").trim().slice(0, 120)).toString("base64").slice(0, 36)}`;
      const cachedEnhanced = await cacheGet<string>(enhanceCacheKey);
      if (cachedEnhanced) {
        return NextResponse.json({ success: true, enhancedPrompt: cachedEnhanced, fromCache: true });
      }

      const enhancePrompt = isVideoFormat
        ? `You are a visual video director for ${brandDNA.name}.
Enhance this video prompt for ${platform} ${format} (${capability.defaultAspectRatio} vertical short-form video):

User Prompt: "${prompt || topic || "Modern business automation"}"
Aspect Ratio: ${capability.defaultAspectRatio}
Industry: ${brandDNA.industry}

Directives:
- Enhance camera movement (tracking, pan, cinematic dolly), lighting, motion physics, color grading, photorealism style.
- Maintain a strong opening 1-2s visual hook.
- NO text or watermarks in the prompt.
- Length: 40-70 words.

Return ONLY the enhanced video prompt string without quotes.`
        : `You are a visual director for ${brandDNA.name}.
Enhance this visual image prompt for ${platform} ${format}:

User Prompt: "${prompt || topic || "Modern business automation"}"
Aspect Ratio: ${capability.defaultAspectRatio}
Industry: ${brandDNA.industry}

Directives:
- Enhance visual composition, lighting, camera angle, color grading, photorealism style, raytraced reflections.
- NO text or watermarks in the prompt.
- Length: 25-45 words.

Return ONLY the enhanced prompt string without quotes.`;

      const res = await llm.invoke([new HumanMessage(enhancePrompt)], { modelName: MODELS.CONTENT_CREATOR });
      const enhanced = (res.content?.toString() || "").trim().replace(/^["']|["']$/g, "");

      await cacheSet(enhanceCacheKey, enhanced, 86400);

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
