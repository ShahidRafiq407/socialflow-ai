// ============================================================================
// BILLING — MEDIA, CHARGED WHERE IT IS RENDERED
//
// An image or a video is the only thing in this product that a route can cause
// without knowing it. Five different callers reach `generateMediaAsset`: the
// Content Studio, the campaign graph, the CEO chat's tools, the goal autopilot,
// and the visualizer worker. A campaign that renders a 7-slide carousel spends
// seven image renders on one click, and the click was charged once.
//
// So media is not charged by the route that asked for it. It is charged here, at
// the one function every render passes through, per asset that actually comes
// back. The route's job shrinks to opening a metering scope that says who is
// asking — which it has to do anyway for the usage table.
//
// Three consequences worth stating, because they are the reason this file exists
// rather than a `runAction` in each route:
//
//   A deck costs what a deck costs. Seven slides is seven charges, and a slide
//   that fails is not charged.
//   Video is reserved before the model is called, never after. It is the most
//   expensive action in the product; a balance check that happens afterwards is
//   not a balance check.
//   A render with no identifiable owner does not happen. There is no ambient-user
//   fallback and no "unknown" bucket. If the scope is missing, the render is
//   refused with an error that names this file, because a render nobody is billed
//   for is exactly the leak this system exists to close.
// ============================================================================

import type { ActionKey } from "./actions";
import { beginAction, completeAction, failAction, EntitlementError } from "./entitlements";
import { childMeterContext, getMeterContext, withMeterContext } from "./meter";

/** What the render is, in the terms the action catalogue prices. */
export interface MediaChargeRequest {
  /** "video" bills the video action; anything else bills an image action. */
  mediaType: "image" | "video" | "multi_image";
  /** How many assets the caller intends to produce. Decks charge per slide. */
  count: number;
  /** The image model, when the caller pinned one. Premium models cost more. */
  imageModel?: string | null;
  /** Overrides the ambient scope, for callers outside one. */
  owner?: { userId: string; workspaceId?: string | null } | null;
  /** What the assets belong to, for the ledger row. */
  referenceId?: string | null;
}

/**
 * Which action a render is billed as.
 *
 * The premium image action exists because the model genuinely costs more, and it
 * is picked from the model id rather than from a flag the client sends — a client
 * that asks for the pro model and is billed for the standard one is a client that
 * has found a discount.
 */
function actionFor(request: MediaChargeRequest): ActionKey {
  if (request.mediaType === "video") return "media.video";
  const model = (request.imageModel || "").toLowerCase();
  const premium = model.includes("pro") && !model.includes("flash");
  return premium ? "media.imagePro" : "media.image";
}

export interface MediaChargeHandle {
  action: ActionKey;
  /** Who the reservation was taken against, resolved from the request or the scope. */
  owner: { userId: string; workspaceId: string | null; referenceId: string | null };
  /** Charge for what actually came back, and release the rest of the reservation. */
  settle(produced: number): Promise<void>;
  /** Give it all back. The render produced nothing. */
  refund(note?: string): Promise<void>;
}

/**
 * Reserves credits for a render and returns the handle that settles them.
 *
 * Throws `EntitlementError` when the plan does not include this kind of media or
 * the balance does not cover it, so a caller can let it travel up to the route
 * that knows how to turn a refusal into a response.
 */
export async function beginMediaCharge(
  request: MediaChargeRequest
): Promise<MediaChargeHandle> {
  const scope = getMeterContext();
  const userId = request.owner?.userId || scope?.userId || "";
  const workspaceId = request.owner?.workspaceId ?? scope?.workspaceId ?? null;

  if (!userId) {
    // Deliberately not an EntitlementError: this is a wiring fault in the caller,
    // not a decision about someone's plan, and it should read as one in the logs.
    throw new Error(
      "[billing/media] a media render was requested with no billable owner — " +
        "wrap the call in withMeterContext (or runAction), or pass `billing: { userId }`"
    );
  }

  const quantity = Math.max(1, Math.round(request.count || 1));
  const action = actionFor(request);
  const referenceId = request.referenceId ?? scope?.referenceId ?? null;

  const ticket = await beginAction({
    userId,
    action,
    workspaceId,
    referenceId,
    quantity,
  });

  if (!ticket.ok) throw new EntitlementError(ticket.gate);

  const perAsset = quantity > 0 ? ticket.credits / quantity : ticket.credits;

  return {
    action,
    owner: { userId, workspaceId, referenceId },
    async settle(produced: number) {
      const delivered = Math.max(0, Math.min(quantity, Math.round(produced)));
      if (delivered === 0) {
        await failAction(ticket, { note: "Refunded: the render produced nothing" });
        return;
      }
      // `completeAction` charges what it is told and releases the difference, so a
      // 5-slide reservation that returned 3 slides costs three slides — on the
      // balance and on the period counter both.
      await completeAction({
        ticket,
        credits: Math.round(perAsset * delivered),
        quantity: delivered,
        measureCost: true,
      });
    },
    async refund(note?: string) {
      await failAction(ticket, { note: note ?? "Refunded: the render failed" });
    },
  };
}

/**
 * The whole lifecycle around a render function.
 *
 * `produced` reads the result so the charge matches reality — a deck that came
 * back short is billed short.
 *
 * The render runs inside a child scope named for the media action rather than for
 * whatever asked for it. Two things follow: the usage table says "AI image" where
 * a campaign rendered one, instead of burying it under the campaign's text calls;
 * and `measureCost` can find the rows it is meant to price, because it looks them
 * up by the action it charged.
 */
export async function withMediaCharge<T>(
  request: MediaChargeRequest,
  fn: () => Promise<T>,
  produced: (result: T) => number
): Promise<T> {
  const handle = await beginMediaCharge(request);
  const scope = childMeterContext({
    userId: handle.owner.userId,
    workspaceId: handle.owner.workspaceId,
    feature: request.mediaType === "video" ? "media.video" : "media.image",
    action: handle.action,
    referenceId: handle.owner.referenceId,
  });

  try {
    const result = await withMeterContext(scope, fn);
    await handle.settle(produced(result));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await handle.refund(`Refunded: ${message.slice(0, 160)}`);
    throw err;
  }
}
