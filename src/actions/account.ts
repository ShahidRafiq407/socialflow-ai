// ============================================================================
// ACCOUNT SETTINGS — SERVER ACTIONS
//
// Everything the Settings tab mutates: workspace profile fields, deleting a
// single workspace, and closing the whole account.
//
// Ownership is verified on every call: a workspace id from the client is only
// accepted when it belongs to the caller.
//
// NOTE ON DELETES: the FK-safe ordering lives in `@/lib/account/purge` and is
// shared with the admin's delete-account action, so the two cannot disagree
// about what "everything" means.
// ============================================================================

"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/db";
import { clearActiveWorkspaceCookie } from "@/lib/workspace/active";
import {
  PURGE_TRANSACTION_OPTIONS,
  clearScheduleQueueFor,
  purgeWorkspaceRows,
} from "@/lib/account/purge";

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
