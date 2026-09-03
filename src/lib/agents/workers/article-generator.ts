// ============================================================================
// SEO ARTICLE GENERATOR — E-E-A-T pipeline
//
// The model writes prose. This file decides structure, supplies the *real* URLs
// that may be cited, hits the requested word count by measuring and correcting,
// and hands the result to articleAssembly.ts which measures the shipped HTML.
//
// What changed from the previous build, and why:
//   - The old pipeline asked the model for `seoMetrics` and `seoChecklist`, then
//     overwrote the score with `wordCount >= min ? 94 : 85`. Nothing was
//     measured. Every number now comes from measureArticle().
//   - The old pipeline let the model invent internal and external URLs. Invented
//     URLs 404, which is a Trust failure. Citations may only come from the SERP
//     results Serper actually returned; internal links only from URLs discovered
//     on the user's own site.
//   - "articleSize" mapped to a range and the range was never enforced. The
//     caller's exact word count is now a target the pipeline expands or tightens
//     toward, and the miss is reported when it cannot be closed.
//   - Sections are written in parallel under a wall-clock budget, because the
//     platform kills the function at 300s.
// ============================================================================

import { MODELS, vertexProvider } from "../llm";
import type { SerpAnalysis } from "@/actions/serp";
import { hasPixabayKey, hasSerperKey } from "@/lib/apiKeys";
import { getSmartImages } from "@/lib/images";
import { getSmartYouTubeEmbed } from "@/lib/youtube";
import {
  assembleArticle,
  buildSchemaMarkup,
  countHtmlWords,
  measureArticle,
  sanitizeModelHtml,
  slugify,
  stripHtml,
  type ArticleImage,
  type ArticleMeasurement,
  type ArticleSectionPart,
  type SEOCheckItem,
  type TOCItem,
} from "./articleAssembly";

export type { SEOCheckItem, TOCItem };

// ---------------------------------------------------------------------------
// THE FOUR PILLARS
// ---------------------------------------------------------------------------

/**
 * Google's quality rater guidelines describe E-E-A-T as four separate signals.
 * Each is written differently, so each pillar carries its own drafting brief and
 * the blueprint has to spread them across the article — an "authoritative" tone
 * applied evenly to everything demonstrates none of them.
 */
export const EEAT_PILLARS = [
  {
    key: "Experience",
    brief:
      "First-hand doing. Concrete walkthroughs, the exact numbers you saw, what broke, how long it took, what you would do differently. Name tools, settings and screens. No hypotheticals.",
  },
  {
    key: "Expertise",
    brief:
      "Mechanism and judgement. Explain WHY it works, define the terms, cover the edge cases and the decision criteria for choosing between options. Comparison tables belong here.",
  },
  {
    key: "Authoritativeness",
    brief:
      "Evidence outside yourself. Attribute every statistic, standard or benchmark to the source page provided to you, and name the organisation in the sentence.",
  },
  {
    key: "Trustworthiness",
    brief:
      "Limits and honesty. Costs, risks, when NOT to do this, who it is wrong for, what the data does not prove, and how a reader can verify the claims themselves.",
  },
] as const;

export type PillarKey = (typeof EEAT_PILLARS)[number]["key"];

const PILLAR_KEYS: PillarKey[] = EEAT_PILLARS.map((p) => p.key);

function pillarBrief(key: string): string {
  return EEAT_PILLARS.find((p) => p.key.toLowerCase() === key.toLowerCase())?.brief || "";
}

// ---------------------------------------------------------------------------
// LENGTH
//
// Defined in `@/lib/seo/articleLength` and re-exported here: the Article Writer
// form needs the same presets, and it cannot import this module (it would pull
// the whole model stack into the browser bundle).
// ---------------------------------------------------------------------------

export {
  ARTICLE_SIZE_PRESETS,
  ARTICLE_SIZE_WORDS,
  MAX_TARGET_WORDS,
  MIN_TARGET_WORDS,
  WORD_COUNT_TOLERANCE,
  planSectionCount,
  resolveTargetWordCount,
} from "@/lib/seo/articleLength";

import {
  WORD_COUNT_TOLERANCE,
  planSectionCount,
  resolveTargetWordCount,
} from "@/lib/seo/articleLength";

// ---------------------------------------------------------------------------
// PUBLIC TYPES
// ---------------------------------------------------------------------------

export interface LinkCandidate {
  url: string;
  title?: string;
}

export interface GenerateArticleParams {
  keyword: string;
  title?: string;
  serpData?: SerpAnalysis;

  // Brand DNA — the whole record, not two fields of it.
  brandName?: string;
  brandTone?: string;
  targetAudience?: string;
  industry?: string;
  missionVision?: string;
  /** Writing rules the owner typed. Never the raw `writingStyle` JSON blob. */
  writingStyle?: string;
  /** The business's own site, used to judge what it can credibly claim. */
  businessWebsite?: string;
  /** Customer problems the business says it solves. */
  customerProblems?: string;
  /** Why customers choose this business over the alternatives. */
  differentiator?: string;
  /** The offer the article should lead towards, if the owner set one. */
  ctaOffer?: string;
  /** Benchmark competitor brands — context only; never cited as a source. */
  competitorBrands?: string[];
  forbiddenWords?: string[];
  authorName?: string;

  // Shape of the piece.
  articleSize?: string;
  targetWordCount?: number;
  pointOfView?: string;
  language?: string;
  targetCountry?: string;

  // Publishing context.
  targetWebsite?: string;
  /** Real URLs from the user's own site. Nothing else may be linked internally. */
  internalLinkCandidates?: LinkCandidate[];

  // Feature toggles, all honoured.
  enableYoutube?: boolean;
  enableFaq?: boolean;
  enableToc?: boolean;
  enableTakeaways?: boolean;
  enableSources?: boolean;
  enableInternalLinks?: boolean;
  enableExternalLinks?: boolean;
  enableImages?: boolean;
  /** In-article images, on top of the hero. */
  imageCount?: number;
  imageStyle?: string;
  humanize?: boolean;

  // Runtime.
  timeBudgetMs?: number;
  signal?: AbortSignal;
  onProgress?: (message: string, percent?: number) => void;
}

export interface GeneratedArticle {
  title: string;
  metaTitle: string;
  metaDescription: string;
  /** The publish-ready HTML. */
  content: string;
  excerpt: string;
  slug: string;
  schemaMarkup: string;
  tableOfContents: TOCItem[];
  seoChecklist: SEOCheckItem[];
  faqItems: { question: string; answer: string }[];
  keyTakeaways: string[];
  suggestedTags: string[];
  /** Links that were really placed in the body, not links we hoped to place. */
  internalLinks: { anchorText: string; url: string; label?: string }[];
  externalLinks: { anchorText: string; url: string; label?: string }[];
  images: { url: string; alt: string; afterSectionIndex: number; credit?: string }[];
  youtube?: { videoId: string; title: string; url: string } | null;
  /** Which section carries which E-E-A-T pillar, so the editor can see coverage. */
  pillarCoverage: { pillar: string; sections: string[] }[];
  searchIntent: string;
  /** Honest notes: a missing API key, a word target we could not close, etc. */
  warnings: string[];
  seoMetrics: ArticleMeasurement & {
    targetWordCount: number;
    wordCountAccuracy: number;
  };

  // ── Back-compat aliases for callers written against the old shape ──────────
  suggestedYouTubeQueries: string[];
  suggestedInternalLinks: { anchorText: string; suggestedUrl: string }[];
  suggestedExternalLinks: { anchorText: string; url: string }[];
  imagePlaceholders: { position: number; altText: string; description: string }[];
}

// ---------------------------------------------------------------------------
// RUNTIME HELPERS
// ---------------------------------------------------------------------------

export const DEFAULT_TIME_BUDGET_MS = 235_000;
/** Concurrent model calls. Above this the project's per-minute quota starts to 429. */
const SECTION_CONCURRENCY = 5;

class Deadline {
  private readonly at: number;
  constructor(budgetMs: number) {
    this.at = Date.now() + Math.max(20_000, budgetMs);
  }
  remaining(): number {
    return this.at - Date.now();
  }
  /** True while there is still room for a round of work of the given cost. */
  allows(costMs: number): boolean {
    return this.remaining() > costMs;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Domains a reader (and a quality rater) treats as evidence rather than opinion. */
const AUTHORITY_HINTS = [
  ".gov",
  ".edu",
  ".org",
  ".int",
  ".ac.",
  "wikipedia.org",
  "who.int",
  "oecd.org",
  "statista.com",
  "pewresearch.org",
  "gartner.com",
  "mckinsey.com",
  "harvard.edu",
  "nature.com",
  "sciencedirect.com",
  "nih.gov",
];

function authorityRank(url: string): number {
  const host = hostOf(url);
  if (!host) return 99;
  const hit = AUTHORITY_HINTS.findIndex((hint) => host.includes(hint) || host.endsWith(hint));
  return hit === -1 ? 50 : hit;
}

/**
 * The only URLs the article is allowed to cite.
 *
 * They come from the SERP response, so every one of them is a page Google
 * returned minutes ago — it exists, it is indexed, and it is about the keyword.
 * The user's own domain is excluded here; those become internal links instead.
 */
export function buildCitationAllowList(
  serp: SerpAnalysis | undefined,
  ownSite: string | undefined,
  limit = 8
): LinkCandidate[] {
  if (!serp?.topResults?.length) return [];
  const ownHost = hostOf(ownSite || "");
  const seen = new Set<string>();
  const out: LinkCandidate[] = [];

  const ranked = [...serp.topResults].sort(
    (a, b) => authorityRank(a.link) - authorityRank(b.link) || a.position - b.position
  );

  for (const result of ranked) {
    const url = String(result.link || "");
    if (!/^https?:\/\//i.test(url)) continue;
    const host = hostOf(url);
    if (!host || (ownHost && host === ownHost)) continue;
    if (seen.has(host)) continue; // one citation per domain reads as research, not a link farm
    seen.add(host);
    out.push({ url, title: result.title || host });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// MODEL CALLS
// ---------------------------------------------------------------------------

const ARTICLE_MODEL = MODELS.ARTICLE_GENERATOR;

/**
 * `llm.withStructuredOutput` ignores the schema it is handed and pins temperature
 * to 0.1, so the provider is called directly. 0.35 keeps the plan varied enough
 * that two articles on the same keyword do not come out with the same headings.
 */
async function callJson(system: string, user: string, temperature = 0.35): Promise<any> {
  return vertexProvider.generateJSON(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { modelName: ARTICLE_MODEL, temperature }
  );
}

async function callHtml(system: string, user: string, temperature = 0.75): Promise<string> {
  const raw = await vertexProvider.generateText(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { modelName: ARTICLE_MODEL, temperature }
  );
  return sanitizeModelHtml(raw || "");
}

function asStringArray(value: any, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// VOICE
// ---------------------------------------------------------------------------

const POV_RULES: Record<string, string> = {
  first: 'First person plural ("we", "our team"). You are the brand talking about work you did.',
  "first-singular": 'First person singular ("I", "my"). One practitioner telling it straight.',
  second: 'Second person ("you", "your"). Coach the reader through it.',
  third: "Third person. No 'we' and no 'you' — describe the practice, not the participants.",
};

/**
 * The brand block every call shares. Anything the workspace did not fill in is
 * simply left out — an invented mission statement is worse than none.
 *
 * The business facts here (what it solves, why it wins, what it offers) come from
 * the Brand DNA record via `buildBrandProfile`. They used to arrive as one JSON
 * string in `writingStyle`, which meant the writer had a keyword and a tone and
 * no idea what the business actually does.
 */
function buildVoiceBrief(params: GenerateArticleParams): string {
  const lines: string[] = [];
  if (params.brandName) lines.push(`Publisher: ${params.brandName}`);
  if (params.industry) lines.push(`Industry: ${params.industry}`);
  if (params.businessWebsite) lines.push(`Their site: ${params.businessWebsite}`);
  if (params.targetAudience) lines.push(`Reader: ${params.targetAudience}`);
  if (params.brandTone) lines.push(`Tone: ${params.brandTone}`);
  if (params.writingStyle) lines.push(`House style: ${params.writingStyle}`);
  if (params.missionVision) lines.push(`What the brand exists to do: ${params.missionVision}`);
  if (params.customerProblems) {
    lines.push(`Problems their customers arrive with: ${params.customerProblems}`);
  }
  if (params.differentiator) {
    lines.push(`Why customers choose them over alternatives: ${params.differentiator}`);
  }
  if (params.ctaOffer) {
    lines.push(
      `Where the article should lead: ${params.ctaOffer} — mention it once, at the end, only if it genuinely follows from the article.`
    );
  }
  if (params.competitorBrands?.length) {
    lines.push(
      `Brands they benchmark against (context only — never cite or link them): ${params.competitorBrands.join(", ")}`
    );
  }
  if (params.authorName) lines.push(`Bylined author: ${params.authorName}`);

  const pov = POV_RULES[String(params.pointOfView || "first").toLowerCase()] || POV_RULES.first;
  lines.push(`Point of view: ${pov}`);

  const language = (params.language || "English").trim();
  lines.push(`Write in: ${language}`);
  if (params.targetCountry && params.targetCountry.toUpperCase() !== "WW") {
    lines.push(
      `Audience country: ${params.targetCountry.toUpperCase()} — use its spelling, currency, units and regulations.`
    );
  }

  const banned = (params.forbiddenWords || []).filter(Boolean);
  if (banned.length > 0) {
    lines.push(`NEVER use these words or phrases: ${banned.join(", ")}`);
  }
  lines.push(
    "The lines above are everything that is known about this business. Do not add a credential, " +
      "client, year founded, team size, location, price, award or piece of first-hand experience " +
      "that is not written above."
  );
  return lines.join("\n");
}

/** The anti-AI-tell rules. Applied to every prose call, not bolted on afterwards. */
const HUMAN_VOICE_RULES = `HOW TO SOUND LIKE A PERSON WHO HAS DONE THIS
- Vary sentence length hard. A four-word sentence after a long one is what human rhythm looks like.
- Never open a paragraph with "In today's fast-paced world", "In the ever-evolving landscape", "Let's dive in", "It's important to note", "In conclusion", "Moreover", "Furthermore", "Additionally".
- Ban these words entirely: delve, unlock, unleash, leverage (as a verb), robust, seamless, game-changer, landscape, realm, tapestry, testament, navigate (figurative), elevate, embark, harness, pivotal, crucial, plethora.
- No three-item lists where two items would do, and no sentence that could be deleted without losing information.
- Prefer the specific to the general: "cut 4.2 seconds off LCP" beats "significantly improved performance".
- Contractions are fine. Starting a sentence with "But" or "And" is fine.
- State a real opinion where the evidence supports one, and say plainly when something is not worth doing.
- Never claim a certification, client, award, test or measurement that was not given to you in this brief.
- Never write that the business tested, installed, repaired, audited, measured, surveyed or has "seen hundreds of" anything. That is first-hand experience, and unless this brief states it, it did not happen.
- No invented statistics, percentages, dollar figures, dates or study names. A number you cannot attribute does not go in.
- No fabricated quotes, customer stories or case studies, not even anonymised ones.
- Do not pad. If the section says what it needs to in fewer words than the target, stop.`;

const HTML_OUTPUT_RULES = `OUTPUT FORMAT
- Return raw HTML only. No markdown, no code fences, no commentary before or after.
- Allowed tags: <p> <ul> <ol> <li> <strong> <em> <blockquote> <table> <thead> <tbody> <tr> <th> <td> <h3> <h4>.
- Do NOT write <h1> or <h2>: the heading for your section is added by the system.
- Do NOT write <img>, <figure>, <iframe>, <script> or <style>: media is inserted by the system.
- Do NOT write any <a> tags or bare URLs: links are inserted by the system into the exact phrases you were told to include.`;

// ---------------------------------------------------------------------------
// SEARCH CONTEXT
// ---------------------------------------------------------------------------

/**
 * What the SERP actually told us, including the honest gaps.
 *
 * `estimatedAvgWordCount` used to be the constant 1800, so "beat the average"
 * was meaningless. It is now measured off the pages that rank, and when nothing
 * could be measured the brief says so instead of inventing a benchmark.
 */
function buildSerpBrief(serp: SerpAnalysis | undefined, keyword: string): string {
  if (!serp) {
    return `No live SERP data was available for "${keyword}". Do not guess at competitor content or claim to have analysed the top results.`;
  }

  const parts: string[] = [];
  const titles = serp.topResults.slice(0, 8).map((r, i) => `${i + 1}. ${r.title}`);
  if (titles.length) parts.push(`PAGES RANKING NOW:\n${titles.join("\n")}`);

  if (serp.measuredPages > 0) {
    parts.push(
      `MEASURED FROM ${serp.measuredPages} OF THOSE PAGES: average ${serp.estimatedAvgWordCount} words and ${serp.estimatedHeadingCount} headings. These are real counts, not estimates.`
    );
  } else {
    parts.push(
      "None of the ranking pages could be fetched, so there is no length benchmark. Do not reference competitor length."
    );
  }

  const covered = serp.topResults
    .flatMap((r) => r.headings || [])
    .slice(0, 40)
    .map((h) => `- ${h}`);
  if (covered.length) {
    parts.push(
      `SUBTOPICS THE RANKING PAGES ALREADY COVER (match the table stakes, then go past them):\n${covered.join("\n")}`
    );
  }

  if (serp.peopleAlsoAsk.length) {
    parts.push(`PEOPLE ALSO ASK (answer these directly):\n${serp.peopleAlsoAsk.map((q) => `- ${q}`).join("\n")}`);
  }
  if (serp.relatedSearches.length) {
    parts.push(
      `RELATED SEARCHES (use as semantic vocabulary, not as headings):\n${serp.relatedSearches
        .slice(0, 12)
        .map((q) => `- ${q}`)
        .join("\n")}`
    );
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// STAGE 1 — BLUEPRINT
// ---------------------------------------------------------------------------

interface BlueprintSection {
  heading: string;
  pillar: PillarKey;
  wordTarget: number;
  talkingPoints: string[];
  includeTable: boolean;
  includeList: boolean;
  /** Exact phrases the section must contain so a link can be wrapped around one. */
  linkPhrases: string[];
}

interface Blueprint {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  slug: string;
  searchIntent: string;
  keyTakeaways: string[];
  sections: BlueprintSection[];
  faqQuestions: string[];
  suggestedTags: string[];
  imageBriefs: { afterSection: number; searchQuery: string; alt: string; caption?: string }[];
  youtubeQuery: string;
  citations: { url: string; anchorText: string; label?: string }[];
  internalLinks: { url: string; anchorText: string; label?: string }[];
  /**
   * Headings for the generated furniture (TOC, takeaways, FAQ, sources). The model
   * supplies them so a Spanish article does not ship an English "Table of contents";
   * nothing here is hard-coded except the English fallback.
   */
  labels: { toc: string; takeaways: string; faq: string; sources: string };
}

const BLUEPRINT_SYSTEM = `You are a senior SEO editor planning a page that has to outrank the current top ten.

You plan; you do not write the prose. Your plan is executed literally by other writers, so every field has to be usable as-is.

THE FOUR PILLARS OF E-E-A-T — every article you plan must demonstrate all four, and each section carries exactly one:
${EEAT_PILLARS.map((p) => `- ${p.key}: ${p.brief}`).join("\n")}

Return ONE JSON object. No markdown, no commentary.`;

function buildBlueprintPrompt(
  params: GenerateArticleParams,
  targetWords: number,
  sectionCount: number,
  citations: LinkCandidate[],
  internals: LinkCandidate[]
): string {
  const perSection = Math.round((targetWords * 0.82) / sectionCount);
  const citationList = citations.length
    ? citations.map((c, i) => `${i + 1}. ${c.url}${c.title ? ` — ${c.title}` : ""}`).join("\n")
    : "(none available)";
  const internalList = internals.length
    ? internals.map((c, i) => `${i + 1}. ${c.url}${c.title ? ` — ${c.title}` : ""}`).join("\n")
    : "(none available)";

  return `FOCUS KEYWORD: "${params.keyword}"
${params.title ? `TITLE THE USER ALREADY CHOSE (keep it, fix only obvious typos): "${params.title}"` : ""}

BRAND
${buildVoiceBrief(params)}

SEARCH CONTEXT
${buildSerpBrief(params.serpData, params.keyword)}

LENGTH CONTRACT
The finished article must be ${targetWords} words. Plan exactly ${sectionCount} H2 sections whose wordTarget values add up to about ${Math.round(
    targetWords * 0.82
  )} (the remaining ~18% is the intro, conclusion, takeaways and FAQ). Aim for ${perSection} words per section and vary them by topic weight.

CITATION URLS YOU MAY USE (these are the live search results — you may not invent any other URL):
${citationList}

INTERNAL URLS FROM THE PUBLISHER'S OWN SITE (again, no invention):
${internalList}

RULES
1. Every one of the four pillars must be assigned to at least one section.
2. Section headings must read like something a person would search or skim for. No "Introduction", no "Conclusion", no "Understanding X" filler.
3. Put the focus keyword verbatim in at least one H2, and in the title near the front.
4. metaTitle: 45–62 characters. metaDescription: 130–160 characters, with the keyword and a reason to click.
5. slug: lowercase, hyphenated, 3–6 words, keyword first.
6. For each citation and internal URL you use, invent a natural ${
    params.language || "English"
  } anchor phrase of 3–6 words and put that exact phrase in the linkPhrases of the section that will carry it. The writer is told to include the phrase verbatim, so it must read naturally mid-sentence.
7. faqQuestions: 5 real questions, drawn from People Also Ask where available.
8. imageBriefs: ${Math.max(
    0,
    Math.min(6, params.imageCount ?? 2)
  )} in-article images. searchQuery must be 2–4 plain visual nouns that a stock photo library would match ("dentist reviewing x-ray", not "dental marketing excellence"). alt describes the photo for a screen reader.
9. Do not plan a section that only restates another section.
10. labels: the four section headings the system will add, written in ${
    params.language || "English"
  } — a table of contents heading, a key-takeaways heading, an FAQ heading and a sources heading.

JSON SHAPE
{"title":"","metaTitle":"","metaDescription":"","excerpt":"2 sentence summary","slug":"","searchIntent":"informational|commercial|transactional|navigational","keyTakeaways":["4 to 6 single-sentence takeaways, each with a concrete number or decision"],"sections":[{"heading":"","pillar":"Experience|Expertise|Authoritativeness|Trustworthiness","wordTarget":${perSection},"talkingPoints":["3 to 5 specific things this section must establish"],"includeTable":false,"includeList":false,"linkPhrases":[]}],"faqQuestions":[""],"suggestedTags":["5 to 8 tags"],"imageBriefs":[{"afterSection":0,"searchQuery":"","alt":"","caption":""}],"youtubeQuery":"what a reader would type on YouTube","citations":[{"url":"exact url from the list","anchorText":"the phrase you put in linkPhrases","label":"publisher name"}],"internalLinks":[{"url":"exact url from the list","anchorText":"the phrase you put in linkPhrases","label":"page title"}],"labels":{"toc":"","takeaways":"","faq":"","sources":""}}`;
}

/** Trims a string to a character budget on a word boundary. */
function clampText(value: string, max: number): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "").trim();
}

function pickLinks(
  raw: any,
  allowed: LinkCandidate[],
  limit: number
): { anchorText: string; url: string; label?: string }[] {
  if (!Array.isArray(raw) || allowed.length === 0) return [];
  const byUrl = new Map(allowed.map((c) => [normalizeUrl(c.url), c]));
  const used = new Set<string>();
  const out: { anchorText: string; url: string; label?: string }[] = [];

  for (const item of raw) {
    const url = normalizeUrl(String(item?.url || ""));
    // A URL the model invented is dropped, not "fixed" — a 404 in the body is a
    // Trust failure and there is no safe way to guess what it meant.
    const match = url ? byUrl.get(url) : undefined;
    if (!match || used.has(url)) continue;
    const anchorText = clampText(String(item?.anchorText || match.title || ""), 90);
    if (!anchorText) continue;
    used.add(url);
    out.push({ anchorText, url: match.url, label: clampText(String(item?.label || match.title || ""), 120) });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Turns whatever the model returned into a blueprint the rest of the pipeline can
 * execute without further checks. Anything missing is filled deterministically so
 * a partial JSON response degrades into a shorter article, never into a crash.
 */
export function normalizeBlueprint(
  raw: any,
  params: GenerateArticleParams,
  targetWords: number,
  sectionCount: number,
  citations: LinkCandidate[],
  internals: LinkCandidate[]
): { blueprint: Blueprint; warnings: string[] } {
  const warnings: string[] = [];
  const keyword = params.keyword.trim();

  const title = clampText(String(raw?.title || params.title || keyword), 160) || keyword;

  let sections: BlueprintSection[] = Array.isArray(raw?.sections)
    ? raw.sections
        .map((s: any) => ({
          heading: clampText(String(s?.heading || ""), 120),
          pillar: (PILLAR_KEYS.find(
            (p) => p.toLowerCase() === String(s?.pillar || "").toLowerCase()
          ) || "Expertise") as PillarKey,
          wordTarget: Math.max(120, Math.min(900, Math.round(Number(s?.wordTarget) || 0))),
          talkingPoints: asStringArray(s?.talkingPoints, 6),
          includeTable: Boolean(s?.includeTable),
          includeList: Boolean(s?.includeList),
          linkPhrases: asStringArray(s?.linkPhrases, 4),
        }))
        .filter((s: BlueprintSection) => s.heading.length > 0)
    : [];

  if (sections.length === 0) {
    warnings.push("The outline call returned no usable sections; a default outline was used.");
    sections = PILLAR_KEYS.map((pillar, i) => ({
      heading:
        i === 0
          ? `What ${keyword} actually involves`
          : i === 1
            ? `How to do ${keyword} step by step`
            : i === 2
              ? `What the data says about ${keyword}`
              : `Where ${keyword} goes wrong`,
      pillar,
      wordTarget: Math.round((targetWords * 0.82) / 4),
      talkingPoints: [],
      includeTable: i === 1,
      includeList: true,
      linkPhrases: [],
    }));
  }

  // Length contract: the model's own wordTargets are rescaled so they really do
  // add up to the body budget. Asking politely for 3,000 words does not produce
  // 3,000 words; giving each writer an arithmetically consistent quota does.
  sections = sections.slice(0, Math.max(3, Math.min(16, sectionCount + 3)));
  const bodyBudget = Math.round(targetWords * 0.82);
  const plannedSum = sections.reduce((sum, s) => sum + s.wordTarget, 0) || 1;
  const scale = bodyBudget / plannedSum;
  sections = sections.map((s) => ({
    ...s,
    wordTarget: Math.max(140, Math.round(s.wordTarget * scale)),
  }));

  // Pillar coverage is a promise the UI makes to the user, so it is enforced here
  // rather than hoped for: any missing pillar is assigned to the section that is
  // currently duplicating the most common one.
  const present = new Set(sections.map((s) => s.pillar));
  const missing = PILLAR_KEYS.filter((p) => !present.has(p));
  if (missing.length > 0 && sections.length >= PILLAR_KEYS.length) {
    for (const pillar of missing) {
      const counts = new Map<string, number>();
      sections.forEach((s) => counts.set(s.pillar, (counts.get(s.pillar) || 0) + 1));
      let victimPillar = "";
      let max = 1;
      counts.forEach((count, key) => {
        if (count > max) {
          max = count;
          victimPillar = key;
        }
      });
      const index = sections.findIndex((s) => s.pillar === victimPillar);
      if (index === -1) break;
      sections[index] = { ...sections[index], pillar };
    }
  }

  const wantExternal = params.enableExternalLinks !== false;
  const wantInternal = params.enableInternalLinks !== false;
  const chosenCitations = wantExternal ? pickLinks(raw?.citations, citations, 5) : [];
  const chosenInternals = wantInternal ? pickLinks(raw?.internalLinks, internals, 5) : [];

  // If the model ignored the URL list, fall back to the top of the list itself with
  // the page title as the anchor — real URLs with an honest anchor beat no citations.
  if (wantExternal && chosenCitations.length === 0 && citations.length > 0) {
    warnings.push("The outline did not pick citations, so the top search results were cited directly.");
    chosenCitations.push(
      ...citations.slice(0, 3).map((c) => ({
        anchorText: clampText(c.title || hostOf(c.url), 80),
        url: c.url,
        label: clampText(c.title || hostOf(c.url), 120),
      }))
    );
  }
  if (wantExternal && citations.length === 0) {
    warnings.push(
      "No live search results were available, so the article ships without external citations."
    );
  }
  if (wantInternal && internals.length === 0) {
    warnings.push(
      "No pages were discovered on your own site, so there are no internal links to place."
    );
  }

  // Every anchor the links need must appear in some section's linkPhrases, or the
  // writer will not include the phrase and the link cannot be placed in prose.
  const allAnchors = [...chosenCitations, ...chosenInternals].map((l) => l.anchorText);
  const covered = new Set(
    sections.flatMap((s) => s.linkPhrases.map((p) => p.toLowerCase()))
  );
  allAnchors.forEach((anchor, i) => {
    if (covered.has(anchor.toLowerCase())) return;
    const target = sections[i % sections.length];
    target.linkPhrases = [...target.linkPhrases, anchor].slice(0, 4);
  });

  const metaTitle = clampText(String(raw?.metaTitle || title), 62) || clampText(title, 62);
  const metaDescription =
    clampText(String(raw?.metaDescription || raw?.excerpt || ""), 160) ||
    clampText(`${title}. ${keyword} explained with the steps, numbers and caveats that matter.`, 160);

  const faqQuestions = params.enableFaq === false ? [] : asStringArray(raw?.faqQuestions, 8);
  const paa = params.serpData?.peopleAlsoAsk || [];
  while (faqQuestions.length < 5 && params.enableFaq !== false) {
    const next = paa[faqQuestions.length];
    if (!next) break;
    faqQuestions.push(next);
  }

  const imageLimit = params.enableImages === false ? 0 : Math.max(0, Math.min(6, params.imageCount ?? 2));
  const imageBriefs = (Array.isArray(raw?.imageBriefs) ? raw.imageBriefs : [])
    .map((b: any) => ({
      afterSection: Math.max(0, Math.min(sections.length - 1, Math.round(Number(b?.afterSection) || 0))),
      searchQuery: clampText(String(b?.searchQuery || keyword), 80),
      alt: clampText(String(b?.alt || ""), 160),
      caption: clampText(String(b?.caption || ""), 200) || undefined,
    }))
    .filter((b: any) => b.searchQuery.length > 0)
    .slice(0, imageLimit);

  const blueprint: Blueprint = {
    title,
    metaTitle,
    metaDescription,
    excerpt: clampText(String(raw?.excerpt || metaDescription), 320),
    slug: slugify(String(raw?.slug || title), 70) || slugify(keyword, 70),
    searchIntent: clampText(String(raw?.searchIntent || "informational"), 40),
    keyTakeaways: params.enableTakeaways === false ? [] : asStringArray(raw?.keyTakeaways, 7),
    sections,
    faqQuestions: faqQuestions.slice(0, 6),
    suggestedTags: asStringArray(raw?.suggestedTags, 10),
    imageBriefs,
    youtubeQuery: clampText(String(raw?.youtubeQuery || `${keyword} explained`), 120),
    citations: chosenCitations,
    internalLinks: chosenInternals,
    labels: {
      toc: clampText(String(raw?.labels?.toc || ""), 60) || "Table of contents",
      takeaways: clampText(String(raw?.labels?.takeaways || ""), 60) || "Key takeaways",
      faq: clampText(String(raw?.labels?.faq || ""), 60) || "Frequently asked questions",
      sources: clampText(String(raw?.labels?.sources || ""), 60) || "Sources",
    },
  };

  return { blueprint, warnings };
}

// ---------------------------------------------------------------------------
// STAGE 2 — PROSE
// ---------------------------------------------------------------------------

function writerSystem(params: GenerateArticleParams): string {
  return `You are a subject-matter practitioner writing one section of a long article for ${
    params.brandName || "a specialist publisher"
  }. You have done this work yourself and you are writing for someone about to do it.

${buildVoiceBrief(params)}

${HUMAN_VOICE_RULES}

${HTML_OUTPUT_RULES}`;
}

function buildSectionPrompt(
  params: GenerateArticleParams,
  blueprint: Blueprint,
  section: BlueprintSection,
  index: number
): string {
  const neighbours = blueprint.sections
    .map((s, i) => `${i === index ? "»" : " "} ${i + 1}. ${s.heading}`)
    .join("\n");

  const phrases = section.linkPhrases.length
    ? `\nPHRASES YOU MUST INCLUDE VERBATIM (the system wraps each one in a link afterwards, so write them as ordinary prose — do not quote them, bold them or explain them):\n${section.linkPhrases
        .map((p) => `- ${p}`)
        .join("\n")}`
    : "";

  const structure: string[] = [];
  if (section.includeTable)
    structure.push(
      "Include one <table> with a <thead> and 3–6 body rows of real comparative values. No empty cells."
    );
  if (section.includeList)
    structure.push("Include one short <ul> or <ol> where the content is genuinely a list.");
  structure.push(
    "Use one or two <h3> sub-headings if the section has distinct parts; skip them if it does not."
  );

  return `ARTICLE: "${blueprint.title}"
FOCUS KEYWORD: "${params.keyword}"
SEARCH INTENT: ${blueprint.searchIntent}

FULL OUTLINE (» marks your section — do not cover the others):
${neighbours}

YOUR SECTION: "${section.heading}"
E-E-A-T PILLAR YOU ARE CARRYING: ${section.pillar}
${pillarBrief(section.pillar)}

WHAT THIS SECTION MUST ESTABLISH:
${section.talkingPoints.length ? section.talkingPoints.map((p) => `- ${p}`).join("\n") : "- Whatever a practitioner would need to act on this heading."}

LENGTH: ${section.wordTarget} words, ±10%. This is a contract — the article is assembled from these sections and the total is checked.

STRUCTURE:
${structure.map((s) => `- ${s}`).join("\n")}
${phrases}

Mention "${params.keyword}" naturally where it belongs; do not force it into every paragraph.
Write the section body now.`;
}

function buildIntroPrompt(
  params: GenerateArticleParams,
  blueprint: Blueprint,
  words: number
): string {
  return `ARTICLE: "${blueprint.title}"
FOCUS KEYWORD: "${params.keyword}"
SEARCH INTENT: ${blueprint.searchIntent}
SECTIONS THAT FOLLOW:
${blueprint.sections.map((s, i) => `${i + 1}. ${s.heading}`).join("\n")}

Write the opening of the article: ${words} words, 2–3 short paragraphs.

- The exact phrase "${params.keyword}" must appear in the first sentence or the second.
- Open on the reader's actual situation or a specific number. Never on a definition, never on "in today's".
- Say what the article gives them and what it will cost them in effort, then stop. No "in this article we will explore".
- Earn the Experience pillar immediately: one concrete detail that only someone who has done this would mention.

Write the intro now.`;
}

function buildConclusionPrompt(
  params: GenerateArticleParams,
  blueprint: Blueprint,
  words: number
): string {
  return `ARTICLE: "${blueprint.title}"
SECTIONS COVERED:
${blueprint.sections.map((s, i) => `${i + 1}. ${s.heading}`).join("\n")}

Write the closing of the article: ${words} words.

- Start with an <h2>-free paragraph; the system adds no heading here, so make the first sentence read as a close.
- Name the one thing the reader should do first, and the signal that tells them it worked.
- Trustworthiness pillar: say plainly what this will not fix, and who should not bother.
- No summary of the sections. No "in conclusion". No sales pitch.

Write the conclusion now.`;
}

async function writeFaqAnswers(
  params: GenerateArticleParams,
  blueprint: Blueprint
): Promise<{ question: string; answer: string }[]> {
  if (blueprint.faqQuestions.length === 0) return [];

  const prompt = `ARTICLE: "${blueprint.title}"
FOCUS KEYWORD: "${params.keyword}"

Answer each question below the way a practitioner would answer it out loud: a direct answer in the first sentence, then one or two sentences of the detail that actually decides it. 45–75 words each. No preamble, no "great question", no repeating the question back.

${buildVoiceBrief(params)}

QUESTIONS:
${blueprint.faqQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return JSON only: {"faq":[{"question":"the question, unchanged","answer":"plain text, no HTML"}]}`;

  try {
    const raw = await callJson(
      "You write FAQ answers that Google can lift into a featured snippet. Return JSON only.",
      prompt,
      0.5
    );
    const items = Array.isArray(raw?.faq) ? raw.faq : Array.isArray(raw) ? raw : [];
    return items
      .map((item: any) => ({
        question: clampText(String(item?.question || ""), 200),
        answer: clampText(stripHtml(String(item?.answer || "")), 900),
      }))
      .filter((item: any) => item.question && item.answer)
      .slice(0, 6);
  } catch (err) {
    console.warn("[article] FAQ answers failed:", (err as any)?.message || err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// STAGE 3 — WORD COUNT RECONCILIATION
// ---------------------------------------------------------------------------

/**
 * Decides which sections absorb a shortfall (or a surplus).
 *
 * Spreading 600 missing words over eight sections gives each writer 75 words to
 * add, which reads as padding. Concentrating them in the two or three heaviest
 * sections produces real added substance, so the deficit is assigned greedily.
 */
export function planWordAdjustments(
  sectionWordCounts: number[],
  delta: number,
  maxSections = 3
): { index: number; words: number }[] {
  if (delta === 0 || sectionWordCounts.length === 0) return [];
  const order = sectionWordCounts
    .map((words, index) => ({ index, words }))
    .sort((a, b) => (delta > 0 ? b.words - a.words : b.words - a.words));

  const picked = order.slice(0, Math.max(1, Math.min(maxSections, order.length)));
  const totalWords = picked.reduce((sum, p) => sum + p.words, 0) || 1;
  const out: { index: number; words: number }[] = [];
  let assigned = 0;

  picked.forEach((p, i) => {
    const isLast = i === picked.length - 1;
    const share = isLast
      ? delta - assigned
      : Math.round(delta * (p.words / totalWords));
    assigned += share;
    if (Math.abs(share) >= 25) out.push({ index: p.index, words: share });
  });

  return out;
}

function buildAdjustPrompt(
  params: GenerateArticleParams,
  blueprint: Blueprint,
  section: BlueprintSection,
  html: string,
  deltaWords: number
): string {
  const grow = deltaWords > 0;
  const magnitude = Math.abs(deltaWords);
  return `ARTICLE: "${blueprint.title}"
SECTION: "${section.heading}"
E-E-A-T PILLAR: ${section.pillar} — ${pillarBrief(section.pillar)}

${
  grow
    ? `This section needs about ${magnitude} MORE words. Keep every sentence that is already there and add depth: a worked example with real numbers, a decision table, an edge case, or the failure mode and its fix. Do not add a summary paragraph, a transition, or a restatement of what is above.`
    : `This section is about ${magnitude} words too long. Cut ${magnitude} words by deleting hedging, repetition and any sentence that does not add information. Keep every concrete number, every phrase listed below, every heading and every table row.`
}

${
  section.linkPhrases.length
    ? `THESE EXACT PHRASES MUST SURVIVE VERBATIM:\n${section.linkPhrases.map((p) => `- ${p}`).join("\n")}\n`
    : ""
}
${HTML_OUTPUT_RULES}

CURRENT SECTION HTML:
${html}

Return the complete revised section HTML.`;
}

// ---------------------------------------------------------------------------
// STAGE 4 — MEDIA
// ---------------------------------------------------------------------------

/**
 * Turns the blueprint's image briefs into real stock photos.
 *
 * Nothing is invented and nothing is substituted: if Pixabay has no match for a
 * brief, that slot stays empty and the caller is told why. A photo of an
 * unrelated subject is worse than no photo — it is the clearest tell that a page
 * was machine-assembled.
 */
async function resolveImages(
  params: GenerateArticleParams,
  blueprint: Blueprint
): Promise<{ images: ArticleImage[]; warnings: string[] }> {
  if (params.enableImages === false) return { images: [], warnings: [] };
  if (!hasPixabayKey()) {
    return {
      images: [],
      warnings: [
        "No images were added: PIXABAY_API_KEY is not configured on the server.",
      ],
    };
  }

  const warnings: string[] = [];
  const used = new Set<string>();
  const styleHint = (params.imageStyle || "").trim();
  const withStyle = (query: string) =>
    styleHint && !/^(default|none|auto)$/i.test(styleHint) ? `${query} ${styleHint}` : query;

  // Hero first, so it wins the best match for the headline subject.
  const heroQuery = withStyle(blueprint.title || params.keyword);
  const heroHits = await getSmartImages(heroQuery, {
    count: 1,
    orientation: "horizontal",
    width: 1200,
    height: 630,
  });

  const images: ArticleImage[] = [];
  if (heroHits[0]) {
    used.add(heroHits[0].url);
    images.push({
      url: heroHits[0].url,
      alt: `${blueprint.title}`.slice(0, 160),
      credit: heroHits[0].credit,
      afterSectionIndex: -1,
      source: "pixabay",
    });
  } else {
    warnings.push(`No stock photo matched the headline subject ("${heroQuery}").`);
  }

  if (blueprint.imageBriefs.length === 0) return { images, warnings };

  // In-article images in parallel, but gently: Pixabay rate-limits per IP.
  const resolved = await mapWithConcurrency(blueprint.imageBriefs, 3, async (brief) => {
    const hits = await getSmartImages(withStyle(brief.searchQuery), {
      count: 3,
      orientation: "horizontal",
      width: 1200,
      height: 630,
    });
    return { brief, hits };
  });

  for (const { brief, hits } of resolved) {
    const pick = hits.find((h) => !used.has(h.url));
    if (!pick) {
      warnings.push(`No distinct stock photo matched "${brief.searchQuery}".`);
      continue;
    }
    used.add(pick.url);
    images.push({
      url: pick.url,
      alt: (brief.alt || brief.searchQuery).slice(0, 160),
      caption: brief.caption,
      credit: pick.credit,
      afterSectionIndex: brief.afterSection,
      source: "pixabay",
    });
  }

  return { images, warnings };
}

async function resolveYouTube(
  params: GenerateArticleParams,
  blueprint: Blueprint
): Promise<{
  video: { videoId: string; title: string; url: string; embedHtml: string } | null;
  warnings: string[];
}> {
  if (!params.enableYoutube) return { video: null, warnings: [] };
  if (!hasSerperKey()) {
    return {
      video: null,
      warnings: ["No video was embedded: SERPER_API_KEY is not configured on the server."],
    };
  }
  const video = await getSmartYouTubeEmbed(params.keyword, {
    targetCountry: params.targetCountry,
    context: blueprint.youtubeQuery,
  });
  return {
    video,
    warnings: video ? [] : [`No relevant YouTube video was found for "${params.keyword}".`],
  };
}

// ---------------------------------------------------------------------------
// STAGE 5 — ORCHESTRATION
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** One section, with one retry, and an honest failure instead of a stub paragraph. */
async function writeSection(
  params: GenerateArticleParams,
  blueprint: Blueprint,
  section: BlueprintSection,
  index: number,
  deadline: Deadline
): Promise<string> {
  const floor = Math.min(60, Math.round(section.wordTarget * 0.4));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const html = await callHtml(
        writerSystem(params),
        buildSectionPrompt(params, blueprint, section, index)
      );
      if (html && countHtmlWords(html) >= floor) return html;
    } catch (err) {
      console.warn(`[article] section "${section.heading}" failed:`, (err as any)?.message || err);
    }
    if (!deadline.allows(60_000)) break;
  }
  return "";
}

function summarisePillars(sections: ArticleSectionPart[]): { pillar: string; sections: string[] }[] {
  return PILLAR_KEYS.map((pillar) => ({
    pillar,
    sections: sections.filter((s) => s.pillar === pillar).map((s) => s.heading),
  }));
}

/**
 * Writes one complete, measured article.
 *
 * The shape of the run: one blueprint call, then every section plus the intro,
 * conclusion, FAQ, images and video concurrently, then up to two correction rounds
 * against the real word count, then deterministic assembly and measurement. Every
 * number on the returned scorecard is measured from the HTML that ships.
 */
export async function generateSeoArticle(
  params: GenerateArticleParams
): Promise<GeneratedArticle> {
  const keyword = (params.keyword || "").trim();
  if (!keyword) throw new Error("A focus keyword is required to generate an article.");

  const deadline = new Deadline(params.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const warnings: string[] = [];
  const progress = (message: string, percent?: number) => {
    try {
      params.onProgress?.(message, percent);
    } catch {
      /* a reporting failure must never fail the article */
    }
  };
  const abortIfCancelled = () => {
    if (params.signal?.aborted) throw new Error("Article generation was cancelled.");
  };

  const targetWords = resolveTargetWordCount(params);
  const sectionCount = planSectionCount(targetWords);
  const ownHost = hostOf(params.targetWebsite || "");
  const citations =
    params.enableExternalLinks === false ? [] : buildCitationAllowList(params.serpData, ownHost, 8);
  const internals =
    params.enableInternalLinks === false
      ? []
      : (params.internalLinkCandidates || [])
          .filter((c) => c && typeof c.url === "string" && /^https?:\/\//i.test(c.url))
          .slice(0, 8);

  // ── 1. Blueprint ──────────────────────────────────────────────────────────
  abortIfCancelled();
  progress("Planning the outline against the live search results", 8);

  let rawBlueprint: any = null;
  try {
    rawBlueprint = await callJson(
      BLUEPRINT_SYSTEM,
      buildBlueprintPrompt(params, targetWords, sectionCount, citations, internals),
      0.4
    );
  } catch (err) {
    warnings.push(
      `The outline step failed (${(err as any)?.message || "unknown error"}); a default outline was used.`
    );
  }

  const normalized = normalizeBlueprint(
    rawBlueprint,
    params,
    targetWords,
    sectionCount,
    citations,
    internals
  );
  const blueprint = normalized.blueprint;
  warnings.push(...normalized.warnings);

  // ── 2. Prose and media, concurrently ──────────────────────────────────────
  abortIfCancelled();
  const introWords = clamp(Math.round(targetWords * 0.06), 70, 200);
  const conclusionWords = clamp(Math.round(targetWords * 0.05), 60, 170);

  const sectionHtml = new Array<string>(blueprint.sections.length).fill("");
  let introHtml = "";
  let conclusionHtml = "";
  let faqItems: { question: string; answer: string }[] = [];
  // Held on an object because these are filled inside the concurrent jobs below;
  // a plain `let` would be narrowed to its initialiser by the compiler.
  const media: {
    images: ArticleImage[];
    video: { videoId: string; title: string; url: string; embedHtml: string } | null;
  } = { images: [], video: null };

  const totalJobs =
    blueprint.sections.length + 2 + (blueprint.faqQuestions.length ? 1 : 0) + 2;
  let done = 0;
  const tick = (label: string) => {
    done++;
    progress(label, 12 + Math.round((done / totalJobs) * 62));
  };

  const jobs: (() => Promise<void>)[] = blueprint.sections.map((section, index) => async () => {
    sectionHtml[index] = await writeSection(params, blueprint, section, index, deadline);
    tick(`Wrote "${section.heading}"`);
  });

  jobs.push(async () => {
    try {
      introHtml = await callHtml(
        writerSystem(params),
        buildIntroPrompt(params, blueprint, introWords)
      );
    } catch (err) {
      console.warn("[article] intro failed:", (err as any)?.message || err);
    }
    tick("Wrote the opening");
  });

  jobs.push(async () => {
    try {
      conclusionHtml = await callHtml(
        writerSystem(params),
        buildConclusionPrompt(params, blueprint, conclusionWords)
      );
    } catch (err) {
      console.warn("[article] conclusion failed:", (err as any)?.message || err);
    }
    tick("Wrote the close");
  });

  if (blueprint.faqQuestions.length) {
    jobs.push(async () => {
      faqItems = await writeFaqAnswers(params, blueprint);
      tick("Answered the FAQ");
    });
  }

  jobs.push(async () => {
    const res = await resolveImages(params, blueprint);
    media.images = res.images;
    warnings.push(...res.warnings);
    tick("Sourced the images");
  });

  jobs.push(async () => {
    const res = await resolveYouTube(params, blueprint);
    media.video = res.video;
    warnings.push(...res.warnings);
    tick("Checked for a video");
  });

  progress(`Writing ${blueprint.sections.length} sections`, 14);
  await mapWithConcurrency(jobs, SECTION_CONCURRENCY, (job) => job());

  // A section that would not write is dropped rather than shipped as filler, and
  // the drop is reported — the word count below then reflects reality.
  const parts: ArticleSectionPart[] = [];
  const keptIndexes: number[] = [];
  blueprint.sections.forEach((section, index) => {
    if (!sectionHtml[index]) {
      warnings.push(`The section "${section.heading}" could not be written and was left out.`);
      return;
    }
    parts.push({
      heading: section.heading,
      level: 2,
      html: sectionHtml[index],
      pillar: section.pillar,
      anchorId: slugify(section.heading, 60),
    });
    keptIndexes.push(index);
  });

  if (parts.length === 0) {
    throw new Error(
      "The article could not be written: every section failed. Check the model quota and try again."
    );
  }

  if (!introHtml) warnings.push("The opening paragraph could not be written.");
  if (!conclusionHtml) warnings.push("The closing paragraph could not be written.");

  // In-article image and video positions were planned against the original outline;
  // remap them onto the sections that survived.
  const remap = (originalIndex: number): number => {
    const at = keptIndexes.indexOf(originalIndex);
    if (at >= 0) return at;
    return Math.min(parts.length - 1, Math.max(0, originalIndex));
  };
  const placedImages: ArticleImage[] = media.images.map((img) =>
    img.afterSectionIndex < 0 ? img : { ...img, afterSectionIndex: remap(img.afterSectionIndex) }
  );
  const videoAfter = parts.length > 1 ? Math.min(1, parts.length - 1) : 0;

  const assemble = () =>
    assembleArticle({
      title: blueprint.title,
      intro: introHtml,
      sections: parts,
      conclusion: conclusionHtml,
      keyTakeaways: blueprint.keyTakeaways,
      faqItems,
      images: placedImages,
      youtube: media.video
        ? { embedHtml: media.video.embedHtml, afterSectionIndex: videoAfter }
        : null,
      internalLinks: blueprint.internalLinks.map((l) => ({
        anchorText: l.anchorText,
        url: l.url,
        label: l.label,
      })),
      externalLinks: blueprint.citations.map((l) => ({
        anchorText: l.anchorText,
        url: l.url,
        label: l.label,
      })),
      includeToc: params.enableToc !== false,
      includeTakeaways: params.enableTakeaways !== false && blueprint.keyTakeaways.length > 0,
      includeFaq: params.enableFaq !== false && faqItems.length > 0,
      includeSources: params.enableSources !== false,
      labels: blueprint.labels,
    });

  // ── 3. Close the gap to the requested word count ──────────────────────────
  abortIfCancelled();
  let assembled = assemble();
  let wordCount = countHtmlWords(assembled.html);
  const tolerance = Math.max(40, Math.round(targetWords * WORD_COUNT_TOLERANCE));

  for (let round = 0; round < 2; round++) {
    const delta = targetWords - wordCount;
    if (Math.abs(delta) <= tolerance) break;
    if (!deadline.allows(70_000)) {
      warnings.push(
        "There was not enough time left to correct the length, so the article is shorter or longer than requested."
      );
      break;
    }

    progress(
      delta > 0
        ? `Adding depth to reach ${targetWords} words (currently ${wordCount})`
        : `Tightening to ${targetWords} words (currently ${wordCount})`,
      78 + round * 5
    );

    const plan = planWordAdjustments(
      parts.map((p) => countHtmlWords(p.html)),
      delta
    );
    if (plan.length === 0) break;

    await mapWithConcurrency(plan, 3, async ({ index, words }) => {
      const section = blueprint.sections[keptIndexes[index]];
      if (!section) return;
      try {
        const revised = await callHtml(
          writerSystem(params),
          buildAdjustPrompt(params, blueprint, section, parts[index].html, words),
          0.6
        );
        // Only accept a revision that actually moved the count the right way.
        const before = countHtmlWords(parts[index].html);
        const after = countHtmlWords(revised);
        if (revised && after >= 60 && (words > 0 ? after > before : after < before)) {
          parts[index].html = revised;
        }
      } catch (err) {
        console.warn(
          `[article] length adjustment for "${section.heading}" failed:`,
          (err as any)?.message || err
        );
      }
    });

    assembled = assemble();
    const next = countHtmlWords(assembled.html);
    // No progress means the model has said everything it has; stop burning time.
    if (Math.abs(targetWords - next) >= Math.abs(delta)) {
      wordCount = next;
      break;
    }
    wordCount = next;
  }

  if (Math.abs(targetWords - wordCount) > tolerance) {
    warnings.push(
      `The article came out at ${wordCount} words against the ${targetWords} requested.`
    );
  }

  // ── 4. Structured data and measurement ────────────────────────────────────
  progress("Measuring the finished article", 92);

  const heroImage = placedImages.find((img) => img.afterSectionIndex < 0);
  const schemaMarkup = buildSchemaMarkup({
    title: blueprint.title,
    metaDescription: blueprint.metaDescription,
    slug: blueprint.slug,
    keyword,
    brandName: params.brandName,
    siteUrl: params.targetWebsite,
    authorName: params.authorName,
    heroImageUrl: heroImage?.url,
    faqItems,
    wordCount,
  });

  const { metrics, checklist } = measureArticle({
    html: assembled.html,
    title: blueprint.title,
    metaTitle: blueprint.metaTitle,
    metaDescription: blueprint.metaDescription,
    keyword,
    schemaMarkup,
    faqCount: faqItems.length,
    targetWordCount: targetWords,
    siteHost: ownHost || undefined,
  });

  const wordCountAccuracy = Math.max(
    0,
    Math.round((1 - Math.abs(targetWords - wordCount) / Math.max(1, targetWords)) * 100)
  );

  const excerpt =
    clampText(blueprint.excerpt, 320) ||
    clampText(stripHtml(introHtml), 320) ||
    blueprint.metaDescription;

  progress("Done", 100);

  return {
    title: blueprint.title,
    metaTitle: blueprint.metaTitle,
    metaDescription: blueprint.metaDescription,
    content: assembled.html,
    excerpt,
    slug: blueprint.slug,
    schemaMarkup,
    tableOfContents: assembled.toc,
    seoChecklist: checklist,
    faqItems,
    keyTakeaways: blueprint.keyTakeaways,
    suggestedTags: blueprint.suggestedTags,
    internalLinks: assembled.internalLinksApplied,
    externalLinks: assembled.externalLinksApplied,
    images: placedImages.map((img) => ({
      url: img.url,
      alt: img.alt,
      afterSectionIndex: img.afterSectionIndex,
      credit: img.credit,
    })),
    youtube: media.video
      ? { videoId: media.video.videoId, title: media.video.title, url: media.video.url }
      : null,
    pillarCoverage: summarisePillars(parts),
    searchIntent: blueprint.searchIntent,
    warnings,
    seoMetrics: { ...metrics, targetWordCount: targetWords, wordCountAccuracy },

    // Back-compat aliases — older callers read these names.
    suggestedYouTubeQueries: blueprint.youtubeQuery ? [blueprint.youtubeQuery] : [],
    suggestedInternalLinks: assembled.internalLinksApplied.map((l) => ({
      anchorText: l.anchorText,
      suggestedUrl: l.url,
    })),
    suggestedExternalLinks: assembled.externalLinksApplied.map((l) => ({
      anchorText: l.anchorText,
      url: l.url,
    })),
    imagePlaceholders: placedImages.map((img, i) => ({
      position: i,
      altText: img.alt,
      description: img.caption || img.alt,
    })),
  };
}
