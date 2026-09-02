// ============================================================================
// CONTROLLER OUTCOMES — procedural memory of what the user keeps vs throws away
//
// Facts remember WHAT is true; playbooks remember HOW a task was done. Outcomes
// remember WHICH content survived. Every time a draft is published it is a kept
// signal; every time a pre-publish draft is deleted it is a discarded signal.
// Aggregated over a workspace's own actions, this becomes an honest track record
// ("your LinkedIn drafts ship; your carousels get thrown away") that biases the
// next round of generation toward what the user actually keeps.
//
// The signal is deliberately keyed on LOW-CARDINALITY, ALWAYS-PRESENT content
// dimensions — platform, format, media type — never on freeform topic. Freeform
// topics are near-unique, so they never aggregate into a real sample; the three
// dimensions here do. Each dimension is tallied independently, so "of your IG
// drafts, N kept / M discarded" is a true statement derived only from counted
// events, never an inferred causal link back to a specific fact or pillar.
//
// HONESTY FLOOR: a value with fewer than MIN_OUTCOME_SAMPLE events is NOT a
// pattern — surfacing it would present one deletion as a habit. Below the floor,
// and for values with no clear lean either way, nothing is emitted, so the
// prompt renderer returns "" and the caller omits the section entirely rather
// than announce a track record that isn't there.
//
// Pure module — no prisma, no clock, no I/O. It only turns events into a wire
// string, parses them back, and aggregates; the DB read/write live in
// ./outcomeStore, so all of this stays unit-testable in the node vitest env.
// ============================================================================

/** The Memory-table category outcome events are stored under. */
export const OUTCOME_CATEGORY = "content_outcome";

/** The two terminal outcomes a draft can reach that we can observe honestly. */
export type Outcome = "published" | "discarded";

/**
 * How many events a single dimension value needs before its keep/discard split
 * is treated as a pattern rather than noise. Below this, nothing is claimed.
 */
export const MIN_OUTCOME_SAMPLE = 3;

/** At or above this keep-rate, a value is something the user reliably keeps. */
export const KEEP_RATE_HIGH = 0.6;
/** At or below this keep-rate, a value is something the user reliably discards. */
export const KEEP_RATE_LOW = 0.4;

/** Most lines to surface per side, so a busy workspace can't flood the prompt. */
const MAX_LINES_PER_SIDE = 4;

/**
 * One observed terminal event: an outcome plus the content dimensions we can
 * read off the post at that moment. Any dimension may be absent (a text post has
 * no media type); absent dimensions simply don't contribute to any tally.
 */
export interface OutcomeEvent {
  outcome: Outcome;
  platform?: string | null;
  format?: string | null;
  mediaType?: string | null;
}

function cleanValue(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function isOutcome(v: unknown): v is Outcome {
  return v === "published" || v === "discarded";
}

/**
 * Builds the stored wire form of one event (compact JSON). Returns "" when there
 * is nothing worth storing: an unknown outcome, or an event carrying no usable
 * dimension at all (nothing could be learned from it).
 */
export function buildOutcomeContent(event: OutcomeEvent): string {
  if (!event || !isOutcome(event.outcome)) return "";
  const platform = cleanValue(event.platform);
  const format = cleanValue(event.format);
  const mediaType = cleanValue(event.mediaType);
  if (!platform && !format && !mediaType) return "";

  const payload: Record<string, string> = { outcome: event.outcome };
  if (platform) payload.platform = platform.slice(0, 60);
  if (format) payload.format = format.slice(0, 60);
  if (mediaType) payload.mediaType = mediaType.slice(0, 60);
  return JSON.stringify(payload);
}

/** Parses a stored wire string back into an event, or null if it isn't one. */
export function parseOutcomeEvent(content: string): OutcomeEvent | null {
  const text = (content || "").trim();
  if (!text.startsWith("{")) return null;
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || !isOutcome(raw.outcome)) return null;

  const platform = cleanValue(raw.platform);
  const format = cleanValue(raw.format);
  const mediaType = cleanValue(raw.mediaType);
  if (!platform && !format && !mediaType) return null;

  return {
    outcome: raw.outcome,
    platform: platform || undefined,
    format: format || undefined,
    mediaType: mediaType || undefined,
  };
}

export type OutcomeDimension = "platform" | "format" | "media";

export interface DimTally {
  dimension: OutcomeDimension;
  /** Lowercased key used to aggregate. */
  value: string;
  /** Original-cased value for display (first one seen for this key). */
  display: string;
  published: number;
  discarded: number;
  total: number;
  keepRate: number;
}

const DIMENSIONS: { dimension: OutcomeDimension; pick: (e: OutcomeEvent) => string | null | undefined }[] = [
  { dimension: "platform", pick: (e) => e.platform },
  { dimension: "format", pick: (e) => e.format },
  { dimension: "media", pick: (e) => e.mediaType },
];

/**
 * Aggregates events into a per-(dimension, value) keep/discard tally. Each
 * dimension is counted independently: a published LinkedIn Reel video increments
 * platform:linkedin, format:reel and media:video all at once.
 */
export function tallyOutcomes(events: OutcomeEvent[]): DimTally[] {
  const map = new Map<string, DimTally>();
  for (const event of events || []) {
    if (!event || !isOutcome(event.outcome)) continue;
    for (const dim of DIMENSIONS) {
      const original = cleanValue(dim.pick(event));
      if (!original) continue;
      const value = original.toLowerCase();
      const key = `${dim.dimension}:${value}`;
      let tally = map.get(key);
      if (!tally) {
        tally = { dimension: dim.dimension, value, display: original, published: 0, discarded: 0, total: 0, keepRate: 0 };
        map.set(key, tally);
      }
      if (event.outcome === "published") tally.published += 1;
      else tally.discarded += 1;
      tally.total += 1;
    }
  }
  for (const tally of map.values()) {
    tally.keepRate = tally.total > 0 ? tally.published / tally.total : 0;
  }
  return Array.from(map.values());
}

export interface OutcomeSummary {
  /** Values the user reliably keeps (keepRate ≥ KEEP_RATE_HIGH, above floor). */
  kept: DimTally[];
  /** Values the user reliably discards (keepRate ≤ KEEP_RATE_LOW, above floor). */
  discarded: DimTally[];
}

/**
 * Splits the tallies into a "keeps" and a "discards" side, dropping everything
 * below the sample floor and everything with no clear lean. Kept is ordered by
 * strongest keep-rate first; discarded by strongest discard-rate first; ties by
 * larger sample so the most-evidenced pattern leads.
 */
export function summarizeOutcomes(events: OutcomeEvent[], minSample: number = MIN_OUTCOME_SAMPLE): OutcomeSummary {
  const eligible = tallyOutcomes(events).filter((t) => t.total >= minSample);
  const kept = eligible
    .filter((t) => t.keepRate >= KEEP_RATE_HIGH)
    .sort((a, b) => b.keepRate - a.keepRate || b.total - a.total);
  const discarded = eligible
    .filter((t) => t.keepRate <= KEEP_RATE_LOW)
    .sort((a, b) => a.keepRate - b.keepRate || b.total - a.total);
  return { kept, discarded };
}

function noun(t: DimTally): string {
  // "LinkedIn drafts", "Reel drafts", "video drafts" — all read naturally.
  return `${t.display} drafts`;
}

/**
 * Renders the track record as prompt bullets. Returns "" when nothing clears the
 * sample floor with a clear lean, so the caller omits the whole section — the
 * model is never told about a pattern that doesn't exist. The section heading and
 * framing are added by the prompt assembler; this returns only the body lines.
 */
export function formatOutcomesForPrompt(events: OutcomeEvent[], minSample: number = MIN_OUTCOME_SAMPLE): string {
  const { kept, discarded } = summarizeOutcomes(events, minSample);
  if (kept.length === 0 && discarded.length === 0) return "";

  const lines: string[] = [];
  for (const t of kept.slice(0, MAX_LINES_PER_SIDE)) {
    lines.push(`- You publish most ${noun(t)} (${t.published} of ${t.total} kept).`);
  }
  for (const t of discarded.slice(0, MAX_LINES_PER_SIDE)) {
    lines.push(`- You usually discard ${noun(t)} (${t.published} of ${t.total} kept).`);
  }
  return lines.join("\n");
}
