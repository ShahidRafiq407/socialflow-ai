// ============================================================================
// CHAT FEEDBACK — SERVER ACTIONS
//
// A thumbs up or down under an assistant message, with an optional note. One
// vote per (message, user); voting again replaces it. The admin reads these in
// the back office to see which answers are failing and on which model.
// ============================================================================

"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { ensureAdminSchema } from "@/lib/admin/schema";

const schema = z.object({
  messageId: z.string().trim().min(1).max(80),
  sessionId: z.string().trim().min(1).max(80),
  workspaceId: z.string().trim().min(1).max(80),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().trim().max(2000).optional(),
  model: z.string().trim().max(120).optional(),
  messageExcerpt: z.string().trim().max(600).optional(),
});

export type ChatFeedbackInput = z.infer<typeof schema>;

export async function submitChatFeedback(
  input: ChatFeedbackInput
): Promise<{ success: true } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Invalid feedback." };

  // The workspace has to be the caller's own, or a stranger could write feedback
  // rows against somebody else's session ids.
  const owns = await prisma.workspace
    .findFirst({ where: { id: parsed.data.workspaceId, userId }, select: { id: true } })
    .catch(() => null);
  if (!owns) return { success: false, error: "Workspace not found." };

  try {
    await ensureAdminSchema();
    await prisma.chatFeedback.upsert({
      where: { messageId_userId: { messageId: parsed.data.messageId, userId } },
      create: {
        messageId: parsed.data.messageId,
        sessionId: parsed.data.sessionId,
        workspaceId: parsed.data.workspaceId,
        userId,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
        model: parsed.data.model || null,
        messageExcerpt: parsed.data.messageExcerpt || null,
      },
      update: {
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
        model: parsed.data.model || null,
        messageExcerpt: parsed.data.messageExcerpt || null,
        // A changed vote is new again for the admin queue.
        status: null,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[submitChatFeedback]", err);
    return { success: false, error: "Feedback could not be saved right now." };
  }
}

/** The caller's own votes for a session, so the thumbs stay lit after a reload. */
export async function getSessionFeedback(sessionId: string): Promise<Record<string, 1 | -1>> {
  const { userId } = await auth();
  if (!userId || !sessionId) return {};
  try {
    await ensureAdminSchema();
    const rows = await prisma.chatFeedback.findMany({
      where: { userId, sessionId },
      select: { messageId: true, rating: true },
    });
    return Object.fromEntries(rows.map((row) => [row.messageId, row.rating as 1 | -1]));
  } catch {
    return {};
  }
}
