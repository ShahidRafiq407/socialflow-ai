// ============================================================================
// THE DASHBOARD'S CREDIT WIDGET
//
// One small read for the header strip on the overview page: the plan, what is
// left, and the two or three limits worth showing before a user goes looking for
// the billing tab.
//
// It used to guess. It counted AI-looking posts for the month, multiplied article
// runs by five, and called the result "credits used" — a number that matched
// nothing anyone was ever charged. Now it reads the wallet, which is the same
// balance every gate checks and every debit writes to, so the figure on the
// dashboard and the figure on the invoice are the same figure.
//
// Scoped to the account, not the workspace: credits are bought by a person and
// spent across all of their workspaces, so a per-workspace balance would be a
// fiction. The workspace id is still taken, because the connected-account count
// genuinely is per workspace.
// ============================================================================

import prisma from "@/lib/db";
import {
  PlanTier,
  UNLIMITED,
  getEntitlements,
  getPlanConfig,
  isUnlimited,
  planHasFeature,
} from "./plans";
import { getPlanContext } from "./entitlements";
import { getWalletBalance } from "./wallet";

export interface WorkspaceCreditInfo {
  plan: PlanTier;
  planName: string;
  tagline: string;
  status: string;
  /** This period's grant. -1 = unlimited. */
  creditsTotal: number;
  /** Spent out of this period's grant. */
  creditsUsed: number;
  /** Spendable right now, including purchased credits and net of holds. -1 = unlimited. */
  creditsLeft: number;
  percentUsed: number;
  isUnlimited: boolean;
  canAccessAI: boolean;
  canGenerateVideo: boolean;
  maxSocialAccounts: number;
  connectedAccounts: number;
  resetDate?: string | null;
}

/** What Free looks like, for the paths where nothing else is known. */
function freeInfo(connectedAccounts = 0): WorkspaceCreditInfo {
  const config = getPlanConfig("FREE");
  const entitlements = getEntitlements("FREE");
  return {
    plan: "FREE",
    planName: config.name,
    tagline: config.tagline,
    status: "NONE",
    creditsTotal: 0,
    creditsUsed: 0,
    creditsLeft: 0,
    percentUsed: 0,
    isUnlimited: false,
    canAccessAI: false,
    canGenerateVideo: false,
    maxSocialAccounts: entitlements.socialAccountsPerWorkspace,
    connectedAccounts,
    resetDate: null,
  };
}

export async function getWorkspaceCreditInfo(workspaceId: string): Promise<WorkspaceCreditInfo> {
  try {
    // The owner of the workspace is who the credits belong to.
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { userId: true },
    });
    if (!workspace) return freeInfo();

    const [context, accountCount] = await Promise.all([
      getPlanContext(workspace.userId),
      prisma.socialAccount.count({ where: { workspaceId } }).catch(() => 0),
    ]);

    const config = getPlanConfig(context.plan);
    const wallet = await getWalletBalance(workspace.userId, context.plan);
    const unlimitedCredits = isUnlimited(context.entitlements.monthlyCredits);

    return {
      plan: context.plan,
      planName: config.name,
      tagline: config.tagline,
      status: context.status,
      creditsTotal: unlimitedCredits ? UNLIMITED : wallet.monthlyGrant,
      // Out of the grant, not out of the balance: a top-up should not make the
      // period's usage bar jump backwards.
      creditsUsed: Math.max(0, wallet.monthlyGrant - wallet.grantBalance),
      creditsLeft: unlimitedCredits ? UNLIMITED : wallet.available,
      percentUsed: unlimitedCredits ? 0 : wallet.percentUsed,
      isUnlimited: unlimitedCredits,
      // "AI" on this widget means the Content Studio generator — the thing a
      // visitor is looking for when they ask whether their plan writes posts.
      canAccessAI: planHasFeature(context.plan, "aistudio.generate"),
      canGenerateVideo: planHasFeature(context.plan, "media.video"),
      maxSocialAccounts: context.entitlements.socialAccountsPerWorkspace,
      connectedAccounts: accountCount,
      resetDate: wallet.grantPeriodEnd ? wallet.grantPeriodEnd.toISOString() : null,
    };
  } catch (error) {
    console.warn("[getWorkspaceCreditInfo] falling back to Free", error);
    return freeInfo();
  }
}
