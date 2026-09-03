import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { getWorkspacePlan, getBillingHistory } from "@/lib/billing/gate";
import { payoneerConfigured } from "@/lib/billing/payoneer";

export const dynamic = "force-dynamic";

/**
 * Returns the authoritative subscription state for the workspace,
 * plus the status of a specific checkout transaction when `txn` is provided.
 * Used by the billing page after a Payoneer return redirect.
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await prisma.workspace.findFirst({
      ...(await activeWorkspaceQuery(userId)),
      select: { id: true },
    });

    if (!workspace) {
      return NextResponse.json({ plan: "FREE", status: "ACTIVE", billingHistory: [] });
    }

    const { searchParams } = new URL(req.url);
    const txnId = searchParams.get("txn");

    const [planData, billingHistory, accountCount] = await Promise.all([
      getWorkspacePlan(workspace.id),
      getBillingHistory(workspace.id, 25),
      prisma.socialAccount.count({ where: { workspaceId: workspace.id } }),
    ]);

    let txn = null;
    if (txnId) {
      const rows = await prisma.memory.findMany({
        where: { workspaceId: workspace.id, category: "checkout_intent" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.content);
          if (parsed.transactionId === txnId) {
            txn = parsed;
            break;
          }
        } catch {
          // ignore malformed rows
        }
      }
    }

    return NextResponse.json({
      plan: planData.plan,
      status: planData.status,
      billingHistory,
      connectedAccounts: accountCount,
      testMode: process.env.NEXT_PUBLIC_BILLING_TEST_MODE === "true",
      txn,
      paymentProvider: payoneerConfigured() ? "payoneer" : null,
    });
  } catch {
    return NextResponse.json({
      plan: "FREE",
      status: "ACTIVE",
      billingHistory: [],
      connectedAccounts: 0,
      testMode: false,
      txn: null,
    });
  }
}