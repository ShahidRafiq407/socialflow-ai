/**
 * THE ARTIFACTS, AND THE GUARDS THAT ADMIT THEM
 *
 * Each stage produces one named artifact, and every artifact arrives from a
 * model, which means it arrives untrusted. A guard is what turns a JSON blob into
 * a shape the rest of the pipeline may rely on: it returns null when the payload
 * is not what the stage promised, and the stage then fails with a real message
 * instead of handing the next stage an object full of holes.
 *
 * The same guards run in the browser, because the editor reads these artifacts
 * back and must not render a field the producing stage never wrote.
 *
 * Client-safe: no imports.
 */

// ---------------------------------------------------------------------------
// COERCIONS
//
// Deliberately narrow. `str` will not stringify an object into "[object Object]"
// and `num` will not read "12 words" as 12 — a guard that repairs bad input is a
// guard that lets a stage claim work it did not do.
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function need(value: unknown): string | null {
  const text = str(value);
  return text ? text : null;
}

function strList(value: unknown, limit = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter(Boolean).slice(0, limit);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function int(value: unknown, fallback = 0): number {
  const found = num(value);
  return found === null ? fallback : Math.round(found);
}

function bool(value: unknown): boolean {
  return value === true;
}

/** A 0-100 figure, clamped. Used by every stage that scores something. */
function pct(value: unknown): number {
  return Math.min(100, Math.max(0, int(value)));
}

/**
 * A date, only when it parses — and kept as the source stated it.
 *
 * Not normalised to ISO on purpose: a page that publishes "2019" is telling us
 * the year and nothing more, and rewriting that as `2019-01-01` would invent a
 * day and a month for a currency check to read.
 */
function dateText(value: unknown): string | undefined {
  const text = str(value);
  if (!text) return undefined;
  return Number.isNaN(new Date(text).getTime()) ? undefined : text;
}

function rows(value: unknown, limit = 60): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .slice(0, limit);
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
// ---------------------------------------------------------------------------
// 1. BUSINESS PROFILE
// ---------------------------------------------------------------------------

export interface BusinessProfile {
  /** What the business does, from what could actually be read. */
  summary: string;
  services: string[];
  audience: string;
  /** Things the site demonstrates — named clients, credentials, case studies. */
  proofPoints: string[];
  /**
   * What could not be proved. The plan requires this list: an article that needs
   * one of these facts has to ask for it rather than invent it.
   */
  unverified: string[];
  /** The pages this was read from. Empty means nothing was fetched. */
  sourceUrls: string[];
}

export function readBusinessProfile(value: unknown): BusinessProfile | null {
  const raw = obj(value);
  if (!raw) return null;
  const summary = need(raw.summary);
  if (!summary) return null;
  return {
    summary,
    services: strList(raw.services),
    audience: str(raw.audience),
    proofPoints: strList(raw.proofPoints),
    unverified: strList(raw.unverified),
    sourceUrls: strList(raw.sourceUrls).filter((url) => /^https?:\/\//i.test(url)),
  };
}
// ---------------------------------------------------------------------------
// 2. SEARCH INTENT
// ---------------------------------------------------------------------------

export type SearchIntentKind =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

const INTENT_KINDS: SearchIntentKind[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
];

export interface SearchIntent {
  kind: SearchIntentKind;
  /** The reader's problem, in the reader's terms. */
  readerProblem: string;
  /** What they must know by the last line. The outline is judged against this. */
  mustKnow: string[];
  /** Questions a reader arrives with, from the query itself. */
  questions: string[];
  /** The page type this query expects — a guide, a comparison, a service page. */
  expectedFormat: string;
}

export function readSearchIntent(value: unknown): SearchIntent | null {
  const raw = obj(value);
  if (!raw) return null;
  const kind = INTENT_KINDS.includes(str(raw.kind) as SearchIntentKind)
    ? (str(raw.kind) as SearchIntentKind)
    : null;
  const readerProblem = need(raw.readerProblem);
  const mustKnow = strList(raw.mustKnow, 12);
  if (!kind || !readerProblem || mustKnow.length === 0) return null;
  return {
    kind,
    readerProblem,
    mustKnow,
    questions: strList(raw.questions, 20),
    expectedFormat: str(raw.expectedFormat),
  };
}
// ---------------------------------------------------------------------------
// 3. SERP RESEARCH
//
// This one is not model output: it comes from the live search API. The guard
// exists so the editor reads it back safely, and `note` carries the reason when
// the API could not answer — the pipeline continues, but nothing downstream is
// allowed to pretend it saw the first page.
// ---------------------------------------------------------------------------

export interface SerpCompetitor {
  url: string;
  title: string;
  headings: string[];
  wordCount?: number;
}

export interface SerpResearch {
  keyword: string;
  country: string;
  competitors: SerpCompetitor[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  entities: string[];
  /** Formats that already rank: guide, listicle, comparison, tool. */
  formats: string[];
  /** Present only when the live read failed or returned nothing. */
  note?: string;
}

export function readSerpResearch(value: unknown): SerpResearch | null {
  const raw = obj(value);
  if (!raw) return null;
  const keyword = need(raw.keyword);
  if (!keyword) return null;
  return {
    keyword,
    country: str(raw.country),
    competitors: rows(raw.competitors, 20)
      .map((row) => ({
        url: str(row.url),
        title: str(row.title),
        headings: strList(row.headings, 40),
        wordCount: num(row.wordCount) ?? undefined,
      }))
      .filter((row) => /^https?:\/\//i.test(row.url)),
    peopleAlsoAsk: strList(raw.peopleAlsoAsk, 20),
    relatedSearches: strList(raw.relatedSearches, 20),
    entities: strList(raw.entities, 40),
    formats: strList(raw.formats, 10),
    note: need(raw.note) ?? undefined,
  };
}
// ---------------------------------------------------------------------------
// 4. ARTICLE STRATEGY
// ---------------------------------------------------------------------------

export interface ArticleStrategy {
  /** The angle, stated as a position rather than a topic. */
  angle: string;
  /** What the reader gets, in one sentence, testable against the finished page. */
  promise: string;
  /** What this page adds that the ranking pages do not. */
  adds: string[];
  /** Facts this angle commits us to proving. The evidence gate reads these. */
  proofRequired: string[];
  /** Where the business legitimately belongs in the answer. */
  businessTieIn: string;
  targetReader: string;
}

export function readArticleStrategy(value: unknown): ArticleStrategy | null {
  const raw = obj(value);
  if (!raw) return null;
  const angle = need(raw.angle);
  const promise = need(raw.promise);
  const adds = strList(raw.adds, 10);
  if (!angle || !promise || adds.length === 0) return null;
  return {
    angle,
    promise,
    adds,
    proofRequired: strList(raw.proofRequired, 20),
    businessTieIn: str(raw.businessTieIn),
    targetReader: str(raw.targetReader),
  };
}
// ---------------------------------------------------------------------------
// 5. OUTLINE
// ---------------------------------------------------------------------------

export interface OutlineSection {
  heading: string;
  /** The reader question this section answers. A section without one is padding. */
  readerQuestion: string;
  points: string[];
  wordTarget: number;
}

export interface ArticleOutline {
  title: string;
  slug: string;
  /** The one-sentence answer, for the top of the page. */
  directAnswer: string;
  sections: OutlineSection[];
  /** Questions worth their own section, if the brief asked for an FAQ. */
  faq: string[];
}

export function readArticleOutline(value: unknown): ArticleOutline | null {
  const raw = obj(value);
  if (!raw) return null;
  const title = need(raw.title);
  const sections = rows(raw.sections, 24)
    .map((row) => ({
      heading: str(row.heading),
      readerQuestion: str(row.readerQuestion),
      points: strList(row.points, 12),
      wordTarget: int(row.wordTarget),
    }))
    .filter((row) => row.heading);
  if (!title || sections.length === 0) return null;
  return {
    title,
    slug: str(raw.slug),
    directAnswer: str(raw.directAnswer),
    sections,
    faq: strList(raw.faq, 12),
  };
}
// ---------------------------------------------------------------------------
// 6. DRAFT
//
// `wordCount` is measured from the HTML by the stage that wrote it, never taken
// from the model's own claim about how much it wrote.
// ---------------------------------------------------------------------------

export interface ArticleDraft {
  title: string;
  html: string;
  excerpt: string;
  wordCount: number;
  sectionCount: number;
  /** Sections the writer could not finish inside the time budget. */
  unfinished: string[];
}

export function readArticleDraft(value: unknown): ArticleDraft | null {
  const raw = obj(value);
  if (!raw) return null;
  const title = need(raw.title);
  const html = need(raw.html);
  if (!title || !html) return null;
  return {
    title,
    html,
    excerpt: str(raw.excerpt),
    wordCount: int(raw.wordCount),
    sectionCount: int(raw.sectionCount),
    unfinished: strList(raw.unfinished, 24),
  };
}
// ---------------------------------------------------------------------------
// 7. FACT CHECK
// ---------------------------------------------------------------------------

export type FactVerdict = "supported" | "unsupported" | "uncertain";

const VERDICTS: FactVerdict[] = ["supported", "unsupported", "uncertain"];

export interface FactCheckEntry {
  claim: string;
  verdict: FactVerdict;
  /** The source the claim was checked against, when there was one. */
  sourceUrl?: string;
  /** Why the verdict is what it is. Required — a bare verdict is not a check. */
  note: string;
  /** Where in the draft the claim appears, so it can be found and fixed. */
  location?: string;
}

export interface FactCheckReport {
  entries: FactCheckEntry[];
  unsupported: number;
  uncertain: number;
  /** Business facts the draft asserted that the profile could not prove. */
  unprovenBusinessFacts: string[];
}

export function readFactCheckReport(value: unknown): FactCheckReport | null {
  const raw = obj(value);
  if (!raw) return null;
  const entries: FactCheckEntry[] = rows(raw.entries, 60)
    .map((row) => ({
      claim: str(row.claim),
      verdict: (VERDICTS.includes(str(row.verdict) as FactVerdict)
        ? str(row.verdict)
        : "uncertain") as FactVerdict,
      sourceUrl: need(row.sourceUrl) ?? undefined,
      note: str(row.note),
      location: need(row.location) ?? undefined,
    }))
    .filter((row) => row.claim && row.note);
  return {
    entries,
    unsupported: entries.filter((row) => row.verdict === "unsupported").length,
    uncertain: entries.filter((row) => row.verdict === "uncertain").length,
    unprovenBusinessFacts: strList(raw.unprovenBusinessFacts, 20),
  };
}
// ---------------------------------------------------------------------------
// 8. SEO FUNDAMENTALS
//
// Measured, not judged by a model: lengths, counts and presence are all things a
// function can establish. The plan's rule is that a failure names itself, so each
// issue is a sentence about one specific thing.
// ---------------------------------------------------------------------------

export interface SeoField {
  value: string;
  length: number;
  ok: boolean;
  note?: string;
}

export interface SeoReport {
  title: SeoField;
  metaDescription: SeoField;
  slug: string;
  h1Count: number;
  /** Headings descend without skipping a level. */
  headingOrderOk: boolean;
  keywordInTitle: boolean;
  keywordInFirstParagraph: boolean;
  keywordInHeadings: number;
  imagesWithoutAlt: number;
  /** One sentence per problem, each naming the thing that is wrong. */
  issues: string[];
}

function readSeoField(value: unknown): SeoField {
  const raw = obj(value) ?? {};
  const text = str(raw.value);
  return {
    value: text,
    length: int(raw.length, text.length),
    ok: bool(raw.ok),
    note: need(raw.note) ?? undefined,
  };
}

export function readSeoReport(value: unknown): SeoReport | null {
  const raw = obj(value);
  if (!raw) return null;
  return {
    title: readSeoField(raw.title),
    metaDescription: readSeoField(raw.metaDescription),
    slug: str(raw.slug),
    h1Count: int(raw.h1Count),
    headingOrderOk: bool(raw.headingOrderOk),
    keywordInTitle: bool(raw.keywordInTitle),
    keywordInFirstParagraph: bool(raw.keywordInFirstParagraph),
    keywordInHeadings: int(raw.keywordInHeadings),
    imagesWithoutAlt: int(raw.imagesWithoutAlt),
    issues: strList(raw.issues, 30),
  };
}
// ---------------------------------------------------------------------------
// 9. LINKS
//
// `reachable` is the result of a request, not an opinion. A link nobody fetched
// is reported as unchecked rather than as working.
// ---------------------------------------------------------------------------

export interface InternalLink {
  url: string;
  anchor: string;
  /** Why this page is the right destination for this anchor. */
  reason: string;
}

export interface ExternalLink {
  url: string;
  anchor: string;
  publisher: string;
  /** Null when it was never fetched. */
  reachable: boolean | null;
  status?: number;
}

export interface InternalLinkReport {
  internal: InternalLink[];
  external: ExternalLink[];
  /** Links removed because their destination did not resolve. */
  removed: string[];
  /**
   * The draft with the links placed, when this stage changed the HTML.
   *
   * A stage never edits another stage's artifact, so the version with anchors in
   * it is stored here and `finalHtml` decides which version is the page.
   */
  html?: string;
  note?: string;
}

export function readInternalLinkReport(value: unknown): InternalLinkReport | null {
  const raw = obj(value);
  if (!raw) return null;
  return {
    internal: rows(raw.internal, 30)
      .map((row) => ({ url: str(row.url), anchor: str(row.anchor), reason: str(row.reason) }))
      .filter((row) => row.url && row.anchor),
    external: rows(raw.external, 30)
      .map((row) => ({
        url: str(row.url),
        anchor: str(row.anchor),
        publisher: str(row.publisher),
        reachable: typeof row.reachable === "boolean" ? row.reachable : null,
        status: num(row.status) ?? undefined,
      }))
      .filter((row) => /^https?:\/\//i.test(row.url)),
    removed: strList(raw.removed, 30),
    html: need(raw.html) ?? undefined,
    note: need(raw.note) ?? undefined,
  };
}
// ---------------------------------------------------------------------------
// 10. STRUCTURED DATA
//
// `notes` is where the honest caveats go. FAQPage stopped producing a rich result
// on 7 May 2026, so when the brief asks for an FAQ the schema stage emits it as
// structured data and says plainly that it is not a rich-result win.
// ---------------------------------------------------------------------------

export interface SchemaArtifact {
  /** The @type values actually emitted. */
  types: string[];
  /** The JSON-LD block, serialised, ready to place in the head. */
  jsonLd: string;
  notes: string[];
}

export function readSchemaArtifact(value: unknown): SchemaArtifact | null {
  const raw = obj(value);
  if (!raw) return null;
  const jsonLd = need(raw.jsonLd);
  if (!jsonLd) return null;
  return {
    types: strList(raw.types, 10),
    jsonLd,
    notes: strList(raw.notes, 10),
  };
}
// ---------------------------------------------------------------------------
// WHICH HTML IS THE PAGE
//
// Three stages can hand back a body: the writer writes it, the links stage places
// anchors in it, and in deep mode the editor rewrites parts of it. None of them
// edits another stage's artifact, so "the current page" is a question with a
// documented answer rather than whichever row was read last.
//
// Order is latest-wins, and each candidate has to actually contain a body — a
// stage that skipped or blocked contributes nothing.
// ---------------------------------------------------------------------------

/** The most recent HTML any stage produced, or "" when nothing has been written. */
export function finalHtml(artifacts: Record<string, unknown>): string {
  // `readEditPassReport` is declared further down: the edit pass is stage 21 and
  // its section is numbered where it runs, not where it is first read.
  const fromEditor = readEditPassReport(artifacts.editor)?.html;
  if (fromEditor && fromEditor.trim()) return fromEditor;
  const fromLinks = readInternalLinkReport(artifacts.links)?.html;
  if (fromLinks && fromLinks.trim()) return fromLinks;
  const fromWriter = readArticleDraft(artifacts.write)?.html;
  if (fromWriter && fromWriter.trim()) return fromWriter;
  return "";
}

// ---------------------------------------------------------------------------
// 11. CONTENT QUALITY SCORE
//
// Ours, and labelled as ours. It is not a Google score — Google publishes no such
// number — and nothing here promises a ranking. The weights are data because the
// editor shows them: a score whose workings are hidden is a score nobody can act
// on. Word count is absent by design, and adding it would be a bug: length is a
// planning input, not evidence of quality.
// ---------------------------------------------------------------------------

export interface ScoreDimension {
  key: string;
  label: string;
  weight: number;
  /** What a high score in this dimension actually means. */
  hint: string;
}

export const SCORE_DIMENSIONS: ScoreDimension[] = [
  { key: "intent", label: "Intent match", weight: 15, hint: "Answers the question the query asks, in the format it expects." },
  { key: "helpfulness", label: "Helpfulness", weight: 20, hint: "A reader can act on it without opening another tab." },
  { key: "differentiation", label: "Differentiation", weight: 15, hint: "Says something the ranking pages do not." },
  { key: "trust", label: "Trust", weight: 15, hint: "Named experience, sourced claims, no invented proof." },
  { key: "relevance", label: "Business relevance", weight: 15, hint: "Specific to this business, not generic to the industry." },
  { key: "completeness", label: "Completeness", weight: 7, hint: "Covers what the intent stage said the reader must know." },
  { key: "seo", label: "SEO fundamentals", weight: 5, hint: "Title, headings, meta and structure in place, not stuffed." },
  { key: "readability", label: "Readability", weight: 5, hint: "Sentences and sections a person reads without effort." },
  { key: "linking", label: "Internal linking", weight: 1.5, hint: "Links to pages that exist and belong here." },
  { key: "media", label: "Media and UX", weight: 1.5, hint: "Images that earn their place, with real alt text." },
];

const DIMENSION_KEYS = SCORE_DIMENSIONS.map((d) => d.key);
export interface ScoredDimension {
  key: string;
  /** 0-100 for this dimension alone. */
  score: number;
  /** Why it scored that. Required: an unexplained number is not a finding. */
  note: string;
}

export interface QualityScoreArtifact {
  /** The weighted total, 0-100. Computed here, never taken from the model. */
  total: number;
  /** Reported on its own as well, because averaging it away hides a copy. */
  differentiation: number;
  trust: number;
  relevance: number;
  dimensions: ScoredDimension[];
  /** The single change that would raise the total the most. */
  biggestGap: string;
}

/** The weighted total. Missing dimensions score zero rather than being dropped. */
export function computeQualityTotal(dimensions: ScoredDimension[]): number {
  const byKey = new Map(dimensions.map((d) => [d.key, d.score]));
  const total = SCORE_DIMENSIONS.reduce((sum, dimension) => {
    const score = byKey.get(dimension.key) ?? 0;
    return sum + (Math.min(100, Math.max(0, score)) * dimension.weight) / 100;
  }, 0);
  return Math.round(total);
}

export function readQualityScore(value: unknown): QualityScoreArtifact | null {
  const raw = obj(value);
  if (!raw) return null;
  const dimensions: ScoredDimension[] = rows(raw.dimensions, 20)
    .map((row) => ({
      key: str(row.key),
      score: Math.min(100, Math.max(0, int(row.score))),
      note: str(row.note),
    }))
    .filter((row) => DIMENSION_KEYS.includes(row.key));
  if (dimensions.length === 0) return null;
  const pick = (key: string) => dimensions.find((d) => d.key === key)?.score ?? 0;
  return {
    total: computeQualityTotal(dimensions),
    differentiation: pick("differentiation"),
    trust: pick("trust"),
    relevance: pick("relevance"),
    dimensions,
    biggestGap: str(raw.biggestGap),
  };
}
// ---------------------------------------------------------------------------
// 12. PUBLISH GATE
//
// Twenty checks, and every failure names itself. "SEO failed" is exactly what
// this replaces: a blocker says which check, on what, and what would clear it.
// ---------------------------------------------------------------------------

export interface GateCheck {
  key: string;
  label: string;
  passed: boolean;
  /** Absent when it passed. When it failed, the specific reason. */
  blocker?: string;
  /** A check that could not be performed is neither a pass nor a failure. */
  skipped?: boolean;
}

export interface PublishGateReport {
  passed: boolean;
  checks: GateCheck[];
  /** The failures, in the order a person should fix them. */
  blockers: string[];
}

export function readPublishGateReport(value: unknown): PublishGateReport | null {
  const raw = obj(value);
  if (!raw) return null;
  const checks: GateCheck[] = rows(raw.checks, 40)
    .map((row) => ({
      key: str(row.key),
      label: str(row.label),
      passed: bool(row.passed),
      blocker: need(row.blocker) ?? undefined,
      skipped: row.skipped === true ? true : undefined,
    }))
    .filter((row) => row.key && row.label);
  if (checks.length === 0) return null;
  const blockers = checks
    .filter((check) => !check.passed && !check.skipped)
    .map((check) => check.blocker || `${check.label} did not pass.`);
  return { passed: blockers.length === 0, checks, blockers };
}
// ---------------------------------------------------------------------------
// 13. CONTENT INVENTORY
//
// The crawl, as it happened. `pages` were fetched and read; `discovered` counts
// the URLs the crawl saw and had no budget for, so the panel can say "48 found,
// 12 read" instead of implying the site has twelve pages. `unreadable` keeps a
// reason per URL, because "the site has no blog" and "the blog returned 403" are
// different facts and only one of them is about the site's content.
// ---------------------------------------------------------------------------

export interface InventoryPage {
  url: string;
  title: string;
  /** The page's own h1/h2/h3 text, for the gap and overlap comparisons. */
  headings: string[];
  /** Counted off the fetched text. Never a model's estimate. */
  wordCount: number;
  /** What it is about, in a few words, from its title and headings. */
  topic: string;
  /** Whether the links stage may point an anchor at it. */
  linkTarget: boolean;
}

export interface ContentInventory {
  /** The origin actually crawled. */
  site: string;
  pages: InventoryPage[];
  /** URLs the crawl found. Never fewer than the pages it read. */
  discovered: number;
  unreadable: { url: string; reason: string }[];
  /** Topics the site already covers, de-duplicated across the pages read. */
  topics: string[];
  /** Present when the crawl could not run, or ran and found nothing. */
  note?: string;
}
export function readContentInventory(value: unknown): ContentInventory | null {
  const raw = obj(value);
  if (!raw) return null;
  const pages: InventoryPage[] = rows(raw.pages, 120)
    .map((row) => ({
      url: str(row.url),
      title: str(row.title),
      headings: strList(row.headings, 40),
      wordCount: int(row.wordCount),
      topic: str(row.topic),
      linkTarget: bool(row.linkTarget),
    }))
    .filter((row) => /^https?:\/\//i.test(row.url));
  return {
    site: str(raw.site),
    pages,
    // A crawl that read more pages than it found is a counting bug, not a fact.
    discovered: Math.max(int(raw.discovered), pages.length),
    unreadable: rows(raw.unreadable, 60)
      .map((row) => ({ url: str(row.url), reason: str(row.reason) }))
      .filter((row) => row.url && row.reason),
    topics: strList(raw.topics, 60),
    note: need(raw.note) ?? undefined,
  };
}
// ---------------------------------------------------------------------------
// 14. PAGE TYPE
//
// Not every query wants an article. This is the one stage allowed to conclude
// that the right move is to improve a page the site already has, which is why
// `existingUrl` is required for that choice: "update the existing page" with no
// page named is advice nobody can act on.
// ---------------------------------------------------------------------------

export type PageTypeChoice = "article" | "service_page" | "comparison" | "update_existing";

const PAGE_TYPES: PageTypeChoice[] = [
  "article",
  "service_page",
  "comparison",
  "update_existing",
];

export interface PageTypeDecision {
  choice: PageTypeChoice;
  /** Why this format, for this query. */
  reason: string;
  /** The page to improve. Required when the choice is `update_existing`. */
  existingUrl?: string;
  /** What this format must contain to answer the query. The outline reads it. */
  requiredElements: string[];
}

export function readPageTypeDecision(value: unknown): PageTypeDecision | null {
  const raw = obj(value);
  if (!raw) return null;
  const choice = PAGE_TYPES.includes(str(raw.choice) as PageTypeChoice)
    ? (str(raw.choice) as PageTypeChoice)
    : null;
  const reason = need(raw.reason);
  if (!choice || !reason) return null;
  const stated = need(raw.existingUrl);
  const existingUrl = stated && /^https?:\/\//i.test(stated) ? stated : undefined;
  if (choice === "update_existing" && !existingUrl) return null;
  return { choice, reason, existingUrl, requiredElements: strList(raw.requiredElements, 16) };
}
// ---------------------------------------------------------------------------
// 15. COVERAGE GAPS
//
// The first page, sorted into four bands. `counts` is derived from the list so a
// summary line cannot disagree with the table under it, and `pagesCompared` is
// on the artifact because "nothing is missing" read off zero pages is not a
// finding about the topic — it is a finding about the crawl.
// ---------------------------------------------------------------------------

export type GapBand = "common" | "weak" | "missing" | "opportunity";

const GAP_BANDS: GapBand[] = ["common", "weak", "missing", "opportunity"];

export interface GapTopic {
  topic: string;
  /**
   * common      — every ranking page covers it, so leaving it out is a hole
   * weak        — covered, but thinly or wrongly
   * missing     — the reader needs it and nobody covers it
   * opportunity — nobody covers it and this business can answer it first-hand
   */
  band: GapBand;
  /** The ranking pages it was observed on. Empty for `missing`. */
  seenOn: string[];
  note: string;
}

export interface ContentGapReport {
  topics: GapTopic[];
  /** Counted from `topics`, never reported separately. */
  counts: Record<GapBand, number>;
  /** Ranking pages the bands were read from. Zero means nothing was compared. */
  pagesCompared: number;
}
export function readContentGapReport(value: unknown): ContentGapReport | null {
  const raw = obj(value);
  if (!raw) return null;
  const topics: GapTopic[] = rows(raw.topics, 60)
    .map((row) => ({
      topic: str(row.topic),
      band: (GAP_BANDS.includes(str(row.band) as GapBand)
        ? str(row.band)
        : "common") as GapBand,
      seenOn: strList(row.seenOn, 12).filter((url) => /^https?:\/\//i.test(url)),
      note: str(row.note),
    }))
    .filter((row) => row.topic && row.note);
  if (topics.length === 0) return null;
  const counts: Record<GapBand, number> = { common: 0, weak: 0, missing: 0, opportunity: 0 };
  for (const row of topics) counts[row.band]++;
  return { topics, counts, pagesCompared: int(raw.pagesCompared) };
}
// ---------------------------------------------------------------------------
// 16. TOPIC OPPORTUNITY
//
// Scored against the business, and only on things this pipeline can observe.
// There is deliberately no search-volume factor and no keyword-difficulty score:
// this build has no volume source, and a number invented for one would be the
// most believable lie on the screen. Every factor below is answerable from the
// business profile, the live first page, or the site's own inventory.
// ---------------------------------------------------------------------------

export interface OpportunityFactor {
  key: string;
  label: string;
  weight: number;
  hint: string;
}

export const OPPORTUNITY_FACTORS: OpportunityFactor[] = [
  { key: "business_fit", label: "Business fit", weight: 30, hint: "The topic is about something this business is actually paid to do." },
  { key: "buyer_proximity", label: "Buyer proximity", weight: 25, hint: "The reader is near a decision, not three steps away from one." },
  { key: "first_hand", label: "First-hand answer", weight: 20, hint: "This business can answer it from its own work, not from other pages." },
  { key: "room", label: "Room on the page", weight: 15, hint: "What already ranks leaves something worth adding." },
  { key: "durability", label: "Durability", weight: 10, hint: "The answer will still be true next year." },
];

const OPPORTUNITY_KEYS = OPPORTUNITY_FACTORS.map((factor) => factor.key);

export type OpportunityVerdict = "write" | "later" | "skip";

const OPPORTUNITY_VERDICTS: OpportunityVerdict[] = ["write", "later", "skip"];

export interface ScoredOpportunityFactor {
  key: string;
  score: number;
  /** Why it scored that. An unexplained number is not a finding. */
  note: string;
}
export interface TopicOpportunity {
  /** Weighted, computed here. A model's own total is discarded. */
  total: number;
  factors: ScoredOpportunityFactor[];
  verdict: OpportunityVerdict;
  reason: string;
  /** What would make this topic worth more, specifically. */
  raise: string[];
}

/** The weighted total. A factor nobody scored counts zero rather than dropping out. */
export function computeOpportunityTotal(factors: ScoredOpportunityFactor[]): number {
  const byKey = new Map(factors.map((factor) => [factor.key, factor.score]));
  return Math.round(
    OPPORTUNITY_FACTORS.reduce(
      (sum, factor) => sum + (pct(byKey.get(factor.key) ?? 0) * factor.weight) / 100,
      0
    )
  );
}

export function readTopicOpportunity(value: unknown): TopicOpportunity | null {
  const raw = obj(value);
  if (!raw) return null;
  const factors: ScoredOpportunityFactor[] = rows(raw.factors, 12)
    .map((row) => ({ key: str(row.key), score: pct(row.score), note: str(row.note) }))
    .filter((row) => OPPORTUNITY_KEYS.includes(row.key) && row.note);
  const reason = need(raw.reason);
  if (factors.length === 0 || !reason) return null;
  return {
    total: computeOpportunityTotal(factors),
    factors,
    verdict: (OPPORTUNITY_VERDICTS.includes(str(raw.verdict) as OpportunityVerdict)
      ? str(raw.verdict)
      : "later") as OpportunityVerdict,
    reason,
    raise: strList(raw.raise, 10),
  };
}
// ---------------------------------------------------------------------------
// 17. RESEARCH
//
// A finding without a source is not a finding, so the guard drops it. The URLs
// kept here are the ones grounding handed the model — a URL it typed into a
// sentence is a claim, a URL in the grounding metadata is a document it was
// given — and the evidence gate goes and fetches each one, so a fabricated
// address fails a request rather than reaching the page.
// ---------------------------------------------------------------------------

export type ResearchSourceType =
  | "primary"
  | "official"
  | "journalism"
  | "vendor"
  | "forum"
  | "unknown";

const SOURCE_TYPES: ResearchSourceType[] = [
  "primary",
  "official",
  "journalism",
  "vendor",
  "forum",
  "unknown",
];

export interface ResearchFinding {
  /** The fact, as the article would state it. */
  statement: string;
  sourceUrl: string;
  /** The source page's own title, as grounding or the fetch reported it. */
  sourceTitle: string;
  publisher: string;
  /** The passage the statement rests on, quoted, so a person can check it. */
  excerpt: string;
  /** The date the source itself carries, as it stated it. */
  publishedAt?: string;
  sourceType: ResearchSourceType;
  /** True only when the page was fetched and answered. Never assumed. */
  reachable: boolean;
  fetchError?: string;
}
export interface ResearchDossier {
  findings: ResearchFinding[];
  /** Every distinct source behind the findings. Derived, not restated. */
  sourceUrls: string[];
  /** The searches actually issued, so a run can be audited afterwards. */
  queries: string[];
  /** What the strategy asked to prove and nothing was found for. */
  unfound: string[];
  note?: string;
}

export function readResearchDossier(value: unknown): ResearchDossier | null {
  const raw = obj(value);
  if (!raw) return null;
  const findings: ResearchFinding[] = rows(raw.findings, 60)
    .map((row) => ({
      statement: str(row.statement),
      sourceUrl: str(row.sourceUrl),
      sourceTitle: str(row.sourceTitle) || str(row.title),
      publisher: str(row.publisher),
      excerpt: str(row.excerpt),
      publishedAt: dateText(row.publishedAt),
      sourceType: (SOURCE_TYPES.includes(str(row.sourceType) as ResearchSourceType)
        ? str(row.sourceType)
        : "unknown") as ResearchSourceType,
      reachable: bool(row.reachable),
      fetchError: need(row.fetchError) ?? undefined,
    }))
    // A statement with no source is an assertion, and this stage exists to
    // produce the opposite of one.
    .filter((row) => row.statement && /^https?:\/\//i.test(row.sourceUrl));
  return {
    findings,
    sourceUrls: Array.from(new Set(findings.map((row) => row.sourceUrl))),
    queries: strList(raw.queries, 20),
    unfound: strList(raw.unfound, 20),
    note: need(raw.note) ?? undefined,
  };
}
// ---------------------------------------------------------------------------
// 18. EVIDENCE
//
// Five checks per claim, and `status` is computed from them rather than read.
// That is the whole mechanism: a model can mark a claim "allowed" and leave
// `sourceSupports` false, and the guard turns that into blocked. The writer is
// handed `allowedClaims` and nothing else, so a blocked claim cannot reach the
// draft by sitting next to one that passed.
// ---------------------------------------------------------------------------

export type EvidenceKind =
  | "statistic"
  | "fact"
  | "quote"
  | "recommendation"
  | "business_fact";

const EVIDENCE_KINDS: EvidenceKind[] = [
  "statistic",
  "fact",
  "quote",
  "recommendation",
  "business_fact",
];

export type EvidenceStatus = "allowed" | "blocked";

export interface EvidenceChecks {
  sourceExists: boolean;
  sourceReachable: boolean;
  /** The source says this, not merely something adjacent to it. */
  sourceSupports: boolean;
  /** Recent enough to be stated as current, for a claim of this kind. */
  current: boolean;
  trustworthy: boolean;
}

/** All five, or blocked. There is no partial pass. */
export function evidenceStatusFrom(checks: EvidenceChecks): EvidenceStatus {
  return checks.sourceExists &&
    checks.sourceReachable &&
    checks.sourceSupports &&
    checks.current &&
    checks.trustworthy
    ? "allowed"
    : "blocked";
}
export interface EvidenceDecision {
  claim: string;
  kind: EvidenceKind;
  checks: EvidenceChecks;
  /** `allowed` only when all five checks passed. Computed, never read. */
  status: EvidenceStatus;
  /** Which check failed and why. */
  reason: string;
  sourceUrl?: string;
  publisher?: string;
  excerpt?: string;
}

export interface EvidenceReport {
  decisions: EvidenceDecision[];
  allowed: number;
  blocked: number;
  /** The only claims the writer receives. */
  allowedClaims: string[];
  /** What the strategy committed to proving and nothing could support. */
  unproven: string[];
}

/** Tolerant of a flat payload, but every boolean still has to arrive as `true`. */
function readEvidenceChecks(value: unknown, fallback: unknown): EvidenceChecks {
  const raw = obj(value) ?? obj(fallback) ?? {};
  return {
    sourceExists: bool(raw.sourceExists),
    sourceReachable: bool(raw.sourceReachable),
    sourceSupports: bool(raw.sourceSupports),
    current: bool(raw.current),
    trustworthy: bool(raw.trustworthy),
  };
}
export function readEvidenceReport(value: unknown): EvidenceReport | null {
  const raw = obj(value);
  if (!raw) return null;
  const decisions: EvidenceDecision[] = rows(raw.decisions, 80)
    .map((row) => {
      const checks = readEvidenceChecks(row.checks, row);
      return {
        claim: str(row.claim),
        kind: (EVIDENCE_KINDS.includes(str(row.kind) as EvidenceKind)
          ? str(row.kind)
          : "fact") as EvidenceKind,
        checks,
        status: evidenceStatusFrom(checks),
        reason: str(row.reason),
        sourceUrl: need(row.sourceUrl) ?? undefined,
        publisher: need(row.publisher) ?? undefined,
        excerpt: need(row.excerpt) ?? undefined,
      };
    })
    .filter((row) => row.claim);
  const allowed = decisions.filter((row) => row.status === "allowed");
  return {
    decisions,
    allowed: allowed.length,
    blocked: decisions.length - allowed.length,
    allowedClaims: allowed.map((row) => row.claim),
    unproven: strList(raw.unproven, 20),
  };
}
// ---------------------------------------------------------------------------
// 19. DIFFERENTIATION
//
// Not a plagiarism check, and the artifact carries a field that says so wherever
// the number is shown. What it measures is overlap with the specific pages this
// run read — a real and useful figure, and not a claim about the rest of the web,
// about copyright, or about any detector. `comparedAgainst` travels with it for
// the same reason: distinctiveness computed against zero pages is not a score.
// ---------------------------------------------------------------------------

export const ORIGINALITY_CAVEAT =
  "Measured against the pages this run actually read, not against the web. It is not a plagiarism check and not a detector score.";

export type OverlapKind = "wording" | "point" | "structure";

const OVERLAP_KINDS: OverlapKind[] = ["wording", "point", "structure"];

export interface OverlapFinding {
  /** The passage from this draft. */
  passage: string;
  /** The page that already says it. */
  url: string;
  /** What that page says. */
  theirs: string;
  kind: OverlapKind;
}

export interface OriginalityReport {
  /** 0-100: how much of this draft is not already on the pages read. */
  distinctiveness: number;
  /** Pages the draft was compared against. Zero means nothing was compared. */
  comparedAgainst: number;
  overlaps: OverlapFinding[];
  /** What this draft says that none of those pages do. */
  unique: string[];
  /** The one rewrite that would raise the number most. */
  biggestOverlap: string;
  /** What the number is and is not. Always present. */
  caveat: string;
}
export function readOriginalityReport(value: unknown): OriginalityReport | null {
  const raw = obj(value);
  if (!raw) return null;
  const overlaps: OverlapFinding[] = rows(raw.overlaps, 40)
    .map((row) => ({
      passage: str(row.passage),
      url: str(row.url),
      theirs: str(row.theirs),
      kind: (OVERLAP_KINDS.includes(str(row.kind) as OverlapKind)
        ? str(row.kind)
        : "point") as OverlapKind,
    }))
    .filter((row) => row.passage && /^https?:\/\//i.test(row.url));
  return {
    distinctiveness: pct(raw.distinctiveness),
    comparedAgainst: int(raw.comparedAgainst),
    overlaps,
    unique: strList(raw.unique, 20),
    biggestOverlap: str(raw.biggestOverlap),
    // Ours, not the model's: the caveat describes how the number was produced,
    // so it is stated here rather than left to a prompt to remember.
    caveat: need(raw.caveat) ?? ORIGINALITY_CAVEAT,
  };
}
// ---------------------------------------------------------------------------
// 20. TRUST SIGNALS
//
// Present or absent, each with the specific thing found or missing. The score is
// the weighted sum of what is present, computed here — a model asked for a trust
// score returns a flattering one, and a page's trustworthiness is exactly the
// wrong thing to take on trust.
//
// `unsupportedExperience` is the dangerous list. A draft that says "we have
// installed 4,000 floors" when nothing established that is a false statement
// about a real company, so the publish gate blocks on it.
// ---------------------------------------------------------------------------

export interface TrustSignalSpec {
  key: string;
  label: string;
  weight: number;
  hint: string;
}

export const TRUST_SIGNALS: TrustSignalSpec[] = [
  { key: "experience", label: "First-hand experience", weight: 25, hint: "Something only someone who has done the work would write." },
  { key: "expertise", label: "Named expertise", weight: 20, hint: "A person or a qualification a reader can look up." },
  { key: "sourcing", label: "Sourced claims", weight: 20, hint: "Numbers and rules carry the source they came from." },
  { key: "specificity", label: "Specifics", weight: 15, hint: "Real figures, materials and timeframes, not ranges that fit anything." },
  { key: "transparency", label: "Transparency", weight: 10, hint: "Says what it does not know and what depends on seeing the site." },
  { key: "recency", label: "Currency", weight: 10, hint: "Nothing stated as current that is out of date." },
];

const TRUST_KEYS = TRUST_SIGNALS.map((signal) => signal.key);

export interface TrustSignal {
  key: string;
  present: boolean;
  /** What was found, or what is missing. Specific either way. */
  note: string;
  /** The heading it was found under, when it was found. */
  location?: string;
}
export interface TrustReport {
  /** Weighted over the signals present. Computed, never the model's number. */
  score: number;
  signals: TrustSignal[];
  /** Experience the draft claims that the business facts do not establish. */
  unsupportedExperience: string[];
  /** What to add, strongest first. */
  missing: string[];
}

/** The weighted total of the signals actually present. */
export function computeTrustScore(signals: TrustSignal[]): number {
  const present = new Set(signals.filter((signal) => signal.present).map((signal) => signal.key));
  return Math.round(
    TRUST_SIGNALS.reduce((sum, spec) => sum + (present.has(spec.key) ? spec.weight : 0), 0)
  );
}

export function readTrustReport(value: unknown): TrustReport | null {
  const raw = obj(value);
  if (!raw) return null;
  const signals: TrustSignal[] = rows(raw.signals, 12)
    .map((row) => ({
      key: str(row.key),
      present: bool(row.present),
      note: str(row.note),
      location: need(row.location) ?? undefined,
    }))
    .filter((row) => TRUST_KEYS.includes(row.key) && row.note);
  if (signals.length === 0) return null;
  return {
    score: computeTrustScore(signals),
    signals,
    unsupportedExperience: strList(raw.unsupportedExperience, 20),
    missing: strList(raw.missing, 12),
  };
}
// ---------------------------------------------------------------------------
// 21. OVERLAP WITH THE SITE'S OWN PAGES
//
// Two of a site's own URLs chasing one query is a self-inflicted problem, and the
// honest fix is sometimes "do not publish this, improve that instead". So the
// verdict is allowed to be `update_instead`, and the pages it refers to are named.
//
// `compared` is on the artifact because this stage reads the inventory: "nothing
// overlaps", from a crawl that read nothing, is a fact about the crawl.
// ---------------------------------------------------------------------------

export type OverlapAdvice = "publish" | "update_instead" | "differentiate" | "internal_link";

const OVERLAP_ADVICE: OverlapAdvice[] = [
  "publish",
  "update_instead",
  "differentiate",
  "internal_link",
];

export interface OverlappingPage {
  url: string;
  title: string;
  /** 0-100 — how much of this query that page already answers. */
  overlap: number;
  advice: OverlapAdvice;
  reason: string;
}

export interface CannibalizationReport {
  /** Sorted by overlap, worst first. */
  pages: OverlappingPage[];
  /** The site's pages compared. Zero means the inventory was empty. */
  compared: number;
  /** Read off `pages`, so it cannot disagree with the list. */
  highestOverlap: number;
  /** What to do with this draft. */
  verdict: OverlapAdvice;
  reason: string;
}
export function readCannibalizationReport(value: unknown): CannibalizationReport | null {
  const raw = obj(value);
  if (!raw) return null;
  const reason = need(raw.reason);
  if (!reason) return null;
  const pages: OverlappingPage[] = rows(raw.pages, 40)
    .map((row) => ({
      url: str(row.url),
      title: str(row.title),
      overlap: pct(row.overlap),
      advice: (OVERLAP_ADVICE.includes(str(row.advice) as OverlapAdvice)
        ? str(row.advice)
        : "differentiate") as OverlapAdvice,
      reason: str(row.reason),
    }))
    .filter((row) => /^https?:\/\//i.test(row.url) && row.reason)
    .sort((a, b) => b.overlap - a.overlap);
  return {
    pages,
    compared: Math.max(int(raw.compared), pages.length),
    highestOverlap: pages.length ? pages[0].overlap : 0,
    verdict: (OVERLAP_ADVICE.includes(str(raw.verdict) as OverlapAdvice)
      ? str(raw.verdict)
      : "publish") as OverlapAdvice,
    reason,
  };
}
// ---------------------------------------------------------------------------
// 22. MEDIA PLAN
//
// A plan, not pictures: this stage decides what each image has to show and what
// its alt text says, and the media it names is rendered or fetched elsewhere.
// `noImage` exists so a section can be deliberately left plain — the previous
// build put an image under every heading, which is how a page ends up with six
// stock photographs of handshakes.
//
// `alt` is written for a reader who cannot see the image. A keyword in the alt
// attribute of a decorative photograph helps nobody and is an accessibility
// failure, so the guard drops a planned image that has no real alt text.
// ---------------------------------------------------------------------------

export type MediaRole = "hero" | "section";

export interface PlannedImage {
  role: MediaRole;
  /** The heading it belongs beside. Empty for the hero. */
  heading: string;
  /** What the section is clearer with than without. */
  purpose: string;
  /** The rendering prompt, when it is generated. */
  prompt: string;
  /** What a reader who cannot see it needs to be told. */
  alt: string;
  /** Library search terms, when it is not generated. */
  searchTerms: string[];
}

export interface PlannedVideo {
  purpose: string;
  searchTerms: string[];
}

export interface MediaPlan {
  images: PlannedImage[];
  /** Only when the topic genuinely needs one. */
  video?: PlannedVideo;
  /** Sections deliberately left without an image, and why. */
  noImage: string[];
  note?: string;
}
export function readMediaPlan(value: unknown): MediaPlan | null {
  const raw = obj(value);
  if (!raw) return null;
  const images: PlannedImage[] = rows(raw.images, 24)
    .map((row) => ({
      role: (str(row.role) === "hero" ? "hero" : "section") as MediaRole,
      heading: str(row.heading),
      purpose: str(row.purpose),
      prompt: str(row.prompt),
      alt: str(row.alt),
      searchTerms: strList(row.searchTerms, 8),
    }))
    // An image with no alt text and no stated purpose is not planned, only wanted.
    .filter((row) => row.alt && row.purpose);
  const video = obj(raw.video);
  const videoPurpose = video ? need(video.purpose) : null;
  return {
    images,
    video: videoPurpose
      ? { purpose: videoPurpose, searchTerms: strList(video?.searchTerms, 8) }
      : undefined,
    noImage: strList(raw.noImage, 24),
    note: need(raw.note) ?? undefined,
  };
}
// ---------------------------------------------------------------------------
// 23. EDIT PASS
//
// The last stage allowed to change the body, which is why `finalHtml` prefers its
// HTML over the links stage's and the writer's. The counts are measured on both
// sides, and `leftAlone` is where the pass records what it chose not to touch — a
// repetition that cannot be cut without losing the point is a judgement worth
// stating rather than a silent omission.
// ---------------------------------------------------------------------------

export type EditKind = "cut" | "tighten" | "clarify" | "dedupe" | "claim";

const EDIT_KINDS: EditKind[] = ["cut", "tighten", "clarify", "dedupe", "claim"];

export interface EditChange {
  kind: EditKind;
  /** The heading it happened under. */
  location: string;
  note: string;
}

export interface EditPassReport {
  /** The edited body, when the pass changed it. */
  html?: string;
  changes: EditChange[];
  /** Measured off the HTML on each side, never reported by the model. */
  wordCountBefore: number;
  wordCountAfter: number;
  /** Problems it found and deliberately did not change, with the reason. */
  leftAlone: string[];
}

export function readEditPassReport(value: unknown): EditPassReport | null {
  const raw = obj(value);
  if (!raw) return null;
  return {
    html: need(raw.html) ?? undefined,
    changes: rows(raw.changes, 60)
      .map((row) => ({
        kind: (EDIT_KINDS.includes(str(row.kind) as EditKind)
          ? str(row.kind)
          : "clarify") as EditKind,
        location: str(row.location),
        note: str(row.note),
      }))
      .filter((row) => row.note),
    wordCountBefore: int(raw.wordCountBefore),
    wordCountAfter: int(raw.wordCountAfter),
    leftAlone: strList(raw.leftAlone, 20),
  };
}
// ---------------------------------------------------------------------------
// 24-25. THE EVIDENCE LEDGER, AS ROWS
//
// The research and evidence stages write two tables as well as their artifacts,
// because provenance has to outlive the run: months after publishing, the
// question is "where did this number come from", and a JSON blob inside a stage
// row cannot be queried for it.
//
// These two guards are what the Evidence panel reads. They live here, beside the
// artifact guards, because that panel is a client component and a row crossing
// that boundary is as untrusted as anything else that does.
// ---------------------------------------------------------------------------

export interface ResearchSourceRecord {
  id: string;
  url: string;
  title: string;
  publisher: string;
  /** The date the source carries. */
  publishedAt?: string;
  /** When this run read it. */
  fetchedAt?: string;
  excerpt: string;
  sourceType: ResearchSourceType;
  reachable: boolean;
  fetchError?: string;
}

export interface EvidenceClaimRecord {
  id: string;
  claim: string;
  kind: EvidenceKind;
  checks: EvidenceChecks;
  status: EvidenceStatus;
  reason: string;
  /** Where in the draft it ended up, once the writer used it. */
  usedIn?: string;
  /** The source row it was checked against. */
  sourceId?: string;
}

export interface EvidenceLedger {
  sources: ResearchSourceRecord[];
  claims: EvidenceClaimRecord[];
  /** Counted from `claims`, so a header cannot disagree with the table. */
  allowed: number;
  blocked: number;
}
export function readEvidenceLedger(value: unknown): EvidenceLedger | null {
  const raw = obj(value);
  if (!raw) return null;
  const sources: ResearchSourceRecord[] = rows(raw.sources, 120)
    .map((row) => ({
      id: str(row.id),
      url: str(row.url),
      title: str(row.title),
      publisher: str(row.publisher),
      publishedAt: dateText(row.publishedAt),
      fetchedAt: dateText(row.fetchedAt),
      excerpt: str(row.excerpt),
      sourceType: (SOURCE_TYPES.includes(str(row.sourceType) as ResearchSourceType)
        ? str(row.sourceType)
        : "unknown") as ResearchSourceType,
      reachable: bool(row.reachable),
      fetchError: need(row.fetchError) ?? undefined,
    }))
    .filter((row) => row.id && /^https?:\/\//i.test(row.url));
  const claims: EvidenceClaimRecord[] = rows(raw.claims, 200)
    .map((row) => {
      const checks = readEvidenceChecks(row.checks, row);
      return {
        id: str(row.id),
        claim: str(row.claim),
        kind: (EVIDENCE_KINDS.includes(str(row.kind) as EvidenceKind)
          ? str(row.kind)
          : "fact") as EvidenceKind,
        checks,
        // Recomputed from the five booleans on read, so a row written by an
        // older build cannot show as allowed on checks it never passed.
        status: evidenceStatusFrom(checks),
        reason: str(row.reason),
        usedIn: need(row.usedIn) ?? undefined,
        sourceId: need(row.sourceId) ?? undefined,
      };
    })
    .filter((row) => row.id && row.claim);
  const allowed = claims.filter((row) => row.status === "allowed").length;
  return { sources, claims, allowed, blocked: claims.length - allowed };
}

