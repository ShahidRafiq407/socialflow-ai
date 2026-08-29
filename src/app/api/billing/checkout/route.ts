import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { PlanTier, getPlanConfig } from "@/lib/billing/plans";
import { getWorkspacePlan, setWorkspacePlan, recordBillingEvent, getBillingHistory } from "@/lib/billing/gate";
import {
  payoneerConfigured,
  createPayoneerCheckout,
} from "@/lib/billing/payoneer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!workspace) {
      return NextResponse.json({ plan: "FREE", status: "ACTIVE", connectedAccounts: 0, billingHistory: [] });
    }

    const [planData, accountCount, billingHistory] = await Promise.all([
      getWorkspacePlan(workspace.id),
      prisma.socialAccount.count({ where: { workspaceId: workspace.id } }),
      getBillingHistory(workspace.id, 25),
    ]);

    return NextResponse.json({
      plan: planData.plan,
      status: planData.status,
      connectedAccounts: accountCount,
      workspaceId: workspace.id,
      billingHistory,
      paymentProvider: payoneerConfigured() ? "payoneer" : null,
      testMode: process.env.NEXT_PUBLIC_BILLING_TEST_MODE === "true",
    });
  } catch {
    return NextResponse.json({ plan: "FREE", status: "ACTIVE", connectedAccounts: 0, billingHistory: [] });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const targetPlan = (body.plan || "PRO").toUpperCase() as PlanTier;
    const billingCycle: "monthly" | "yearly" = body.billingCycle === "yearly" ? "yearly" : "monthly";

    const workspace = await prisma.workspace.findFirst({
      where: { userId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const planConfig = getPlanConfig(targetPlan);
    const amount = billingCycle === "yearly" ? planConfig.priceYearly : planConfig.priceMonthly;

    // ── Downgrade path (Free) — no payment required ─────────────────────────
    if (targetPlan === "FREE") {
      const result = await setWorkspacePlan(workspace.id, "FREE", "ACTIVE");
      await recordBillingEvent(workspace.id, {
        type: "PLAN_CHANGED",
        plan: "FREE",
        billingCycle,
        provider: "test",
        message: "Downgraded to the Free plan",
      });
      return NextResponse.json({
        success: true,
        plan: result.plan,
        message: "You are now on the Free plan.",
      });
    }

    // ── Explicit test-activation mode (development only) ─────────────────────
    // Gated by NEXT_PUBLIC_BILLING_TEST_MODE=true in a non-production build.
    // This is NOT a silent fake success — the UI clearly marks it as a test activation.
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_BILLING_TEST_MODE === "true"
    ) {
      const result = await setWorkspacePlan(workspace.id, targetPlan, "ACTIVE");
      await recordBillingEvent(workspace.id, {
        type: "TEST_ACTIVATION",
        plan: targetPlan,
        billingCycle,
        provider: "test",
        message: `Test activation of ${planConfig.name} (${billingCycle})`,
      });
      return NextResponse.json({
        success: true,
        plan: result.plan,
        test: true,
        message: `Test activation: ${planConfig.name} enabled without a real payment.`,
      });
    }

    // ── Real Payoneer hosted checkout ────────────────────────────────────────
    if (!payoneerConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "PAYMENT_NOT_CONFIGURED",
          message:
            "The payment provider has not been configured yet. Complete the Payoneer merchant setup to enable paid plans.",
        },
        { status: 503 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const transactionId = `postloom_${workspace.id}_${Date.now()}`;

    const checkout = await createPayoneerCheckout({
      transactionId,
      amount,
      currency: "USD",
      reference: `PostloomAI ${planConfig.name} (${billingCycle})`,
      customerEmail: body.email || "",
      customerNumber: userId,
      returnUrl: `${appUrl}/dashboard/billing?status=success&txn=${transactionId}`,
      cancelUrl: `${appUrl}/dashboard/billing?status=cancelled`,
      notificationUrl: `${appUrl}/api/billing/webhook`,
    });

    if (!checkout.ok) {
      await recordBillingEvent(workspace.id, {
        type: "PAYMENT_FAILED",
        plan: targetPlan,
        billingCycle,
        provider: "payoneer",
        transactionId,
        message: checkout.error || "Could not create checkout session",
      });
      return NextResponse.json(
        {
          success: false,
          error: "PAYMENT_GATEWAY_ERROR",
          message: checkout.error || "The payment provider could not create a checkout session.",
        },
        { status: 502 }
      );
    }

    // Persist the pending intent so the webhook can reconcile it.
    await prisma.memory.create({
      data: {
        workspaceId: workspace.id,
        category: "checkout_intent",
        content: JSON.stringify({
          transactionId,
          workspaceId: workspace.id,
          plan: targetPlan,
          billingCycle,
          amount,
          currency: "USD",
          status: "PENDING",
          createdAt: new Date().toISOString(),
        }),
      },
    });

    await recordBillingEvent(workspace.id, {
      type: "SUBSCRIPTION_VERIFYING",
      plan: targetPlan,
      billingCycle,
      provider: "payoneer",
      transactionId,
      message: `Checkout started for ${planConfig.name} (${billingCycle})`,
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: checkout.checkoutUrl,
      transactionId,
    });
  } catch (error: unknown) {
    console.error("[Checkout Route Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process plan" },
      { status: 500 }
    );
  }
}
