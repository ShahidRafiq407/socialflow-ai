// ============================================================================
// BILLING — THE ROUTE WRAPPER
//
// `runAction` in entitlements.ts is the engine: gate, charge, meter, run, settle.
// This file is the adapter every API route uses to reach it, and it exists to make
// three decisions once instead of eight times.
//
//   A refusal is a response, not a crash. `EntitlementError` becomes 402 for a
//   balance problem and 403 for a plan one, with a body the client already knows
//   how to render into an upgrade prompt.
//
//   A failed response is a failed run. A route that catches its own error and
//   returns `{ error }` with a 500 has not delivered anything, so the credits must
//   come back. `runAction` only refunds on a throw, so this wrapper turns a
//   non-OK response into one and hands the original response back afterwards.
//
//   Free steps stay free. A route with a dozen steps has a handful that touch a
//   model; the rest are validation, cache reads and lookups. `billedStep` returns
//   null for those and the route runs them unwrapped.
//
// What this does NOT do is decide what an action costs, or which feature it needs.
// That lives in the action catalogue, and a route that wants to charge names an
// action rather than a number.
// ============================================================================

import { NextResponse } from "next/server";
import type { ActionKey } from "./actions";
import {
  isEntitlementError,
  gateToResponseBody,
  runAction,
  requireAction,
  type ActionTicket,
  type RunActionOptions,
} from "./entitlements";

/**
 * Carries a route's own failure response out through `runAction`, so the refund
 * happens and the client still gets the message the route wrote.
 */
class HandlerFailure extends Error {
  readonly response: NextResponse;

  constructor(response: NextResponse, detail: string) {
    super(detail);
    this.name = "HandlerFailure";
    this.response = response;
  }
}

/** What the response body said went wrong, for the refund note on the ledger. */
function failureNote(status: number): string {
  return `the run returned ${status}`;
}

/**
 * Returns a response from inside a billed handler without charging for it.
 *
 * For the case a status code cannot express: the handler succeeded, the customer
 * gets a 200, and no model was called — a cache hit, a no-op, a result assembled
 * from rows already in the database. The reservation is released and the response
 * travels out untouched.
 *
 * Declared `never` so a step can write `return unbilled(NextResponse.json(...))`
 * and keep reading like the return it replaced.
 */
export function unbilled(response: NextResponse, why = "nothing was generated"): never {
  throw new HandlerFailure(response, why);
}

/**
 * The response a refused action should become.
 *
 * Returns null when the error is not a plan decision, so a caller can rethrow
 * genuine faults instead of dressing them up as an upgrade prompt.
 */
export function entitlementResponse(err: unknown): NextResponse | null {
  if (!isEntitlementError(err)) return null;
  const gate = gateToResponseBody(err.gate);
  return NextResponse.json(
    {
      ...gate,
      // AFTER the spread, not before. `gateToResponseBody` also writes `error` — the
      // human sentence — so with the spread last it overwrote this sentinel and every
      // client that switches on "UPGRADE_REQUIRED" (the AI Studio editor, the campaign
      // stream modal, the article media studio) fell through to its generic failure
      // path instead of opening the upgrade dialog. Those clients read the sentence
      // from `message`, which is where it now lives.
      error: "UPGRADE_REQUIRED",
      message: gate.error,
    },
    { status: err.status }
  );
}

export interface BilledRouteOptions extends RunActionOptions {
  /**
   * Statuses that should still be charged. Defaults to none: any 4xx or 5xx
   * refunds. A route that wants to bill for a partial success returns 200 and
   * says so in the body instead.
   */
  chargeOnStatus?: (status: number) => boolean;
}

/**
 * Gate, charge and meter an API route's work, and refund it if the work failed.
 *
 * The handler receives the ticket, so it can read the plan it was granted under —
 * `ticket.plan` decides image quality and chat loop allowances without a second
 * database read.
 */
export async function billedRoute(
  options: BilledRouteOptions,
  handler: (ticket: ActionTicket) => Promise<NextResponse>
): Promise<NextResponse> {
  const chargeOnStatus = options.chargeOnStatus;

  try {
    return await runAction<NextResponse>(options, async (ticket) => {
      const response = await handler(ticket);
      const status = response.status;
      const failed = status >= 400 && !(chargeOnStatus?.(status) ?? false);
      if (failed) throw new HandlerFailure(response, failureNote(status));
      return response;
    });
  } catch (err) {
    if (err instanceof HandlerFailure) return err.response;
    const refusal = entitlementResponse(err);
    if (refusal) return refusal;
    throw err;
  }
}

/**
 * The same gate for work that cannot be wrapped — a streamed response, or a run
 * that reports its own progress and settles when the stream closes.
 *
 * Returns the ticket on success and a response on refusal, so the caller can
 * return early without a try/catch around half its body. The caller owns
 * `completeAction`/`failAction` from that point on: a ticket taken here and never
 * settled is a hold the sweeper releases an hour later, which is a real cost to
 * the customer even though it is not a permanent one.
 */
export async function ticketOrRefusal(args: {
  userId: string;
  action: ActionKey | string;
  workspaceId?: string | null;
  referenceId?: string | null;
  quantity?: number;
}): Promise<{ ticket: ActionTicket; refusal: null } | { ticket: null; refusal: NextResponse }> {
  try {
    const ticket = await requireAction(args);
    return { ticket, refusal: null };
  } catch (err) {
    const refusal = entitlementResponse(err);
    if (refusal) return { ticket: null, refusal };
    throw err;
  }
}
