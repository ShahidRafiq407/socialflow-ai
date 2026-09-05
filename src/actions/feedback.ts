// ============================================================================
// PRODUCT FEEDBACK — SERVER ACTION
//
// Anything the user wants to tell us from anywhere in the dashboard: a bug, an
// idea, a complaint about a bill, or that something finally worked. It lands in
// the same back-office queue as the chat votes, filed as "general".
//
// Deliberately a different table from `ChatFeedback`. A chat vote provably has a
// message, a session, a workspace and a ±1, and the satisfaction number is built
// on all four being real. This has none of them guaranteed — the shell runs fine
// with no workspace picked — so relaxing that table would have made its own
// numbers untrustworthy for the sake of a text box.
//
// Nothing here trusts the client for identity: the user comes from the session,
// the workspace is looked up server-side, and the browser string is read off the
// request rather than posted. A caller can only choose what they wrote.
// ============================================================================

"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { z } from "zod";
import prisma from "@/lib/db";
import { ensureAdminSchema } from "@/lib/admin/schema";
import { activeWorkspaceQuery } from "@/lib/workspace/active";

/** What the dialog offers. Kept in step with the admin queue's category chip. */
export const FEEDBACK_CATEGORIES = ["bug", "idea", "praise", "billing", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/**
 * How many a single account may send in an hour.
 *
 * There is no unique constraint to lean on — the same person saying two things
 * is two rows, correctly — so the only thing standing between the queue and a
 * held-down submit button is this. Five is high enough that nobody writing in
 * good faith will ever meet it.
 */
const HOURLY_LIMIT = 5;

const schema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES).default("other"),
  /** -1 something is wrong, 0 neutral, 1 happy. Absent when they did not say. */
  sentiment: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable().optional(),
  message: z.string().trim().min(4, "Tell us a little more than that.").max(4000),
  /** The screen they were on. Path only — a full URL could carry a query string. */
  path: z.string().trim().max(512).optional(),
});

export type ProductFeedbackInput = z.input<typeof schema>;

type Result = { success: true } | { success: false; error: string };

/**
 * Clerk owns the login, so the local `User` row may not exist yet — feedback can
 * genuinely be the first thing a new account writes, before any workspace is
 * created. The row is needed for the foreign key; the real email is used when
 * Clerk answers in time, because the unique constraint is on email and a
 * placeholder would otherwise stick.
 */
async function ensureUserRow(userId: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (existing) return;

  const user = await currentUser().catch(() => null);
  const email = user?.emailAddresses?.[0]?.emailAddress || `${userId}@placeholder.local`;
  const name = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : null;
  try {
    await prisma.user.create({ data: { id: userId, email, name, avatar: user?.imageUrl || null } });
  } catch (err) {
    // P2002 = that email already belongs to another row. The login is still good,
    // so fall back to an id-derived address rather than losing the feedback.
    if ((err as { code?: string })?.code !== "P2002") throw err;
    await prisma.user
      .create({ data: { id: userId, email: `${userId}@placeholder.local`, name } })
      .catch(() => {});
  }
}

export async function submitProductFeedback(input: ProductFeedbackInput): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Please sign in again to send feedback." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "That feedback could not be read." };
  }

  try {
    await ensureAdminSchema();

    const recent = await prisma.productFeedback.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= HOURLY_LIMIT) {
      return {
        success: false,
        error: "You have sent several messages in the last hour — we have them all. Try again a little later.",
      };
    }

    await ensureUserRow(userId);

    // Looked up here rather than accepted from the form: a workspace id posted by
    // the browser could name somebody else's workspace.
    const workspace = await prisma.workspace
      .findFirst({ ...(await activeWorkspaceQuery(userId)), select: { id: true } })
      .catch(() => null);

    const userAgent = (await headers()).get("user-agent")?.slice(0, 400) || null;

    await prisma.productFeedback.create({
      data: {
        userId,
        workspaceId: workspace?.id ?? null,
        category: parsed.data.category,
        sentiment: parsed.data.sentiment ?? null,
        message: parsed.data.message,
        path: parsed.data.path || null,
        userAgent,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[submitProductFeedback]", err);
    return { success: false, error: "Your feedback could not be saved right now. Please try again in a moment." };
  }
}
