// ============================================================================
// PER-MODEL REQUEST PACER (Vertex AI quota)
//
// Vertex enforces requests-per-minute per model, per region, and that ceiling is
// enforced INDEPENDENTLY of billing: a project sitting on $200 of unused credit
// still gets `429 RESOURCE_EXHAUSTED` the moment it exceeds its per-minute
// allowance. Credit buys the tokens, quota governs the rate — topping up the
// balance does nothing for a 429.
//
// So retrying after the fact is only half a fix. If eight slides of one deck are
// fired inside ten seconds, the pipeline manufactures the very 429 it then has to
// absorb, and every retry lands inside the same closed window. The other half is
// not sending the request until the window has room.
//
// This module owns that decision. One sliding 60s window per model id, shared by
// every request in the process, so the slides of one deck and several families
// rendering at once all draw from the same allowance. `penalize()` shrinks that
// allowance when the provider says 429 anyway — the configured RPM is an estimate,
// the 429 is a fact, and the fact wins.
// ============================================================================

import { sleep } from "@/lib/agents/concurrency";

export type RateLimiterOptions = {
  /** Requests admitted per window. The deployment's quota, not a code constant. */
  limit: number;
  /** Window length. Vertex quotas are per minute; only tests need anything else. */
  windowMs?: number;
  /** How long a 429 keeps the reduced allowance in force. */
  penaltyMs?: number;
};

export type AcquireOptions = {
  signal?: AbortSignal;
  /**
   * Called when the request has to hold for the window to reopen, so the caller can
   * tell the user *why* nothing is happening instead of looking stalled.
   */
  onWait?: (waitMs: number, info: { used: number; limit: number }) => void;
};

export type RatePacer = {
  /** Resolves when it is this caller's turn to send. Returns early if aborted. */
  acquire(opts?: AcquireOptions): Promise<void>;
  /** Records a provider rate rejection: halves the allowance and shuts the window. */
  penalize(retryAfterMs?: number): void;
  /** Current allowance, after any active penalty. */
  limit(): number;
  /** Human summary for an error message: "6/min (throttled to 3 after a 429)". */
  describe(): string;
};

const DEFAULT_WINDOW_MS = 60_000;

export function createRatePacer(options: RateLimiterOptions): RatePacer {
  const windowMs = Math.max(1_000, Math.floor(options.windowMs ?? DEFAULT_WINDOW_MS));
  const configured = Math.max(1, Math.floor(options.limit) || 1);
  const penaltyMs = Math.max(windowMs, Math.floor(options.penaltyMs ?? windowMs * 2));

  /** When each admitted request went out, oldest first. */
  const sent: number[] = [];
  /** Reduced allowance after a 429, and the moment it lapses. */
  let penalizedLimit = 0;
  let penalizedUntil = 0;
  /** Hard "nothing before this" stamp, from the provider's own retryDelay. */
  let blockedUntil = 0;
  /**
   * Admission is serialised. Two callers checking the same free slot concurrently
   * would both take it, which is exactly the burst this module exists to prevent.
   */
  let gate: Promise<void> = Promise.resolve();

  const currentLimit = () => {
    if (penalizedLimit > 0 && penalizedUntil <= Date.now()) penalizedLimit = 0;
    return penalizedLimit > 0 ? penalizedLimit : configured;
  };

  const prune = (now: number) => {
    while (sent.length > 0 && now - sent[0] >= windowMs) sent.shift();
  };

  const admit = async (opts: AcquireOptions) => {
    // Re-checked in a loop rather than computed once: waiting for one slot can be
    // overtaken by a fresh penalty, and the new limit has to be honoured.
    for (;;) {
      if (opts.signal?.aborted) return;

      const now = Date.now();
      if (blockedUntil > now) {
        const waitMs = blockedUntil - now;
        opts.onWait?.(waitMs, { used: sent.length, limit: currentLimit() });
        await sleep(waitMs, opts.signal);
        continue;
      }

      prune(now);
      const limit = currentLimit();
      if (sent.length < limit) {
        sent.push(now);
        return;
      }

      // The oldest request in the window has to age out before this one may go.
      // The 50ms cushion keeps a rounding error from re-entering a full window.
      const waitMs = Math.max(50, windowMs - (now - sent[0]) + 50);
      opts.onWait?.(waitMs, { used: sent.length, limit });
      await sleep(waitMs, opts.signal);
    }
  };

  const acquire = (opts: AcquireOptions = {}) => {
    const turn = gate.then(() => admit(opts));
    // The queue must survive one caller aborting or throwing, so the chain the next
    // caller waits on is deliberately a settled-either-way version of this turn.
    gate = turn.then(
      () => undefined,
      () => undefined
    );
    return turn;
  };

  const penalize = (retryAfterMs?: number) => {
    const now = Date.now();
    penalizedLimit = Math.max(1, Math.floor(currentLimit() / 2));
    penalizedUntil = now + Math.max(penaltyMs, retryAfterMs && retryAfterMs > 0 ? retryAfterMs : 0);
    if (retryAfterMs && retryAfterMs > 0) {
      blockedUntil = Math.max(blockedUntil, now + retryAfterMs);
    }
    // The provider has just told us this window is full, so treat it as full even if
    // our own count disagrees — that disagreement IS the news, and it means the
    // configured RPM is above what the project is actually allowed.
    prune(now);
    while (sent.length < penalizedLimit) sent.push(now);
  };

  const describe = () =>
    penalizedLimit > 0 && penalizedUntil > Date.now()
      ? `${configured}/min (throttled to ${penalizedLimit}/min after a quota rejection)`
      : `${configured}/min`;

  return { acquire, penalize, limit: currentLimit, describe };
}

/**
 * One pacer per model id, for the lifetime of the process. Module state is the
 * point: every render in every concurrent campaign has to queue behind the same
 * window, because the quota they are spending is the same quota. (A dev-server
 * hot reload resets it, which only costs one relearned penalty.)
 */
const pacers = new Map<string, RatePacer>();

export function getModelRatePacer(model: string, options: RateLimiterOptions): RatePacer {
  const key = model || "default";
  const existing = pacers.get(key);
  if (existing) return existing;
  const created = createRatePacer(options);
  pacers.set(key, created);
  return created;
}
