/**
 * ARTICLE LENGTH — one source of truth, shared by the writer UI and the generator
 *
 * The length presets used to live inside the generator, which is a server module
 * that pulls in the whole model stack. The Article Writer form could not import
 * it, so the browser kept its own hard-coded list of three sizes that did not
 * match the seven the generator actually understands — asking for "large" in the
 * UI produced whatever the server's fallback happened to be.
 *
 * This file has no imports on purpose: a client component can read it, and
 * `article-generator.ts` re-exports it so its public API is unchanged.
 */

/** Preset lengths, in words. An exact `targetWordCount` always overrides these. */
export const ARTICLE_SIZE_WORDS: Record<string, number> = {
  xs: 800,
  short: 1200,
  small: 1500,
  medium: 2500,
  long: 3200,
  large: 4000,
  xl: 6000,
};

export const MIN_TARGET_WORDS = 300;
export const MAX_TARGET_WORDS = 8000;
/** How far off the requested count is still "accurate". */
export const WORD_COUNT_TOLERANCE = 0.05;

/** The presets in the order the UI offers them, with the label it shows. */
export const ARTICLE_SIZE_PRESETS: { value: string; label: string; words: number }[] = [
  { value: "xs", label: "Brief", words: ARTICLE_SIZE_WORDS.xs },
  { value: "short", label: "Short", words: ARTICLE_SIZE_WORDS.short },
  { value: "small", label: "Standard", words: ARTICLE_SIZE_WORDS.small },
  { value: "medium", label: "In-depth", words: ARTICLE_SIZE_WORDS.medium },
  { value: "long", label: "Long", words: ARTICLE_SIZE_WORDS.long },
  { value: "large", label: "Pillar", words: ARTICLE_SIZE_WORDS.large },
  { value: "xl", label: "Ultimate guide", words: ARTICLE_SIZE_WORDS.xl },
];

/**
 * The word count to write to.
 *
 * An explicit count wins over the preset, because a user asking for 3,412 words
 * means 3,412 words. It is clamped rather than rejected so a typo cannot ask for
 * a 90,000-word article the time budget could never finish.
 */
export function resolveTargetWordCount(input: {
  targetWordCount?: number | null;
  articleSize?: string | null;
}): number {
  const explicit = Number(input.targetWordCount);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(MAX_TARGET_WORDS, Math.max(MIN_TARGET_WORDS, Math.round(explicit)));
  }
  const key = String(input.articleSize || "medium").toLowerCase().trim();
  return ARTICLE_SIZE_WORDS[key] ?? ARTICLE_SIZE_WORDS.medium;
}

/**
 * Section count from the target length. Sections under ~220 words read as
 * bullet soup; over ~500 they lose their heading. Both bounds are clamped so a
 * 300-word brief does not produce a one-heading article and an 8,000-word brief
 * does not produce 30 model calls we have no time budget for.
 */
export function planSectionCount(targetWords: number): number {
  return Math.min(14, Math.max(4, Math.round(targetWords / 330)));
}
