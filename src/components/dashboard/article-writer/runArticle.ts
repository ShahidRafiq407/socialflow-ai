/**
 * A RUN'S ARTIFACTS, AS THE EDITOR READS THEM
 *
 * The editor, the preview, the SEO sidebar and the publish panel all read one
 * shape: `GeneratedArticle`. A staged run does not produce that shape — it
 * produces twelve separate artifacts, each written by the stage that could prove
 * its contents. This file is the join, and it is the only place the two vocabularies
 * meet.
 *
 * The rule it exists to keep: a field is filled from the stage that established it
 * or it is left empty. Nothing here infers, averages or borrows. Quick mode has no
 * media stage, so `images` is empty and stays empty — an image list assembled from
 * a brief that only *asked* for images would put pictures in the editor that no
 * stage ever chose.
 *
 * Client-safe. `artifacts.ts` has no imports and `articleAssembly.ts` is pure
 * functions, so the same guards and the same measurement that ran on the server
 * run again here on the HTML that actually shipped.
 */

import {
  finalHtml,
  readArticleDraft,
  readArticleOutline,
  readFactCheckReport,
  readInternalLinkReport,
  readPublishGateReport,
  readQualityScore,
  readSchemaArtifact,
  readSearchIntent,
  readSeoReport,
  readSerpResearch,
  type FactCheckReport,
  type PublishGateReport,
  type QualityScoreArtifact,
  type SeoReport,
} from "@/lib/article/artifacts";
import { briefWordTarget, type ArticleBrief } from "@/lib/article/brief";
import {
  injectHeadingIds,
  measureArticle,
  parseFaqSection,
  stripHtml,
} from "@/lib/agents/workers/articleAssembly";
import type { GeneratedArticle, SerpAnalysis } from "./types";

/** Everything a finished run hands the screen, each piece from its own stage. */
export interface RunArticle {
  article: GeneratedArticle;
  /** Our score, ours alone. Absent until the score stage has run. */
  score?: QualityScoreArtifact;
  /** The publish checks, with the failures named. Absent until the gate has run. */
  gate?: PublishGateReport;
  /** What was checked and what did not hold up. Absent until fact check has run. */
  factcheck?: FactCheckReport;
  /** Measured fundamentals from the SEO stage, kept apart from the quality score. */
  seo?: SeoReport;
  /** The live results, in the shape the research panel already reads. */
  serp?: SerpAnalysis;
}
function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The SERP artifact in the research panel's own vocabulary.
 *
 * `position` is the index in the list the API returned, which is the only ranking
 * anything here has seen. The two averages are computed from the competitors that
 * actually reported a figure — a page whose length was never measured is left out
 * of the mean rather than counted as zero.
 */
function serpAnalysis(raw: unknown): SerpAnalysis | undefined {
  const research = readSerpResearch(raw);
  if (!research) return undefined;

  const measured = research.competitors.filter((c) => typeof c.wordCount === "number");
  const avgWords = measured.length
    ? Math.round(measured.reduce((sum, c) => sum + (c.wordCount || 0), 0) / measured.length)
    : 0;
  const withHeadings = research.competitors.filter((c) => c.headings.length > 0);
  const avgHeadings = withHeadings.length
    ? Math.round(
        withHeadings.reduce((sum, c) => sum + c.headings.length, 0) / withHeadings.length
      )
    : 0;

  return {
    keyword: research.keyword,
    topResults: research.competitors.map((competitor, index) => ({
      position: index + 1,
      title: competitor.title,
      link: competitor.url,
      // The stage stores headings, not snippets. The first heading is a real quote
      // from the page; an invented summary of it would not be.
      snippet: competitor.headings[0] || "",
      wordCount: competitor.wordCount,
      headingCount: competitor.headings.length || undefined,
    })),
    peopleAlsoAsk: research.peopleAlsoAsk,
    relatedSearches: research.relatedSearches,
    estimatedAvgWordCount: avgWords,
    estimatedHeadingCount: avgHeadings,
  };
}
/**
 * What the run wants the user to know, each line traceable to the stage that
 * found it.
 *
 * This is the list the old build filled with generalities. Every entry here names
 * a specific thing: a section that ran out of time, a link that did not resolve, a
 * claim its source did not support, a check that failed.
 */
function warningsFrom(input: {
  unfinished: string[];
  seo?: SeoReport;
  removed: string[];
  factcheck?: FactCheckReport;
  schemaNotes: string[];
  serpNote?: string;
  blockers: string[];
  linkNote?: string;
}): string[] {
  const out: string[] = [];

  if (input.unfinished.length) {
    out.push(
      `${input.unfinished.length} section${input.unfinished.length === 1 ? "" : "s"} ran out of time and were not written: ${input.unfinished.join(", ")}.`
    );
  }
  if (input.factcheck?.unsupported) {
    out.push(
      `${input.factcheck.unsupported} claim${input.factcheck.unsupported === 1 ? "" : "s"} in the draft are not supported by the source behind them. The fact check panel lists each one.`
    );
  }
  if (input.factcheck?.uncertain) {
    out.push(
      `${input.factcheck.uncertain} claim${input.factcheck.uncertain === 1 ? "" : "s"} could not be verified either way.`
    );
  }
  for (const fact of input.factcheck?.unprovenBusinessFacts ?? []) {
    out.push(`The draft asserts something about the business that nothing on file proves: ${fact}`);
  }
  if (input.removed.length) {
    out.push(
      `${input.removed.length} link${input.removed.length === 1 ? "" : "s"} were removed because the destination did not resolve.`
    );
  }
  if (input.linkNote) out.push(input.linkNote);
  out.push(...(input.seo?.issues ?? []));
  out.push(...input.schemaNotes);
  if (input.serpNote) out.push(input.serpNote);
  out.push(...input.blockers);

  return out.filter(Boolean);
}
/**
 * The run, assembled — or null when no stage has produced a page yet.
 *
 * Null rather than an empty article: the editor opening on a blank document that
 * claims to be a draft is how a run that blocked at stage two came to look like a
 * finished one.
 */
export function articleFromRun(
  artifacts: Record<string, unknown>,
  brief: ArticleBrief
): RunArticle | null {
  const raw = finalHtml(artifacts);
  if (!raw.trim()) return null;

  // Ids first, and the contents list from the headings that are really in the
  // document. Idempotent: a heading the write stage already gave an id keeps it.
  const withIds = injectHeadingIds(raw);
  const html = withIds.html;

  const draft = readArticleDraft(artifacts.write);
  const outline = readArticleOutline(artifacts.outline);
  const seo = readSeoReport(artifacts.seo) ?? undefined;
  const links = readInternalLinkReport(artifacts.links);
  const schema = readSchemaArtifact(artifacts.schema);
  const score = readQualityScore(artifacts.score) ?? undefined;
  const gate = readPublishGateReport(artifacts.gate) ?? undefined;
  const factcheck = readFactCheckReport(artifacts.factcheck) ?? undefined;
  const intent = readSearchIntent(artifacts.intent);
  const serp = serpAnalysis(artifacts.serp);

  const title = draft?.title || outline?.title || brief.title || brief.keyword;
  const metaTitle = seo?.title.value || title;
  const metaDescription = seo?.metaDescription.value || "";
  const faqItems = parseFaqSection(html);
  const schemaMarkup = schema?.jsonLd || "";
  const targetWordCount = briefWordTarget(brief);

  // The same function the one-shot generator used, over the HTML that shipped.
  // Every number below was counted off this document — none was reported by a model.
  const measured = measureArticle({
    html,
    title,
    metaTitle,
    metaDescription,
    keyword: brief.keyword,
    schemaMarkup,
    faqCount: faqItems.length,
    targetWordCount,
    siteHost: hostOf(brief.targetWebsite || "") || undefined,
  });

  const wordCountAccuracy = Math.max(
    0,
    Math.round(
      (1 -
        Math.abs(targetWordCount - measured.metrics.wordCount) / Math.max(1, targetWordCount)) *
        100
    )
  );
  const article: GeneratedArticle = {
    title,
    metaTitle,
    metaDescription,
    content: html,
    excerpt: draft?.excerpt || stripHtml(html).slice(0, 320),
    slug: seo?.slug || outline?.slug || "",
    schemaMarkup,
    tableOfContents: withIds.toc,
    seoChecklist: measured.checklist,
    faqItems,
    // Both live in the page rather than in an artifact of their own: the write
    // stage puts the takeaways into the HTML, and reading them back out as data
    // would be a second, competing copy that could disagree with what is on screen.
    keyTakeaways: [],
    // No stage proposes tags. An empty list is the honest answer; the tag field in
    // the editor is where a person adds the ones they want.
    suggestedTags: [],
    internalLinks: (links?.internal ?? []).map((link) => ({
      anchorText: link.anchor,
      url: link.url,
      label: link.reason || undefined,
    })),
    externalLinks: (links?.external ?? []).map((link) => ({
      anchorText: link.anchor,
      url: link.url,
      label: link.publisher || undefined,
    })),
    // Quick mode has no media stage, so there is nothing to list. The Media Studio
    // is how an image gets into a quick draft, and what it inserts is in the HTML.
    images: [],
    youtube: null,
    // E-E-A-T pillar coverage is the trust stage's job, and that stage is deep-only.
    pillarCoverage: [],
    searchIntent: intent?.kind || "",
    warnings: warningsFrom({
      unfinished: draft?.unfinished ?? [],
      seo,
      removed: links?.removed ?? [],
      factcheck,
      schemaNotes: schema?.notes ?? [],
      serpNote: readSerpResearch(artifacts.serp)?.note,
      blockers: gate?.blockers ?? [],
      linkNote: links?.note,
    }),
    seoMetrics: { ...measured.metrics, targetWordCount, wordCountAccuracy },
  };

  return { article, score, gate, factcheck, seo, serp };
}
