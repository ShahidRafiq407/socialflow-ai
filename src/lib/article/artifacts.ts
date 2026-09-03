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

