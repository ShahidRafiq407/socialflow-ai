import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { PlanTier, getPlanConfig, canAccessAI, getMaxSocialAccounts } from "./plans";

// ──────────────────────────────────────────────────────────────────────────
// TEMPORARY KILL-SWITCH: billing/subscription gating is DISABLED so every
// feature can be tested without a paid plan. Flip back to `true` to re-enable
// plan checks (AI generation gating + social account limits).
// ──────────────────────────────────────────────────────────────────────────
export const BILLING_ENABLED = false;

export interface PlanGateResult {
  allowed: boolean;
  currentPlan: PlanTier;
  reason?: "UPGRADE_REQUIRED" | "ACCOUNT_LIMIT_REACHED" | "FEATURE_LOCKED";
  message?: string;
  requiredPlan?: PlanTier;
}

export interface BillingEvent {
  id?: string;
  type:
    | "SUBSCRIPTION_ACTIVATED"
    | "SUBSCRIPTION_VERIFYING"
    | "PAYMENT_FAILED"
    | "PAYMENT_CANCELLED"
    | "PLAN_CHANGED"
    | "TEST_ACTIVATION";
  plan: PlanTier;
  billingCycle: "monthly" | "yearly";
  amount?: number;
  currency?: string;
  provider: "payoneer" | "test";
  transactionId?: string;
  message?: string;
  createdAt?: string;
}

/**
 * Server-side guard to verify if an action requiring AI generation is permitted.
 */
export async function checkAIAccess(workspaceId?: string): Promise<PlanGateResult> {
  // TEMP: billing disabled — allow every workspace (see BILLING_ENABLED above).
  if (!BILLING_ENABLED) {
    return { allowed: true, currentPlan: "AGENCY" };
  }
  const { plan } = await getWorkspacePlan(workspaceId);
  const allowed = canAccessAI(plan);

  if (!allowed) {
    return {
      allowed: false,
      currentPlan: plan,
      reason: "UPGRADE_REQUIRED",
      requiredPlan: "PRO",
      message:
        "AI generation is available on Creator Pro and Agency & Scale plans. The Free plan supports manual composition, media upload, and publishing.",
    };
  }

  return {
    allowed: true,
    currentPlan: plan,
  };
}

/**
 * Server-side guard to verify if adding a new social account is permitted under
 * the current plan limits (Free = up to 2 accounts).
 */
export async function checkSocialAccountLimit(workspaceId: string): Promise<PlanGateResult> {
  // TEMP: billing disabled — allow unlimited connected accounts for testing.
  if (!BILLING_ENABLED) {
    return { allowed: true, currentPlan: "AGENCY" };
  }
  const { plan } = await getWorkspacePlan(workspaceId);
  const maxAccounts = getMaxSocialAccounts(plan);

  const currentCount = await prisma.socialAccount.count({
    where: { workspaceId },
  });

  if (currentCount >= maxAccounts) {
    return {
      allowed: false,
      currentPlan: plan,
      reason: "ACCOUNT_LIMIT_REACHED",
      requiredPlan: plan === "FREE" ? "PRO" : "AGENCY",
      message: `The ${getPlanConfig(plan).name} plan supports up to ${maxAccounts} connected accounts. Upgrade to connect more platforms.`,
    };
  }

  return {
    allowed: true,
    currentPlan: plan,
  };
}

/**
 * Persists a billing event into the existing Memory table (category "billing_event")
 * for billing history — no schema migration required.
 */
export async function recordBillingEvent(workspaceId: string, event: BillingEvent): Promise<void> {
  const payload = JSON.stringify({
    ...event,
    createdAt: new Date().toISOString(),
  });

  await prisma.memory.create({
    data: {
      workspaceId,
      category: "billing_event",
      content: payload,
    },
  });
}

/**
 * Reads billing history (most recent first).
 */
export async function getBillingHistory(workspaceId?: string, limit = 25): Promise<BillingEvent[]> {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    const workspace =
      workspaceId && workspaceId !== "default-workspace"
        ? await prisma.workspace.findFirst({
            where: { id: workspaceId, userId },
            select: { id: true },
          })
        : await prisma.workspace.findFirst({
            where: { userId },
            select: { id: true },
          });

    if (!workspace) return [];

    const rows = await prisma.memory.findMany({
      where: { workspaceId: workspace.id, category: "billing_event" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const events: BillingEvent[] = [];
    for (const row of rows) {
      try {
        events.push({ ...(JSON.parse(row.content) as BillingEvent), id: row.id });
      } catch {
        // Skip corrupted/unparseable rows
      }
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Retrieves the active plan for a user's workspace.
 * Plan state is stored in the existing Memory table (category "subscription_plan")
 * so the app remains fully functional without requiring a schema migration.
 */
export async function getWorkspacePlan(workspaceId?: string): Promise<{ plan: PlanTier; status: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { plan: "FREE", status: "ACTIVE" };

    const workspace = workspaceId
      ? await prisma.workspace.findFirst({
          where: { id: workspaceId, userId },
          select: { id: true },
        })
      : await prisma.workspace.findFirst({
          where: { userId },
          select: { id: true },
        });

    if (!workspace) return { plan: "FREE", status: "ACTIVE" };

    const planMemory = await prisma.memory.findFirst({
      where: {
        workspaceId: workspace.id,
        category: "subscription_plan",
      },
      orderBy: { updatedAt: "desc" },
    });

    if (planMemory && planMemory.content) {
      try {
        const parsed = JSON.parse(planMemory.content);
        return {
          plan: (parsed.plan || "FREE").toUpperCase() as PlanTier,
          status: parsed.status || "ACTIVE",
        };
      } catch {
        // fallback
      }
    }

    return { plan: "FREE", status: "ACTIVE" };
  } catch (error) {
    console.warn("[getWorkspacePlan] Fallback to FREE:", error);
    return { plan: "FREE", status: "ACTIVE" };
  }
}

/**
 * Server-only plan setter. Intentionally NOT imported by any client component —
 * plan upgrades must go through the checkout + webhook flow to remain trustworthy.
 * Used for downgrades to Free and for explicit test-activation mode.
 */
export async function setWorkspacePlan(
  workspaceId: string,
  newPlan: PlanTier,
  status: string = "ACTIVE"
): Promise<{ success: boolean; plan: PlanTier }> {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
      select: { id: true },
    });
    if (!workspace) throw new Error("Workspace not found");

    const payload = JSON.stringify({
      plan: newPlan,
      status,
      updatedAt: new Date().toISOString(),
    });

    const existing = await prisma.memory.findFirst({
      where: { workspaceId, category: "subscription_plan" },
    });

    if (existing) {
      await prisma.memory.update({
        where: { id: existing.id },
        data: { content: payload },
      });
    } else {
      await prisma.memory.create({
        data: { workspaceId, category: "subscription_plan", content: payload },
      });
    }

    return { success: true, plan: newPlan };
  } catch (error: unknown) {
    console.error("[setWorkspacePlan Error]:", error);
    return { success: false, plan: "FREE" };
  }
}

/**
 * Server-side plan activation invoked by the payment webhook AFTER the payment is
 * verified against Payoneer. Runs without a Clerk session, so it confirms the
 * workspace exists before applying the plan change.
 */
export async function activatePlanFromWebhook(
  workspaceId: string,
  plan: PlanTier,
  billingCycle: "monthly" | "yearly",
  transactionId: string,
  provider: "payoneer" | "test" = "payoneer"
): Promise<{ success: boolean; plan: PlanTier }> {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      throw new Error("Workspace not found for payment activation.");
    }

    const payload = JSON.stringify({
      plan,
      status: "ACTIVE",
      billingCycle,
      provider,
      transactionId,
      activatedAt: new Date().toISOString(),
    });

    const existing = await prisma.memory.findFirst({
      where: { workspaceId, category: "subscription_plan" },
    });

    if (existing) {
      await prisma.memory.update({
        where: { id: existing.id },
        data: { content: payload },
      });
    } else {
      await prisma.memory.create({
        data: { workspaceId, category: "subscription_plan", content: payload },
      });
    }

    return { success: true, plan };
  } catch (error) {
    console.error("[activatePlanFromWebhook Error]:", error);
    return { success: false, plan: "FREE" };
  }
}
