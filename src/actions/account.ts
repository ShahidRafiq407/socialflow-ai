// ============================================================================
// ACCOUNT SETTINGS — SERVER ACTIONS
//
// Everything the Settings tab mutates: workspace profile fields, deleting a
// single workspace, and closing the whole account.
//
// Ownership is verified on every call: a workspace id from the client is only
// accepted when it belongs to the caller.
//
// NOTE ON DELETES: the Prisma schema has no onDelete: Cascade on workspace
// relations (only Message→ChatSession and LinkClick→TrackedLink), so a plain
// `workspace.delete` would fail with a foreign-key error. Deletes therefore
// remove the children in FK-safe order inside one transaction — no schema
// migration is involved.
// ============================================================================

"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { clearActiveWorkspaceCookie } from "@/lib/workspace/active";
import { removeFromScheduleQueue } from "@/lib/redis";

// ─────────────────────────────────────────────────────────────────────────────
// Update workspace profile fields (Settings → Workspace)
// ─────────────────────────────────────────────────────────────────────────────

const workspaceSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required.")
    .max(120, "Workspace name is too long (max 120 characters)."),
  industry: z.string().trim().max(160, "Industry is too long (max 160 characters).").optional(),
  website: z.string().trim().max(300, "Website URL is too long.").optional(),
});

/** Adds a protocol when the user typed a bare domain, so `example.com` works. */
function normalizeWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  data: { name: string; industry?: string; website?: string }
): Promise<{ success: true } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: { id: true },
  });
  if (!workspace) return { success: false, error: "Workspace not found." };

  const parsed = workspaceSettingsSchema.safeParse({
    name: data?.name ?? "",
    industry: data?.industry ?? "",
    website: data?.website ?? "",
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid values." };
  }

  const website = normalizeWebsite(parsed.data.website || "");
  if (website) {
    const url = z.string().url().safeParse(website);
    if (!url.success) {
      return { success: false, error: "That website does not look like a valid URL." };
    }
  }

  try {
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        name: parsed.data.name,
        industry: parsed.data.industry || null,
        website: website || null,
      },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("[updateWorkspaceSettings]", err);
    return { success: false, error: "Could not save the workspace. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete a single workspace (Settings → Danger Zone)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes every row that belongs to a workspace, in FK-safe order, then the
 * workspace itself. Kept separate from the caller so account closure reuses
 * the exact same ordering.
 */
async function purgeWorkspaceRows(tx: Prisma.TransactionClient, workspaceIds: string[]) {
  if (workspaceIds.length === 0) return;
  const where = { workspaceId: { in: workspaceIds } };

  await tx.contentPost.deleteMany({ where });
  await tx.automationRule.deleteMany({ where });
  await tx.post.deleteMany({ where });
  await tx.socialAccount.deleteMany({ where });
  await tx.competitor.deleteMany({ where });
  await tx.brandDNA.deleteMany({ where });
  await tx.chatSettings.deleteMany({ where });
  await tx.growthGoal.deleteMany({ where });
  await tx.memory.deleteMany({ where });
  await tx.mediaAsset.deleteMany({ where });
  await tx.hashtagGroup.deleteMany({ where });
  await tx.wordPressSite.deleteMany({ where });
  await tx.userConnection.deleteMany({ where });
  await tx.mcpServerConnection.deleteMany({ where });
  await tx.leadEvent.deleteMany({ where });
  await tx.publishLog.deleteMany({ where });
  // LinkClick + Message first so the delete never depends on DB-level cascades.
  await tx.linkClick.deleteMany({ where });
  await tx.message.deleteMany({ where: { chatSession: { workspaceId: { in: workspaceIds } } } });
  await tx.chatSession.deleteMany({ where });
  await tx.trackedLink.deleteMany({ where });
  // Article pipeline: the run holds a required workspace FK (no cascade), while
  // its stages, sources and claims cascade on runId.
  await tx.articleRun.deleteMany({ where });
  await tx.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
}

/**
 * Interactive transactions default to a 5s timeout — far too little for ~23
 * sequential deletes over a remote database on a populated account. The purge
 * is all-or-nothing, so a generous ceiling beats a mid-way abort that rolls
 * everything back and makes the user retry.
 */
const PURGE_TRANSACTION_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

/** Best-effort: drop this workspace's scheduled posts from the Redis queue. */
async function clearScheduleQueueFor(workspaceId: string) {
  try {
    const scheduled = await prisma.post.findMany({
      where: { workspaceId, status: "SCHEDULED" },
      select: { id: true },
    });
    await Promise.all(scheduled.map((p) => removeFromScheduleQueue(p.id)));
  } catch {
    // Queue entries for missing posts are already skipped by the publish cron.
  }
}

export async function deleteWorkspace(workspaceId: string): Promise<{ success: true; redirect: string } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: { id: true },
  });
  if (!workspace) return { success: false, error: "Workspace not found." };

  const remaining = await prisma.workspace.count({
    where: { userId, id: { not: workspace.id } },
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        await purgeWorkspaceRows(tx, [workspace.id]);
      },
      PURGE_TRANSACTION_OPTIONS
    );
    // Only after the rows are truly gone: purging the queue first would leave
    // scheduled posts stranded in Postgres if the transaction rolled back.
    await clearScheduleQueueFor(workspace.id);
  } catch (err) {
    console.error("[deleteWorkspace]", err);
    return { success: false, error: "The workspace could not be deleted. Please try again." };
  }

  // The header must not keep pointing at a workspace that no longer exists.
  // Clearing rather than re-pointing lets the resolver fall back to the oldest
  // remaining workspace, which is also what a fresh account sees.
  await clearActiveWorkspaceCookie();

  revalidatePath("/dashboard/settings");
  // The switcher and every workspace-scoped page live in the dashboard layout.
  revalidatePath("/", "layout");
  // The caller navigates to this destination client-side.
  return { success: true, redirect: remaining > 0 ? "/dashboard" : "/onboarding" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Close account (Settings → Danger Zone)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permanently deletes the user and everything they own:
 *
 *  1. All workspaces and every relation (same ordering as workspace delete).
 *  2. The user row itself.
 *  3. The Clerk user, so the session dies with the account.
 *
 * Idempotent by design: if the DB rows are already gone (a previous attempt
 * that died between steps), the Prisma part is skipped and the Clerk deletion
 * is retried — a retry can never leave half an account behind.
 */
export async function closeAccount(): Promise<{ success: true } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const workspaces = await prisma.workspace.findMany({
    where: { userId },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (existing) {
          await purgeWorkspaceRows(tx, workspaceIds);
          await tx.user.delete({ where: { id: userId } });
        }
        // User row already gone (earlier attempt) — nothing to do, stay idempotent.
      },
      PURGE_TRANSACTION_OPTIONS
    );

    // Queue entries for already-deleted posts are skipped by the publish cron,
    // but a clean sweep keeps the queue honest. Runs after commit, like above.
    for (const id of workspaceIds) {
      await clearScheduleQueueFor(id);
    }
  } catch (err) {
    // P2025 = row already deleted, which is the success case for a retry.
    const code = (err as { code?: string })?.code;
    if (code !== "P2025") {
      console.error("[closeAccount] database step failed:", err);
      return {
        success: false,
        error: "Your data could not be erased yet. Nothing was deleted — please try again.",
      };
    }
  }

  // The account is gone, so the active-workspace pointer has to go with it —
  // otherwise a new account signing in on this browser inherits a stale id.
  await clearActiveWorkspaceCookie();

  // Auth removal happens last: if this fails the data is already gone, and the
  // user must be able to retry (a second call skips the Prisma part).
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (err) {
    // A 404 from Clerk means the user is already gone — treat as success.
    const status = (err as { status?: number })?.status ?? (err as { errors?: Array<{ code?: string }> })?.errors?.[0]?.code;
    if (status === 404 || status === "resource_not_found" || status === "not_found") {
      return { success: true };
    }
    console.error("[closeAccount] Clerk deletion failed:", err);
    return {
      success: false,
      error:
        "Your data has been erased, but we could not remove the login itself. Please try again — the retry only finishes the login removal.",
    };
  }

  return { success: true };
}
