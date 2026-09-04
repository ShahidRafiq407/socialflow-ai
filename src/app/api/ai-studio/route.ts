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

import { billedRoute, unbilled, entitlementResponse } from "@/lib/billing/route";
import { withMeterContext } from "@/lib/billing/meter";
import type { ActionKey } from "@/lib/billing/actions";
import { parseBrandMetadata } from "@/lib/brand/profile";
import {
  contentDoctrine,
  defaultTopicHint,
  trendSearchQuery,
  AUDIENCE_FIRST_AUDIT_CRITERIA,
  ENGAGEMENT_CLOSE_RULE,
  PROMOTION_BAN_RULE,
  PROMO_FIX_HINT,
  VISUAL_PROMPT_RULE,
} from "@/lib/agents/contentStrategy";
import { findSelfPromotion } from "@/lib/agents/qualityChecks";

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

// ─────────────────────────────────────────────────────────────────────────────
// WHAT EACH STEP COSTS
//
// One entry per billable step. A step that is absent from this map is free: the
// editor's validation and lookup calls run unwrapped, and an unknown step falls
// through to the 400 without ever touching a plan.
//
// `generate-media` is deliberately absent and deliberately not free. A render is
// charged per asset at `generateMediaAsset`, because one click there can ask for
// seven carousel slides and a route-level charge would bill it as one. What this
// route owes that choke point is a metering scope naming the owner, which the
// dispatcher below opens for it.
// ─────────────────────────────────────────────────────────────────────────────

const STEP_ACTIONS: Record<string, ActionKey> = {
  "generate-platform-copy": "ai.post.single",
  "analyze-media": "ai.post.fromMedia",
  "refine-caption": "ai.post.rewrite",
  "generate-trend-suggestions": "ai.trend.suggest",
  "generate-field": "ai.post.field",
  "regenerate-slide": "ai.post.field",
  "auto-prompt-from-script": "ai.post.field",
  "enhance-prompt": "ai.post.field",
};

/** The steps that call a model but are billed somewhere other than here. */
const METERED_ONLY_STEPS = new Set(["generate-media"]);

interface StudioStepContext {
  body: any;
  step: string;
  workspace: any;
  brandDNA: {
    name: string;
    industry: string;
    website: string;
    tone: string;
    missionVision: string;
    targetAudience: string;
    writingStyle: string;
    primaryColors: string[];
  };
  userId: string;
}

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

    const ctx: StudioStepContext = { body, step, workspace, brandDNA, userId };
    const action = typeof step === "string" ? STEP_ACTIONS[step] : undefined;

    if (action) {
      return await billedRoute(
        { userId, action, workspaceId: workspace.id, surface: "ai-studio", measureCost: true },
        () => runStudioStep(ctx)
      );
    }

    if (typeof step === "string" && METERED_ONLY_STEPS.has(step)) {
      return await withMeterContext(
        { userId, workspaceId: workspace.id, feature: "ai-studio", action: null },
        () => runStudioStep(ctx)
      );
    }

    return await runStudioStep(ctx);
  } catch (error: any) {
    console.error("AI Studio API Error:", error);
    return NextResponse.json({ error: error.message || "An error occurred in AI Studio." }, { status: 500 });
  }
}

async function runStudioStep(ctx: StudioStepContext): Promise<NextResponse> {
  const { body, step, workspace, brandDNA, userId } = ctx;
  try {
    // =========================================================================
    // STEP: Generate Platform-Specific Copy & Media Prompt (Multi-Agent)
    // =========================================================================
    if (step === "generate-platform-copy") {
      const { platform, format, topic, customPrompt, duration, slideCount, slideInstructions, direction } = body;
      const capability = getPlatformCapability(platform, format);
      const campaignTopic = topic || customPrompt || defaultTopicHint(brandDNA);
      // A trend the user hand-picked in the TRENDING NOW panel travels as DIRECTION,
      // never folded into the topic: `campaignTopic` becomes the subject boundary and
      // the slide-title fallback, so a whole hook sentence inside it muddies both.
      // Kept separate, the picked hook and angle still reach the writer verbatim.
      const pickedDirection = String(direction || "").trim().slice(0, 600);
      const isVideoFormat = capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(format);
      // Informational deck formats: the storyboard length the user picked in the Studio
      // decides how many slides get written (and therefore how many get designed).
      const isDeckFormat = isTextRichFormat(format, capability.mediaType);
      const targetSlides = isDeckFormat
        ? Math.min(capability.maxMedia || MAX_DECK_SLIDES, clampDeckSlides(slideCount, 5))
        : 0;

      // Check Redis Cache
      const copyCacheKey = `aistudio:copy:${platform}:${format}:${Buffer.from(campaignTopic).toString("base64").slice(0, 36)}:${duration || 5}:${targetSlides}:${Buffer.from(String(slideInstructions || "")).toString("base64").slice(0, 24)}:${Buffer.from(pickedDirection).toString("base64").slice(0, 24)}`;
      const cachedCopy = await cacheGet<any>(copyCacheKey);
      if (cachedCopy) {
        console.log(`[AI Studio] Returning Redis cached copy for ${platform} ${format}`);
        return NextResponse.json({ success: true, data: cachedCopy, fromCache: true });
      }

      // 1. Trend Research with Google Search Grounding.
      // The query asks what the AUDIENCE is arguing about, not what marketers are
      // posting — that difference is what makes the post worth reading.
      let trendInsights =
        "Audience rewards a specific, teachable claim over encouragement, and replies when asked a real question.";
      try {
        const trendQuery = trendSearchQuery(brandDNA, campaignTopic, capability.platform);
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
          const compQuery = `In ${brandDNA.industry} ${new Date().getFullYear()}: which questions and topics are already covered to death by everyone publishing in this space, and which questions the audience keeps asking are still answered badly or not at all?`;
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
      // Differentiation is topical, not promotional: say the thing nobody has said
      // well yet. (The old wording asked the model to "emphasize what only <brand>
      // offers", which is how every post ended up as a pitch.)
      const competitorAngle = competitorInsight
        ? `SATURATION MAP (Google-grounded, cached 24h):\n"""\n${competitorInsight}\n"""\nAvoid the saturated angles entirely. Aim the post at a question this list says is still answered badly — and never mirror a competitor's sales framing.`
        : dbCompetitors.length > 0
        ? `These publishers already cover this field: ${dbCompetitors.slice(0, 5).map((c: any) => c.name).join(", ")}. Say the thing they are all skipping, in more concrete detail than they use.`
        : `Choose the angle with the highest information density: something specific the reader cannot get from a generic overview.`;

      // 3. Content Creator Agent — audience-first doctrine + format-native directives
      const contentPrompt = `You are a subject-matter writer who happens to be excellent at social media. You are NOT an advertiser.
Write one publish-ready ${capability.platform.toUpperCase()} ${capability.format} that a smart reader would stop for, learn from, and reply to.

${contentDoctrine({ brand: brandDNA, topic: campaignTopic, seed: `${capability.platform}:${capability.format}:${campaignTopic}` })}

WHAT THE AUDIENCE IS ACTUALLY DISCUSSING (grounded research — mine this for the specifics):
${trendInsights}
${
  pickedDirection
    ? `\nTHE TREND THE USER PICKED FOR THIS POST — this is the brief. Open on it, then teach past it:\n${pickedDirection}\n`
    : ""
}
WHERE THE GAP IS: ${competitorAngle}

PLATFORM REQUIREMENTS:
- Platform: ${capability.platform}
- Format: ${capability.format}
- Media Type: ${capability.mediaType.toUpperCase()}
- Default Aspect Ratio: ${capability.defaultAspectRatio}
- Character Limit: ${capability.captionLimit || capability.descriptionLimit || 2200}

STRICT PRO WRITER DIRECTIVES:
1. CAPTION:
   - STRICT LENGTH LIMIT: The caption MUST NOT EXCEED ${capability.captionLimit || 2200} characters under any circumstances! Count your characters before returning!
   - First sentence MUST be a pattern interrupt built on substance: a specific number, a named mistake, a contrarian claim, or a question the reader cannot answer instantly.
   - The body must deliver the thing the hook promised — the mechanism, the steps, the trade-off, or the numbers. One concrete, quotable specific minimum.
   - Vary sentence lengths for conversational, human rhythm.
   - STRICT BANS: NO "In today's fast-paced world", NO "Unleash/Unlock", NO "Dive deep", NO "Game changer", NO excessive em dashes, NO robotic emoji spam.
   - NOTHING PROMOTIONAL: no offer, no service, no availability, no "partner with us", no "we build/we help/we provide", no "DM us", no "link in bio", no credential boasts, and never claim the business did any work or got any result.
   - ${ENGAGEMENT_CLOSE_RULE}

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
   - ${VISUAL_PROMPT_RULE}

3. If format is Pinterest: Craft a Pin Title (under 100 chars) that states what the reader will learn, a Pin Description that actually teaches the first step or the key number (searchable, never a pitch, never "partner with us"), SEO Keywords/Tagged Topics, and Alt Text.
${
  isDeckFormat
    ? `4. THIS IS AN INFORMATIONAL DECK FORMAT (${capability.format}) — MANDATORY:
   - Return EXACTLY ${targetSlides} entries in "slides". Not fewer, not more.
   - Every slide is rendered as a DESIGNED INFOGRAPHIC: its "title" and "body" are TYPESET ONTO the graphic by the design engine. Write them as finished on-slide copy, not as instructions.
   - Storyboard arc across the ${targetSlides} slides: slide 1 = hook that earns the swipe, middle slides = the problem, the framework/steps, and the proof (metrics, benchmark, real example), final slide = the single takeaway plus the question that pulls the reader into the comments. NEVER a sales CTA, a service pitch or contact details on any slide.
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
  "title": "${capability.supportsTitle ? "Concise, clickable title under 100 chars that promises what the reader learns" : ""}",
  "caption": "Full platform-tailored copy with natural paragraphs. Opens on the hook, delivers the substance, ends on a question the reader can answer.",
  "description": "${capability.supportsDescription ? "Rich, searchable description that teaches the key point — never a pitch" : ""}",
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
        new SystemMessage(
          "You are a subject-matter writer, not an advertiser. You publish content people learn from and reply to, never promotional copy. Output valid JSON only."
        ),
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

      // 4. CEO Auditor Review — deterministic first, model second.
      // Whether a post is an advert is not a matter of taste, so it is decided in
      // code: the same phrase list the writer was warned about is scanned here, any
      // hit rejects the copy outright, and the revision pass gets an exact target
      // list instead of a vague complaint. When it fires we also skip the audit
      // call entirely — the verdict is already known.
      const auditBlob = () =>
        [
          parsed.title,
          parsed.caption,
          parsed.description,
          parsed.hook,
          ...(Array.isArray(parsed.slides) ? parsed.slides.flatMap((s: any) => [s?.title, s?.body]) : []),
        ]
          .filter(Boolean)
          .join("\n");

      const promoHits = findSelfPromotion(auditBlob());

      const auditPrompt = `You are the CEO Auditor. Review this ${capability.platform} (${capability.format}) post. It is published by ${brandDNA.name}, but it must read as content, not as an advert:
Title: ${parsed.title || "N/A"}
Caption: ${parsed.caption || parsed.description || "N/A"}
Hook: ${parsed.hook || "N/A"}
Media Prompt: ${parsed.videoPrompt || parsed.imagePrompt || parsed.mediaGenerationPrompt || "N/A"}

Criteria:
${AUDIENCE_FIRST_AUDIT_CRITERIA}
- Is it human and conversational without AI clichés?
- Is the visual prompt appropriate for ${capability.mediaType.toUpperCase()} (${capability.defaultAspectRatio}), and free of logos, slogans and contact details?
Score below 70 if any criterion fails, and name the exact line that failed in the feedback.
Respond with JSON: {"approved": true, "score": 95, "feedback": "Approved"}`;

      let ceoScore = 95;
      let ceoFeedback = "Approved by Creative Director";
      let ceoRevised = false;
      if (promoHits.length > 0) {
        ceoScore = 45;
        ceoFeedback = `This reads as an advert instead of content the reader gets something from. Promotional wording found: ${promoHits.join(", ")}. ${PROMO_FIX_HINT}`;
        console.log(`[AI Studio] Promotional copy rejected for ${platform} ${format}: ${promoHits.join(", ")}`);
      } else {
        try {
          const auditRes = await llm.invoke([new HumanMessage(auditPrompt)], { modelName: MODELS.CEO_SUPERVISOR });
          const auditParsed = JSON.parse((auditRes.content?.toString() || "{}").replace(/```json/g, "").replace(/```/g, "").trim());
          ceoScore = auditParsed.score || 95;
          ceoFeedback = auditParsed.feedback || ceoFeedback;
        } catch {}
      }

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

${contentDoctrine({ brand: brandDNA, topic: campaignTopic, seed: `${capability.platform}:${capability.format}:${campaignTopic}`, includeAngle: false })}

Keep the subject and the format identical. Fix the failures, do not reword around them.
Return the CORRECTED content as JSON with the SAME structure as the original. No commentary.`;
          const reviseRes = await llm.invoke([
            new SystemMessage(
              "You are a subject-matter writer, not an advertiser. Output valid JSON only."
            ),
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

      // Report the truth. If the rewrite kept the sales language, the badge must not
      // say "revised" over copy that still pitches — the editor shows this score.
      const promoHitsFinal = ceoRevised ? findSelfPromotion(auditBlob()) : promoHits;
      if (promoHitsFinal.length > 0) {
        ceoScore = Math.min(ceoScore, 55);
        ceoFeedback = `${ceoFeedback} Still reads promotional: ${promoHitsFinal.join(", ")} — rewrite these lines before publishing.`;
      }

      const resultPayload = {
        ...parsed,
        prompt: finalPrompt,
        videoPrompt: isVideoFormat ? finalPrompt : undefined,
        imagePrompt: !isVideoFormat ? finalPrompt : undefined,
        mediaGenerationPrompt: finalPrompt,
        ceoAudit: { score: ceoScore, feedback: ceoFeedback, revised: ceoRevised },
      };

      // Save to Redis Cache (24 hours TTL). Copy that is still promotional is NOT
      // cached — otherwise a regenerate would hand the user the same advert back for
      // a day, with no way to get a clean version.
      if (promoHitsFinal.length === 0) {
        await cacheSet(copyCacheKey, resultPayload, 86400);
      }

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
      const campaignTopic = topic || defaultTopicHint(brandDNA);

      const fieldSpecs: Record<string, { instruction: string; limit: number | null }> = {
        title: {
          instruction: `Write ONE concise ${capability.platform} title that tells the reader exactly what they will learn or reconsider. No pitch, no company name, no hashtags, no quotes, no explanation — the title text only.`,
          limit: capability.titleLimit || 100,
        },
        description: {
          instruction: `Write ONE searchable ${capability.platform} description that delivers the key point or first step itself. Informational, never a pitch — no offers, no services, no "contact us". Plain text only — no title, no hashtags, no explanation.`,
          limit: capability.descriptionLimit || 500,
        },
        caption: {
          instruction: `Write ONE ${capability.platform} ${capability.format} post text (caption). Open on a specific hook, deliver something the reader can use, and close with a question about their own experience — never a sales CTA. Plain text only.`,
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

      const fieldPrompt = `You are a ${capability.platform} content specialist who writes for the reader, not for the sales team.
Generate ONLY this field: ${field.toUpperCase()} for a ${capability.platform} ${capability.format} post.

${contentDoctrine({ brand: brandDNA, topic: campaignTopic, seed: `${capability.platform}:${field}:${campaignTopic}`, includeAngle: false })}

${context ? `EXISTING CONTENT CONTEXT (do not duplicate, stay consistent):\n${String(context).slice(0, 600)}` : ""}

TASK: ${spec.instruction}
${spec.limit ? `HARD LIMIT: ${spec.limit} characters maximum.` : ""}
${field === "hashtags" ? `Provide ${Math.min(capability.hashtagLimit || 10, 8)} hashtags as a JSON array of strings, e.g. ["#DigitalMarketing", "#GrowthStrategy"].` : "Return ONLY the field value as plain text — no quotes, no labels, no commentary."}`;

      try {
        const res = await llm.invoke([
          new SystemMessage(
            "You write informational content people learn from, never promotional copy. Follow output format instructions exactly."
          ),
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
      const slideTopic = topic || commentary || defaultTopicHint(brandDNA);
      const customInstruction = prompt || "Make this slide teach one concrete thing more clearly — a number, a step, or a trade-off";

      const slidePrompt = `You are a slide deck writer for ${capability.platform.toUpperCase()} (${capability.format}). The deck teaches; it never sells.
Rewrite and improve Slide #${(slideIndex ?? 0) + 1} (${slideType || "content"}).

${contentDoctrine({ brand: brandDNA, topic: slideTopic, seed: `${capability.platform}:slide:${slideIndex ?? 0}`, includeAngle: false })}

USER CUSTOM INSTRUCTIONS: ${customInstruction}
CURRENT SLIDE HEADING: ${currentSlide?.title || ""}
CURRENT SLIDE POINTS/BODY: ${currentSlide?.body || (Array.isArray(currentSlide?.points) ? currentSlide.points.join("\n") : "")}

Generate a clear, high-impact heading and 2 to 4 crisp bullet points (each under 100 characters). Every point must carry real information — a figure, a step or a named trade-off. ${PROMOTION_BAN_RULE}
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
Field: ${brandDNA.industry}

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
- ${VISUAL_PROMPT_RULE}
- Length: 45-80 words of vivid, high-density cinematic detail.

Return ONLY the plain text prompt string with no quotes or extra text.`
        : `You are an elite visual director.
Read this post caption:
"""
${caption || topic || "Modern business technology"}
"""
Platform: ${platform} (${format})
Aspect Ratio: ${capability.defaultAspectRatio}
Field: ${brandDNA.industry}

Write a complete, vivid AI image generation prompt describing composition, lighting, subject, and style.
${VISUAL_PROMPT_RULE}
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
          topic: topic || brandDNA.industry,
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
          // Named explicitly as well as ambiently: the render is charged per asset
          // inside `generateMediaAsset`, and that charge refuses to run without an
          // owner. Passing it here means a lost async context cannot break the step.
          billing: { userId, workspaceId: workspace.id },
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
        // A plan refusal is not a provider fault. `generate-media` is metered-only, so
        // nothing above this catch converts it: without this, a Trial that has used its
        // image or video allowance got a generic 500 and the studio reported "Media
        // synthesis failed" instead of opening the upgrade prompt.
        const refusal = entitlementResponse(err);
        if (refusal) return refusal;
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

${contentDoctrine({ brand: brandDNA, topic: topic ? String(topic).slice(0, 300) : null, seed: `${capability.platform}:media:${capability.format}`, includeAngle: false })}

TARGET: ${capability.platform} ${capability.format} (${capability.mediaType})

CAPTION RULES (follow ALL):
1. First line = scroll-stopping hook born from the ACTUAL content: ${hasSpeech ? "quote or riff on the strongest spoken line" : "the single most surprising visible detail or takeaway"}.
2. Write like a real person talking: contractions, short punchy sentences, natural line breaks. Max 1-2 emojis${capability.platform === "linkedin" ? " and ZERO emojis on LinkedIn" : ""}.
3. Absolutely NO AI-clichés: "In today's world", "unlock", "delve", "game-changer", "elevate", "leverage", hashtag-stuffed sentences.
4. Explain what is actually happening in this media and why it matters, in 2-4 tight lines — then close with a question about the reader's own experience. NO sales CTA, no offer, no "DM us", and never claim who made this or who it was made for.
5. STRICT limit: ${capability.captionLimit || 2200} characters.
${capability.supportsTitle ? `6. TITLE: curiosity title under ${capability.titleLimit || 100} characters that says what the reader will take away.` : ""}
${capability.supportsDescription ? `7. DESCRIPTION: searchable, keyword-first description under ${capability.descriptionLimit || 500} characters that teaches rather than pitches.` : ""}
${hashtagCount > 0 ? `8. HASHTAGS: 3 to ${hashtagCount} real hashtags matching the visible content. Each starts with "#", PascalCase, no spaces.` : ""}
${capability.supportsAltText ? `9. ALT TEXT: literal accessibility description of the scene (subjects, setting, colors, action) under 500 characters.` : ""}
10. IMAGE PROMPT: a vivid prompt that would recreate a similar scene. ${VISUAL_PROMPT_RULE}

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
        // Nothing was researched, so nothing is charged — the hold taken for this
        // step is released and the balance never moves.
        return unbilled(
          NextResponse.json({ success: true, trends: cachedTrends, fromCache: true }),
          "served from cache"
        );
      }

      const searchQuery = trendSearchQuery(brandDNA, null, platform);
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

      const prompt = `You are a content strategist who finds the topics an audience genuinely wants answered.
Live research for ${brandDNA.industry} on ${platform} (${format}):
"""
${rawTrends.slice(0, 1500)}
"""

Recommend 3 content ideas for an audience of ${brandDNA.targetAudience} working in ${brandDNA.industry}.

RULES:
- Every idea must be informational, educational, myth-correcting or question-led. Something the reader learns from or argues with.
- NOT ONE promotional idea. No "showcase your services", no case studies, no offers, no behind-the-scenes brand stories, no hiring or availability posts. Never suggest an idea that requires claiming work the business may not have done.
- Each idea must be specific enough to write today: a named shift, a real number, a concrete mistake or a live disagreement.
- The hook must earn the second line, and the angle must end by inviting the reader's own view.

Return ONLY JSON array of 3 objects:
[
  {
    "id": "trend_1",
    "topic": "The specific question or claim this post tackles",
    "whyItFits": "Short 1-sentence reason this audience cares right now",
    "suggestedHook": "Specific scroll-stopping hook line",
    "contentAngle": "How to execute this in a ${format} format, ending on a question",
    "recommendedFormat": "${format}",
    "source": "${sources[0]?.title || "Industry Trend Analysis"}"
  }
]`;

      const res = await llm.invoke([new HumanMessage(prompt)], { modelName: MODELS.TREND_RESEARCHER });
      let text = (res.content?.toString() || "").replace(/```json/g, "").replace(/```/g, "").trim();
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);

      // The panel needs an ARRAY of cards, each with a stable id — the Use-Trend button
      // keys its in-flight state off `id`, so a missing one breaks the spinner and the
      // guard. A ragged or non-JSON reply used to 500 the whole request (the panel then
      // read as "no trends available") and a non-array could be cached for an hour.
      let trends: any[] = [];
      try {
        const raw = JSON.parse(text);
        trends = (Array.isArray(raw) ? raw : [])
          .filter((t: any) => t && String(t.topic || "").trim())
          .slice(0, 3)
          .map((t: any, idx: number) => ({
            id: String(t.id || `trend_${idx + 1}`),
            topic: String(t.topic || "").trim(),
            whyItFits: String(t.whyItFits || "").trim(),
            suggestedHook: String(t.suggestedHook || "").trim(),
            contentAngle: String(t.contentAngle || "").trim(),
            recommendedFormat: String(t.recommendedFormat || format || "").trim(),
            source: String(t.source || sources[0]?.title || "Industry Trend Analysis").trim(),
          }));
      } catch (parseErr) {
        console.error("[AI Studio] Trend suggestions JSON parse failed:", text.slice(0, 400));
      }

      if (trends.length === 0) {
        return NextResponse.json(
          { success: false, error: "The trend researcher returned nothing usable. Try Refresh." },
          { status: 502 }
        );
      }

      // Cache trends in Redis (1 hour TTL) — only a usable set gets cached.
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
        refinementInstruction = "Write a COMPLETELY NEW caption about the same subject. Different angle, different hook, different structure. It must teach or challenge something concrete and read as if a human who knows the field wrote it.";
      } else if (action === "boost-hook") {
        refinementInstruction = "Rewrite ONLY the opening 1-2 lines into a hook the reader cannot skip: a specific number, a named mistake, a bold claim they will want to argue with, or a question they cannot answer instantly. Keep the rest intact.";
      } else if (action === "executive-tone") {
        refinementInstruction = "Rewrite this caption in a senior-practitioner voice. Remove all emojis and casual slang. Argue from evidence — figures, mechanisms, trade-offs — not from status or positioning.";
      } else if (action === "add-hashtags") {
        refinementInstruction = `Add 5-10 highly targeted, niche-specific hashtags that will maximize reach. Return the full caption with hashtags appended.`;
      } else {
        refinementInstruction = "Refine the caption so it delivers more of the thing the reader came for, in fewer words.";
      }

      const prompt = `You are a ghostwriter who writes as a practitioner in ${brandDNA.industry}, not as an advertiser. Your captions read like a REAL human wrote them — never like AI output, never like a sales page.
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
- Keep the subject intact (except for a full rewrite).
- ${PROMOTION_BAN_RULE} If the current caption sells, pitches, or claims work the business did, strip that out and put the reader's substance in its place.
- ${ENGAGEMENT_CLOSE_RULE}
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
