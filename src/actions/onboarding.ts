"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";

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

  return workspace;
}
