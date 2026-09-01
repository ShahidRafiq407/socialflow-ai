/**
 * QUALITY CHECKS — the deterministic half of the CEO audit.
 *
 * The CEO agent used to be an LLM call whose failure path fabricated a pass
 * (`{passed: true, score: 95}`), so a broken campaign could be "approved" by a
 * timeout. Judgement calls (does this sound human? is the hook strong?) genuinely
 * need the model, but most audit criteria are facts that can be checked exactly:
 * is the required asset there, is the caption inside the platform's limit, does the
 * copy contain a word the brand banned, do the family members actually share the
 * same creative.
 *
 * Checking those in code makes the verdict honest and — more importantly — gives the
 * revision loop a precise, per-field target list instead of a vague complaint, which
 * is what makes the rewrite land accurately every time.
 */

import { MIN_DECK_SLIDES } from "@/lib/agents/mediaGenerator";
import type { FormatFamily } from "@/lib/agents/formatFamilies";
import { memberKey } from "@/lib/agents/formatFamilies";

/**
 * Phrases that mark copy as machine-written. Shared by the content-creator prompt,
 * the audit and the revision prompt so all three always agree on what is banned.
 */
export const AI_CLICHE_PHRASES = [
  "in today's fast-paced world",
  "in today's digital age",
  "in the ever-evolving",
  "unleash your potential",
  "unleash the power",
  "game-changer",
  "game changer",
  "supercharge",
  "elevate your",
  "dive in",
  "let's dive",
  "unlock the power",
  "unlock your",
  "take it to the next level",
  "look no further",
  "the world of",
  "revolutionize",
  "seamlessly integrate",
  "cutting-edge solution",
  "harness the power",
  "embark on a journey",
  "at the end of the day",
  "when it comes to",
  "it's no secret that",
];

/**
 * Real platform limits (characters for captions, count for hashtags).
 * `hashtagMax` is the point past which the platform ignores or penalises tags —
 * not a style preference.
 */
export const PLATFORM_TEXT_LIMITS: Record<string, { captionMax: number; hashtagMax: number }> = {
  x: { captionMax: 280, hashtagMax: 3 },
  twitter: { captionMax: 280, hashtagMax: 3 },
  instagram: { captionMax: 2200, hashtagMax: 30 },
  facebook: { captionMax: 5000, hashtagMax: 10 },
  linkedin: { captionMax: 3000, hashtagMax: 8 },
  tiktok: { captionMax: 2200, hashtagMax: 10 },
  youtube: { captionMax: 5000, hashtagMax: 15 },
  pinterest: { captionMax: 500, hashtagMax: 20 },
};

const DEFAULT_LIMITS = { captionMax: 2200, hashtagMax: 15 };

export function limitsFor(platform: string) {
  return PLATFORM_TEXT_LIMITS[(platform || "").toLowerCase().trim()] || DEFAULT_LIMITS;
}

export type IssueSeverity = "blocker" | "major" | "minor";
export type IssueField = "caption" | "hook" | "title" | "hashtags" | "overlayText" | "media" | "structure";

export interface QualityIssue {
  code: string;
  severity: IssueSeverity;
  field: IssueField;
  message: string;
  platform?: string;
  contentType?: string;
  /** Concrete instruction the revision agent can act on without guessing. */
  fixHint?: string;
}

export interface QualityReport {
  issues: QualityIssue[];
  /** Issues that make the campaign unpublishable (missing/mismatched media). */
  blockers: QualityIssue[];
  /** Issues a copy rewrite can fix. */
  fixable: QualityIssue[];
  score: number;
  passed: boolean;
  checkedPosts: number;
}

export interface DeterministicCheckInput {
  content: { platforms: Record<string, Record<string, any>> } | undefined;
  families: FormatFamily[];
  /** Words the brand has explicitly banned (BrandDNA.forbiddenWords). */
  forbiddenWords?: string[];
  /** Minimum caption length worth publishing — derived, not a style rule. */
  minCaptionChars?: number;
}

function findItem(
  content: DeterministicCheckInput["content"],
  platform: string,
  contentType: string
): any | undefined {
  const platforms = content?.platforms;
  if (!platforms) return undefined;
  const pKey = Object.keys(platforms).find((k) => k.toLowerCase().trim() === platform);
  if (!pKey) return undefined;
  const formats = platforms[pKey] || {};
  const fKey = Object.keys(formats).find((k) => k.toLowerCase().trim() === contentType);
  return fKey ? formats[fKey] : undefined;
}

/** Case-insensitive whole-phrase scan that reports what it actually matched. */
function findPhrases(text: string, phrases: string[]): string[] {
  const haystack = (text || "").toLowerCase();
  const hits: string[] = [];
  for (const phrase of phrases) {
    const needle = (phrase || "").toLowerCase().trim();
    if (!needle) continue;
    // Word-boundary match so "elevate your" doesn't fire inside another word.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack)) {
      hits.push(phrase);
    }
  }
  return hits;
}

/**
 * Runs every check that can be decided from the data alone.
 *
 * `blockers` are structural (media absent or of the wrong kind) and mean the run
 * failed — no rewrite can repair them. `fixable` issues are handed to the revision
 * agent field by field.
 */
export function runDeterministicChecks(input: DeterministicCheckInput): QualityReport {
  const { content, families } = input;
  const forbidden = (input.forbiddenWords || []).map((w) => (w || "").trim()).filter(Boolean);
  const minCaptionChars = input.minCaptionChars ?? 40;
  const issues: QualityIssue[] = [];
  let checkedPosts = 0;

  for (const family of families) {
    for (const member of family.members) {
      const item = findItem(content, member.platform, member.contentType);
      const where = { platform: member.platform, contentType: member.contentType };

      if (!item) {
        issues.push({
          ...where,
          code: "POST_MISSING",
          severity: "blocker",
          field: "structure",
          message: `No content was produced for ${member.platform} ${member.contentType}.`,
        });
        continue;
      }
      checkedPosts += 1;

      // ── Media presence & kind ──────────────────────────────────────────────
      if (family.visualRequired) {
        if (family.kind === "video") {
          if (!item.videoUrl) {
            issues.push({
              ...where,
              code: "VIDEO_ASSET_MISSING",
              severity: "blocker",
              field: "media",
              message: `${member.platform} ${member.contentType} requires a video, but none was attached.`,
            });
          }
        } else if (family.kind === "multi_image") {
          const slides: string[] = Array.isArray(item.slideUrls) ? item.slideUrls : [];
          if (slides.length === 0) {
            issues.push({
              ...where,
              code: "DECK_ASSET_MISSING",
              severity: "blocker",
              field: "media",
              message: `${member.platform} ${member.contentType} is a multi-slide format but has no rendered slides.`,
            });
          } else if (slides.length < MIN_DECK_SLIDES) {
            issues.push({
              ...where,
              code: "DECK_TOO_SHORT",
              severity: "blocker",
              field: "media",
              message: `${member.platform} ${member.contentType} rendered ${slides.length} slide(s); ${MIN_DECK_SLIDES} is the minimum a deck can publish with.`,
            });
          } else {
            const overlays = Array.isArray(item.overlayText) ? item.overlayText : [];
            if (overlays.length !== slides.length) {
              issues.push({
                ...where,
                code: "DECK_TEXT_SLIDE_MISMATCH",
                severity: "major",
                field: "overlayText",
                message: `${member.platform} ${member.contentType} has ${overlays.length} storyboard entries for ${slides.length} rendered slides.`,
                fixHint: `Return exactly ${slides.length} overlayText entries, one per slide, in order.`,
              });
            }
            const emptyOverlay = overlays.findIndex(
              (s: any) => !((s?.title || "").trim() || (s?.body || "").trim())
            );
            if (emptyOverlay >= 0) {
              issues.push({
                ...where,
                code: "DECK_TEXT_EMPTY",
                severity: "major",
                field: "overlayText",
                message: `Slide ${emptyOverlay + 1} of ${member.platform} ${member.contentType} has no headline or insight text.`,
                fixHint: `Write a headline and a 1-2 sentence insight for slide ${emptyOverlay + 1}.`,
              });
            }
          }
        } else if (!item.imageUrl) {
          issues.push({
            ...where,
            code: "IMAGE_ASSET_MISSING",
            severity: "blocker",
            field: "media",
            message: `${member.platform} ${member.contentType} requires an image, but none was attached.`,
          });
        }
      } else if (item.imageUrl || item.videoUrl || item.slideUrls?.length) {
        // Text-only formats that somehow carry media mean a wasted paid render.
        issues.push({
          ...where,
          code: "UNEXPECTED_MEDIA",
          severity: "minor",
          field: "media",
          message: `${member.platform} ${member.contentType} publishes as text only, but media was generated for it.`,
        });
      }

      // ── Copy checks ────────────────────────────────────────────────────────
      const caption = (item.caption || "").toString();
      const limits = limitsFor(member.platform);

      if (caption.trim().length < minCaptionChars) {
        issues.push({
          ...where,
          code: "CAPTION_TOO_SHORT",
          severity: "major",
          field: "caption",
          message: `${member.platform} ${member.contentType} caption is only ${caption.trim().length} characters.`,
          fixHint: `Write a complete caption of at least ${minCaptionChars} characters for ${member.platform}.`,
        });
      } else if (caption.length > limits.captionMax) {
        issues.push({
          ...where,
          code: "CAPTION_TOO_LONG",
          severity: "major",
          field: "caption",
          message: `${member.platform} caption is ${caption.length} characters; ${member.platform} accepts ${limits.captionMax}.`,
          fixHint: `Rewrite the ${member.platform} caption to ${limits.captionMax} characters or fewer without dropping the core message.`,
        });
      }

      if (!(item.hook || "").toString().trim()) {
        issues.push({
          ...where,
          code: "HOOK_MISSING",
          severity: "major",
          field: "hook",
          message: `${member.platform} ${member.contentType} has no hook.`,
          fixHint: "Write a 1-2 second scroll-stopping opening line.",
        });
      }

      if (!(item.title || "").toString().trim()) {
        issues.push({
          ...where,
          code: "TITLE_MISSING",
          severity: "minor",
          field: "title",
          message: `${member.platform} ${member.contentType} has no title.`,
          fixHint: "Write a short punchy title.",
        });
      }

      const hashtags: string[] = Array.isArray(item.hashtags) ? item.hashtags : [];
      if (hashtags.length === 0) {
        issues.push({
          ...where,
          code: "HASHTAGS_MISSING",
          severity: "minor",
          field: "hashtags",
          message: `${member.platform} ${member.contentType} has no hashtags.`,
          fixHint: `Add 3-${Math.min(8, limits.hashtagMax)} relevant hashtags.`,
        });
      } else if (hashtags.length > limits.hashtagMax) {
        issues.push({
          ...where,
          code: "HASHTAGS_TOO_MANY",
          severity: "minor",
          field: "hashtags",
          message: `${member.platform} has ${hashtags.length} hashtags; ${limits.hashtagMax} is the useful maximum.`,
          fixHint: `Keep the ${limits.hashtagMax} strongest hashtags and drop the rest.`,
        });
      }

      // Brand-banned vocabulary. This is why BrandDNA.forbiddenWords exists — it was
      // stored in the database and never consulted anywhere before.
      const copyBlob = [caption, item.hook, item.title, ...(hashtags || [])]
        .concat((item.overlayText || []).flatMap((s: any) => [s?.title, s?.body]))
        .filter(Boolean)
        .join("\n");

      const bannedHits = findPhrases(copyBlob, forbidden);
      if (bannedHits.length > 0) {
        issues.push({
          ...where,
          code: "FORBIDDEN_WORD",
          severity: "major",
          field: "caption",
          message: `${member.platform} ${member.contentType} uses brand-forbidden wording: ${bannedHits.join(", ")}.`,
          fixHint: `Remove these words entirely and rephrase: ${bannedHits.join(", ")}.`,
        });
      }

      const clicheHits = findPhrases(copyBlob, AI_CLICHE_PHRASES);
      if (clicheHits.length > 0) {
        issues.push({
          ...where,
          code: "AI_CLICHE",
          severity: clicheHits.length > 1 ? "major" : "minor",
          field: "caption",
          message: `${member.platform} ${member.contentType} reads machine-written: ${clicheHits.join(", ")}.`,
          fixHint: `Rewrite the affected sentences without these phrases: ${clicheHits.join(", ")}.`,
        });
      }
    }
  }

  // ── Family sync verification ─────────────────────────────────────────────────
  // The whole point of families is that members share one creative. If they drifted
  // apart, the campaign silently became "a different post per format" again.
  for (const family of families) {
    if (family.members.length < 2) continue;
    const items = family.members
      .map((m) => ({ m, item: findItem(content, m.platform, m.contentType) }))
      .filter((x) => x.item);
    if (items.length < 2) continue;

    if (family.visualRequired) {
      const mediaKey = (item: any) =>
        family.kind === "video"
          ? item.videoUrl || ""
          : family.kind === "multi_image"
            ? (item.slideUrls || []).join("|")
            : item.imageUrl || "";
      const distinct = new Set(items.map((x) => mediaKey(x.item)).filter(Boolean));
      if (distinct.size > 1) {
        issues.push({
          code: "FAMILY_MEDIA_DESYNC",
          severity: "major",
          field: "media",
          message: `The ${family.label} family rendered ${distinct.size} different assets for ${items.length} formats that should share one.`,
        });
      }
    }

    const hooks = new Set(items.map((x) => (x.item.hook || "").trim().toLowerCase()).filter(Boolean));
    if (hooks.size > 1) {
      issues.push({
        code: "FAMILY_HOOK_DESYNC",
        severity: "minor",
        field: "hook",
        message: `The ${family.label} family has ${hooks.size} different hooks; members of one family share the core hook.`,
      });
    }
  }

  const blockers = issues.filter((i) => i.severity === "blocker");
  const fixable = issues.filter((i) => i.severity !== "blocker");

  const deduction = issues.reduce(
    (acc, i) => acc + (i.severity === "blocker" ? 40 : i.severity === "major" ? 10 : 3),
    0
  );
  const score = Math.max(0, 100 - deduction);

  return {
    issues,
    blockers,
    fixable,
    score,
    // Blockers are unpublishable; a pile of major issues means the copy needs work.
    passed: blockers.length === 0 && score >= 80,
    checkedPosts,
  };
}

/**
 * Groups fixable issues per post so the revision prompt can say exactly which
 * fields of which post to rewrite, instead of dumping one flat list.
 */
export function groupIssuesByPost(
  issues: QualityIssue[]
): { key: string; platform: string; contentType: string; fields: IssueField[]; issues: QualityIssue[] }[] {
  const map = new Map<string, { platform: string; contentType: string; issues: QualityIssue[] }>();
  for (const issue of issues) {
    if (!issue.platform || !issue.contentType) continue;
    const key = memberKey(issue.platform, issue.contentType);
    const entry = map.get(key) || { platform: issue.platform, contentType: issue.contentType, issues: [] };
    entry.issues.push(issue);
    map.set(key, entry);
  }
  return Array.from(map.entries()).map(([key, v]) => ({
    key,
    platform: v.platform,
    contentType: v.contentType,
    fields: Array.from(new Set(v.issues.map((i) => i.field))),
    issues: v.issues,
  }));
}

/** Short one-line summary of a report for the console / audit notes. */
export function summarizeReport(report: QualityReport): string {
  if (report.issues.length === 0) {
    return `All ${report.checkedPosts} post(s) passed every structural, platform-limit and brand-safety check.`;
  }
  const majors = report.issues.filter((i) => i.severity === "major").length;
  const minors = report.issues.filter((i) => i.severity === "minor").length;
  const parts: string[] = [];
  if (report.blockers.length) parts.push(`${report.blockers.length} blocking`);
  if (majors) parts.push(`${majors} major`);
  if (minors) parts.push(`${minors} minor`);
  return `${parts.join(", ")} issue(s) across ${report.checkedPosts} post(s).`;
}
