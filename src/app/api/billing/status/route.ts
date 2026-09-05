// ============================================================================
// BILLING STATUS — ONE READ, EVERYTHING THE TAB SHOWS
//
// The billing page has a lot on it: the plan, the credit meter, per-feature caps,
// storage, workspaces, the statement, the receipts, the portal links. Fetching
// those separately would mean seven spinners and seven chances to disagree with
// each other, so this returns the whole picture from one round of reads and the
// page renders from a single object.
//
// It is read-only. Nothing here changes a plan, grants a credit or calls Lemon
// Squeezy to write — the one outbound call is the portal-link fetch, which is a
// GET and is cached on the subscription row so it happens roughly once a day
// rather than on every page load.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import {
  PLAN_CATALOG,
  PLAN_TIERS,
  PURCHASABLE_PLANS,
  TOPUP_PACKS,
  formatCap,
  formatStorage,
  yearlySavingPercent,
} from "@/lib/billing/plans";
import { ACTION_GROUPS, creditsToUsd, getAction } from "@/lib/billing/actions";
import { getAccountSummary } from "@/lib/billing/entitlements";
import { getLedgerEntries } from "@/lib/billing/wallet";
import { getBillingHistoryForUser } from "@/lib/billing/gate";
import {
  LEMON_FEE_NOTE,
  LEMON_PAYMENT_METHODS,
  PORTAL_URL_TTL_MS,
  cyclesPurchasable,
  getPortalUrls,
  lemonConfigured,
  lemonTestMode,
  missingVariantEnv,
  paidPlansPurchasable,
  topUpsPurchasable,
  trialPurchasable,
} from "@/lib/billing/lemonsqueezy";
import { hasUsedTrial } from "@/lib/billing/trial-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refresh the customer-portal links if the cached ones are stale.
 *
 * Lemon Squeezy signs these and they expire in 24 hours, so they cannot be stored
 * once and forgotten; `PORTAL_URL_TTL_MS` is deliberately shorter than the real
 * expiry so a link is never handed out in its final minutes. A failure here is not
 * a failure of the page — the tab still renders, minus two buttons.
 */
async function freshPortalUrls(userId: string, lsSubscriptionId: string | null) {
  if (!lsSubscriptionId) return { portalUrl: null, updatePaymentMethodUrl: null };

  const row = await prisma.subscription.findUnique({
    where: { userId },
    select: { portalUrl: true, updatePaymentMethodUrl: true, portalUrlsFetchedAt: true },
  });

  const age = row?.portalUrlsFetchedAt ? Date.now() - row.portalUrlsFetchedAt.getTime() : Infinity;
  if (row?.portalUrl && age < PORTAL_URL_TTL_MS) {
    return { portalUrl: row.portalUrl, updatePaymentMethodUrl: row.updatePaymentMethodUrl };
  }

  const result = await getPortalUrls(lsSubscriptionId);
  if (!result.ok) {
    return {
      portalUrl: row?.portalUrl ?? null,
      updatePaymentMethodUrl: row?.updatePaymentMethodUrl ?? null,
    };
  }

  await prisma.subscription
    .update({
      where: { userId },
      data: {
        portalUrl: result.data.customerPortal,
        updatePaymentMethodUrl: result.data.updatePaymentMethod,
        portalUrlsFetchedAt: new Date(),
        cardBrand: result.data.cardBrand ?? undefined,
        cardLastFour: result.data.cardLastFour ?? undefined,
      },
    })
    .catch(() => undefined);

  return {
    portalUrl: result.data.customerPortal,
    updatePaymentMethodUrl: result.data.updatePaymentMethod,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const [summary, subscription] = await Promise.all([
      getAccountSummary(userId),
      prisma.subscription.findUnique({
        where: { userId },
        select: {
          lsSubscriptionId: true,
          lsCustomerId: true,
          cycle: true,
          cardBrand: true,
          cardLastFour: true,
          paymentMethod: true,
          renewsAt: true,
          endsAt: true,
          trialEndsAt: true,
          cancelAtPeriodEnd: true,
          testMode: true,
        },
      }),
    ]);

    const [history, ledger, portal, trialUsed] = await Promise.all([
      getBillingHistoryForUser(userId, 25),
      getLedgerEntries(userId, 50),
      freshPortalUrls(userId, subscription?.lsSubscriptionId ?? null),
      hasUsedTrial(userId),
    ]);

    const ctx = summary.context;

    return NextResponse.json({
      ok: true,

      // ── Where they stand ────────────────────────────────────────────────
      plan: {
        id: ctx.plan,
        name: PLAN_CATALOG[ctx.plan].name,
        storedPlan: ctx.storedPlan,
        status: ctx.status,
        cycle: subscription?.cycle?.toLowerCase() ?? null,
        isTrial: ctx.isTrial,
        // A paid plan whose renewal never arrived. Worth saying out loud rather
        // than silently showing Free to somebody who believes they are paying.
        stale: ctx.stale,
        testMode: ctx.testMode || subscription?.testMode === true,
        periodStart: ctx.periodStart.toISOString(),
        periodEnd: ctx.periodEnd.toISOString(),
        trialEndsAt: ctx.trialEndsAt?.toISOString() ?? null,
        endsAt: ctx.endsAt?.toISOString() ?? null,
        renewsAt: subscription?.renewsAt?.toISOString() ?? null,
        cancelAtPeriodEnd: ctx.cancelAtPeriodEnd,
        hasSubscription: Boolean(subscription?.lsSubscriptionId),
      },

      // ── What is left ────────────────────────────────────────────────────
      credits: {
        balance: summary.wallet.balance,
        available: summary.wallet.available,
        grantBalance: summary.wallet.grantBalance,
        topUpBalance: summary.wallet.topUpBalance,
        held: summary.wallet.heldCredits,
        monthlyGrant: summary.wallet.monthlyGrant,
        percentUsed: summary.wallet.percentUsed,
        lifetimeGranted: summary.wallet.lifetimeGranted,
        lifetimeSpent: summary.wallet.lifetimeSpent,
        periodStart: summary.wallet.grantPeriodStart.toISOString(),
        periodEnd: summary.wallet.grantPeriodEnd.toISOString(),
      },

      // Per-feature counters, already resolved against this plan's caps, with the
      // cap pre-formatted so the client never has to know that -1 means unlimited.
      usage: Object.fromEntries(
        Object.entries(summary.usage).map(([key, value]) => [
          key,
          { used: value.used, cap: value.cap, capLabel: formatCap(value.cap) },
        ])
      ),

      storage: {
        usedMb: summary.storage.usedMb,
        limitMb: summary.storage.limitMb,
        usedLabel: formatStorage(summary.storage.usedMb),
        limitLabel: formatStorage(summary.storage.limitMb),
      },

      workspaces: {
        used: summary.workspaces.used,
        limit: summary.workspaces.limit,
        limitLabel: formatCap(summary.workspaces.limit),
      },

      // ── How they pay ────────────────────────────────────────────────────
      payment: {
        method: subscription?.paymentMethod ?? null,
        cardBrand: subscription?.cardBrand ?? null,
        cardLastFour: subscription?.cardLastFour ?? null,
        portalUrl: portal.portalUrl,
        updatePaymentMethodUrl: portal.updatePaymentMethodUrl,
        // What the checkout can offer. Which of these a given buyer sees is
        // decided by Lemon Squeezy from their country and device, so this is a
        // list of possibilities, never a promise.
        methods: LEMON_PAYMENT_METHODS,
        feeNote: LEMON_FEE_NOTE,
      },

      // ── What they could buy ─────────────────────────────────────────────
      catalog: {
        plans: PLAN_TIERS.map((tier) => ({
          ...PLAN_CATALOG[tier],
          yearlySaving: yearlySavingPercent(tier),
          purchasable: PURCHASABLE_PLANS.includes(tier),
          current: tier === ctx.plan,
        })),
        topUps: TOPUP_PACKS,
        // The credit price of every metered action, resolved here rather than in
        // the browser so the price table and the charge can never disagree.
        actions: ACTION_GROUPS.map((group) => ({
          title: group.title,
          blurb: group.blurb,
          actions: group.actions.map((key) => {
            const spec = getAction(key);
            return {
              key: spec.key,
              label: spec.label,
              credits: spec.credits,
              usd: creditsToUsd(spec.credits),
              description: spec.description,
              feature: spec.feature,
            };
          }),
        })),
      },

      // ── What the store will actually accept right now ───────────────────
      store: {
        configured: lemonConfigured(),
        testMode: lemonTestMode(),
        plansPurchasable: paidPlansPurchasable(),
        // Per cycle, because the two are configured independently in the store. A
        // deployment that sells monthly and not yearly must show the yearly toggle
        // as unavailable rather than let someone click through to a dead end.
        cycles: cyclesPurchasable(),
        trialPurchasable: trialPurchasable() && !trialUsed,
        trialUsed,
        topUpsPurchasable: topUpsPurchasable(),
        // Named so a misconfigured deployment says which variable is missing
        // instead of showing a dead button.
        missingConfig: missingVariantEnv(),
      },

      history,
      ledger: ledger.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    });
  } catch (error) {
    console.error("[billing/status] failed", error);
    return NextResponse.json(
      { ok: false, error: "STATUS_ERROR", message: "Could not load your billing details." },
      { status: 500 }
    );
  }
}
