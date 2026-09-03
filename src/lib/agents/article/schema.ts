/**
 * STAGE 20 — STRUCTURED DATA
 *
 * No model call. Every field in a JSON-LD block is a fact that is either already
 * established on this run or is not established at all, so asking a model to
 * produce one only creates a way for an author, a publisher or a date to be
 * invented. The block is assembled from artifacts and the brief, and anything
 * missing is left out and named in `notes`.
 *
 * The FAQ is the part with a history. `FAQPage` stopped producing a rich result
 * on 7 May 2026. It is still valid structured data and still worth emitting —
 * machines read it, including the ones that answer questions without sending a
 * click — and this stage says so plainly rather than selling it as a win.
 *
 * Nothing here is worth quality points. Structured data is a statement about the
 * page, not a property of it: a bad page with perfect schema is still a bad page.
 */

import {
  finalHtml,
  readArticleDraft,
  readArticleOutline,
  readSchemaArtifact,
  type SchemaArtifact,
} from "@/lib/article/artifacts";
import { resolveLanguage } from "@/lib/article/languages";
import {
  buildSchemaMarkup,
  countHtmlWords,
  slugify,
  stripHtml,
} from "@/lib/agents/workers/articleAssembly";
import {
  blocked,
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";

/**
 * The question and answer pairs, read back out of the page itself.
 *
 * Not from the outline's question list: the outline plans questions and the write
 * stage answers the ones it had time for, so the outline is what was intended and
 * the HTML is what exists. A `Question` in the schema whose answer is not on the
 * page is a statement about a page that was never published.
 *
 * The shape matched here is the one `buildFaqSection` emits. `injectHeadingIds`
 * adds an id to the h3 afterwards, so the attributes are matched loosely.
 */
function faqFromHtml(html: string): { question: string; answer: string }[] {
  const items = html.matchAll(
    /<div class="faq-item">\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/div>/gi
  );
  const out: { question: string; answer: string }[] = [];
  for (const match of items) {
    const question = stripHtml(match[1]).replace(/\s+/g, " ").trim();
    const answer = stripHtml(match[2]).replace(/\s+/g, " ").trim();
    if (question && answer) out.push({ question, answer });
  }
  return out;
}

/** The hero image, if the media stage placed one. The first `<img>` in the page. */
function heroFrom(html: string): string {
  const match = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
  const src = (match?.[1] || "").trim();
  return /^https?:\/\//i.test(src) ? src : "";
}

/** The site the page will live on, if one is known. Trailing slash removed later. */
function siteFor(ctx: StageContext): string {
  return (
    ctx.brief.targetWebsite ||
    ctx.workspace.brand.website ||
    ctx.workspace.website ||
    ""
  ).trim();
}

/** The @type values in the graph, read back from what was actually serialised. */
function typesIn(jsonLd: string): string[] {
  try {
    const parsed = JSON.parse(jsonLd) as { "@graph"?: unknown };
    const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [];
    return graph
      .map((node) => String((node as Record<string, unknown>)?.["@type"] ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
export const runSchemaStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const html = finalHtml(ctx.artifacts as Record<string, unknown>);
  if (!html.trim()) {
    return blocked(
      "There is no page to describe — no stage has produced a draft yet. Run this article again from the writing step."
    );
  }
  const draft = readArtifact(ctx, "write", readArticleDraft);
  const outline = readArtifact(ctx, "outline", readArticleOutline);

  const title = draft?.title || outline?.title || ctx.brief.title || ctx.brief.keyword;
  const site = siteFor(ctx);
  const slug = outline?.slug || slugify(title);
  const metaDescription = String(ctx.state.metaDescription ?? "").trim();
  const brandName = (ctx.workspace.brand.brandName || ctx.workspace.name || "").trim();
  const authorName = (ctx.brief.authorName || "").trim();
  const language = resolveLanguage(ctx.brief.language || "");
  const faqItems = ctx.brief.enableFaq ? faqFromHtml(html) : [];
  const heroImageUrl = heroFrom(html);

  const jsonLd = buildSchemaMarkup({
    title,
    metaDescription,
    slug,
    keyword: ctx.brief.keyword,
    brandName: brandName || undefined,
    siteUrl: site || undefined,
    authorName: authorName || undefined,
    heroImageUrl: heroImageUrl || undefined,
    faqItems,
    // Measured from the page being described, not carried from the draft artifact:
    // the links stage may have added a sources section since it was written.
    wordCount: countHtmlWords(html),
    language: language.code,
  });
  // The caveats, each one a thing the block does not say and why. A note here is
  // not a failure — most are the honest consequence of a fact nobody has supplied.
  const notes: string[] = [];

  if (faqItems.length > 0) {
    notes.push(
      `FAQPage is emitted for ${faqItems.length} question${faqItems.length === 1 ? "" : "s"} taken from the finished page. Google retired the FAQ rich result on 7 May 2026, so this will not show as expandable questions in search results — it is machine-readable structure, not a rich-result win.`
    );
  } else if (ctx.brief.enableFaq) {
    notes.push(
      "This article was set to include an FAQ and the finished page contains none, so no FAQPage was emitted. Structured data is only ever written from what is on the page."
    );
  }

  if (!metaDescription) {
    notes.push(
      "No meta description was available, so `description` is empty in the block. The SEO fundamentals stage is what writes one."
    );
  }
  if (!site) {
    notes.push(
      "No website is connected, so the block has no page URL, no publisher URL and no breadcrumb trail. Connect the site in the Plugins tab and the next article carries all three."
    );
  }
  if (!brandName) {
    notes.push(
      "No business name is on file, so `publisher` is omitted. A publisher that does not exist is worse than none — it is a claim about who stands behind the page."
    );
  }
  if (!authorName) {
    notes.push(
      "No author was named for this article, so `author` is omitted rather than filled with the business name. An organisation is not a person, and claiming otherwise is the kind of detail that undermines the whole block."
    );
  }
  if (!heroImageUrl) {
    notes.push(
      "The page has no image with an absolute URL, so `image` is omitted. Relative paths are not resolvable by anything reading the block off-site."
    );
  }
  if (ctx.brief.language && !language.known) {
    notes.push(
      `"${ctx.brief.language}" is not in the locale table, so \`inLanguage\` is declared as "en". The article itself was written in the language asked for; only this one field falls back.`
    );
  }
  // `datePublished` is set to now by the builder because that is when the block is
  // made. The CMS sets the real date on publish, and a draft that sits for a week
  // would otherwise carry a date a search engine could read as stale.
  notes.push(
    "`datePublished` and `dateModified` are set to the moment this block was built. The CMS overwrites both when the page actually goes live."
  );

  const artifact: SchemaArtifact = { types: typesIn(jsonLd), jsonLd, notes };
  const checked = readSchemaArtifact(artifact) || artifact;

  return done(checked, {
    schemaTypes: checked.types,
    schemaFaqCount: faqItems.length,
    schemaHasPublisher: Boolean(brandName),
    schemaHasAuthor: Boolean(authorName),
    schemaLanguage: language.code,
    // Read by the publish gate, which refuses a page whose structured data does
    // not parse — the one thing about a JSON-LD block that is pass or fail.
    schemaValid: checked.jsonLd.trim().length > 0 && checked.types.length > 0,
    schemaNotes: checked.notes,
  });
};
