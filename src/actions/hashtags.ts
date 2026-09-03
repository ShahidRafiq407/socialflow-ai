"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { activeWorkspaceQuery } from "@/lib/workspace/active";

export async function getHashtagGroups() {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

    if (!workspace) throw new Error("Workspace not found");

    const groups = await prisma.hashtagGroup.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: groups };
  } catch (error: any) {
    console.error("Error fetching hashtag groups:", error);
    return { success: false, error: error.message };
  }
}

export async function createHashtagGroup(name: string, tags: string[]) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

    if (!workspace) throw new Error("Workspace not found");

    // Clean tags: remove empty, add # if missing
    const cleanedTags = tags
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(t => t.startsWith("#") ? t : `#${t}`);

    const group = await prisma.hashtagGroup.create({
      data: {
        name,
        tags: cleanedTags,
        workspaceId: workspace.id,
      },
    });

    revalidatePath("/dashboard/ai-studio");
    return { success: true, data: group };
  } catch (error: any) {
    console.error("Error creating hashtag group:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteHashtagGroup(id: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

    if (!workspace) throw new Error("Workspace not found");

    // Verify ownership
    const group = await prisma.hashtagGroup.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!group) throw new Error("Hashtag group not found");

    await prisma.hashtagGroup.delete({
      where: { id },
    });

    revalidatePath("/dashboard/ai-studio");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting hashtag group:", error);
    return { success: false, error: error.message };
  }
}
