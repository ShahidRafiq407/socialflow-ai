// ============================================================================
// SUBSCRIPTION ACTIONS — CANCEL, RESUME, PORTAL, REMOVE CARD
//
// The four things a customer does to a subscription that already exists. All of
// them are one call to Lemon Squeezy and then a wait: the row in our database is
// updated by the webhook, not here, because the webhook is the only place that
// sees the authoritative state and there must be exactly one writer of it.
//
// This route therefore returns what will happen, not what has happened. The
// message it sends back is written on that basis — "you will keep access until
// the 14th", not "your plan has changed" — because the alternative is a page that
// claims a change a second before the webhook confirms it and then flickers back.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { getPlanConfig, type PlanTier } from "@/lib/billing/plans";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import {
  cancelSubscription,
  getPortalUrls,
  lemonConfigured,
  resumeSubscription,
} from "@/lib/billing/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "cancel" | "resume" | "portal" | "remove-card";

const ACTIONS: Action[] = ["cancel", "resume", "portal", "remove-card"];

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

/** Human date, for a message a customer reads once and acts on. */
function onDate(value: Date | null): string {
  if (!value) return "the end of your current period";
  return value.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return fail(401, "UNAUTHORIZED", "Please sign in first.");
    await ensureRuntimeConfig();
    if (!lemonConfigured()) {
      return fail(503, "PAYMENT_NOT_CONFIGURED", "Billing is not switched on yet.");
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action as Action | undefined;
    if (!action || !ACTIONS.includes(action)) {
      return fail(400, "UNKNOWN_ACTION", "That is not something that can be done here.");
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        lsSubscriptionId: true,
        status: true,
        plan: true,
        endsAt: true,
        periodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });

    if (!subscription?.lsSubscriptionId) {
      return action === "remove-card"
        ? fail(
            404,
            "NO_CARD",
            "There is no card on this account. Nothing can be charged to you, and there is nothing to remove."
          )
        : fail(404, "NO_SUBSCRIPTION", "There is no subscription on this account.");
    }
    const lsId = subscription.lsSubscriptionId;
    const planName = getPlanConfig(subscription.plan as PlanTier).name;

    // ── The portal ──────────────────────────────────────────────────────────
    // A signed Lemon Squeezy page where invoices, the card and the address live.
    // Fetched fresh rather than read from our cache: this is the one place the link
    // is about to be clicked, and a link that expired an hour ago is a dead end.
    if (action === "portal") {
      const result = await getPortalUrls(lsId);
      if (!result.ok) {
        return fail(502, "PORTAL_UNAVAILABLE", result.detail || result.error);
      }
      await prisma.subscription
        .update({
          where: { userId },
          data: {
            portalUrl: result.data.customerPortal,
            updatePaymentMethodUrl: result.data.updatePaymentMethod,
            portalUrlsFetchedAt: new Date(),
          },
        })
        .catch(() => undefined);

      return NextResponse.json({
        ok: true,
        action,
        url: result.data.customerPortal,
        updatePaymentMethodUrl: result.data.updatePaymentMethod,
        updateSubscriptionUrl: result.data.updateSubscription,
      });
    }

    // ── Cancelling ──────────────────────────────────────────────────────────
    if (action === "cancel") {
      if (subscription.cancelAtPeriodEnd || subscription.status === "CANCELLED") {
        return NextResponse.json({
          ok: true,
          action,
          alreadyDone: true,
          message: `${planName} is already set to end on ${onDate(subscription.endsAt ?? subscription.periodEnd)}.`,
        });
      }

      const result = await cancelSubscription(lsId);
      if (!result.ok) {
        return fail(502, "CANCEL_FAILED", result.detail || result.error);
      }

      const endsAt = result.data.ends_at ? new Date(result.data.ends_at) : subscription.periodEnd;
      return NextResponse.json({
        ok: true,
        action,
        endsAt: endsAt.toISOString(),
        // Said in full because this is the sentence that stops a support email:
        // cancelling does not take anything away today, and the credits already
        // granted for this period stay spendable until it ends.
        message: `${planName} will end on ${onDate(endsAt)}. You keep everything until then, including the credits already in your balance, and you can resume before that date at no cost.`,
      });
    }

    // ── Removing the card ───────────────────────────────────────────────────
    // Lemon Squeezy is the merchant of record and the only holder of the card. There
    // is no API to delete a stored payment method, and pretending otherwise — say by
    // clearing the brand and last four from our own row — would be a lie the next
    // webhook overwrites.
    //
    // So this does the half that is real and hands over the half that is not ours.
    // The real half is stopping the charges: a card nobody will bill is the outcome
    // the customer is actually asking for, and cancelling is how it is achieved.
    // Leaving the subscription live and deleting the card at Lemon Squeezy would only
    // buy a failed renewal and a PAST_DUE account, which serves neither side.
    //
    // The half that is not ours is the stored card itself, so the response carries
    // the signed portal link with an explanation of what is behind it.
    if (action === "remove-card") {
      const alreadyEnding = subscription.cancelAtPeriodEnd || subscription.status === "CANCELLED";

      if (!alreadyEnding) {
        const cancelled = await cancelSubscription(lsId);
        if (!cancelled.ok) {
          return fail(502, "REMOVE_CARD_FAILED", cancelled.detail || cancelled.error);
        }
      }

      // Fetched after the cancel, not before: the link is about to be clicked, and
      // this is also where the customer confirms for themselves that the plan is
      // ending. A portal fetch that fails does not undo the cancel — the charges have
      // stopped either way, which is the part that mattered.
      const portal = await getPortalUrls(lsId);
      const endsAt = subscription.endsAt ?? subscription.periodEnd;

      if (portal.ok) {
        await prisma.subscription
          .update({
            where: { userId },
            data: {
              portalUrl: portal.data.customerPortal,
              updatePaymentMethodUrl: portal.data.updatePaymentMethod,
              portalUrlsFetchedAt: new Date(),
            },
          })
          .catch(() => undefined);
      }

      return NextResponse.json({
        ok: true,
        action,
        alreadyDone: alreadyEnding,
        endsAt: endsAt ? endsAt.toISOString() : null,
        url: portal.ok ? portal.data.customerPortal : null,
        updatePaymentMethodUrl: portal.ok ? portal.data.updatePaymentMethod : null,
        message: portal.ok
          ? `Your card will not be charged again${
              alreadyEnding ? "" : ` — ${planName} now ends on ${onDate(endsAt)}`
            }, and you keep everything until then. The card itself is held by Lemon Squeezy, our payment processor: their page is open now, and you can delete or replace it there. Come back to any plan whenever you like.`
          : `Your card will not be charged again${
              alreadyEnding ? "" : ` — ${planName} now ends on ${onDate(endsAt)}`
            }, and you keep everything until then. To delete the card details themselves, open "Invoices and receipts" — that is Lemon Squeezy's own page, where the card is stored.`,
      });
    }

    // ── Resuming ────────────────────────────────────────────────────────────
    const result = await resumeSubscription(lsId);
    if (!result.ok) {
      return fail(502, "RESUME_FAILED", result.detail || result.error);
    }

    return NextResponse.json({
      ok: true,
      action,
      renewsAt: result.data.renews_at ?? null,
      message: `${planName} is back on. Your next renewal is ${onDate(
        result.data.renews_at ? new Date(result.data.renews_at) : null
      )}.`,
    });
  } catch (error) {
    console.error("[billing/subscription] failed", error);
    return fail(500, "SUBSCRIPTION_ERROR", "Something went wrong. Nothing has been changed.");
  }
}
