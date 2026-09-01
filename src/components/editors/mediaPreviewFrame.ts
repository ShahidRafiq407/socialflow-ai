/**
 * SHARED PREVIEW FRAME FOR DECK / MULTI-ASSET EDITORS
 *
 * WHY THIS EXISTS: carousel, idea pin, document and multi-image posts are
 * INFORMATIONAL graphics — the headline and the insight are typeset into the
 * image itself. A 220px thumbnail made that text unreadable, so the generated
 * media looked broken even when it was perfect. Every deck editor now sizes its
 * preview from the format's real aspect ratio through this one helper.
 *
 * Tailwind cannot compile class names assembled at runtime (`aspect-[${w}/${h}]`
 * never reaches the generated stylesheet), so the frame is returned as inline
 * style values instead of utility classes.
 */

export interface MediaPreviewFrame {
  /** CSS `aspect-ratio` value, e.g. "9 / 16" */
  aspectRatio: string;
  /** px cap so a 9:16 page cannot run off the bottom of the editor */
  maxWidth: number;
}

/** Reads "9:16" style ratios; anything unparseable falls back to square. */
export function parseAspectRatio(ratio?: string | null): { w: number; h: number } {
  const [rawW, rawH] = String(ratio ?? "").split(":");
  const w = Number(rawW);
  const h = Number(rawH);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { w: 1, h: 1 };
  }
  return { w, h };
}

/**
 * Full-size preview frame for a format's aspect ratio. Portrait pages stay
 * narrow enough to fit on screen, landscape ones get the extra width they need.
 */
export function mediaPreviewFrame(ratio?: string | null): MediaPreviewFrame {
  const { w, h } = parseAspectRatio(ratio);
  const proportion = w / h;
  const maxWidth = proportion < 0.9 ? 380 : proportion >= 1.6 ? 620 : 460;
  return { aspectRatio: `${w} / ${h}`, maxWidth };
}

/**
 * The ratio the preview should use: an explicit user choice wins, otherwise the
 * platform default for the format ("auto" in the settings dropdown).
 */
export function resolvePreviewRatio(selected?: string | null, platformDefault?: string | null): string {
  const choice = String(selected ?? "").trim();
  if (choice && choice !== "auto") return choice;
  return String(platformDefault ?? "").trim() || "1:1";
}

/**
 * Informational graphics must never be cropped — a `cover` fit silently eats the
 * headline when the returned image and the frame disagree by a few percent.
 */
export const DECK_MEDIA_FIT = "w-full h-full object-contain rounded-xl";
