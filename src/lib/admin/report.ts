// ============================================================================
// FAILURES THE USER ALREADY SAW
//
// The Errors tab used to be fed by two writers: Next's unhandled-error hook, and
// the metering layer when a model call threw. Between them they missed the whole
// class of failure that matters most — the one a user actually hit. Every big
// surface in this product catches its own errors and answers politely ("couldn't
// generate that image, try again"), so the request completes, `onRequestError`
// never fires, and the admin has no idea it happened.
//
// Worse are the silent ones: a five-slide carousel that came back with three, a
// post published without its visual, a rewritten slide that is really a canned
// placeholder. Those answer `success: true`. Nobody was ever going to hear about
// them.
//
// So: one call, from inside the catch, right where the product decided to carry on.
// It never throws, never blocks, and takes the user from the ambient metering scope
// when the caller does not name one. Secrets are stripped by `redactContext`.
// ============================================================================

import { recordErrorAsync } from "./errors";
import { classifyError, getMeterContext } from "@/lib/billing/meter";

export interface UserFailure {
  /**
   * Where it happened, in the words the admin reads on the badge:
   * "media", "chat", "article", "publish", "goals". Kept short — it is the
   * grouping key, so one value per surface, not one per call site.
   */
  feature: string;
  /** What the user was trying to do and what did not happen. One line. */
  message: string;
  /** The caught value, for the stack and the failure kind. */
  error?: unknown;
  /** Overrides the ambient scope. */
  userId?: string | null;
  workspaceId?: string | null;
  /** The post, run or campaign the user can point at. Goes in the context. */
  referenceId?: string | null;
  /**
   * True when the product answered as though it had worked — a placeholder slide,
   * a text-only post, three slides out of five. Flagged rather than dropped,
   * because a "successful" degraded answer is the failure nobody reports.
   */
  degraded?: boolean;
  context?: Record<string, unknown> | null;
}

/**
 * Records a caught, user-visible failure. Fire and forget: safe to call from a
 * catch block that is about to return a friendly answer.
 */
export function reportUserFailure(failure: UserFailure): void {
  const scope = getMeterContext();
  const err = failure.error;
  const detail = err instanceof Error ? err.message : err ? String(err) : "";

  recordErrorAsync({
    // Prefixed so these are distinguishable at a glance from the framework's own
    // rows, which are already `next:*`.
    source: `user:${failure.feature}`,
    message: detail && !failure.message.includes(detail) ? `${failure.message} — ${detail}` : failure.message,
    stack: err instanceof Error ? err.stack ?? null : null,
    kind: failure.degraded ? "degraded" : err ? classifyError(err) : "handled",
    userId: failure.userId ?? scope?.userId ?? null,
    workspaceId: failure.workspaceId ?? scope?.workspaceId ?? null,
    context: {
      ...(failure.context ?? {}),
      // Kept out of the fingerprint on purpose: a run id per row would make every
      // occurrence its own group, and the count is the whole point of this table.
      referenceId: failure.referenceId ?? scope?.referenceId ?? null,
      surface: scope?.feature ?? failure.feature,
      action: scope?.action ?? null,
      ...(failure.degraded ? { degraded: true } : {}),
    },
  });
}
