// ============================================================================
// TURN FLOW
//
// The decisions a controller turn makes about ITS OWN shape: how many tools may
// run at once, which ones must never run beside each other, what a stopped turn
// leaves behind, and how the next turn reads a conversation that was interrupted.
//
// It lives on its own, with zero imports, for one reason: every rule here is the
// difference between Stop working and Stop appearing to work, and each is worth
// a unit test that does not need a database, a model or a network.
// ============================================================================

/** Reads a bounded integer from the environment. Junk falls back, out-of-range clamps. */
export function envInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env[name];
  const parsed = raw === undefined || raw === null || String(raw).trim() === "" ? NaN : Number(raw);
  const value = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  return Math.min(max, Math.max(min, value));
}

/** Reads a comma-separated list from the environment; an empty value keeps the fallback. */
export function envList(
  name: string,
  fallback: string[],
  env: Record<string, string | undefined> = process.env
): string[] {
  const raw = env[name];
  if (typeof raw !== "string") return fallback;
  const items = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

/**
 * How many independent tools may run in one batch. Four keeps a model that asked
 * for twenty calls from hammering every downstream API at once.
 * Override: CONTROLLER_MAX_PARALLEL_TOOLS.
 */
export const MAX_PARALLEL_TOOLS = envInt("CONTROLLER_MAX_PARALLEL_TOOLS", 4, 1, 8);

/**
 * Tools that must run one at a time. The media models are rate-limited per
 * minute, so four parallel renders do not go four times faster — they trip the
 * 429 and every one of them then sits in a retry/backoff storm the user watches.
 * Override: CONTROLLER_SERIAL_TOOLS.
 */
export const SERIAL_TOOLS = new Set(
  envList("CONTROLLER_SERIAL_TOOLS", ["generate_image", "generate_video", "heygen_generate_video"])
);

/**
 * Groups one round of tool calls into batches the runtime awaits in order:
 * a quota-bound tool gets a batch to itself, everything else fills up to the
 * cap. The model's own ordering is preserved, so a dependent chain still runs
 * in the sequence it asked for.
 */
export function batchCalls<T extends { name: string }>(
  calls: T[],
  resolveName: (name: string) => string,
  options: { maxParallel?: number; serialTools?: Set<string> } = {}
): T[][] {
  const maxParallel = Math.max(1, options.maxParallel ?? MAX_PARALLEL_TOOLS);
  const serialTools = options.serialTools ?? SERIAL_TOOLS;

  const batches: T[][] = [];
  let current: T[] = [];

  const flush = () => {
    if (current.length > 0) {
      batches.push(current);
      current = [];
    }
  };

  for (const call of calls) {
    if (serialTools.has(resolveName(call.name))) {
      flush();
      batches.push([call]);
      continue;
    }
    current.push(call);
    if (current.length >= maxParallel) flush();
  }

  flush();
  return batches;
}

// ---------------------------------------------------------------------------
// Interrupted turns
// ---------------------------------------------------------------------------

export interface TurnMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * What the model is told about a request that was stopped mid-flight. Without
 * this the next turn sees an unanswered instruction as the newest thing said and
 * carries on with it: the user presses Stop on a media job, types "hi", and the
 * controller goes back to generating images.
 */
export const INTERRUPTED_TURN_NOTE =
  "(This request was interrupted and never completed. Treat it as abandoned: answer the next message on its own " +
  "terms and do not resume this work unless the user asks for it again.)";

/**
 * Closes every user turn that has no answer after it, so no user message is ever
 * the last thing the model sees except the live one, and two user rows never sit
 * next to each other. Returns a new array; the input is not touched.
 *
 * A stopped turn can leave a dangling row in two ways: the route saves the
 * marker and lives, or the serverless request is killed by the abort and never
 * saves anything at all. This handles both, because it reads the shape of the
 * history rather than trusting that a marker was written.
 */
export function closeDanglingRequests<T extends TurnMessage>(all: T[]): TurnMessage[] {
  const out: TurnMessage[] = [];

  for (let i = 0; i < all.length; i++) {
    const message = all[i];
    out.push(message);
    if (message.role !== "user") continue;

    const next = all[i + 1];
    if (!next || next.role === "user") {
      out.push({ role: "assistant", content: INTERRUPTED_TURN_NOTE });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Settling tool rows
// ---------------------------------------------------------------------------

export interface SettleableRun {
  phase: string;
  progress?: string;
  summary?: string;
  error?: string;
  durationMs?: number;
}

/**
 * Moves every still-running row to a final phase. A row persisted as "running"
 * is a spinner that never stops — on the screen while the turn is over, and
 * again on every reload of that message.
 *
 * Returns only the rows it changed, so the caller can emit exactly those.
 */
export function settleRuns<T extends SettleableRun>(
  runs: T[],
  phase: "cancelled" | "error",
  note: string,
  startedAt?: number
): T[] {
  const changed: T[] = [];

  for (const run of runs) {
    if (run.phase !== "running") continue;
    run.phase = phase;
    run.progress = undefined;
    if (phase === "cancelled") run.summary = note;
    else run.error = note;
    if (typeof run.durationMs !== "number" && typeof startedAt === "number") {
      run.durationMs = Math.max(0, Date.now() - startedAt);
    }
    changed.push(run);
  }

  return changed;
}
