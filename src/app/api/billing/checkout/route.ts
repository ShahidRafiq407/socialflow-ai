// ============================================================================
// CHECKOUT — THE ONLY PLACE MONEY STARTS
//
// Three things can be bought, and they behave differently enough to be told
// apart explicitly rather than inferred:
//
//   trial       $1, three days, one per person. The only purchase with a guard in
//               front of it, because it is the only one that can be resold to the
//               same person at a loss.
//   subscribe   A paid plan. If there is already a live subscription this is a
//               PATCH to it rather than a new checkout — sending an existing
//               subscriber through checkout again would leave them paying twice.
//   topup       A credit pack. One-time, no subscription touched.
//
// What this route never does is grant anything. It returns a URL. Entitlements
// arrive from the webhook, after Lemon Squeezy has taken real money, and nowhere
// else — there is no test-activation path, no free upgrade branch and no "trust
// the client's plan field" here. That is deliberate: every earlier version of this
// file had one, and a route that can grant a plan without a payment is a route
// that will eventually be found.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import {
  PURCHASABLE_PLANS,
  TOPUP_PACKS,
  getPlanConfig,
  isPlanTier,
  planRank,
  type PlanTier,
} from "@/lib/billing/plans";
import { getPlanContext } from "@/lib/billing/entitlements";
import {
  changePlan,
  createCheckout,
  lemonConfigured,
  missingVariantEnv,
  paidPlansPurchasable,
  topUpsPurchasable,
  trialPurchasable,
  variantForPlan,
  variantForTopUp,
  variantForTrial,
  type BillingCycleValue,
} from "@/lib/billing/lemonsqueezy";
import { evaluateTrial, readTrialSignals } from "@/lib/billing/trial-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Intent = "trial" | "subscribe" | "topup";

interface CheckoutBody {
  intent?: string;
  plan?: string;
  cycle?: string;
  packId?: string;
  /** Client-side signal bundle, for the trial guard. Optional by design. */
  fingerprint?: string;
  /** Renders the Lemon Squeezy checkout inside our own page. */
  embed?: boolean;
  darkMode?: boolean;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Where the buyer lands after paying, with enough context for the page to react. */
function redirectFor(intent: Intent, plan: PlanTier | "TOPUP"): string {
  const params = new URLSearchParams({ checkout: "success", intent, plan });
  return `${appUrl()}/dashboard/billing?${params.toString()}`;
}

function fail(status: number, error: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, message, ...extra }, { status });
}

/**
 * The statuses that mean "there is a subscription here to modify".
 *
 * PAST_DUE counts: the subscription exists and Lemon Squeezy is still retrying the
 * card, so a plan change belongs on that subscription rather than in a second one.
 */
const LIVE_STATUSES = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return fail(401, "UNAUTHORIZED", "Please sign in first.");

    if (!lemonConfigured()) {
      return fail(
        503,
        "PAYMENT_NOT_CONFIGURED",
        "Payments are not switched on yet. Set the Lemon Squeezy store keys to enable them."
      );
    }

    const body = (await req.json().catch(() => ({}))) as CheckoutBody;
    const intent: Intent =
      body.intent === "trial" ? "trial" : body.intent === "topup" ? "topup" : "subscribe";

    const [user, context] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
      getPlanContext(userId),
    ]);

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { lsSubscriptionId: true, status: true, plan: true, cycle: true },
    });
    const live =
      subscription?.lsSubscriptionId && LIVE_STATUSES.has(subscription.status)
        ? subscription
        : null;

    // ── The trial ───────────────────────────────────────────────────────────
    if (intent === "trial") {
      if (!trialPurchasable()) {
        return fail(503, "TRIAL_UNAVAILABLE", "The trial is not available right now.", {
          missing: missingVariantEnv(),
        });
      }
      if (live) {
        return fail(
          409,
          "ALREADY_SUBSCRIBED",
          "You already have an active subscription, so there is nothing to trial. You can change plan from this page at any time."
        );
      }
      if (!user?.email) {
        return fail(
          400,
          "EMAIL_REQUIRED",
          "We need the email address on your account before starting a trial."
        );
      }

      const signals = readTrialSignals(req);
      const verdict = await evaluateTrial({
        email: user.email,
        ip: signals.ip,
        fingerprint: body.fingerprint ?? signals.fingerprint,
        userId,
      });

      if (verdict.decision === "BLOCKED") {
        // 403 rather than 429: this is not a rate limit, and retrying will not
        // change it. The reason is written to be shown verbatim.
        return fail(403, "TRIAL_NOT_AVAILABLE", verdict.reason ?? "This trial is not available.");
      }

      const variantId = variantForTrial();
      if (!variantId) {
        return fail(503, "TRIAL_UNAVAILABLE", "The trial is not available right now.");
      }

      const session = await createCheckout({
        variantId,
        custom: {
          userId,
          purpose: "TRIAL",
          intent: "trial",
          claimId: verdict.claimId ?? undefined,
        },
        email: user.email,
        name: user.name,
        redirectUrl: redirectFor("trial", "TRIAL"),
        embed: body.embed,
        darkMode: body.darkMode,
        receiptNote: "Your 3-day trial is active. Cancel any time from the billing page.",
      });

      if (!session.ok) {
        return fail(502, "CHECKOUT_FAILED", session.detail || session.error, {
          status: session.status,
        });
      }

      return NextResponse.json({
        ok: true,
        intent,
        plan: "TRIAL",
        url: session.data.url,
        checkoutId: session.data.checkoutId,
        expiresAt: session.data.expiresAt,
        testMode: session.data.testMode,
        // Surfaced so the dashboard can say "we are watching this one" without
        // pretending the purchase was refused.
        flagged: verdict.decision === "FLAGGED",
      });
    }

    // ── A credit pack ───────────────────────────────────────────────────────
    if (intent === "topup") {
      const pack = TOPUP_PACKS.find((entry) => entry.id === body.packId);
      if (!pack) return fail(400, "UNKNOWN_PACK", "That credit pack does not exist.");
      if (!topUpsPurchasable()) {
        return fail(503, "TOPUPS_UNAVAILABLE", "Credit packs are not available right now.", {
          missing: missingVariantEnv(),
        });
      }
      // Credits are only spendable on features a paid plan opens. Selling them to
      // a Free account would be selling something that cannot be used.
      if (context.plan === "FREE") {
        return fail(
          409,
          "PLAN_REQUIRED",
          "Credit packs top up a paid plan. Start a plan first and the pack will apply to it."
        );
      }

      const variantId = variantForTopUp(pack.id);
      if (!variantId) return fail(503, "TOPUPS_UNAVAILABLE", "That pack is not available yet.");

      const session = await createCheckout({
        variantId,
        custom: { userId, purpose: "TOPUP", packId: pack.id, intent: "topup" },
        email: user?.email ?? null,
        name: user?.name ?? null,
        redirectUrl: redirectFor("topup", "TOPUP"),
        embed: body.embed,
        darkMode: body.darkMode,
        receiptNote: `${pack.credits.toLocaleString()} credits have been added to your balance. They do not expire.`,
      });

      if (!session.ok) {
        return fail(502, "CHECKOUT_FAILED", session.detail || session.error, {
          status: session.status,
        });
      }

      return NextResponse.json({
        ok: true,
        intent,
        packId: pack.id,
        credits: pack.credits,
        url: session.data.url,
        checkoutId: session.data.checkoutId,
        expiresAt: session.data.expiresAt,
        testMode: session.data.testMode,
      });
    }

    // ── A paid plan ─────────────────────────────────────────────────────────
    const requested = String(body.plan ?? "").toUpperCase();
    if (!isPlanTier(requested) || !PURCHASABLE_PLANS.includes(requested)) {
      return fail(400, "UNKNOWN_PLAN", "That plan cannot be bought directly.", {
        purchasable: PURCHASABLE_PLANS,
      });
    }
    const plan: PlanTier = requested;
    const cycle: BillingCycleValue = body.cycle === "yearly" ? "yearly" : "monthly";

    if (!paidPlansPurchasable()) {
      return fail(503, "PLANS_UNAVAILABLE", "Paid plans are not available right now.", {
        missing: missingVariantEnv(),
      });
    }

    // ── Changing an existing subscription ───────────────────────────────────
    //
    // This is a PATCH, not a purchase: the card on file is already there, so no
    // checkout is involved and nothing is redirected. The webhook still does the
    // granting — Lemon Squeezy sends `subscription_updated` and
    // `subscription_plan_changed` for this, and the credit difference is applied
    // there, so this branch stays free of entitlement logic.
    if (live) {
      const sameThing = live.plan === plan && live.cycle?.toLowerCase() === cycle;
      if (sameThing) {
        return fail(409, "ALREADY_ON_PLAN", `You are already on ${getPlanConfig(plan).name}.`);
      }

      const upgrading = planRank(plan) > planRank(live.plan as PlanTier);
      const result = await changePlan(live.lsSubscriptionId!, plan, cycle, {
        upgrade: upgrading,
        // A trialist who chooses a plan is choosing to start paying now. Leaving
        // the trial running would mean they picked a plan and then waited days for
        // it, having already given us a card.
        endTrial: live.status === "TRIALING",
      });

      if (!result.ok) {
        return fail(502, "PLAN_CHANGE_FAILED", result.detail || result.error, {
          status: result.status,
        });
      }

      return NextResponse.json({
        ok: true,
        intent: "change",
        changed: true,
        plan,
        cycle,
        upgraded: upgrading,
        // Said plainly because the two directions genuinely differ, and a customer
        // who expects an immediate downgrade and gets one at renewal will write in.
        message: upgrading
          ? `You are on ${getPlanConfig(plan).name} now. The difference has been charged to your card, prorated for the rest of this period.`
          : `You will move to ${getPlanConfig(plan).name} at the end of this billing period. Nothing changes until then, and you keep what you have already paid for.`,
      });
    }

    // ── A first subscription ────────────────────────────────────────────────
    const variantId = variantForPlan(plan, cycle);
    if (!variantId) {
      return fail(503, "PLANS_UNAVAILABLE", `${getPlanConfig(plan).name} is not available yet.`);
    }

    const session = await createCheckout({
      variantId,
      custom: { userId, purpose: plan, cycle, intent: "new" },
      email: user?.email ?? null,
      name: user?.name ?? null,
      redirectUrl: redirectFor("subscribe", plan),
      embed: body.embed,
      darkMode: body.darkMode,
      // A trial-bearing variant would otherwise give a second free trial to
      // someone who has already had one.
      skipTrial: true,
      receiptNote: `${getPlanConfig(plan).name} is active. Your credits are on the billing page.`,
    });

    if (!session.ok) {
      return fail(502, "CHECKOUT_FAILED", session.detail || session.error, {
        status: session.status,
      });
    }

    return NextResponse.json({
      ok: true,
      intent: "subscribe",
      plan,
      cycle,
      url: session.data.url,
      checkoutId: session.data.checkoutId,
      expiresAt: session.data.expiresAt,
      testMode: session.data.testMode,
    });
  } catch (error) {
    console.error("[billing/checkout] failed", error);
    return fail(500, "CHECKOUT_ERROR", "Something went wrong starting the checkout.");
  }
}
