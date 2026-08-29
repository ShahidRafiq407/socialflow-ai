import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PlanTier } from "@/lib/billing/plans";
import {
  getPayoneerListState,
  payoneerConfigured,
} from "@/lib/billing/payoneer";
import {
  activatePlanFromWebhook,
  recordBillingEvent,
} from "@/lib/billing/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CheckoutIntent {
  transactionId: string;
  workspaceId: string;
  plan: PlanTier;
  billingCycle: "monthly" | "yearly";
  amount: number;
  currency: string;
  status: string;
}

/**
 * Payoneer Checkout notified this endpoint server-to-server after a customer
 * completes (or abandons) payment on the hosted page.
 *
 * Verification: the incoming body only confirms a notification. The source of
 * truth is the LIST resource state fetched directly from Payoneer — the plan is
 * activated only when Payoneer reports `code === "charged"`.
 */
export async function POST(req: Request) {
  try {
    // Only meaningful when the gateway is configured.
    if (!payoneerConfigured()) {
      return NextResponse.json({ ok: false, error: "GATEWAY_NOT_CONFIGURED" }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const transactionId = body?.transactionId || body?.payment?.transactionId || "";
    const longId =
      body?.longId || body?.payment?.longId || body?.transaction?.longId || body?.longid || "";

    if (!transactionId && !longId) {
      return NextResponse.json({ ok: false, error: "NO_TRANSACTION_ID" }, { status: 400 });
    }

    // Locate the recorded intent for this transaction. The DB-side `contains`
    // match keeps this O(matching rows) instead of scanning every intent.
    const intentRows = await prisma.memory.findMany({
      where: {
        category: "checkout_intent",
        ...(transactionId ? { content: { contains: transactionId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    let intent: CheckoutIntent | null = null;
    let intentRowId: string | null = null;
    for (const row of intentRows) {
      try {
        const parsed = JSON.parse(row.content) as CheckoutIntent;
        if (parsed.transactionId === transactionId) {
          intent = parsed;
          intentRowId = row.id;
          break;
        }
      } catch {
        // ignore malformed rows
      }
    }

    if (!intent || !intentRowId) {
      return NextResponse.json({ ok: false, error: "INTENT_NOT_FOUND" }, { status: 404 });
    }

    // Idempotency: a webhook can be delivered more than once. If this
    // transaction was already charged & activated, acknowledge without
    // duplicating the plan change or the billing history entry.
    if (intent.status === "CHARGED" || intent.status === "ACTIVATED") {
      return NextResponse.json({ ok: true, alreadyActivated: true });
    }

    const existingEvents = await prisma.memory.findMany({
      where: {
        workspaceId: intent.workspaceId,
        category: "billing_event",
        content: { contains: transactionId },
      },
      take: 25,
    });
    const alreadyActivated = existingEvents.some((row) => {
      try {
        const parsed = JSON.parse(row.content);
        return parsed.type === "SUBSCRIPTION_ACTIVATED" && parsed.transactionId === transactionId;
      } catch {
        return false;
      }
    });
    if (alreadyActivated) {
      return NextResponse.json({ ok: true, alreadyActivated: true });
    }

    // Server-to-server verification against Payoneer.
    const state = await getPayoneerListState(longId);

    if (!state) {
      await recordBillingEvent(intent.workspaceId, {
        type: "PAYMENT_FAILED",
        plan: intent.plan,
        billingCycle: intent.billingCycle,
        provider: "payoneer",
        transactionId,
        message: "Could not verify payment status with Payoneer",
      });
      return NextResponse.json({ ok: false, error: "VERIFY_FAILED" }, { status: 502 });
    }

    if (state.code !== "charged") {
      await recordBillingEvent(intent.workspaceId, {
        type: "PAYMENT_FAILED",
        plan: intent.plan,
        billingCycle: intent.billingCycle,
        provider: "payoneer",
        transactionId,
        message: `Payment not completed: status=${state.code}`,
      });
      return NextResponse.json({ ok: true, state: state.code });
    }

    // Confirm the charged amount matches the plan price before activating.
    const expectedAmount = intent.amount;
    const chargedAmount = body?.payment?.amount ?? body?.net?.amount ?? intent.amount;

    if (Math.abs(Number(chargedAmount) - Number(expectedAmount)) > 0.001) {
      await recordBillingEvent(intent.workspaceId, {
        type: "PAYMENT_FAILED",
        plan: intent.plan,
        billingCycle: intent.billingCycle,
        provider: "payoneer",
        transactionId,
        message: `Amount mismatch: expected ${expectedAmount}, got ${chargedAmount}`,
      });
      return NextResponse.json({ ok: false, error: "AMOUNT_MISMATCH" }, { status: 400 });
    }

    // Activate plan + mark the intent consumed (idempotent).
    const result = await activatePlanFromWebhook(
      intent.workspaceId,
      intent.plan,
      intent.billingCycle,
      transactionId,
      "payoneer"
    );

    if (!result.success) {
      return NextResponse.json({ ok: false, error: "ACTIVATION_FAILED" }, { status: 500 });
    }

    // Mark the original intent consumed so duplicate notifications short-circuit.
    await prisma.memory.update({
      where: { id: intentRowId },
      data: {
        content: JSON.stringify({
          ...intent,
          status: "CHARGED",
          chargedAt: new Date().toISOString(),
        }),
      },
    });

    await recordBillingEvent(intent.workspaceId, {
      type: "SUBSCRIPTION_ACTIVATED",
      plan: intent.plan,
      billingCycle: intent.billingCycle,
      provider: "payoneer",
      transactionId,
      amount: Number(chargedAmount),
      currency: "USD",
      message: `Payment confirmed via Payoneer — ${intent.plan} activated`,
    });

    return NextResponse.json({ ok: true, plan: result.plan });
  } catch (error: unknown) {
    console.error("[Billing Webhook Error]:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}