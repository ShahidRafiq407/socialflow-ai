// ============================================================================
// GATE — THE OLD DOOR, REBUILT ON THE NEW FOUNDATION
//
// This file used to be the whole billing system: plan state in a JSON blob inside
// the `Memory` table, a `BILLING_ENABLED = false` at the top that made every check
// return "yes, Agency", and a Payoneer-shaped event log. All three are gone.
//
// What remains is a thin adapter. A dozen routes already call `checkAIAccess()` and
// `checkSocialAccountLimit()`, and those call sites are correct — the question they
// ask is the right question. So the names stay and the answers now come from
// `entitlements.ts`, which reads the real `Subscription` row.
//
// There is deliberately no kill switch any more. A flag that turns enforcement off
// is a flag that gets left off, and the whole point of this rewrite is that a user
// cannot reach a model without a plan that permits it and a balance that covers it.
//
// New code should call `entitlements.ts` directly — ideally `runAction()`, which
// gates, charges and meters in one call. This file exists so the existing routes
// keep working, and so a check that only needs "may they?" does not have to learn
// the whole ticket lifecycle.
// ============================================================================

import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import type { PlanTier } from "./plans";
import { getPlanConfig } from "./plans";
import type { FeatureKey } from "./plans";
import {
  checkFeature,
  checkSocialAccountLimit as checkSocialAccountLimitFor,
  getPlanContext,
  type GateReason,
} from "./entitlements";

/**
 * The shape the existing routes already destructure. Widened only in `reason`,
 * which every caller passes straight through to the client.
 */
export interface PlanGateResult {
  allowed: boolean;
  currentPlan: PlanTier;
  reason?: GateReason | "UPGRADE_REQUIRED" | "ACCOUNT_LIMIT_REACHED";
  message?: string;
  requiredPlan?: PlanTier;
}

/**
 * May this account use an AI feature?
 *
 * `feature` defaults to the Content Studio's generator because that is what the
 * original single-purpose check meant. Every call site should pass its own: the
 * chat should ask about `chat.message`, the article route about `article.quick`,
 * the autopilot about `goals.autopilot`. Asking the wrong question is how a plan
 * boundary quietly stops existing.
 *
 * `workspaceId` is accepted and ignored. Plans are per account — one person, one
 * subscription, one wallet, however many workspaces the plan allows.
 */
export async function checkAIAccess(
  workspaceId?: string,
  feature: FeatureKey = "aistudio.generate"
): Promise<PlanGateResult> {
  void workspaceId;
  const { userId } = await auth();
  if (!userId) {
    return {
      allowed: false,
      currentPlan: "FREE",
      reason: "FEATURE_LOCKED",
      message: "Sign in to continue.",
    };
  }

  const gate = await checkFeature(userId, feature);
  return {
    allowed: gate.allowed,
    currentPlan: gate.plan,
    reason: gate.reason,
    message: gate.message,
    requiredPlan: gate.requiredPlan,
  };
}

/** May another social profile be connected to this workspace? */
export async function checkSocialAccountLimit(workspaceId: string): Promise<PlanGateResult> {
  const { userId } = await auth();
  if (!userId) {
    return { allowed: false, currentPlan: "FREE", message: "Sign in to continue." };
  }

  const gate = await checkSocialAccountLimitFor(userId, workspaceId);
  return {
    allowed: gate.allowed,
    currentPlan: gate.plan,
    reason: gate.reason,
    message: gate.message,
    requiredPlan: gate.requiredPlan,
  };
}

/**
 * The plan and status for the signed-in account.
 *
 * Kept for the handful of callers that only want the tier. `workspaceId` is
 * accepted for source compatibility and ignored, as above.
 */
export async function getWorkspacePlan(
  workspaceId?: string
): Promise<{ plan: PlanTier; status: string }> {
  void workspaceId;
  const { userId } = await auth();
  if (!userId) return { plan: "FREE", status: "NONE" };

  const ctx = await getPlanContext(userId);
  return { plan: ctx.plan, status: ctx.status };
}

/** The same, for code that already has a user id and no Clerk session. */
export async function getPlanForUser(userId: string): Promise<{ plan: PlanTier; status: string }> {
  const ctx = await getPlanContext(userId);
  return { plan: ctx.plan, status: ctx.status };
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing history
//
// Read from the `BillingEvent` table the webhook writes, which is the record of
// what Lemon Squeezy actually told us — not a summary we composed. The customer's
// invoice list, the "payment failed" banner and the support answer to "did my
// renewal go through" all come from these rows.
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingHistoryEntry {
  id: string;
  /** The Lemon Squeezy event name: "subscription_payment_success", … */
  type: string;
  createdAt: string;
  plan?: PlanTier;
  planName?: string;
  billingCycle?: "monthly" | "yearly";
  /** Major units, e.g. 19 for $19.00. */
  amount?: number;
  currency?: string;
  status?: string;
  /** The LS invoice/receipt URL when the event carried one. */
  receiptUrl?: string;
  message?: string;
  testMode?: boolean;
}

/** Most recent first. Never throws — an empty history is better than a broken tab. */
export async function getBillingHistory(limit = 25): Promise<BillingHistoryEntry[]> {
  try {
    const { userId } = await auth();
    if (!userId) return [];
    return await getBillingHistoryForUser(userId, limit);
  } catch (err) {
    console.error("[gate] getBillingHistory failed", err);
    return [];
  }
}

/**
 * Pulls the receipt link and the billing cycle out of the stored payload.
 *
 * Neither has a column of its own, and neither needs one: the whole verified
 * payload is kept precisely so a display detail can be added later without a
 * migration. Lemon Squeezy names the link `invoice_url` on a subscription invoice
 * and `receipt` on a one-off order, so both spellings are checked.
 */
function readPayloadDetails(payload: unknown): {
  receiptUrl?: string;
  billingCycle?: "monthly" | "yearly";
} {
  const root = (payload ?? {}) as {
    meta?: { custom_data?: Record<string, unknown> };
    data?: { attributes?: Record<string, unknown> };
  };
  const attributes = root.data?.attributes ?? {};
  const urls = (attributes.urls ?? {}) as Record<string, unknown>;

  const receipt = [urls.invoice_url, urls.receipt].find((value) => typeof value === "string");

  const custom = root.meta?.custom_data ?? {};
  const declared = typeof custom.cycle === "string" ? custom.cycle.toLowerCase() : "";
  const variant = typeof attributes.variant_name === "string" ? attributes.variant_name : "";

  let billingCycle: "monthly" | "yearly" | undefined;
  if (declared === "monthly" || declared === "yearly") billingCycle = declared;
  else if (/year|annual/i.test(variant)) billingCycle = "yearly";
  else if (/month/i.test(variant)) billingCycle = "monthly";

  return { receiptUrl: receipt as string | undefined, billingCycle };
}

export async function getBillingHistoryForUser(
  userId: string,
  limit = 25
): Promise<BillingHistoryEntry[]> {
  try {
    const rows = await prisma.billingEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventName: true,
        createdAt: true,
        plan: true,
        status: true,
        amountCents: true,
        currency: true,
        payload: true,
        error: true,
        testMode: true,
      },
    });

    return rows.map((row) => {
      const details = readPayloadDetails(row.payload);
      return {
        id: row.id,
        type: row.eventName,
        createdAt: row.createdAt.toISOString(),
        plan: (row.plan ?? undefined) as PlanTier | undefined,
        planName: row.plan ? getPlanConfig(row.plan as PlanTier).name : undefined,
        billingCycle: details.billingCycle,
        amount: row.amountCents !== null ? row.amountCents / 100 : undefined,
        currency: row.currency ?? undefined,
        status: row.status ?? undefined,
        receiptUrl: details.receiptUrl,
        message: row.error ?? undefined,
        testMode: row.testMode ?? undefined,
      };
    });
  } catch (err) {
    console.error("[gate] getBillingHistoryForUser failed", err);
    return [];
  }
}
