"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
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

  // Ensure user exists in our DB with real Clerk profile details
  let user = await prisma.user.findUnique({
    where: { id: userId },
  });

  const clerkUser = await currentUser().catch(() => null);
  const realEmail = clerkUser?.emailAddresses?.[0]?.emailAddress || `${userId}@placeholder.com`;
  const realName = clerkUser?.firstName
    ? `${clerkUser.firstName} ${clerkUser.lastName || ""}`.trim()
    : null;
  const realAvatar = clerkUser?.imageUrl || null;

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: userId,
        email: realEmail,
        name: realName,
        avatar: realAvatar,
      },
    });

    // The moment the account is born is the only moment a referral can be
    // attributed to it. Idempotent, and never allowed to fail the signup.
    await attributeReferral(userId).catch(() => undefined);
  } else if (
    (user.email.includes("@placeholder") && !realEmail.includes("@placeholder")) ||
    (!user.name && realName) ||
    (!user.avatar && realAvatar)
  ) {
    user = await prisma.user
      .update({
        where: { id: userId },
        data: {
          ...(user.email.includes("@placeholder") && !realEmail.includes("@placeholder") ? { email: realEmail } : {}),
          ...(!user.name && realName ? { name: realName } : {}),
          ...(!user.avatar && realAvatar ? { avatar: realAvatar } : {}),
        },
      })
      .catch(() => user);
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
