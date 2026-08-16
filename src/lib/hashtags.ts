/**
 * SHARED HASHTAG NORMALIZATION
 *
 * Guarantees that anything shown in a Hashtags field is a REAL hashtag:
 *   - starts with "#"
 *   - single token, no spaces / commas / punctuation inside
 *   - PascalCase words joined (never "#digital marketing strategy")
 *   - deduplicated (case-insensitive)
 *
 * Handles every shape an LLM or user can produce:
 *   ["#DigitalMarketing", "social media growth"] | "digital marketing, AI automation" | "#AI, robotics"
 */

const MAX_HASHTAG_LENGTH = 40;

/** Convert one free-text fragment into a single valid PascalCase hashtag token (without "#"). */
function fragmentToToken(fragment: string): string | null {
  // Words = runs of letters/digits (unicode-aware). "digital marketing strategy" -> ["digital","marketing","strategy"]
  const words = fragment.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length === 0) return null;

  const token = words
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");

  if (!/[\p{L}\p{N}]/u.test(token)) return null;
  return token.slice(0, MAX_HASHTAG_LENGTH);
}

/**
 * Normalize arbitrary AI/user hashtag output into clean hashtags (WITH "#").
 *
 * - string input is split on commas / newlines / "#"-separated groups, but NOT on plain
 *   spaces, so "digital marketing strategy, AI automation" becomes exactly two hashtags:
 *   ["#DigitalMarketingStrategy", "#AIAutomation"] — never one # prepended to a sentence.
 * - array input: each entry normalized the same way.
 * - an entry that already looks like "#Tag" is preserved as-is (case kept).
 */
export function normalizeHashtags(raw: unknown, opts?: { limit?: number }): string[] {
  const entries: string[] = [];

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (typeof entry === "string") entries.push(entry);
    });
  } else if (typeof raw === "string" && raw.trim()) {
    // Split on commas / semicolons / newlines / " #" boundaries — NOT plain spaces,
    // because a comma-separated AI phrase like "social media growth" is ONE topic.
    entries.push(...raw.split(/[,\n;]+|#(?=[\p{L}\p{N}_])/gu).map((s) => s.trim()));
  } else {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawEntry of entries) {
    if (!rawEntry || !rawEntry.trim()) continue;
    // Strip LLM prose like "Here are your hashtags:" — hashtags never contain ":", so
    // anything before the last colon is explanatory text, not a tag.
    let entry = rawEntry;
    const colonIdx = entry.lastIndexOf(":");
    if (colonIdx !== -1) entry = entry.slice(colonIdx + 1);
    entry = entry.trim();
    if (!entry) continue;
    const stripped = entry.replace(/^#+/, "").trim();
    if (!stripped) continue;

    // Single token (e.g. "DigitalMarketing" or already-#-stripped "EmbodiedAI"):
    // keep authored casing, just sanitize chars. Multi-word phrase -> PascalCase join.
    const token = isSingleToken(stripped)
      ? sanitizeToken(stripped)
      : fragmentToToken(stripped);
    if (!token) continue;

    const tag = `#${token}`;
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
    if (opts?.limit && result.length >= opts.limit) break;
  }

  return result;
}

function isSingleToken(stripped: string): boolean {
  // Single word (possibly camelCase) with no spaces — treat as an existing tag like "EmbodiedAI"
  return /^[\p{L}\p{N}_]+$/u.test(stripped);
}

function sanitizeToken(token: string): string {
  // Keep camelCase/PascalCase exactly as authored (EmbodiedAI), only strip illegal chars.
  return token.replace(/[^\p{L}\p{N}_]/gu, "").slice(0, MAX_HASHTAG_LENGTH);
}

/**
 * Light-weight formatter for USER-TYPED hashtag input (called on every keystroke).
 * Only guarantees the "#" prefix + basic sanitation per space-separated token.
 * Does NOT re-case words (no fighting the user's cursor while typing).
 */
export function formatHashtagInputTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tokens) {
    const stripped = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_#]/gu, "");
    if (!stripped) continue;
    const tag = `#${stripped}`;
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}
