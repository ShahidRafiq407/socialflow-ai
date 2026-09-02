import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { fetchSerpAnalysis } from "@/actions/serp";
import { generateSeoArticle } from "@/lib/agents/workers/article-generator";
import { llm } from "@/lib/agents/llm";
import { HumanMessage } from "@langchain/core/messages";
import {
  testWPConnection,
  fetchWPCategories,
  fetchWPAuthors,
  fetchWPPostTypes,
  publishToWordPress,
  createWPCategory,
} from "@/actions/wordpress";
import { getWordPressConfig } from "@/lib/wordpress/siteConfig";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * One WordPress connection per workspace, shared with the Lead Goal engine.
 *
 * Credentials sent from the browser are only honoured while the user is
 * actively testing a site in this tab; otherwise the saved (encrypted)
 * connection is used, so the app password never has to leave the server.
 */
async function resolveWpConfig(
  userId: string,
  wpConfig: any
): Promise<{ config: any | null; fromSaved: boolean }> {
  if (wpConfig?.siteUrl && wpConfig?.username && wpConfig?.appPassword) {
    return { config: wpConfig, fromSaved: false };
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!workspace) return { config: null, fromSaved: false };

  const saved = await getWordPressConfig(workspace.id);
  return { config: saved, fromSaved: Boolean(saved) };
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { step } = body;

    // ── AI GATING ─────────────────────────────────────────────────────────────
    // Steps that consume paid AI generation require a paid plan.
    const aiSteps = new Set([
      "generate",
      "serp-only",
      "suggest-keyword",
      "suggest-title",
      "suggest-categories",
      "enhance-seo",
    ]);
    if (aiSteps.has(step)) {
      const workspace = await prisma.workspace.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (workspace) {
        const { checkAIAccess } = await import("@/lib/billing/gate");
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
    }

    // =========================================================================
    // STEP: WordPress Connect & Fetch Metadata
    // =========================================================================
    if (step === "wp-connect") {
      const { config, fromSaved } = await resolveWpConfig(userId, body.wpConfig);
      if (!config) {
        return NextResponse.json(
          {
            error:
              "No WordPress connection. Connect your site once in Plugins, or fill in the site URL, username and application password here.",
          },
          { status: 400 }
        );
      }

      const connected = await testWPConnection(config);
      if (!connected) {
        return NextResponse.json({
          wpConnected: false,
          error: "Could not connect to WordPress. Check URL and credentials.",
        });
      }

      const [categories, authors, postTypes] = await Promise.all([
        fetchWPCategories(config),
        fetchWPAuthors(config),
        fetchWPPostTypes(config),
      ]);

      return NextResponse.json({
        wpConnected: true,
        categories,
        authors,
        postTypes,
        usingSavedConnection: fromSaved,
        siteUrl: config.siteUrl,
      });
    }

    // =========================================================================
    // STEP: WordPress Publish
    // =========================================================================
    if (step === "wp-publish") {
      const { publishPayload } = body;
      if (!publishPayload) {
        return NextResponse.json({ error: "Publish payload is required." }, { status: 400 });
      }

      const { config } = await resolveWpConfig(userId, body.wpConfig);
      if (!config) {
        return NextResponse.json(
          { error: "No WordPress connection. Connect your site in Plugins first." },
          { status: 400 }
        );
      }

      const result = await publishToWordPress(config, publishPayload);
      return NextResponse.json(result);
    }

    // =========================================================================
    // STEP: Create WordPress Category
    // =========================================================================
    if (step === "create-category") {
      const { name } = body;
      if (!name) {
        return NextResponse.json({ error: "Category name is required." }, { status: 400 });
      }

      const { config } = await resolveWpConfig(userId, body.wpConfig);
      if (!config) {
        return NextResponse.json(
          { error: "No WordPress connection. Connect your site in Plugins first." },
          { status: 400 }
        );
      }

      const newCat = await createWPCategory(config, name);
      if (!newCat) {
        return NextResponse.json(
          { error: "Failed to create category in WordPress." },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, category: newCat });
    }

    // =========================================================================
    // STEP: AI Suggest Categories
    // =========================================================================
    if (step === "suggest-categories") {
      const { keyword, title, existingCategories } = body;
      if (!keyword) {
        return NextResponse.json({ error: "Keyword is required." }, { status: 400 });
      }
      try {
        const catPrompt = `You are an SEO Content Taxonomy Expert.
Based on the keyword "${keyword}" and article title "${title || keyword}", recommend up to 3 best fitting categories from this existing list: ${JSON.stringify(existingCategories || [])}.
If none fit well, recommend 1 or 2 new category names that should be created.
Return a JSON array of strings with the category names. Do not include markdown code block syntax. Just a raw JSON array of strings like ["Technology", "AI Tools"].`;
        const catRes = await llm.invoke([new HumanMessage(catPrompt)]);
        const rawText = typeof catRes.content === "string" ? catRes.content : "";
        const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const suggested = JSON.parse(cleanJson);
        return NextResponse.json({ success: true, suggested });
      } catch (e: any) {
        return NextResponse.json({ success: true, suggested: ["Technology", "Guides"] });
      }
    }

    // =========================================================================
    // STEP: SERP-Only (fetch SERP data without generating article)
    // =========================================================================
    if (step === "serp-only") {
      const { keyword } = body;
      if (!keyword) {
        return NextResponse.json(
          { error: "Keyword is required." },
          { status: 400 }
        );
      }

      const serpRes = await fetchSerpAnalysis(keyword);
      return NextResponse.json({
        serpData: serpRes.success ? serpRes.data : null,
        serpError: serpRes.error,
      });
    }

    // =========================================================================
    // STEP: Suggest Keyword (AI + Brand DNA + SERP Trend based)
    // =========================================================================
    if (step === "suggest-keyword") {
      const { workspaceId } = body;
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { brandDNA: true },
      });

      if (!workspace) {
        return NextResponse.json(
          { error: "Workspace not found." },
          { status: 404 }
        );
      }

      const brandName = workspace.name || "Our Brand";
      const industry = workspace.industry || "General Tech & Marketing";
      const targetAudience = workspace.brandDNA?.targetAudience || "General Audience";
      const tone = workspace.brandDNA?.tone || "Professional";

      try {
        const prompt = `You are an expert SEO Strategist for "${brandName}" in the "${industry}" industry. Target Audience: "${targetAudience}". Tone: "${tone}".
Generate exactly 4 high-intent, trending long-tail SEO keywords that this brand should write articles on right now to rank on Google's 1st page in 2026.
Return ONLY a valid JSON array of 4 string keywords, e.g. ["best embedded systems for IoT 2026", "how to design custom PCB for robotics", "top microcontroller boards for industrial automation", "ros2 robotics tutorials for beginners"]. Do not include markdown formatting or extra text.`;

        const response = await llm.invoke([new HumanMessage(prompt)]);
        const rawText = (response.content || "").toString().replace(/```json/g, "").replace(/```/g, "").trim();
        const keywords = JSON.parse(rawText);
        return NextResponse.json({ success: true, keywords });
      } catch (e: any) {
        const fallback = [
          `best ${industry.toLowerCase()} solutions for 2026`,
          `how to implement ${industry.toLowerCase()} strategies efficiently`,
          `top 10 trends in ${industry.toLowerCase()} you need to know`,
          `complete guide to ${industry.toLowerCase()} for ${targetAudience.toLowerCase()}`,
        ];
        return NextResponse.json({ success: true, keywords: fallback });
      }
    }
    // =========================================================================
    // STEP: Suggest Title (AI + SERP Competitors + Brand DNA)
    // =========================================================================
    if (step === "suggest-title") {
      const { keyword, workspaceId } = body;
      if (!keyword) {
        return NextResponse.json(
          { error: "Keyword is required to generate titles." },
          { status: 400 }
        );
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { brandDNA: true },
      });

      const brandName = workspace?.name || "Our Brand";
      const industry = workspace?.industry || "Technology";
      const targetAudience = workspace?.brandDNA?.targetAudience || "General Audience";
      const tone = workspace?.brandDNA?.tone || "Professional";

      // Fetch SERP competitor titles for this keyword
      let competitorTitles = "";
      try {
        const serpRes = await fetchSerpAnalysis(keyword);
        if (serpRes.success && serpRes.data) {
          competitorTitles = serpRes.data.topResults
            .slice(0, 7)
            .map((r, i) => `${i + 1}. "${r.title}"`)
            .join("\n");
        }
      } catch (e) {
        // SERP fetch failed, continue without competitor data
      }

      try {
        const prompt = `You are the world's #1 SEO Title Strategist. Generate exactly 4 highly click-worthy, SEO-optimized article titles for the keyword "${keyword}".

BRAND CONTEXT:
- Brand: "${brandName}"
- Industry: "${industry}"
- Target Audience: "${targetAudience}"
- Tone: "${tone}"

${competitorTitles ? `CURRENT TOP GOOGLE COMPETITORS (you must BEAT these titles in CTR):\n${competitorTitles}\n\nAnalyze why these titles rank. Then create BETTER titles that would outperform them in Click-Through Rate.` : ""}

TITLE RULES (Google SEO Best Practices 2026):
1. Primary keyword "${keyword}" MUST appear near the START of each title
2. Include a power word in each (Ultimate, Complete, Proven, Essential, Expert, Definitive)
3. Include a number or year in at least 2 titles (e.g., "7 Steps", "2026 Guide", "Top 10")
4. Use emotional triggers: curiosity gaps, urgency, or benefit-driven hooks
5. Keep titles between 55-65 characters (optimal for Google SERP display)
6. Each title must have a DIFFERENT angle: how-to, listicle, comparison, deep-dive
7. Make them sound HUMAN and compelling — not generic or AI-sounding
8. Consider search intent: what is the user REALLY looking for when they type "${keyword}"?

OUTPUT: Return ONLY a valid JSON array of exactly 4 title strings. No markdown, no explanation.
Example: ["Title 1", "Title 2", "Title 3", "Title 4"]`;

        const response = await llm.invoke([new HumanMessage(prompt)]);
        const rawText = (response.content || "")
          .toString()
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        const titles = JSON.parse(rawText);
        return NextResponse.json({ success: true, titles });
      } catch (e: any) {
        // Fallback with smart templates
        const fallbackTitles = [
          `${keyword}: The Complete 2026 Guide (Expert Breakdown)`,
          `How to Master ${keyword} — 7 Proven Strategies That Work`,
          `${keyword} Explained: Everything ${targetAudience} Need to Know`,
          `Top 10 ${keyword} Tips for ${industry} Professionals in 2026`,
        ];
        return NextResponse.json({ success: true, titles: fallbackTitles });
      }
    }

    // =========================================================================
    // STEP: 1-Click SEO Score & E-E-A-T Enhancer (No Layout/Topic Change)
    // =========================================================================
    if (step === "enhance-seo") {
      const { content, keyword, title } = body;
      if (!content || !keyword) {
        return NextResponse.json(
          { error: "Content and Keyword are required to enhance SEO." },
          { status: 400 }
        );
      }
      try {
        const prompt = `You are a Principal Google SEO & E-E-A-T Auditor.
Your job is to ENHANCE the SEO Score and Google E-E-A-T signals of the following HTML article for keyword "${keyword}" to 98-100/100 WITHOUT CHANGING ITS STRUCTURE, LAYOUT, OR TOPIC.

CRITICAL RULES:
1. PRESERVE ALL HTML TAGS EXACTLY: Do NOT remove or modify any <figure>, <img>, <iframe>, <h2>, <h3>, <table>, or <div> classes.
2. KEYWORD DENSITY OPTIMIZATION: Ensure the primary keyword "${keyword}" and relevant LSI vocabulary appear naturally in the paragraphs so Keyword Density is optimal (between 1.2% - 1.8%).
3. ELEVATE E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness): Enrich vocabulary, add real-world data points, technical insights, or "Pro-Tips" inside existing paragraphs without altering formatting or human voice.
4. DO NOT change the topic or add generic AI fluff. Keep it conversational and authoritative.
5. Return ONLY the enhanced HTML string. No markdown formatting, no explanation.

ARTICLE HTML TO ENHANCE:
${content}`;

        const response = await llm.invoke([new HumanMessage(prompt)]);
        let enhancedHtml = (response.content || "").toString()
          .replace(/```html/g, "")
          .replace(/```/g, "")
          .trim();
        if (!enhancedHtml || enhancedHtml.length < content.length * 0.5) {
          enhancedHtml = content;
        }
        return NextResponse.json({ success: true, enhancedHtml });
      } catch (e: any) {
        return NextResponse.json({ success: true, enhancedHtml: content });
      }
    }

    // =========================================================================
    // DEFAULT STEP: Full Article Generation
    // =========================================================================
    const {
      keyword,
      title,
      workspaceId,
      enableSerp,
      articleSize,
      serpData: existingSerpData,
      targetWebsite,
      targetCountry,
      enableYoutube,
      toneOfVoice,
      pointOfView,
    } = body;

    if (!keyword || !workspaceId) {
      return NextResponse.json(
        { error: "Keyword and workspaceId are required." },
        { status: 400 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brandDNA: true },
    });

    if (!workspace || !workspace.brandDNA) {
      return NextResponse.json(
        { error: "Workspace or BrandDNA not found." },
        { status: 404 }
      );
    }

    // Use existing SERP data if passed, otherwise fetch fresh
    let serpData = existingSerpData;
    if (!serpData && enableSerp) {
      const serpRes = await fetchSerpAnalysis(keyword);
      if (serpRes.success && serpRes.data) {
        serpData = serpRes.data;
      }
    }

    const article = await generateSeoArticle({
      keyword,
      title,
      serpData,
      brandName: workspace.name,
      industry: workspace.industry || undefined,
      brandTone: toneOfVoice || workspace.brandDNA.tone || undefined,
      pointOfView: pointOfView || "first",
      targetAudience: workspace.brandDNA.targetAudience || undefined,
      articleSize: articleSize || "medium",
      targetWebsite: targetWebsite || undefined,
      targetCountry: targetCountry || "WW",
      enableYoutube: enableYoutube !== false,
    });

    return NextResponse.json({
      success: true,
      article,
      serpData,
    });
  } catch (error: any) {
    console.error("Article Writer Error:", error);
    return NextResponse.json(
      {
        error:
          error.message || "An error occurred while generating the article.",
      },
      { status: 500 }
    );
  }
}
