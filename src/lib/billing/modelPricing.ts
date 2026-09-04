// ============================================================================
// MODEL PRICING — WHAT A CALL ACTUALLY COST US
//
// Credits are what the customer is charged. This file is what the work cost, and
// the two are deliberately computed from different inputs: if an action's credit
// price drifts away from its real cost, the difference shows up here rather than
// on a provider invoice three weeks later.
//
// Rates are Google's published list prices, read September 2026, standard tier.
// Every one carries the date it was read, because a rate with no date is a rate
// nobody will ever dare update.
//
// Two things about Gemini 3.x that the arithmetic has to respect:
//
//   Thinking tokens bill as output. There is no separate rate; a reasoning-heavy
//   call is simply an expensive one.
//   Grounding bills per search request on top of tokens — $14 per 1,000 after the
//   first 5,000 in a month. One call can issue several searches.
//
// Costs are integers in micro-dollars (1_000_000 = $1). Floats accumulate error
// across millions of rows, and these rows are what pricing decisions rest on.
// ============================================================================

/** Rates as read from Google's pricing page on this date. */
export const RATES_READ_ON = "2026-09-04";

/** $1 expressed in the unit `UsageEvent.costMicros` uses. */
export const MICROS_PER_USD = 1_000_000;

export interface ModelRate {
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /**
   * USD per 1M output tokens. Thinking tokens are billed at this rate — Gemini
   * 3.x does not price them separately.
   */
  outputPerMTok: number;
  /** USD per 1M cached input tokens, when the model supports caching. */
  cachedPerMTok?: number;
  /** USD per generated image, for models priced per image. */
  perImage?: number;
  /** USD per second of generated video. */
  perVideoSecond?: number;
  /** Above this many input tokens the long-context rates apply. */
  longContextThreshold?: number;
  longContextInputPerMTok?: number;
  longContextOutputPerMTok?: number;
  /** What this model is used for, so a row in the usage table explains itself. */
  role?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The rate card
//
// Keys are the exact model ids this codebase asks for — see MODELS in
// src/lib/agents/llm.ts, IMAGE_MODEL_ID / VIDEO_MODEL_ID in agents/mediaModels.ts
// and CONTROLLER_MODEL_ID in agents/controller/models.ts. Every id those files can
// produce by default has a row here.
// ─────────────────────────────────────────────────────────────────────────────

export const MODEL_RATES: Record<string, ModelRate> = {
  // The frontier model: writing, reasoning, orchestration, the CEO chat, articles.
  // Nearly all text spend in the product lands on this row.
  "gemini-3.1-pro-preview": {
    inputPerMTok: 2.0,
    outputPerMTok: 12.0,
    cachedPerMTok: 0.2,
    longContextThreshold: 200_000,
    longContextInputPerMTok: 4.0,
    longContextOutputPerMTok: 18.0,
    role: "Writing, reasoning, chat controller, article generator",
  },

  // Research and the controller's background chores (session naming, summaries).
  "gemini-3.6-flash": {
    inputPerMTok: 0.75,
    outputPerMTok: 3.75,
    cachedPerMTok: 0.075,
    role: "Grounded research, utility calls",
  },

  // Competitor scans and the cheapest classification work.
  "gemini-3.5-flash-lite": {
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    cachedPerMTok: 0.03,
    role: "Competitor scan, best-time scheduling",
  },

  // Media. Images are priced per render plus the prompt's own input tokens; the
  // per-image figure moves with resolution, and the 2K number is what the product
  // asks for by default.
  "gemini-3.1-flash-image": {
    inputPerMTok: 0.75,
    outputPerMTok: 3.75,
    perImage: 0.101,
    role: "Default image renders (up to 2K)",
  },
  "gemini-3-pro-image": {
    inputPerMTok: 2.0,
    outputPerMTok: 12.0,
    perImage: 0.134,
    role: "Premium image renders",
  },
  "gemini-2.5-flash-image": {
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    perImage: 0.039,
    role: "Legacy image model, still selectable",
  },

  // Video is billed per second of output. Nothing else in the product is close.
  "gemini-omni-flash-preview": {
    inputPerMTok: 0.75,
    outputPerMTok: 3.75,
    perVideoSecond: 0.1,
    role: "Video generation (720p)",
  },

  // Embeddings: input only, no output side.
  "text-embedding-004": {
    inputPerMTok: 0.15,
    outputPerMTok: 0,
    role: "Embeddings for memory and search",
  },
};

/**
 * Charged per search request, not per call — a single grounded call can issue
 * several. The first 5,000 requests each month are free, but that allowance is an
 * account-wide monthly pool and cannot be attributed to one call, so every request
 * is recorded at the paid rate. The ledger therefore reads as an upper bound on
 * grounding cost, which is the safe direction for a number pricing rests on.
 */
export const GROUNDING_USD_PER_1K_REQUESTS = 14;
export const GROUNDING_FREE_REQUESTS_PER_MONTH = 5_000;

/**
 * What an unrecognised model is charged at.
 *
 * Deliberately the most expensive text rate on the card. An unknown model is
 * usually a newer, dearer one, and a metering layer that prices the unknown at
 * zero is a metering layer that silently stops working the day a model id changes.
 */
export const FALLBACK_RATE: ModelRate = {
  inputPerMTok: 4.0,
  outputPerMTok: 18.0,
  role: "Unrecognised model — priced at the ceiling",
};

/**
 * True when this exact id is on the rate card. Used by the admin cost view to show
 * which rows are priced from a real rate and which fell back to the ceiling.
 */
export function isKnownModel(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_RATES, model);
}

/**
 * The rate for a model id.
 *
 * Exact match first, then the longest key the id starts with — so a dated release
 * like `gemini-3.1-pro-preview-09-2026` prices as `gemini-3.1-pro-preview` rather
 * than falling to the ceiling. Anything unrecognised gets `FALLBACK_RATE`.
 */
export function resolveRate(model: string | null | undefined): ModelRate {
  const id = (model || "").trim();
  if (!id) return FALLBACK_RATE;
  const exact = MODEL_RATES[id];
  if (exact) return exact;

  let best: { key: string; rate: ModelRate } | null = null;
  for (const [key, rate] of Object.entries(MODEL_RATES)) {
    if (!id.startsWith(key)) continue;
    if (!best || key.length > best.key.length) best = { key, rate };
  }
  return best?.rate ?? FALLBACK_RATE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost arithmetic
// ─────────────────────────────────────────────────────────────────────────────

/** What one call consumed. Every field optional; a missing field counts as zero. */
export interface UsageMeasurement {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /**
   * Reasoning tokens, when the provider reports them separately. Billed at the
   * output rate. Pass them here rather than folded into `outputTokens` so the
   * usage row can show how much of a call was thinking nobody read.
   */
  thinkingTokens?: number;
  /** Input tokens served from cache, billed at the cheaper cached rate. */
  cachedTokens?: number;
  /** Search requests the call issued, for grounded calls. */
  groundingRequests?: number;
  /** Images returned. */
  imageCount?: number;
  /** Seconds of video returned. */
  videoSeconds?: number;
}

/** USD per token, from a per-1M-token rate. */
function perToken(perMTok: number): number {
  return perMTok / 1_000_000;
}

function nonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * What this call cost, in micro-dollars, rounded up.
 *
 * Rounding up rather than to nearest: a metering layer that rounds thousands of
 * sub-micro-dollar calls down reports a total lower than the invoice. Ceiling means
 * the recorded cost is never less than the real one, and the error is at most one
 * micro-dollar per call.
 */
export function computeCostMicros(usage: UsageMeasurement): number {
  const rate = resolveRate(usage.model);

  const input = nonNegative(usage.inputTokens);
  const output = nonNegative(usage.outputTokens);
  const thinking = nonNegative(usage.thinkingTokens);
  const cached = Math.min(nonNegative(usage.cachedTokens), input);
  const billableInput = input - cached;

  // Long context is priced on the input size of the call, and when it applies it
  // applies to both sides of the call.
  const longContext =
    rate.longContextThreshold !== undefined && input > rate.longContextThreshold;

  const inputRate = longContext
    ? rate.longContextInputPerMTok ?? rate.inputPerMTok
    : rate.inputPerMTok;
  const outputRate = longContext
    ? rate.longContextOutputPerMTok ?? rate.outputPerMTok
    : rate.outputPerMTok;

  let usd = 0;
  usd += billableInput * perToken(inputRate);
  usd += cached * perToken(rate.cachedPerMTok ?? inputRate);
  // Thinking tokens bill as output — there is no separate rate for them.
  usd += (output + thinking) * perToken(outputRate);
  usd += nonNegative(usage.imageCount) * (rate.perImage ?? 0);
  usd += nonNegative(usage.videoSeconds) * (rate.perVideoSecond ?? 0);
  usd += nonNegative(usage.groundingRequests) * (GROUNDING_USD_PER_1K_REQUESTS / 1_000);

  return Math.ceil(usd * MICROS_PER_USD);
}

/** The same figure in credits, for comparing what we charged against what it cost. */
export function costMicrosToCredits(costMicros: number): number {
  return costMicros / 10_000;
}

/** `$1.86`, `$0.0123`, `$0` — enough precision to be worth reading at any size. */
export function formatMicros(costMicros: number): string {
  const usd = costMicros / MICROS_PER_USD;
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * A token count for text, when the provider did not report usage metadata.
 *
 * Four characters per token is the rule of thumb Google publishes for Gemini and
 * it is close enough for cost attribution. Always an estimate, never a bill — the
 * usage row records which of the two it was.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimated tokens for a whole message array, including role overhead. */
export function estimateMessageTokens(
  messages: Array<{ role?: string; content?: unknown }> | null | undefined
): number {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const message of messages) {
    const content = message?.content;
    const text = typeof content === "string" ? content : content ? JSON.stringify(content) : "";
    // ~4 tokens of per-message envelope (role, delimiters) on top of the content.
    total += estimateTokens(text) + 4;
  }
  return total;
}
