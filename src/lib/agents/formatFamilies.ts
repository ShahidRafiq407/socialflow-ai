/**
 * FORMAT FAMILIES — the campaign's unit of production.
 *
 * A campaign request is a list of (platform, format) targets: instagram/reel,
 * tiktok/video, facebook/reel, linkedin/carousel, pinterest/idea pin, …
 *
 * Many of those targets need the SAME artefact. A 9:16 vertical video serves an
 * Instagram Reel, a TikTok video, a Facebook Reel and a YouTube Short; one square
 * deck serves an Instagram Carousel and a LinkedIn Document. Producing a separate
 * post for each of them means paying for the same render several times, waiting
 * several times as long, and — worse — shipping visibly DIFFERENT creative for what
 * the user asked to be one campaign.
 *
 * So targets are grouped into families by what they actually need to render:
 * media kind + orientation. Each family gets:
 *   - ONE shared creative core (hook, storyboard, visual art direction)
 *   - ONE media render, reused by every member
 *   - per-member caption / title / hashtags, so each platform still reads native
 *
 * Grouping is computed from `resolveVisualRequirements` (which itself delegates to
 * PLATFORM_FORMAT_MAP), so families follow the platform specs — nothing here is a
 * hand-maintained list of "these formats are similar".
 */

import { resolveVisualRequirements, DEFAULT_DECK_SLIDES, clampDeckSlides } from "@/lib/agents/mediaGenerator";
import { getPlatformFormatSpec } from "@/lib/agents/platformMapping";

export type Orientation = "vertical" | "square" | "landscape";
export type FamilyKind = "image" | "video" | "multi_image" | "text_only";

/** Numeric value of an aspect-ratio string ("9:16" → 0.5625, "1.91:1" → 1.91). */
export function aspectRatioValue(ar: string): number {
  const parts = (ar || "").split(":");
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
  return w / h;
}

/**
 * Orientation is derived from the ratio itself rather than a list of known strings,
 * so a new platform ratio classifies correctly the day it is added to the map.
 */
export function orientationOf(ar: string): Orientation {
  const v = aspectRatioValue(ar);
  if (v < 0.95) return "vertical";
  if (v > 1.05) return "landscape";
  return "square";
}

export interface FamilyMember {
  /** Normalized (lowercase) keys — these index `generatedContent.platforms`. */
  platform: string;
  contentType: string;
  /** Exactly as the user requested it, for prompts and user-facing labels. */
  rawPlatform: string;
  rawContentType: string;
  /** The ratio this platform ideally wants. */
  aspectRatio: string;
  mediaType: "image" | "video" | "text_only" | "multi_image";
  assetType: "image" | "video" | "multi_image";
  visualRequired: boolean;
  requiredAssets: number;
  description: string;
}

export interface FormatFamily {
  key: string;
  kind: FamilyKind;
  orientation: Orientation | "none";
  /** True when this family produces media at all (false for text-only formats). */
  visualRequired: boolean;
  /** The ratio the single shared render uses — closest fit for the whole family. */
  renderAspectRatio: string;
  /** Planned deck length for multi_image families; 1 otherwise. Final count comes
   *  from the storyboard the copy agent actually writes. */
  plannedSlides: number;
  members: FamilyMember[];
  /** Human-readable label used in the live console. */
  label: string;
}

/** Stable identity of one requested target. */
export function memberKey(platform: string, contentType: string): string {
  return `${(platform || "").toLowerCase().trim()}|${(contentType || "").toLowerCase().trim()}`;
}

/**
 * Picks the shared render ratio for a family: the member ratio closest (in log
 * space, so crop is measured proportionally) to the family's geometric mean. That
 * minimises the worst-case crop instead of arbitrarily using the first member's.
 */
function pickRenderAspectRatio(ratios: string[]): string {
  const unique = Array.from(new Set(ratios.filter(Boolean)));
  if (unique.length === 0) return "1:1";
  if (unique.length === 1) return unique[0];

  const logs = ratios.map((r) => Math.log(aspectRatioValue(r)));
  const meanLog = logs.reduce((a, b) => a + b, 0) / logs.length;

  // Frequency first (the ratio most platforms asked for wins), distance as tiebreak,
  // then the string itself so the result never depends on Map iteration luck.
  const freq = new Map<string, number>();
  for (const r of ratios) freq.set(r, (freq.get(r) || 0) + 1);

  return unique.sort((a, b) => {
    const fa = freq.get(a) || 0;
    const fb = freq.get(b) || 0;
    if (fa !== fb) return fb - fa;
    const da = Math.abs(Math.log(aspectRatioValue(a)) - meanLog);
    const db = Math.abs(Math.log(aspectRatioValue(b)) - meanLog);
    if (Math.abs(da - db) > 1e-9) return da - db;
    return a.localeCompare(b);
  })[0];
}

function kindLabel(kind: FamilyKind, orientation: Orientation | "none"): string {
  const nice: Record<FamilyKind, string> = {
    image: "image",
    video: "video",
    multi_image: "slide deck",
    text_only: "text-only post",
  };
  return orientation === "none" ? nice[kind] : `${orientation} ${nice[kind]}`;
}

export interface ComputeFamiliesOptions {
  /** Target deck length for multi-slide families. Defaults to DEFAULT_DECK_SLIDES. */
  deckSlides?: number;
}

/**
 * Turns the requested platforms/formats into production families.
 *
 * Iteration order follows the caller's `platforms` array and each platform's format
 * list, so the resulting family order (and therefore the console output) is stable
 * for a given request.
 */
export function computeFormatFamilies(
  platforms: string[],
  contentTypes: Record<string, string[]>,
  options: ComputeFamiliesOptions = {}
): FormatFamily[] {
  const plannedDeck = clampDeckSlides(options.deckSlides, DEFAULT_DECK_SLIDES);
  const seen = new Set<string>();
  const grouped = new Map<string, FamilyMember[]>();

  for (const rawPlatform of platforms || []) {
    const platform = (rawPlatform || "").toLowerCase().trim();
    if (!platform) continue;

    const formats =
      contentTypes?.[rawPlatform] ||
      contentTypes?.[platform] ||
      // A platform selected with no explicit format still deserves its default post.
      ["feed"];

    for (const rawContentType of formats) {
      const contentType = (rawContentType || "").toLowerCase().trim();
      if (!contentType) continue;

      const key = memberKey(platform, contentType);
      if (seen.has(key)) continue; // the UI can send the same format twice
      seen.add(key);

      const spec = getPlatformFormatSpec(rawPlatform, rawContentType);
      const req = resolveVisualRequirements(
        rawPlatform,
        rawContentType,
        spec.mediaType === "multi_image" ? plannedDeck : undefined
      );

      const member: FamilyMember = {
        platform,
        contentType,
        rawPlatform,
        rawContentType,
        aspectRatio: req.aspectRatio,
        mediaType: spec.mediaType,
        assetType: req.assetType,
        visualRequired: req.visualRequired,
        requiredAssets: req.requiredAssets,
        description: spec.description,
      };

      const kind: FamilyKind = member.visualRequired ? member.assetType : "text_only";
      const orientation: Orientation | "none" = member.visualRequired
        ? orientationOf(member.aspectRatio)
        : "none";
      // DECKS (multi_image) of one campaign are ONE family regardless of
      // orientation: an Instagram carousel (1:1), a Pinterest carousel (2:3) and
      // an Idea Pin (9:16) all publish "the same multi-slide visual post", so the
      // user expects one storyboard, one caption and one shared render — not three
      // diverging decks split by ratio class. The render uses the compromise ratio
      // (pickRenderAspectRatio below); each member keeps its own intended crop for
      // the editor. Stills and videos still group by orientation, where the ratio
      // genuinely changes the artefact.
      const familyKey = member.visualRequired
        ? kind === "multi_image"
          ? "multi_image"
          : `${kind}|${orientation}`
        : "text_only";

      const bucket = grouped.get(familyKey) || [];
      bucket.push(member);
      grouped.set(familyKey, bucket);
    }
  }

  const families: FormatFamily[] = [];
  for (const [familyKey, members] of grouped) {
    const [kindRaw, orientationRaw] = familyKey.split("|");
    const kind = kindRaw as FamilyKind;
    const visualRequired = kind !== "text_only";
    const renderAspectRatio = visualRequired
      ? pickRenderAspectRatio(members.map((m) => m.aspectRatio))
      : members[0]?.aspectRatio || "1:1";
    // A merged deck family spans member ratios (1:1 carousels, 2:3 pins), so its
    // label reports the compromise ratio it will actually render at.
    const orientation: Orientation | "none" = visualRequired
      ? kind === "multi_image"
        ? orientationOf(renderAspectRatio)
        : (orientationRaw as Orientation)
      : "none";

    families.push({
      key: familyKey,
      kind,
      orientation,
      visualRequired,
      renderAspectRatio,
      plannedSlides: kind === "multi_image" ? plannedDeck : 1,
      members,
      label: `${kindLabel(kind, orientation)}${visualRequired ? ` (${renderAspectRatio})` : ""}`,
    });
  }

  return families;
}

/** "instagram/reel, tiktok/video" — for console labels. */
export function describeMembers(family: FormatFamily): string {
  return family.members.map((m) => `${m.platform}/${m.contentType}`).join(", ");
}

// ============================================================================
// ATTACHING ONE FAMILY RENDER TO EVERY MEMBER
//
// This is where "the family stays in sync" is actually enforced. The render happens
// once for the family; each member then receives the SAME urls, relabelled with its
// own platform/format and its own intended crop. Producing per-member renders here
// instead is what would make one campaign ship visibly different creative for the
// same idea.
// ============================================================================

/** The subset of a media asset that identifies where it was attached. */
export interface AssetAttachment {
  platform?: string;
  contentType?: string;
  slideIndex?: number;
  url?: string;
}

/**
 * Copies one shared asset onto one member: same pixels, that member's labels, and the
 * ratio that member actually wanted (the render used the family's compromise ratio, so
 * the editor needs the intended crop recorded separately).
 */
export function retagAssetForMember<T extends object>(
  asset: T,
  member: FamilyMember
): T & { platform: string; contentType: string; requestedAspectRatio: string } {
  return {
    ...asset,
    platform: member.platform,
    contentType: member.contentType,
    requestedAspectRatio: member.aspectRatio,
  };
}

/** One url, on one target, at one slide position. */
export function assetAttachmentKey(asset: AssetAttachment): string {
  return `${asset.platform ?? ""}|${asset.contentType ?? ""}|${asset.slideIndex ?? 0}|${asset.url ?? ""}`;
}

/**
 * Returns only the rows not already attached, RECORDING them in `seen` as it goes.
 *
 * Members of a family share one render, so the same url legitimately lands on several
 * platforms — that is the point. What must never happen is the same url landing on the
 * same target twice: a resumed run, a retried family, or a second pass over the members
 * would otherwise stack a duplicate copy of every slide and the studio would show the
 * deck twice with duplicated captions beside it.
 */
export function dedupeAttachments<T extends AssetAttachment>(rows: T[], seen: Set<string>): T[] {
  const fresh: T[] = [];
  for (const row of rows) {
    const key = assetAttachmentKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(row);
  }
  return fresh;
}

/** How many separate renders the naive one-per-format approach would have needed. */
export function countVisualTargets(families: FormatFamily[]): number {
  return families.reduce((acc, f) => acc + (f.visualRequired ? f.members.length : 0), 0);
}
