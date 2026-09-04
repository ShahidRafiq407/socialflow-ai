/**
 * THE BRIEF, NORMALISED ONCE
 *
 * A run is started from whatever the form collected, and then read again by
 * twenty-three stages across as many requests. If each stage coerced the raw
 * body itself they would disagree — one would read `enableImages` as absent and
 * another as false — so the brief is normalised at the door, stored on the run,
 * and every stage reads this shape.
 *
 * The fields are the ones the Article Writer form already sends. Nothing here is
 * invented: a missing optional field stays missing, and the stage that needs it
 * says so rather than filling it in.
 *
 * Client-safe: the only import is the shared length table, which has none of its
 * own.
 */

import { resolveTargetWordCount } from "@/lib/seo/articleLength";

export interface ArticleBrief {
  /** The one required field. A run without it cannot be started. */
  keyword: string;
  title?: string;
  /** Country the search results should be read from, as the form's value. */
  targetCountry?: string;
  /** Language label, e.g. "English", "Urdu". The locale table resolves it. */
  language?: string;
  /** The form's preset: short, medium, long. */
  articleSize?: string;
  /** An exact target, which wins over the preset. Never a quality signal. */
  targetWordCount?: number;
  pointOfView?: string;
  /** Overrides the Brand DNA tone for this run only. */
  tone?: string;
  authorName?: string;
  /** The publishing target this run is written for. */
  targetId?: string;
  /** The site the draft will live on, when it is known. */
  targetWebsite?: string;

  enableInternalLinks: boolean;
  enableExternalLinks: boolean;
  enableImages: boolean;
  enableYoutube: boolean;
  enableFaq: boolean;
  enableToc: boolean;
  enableTakeaways: boolean;
  enableSources: boolean;
  humanize: boolean;

  imageCount?: number;
  imageStyle?: string;

  /**
   * The live page this run is updating, set only when the run was started from an
   * optimisation proposal somebody approved. Stage 3 reads it as a decision already
   * made rather than asking a model to re-derive it from a crawl — the page is one
   * this workspace published, and a person approved the proposal against it.
   */
  updateUrl?: string;
  /**
   * The approved points the update has to cover, in the proposal's own words.
   * Stage 3 hands these to the outline as `requiredElements`, which is the same
   * path the form's runs take — so nothing downstream needs to know where they
   * came from.
   */
  mustCover?: string[];
}
function str(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

/** An absolute http(s) address, or nothing. A relative path is not a page. */
function absoluteUrl(value: unknown): string | undefined {
  const text = str(value);
  return text && /^https?:\/\//i.test(text) ? text : undefined;
}

function lines(value: unknown, limit = 16): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((item) => str(item))
    .filter((item): item is string => !!item)
    .slice(0, limit);
  return out.length ? out : undefined;
}

/** A toggle the form ships as on unless it was explicitly turned off. */
function on(value: unknown): boolean {
  return value !== false;
}

function positive(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : undefined;
}

/**
 * The brief a run is created from, or null when the keyword is missing.
 *
 * Null rather than a default: there is no sensible keyword to invent, and a run
 * that quietly wrote about something else would be worse than a refusal.
 */
export function normalizeBrief(raw: unknown): ArticleBrief | null {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const keyword = str(body.keyword);
  if (!keyword) return null;

  return {
    keyword,
    title: str(body.title),
    targetCountry: str(body.targetCountry),
    language: str(body.language),
    articleSize: str(body.articleSize),
    targetWordCount: positive(body.targetWordCount),
    pointOfView: str(body.pointOfView),
    tone: str(body.tone),
    authorName: str(body.authorName),
    targetId: str(body.targetId),
    targetWebsite: str(body.targetWebsite),

    enableInternalLinks: on(body.enableInternalLinks),
    enableExternalLinks: on(body.enableExternalLinks),
    enableImages: on(body.enableImages),
    enableYoutube: on(body.enableYoutube),
    enableFaq: on(body.enableFaq),
    enableToc: on(body.enableToc),
    enableTakeaways: on(body.enableTakeaways),
    enableSources: on(body.enableSources),
    humanize: on(body.humanize),

    imageCount: positive(body.imageCount),
    imageStyle: str(body.imageStyle),

    updateUrl: absoluteUrl(body.updateUrl),
    mustCover: lines(body.mustCover),
  };
}
/** Reading a stored brief back. Same coercions, so an old row cannot break a stage. */
export function readBriefRow(value: unknown): ArticleBrief {
  return (
    normalizeBrief(value) ?? {
      // A stored brief with no keyword should be impossible: the run could not
      // have been created. Kept coherent rather than thrown so a stage reports
      // the real problem instead of a crash inside a getter.
      keyword: "",
      enableInternalLinks: true,
      enableExternalLinks: true,
      enableImages: true,
      enableYoutube: true,
      enableFaq: true,
      enableToc: true,
      enableTakeaways: true,
      enableSources: true,
      humanize: true,
    }
  );
}

/**
 * The word target this brief asks for.
 *
 * The presets and the clamp live in `articleLength.ts`, which the form and the
 * old generator already share — a second table here is how "medium" came to mean
 * two different lengths in the previous build.
 *
 * Length is a planning input: how much ground the outline can cover. It is never
 * a quality signal, and the score never reads it.
 */
export function briefWordTarget(brief: ArticleBrief): number {
  return resolveTargetWordCount({
    targetWordCount: brief.targetWordCount,
    articleSize: brief.articleSize,
  });
}


