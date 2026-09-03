import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { llm, vertexProvider, MODELS } from "@/lib/agents/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Part } from "@google/genai";
import { getPlatformCapability } from "@/lib/capabilities/platformCapabilities";
import { normalizeHashtags } from "@/lib/hashtags";
import { generateMediaAsset, VisualizerError, clampDeckSlides, MIN_DECK_SLIDES, MAX_DECK_SLIDES } from "@/lib/agents/mediaGenerator";
import { isTextRichFormat, type SlideTextSpec } from "@/lib/agents/slideDesigner";
import { cacheGet, cacheSet } from "@/lib/redis";

import { checkAIAccess } from "@/lib/billing/gate";
import { parseBrandMetadata } from "@/lib/brand/profile";

/** Hard character clamp at a word boundary — programmatic platform limit enforcement. */
function clampText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

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
      ...(await activeWorkspaceQuery(userId)),
      include: { brandDNA: true, competitors: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found. Please complete onboarding." }, { status: 404 });
    }

    // Gating check: AI generation features require Creator Pro or Agency plan.
    // Covers every LLM/media-consuming step exposed by this route.
    const isGatedAIStep =
      (typeof step === "string" && step.startsWith("generate-")) ||
      step === "regenerate-slide" ||
      step === "slide-regenerate" ||
      step === "ai-field-generate" ||
      step === "enhance-prompt" ||
      step === "auto-prompt-from-script" ||
      step === "analyze-media" ||
      step === "refine-caption";
    if (isGatedAIStep) {
      const gate = await checkAIAccess(workspace.id);
      if (!gate.allowed) {
        return NextResponse.json(
          {
            error: "UPGRADE_REQUIRED",
            reason: gate.reason,
            requiredPlan: gate.requiredPlan,
            message: gate.message,
          },
          { status: 403 }
        );
      }
    }

    // `brandDNA.writingStyle` holds a JSON blob (offer / pain points / rules), so the
    // real rules have to be unpacked before they reach a prompt.
    const brandMeta = parseBrandMetadata(workspace.brandDNA?.writingStyle);
    const brandDNA = {
      name: workspace.name || "Brand",
      industry: workspace.industry || "Marketing & Automation",
      website: workspace.website || "",
      tone: workspace.brandDNA?.tone || "Professional, Authoritative, Engaging",
      missionVision: workspace.brandDNA?.missionVision || "Drive growth through smart digital solutions",
      targetAudience: workspace.brandDNA?.targetAudience || "Modern Business Decision Makers",
      writingStyle: brandMeta.rules || "Direct, engaging, value-driven",
      // Drives the palette of text-rich carousel / document slides (slideDesigner).
      primaryColors: Array.isArray(workspace.brandDNA?.primaryColors)
        ? workspace.brandDNA.primaryColors.filter(Boolean)
        : [],
    };

    // =========================================================================
    // STEP: Generate Platform-Specific Copy & Media Prompt (Multi-Agent)
    // =========================================================================
    if (step === "generate-platform-copy") {
      const { platform, format, topic, customPrompt, duration, slideCount, slideInstructions } = body;
      const capability = getPlatformCapability(platform, format);
      const campaignTopic = topic || customPrompt || "Exciting new innovations and strategic insights";
      const isVideoFormat = capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(format);
      // Informational deck formats: the storyboard length the user picked in the Studio
      // decides how many slides get written (and therefore how many get designed).
      const isDeckFormat = isTextRichFormat(format, capability.mediaType);
      const targetSlides = isDeckFormat
        ? Math.min(capability.maxMedia || MAX_DECK_SLIDES, clampDeckSlides(slideCount, 5))
        : 0;

      // Check Redis Cache
      const copyCacheKey = `aistudio:copy:${platform}:${format}:${Buffer.from(campaignTopic).toString("base64").slice(0, 36)}:${duration || 5}:${targetSlides}:${Buffer.from(String(slideInstructions || "")).toString("base64").slice(0, 24)}`;
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

      // 2. Competitor research — REAL Google-grounded research the AI finds itself
      // (the user should NOT have to know who their competitors are). Cached 24h per
      // INDUSTRY in Redis — the competitive landscape rarely changes within a day, so
      // only the first click of the day pays for the search; every later click reuses it
      // (same pattern as the best-time analysis cache).
      const competitorCacheKey = `aistudio:competitors:${Buffer.from(brandDNA.industry).toString("base64").slice(0, 36)}`;
      let competitorInsight = await cacheGet<string>(competitorCacheKey);
      if (!competitorInsight) {
        try {
          const compQuery = `Top competitors, market leaders, and their best-performing social media hooks and engagement angles for ${brandDNA.industry} 2026`;
          const compRes = await vertexProvider.generateWithGrounding(compQuery, {
            modelName: MODELS.COMPETITOR_ANALYST,
            temperature: 0.3,
          });
          const insightText = (compRes.text || "").trim();
          if (insightText) {
            competitorInsight = insightText.slice(0, 900);
            await cacheSet(competitorCacheKey, competitorInsight, 86400);
          }
        } catch (e) {
          console.warn("[AI Studio] Competitor grounding fallback:", e);
        }
      }
      const dbCompetitors = (workspace as any).competitors || [];
      const competitorAngle = competitorInsight
        ? `LIVE COMPETITOR RESEARCH (Google-grounded, cached 24h):\n"""\n${competitorInsight}\n"""\nUse this to differentiate ${brandDNA.name} from the real market players — sharper hooks, unique positioning, never copy their angles.`
        : dbCompetitors.length > 0
        ? `Differentiate against these competitors the brand tracks: ${dbCompetitors.slice(0, 5).map((c: any) => c.name).join(", ")}. Emphasize what only ${brandDNA.name} offers.`
        : `Focus on distinct value proposition, clarity, and actionable takeaways over generic hype.`;

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
   - STRICT LENGTH LIMIT: The caption MUST NOT EXCEED ${capability.captionLimit || 2200} characters under any circumstances! Count your characters before returning!
   - First sentence MUST be a high-converting pattern interrupt or curiosity hook (curiosity gap, problem/solution, contrarian, or surprising fact).
   - Vary sentence lengths for conversational, human rhythm.
   - STRICT BANS: NO "In today's fast-paced world", NO "Unleash/Unlock", NO "Dive deep", NO "Game changer", NO excessive em dashes, NO robotic emoji spam.
   - Include a single, strong call to action (CTA) and relevant hashtags.

2. MEDIA GENERATION PROMPT (${isVideoFormat ? "CRITICAL: VIDEO PROMPT REQUIRED" : "IMAGE PROMPT"} - MAXIMUM RELEVANCE 100/100):
   ${
     isVideoFormat
       ? `- The prompt MUST be for a REAL VIDEO generation directly visualizing the core subject of the caption.
   - Framing: ${capability.defaultAspectRatio} vertical social media video.
   - Describe: the exact subject/technology mentioned in the caption, specific scene environment, dynamic physical action, cinematic camera movement (e.g. tracking shot, close-up to wide reveal), volumetric lighting, visual style, pacing, and visual hook in the first 1-2 seconds.
   - Duration-aware storytelling (approx ${duration || 5} seconds).
   - NO text in the prompt itself.`
       : `- MUST be an ultra-relevant, detailed visual composition directly visualizing the exact premise, subject, and story of the caption.
   - For robotics/tech/engineering: Describe specific robotic hardware, sensor arrays, autonomous actuators, high-tech lab or real-world industrial environments, cinematic lighting, 8K micro-textures, and depth of field.
   - Aspect ratio: ${capability.defaultAspectRatio}.
   - Zero generic fluff. Every detail in the prompt must directly reinforce the post's core message.`
   }

3. If format is Pinterest: Craft an engaging Pin Title (under 100 chars), rich Pin Description, SEO Keywords/Tagged Topics, and Alt Text.
${
  isDeckFormat
    ? `4. THIS IS AN INFORMATIONAL DECK FORMAT (${capability.format}) — MANDATORY:
   - Return EXACTLY ${targetSlides} entries in "slides". Not fewer, not more.
   - Every slide is rendered as a DESIGNED INFOGRAPHIC: its "title" and "body" are TYPESET ONTO the graphic by the design engine. Write them as finished on-slide copy, not as instructions.
   - Storyboard arc across the ${targetSlides} slides: slide 1 = hook that earns the swipe, middle slides = the problem, the framework/steps, and the proof (metrics, benchmark, real example), final slide = the takeaway plus a call to action.
   - For each slide return:
     - "step": 1, 2, 3, ...
     - "title": the on-slide headline. Punchy and specific, UNDER 60 CHARACTERS so it typesets cleanly (e.g. "The 2026 Robotics Shift", "Why Physical AI Changes Scaling").
     - "body": the on-slide teaching text. Concrete and valuable — a metric, a step, or an actionable rule. UNDER 200 CHARACTERS.
     - "visualPrompt": art direction for that slide's BACKGROUND and supporting graphics only (abstract shapes, subtle texture, a simple diagram or icon motif, on-topic imagery). Keep it low-contrast and calm where text will sit. NEVER describe the words themselves and NEVER ask for text in the image — the design engine handles all typography.
   - Every slide must teach something different. No repeated headlines, no filler slides.${
     slideInstructions ? `\n   - EXTRA CLIENT DIRECTION for this deck (follow it): ${String(slideInstructions).slice(0, 500)}` : ""
   }`
    : `4. This format is a single visual — return an empty "slides" array.`
}

5. HASHTAGS (STRICT):
   - Each entry MUST be a real hashtag starting with "#" (e.g. "#Robotics", "#PhysicalAI", "#TechInnovation").
   - PascalCase, NO spaces, NO commas, NO sentences, NO explanation text.
   - 3 to ${capability.hashtagLimit || 8} hashtags, highly relevant to the caption and ${capability.platform}.
   - Example of CORRECT: ["#Robotics", "#PhysicalAI", "#Automation", "#MachineLearning"]
   - Example of WRONG (NEVER do this): ["digital marketing strategy", "social media growth"]

Return ONLY raw JSON with this EXACT structure:
{
  "title": "${capability.supportsTitle ? "Concise, clickable title under 100 chars" : ""}",
  "caption": "Full platform-tailored copy with natural paragraphs. Starts with an irresistible hook.",
  "description": "${capability.supportsDescription ? "Rich SEO-optimized description" : ""}",
  "hook": "Opening hook line",
  "hookReason": "Why this hook wins",
  "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3"],
  "taggedTopics": ["Topic 1", "Topic 2", "Topic 3"],
  "altText": "Descriptive visual alt text for accessibility",
  "videoPrompt": "${isVideoFormat ? "Complete, production-ready video generation prompt describing subject, scene, action, camera movement, lighting, and 9:16 framing" : ""}",
  "imagePrompt": "${!isVideoFormat ? "Vivid image prompt" : ""}",
  "mediaGenerationPrompt": "Complete prompt for AI media engine",
  "slides": ${
    isDeckFormat
      ? `[${Array.from(
          { length: targetSlides },
          (_, i) =>
            `\n    {"step": ${i + 1}, "title": "On-slide headline for slide ${i + 1} (under 60 chars)", "body": "On-slide teaching text for slide ${i + 1} (under 200 chars)", "visualPrompt": "Background / supporting-graphic art direction for slide ${i + 1} — no text"}`
        ).join(",")}\n  ]`
      : "[]"
  },
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

      // SERVER-SIDE HASHTAG VALIDATION — never trust raw LLM text in the editor.
      // Converts sentences/bare tags into real "#PascalCase" hashtags, dedupes,
      // and clamps to the platform's official hashtag limit.
      const originalHashtags = JSON.stringify(parsed.hashtags);
      parsed.hashtags = normalizeHashtags(parsed.hashtags, { limit: capability.hashtagLimit || 10 });
      if (originalHashtags !== JSON.stringify(parsed.hashtags)) {
        console.log(`[AI Studio] Hashtags normalized for ${platform} ${format}: ${originalHashtags} -> ${JSON.stringify(parsed.hashtags)}`);
      }

      // SERVER-SIDE STORYBOARD NORMALIZATION — deck formats render one designed slide
      // per storyboard entry, so the array must be exactly the requested length with a
      // headline on every slide. A short/ragged array would otherwise ship blank slides.
      const normalizeStoryboard = () => {
        if (!isDeckFormat) return;
        const raw = Array.isArray(parsed.slides) ? parsed.slides : [];
        const usable = raw.filter(
          (s: any) => s && ((s.title || "").toString().trim() || (s.body || "").toString().trim())
        );
        // Never duplicate a slide to hit the requested count — a shorter deck of distinct
        // slides beats one that publishes the same headline twice.
        const deckLength =
          usable.length >= MIN_DECK_SLIDES ? Math.min(targetSlides, usable.length) : targetSlides;
        parsed.slides = Array.from({ length: deckLength }, (_, idx) => {
          const src = usable[idx] || {};
          return {
            step: idx + 1,
            title: clampText((src.title || "").toString().trim() || `${campaignTopic} — part ${idx + 1}`, 70),
            body: clampText((src.body || "").toString().trim(), 240),
            visualPrompt: (src.visualPrompt || "").toString().trim(),
          };
        });
        if (usable.length !== deckLength) {
          console.log(`[AI Studio] Storyboard normalized for ${platform} ${format}: ${usable.length} -> ${deckLength} slides`);
        }
      };
      normalizeStoryboard();

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
      let ceoRevised = false;
      try {
        const auditRes = await llm.invoke([new HumanMessage(auditPrompt)], { modelName: MODELS.CEO_SUPERVISOR });
        const auditParsed = JSON.parse((auditRes.content?.toString() || "{}").replace(/```json/g, "").replace(/```/g, "").trim());
        ceoScore = auditParsed.score || 95;
        ceoFeedback = auditParsed.feedback || ceoFeedback;
      } catch {}

      // CEO AUTO-REVISION (bounded to ONE pass, same pattern as the campaign graph's
      // ceo_auditor rewrite loop) — only fires when the CEO actually rejects the copy,
      // so approved generations cost zero extra calls.
      if (ceoScore < 70) {
        try {
          const revisePrompt = `You are the Content Creator agent. The CEO Auditor REJECTED this content for ${capability.platform} (${capability.format}).

ORIGINAL JSON:
${JSON.stringify({ caption: parsed.caption, title: parsed.title, description: parsed.description, hook: parsed.hook, hashtags: parsed.hashtags, imagePrompt: parsed.imagePrompt, videoPrompt: parsed.videoPrompt, slides: parsed.slides })}

CEO FEEDBACK (fix ALL of these):
${ceoFeedback}

BRAND DNA: ${brandDNA.name} — tone: ${brandDNA.tone}, audience: ${brandDNA.targetAudience}
TOPIC: ${campaignTopic}

Return the CORRECTED content as JSON with the SAME structure as the original. No commentary.`;
          const reviseRes = await llm.invoke([
            new SystemMessage("You are an expert social media copywriter. Output valid JSON only."),
            new HumanMessage(revisePrompt),
          ], { modelName: MODELS.CONTENT_CREATOR });
          let reviseText = (reviseRes.content?.toString() || "").replace(/```json/g, "").replace(/```/g, "").trim();
          const rStart = reviseText.indexOf("{");
          const rEnd = reviseText.lastIndexOf("}");
          if (rStart !== -1 && rEnd !== -1) {
            const revised = JSON.parse(reviseText.slice(rStart, rEnd + 1));
            // Keep the revision only if it actually produced content
            if (revised && (revised.caption || revised.title || revised.description)) {
              parsed = { ...parsed, ...revised };
              ceoRevised = true;
              ceoFeedback = `Auto-revised after CEO review: ${ceoFeedback}`;
            }
          }
        } catch (reviseErr: any) {
          console.warn("[AI Studio] CEO auto-revision failed (keeping original):", reviseErr?.message);
        }
      }

      const finalPrompt = isVideoFormat
        ? (parsed.videoPrompt || parsed.mediaGenerationPrompt || parsed.imagePrompt || "")
        : (parsed.imagePrompt || parsed.mediaGenerationPrompt || "");

      // PROGRAMMATIC LIMIT CLAMPS — never trust the LLM with character limits
      // (re-applied after a CEO revision so corrected text also respects limits).
      if (typeof parsed.caption === "string" && parsed.caption.length > capability.captionLimit) {
        parsed.caption = clampText(parsed.caption, capability.captionLimit);
      }
      if (typeof parsed.title === "string" && capability.titleLimit && parsed.title.length > capability.titleLimit) {
        parsed.title = clampText(parsed.title, capability.titleLimit);
      }
      if (typeof parsed.description === "string" && capability.descriptionLimit && parsed.description.length > capability.descriptionLimit) {
        parsed.description = clampText(parsed.description, capability.descriptionLimit);
      }
      // Revision can introduce fresh hashtag junk — sanitize again.
      if (parsed.hashtags) {
        parsed.hashtags = normalizeHashtags(parsed.hashtags, { limit: capability.hashtagLimit || 10 });
      }
      // ...and a revised storyboard can come back ragged — re-normalize it too.
      if (ceoRevised) normalizeStoryboard();

      const resultPayload = {
        ...parsed,
        prompt: finalPrompt,
        videoPrompt: isVideoFormat ? finalPrompt : undefined,
        imagePrompt: !isVideoFormat ? finalPrompt : undefined,
        mediaGenerationPrompt: finalPrompt,
        ceoAudit: { score: ceoScore, feedback: ceoFeedback, revised: ceoRevised },
      };

      // Save to Redis Cache (24 hours TTL)
      await cacheSet(copyCacheKey, resultPayload, 86400);

      return NextResponse.json({
        success: true,
        data: resultPayload,
      });
    }

    // =========================================================================
    // STEP: Generate ONE specific field (Title / Description / Caption /
    // Hashtags / Alt Text only — never a generic blob split into fields)
    // =========================================================================
    if (step === "generate-field") {
      const { platform, format, field, topic, context } = body;
      const capability = getPlatformCapability(platform, format);
      const campaignTopic = topic || "Our latest offering and key value";

      const fieldSpecs: Record<string, { instruction: string; limit: number | null }> = {
        title: {
          instruction: `Write ONE concise, clickable ${capability.platform} title. No hashtags, no quotes, no explanation — the title text only.`,
          limit: capability.titleLimit || 100,
        },
        description: {
          instruction: `Write ONE SEO-rich ${capability.platform} description. Plain text only — no title, no hashtags, no explanation.`,
          limit: capability.descriptionLimit || 500,
        },
        caption: {
          instruction: `Write ONE ${capability.platform} ${capability.format} post text (caption). Start with a strong hook, end with a single CTA. Plain text only.`,
          limit: capability.captionLimit,
        },
        hashtags: {
          instruction: `Write real hashtags for this content. EVERY entry must start with "#", PascalCase, no spaces inside a tag, no sentences, no explanation.`,
          limit: null,
        },
        altText: {
          instruction: `Write ONE accessibility alt text that literally describes the VISUAL scene (subjects, setting, colors, action) for visually impaired users. Do NOT write a caption, marketing copy or hashtags.`,
          limit: 500,
        },
      };

      const spec = fieldSpecs[field as string];
      if (!spec) {
        return NextResponse.json({ error: "Invalid field." }, { status: 400 });
      }

      const fieldPrompt = `You are a world-class ${capability.platform} content specialist.
Generate ONLY this field: ${field.toUpperCase()} for a ${capability.platform} ${capability.format} post.

BRAND DNA:
- Company: ${brandDNA.name}
- Industry: ${brandDNA.industry}
- Tone: ${brandDNA.tone}
- Target Audience: ${brandDNA.targetAudience}

TOPIC: ${campaignTopic}
${context ? `EXISTING CONTENT CONTEXT (do not duplicate, stay consistent):\n${String(context).slice(0, 600)}` : ""}

TASK: ${spec.instruction}
${spec.limit ? `HARD LIMIT: ${spec.limit} characters maximum.` : ""}
${field === "hashtags" ? `Provide ${Math.min(capability.hashtagLimit || 10, 8)} hashtags as a JSON array of strings, e.g. ["#DigitalMarketing", "#GrowthStrategy"].` : "Return ONLY the field value as plain text — no quotes, no labels, no commentary."}`;

      try {
        const res = await llm.invoke([
          new SystemMessage("You are an expert social media copywriter. Follow output format instructions exactly."),
          new HumanMessage(fieldPrompt),
        ], { modelName: MODELS.CONTENT_CREATOR });

        let raw = (res.content?.toString() || "").trim().replace(/^```[a-z]*\n?/g, "").replace(/```$/g, "").trim();

        if (field === "hashtags") {
          // Parse array (or fallback: split raw text) and run the shared hashtag sanitizer
          let tags: string[] = [];
          try {
            const start = raw.indexOf("[");
            const end = raw.lastIndexOf("]");
            if (start !== -1 && end !== -1) tags = JSON.parse(raw.slice(start, end + 1));
          } catch {}
          if (!Array.isArray(tags) || tags.length === 0) tags = raw.split(/[\s,]+/);
          const normalized = normalizeHashtags(tags, { limit: capability.hashtagLimit || 10 });
          return NextResponse.json({ success: true, field, value: normalized, kind: "array" });
        }

        if (spec.limit && raw.length > spec.limit) {
          raw = clampText(raw, spec.limit);
        }
        return NextResponse.json({ success: true, field, value: raw, kind: "string" });
      } catch (err: any) {
        console.error(`[AI Studio] generate-field (${field}) failed:`, err?.message);
        return NextResponse.json({ error: err?.message || "Field generation failed." }, { status: 500 });
      }
    }

    // =========================================================================
    // STEP: Regenerate Single Slide with Custom Prompt (LLM-powered)
    // =========================================================================
    if (step === "regenerate-slide") {
      const { platform, format, slideIndex, slideType, prompt, topic, currentSlide, commentary } = body;
      const capability = getPlatformCapability(platform, format);
      const slideTopic = topic || commentary || "Strategic business innovation and leadership insights";
      const customInstruction = prompt || "Make this slide punchier, authoritative, and actionable";

      const slidePrompt = `You are a world-class presentation and slide deck copywriter for ${capability.platform.toUpperCase()} (${capability.format}).
Rewrite and improve Slide #${(slideIndex ?? 0) + 1} (${slideType || "content"}).

BRAND DNA:
- Company: ${brandDNA.name}
- Tone: ${brandDNA.tone}
- Industry: ${brandDNA.industry}

TOPIC / CONTEXT: ${slideTopic}
USER CUSTOM INSTRUCTIONS: ${customInstruction}
CURRENT SLIDE HEADING: ${currentSlide?.title || ""}
CURRENT SLIDE POINTS/BODY: ${currentSlide?.body || (Array.isArray(currentSlide?.points) ? currentSlide.points.join("\n") : "")}

Generate a clear, high-impact heading and 2 to 4 crisp bullet points (each under 100 characters).
Return ONLY raw JSON with this exact structure:
{
  "title": "Concise, punchy heading",
  "points": ["First actionable insight", "Second key data or strategic point", "Third high-value takeaway"],
  "body": "First actionable insight. Second key data or strategic point. Third high-value takeaway."
}`;

      try {
        const res = await llm.invoke([
          new SystemMessage("You are an expert presentation designer and copywriter. Output valid JSON only."),
          new HumanMessage(slidePrompt),
        ], { modelName: MODELS.CONTENT_CREATOR });

        let raw = (res.content?.toString() || "").trim().replace(/^```json/g, "").replace(/^```/g, "").replace(/```$/g, "").trim();
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

        const parsed = JSON.parse(raw);
        return NextResponse.json({ success: true, slide: parsed });
      } catch (err: any) {
        console.error(`[AI Studio] regenerate-slide failed:`, err?.message);
        return NextResponse.json({
          success: true,
          slide: {
            title: currentSlide?.title || `Slide ${(slideIndex ?? 0) + 1}`,
            points: ["Enhanced strategic takeaway", "Data-driven optimization benchmark", "Actionable execution step"],
            body: "Enhanced strategic takeaway. Data-driven optimization benchmark. Actionable execution step.",
          },
        });
      }
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
      const {
        platform,
        format,
        mediaType,
        prompt,
        aspectRatio,
        duration,
        topic,
        videoTask,
        sourceImage,
        sourceVideo,
        style,
        quality,
        imageModel,
        // Informational deck params — the headline/insight that must be TYPESET into
        // the graphic, plus this slide's position inside the published deck.
        slideText,
        slideTexts,
        slideIndex,
        totalSlides,
        designMode,
        extraInstructions,
      } = body;
      const capability = getPlatformCapability(platform, format);
      const isVideoFormat = capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(format);
      const targetMediaType = isVideoFormat ? "video" : (mediaType || capability.mediaType || "image");

      if (isVideoFormat && targetMediaType !== "video") {
        return NextResponse.json({
          error: "Validation failed: Reel and video formats strictly require mediaType='video'.",
        }, { status: 400 });
      }

      // ── Deck slide context ────────────────────────────────────────────────────
      // The editor renders ONE slide per request, so it sends that slide's copy plus
      // its index; the campaign graph sends the whole deck at once.
      const normalizeSlide = (s: any): SlideTextSpec | null => {
        if (!s || typeof s !== "object") return null;
        const title = (s.title || "").toString().trim();
        const body_ = (s.body || "").toString().trim();
        const points = Array.isArray(s.points) ? s.points.filter(Boolean).map(String) : undefined;
        if (!title && !body_ && !(points && points.length)) return null;
        return { step: Number(s.step) || undefined, title, body: body_, points };
      };
      const deckSlideTexts: SlideTextSpec[] = (
        Array.isArray(slideTexts) ? slideTexts.map(normalizeSlide) : [normalizeSlide(slideText)]
      ).filter(Boolean) as SlideTextSpec[];
      const deckSlideIndex = Math.max(0, Number(slideIndex) || 0);
      const deckTotalSlides = Math.min(
        MAX_DECK_SLIDES,
        Math.max(Number(totalSlides) || 0, deckSlideTexts.length, deckSlideIndex + 1, 1)
      );
      const isDeckSlide =
        designMode === "infographic" ||
        (designMode !== "photographic" &&
          deckSlideTexts.length > 0 &&
          isTextRichFormat(format, capability.mediaType));

      // A designed slide is fully specified by its copy — the background art direction
      // is optional, so don't reject the request just because it's missing.
      if ((!prompt || !prompt.trim()) && !isDeckSlide) {
        return NextResponse.json({ error: "Prompt is required for media generation." }, { status: 400 });
      }
      const effectivePrompt = (prompt || "").trim();

      const targetAspect = aspectRatio || capability.defaultAspectRatio || "9:16";

      // Check Redis Cache for identical media prompt & settings (only if no source attachment).
      // The slide's copy and position are part of the identity — two slides of the same
      // deck share a background brief but must never share a rendered image.
      const slideCacheSeed = isDeckSlide
        ? `:slide${deckSlideIndex + 1}of${deckTotalSlides}:${Buffer.from(
            deckSlideTexts.map((s) => `${s.title || ""}|${s.body || ""}`).join("~") +
              (extraInstructions ? `~${extraInstructions}` : "")
          ).toString("base64").slice(0, 48)}`
        : "";
      const mediaCacheKey = `aistudio:media:${platform}:${format}:${targetMediaType}:${targetAspect}:${videoTask || "auto"}:${style || "default"}:${Buffer.from(effectivePrompt || format).toString("base64").slice(0, 40)}${slideCacheSeed}`;
      if (!sourceImage && !sourceVideo) {
        const cachedMedia = await cacheGet<any>(mediaCacheKey);
        // Skip stale cache entries holding unpublishable data: payloads.
        if (cachedMedia && cachedMedia.url && !String(cachedMedia.url).startsWith("data:")) {
          const isVid = typeof cachedMedia.url === "string" && (
            cachedMedia.url.endsWith(".mp4") ||
            cachedMedia.url.endsWith(".webm") ||
            cachedMedia.url.includes(".mp4?") ||
            cachedMedia.mediaType === "video" ||
            cachedMedia.type === "video"
          );
          if (targetMediaType === "video" && isVid) {
            console.log(`[AI Studio] Returning Redis cached video asset for ${platform} ${format}`);
            return NextResponse.json({ success: true, asset: cachedMedia, fromCache: true });
          } else if (targetMediaType === "image" && !isVid) {
            console.log(`[AI Studio] Returning Redis cached image asset for ${platform} ${format}`);
            return NextResponse.json({ success: true, asset: cachedMedia, fromCache: true });
          }
        }
      }

      try {
        console.log(`[AI Studio] Generating ${isDeckSlide ? `designed slide ${deckSlideIndex + 1}/${deckTotalSlides}` : targetMediaType} for ${platform} ${format} (Task: ${videoTask || "auto"}) with prompt: "${effectivePrompt.slice(0, 60)}..."`);
        const mediaAssets = await generateMediaAsset({
          platform,
          contentType: format,
          mediaType: targetMediaType as any,
          prompt: effectivePrompt,
          aspectRatio: targetAspect,
          topic: topic || brandDNA.name,
          videoTask,
          sourceImage,
          sourceVideo,
          style,
          quality,
          imageModel,
          // Text-rich informational slide/page context
          slideTexts: deckSlideTexts,
          slideIndexOffset: deckSlideIndex,
          totalSlides: deckTotalSlides,
          designMode: isDeckSlide ? "infographic" : designMode === "photographic" ? "photographic" : "auto",
          extraInstructions: extraInstructions ? String(extraInstructions).slice(0, 600) : undefined,
          brandName: brandDNA.name,
          brandColors: brandDNA.primaryColors,
          industry: brandDNA.industry,
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
          ...(isDeckSlide ? { slideIndex: deckSlideIndex, totalSlides: deckTotalSlides, textRich: true } : {}),
          settings: {
            aspectRatio: targetAspect,
            duration: isVideoFormat ? `${duration || 5}s` : undefined,
          },
        };

        // Cache media asset in Redis (24 hours TTL).
        // NEVER cache data: URLs — they are multi-MB base64 payloads that
        // bloat Redis, break preview persistence (sessionStorage strips them),
        // and can never be fetched by external platform crawlers at publish time.
        if (!asset.url.startsWith("data:")) {
          await cacheSet(mediaCacheKey, assetPayload, 86400);
        }

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
    // STEP: Analyze Uploaded Media (image / video) with the vision model and
    // generate matching platform-native text (caption, hashtags, alt text...)
    //
    // Two-stage pipeline:
    //   Stage 1 (vision, fast model): perceive the media — transcribe any
    //   spoken voiceover from the video's AUDIO TRACK (the whole video is sent
    //   inline for this), or visually describe frames/images.
    //   Stage 2 (gemini-3.1-pro-preview): an elite human-voice ghostwriter
    //   turns that perception into a viral, platform-native caption.
    // =========================================================================
    if (step === "analyze-media") {
      const { platform, format, mediaType, mediaUrl, frames, topic } = body;
      const capability = getPlatformCapability(platform, format);
      const isVideo = mediaType === "video";

      // ---- Build multimodal parts -------------------------------------------
      const parts: Part[] = [];
      const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
      const MAX_INLINE_VIDEO_BYTES = 15 * 1024 * 1024;

      const dataUrlMatch = (u: unknown) => {
        if (typeof u !== "string") return null;
        const m = u.match(/^data:([^;]+);base64,(.+)$/);
        return m ? { mimeType: m[1], data: m[2] } : null;
      };

      const fetchAsInline = async (url: string, maxBytes: number) => {
        try {
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const contentType = (resp.headers.get("content-type") || "").split(";")[0].trim();
          const buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length === 0 || buf.length > maxBytes) return null;
          return { mimeType: contentType || (isVideo ? "video/mp4" : "image/jpeg"), data: buf.toString("base64") };
        } catch {
          return null;
        }
      };

      // "audio" = the model can actually hear the video (full file inline)
      let audioAvailable = false;
      if (isVideo) {
        // 1. BEST: fetch the whole video — Gemini processes video WITH audio
        const fetchedVideo =
          (typeof mediaUrl === "string" && mediaUrl.startsWith("http")
            ? await fetchAsInline(mediaUrl, MAX_INLINE_VIDEO_BYTES)
            : null) || dataUrlMatch(mediaUrl);
        if (fetchedVideo) {
          parts.push({ inlineData: fetchedVideo });
          audioAvailable = true;
        }
        // 2. FALLBACK: client-extracted frames (visual only — no audio track)
        if (parts.length === 0 && Array.isArray(frames) && frames.length > 0) {
          for (const frame of frames.slice(0, 5)) {
            const inline = dataUrlMatch(frame);
            if (inline) parts.push({ inlineData: inline });
          }
        }
      } else {
        // Image: data URL direct, or fetch from http(s) URL (capped at 8MB)
        const inline = dataUrlMatch(mediaUrl) ||
          (typeof mediaUrl === "string" && mediaUrl.startsWith("http") ? await fetchAsInline(mediaUrl, MAX_INLINE_IMAGE_BYTES) : null);
        if (inline) parts.push({ inlineData: inline });
      }

      if (parts.length === 0) {
        return NextResponse.json(
          {
            error: isVideo
              ? "The video could not be analyzed (too large or blocked for AI access). Try a smaller video or an image instead."
              : "The image could not be loaded for analysis. Try re-uploading it.",
          },
          { status: 400 }
        );
      }

      // ---- STAGE 1: Perception (fast vision model) ---------------------------
      const stage1Prompt = `You are a forensic-grade multimedia analyst with perfect visual and auditory comprehension.
Analyze the attached ${isVideo ? (audioAvailable ? "video (WITH its original audio track)" : "video key frames (in chronological order — no audio available)") : "image"}.

${isVideo && audioAvailable
  ? `AUDIO INSTRUCTIONS (critical):
- First determine whether the video contains meaningful human speech or voiceover (music-only or silence counts as NO speech).
- If speech exists, transcribe it as close to verbatim as possible in "transcript" (clean up filler words, keep the speaker's actual phrasing and strongest lines).
- If no speech, set "hasSpeech": false and "transcript": "".`
  : ""}

VISUAL INSTRUCTIONS: identify the exact subjects, products, setting, colors, mood, action, people, any visible text/logos, and the story the media tells. ZERO hallucination — only what is actually visible/audible.

Return ONLY raw JSON:
{
  "hasSpeech": ${isVideo ? "true/false" : "false"},
  "transcript": "spoken words, empty string if none",
  "visualDescription": "detailed factual description of the content: subjects, setting, colors, mood, action, visible text, overall story",
  "keyElements": ["element 1", "element 2", "element 3"]
}`;

      let analysis: { hasSpeech?: boolean; transcript?: string; visualDescription?: string; keyElements?: string[] };
      try {
        parts.push({ text: stage1Prompt });
        const stage1 = await vertexProvider.generateVisionText(parts, { modelName: MODELS.TREND_RESEARCHER, temperature: 0.2 });

        let text1 = (stage1 || "").replace(/```json/g, "").replace(/```/g, "").trim();
        const s1 = text1.indexOf("{");
        const e1 = text1.lastIndexOf("}");
        if (s1 !== -1 && e1 !== -1) text1 = text1.slice(s1, e1 + 1);
        analysis = JSON.parse(text1);
      } catch (err) {
        const message = (err as Error)?.message || "Media perception failed.";
        console.error("[AI Studio] analyze-media stage 1 failed:", message);
        return NextResponse.json({ error: `Could not analyze the media: ${message}` }, { status: 500 });
      }

      const transcript = String(analysis.transcript || "").slice(0, 2000);
      const hasSpeech = Boolean(analysis.hasSpeech) && transcript.trim().length > 0;
      const visualDescription = String(analysis.visualDescription || "The media could not be visually described.").slice(0, 1500);
      const keyElements = (Array.isArray(analysis.keyElements) ? analysis.keyElements : [])
        .filter((k) => typeof k === "string")
        .slice(0, 8)
        .join(", ");

      // ---- STAGE 2: Writing (gemini-3.1-pro-preview — the human-voice model) --
      const hashtagCount = Math.min(capability.hashtagLimit || 8, 8);
      const stage2Prompt = `You are an elite social media ghostwriter whose captions routinely go viral because they read like a real human wrote them — never like AI output.

SOURCE ANALYSIS (ground truth from the actual media — trust this over everything):
${hasSpeech
  ? `SPOKEN TRANSCRIPT (the media's own voice — the caption MUST build on what is actually said):
"""
${transcript}
"""
${visualDescription ? `VISUAL CONTEXT: ${visualDescription}` : ""}`
  : isVideo
  ? `VISUAL CONTENT (no speech in the video — base everything on what is shown):
"""
${visualDescription}
"""`
  : `IMAGE CONTENT:
"""
${visualDescription}
"""`}
${keyElements ? `KEY ELEMENTS: ${keyElements}` : ""}

BRAND DNA:
- Company: ${brandDNA.name} (${brandDNA.industry})
- Tone: ${brandDNA.tone}
- Target Audience: ${brandDNA.targetAudience}
${topic ? `CAMPAIGN CONTEXT: ${String(topic).slice(0, 300)}` : ""}

TARGET: ${capability.platform} ${capability.format} (${capability.mediaType})

CAPTION RULES (follow ALL):
1. First line = scroll-stopping hook born from the ACTUAL content: ${hasSpeech ? "quote or riff on the strongest spoken line" : "the single most surprising visible detail or takeaway"}.
2. Write like a real person talking: contractions, short punchy sentences, natural line breaks. Max 1-2 emojis${capability.platform === "linkedin" ? " and ZERO emojis on LinkedIn" : ""}.
3. Absolutely NO AI-clichés: "In today's world", "unlock", "delve", "game-changer", "elevate", "leverage", hashtag-stuffed sentences.
4. Deliver the core value in 2-4 tight lines, then ONE clear CTA.
5. STRICT limit: ${capability.captionLimit || 2200} characters.
${capability.supportsTitle ? `6. TITLE: clickable curiosity title under ${capability.titleLimit || 100} characters.` : ""}
${capability.supportsDescription ? `7. DESCRIPTION: SEO-rich, keyword-first description under ${capability.descriptionLimit || 500} characters.` : ""}
${hashtagCount > 0 ? `8. HASHTAGS: 3 to ${hashtagCount} real hashtags matching the visible content. Each starts with "#", PascalCase, no spaces.` : ""}
${capability.supportsAltText ? `9. ALT TEXT: literal accessibility description of the scene (subjects, setting, colors, action) under 500 characters.` : ""}
10. IMAGE PROMPT: a vivid prompt that would recreate a similar scene.

Return ONLY raw JSON:
{
  "caption": "...",
  "title": "...",
  "description": "...",
  "hashtags": ["#Tag1", "#Tag2"],
  "altText": "...",
  "imagePrompt": "..."
}`;

      try {
        const stage2 = await llm.invoke([new HumanMessage(stage2Prompt)], { modelName: MODELS.CONTENT_CREATOR, temperature: 0.85 });

        let text2 = (stage2.content?.toString() || "").replace(/```json/g, "").replace(/```/g, "").trim();
        const s2 = text2.indexOf("{");
        const e2 = text2.lastIndexOf("}");
        if (s2 !== -1 && e2 !== -1) text2 = text2.slice(s2, e2 + 1);

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text2);
        } catch {
          console.error("[AI Studio] analyze-media stage 2 JSON parse error:", text2.slice(0, 500));
          return NextResponse.json({ error: "Failed to parse the generated caption." }, { status: 500 });
        }

        // Enrich the response with what was perceived (client can surface it)
        (parsed as Record<string, unknown>).analysisSource = hasSpeech ? "transcript" : "visual";
        if (hasSpeech) (parsed as Record<string, unknown>).transcript = transcript.slice(0, 500);

        // Sanitize + clamp exactly like generate-platform-copy
        parsed.hashtags = normalizeHashtags(parsed.hashtags, { limit: capability.hashtagLimit || 10 });
        if (typeof parsed.caption === "string" && parsed.caption.length > (capability.captionLimit || 2200)) {
          parsed.caption = clampText(parsed.caption, capability.captionLimit || 2200);
        }
        if (typeof parsed.title === "string" && capability.titleLimit && parsed.title.length > capability.titleLimit) {
          parsed.title = clampText(parsed.title, capability.titleLimit);
        }
        if (typeof parsed.description === "string" && capability.descriptionLimit && parsed.description.length > capability.descriptionLimit) {
          parsed.description = clampText(parsed.description, capability.descriptionLimit);
        }

        return NextResponse.json({ success: true, data: parsed });
      } catch (err) {
        const message = (err as Error)?.message || "Caption writing failed on the AI provider.";
        console.error("[AI Studio] analyze-media stage 2 failed:", message);
        return NextResponse.json({ error: message }, { status: 500 });
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
        ? `You are an elite cinematic video director.
Enhance this video prompt for ${platform} ${format} (${capability.defaultAspectRatio} video):

Original User Prompt: """${prompt || topic || "Modern business automation"}"""
Aspect Ratio: ${capability.defaultAspectRatio}

CRITICAL RULES:
1. STRICT PRESERVATION: PRESERVE 100% of all user-specified instructions, exact text to display on screen (e.g. logos, specific words, brand names like "SMB"), voiceover requests, speech lines (e.g. "follow for more"), and special audio cues. DO NOT delete, omit, or replace any user intent.
2. ENHANCEMENT: Expand around the user's idea with vivid cinematic visual details: dynamic camera angles, cinematic studio lighting, fluid motion, depth of field, color grading, and texture realism.
3. Keep the enhanced prompt natural, unified, and production-ready for AI video generation.

Return ONLY the enhanced video prompt string without extra commentary or quotes.`
        : `You are an elite visual director.
Enhance this visual image prompt for ${platform} ${format}:

Original User Prompt: """${prompt || topic || "Modern business automation"}"""
Aspect Ratio: ${capability.defaultAspectRatio}

CRITICAL RULES:
1. STRICT PRESERVATION: PRESERVE 100% of all user-specified details, specific subjects, branding, on-screen text/typography requests, and explicit directions. DO NOT delete, omit, or replace any user intent.
2. ENHANCEMENT: Add professional photographic and aesthetic details: lighting layers, composition balance, camera lens and angle, authentic textures, reflections, and atmospheric depth.
3. Keep the enhanced prompt vivid, cohesive, and production-ready for high-definition image generation.

Return ONLY the enhanced prompt string without extra commentary or quotes.`;

      let enhanced = "";
      try {
        const res = await llm.invoke([new HumanMessage(enhancePrompt)], { modelName: MODELS.CONTENT_CREATOR });
        enhanced = (res.content?.toString() || "").trim().replace(/^["']|["']$/g, "");
      } catch (err) {
        console.warn("[AI Studio] Enhance prompt primary LLM failed, using resilient fallback:", err);
        const base = (prompt || topic || "Modern business automation").trim();
        enhanced = isVideoFormat
          ? `Cinematic high-definition ${capability.defaultAspectRatio} video of ${base}, smooth dynamic camera movement, 8k resolution, photorealistic studio lighting, deep depth of field, high-end commercial color grading.`
          : `Hyper-realistic studio photograph of ${base}, 8k resolution, elegant volumetric lighting, ultra-sharp focus, professional commercial aesthetics, authentic textures.`;
      }

      if (enhanced) {
        await cacheSet(enhanceCacheKey, enhanced, 86400).catch(() => {});
      }

      return NextResponse.json({ success: true, enhancedPrompt: enhanced });
    }

    // =========================================================================
    // STEP: Refine Caption
    // =========================================================================
    if (step === "refine-caption") {
      const { caption, action, platform, format, brandTone, topic } = body;

      if (!caption || !action) {
        return NextResponse.json({ error: "Caption and action are required." }, { status: 400 });
      }

      const capability = getPlatformCapability(platform || "instagram", format || "Feed");
      const captionLimit = capability.captionLimit || 2200;

      let refinementInstruction = "";
      if (action === "regenerate") {
        refinementInstruction = "Write a COMPLETELY NEW caption about the same topic. Different angle, different hook, different structure. Must be viral-quality and feel hand-written by a human.";
      } else if (action === "boost-hook") {
        refinementInstruction = "Rewrite ONLY the opening 1-2 lines to be an irresistible scroll-stopping hook. Use proven viral patterns: controversial question, shocking statistic, bold claim, or pattern interrupt. Keep the rest intact.";
      } else if (action === "executive-tone") {
        refinementInstruction = "Rewrite this caption in a C-suite executive voice. Remove all emojis and casual slang. Use data-driven language and strategic thought-leadership positioning.";
      } else if (action === "add-hashtags") {
        refinementInstruction = `Add 5-10 highly targeted, niche-specific hashtags that will maximize reach. Return the full caption with hashtags appended.`;
      } else {
        refinementInstruction = "Refine the caption to make it more engaging.";
      }

      const prompt = `You are an elite social media ghostwriter for ${brandDNA.name} whose captions go viral because they read like a REAL human wrote them — never like AI output.
Current Caption:
"""
${caption}
"""
Platform: ${platform || "General"}${format ? ` (${format})` : ""}
Brand Tone: ${brandTone || brandDNA.tone}${topic ? `\nTopic Context: ${String(topic).slice(0, 200)}` : ""}
Action: ${refinementInstruction}

RULES:
- Natural human voice: contractions, short punchy sentences, line breaks where a person would pause.
- NO AI-clichés ("In today's world", "unlock", "delve", "game-changer", "elevate").
- Keep the meaning intact (except for a full rewrite).
- STRICT limit: ${captionLimit} characters.

Return ONLY the refined caption text.`;

      const res = await llm.invoke([new HumanMessage(prompt)], { modelName: MODELS.CONTENT_CREATOR, temperature: 0.85 });
      let refined = (res.content?.toString() || "").trim();
      if (refined.length > captionLimit) {
        refined = clampText(refined, captionLimit);
      }
      return NextResponse.json({ success: true, caption: refined });
    }

    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  } catch (error: any) {
    console.error("AI Studio API Error:", error);
    return NextResponse.json({ error: error.message || "An error occurred in AI Studio." }, { status: 500 });
  }
}
