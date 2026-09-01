"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { scheduleEnqueue } from "@/lib/redis";
import { getNextBestTime } from "@/lib/bestPublishTime";

// Approving now means scheduling: the post is placed at the platform's next
// audience-peak slot and enqueued for auto-publish. (The old APPROVED status
// is retired — it left posts stuck without ever scheduling them.)
export async function approvePost(postId: string) {
  try {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return { success: false, error: "Post not found" };
    }

    // Keep an existing future slot; otherwise pick the next peak window.
    const scheduledFor =
      post.scheduledFor && post.scheduledFor.getTime() > Date.now()
        ? post.scheduledFor
        : getNextBestTime(post.platform);

    const updated = await prisma.post.update({
      where: { id: postId },
      data: { status: "SCHEDULED", scheduledFor, publishError: null },
    });

    // Best-effort Redis queue registration — the in-app dispatcher / cron
    // picks it up from here.
    if (scheduledFor.getTime() > Date.now()) {
      await scheduleEnqueue(postId, scheduledFor.getTime()).catch(() => {});
    }

    revalidatePath("/dashboard/content");
    return {
      success: true,
      post: { id: updated.id, status: updated.status, scheduledFor },
    };
  } catch (error: any) {
    console.error("Error approving post:", error);
    return { success: false, error: error.message || "Failed to approve post" };
  }
}

// Rejecting requires a reason: it is stored on the post AND delivered to the
// CEO chat as feedback so the AI can produce an improved revision.
export async function rejectPost(postId: string, reason?: string) {
  try {
    const trimmedReason = (reason || "").trim();
    if (!trimmedReason) {
      return { success: false, error: "Please provide a rejection reason." };
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return { success: false, error: "Post not found" };
    }

    const updated = await prisma.post.update({
      where: { id: postId },
      data: { status: "REJECTED", publishError: trimmedReason },
    });

    // Deliver the feedback to the workspace's most recent CEO chat session.
    try {
      let session = await prisma.chatSession.findFirst({
        where: { workspaceId: post.workspaceId },
        orderBy: { updatedAt: "desc" },
      });

      if (!session) {
        session = await prisma.chatSession.create({
          data: {
            workspaceId: post.workspaceId,
            title: "Content Library Feedback",
          },
        });
      }

      const caption = (post.content || "").replace(/\s+/g, " ").trim();
      const excerpt =
        caption.length > 100 ? `${caption.slice(0, 100)}…` : caption;

      await prisma.message.create({
        data: {
          role: "USER",
          content: `[Content Library] I rejected the ${post.platform} post "${excerpt}". Reason: ${trimmedReason}. Please create an improved version.`,
          chatSessionId: session.id,
        },
      });

      await prisma.chatSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date() },
      });
    } catch (chatError: any) {
      // Chat delivery is best-effort — the rejection itself already succeeded.
      console.error("Failed to deliver rejection feedback to chat:", chatError);
    }

    revalidatePath("/dashboard/content");
    return { success: true, post: { id: updated.id, status: updated.status } };
  } catch (error: any) {
    console.error("Error rejecting post:", error);
    return { success: false, error: error.message || "Failed to reject post" };
  }
}

// Retry a failed publish: re-queue the post for immediate dispatch. The
// dashboard's in-app scheduler picks up due SCHEDULED posts on load, focus
// and every 60 seconds.
export async function retryPost(postId: string) {
  try {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return { success: false, error: "Post not found" };
    }
    if (post.status !== "FAILED") {
      return { success: false, error: "Only failed posts can be retried." };
    }

    const scheduledFor = new Date(Date.now() + 30 * 1000);

    await prisma.post.update({
      where: { id: postId },
      data: { status: "SCHEDULED", scheduledFor, publishError: null },
    });

    await scheduleEnqueue(postId, scheduledFor.getTime()).catch(() => {});

    revalidatePath("/dashboard/content");
    return {
      success: true,
      post: { id: postId, status: "SCHEDULED", scheduledFor },
    };
  } catch (error: any) {
    console.error("Error retrying post:", error);
    return { success: false, error: error.message || "Failed to retry post" };
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
    return { success: false, error: error.message || "Failed to delete post" };
  }
}

// Editing keeps the post's current status: a scheduled post stays scheduled
// with its updated content, a draft stays a draft. Pass scheduledFor to set
// or change the publish slot.
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
    const data: any = {};
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

    const updated = await prisma.post.update({
      where: { id: postId },
      data,
    });
    revalidatePath("/dashboard/content");
    return { success: true, post: updated };
  } catch (error: any) {
    console.error("Error editing post:", error);
    throw new Error(error.message || "Failed to edit post");
  }
}
