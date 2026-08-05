"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function approvePost(postId: string) {
  try {
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { status: "APPROVED" },
    });
    revalidatePath("/dashboard/content");
    return { success: true, post: updatedPost };
  } catch (error: any) {
    console.error("Error approving post:", error);
    throw new Error(error.message || "Failed to approve post");
  }
}

export async function rejectPost(postId: string) {
  try {
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { status: "REJECTED" },
    });
    revalidatePath("/dashboard/content");
    return { success: true, post: updatedPost };
  } catch (error: any) {
    console.error("Error rejecting post:", error);
    throw new Error(error.message || "Failed to reject post");
  }
}

export async function deletePost(postId: string) {
  try {
    await prisma.post.delete({
      where: { id: postId },
    });
    revalidatePath("/dashboard/content");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting post:", error);
    throw new Error(error.message || "Failed to delete post");
  }
}

export async function editPost(
  postId: string,
  updates:
    | string
    | {
        content?: string;
        platform?: string;
        imagePrompt?: string;
        scheduledFor?: Date | null;
      }
) {
  try {
    const data: any = { status: "PENDING_APPROVAL" };
    if (typeof updates === "string") {
      data.content = updates;
    } else {
      if (updates.content !== undefined) data.content = updates.content;
      if (updates.platform !== undefined) data.platform = updates.platform;
      if (updates.imagePrompt !== undefined)
        data.imagePrompt = updates.imagePrompt;
      if (updates.scheduledFor !== undefined)
        data.scheduledFor = updates.scheduledFor;
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data,
    });
    revalidatePath("/dashboard/content");
    return { success: true, post: updatedPost };
  } catch (error: any) {
    console.error("Error editing post:", error);
    throw new Error(error.message || "Failed to edit post");
  }
}
