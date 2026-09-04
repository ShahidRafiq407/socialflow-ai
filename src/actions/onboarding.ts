"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/db";
import { checkWorkspaceLimit } from "@/lib/billing/entitlements";
import { setActiveWorkspaceCookie } from "@/lib/workspace/active";
import { attributeReferral } from "@/lib/affiliate/referral";

export async function createWorkspaceAction(data: {
  companyName: string;
  industry: string;
  targetAudience: string;
  brandTone: string;
}) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Every plan includes at least one workspace, so a genuine first-time onboarding
  // always passes here. The check exists because /onboarding stays reachable after
  // that — without it, the plan's workspace limit could be walked around by simply
  // visiting the page again.
  const gate = await checkWorkspaceLimit(userId);
  if (!gate.allowed) {
    throw new Error(gate.message ?? "Your plan does not include another workspace.");
  }

  // Ensure user exists in our DB
  let user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    // If Clerk user doesn't exist in our DB, create them with minimal info
    user = await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@placeholder.com`, // Placeholder email
      },
    });

    // The moment the account is born is the only moment a referral can be
    // attributed to it. Idempotent, and never allowed to fail the signup.
    await attributeReferral(userId).catch(() => undefined);
  }

  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: data.companyName,
        industry: data.industry,
        userId: userId,
      },
    });

    await tx.brandDNA.create({
      data: {
        tone: data.brandTone,
        targetAudience: data.targetAudience,
        workspaceId: ws.id,
      },
    });

    return ws;
  });

  // Land the user inside the workspace they just described, not in whichever one
  // happens to be oldest. Without this, finishing onboarding on an account that
  // already has a workspace drops you back into the old one.
  await setActiveWorkspaceCookie(workspace.id);
  revalidatePath("/", "layout");

  return workspace;
}
