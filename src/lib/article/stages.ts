/**
 * THE PIPELINE, AS DATA
 *
 * Twenty-three stages, in one list, read by both sides: the server advances a run
 * by looking the next stage up here, and the client draws the progress list from
 * the same array. That is the whole reason this file exists — the previous build
 * kept the stage names in the UI as JSX and the work in the route as if-branches,
 * so the screen could claim a step the server had never run.
 *
 * No imports. This is read by a client component, so it must stay free of Prisma,
 * model SDKs and anything that reaches a network.
 */

export type ArticleRunMode = "quick" | "deep";

export type ArticleRunStatus = "idle" | "running" | "blocked" | "done" | "failed";

export type ArticleStageKey =
  | "business"
  | "inventory"
  | "content_type"
  | "intent"
  | "serp"
  | "gaps"
  | "opportunity"
  | "strategy"
  | "outline"
  | "research"
  | "evidence_gate"
  | "write"
  | "originality"
  | "factcheck"
  | "eeat"
  | "seo"
  | "cannibalization"
  | "links"
  | "media"
  | "schema"
  | "editor"
  | "score"
  | "gate";

export interface ArticleStageSpec {
  key: ArticleStageKey;
  /** Position in the deep pipeline, 1-based, as the plan numbers them. */
  order: number;
  /** Two or three words, for the progress list. */
  label: string;
  /** One line, present tense: what this stage does. Shown under the label. */
  detail: string;
  /** In the quick run as well as the deep one. */
  quick: boolean;
  /**
   * The row this stage materialises, where the plan gives it one. The stage's own
   * JSON always lands on `ArticleStage.artifact` regardless.
   */
  record?: string;
}

export const ARTICLE_STAGES: ArticleStageSpec[] = [
  {
    key: "business",
    order: 1,
    label: "Business facts",
    detail: "Reads the site and the Brand DNA, and lists what it could not prove.",
    quick: true,
    record: "BusinessProfile",
  },
  {
    key: "inventory",
    order: 2,
    label: "Content inventory",
    detail: "Crawls the connected site for pages, topics and internal-link targets.",
    quick: false,
    record: "ContentInventory",
  },
  {
    key: "content_type",
    order: 3,
    label: "Page type",
    detail: "Decides whether this should be an article, a service page, or an update to a page that already exists.",
    quick: false,
  },
  {
    key: "intent",
    order: 4,
    label: "Search intent",
    detail: "Names the reader's problem and what they must know by the last line.",
    quick: true,
    record: "SearchIntent",
  },
  {
    key: "serp",
    order: 5,
    label: "Live results",
    detail: "Reads what already ranks: headings, questions, formats, entities.",
    quick: true,
    record: "SERPResearch",
  },
  {
    key: "gaps",
    order: 6,
    label: "Coverage gaps",
    detail: "Sorts the first page into common, weak, missing and opportunity.",
    quick: false,
    record: "ContentGap",
  },
  {
    key: "opportunity",
    order: 7,
    label: "Opportunity",
    detail: "Scores the topic against the business, not just against the keyword.",
    quick: false,
    record: "TopicOpportunity",
  },
  {
    key: "strategy",
    order: 8,
    label: "Angle",
    detail: "Fixes the angle, the promise, and what this page adds that the others do not.",
    quick: true,
    record: "ArticleStrategy",
  },
  {
    key: "outline",
    order: 9,
    label: "Outline",
    detail: "Plans every section against the reader's question.",
    quick: true,
    record: "ArticleOutline",
  },
  {
    key: "research",
    order: 10,
    label: "Research",
    detail: "Finds sources, and records the URL, the publisher and the date for each.",
    quick: false,
    record: "ResearchSource",
  },
  {
    key: "evidence_gate",
    order: 11,
    label: "Evidence check",
    detail: "Blocks any claim its source does not support. The writer never receives a blocked claim.",
    quick: false,
    record: "EvidenceClaim",
  },
  {
    key: "write",
    order: 12,
    label: "Draft",
    detail: "Writes each section to the outline, in the brand's voice.",
    quick: true,
    record: "ArticleDraft",
  },
  {
    key: "originality",
    order: 13,
    label: "Differentiation",
    detail: "Measures how much of this already exists on the pages ranking for the query.",
    quick: false,
    record: "OriginalityReport",
  },
  {
    key: "factcheck",
    order: 14,
    label: "Fact check",
    detail: "Re-checks every number, claim and business fact against the source behind it.",
    quick: true,
    record: "FactCheckReport",
  },
  {
    key: "eeat",
    order: 15,
    label: "Trust signals",
    detail: "Looks for real experience, named expertise and the reasons a reader would believe this.",
    quick: false,
    record: "TrustReport",
  },
  {
    key: "seo",
    order: 16,
    label: "SEO fundamentals",
    detail: "Title, headings, meta and structure — placed where they belong, not stuffed.",
    quick: true,
    record: "SEOReport",
  },
  {
    key: "cannibalization",
    order: 17,
    label: "Overlap",
    detail: "Compares the draft with the site's own pages so two URLs do not chase one query.",
    quick: false,
    record: "CannibalizationReport",
  },
  {
    key: "links",
    order: 18,
    label: "Links",
    detail: "Places internal links to pages that exist and external links to sources that resolve.",
    quick: true,
    record: "InternalLinkReport",
  },
  {
    key: "media",
    order: 19,
    label: "Media",
    detail: "Plans the images and video the page needs, with the alt text for each.",
    quick: false,
    record: "MediaPlan",
  },
  {
    key: "schema",
    order: 20,
    label: "Structured data",
    detail: "Emits the JSON-LD this page's type actually supports.",
    quick: true,
    record: "SchemaArtifact",
  },
  {
    key: "editor",
    order: 21,
    label: "Edit pass",
    detail: "Reads the whole draft again for sense, repetition and length.",
    quick: false,
  },
  {
    key: "score",
    order: 22,
    label: "Quality score",
    detail: "Scores the ten dimensions, and reports differentiation as its own number.",
    quick: true,
    record: "QualityScore",
  },
  {
    key: "gate",
    order: 23,
    label: "Publish checks",
    detail: "Twenty checks. Every failure names itself, so nothing is ever just “SEO failed”.",
    quick: true,
  },
];

/** Lookup by key, built once. */
const BY_KEY: Record<string, ArticleStageSpec> = ARTICLE_STAGES.reduce(
  (acc, stage) => {
    acc[stage.key] = stage;
    return acc;
  },
  {} as Record<string, ArticleStageSpec>
);

export function isArticleStageKey(value: unknown): value is ArticleStageKey {
  return typeof value === "string" && value in BY_KEY;
}

export function stageSpec(key: ArticleStageKey): ArticleStageSpec {
  return BY_KEY[key];
}

/** The stages this mode runs, in order. Quick is a subset, never a different list. */
export function stagesFor(mode: ArticleRunMode): ArticleStageSpec[] {
  return mode === "deep" ? ARTICLE_STAGES : ARTICLE_STAGES.filter((s) => s.quick);
}

/** The first stage of a run. */
export function firstStage(mode: ArticleRunMode): ArticleStageSpec {
  return stagesFor(mode)[0];
}

/** What runs after `key` in this mode, or null when the run is finished. */
export function nextStage(
  mode: ArticleRunMode,
  key: ArticleStageKey
): ArticleStageSpec | null {
  const list = stagesFor(mode);
  const at = list.findIndex((s) => s.key === key);
  if (at < 0) return null;
  return list[at + 1] ?? null;
}

/** 1-based position within this mode's list — what the UI counts with. */
export function stagePosition(mode: ArticleRunMode, key: ArticleStageKey): number {
  return stagesFor(mode).findIndex((s) => s.key === key) + 1;
}

export function stageCount(mode: ArticleRunMode): number {
  return stagesFor(mode).length;
}

export function isArticleRunMode(value: unknown): value is ArticleRunMode {
  return value === "quick" || value === "deep";
}
