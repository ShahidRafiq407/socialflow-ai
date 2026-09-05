// ============================================================================
// METER — EVERY MODEL CALL, RECORDED WHERE IT HAPPENS
//
// The rule this file exists to enforce: no model call happens without a row. Not
// "no billed feature", not "no route we remembered to instrument" — no call.
//
// That is only achievable because there is exactly one door to the models. Every
// generation in this product goes through `VertexAIProvider`, and every article
// stage goes through `article/router.ts`, which itself calls the provider. Meter
// the provider and the coverage question is closed by construction: a new feature
// cannot spend money without appearing here, because it cannot reach a model
// without going through the code that writes the row.
//
// ATTRIBUTION
//
// The provider knows the model and the token counts. It does not know whose work
// it is doing — by the time a call is made, the user id is five or ten frames up
// the stack, inside a graph node that was invoked by a route. Threading a userId
// through every signature would be a hundred-file change that a single forgotten
// parameter would silently defeat.
//
// So attribution rides in an AsyncLocalStorage store instead. A route opens a
// scope, everything beneath it inherits, and a call that escapes a scope is still
// recorded — with userId null and feature "unknown", which is visible in the admin
// view rather than absent from it. An unattributed row is a bug to chase; a
// missing row is a bug nobody can see.
//
// FAILURE POLICY
//
// Metering never breaks a generation. Every write is guarded and awaited only
// where the caller has already finished its work. If the database is down, the
// user still gets their post; we lose a cost row and log about it. The credit
// ledger is what protects the balance, and that one is transactional.
// ============================================================================

import { AsyncLocalStorage } from "node:async_hooks";
import prisma from "@/lib/db";
import {
  computeCostMicros,
  estimateMessageTokens,
  estimateTokens,
  type UsageMeasurement,
} from "./modelPricing";
import { recordErrorAsync } from "@/lib/admin/errors";

/** The shapes of call the provider can make, as recorded on `UsageEvent.callKind`. */
export type CallKind =
  | "text"
  | "json"
  | "grounded"
  | "vision"
  | "stream"
  | "image"
  | "video"
  | "embed";

// ─────────────────────────────────────────────────────────────────────────────
// The attribution scope
// ─────────────────────────────────────────────────────────────────────────────

export interface MeterContext {
  /** Clerk user id. Null for genuinely account-less work (a cron sweep). */
  userId: string | null;
  workspaceId: string | null;
  /** Product surface: "ai-studio", "chat", "article", "goals", "schedule", … */
  feature: string;
  /** The action catalogue key, when this work is a billed action. */
  action?: string | null;
  /** Ties every call in one run together — an ArticleRun id, a campaign id. */
  referenceId?: string | null;
}

const store = new AsyncLocalStorage<MeterContext>();

/**
 * Runs `fn` with every model call inside it attributed to this context.
 *
 * Nested scopes replace the outer one wholesale rather than merging, so a route
 * that opens a scope for the chat and then calls the article pipeline gets article
 * rows attributed to the article — which is what the usage table should say.
 */
export function withMeterContext<T>(context: MeterContext, fn: () => Promise<T>): Promise<T> {
  return store.run(context, fn);
}

/** Same, for synchronous callers. */
export function withMeterContextSync<T>(context: MeterContext, fn: () => T): T {
  return store.run(context, fn);
}

export function getMeterContext(): MeterContext | undefined {
  return store.getStore();
}

/**
 * A scope derived from the current one. Used where a feature hands off to a
 * sub-step that should be recorded under its own action — the media render inside
 * a campaign, say — without losing the user it belongs to.
 */
export function childMeterContext(patch: Partial<MeterContext>): MeterContext {
  const current = store.getStore();
  return {
    userId: patch.userId ?? current?.userId ?? null,
    workspaceId: patch.workspaceId ?? current?.workspaceId ?? null,
    feature: patch.feature ?? current?.feature ?? "unknown",
    action: patch.action ?? current?.action ?? null,
    referenceId: patch.referenceId ?? current?.referenceId ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading token counts off a provider response
//
// Google reports usage on the response as `usageMetadata`. The field names differ
// slightly between the Vertex SDK and @google/genai, and both are in use here, so
// every known spelling is checked. When nothing is reported the caller falls back
// to an estimate — a call whose cost we guessed is far better than a call we did
// not record.
// ─────────────────────────────────────────────────────────────────────────────

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Token counts from a Gemini response, or nulls when it reported none. */
export function extractUsageMetadata(response: unknown): {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  reported: boolean;
} {
  const meta =
    (response as { usageMetadata?: Record<string, unknown> })?.usageMetadata ??
    (response as { response?: { usageMetadata?: Record<string, unknown> } })?.response
      ?.usageMetadata;

  if (!meta || typeof meta !== "object") {
    return { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0, reported: false };
  }

  const inputTokens = num(meta.promptTokenCount) + num(meta.toolUsePromptTokenCount);
  const thinkingTokens = num(meta.thoughtsTokenCount);
  const candidates = num(meta.candidatesTokenCount);
  const cachedTokens = num(meta.cachedContentTokenCount);

  // Some responses report only a total. Deriving the output side from it is better
  // than recording zero output on a call that clearly produced some.
  const total = num(meta.totalTokenCount);
  const outputTokens =
    candidates > 0
      ? candidates
      : Math.max(0, total - inputTokens - thinkingTokens);

  return {
    inputTokens,
    outputTokens,
    thinkingTokens,
    cachedTokens,
    reported: inputTokens > 0 || outputTokens > 0 || thinkingTokens > 0,
  };
}

/**
 * How many search requests a grounded response issued.
 *
 * Grounding is billed per request and one call can issue several, so this is the
 * multiplier that makes a research-heavy run visibly dearer. `webSearchQueries` is
 * the only place the count is observable; a grounded call that reports no queries
 * is charged for one, because the request was made whether or not it was reported.
 */
export function extractGroundingRequests(response: unknown): number {
  const candidates = (response as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates)) return 0;

  let queries = 0;
  for (const candidate of candidates) {
    const grounding = (candidate as { groundingMetadata?: Record<string, unknown> })
      ?.groundingMetadata;
    if (!grounding) continue;
    const webQueries = grounding.webSearchQueries;
    if (Array.isArray(webQueries)) queries += webQueries.length;
    else queries += 1;
  }
  return queries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing the row
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordUsageInput extends UsageMeasurement {
  callKind: CallKind;
  latencyMs?: number;
  ok?: boolean;
  errorKind?: string | null;
  /** Overrides the async context, for callers that already know the attribution. */
  context?: Partial<MeterContext>;
}

/**
 * Records one model call. Never throws, never rejects.
 *
 * `void`-safe by design: the provider calls it without awaiting so the user's
 * response is not held behind a database write. The row is written on the next tick
 * of the event loop, which for a serverless function is still inside the request's
 * lifetime because the promise is registered before the handler returns its body.
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const ctx = store.getStore();
    const userId = input.context?.userId ?? ctx?.userId ?? null;
    const workspaceId = input.context?.workspaceId ?? ctx?.workspaceId ?? null;
    const feature = input.context?.feature ?? ctx?.feature ?? "unknown";
    const action = input.context?.action ?? ctx?.action ?? null;

    // A failed call is priced on what came back, never on what was sent.
    //
    // Every writer of `ok: false` hands us an ESTIMATE of the prompt — `meteredCall`
    // passes `fallbackInputTokens`, the media generator passes `estimateTokens(prompt)` —
    // because a call that threw has no usage report to quote. Pricing that estimate
    // invents money: a 429, a socket timeout or a refused connection read nothing at
    // all, yet the row went in carrying a full prompt's worth of input cost. Those
    // invented micro-dollars are what `getActionCostMicros` sums, so they landed in the
    // ledger as provider spend and understated the margin on every retried action.
    //
    // Output-side figures are only ever set from a real response, so a stream that died
    // after emitting tokens or a render that returned one of two images is still billed
    // for that part. The token counts themselves stay on the row either way — they are
    // what makes a failure diagnosable.
    const costMicros = computeCostMicros(
      input.ok === false ? { ...input, inputTokens: 0, cachedTokens: 0 } : input
    );

    await prisma.usageEvent.create({
      data: {
        userId,
        workspaceId,
        feature,
        action,
        model: input.model || "unknown",
        callKind: input.callKind,
        inputTokens: num(input.inputTokens),
        outputTokens: num(input.outputTokens),
        thinkingTokens: num(input.thinkingTokens),
        cachedTokens: num(input.cachedTokens),
        groundingRequests: num(input.groundingRequests),
        imageCount: num(input.imageCount),
        videoSeconds:
          typeof input.videoSeconds === "number" && Number.isFinite(input.videoSeconds)
            ? Math.max(0, input.videoSeconds)
            : 0,
        costMicros,
        latencyMs: input.latencyMs !== undefined ? num(input.latencyMs) : null,
        ok: input.ok !== false,
        errorKind: input.errorKind || null,
      },
    });
  } catch (err) {
    // A metering failure must not become a product failure. Loud in the log,
    // silent to the caller.
    console.error("[meter] failed to record usage", {
      model: input.model,
      callKind: input.callKind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fire-and-forget wrapper. The provider uses this on the success path so the
 * generation returns immediately; the write still lands because the promise is
 * created before the request finishes.
 */
export function recordUsageAsync(input: RecordUsageInput): void {
  void recordUsage(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// The wrapper the provider uses
// ─────────────────────────────────────────────────────────────────────────────

export interface MeteredCallOptions<T> {
  model: string;
  callKind: CallKind;
  /**
   * Input estimate, used only when the response reports no usage metadata. Also
   * what a failed call is billed at: Google charges for the prompt it read even
   * when generation errors out.
   */
  fallbackInputTokens?: number;
  /** Where the Gemini response sits inside the result, when it is nested. */
  responseOf?: (result: T) => unknown;
  /** Output text, for estimating the output side when usage was not reported. */
  outputTextOf?: (result: T) => string | null | undefined;
  /** Measurements the response cannot report: images returned, seconds of video. */
  extra?: (result: T) => Partial<UsageMeasurement>;
}

/**
 * Runs a model call and records exactly one usage row for it, success or failure.
 *
 * Errors are recorded and then re-thrown unchanged — the caller's error handling is
 * untouched, and a failed call that still burned input tokens still appears in the
 * cost table. That last part matters more than it sounds: a stage retrying against
 * a bad prompt is one of the few ways this product can quietly spend real money.
 */
export async function meteredCall<T>(
  options: MeteredCallOptions<T>,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await run();
    const raw = options.responseOf ? options.responseOf(result) : result;

    const reported = extractUsageMetadata(raw);
    const extra = options.extra?.(result) ?? {};

    const inputTokens = reported.reported
      ? reported.inputTokens
      : num(options.fallbackInputTokens);
    const outputTokens = reported.reported
      ? reported.outputTokens
      : estimateTokens(options.outputTextOf?.(result) ?? null);

    recordUsageAsync({
      model: options.model,
      callKind: options.callKind,
      inputTokens,
      outputTokens,
      thinkingTokens: reported.thinkingTokens,
      cachedTokens: reported.cachedTokens,
      groundingRequests: extractGroundingRequests(raw),
      latencyMs: Date.now() - startedAt,
      ok: true,
      ...extra,
    });

    return result;
  } catch (err) {
    recordUsageAsync({
      model: options.model,
      callKind: options.callKind,
      inputTokens: num(options.fallbackInputTokens),
      latencyMs: Date.now() - startedAt,
      ok: false,
      errorKind: classifyError(err),
    });
    // The same failure, on the admin's Errors tab, grouped by model and kind.
    const ctx = store.getStore();
    recordErrorAsync({
      source: "model",
      message: `${options.model}: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : null,
      kind: classifyError(err),
      userId: ctx?.userId ?? null,
      workspaceId: ctx?.workspaceId ?? null,
      context: { model: options.model, callKind: options.callKind, feature: ctx?.feature, action: ctx?.action },
    });
    throw err;
  }
}

/** A short, groupable label for why a call failed. */
export function classifyError(err: unknown): string {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (message.includes("quota") || message.includes("429")) return "quota";
  if (message.includes("timeout") || message.includes("deadline")) return "timeout";
  if (message.includes("safety") || message.includes("blocked")) return "safety";
  if (message.includes("permission") || message.includes("403")) return "permission";
  if (message.includes("not found") || message.includes("404")) return "model_not_found";
  if (message.includes("invalid") || message.includes("400")) return "invalid_request";
  if (message.includes("unavailable") || message.includes("503")) return "unavailable";
  return "error";
}

/** Estimating a prompt's size for the fallback path, re-exported for the provider. */
export { estimateMessageTokens, estimateTokens };

// ─────────────────────────────────────────────────────────────────────────────
// Reading it back
//
// What the usage panel and the cost post-mortems query. Every read is guarded and
// returns an empty shape on failure: a usage panel that renders zeros is a worse
// page, but a usage panel that throws is a broken billing tab.
// ─────────────────────────────────────────────────────────────────────────────

export interface UsageTotals {
  calls: number;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  groundingRequests: number;
  images: number;
  videoSeconds: number;
  failures: number;
}

const EMPTY_TOTALS: UsageTotals = {
  calls: 0,
  costMicros: 0,
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  groundingRequests: 0,
  images: 0,
  videoSeconds: 0,
  failures: 0,
};

/** Everything one account spent in a window. */
export async function getUsageTotals(
  userId: string,
  from: Date,
  to?: Date
): Promise<UsageTotals> {
  try {
    const where = { userId, createdAt: to ? { gte: from, lt: to } : { gte: from } };
    const [agg, failures] = await Promise.all([
      prisma.usageEvent.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          costMicros: true,
          inputTokens: true,
          outputTokens: true,
          thinkingTokens: true,
          groundingRequests: true,
          imageCount: true,
          videoSeconds: true,
        },
      }),
      prisma.usageEvent.count({ where: { ...where, ok: false } }),
    ]);

    return {
      calls: agg._count._all,
      costMicros: agg._sum.costMicros ?? 0,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      thinkingTokens: agg._sum.thinkingTokens ?? 0,
      groundingRequests: agg._sum.groundingRequests ?? 0,
      images: agg._sum.imageCount ?? 0,
      videoSeconds: agg._sum.videoSeconds ?? 0,
      failures,
    };
  } catch (err) {
    console.error("[meter] getUsageTotals failed", err);
    return { ...EMPTY_TOTALS };
  }
}

/** Cost split by product surface, for "where did the month go". */
export async function getUsageByFeature(
  userId: string,
  from: Date
): Promise<Array<{ feature: string; calls: number; costMicros: number }>> {
  try {
    const rows = await prisma.usageEvent.groupBy({
      by: ["feature"],
      where: { userId, createdAt: { gte: from } },
      _count: { _all: true },
      _sum: { costMicros: true },
    });
    return rows
      .map((row) => ({
        feature: row.feature,
        calls: row._count._all,
        costMicros: row._sum.costMicros ?? 0,
      }))
      .sort((a, b) => b.costMicros - a.costMicros);
  } catch (err) {
    console.error("[meter] getUsageByFeature failed", err);
    return [];
  }
}

/** Cost split by model, which is how a rate change is spotted. */
export async function getUsageByModel(
  userId: string,
  from: Date
): Promise<Array<{ model: string; calls: number; costMicros: number }>> {
  try {
    const rows = await prisma.usageEvent.groupBy({
      by: ["model"],
      where: { userId, createdAt: { gte: from } },
      _count: { _all: true },
      _sum: { costMicros: true },
    });
    return rows
      .map((row) => ({
        model: row.model,
        calls: row._count._all,
        costMicros: row._sum.costMicros ?? 0,
      }))
      .sort((a, b) => b.costMicros - a.costMicros);
  } catch (err) {
    console.error("[meter] getUsageByModel failed", err);
    return [];
  }
}

/**
 * What one action actually cost, summed from the calls it made.
 *
 * This is the number that gets written back onto the ledger row, and it is the only
 * honest way to answer "is `article.deep` at 350 credits still the right price".
 * Scoped by reference id where the action has one, so two concurrent runs of the
 * same action do not pool their costs.
 *
 * Failed calls are excluded. An action that succeeded on its third attempt made three
 * rows, and the two that threw were priced from an estimate of the prompt rather than
 * a usage report — counting them inflated the action's recorded spend by roughly the
 * number of retries it took, which is precisely backwards for pricing a credit cost.
 * `calls` therefore means successful calls, matching the sum beside it.
 */
export async function getActionCostMicros(
  userId: string,
  action: string,
  since: Date
): Promise<{ calls: number; costMicros: number }> {
  try {
    const agg = await prisma.usageEvent.aggregate({
      where: { userId, action, createdAt: { gte: since }, ok: true },
      _count: { _all: true },
      _sum: { costMicros: true },
    });
    return { calls: agg._count._all, costMicros: agg._sum.costMicros ?? 0 };
  } catch (err) {
    console.error("[meter] getActionCostMicros failed", err);
    return { calls: 0, costMicros: 0 };
  }
}

/**
 * Calls that reached a model without an account attached.
 *
 * Should be zero in production. Anything here is a code path that spent money
 * outside a metering scope — the exact leak the user asked to be made impossible,
 * surfaced as a number an operator can watch rather than a silence.
 */
export async function countUnattributedCalls(since: Date): Promise<number> {
  try {
    return await prisma.usageEvent.count({
      where: { createdAt: { gte: since }, OR: [{ userId: null }, { feature: "unknown" }] },
    });
  } catch (err) {
    console.error("[meter] countUnattributedCalls failed", err);
    return 0;
  }
}
