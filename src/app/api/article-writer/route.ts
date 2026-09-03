/**
 * ARTICLE WRITER API
 *
 * One POST endpoint, switched on `step`. Everything the Article Writer page does
 * that needs the server — SERP, topic ideas, generation, publishing — comes
 * through here so credentials and model keys stay server-side.
 *
 * Three rules this file enforces:
 *   - every step resolves the workspace by id AND checks the signed-in user owns
 *     it, so a workspace id in a request body is never taken on trust,
 *   - publishing goes through the CMS layer, so WordPress, Shopify and a
 *     hand-coded site are the same code path here,
 *   - a step that cannot do its job returns the reason. Nothing returns invented
 *     keywords, categories or scores as a "fallback".
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import {
  createWPCategory,
  fetchWPAuthors,
  fetchWPCategories,
  fetchWPPostTypes,
  testWPConnection,
  type WPConfig,
} from "@/actions/wordpress";
import { fetchSerpAnalysis } from "@/actions/serp";
import { llm } from "@/lib/agents/llm";
import { generateSeoArticle } from "@/lib/agents/workers/article-generator";
import {
  listCmsTargetSummaries,
  loadCmsTarget,
  publishToCmsTarget,
  resolveDefaultCmsTarget,
} from "@/lib/cms";
import { describeCmsProviders } from "@/lib/cms/registry";
import { isEncryptionConfigured } from "@/lib/crypto";
import prisma from "@/lib/db";
import { discoverInternalLinkCandidates } from "@/lib/seo/internalLinks";
import { suggestTopicIdeas } from "@/lib/seo/topicIdeas";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** The generator budgets 235s of work; the platform kills the function at 300s. */
export const maxDuration = 300;

/** Steps that spend paid model calls and therefore need the AI entitlement. */
const AI_STEPS = new Set([
  "generate",
  "serp-only",
  "topic-ideas",
  "suggest-title",
  "suggest-categories",
  "enhance-seo",
]);

// ---------------------------------------------------------------------------
// WORKSPACE + TARGET RESOLUTION
// ---------------------------------------------------------------------------

type OwnedWorkspace = NonNullable<Awaited<ReturnType<typeof loadOwnedWorkspace>>>;

/**
 * The workspace this request is for, only if the caller owns it.
 *
 * A workspace id arriving in a request body is attacker-controlled, so it is
 * checked against the signed-in user every time. With no id we fall back to the
 * caller's own first workspace, which is safe by construction.
 */
async function loadOwnedWorkspace(userId: string, workspaceId?: unknown) {
  const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
  if (id) {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: { brandDNA: true },
    });
    if (!workspace || workspace.userId !== userId) return null;
    return workspace;
  }
  return prisma.workspace.findFirst({
    where: { userId },
    include: { brandDNA: true },
    orderBy: { createdAt: "asc" },
  });
}

function denied() {
  return NextResponse.json(
    { error: "You do not have access to that workspace." },
    { status: 403 }
  );
}

/** Every Brand DNA field the generator accepts, from the one place it is stored. */
function brandParams(workspace: OwnedWorkspace) {
  const dna = workspace.brandDNA;
  return {
    brandName: workspace.name,
    industry: workspace.industry || undefined,
    brandTone: dna?.tone || undefined,
    targetAudience: dna?.targetAudience || undefined,
    missionVision: dna?.missionVision || undefined,
    writingStyle: dna?.writingStyle || undefined,
    forbiddenWords: dna?.forbiddenWords?.length ? dna.forbiddenWords : undefined,
  };
}

/**
 * The WordPress credentials behind a target, for the taxonomy calls that only
 * WordPress has. Other platforms answer honestly that they have no categories.
 */
async function wordPressConfigFor(
  workspaceId: string,
  targetId?: unknown
): Promise<{ config: WPConfig | null; siteUrl?: string; reason?: string }> {
  const id = typeof targetId === "string" && targetId.trim() ? targetId.trim() : "";
  const target = id
    ? await loadCmsTarget(workspaceId, id)
    : await resolveDefaultCmsTarget(workspaceId);

  if (!target) {
    return {
      config: null,
      reason:
        "No publishing site is connected yet. Add one from the Publish panel to load its categories and authors.",
    };
  }
  if (target.providerKey !== "wordpress") {
    return {
      config: null,
      reason: `${target.label} is not a WordPress site, so it has no categories or authors to load.`,
    };
  }
  const siteUrl = target.meta.siteUrl || "";
  const username = target.credentials.username || "";
  const appPassword = target.credentials.appPassword || "";
  if (!siteUrl || !username || !appPassword) {
    return {
      config: null,
      reason: `${target.label} is missing its credentials. Reconnect it from the Publish panel.`,
    };
  }
  return { config: { siteUrl, username, appPassword }, siteUrl };
}

/** Strips the model's markdown fence without swallowing the payload. */
function unfence(raw: unknown): string {
  return String(raw ?? "")
    .replace(/```(?:json|html)?/gi, "")
    .replace(/```/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// ROUTE
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}) as any);
    const step = typeof body?.step === "string" && body.step ? body.step : "generate";

    const workspace = await loadOwnedWorkspace(userId, body?.workspaceId);
    if (!workspace) {
      return body?.workspaceId
        ? denied()
        : NextResponse.json({ error: "No workspace found for your account." }, { status: 404 });
    }
    const workspaceId = workspace.id;

    // ── AI entitlement ────────────────────────────────────────────────────
    // Generation is in this set: it is the most expensive step of all, and the
    // old build let it through because it was the untagged default.
    if (AI_STEPS.has(step)) {
      const { checkAIAccess } = await import("@/lib/billing/gate");
      const gate = await checkAIAccess(workspaceId);
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

    // =====================================================================
    // STEP: publish targets (WordPress / Shopify / coded site)
    // =====================================================================
    if (step === "targets") {
      return NextResponse.json({
        success: true,
        targets: await listCmsTargetSummaries(workspaceId),
        providers: describeCmsProviders(),
        encryptionReady: isEncryptionConfigured(),
      });
    }

    // =====================================================================
    // STEP: taxonomy for a connected WordPress target
    // =====================================================================
    if (step === "target-meta" || step === "wp-connect") {
      const { config, siteUrl, reason } = await wordPressConfigFor(workspaceId, body?.targetId);
      if (!config) {
        return NextResponse.json({
          success: true,
          supported: false,
          categories: [],
          authors: [],
          postTypes: [],
          note: reason,
        });
      }

      const connected = await testWPConnection(config);
      if (!connected) {
        return NextResponse.json({
          success: false,
          supported: true,
          wpConnected: false,
          error:
            "WordPress refused the stored credentials. Re-verify the site in the Publish panel.",
        });
      }

      const [categories, authors, postTypes] = await Promise.all([
        fetchWPCategories(config),
        fetchWPAuthors(config),
        fetchWPPostTypes(config),
      ]);

      return NextResponse.json({
        success: true,
        supported: true,
        wpConnected: true,
        categories,
        authors,
        postTypes,
        siteUrl,
      });
    }

    // =====================================================================
    // STEP: create a WordPress category
    // =====================================================================
    if (step === "create-category") {
      const name = String(body?.name || "").trim();
      if (!name) {
        return NextResponse.json({ error: "A category name is required." }, { status: 400 });
      }

      const { config, reason } = await wordPressConfigFor(workspaceId, body?.targetId);
      if (!config) return NextResponse.json({ error: reason }, { status: 400 });

      const category = await createWPCategory(config, name);
      if (!category) {
        return NextResponse.json(
          { error: `WordPress would not create the category "${name}".` },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, category });
    }

    // =====================================================================
    // STEP: publish the finished article to a connected target
    // =====================================================================
    if (step === "publish" || step === "wp-publish") {
      const payload = body?.publishPayload;
      if (!payload?.title || !payload?.html) {
        return NextResponse.json(
          { error: "The article title and HTML are required to publish." },
          { status: 400 }
        );
      }

      const targetId =
        typeof body?.targetId === "string" && body.targetId.trim()
          ? body.targetId.trim()
          : (await resolveDefaultCmsTarget(workspaceId))?.id;

      if (!targetId) {
        return NextResponse.json(
          {
            error:
              "No publishing target is connected. Add your WordPress, Shopify or coded site in the Publish panel first.",
          },
          { status: 400 }
        );
      }

      const result = await publishToCmsTarget(workspaceId, targetId, {
        title: String(payload.title),
        html: String(payload.html),
        contentType: payload.contentType === "page" ? "page" : "post",
        status:
          payload.status === "draft" || payload.status === "pending" ? payload.status : "publish",
        excerpt: payload.excerpt ? String(payload.excerpt) : undefined,
        slug: payload.slug ? String(payload.slug) : undefined,
        metaTitle: payload.metaTitle ? String(payload.metaTitle) : undefined,
        metaDescription: payload.metaDescription ? String(payload.metaDescription) : undefined,
        focusKeyword: payload.focusKeyword ? String(payload.focusKeyword) : undefined,
        schemaMarkup: payload.schemaMarkup ? String(payload.schemaMarkup) : undefined,
        tags: Array.isArray(payload.tags)
          ? payload.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15)
          : undefined,
        categoryIds: Array.isArray(payload.categoryIds)
          ? payload.categoryIds.map((id: any) => Number(id)).filter((n: number) => n > 0)
          : undefined,
        authorId: Number(payload.authorId) > 0 ? Number(payload.authorId) : undefined,
        featuredImageUrl: payload.featuredImageUrl ? String(payload.featuredImageUrl) : undefined,
        featuredImageAlt: payload.featuredImageAlt ? String(payload.featuredImageAlt) : undefined,
      });

      return NextResponse.json(result, { status: result.success ? 200 : 502 });
    }

    // =====================================================================
    // STEP: SERP analysis only
    // =====================================================================
    if (step === "serp-only") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) return NextResponse.json({ error: "A keyword is required." }, { status: 400 });

      const res = await fetchSerpAnalysis(keyword, {
        targetCountry: body?.targetCountry,
        measureCompetitors: body?.measureCompetitors !== false,
      });
      return NextResponse.json({
        success: res.success,
        serpData: res.success ? res.data : null,
        serpError: res.error,
      });
    }

    // =====================================================================
    // STEP: internal link candidates from the user's own site
    // =====================================================================
    if (step === "internal-links") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) return NextResponse.json({ error: "A keyword is required." }, { status: 400 });

      const target =
        typeof body?.targetId === "string" && body.targetId.trim()
          ? await loadCmsTarget(workspaceId, body.targetId.trim())
          : await resolveDefaultCmsTarget(workspaceId);

      const siteUrl =
        String(body?.targetWebsite || "").trim() ||
        target?.meta.siteUrl ||
        (target?.meta.shopDomain ? `https://${target.meta.shopDomain}` : "") ||
        workspace.website ||
        "";

      const found = await discoverInternalLinkCandidates({
        siteUrl,
        keyword,
        context: String(body?.title || ""),
        limit: Number(body?.limit) > 0 ? Number(body.limit) : 8,
      });
      return NextResponse.json({ success: true, siteUrl, ...found });
    }

    // =====================================================================
    // STEP: trending topics from this workspace's Brand DNA
    // =====================================================================
    if (step === "topic-ideas" || step === "suggest-keyword") {
      const recent = await prisma.contentPost
        .findMany({
          where: { workspaceId },
          select: { title: true },
          orderBy: { createdAt: "desc" },
          take: 25,
        })
        .catch(() => [] as { title: string }[]);

      const result = await suggestTopicIdeas({
        brandName: workspace.name,
        industry: workspace.industry || undefined,
        targetAudience: workspace.brandDNA?.targetAudience || undefined,
        tone: workspace.brandDNA?.tone || undefined,
        missionVision: workspace.brandDNA?.missionVision || undefined,
        writingStyle: workspace.brandDNA?.writingStyle || undefined,
        forbiddenWords: workspace.brandDNA?.forbiddenWords || undefined,
        existingTitles: recent.map((r) => r.title || "").filter(Boolean),
        targetCountry: body?.targetCountry,
        seedHint: body?.seedHint || body?.keyword,
      });

      return NextResponse.json({
        success: result.ideas.length > 0,
        ...result,
        // The old shape, so a keyword list still works where only that is needed.
        keywords: result.ideas.map((i) => i.keyword),
      });
    }

    // =====================================================================
    // STEP: title options, grounded in the live SERP
    // =====================================================================
    if (step === "suggest-title") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) {
        return NextResponse.json(
          { error: "A keyword is required before titles can be written." },
          { status: 400 }
        );
      }

      let competitorTitles = "";
      let serpNote: string | undefined;
      const serp = await fetchSerpAnalysis(keyword, {
        targetCountry: body?.targetCountry,
        measureCompetitors: false,
      });
      if (serp.success && serp.data?.topResults?.length) {
        competitorTitles = serp.data.topResults
          .slice(0, 7)
          .map((r, i) => `${i + 1}. "${r.title}"`)
          .join("\n");
      } else {
        serpNote = serp.error || "The live results could not be read, so these are unbenchmarked.";
      }

      const brand = brandParams(workspace);
      const prompt = `You write article titles that win the click against the pages currently ranking.

BRAND
- Brand: ${brand.brandName}
${brand.industry ? `- Industry: ${brand.industry}\n` : ""}${brand.targetAudience ? `- Audience: ${brand.targetAudience}\n` : ""}${brand.brandTone ? `- Tone: ${brand.brandTone}\n` : ""}${brand.forbiddenWords?.length ? `- Never use these words: ${brand.forbiddenWords.join(", ")}\n` : ""}
KEYWORD: "${keyword}"
${competitorTitles ? `\nRANKING NOW — beat these on click-through:\n${competitorTitles}\n` : ""}
RULES
1. "${keyword}" appears in the first half of every title.
2. 50-65 characters each. Count them.
3. Four different angles: how-to, numbered list, comparison, and a specific-result deep dive.
4. Any number or year must be one a reader could verify from the article, not decoration.
5. Sound like a person who has done the thing. No "unlock", "unleash", "game-changer", "dive into".

Return ONLY a JSON array of 4 strings.`;

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const titles = JSON.parse(unfence(response.content));
        const clean = Array.isArray(titles)
          ? titles.map((t: any) => String(t || "").trim()).filter(Boolean).slice(0, 4)
          : [];
        if (clean.length === 0) throw new Error("The model returned no usable titles.");
        return NextResponse.json({ success: true, titles: clean, note: serpNote });
      } catch (error: any) {
        // No template fallback: an invented title is worse than none.
        return NextResponse.json(
          {
            success: false,
            error: `Titles could not be generated (${error?.message || "unknown error"}). Try again.`,
          },
          { status: 502 }
        );
      }
    }

    // =====================================================================
    // STEP: category suggestions from the site's real taxonomy
    // =====================================================================
    if (step === "suggest-categories") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) return NextResponse.json({ error: "A keyword is required." }, { status: 400 });

      const existing = Array.isArray(body?.existingCategories)
        ? body.existingCategories
            .map((c: any) => (typeof c === "string" ? c : c?.name))
            .map((c: any) => String(c || "").trim())
            .filter(Boolean)
            .slice(0, 80)
        : [];

      const prompt = `Article keyword: "${keyword}"
Article title: "${String(body?.title || keyword)}"

The site's existing categories: ${existing.length ? existing.join(", ") : "(none yet)"}

Pick up to 3 of the existing categories this article belongs in. Only propose a NEW category name when none of the existing ones fit, and never propose more than 2 new ones.

Return ONLY a JSON object: {"existing":["..."],"new":["..."]}`;

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const parsed = JSON.parse(unfence(response.content));
        const pick = (value: any) =>
          Array.isArray(value)
            ? value.map((v: any) => String(v || "").trim()).filter(Boolean).slice(0, 3)
            : [];
        const existingPicks = pick(parsed?.existing).filter((name: string) =>
          existing.some((e: string) => e.toLowerCase() === name.toLowerCase())
        );
        const newPicks = pick(parsed?.new).slice(0, 2);
        return NextResponse.json({
          success: true,
          existing: existingPicks,
          new: newPicks,
          // Flat list for callers that just want names.
          suggested: [...existingPicks, ...newPicks],
        });
      } catch (error: any) {
        return NextResponse.json(
          {
            success: false,
            error: `Categories could not be suggested (${error?.message || "unknown error"}).`,
          },
          { status: 502 }
        );
      }
    }

    // =====================================================================
    // STEP: rewrite the meta of an article that already exists
    // =====================================================================
    if (step === "enhance-seo") {
      const keyword = String(body?.keyword || "").trim();
      const title = String(body?.title || "").trim();
      if (!keyword || !title) {
        return NextResponse.json(
          { error: "A keyword and a title are required to rewrite the meta." },
          { status: 400 }
        );
      }

      const brand = brandParams(workspace);
      const prompt = `Rewrite the search metadata for this article.

Title: "${title}"
Focus keyword: "${keyword}"
${brand.brandName ? `Brand: ${brand.brandName}\n` : ""}${brand.targetAudience ? `Audience: ${brand.targetAudience}\n` : ""}${brand.brandTone ? `Tone: ${brand.brandTone}\n` : ""}${brand.forbiddenWords?.length ? `Never use: ${brand.forbiddenWords.join(", ")}\n` : ""}${body?.excerpt ? `\nCurrent excerpt: ${String(body.excerpt).slice(0, 500)}\n` : ""}
RULES
- metaTitle: 50-60 characters, keyword in the first 30.
- metaDescription: 140-158 characters, keyword once, ends with a reason to click. No ellipsis.
- slug: lowercase, hyphens, 3-6 words, keyword included, no stop words, no year.
- tags: 5-8 lowercase topical tags a reader would browse by. No brand name, no single letters.
- Describe what the article actually delivers. Do not promise anything the title does not.

Return ONLY JSON: {"metaTitle":"...","metaDescription":"...","slug":"...","tags":["..."]}`;

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const parsed = JSON.parse(unfence(response.content));
        const slug = String(parsed?.slug || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 80);

        return NextResponse.json({
          success: true,
          // No score is reported here: this step rewrites meta, it does not audit
          // the article. The generator's own checklist is the only real score.
          metaTitle: String(parsed?.metaTitle || "").trim().slice(0, 70),
          metaDescription: String(parsed?.metaDescription || "").trim().slice(0, 175),
          slug,
          tags: Array.isArray(parsed?.tags)
            ? parsed.tags
                .map((t: any) => String(t || "").trim().toLowerCase())
                .filter((t: string) => t.length > 1)
                .slice(0, 8)
            : [],
        });
      } catch (error: any) {
        return NextResponse.json(
          {
            success: false,
            error: `The metadata could not be rewritten (${error?.message || "unknown error"}).`,
          },
          { status: 502 }
        );
      }
    }

    // =====================================================================
    // STEP (default): write the article
    //
    // Order matters. The SERP read and the internal-link crawl both feed the
    // blueprint, so they happen first and in parallel; the generator then gets
    // the whole Brand DNA, the exact word target and every toggle the UI shows.
    // =====================================================================
    const keyword = String(body?.keyword || "").trim();
    if (!keyword) {
      return NextResponse.json(
        { error: "A focus keyword is required to write an article." },
        { status: 400 }
      );
    }

    const target =
      typeof body?.targetId === "string" && body.targetId.trim()
        ? await loadCmsTarget(workspaceId, body.targetId.trim())
        : await resolveDefaultCmsTarget(workspaceId);

    const targetWebsite =
      String(body?.targetWebsite || "").trim() ||
      target?.meta.siteUrl ||
      (target?.meta.shopDomain ? `https://${target.meta.shopDomain}` : "") ||
      workspace.website ||
      "";

    const wantsInternal = body?.enableInternalLinks !== false;
    const wantsExternal = body?.enableExternalLinks !== false;
    const title = String(body?.title || "").trim();

    const [serpResult, internal] = await Promise.all([
      // External citations and the competitive benchmark both come from here, so
      // it still runs when only internal linking is off.
      fetchSerpAnalysis(keyword, {
        targetCountry: body?.targetCountry,
        measureCompetitors: true,
      }),
      wantsInternal && targetWebsite
        ? discoverInternalLinkCandidates({
            siteUrl: targetWebsite,
            keyword,
            context: title,
            limit: 10,
          })
        : Promise.resolve({ candidates: [], note: undefined as string | undefined }),
    ]);

    const preWarnings: string[] = [];
    if (!serpResult.success && wantsExternal) {
      preWarnings.push(
        `Live search results were unavailable (${serpResult.error || "unknown reason"}), so external citations were limited to what could be verified.`
      );
    }
    if (wantsInternal && !targetWebsite) {
      preWarnings.push(
        "No website is connected, so no internal links were added. Connect a publishing target or set the workspace website."
      );
    } else if (wantsInternal && internal.note) {
      preWarnings.push(internal.note);
    }

    const article = await generateSeoArticle({
      keyword,
      title: title || undefined,
      serpData: serpResult.success ? serpResult.data : undefined,

      ...brandParams(workspace),
      // A tone picked in the form overrides the Brand DNA default for this one
      // run. Left empty, the brand's own tone is what the generator gets.
      brandTone: String(body?.tone || "").trim() || workspace.brandDNA?.tone || undefined,
      authorName: String(body?.authorName || "").trim() || undefined,

      // The exact count wins over the preset; the generator measures and closes
      // the gap rather than hoping the model counted.
      articleSize: typeof body?.articleSize === "string" ? body.articleSize : undefined,
      targetWordCount: Number(body?.targetWordCount) > 0 ? Number(body.targetWordCount) : undefined,
      pointOfView: typeof body?.pointOfView === "string" ? body.pointOfView : undefined,
      language: typeof body?.language === "string" ? body.language : undefined,
      targetCountry: typeof body?.targetCountry === "string" ? body.targetCountry : undefined,

      targetWebsite: targetWebsite || undefined,
      internalLinkCandidates: internal.candidates,

      enableYoutube: body?.enableYoutube !== false,
      enableFaq: body?.enableFaq !== false,
      enableToc: body?.enableToc !== false,
      enableTakeaways: body?.enableTakeaways !== false,
      enableSources: body?.enableSources !== false,
      enableInternalLinks: wantsInternal,
      enableExternalLinks: wantsExternal,
      enableImages: body?.enableImages !== false,
      imageCount: Number.isFinite(Number(body?.imageCount)) ? Number(body.imageCount) : undefined,
      imageStyle: typeof body?.imageStyle === "string" ? body.imageStyle : undefined,
      humanize: body?.humanize !== false,
    });

    return NextResponse.json({
      success: true,
      article: {
        ...article,
        warnings: [...preWarnings, ...article.warnings],
      },
      serpData: serpResult.success ? serpResult.data : null,
      serpError: serpResult.success ? undefined : serpResult.error,
      internalLinkCandidates: internal.candidates,
      // The target the article was written for, so the editor can publish without
      // re-resolving it and cannot silently publish somewhere else.
      target: target ? { id: target.id, providerKey: target.providerKey, label: target.label } : null,
    });
  } catch (error: any) {
    console.error("[article-writer] error:", error);
    return NextResponse.json(
      { error: error?.message || "The request could not be completed." },
      { status: 500 }
    );
  }
}
