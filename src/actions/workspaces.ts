// ============================================================================
// WORKSPACES — SERVER ACTIONS
//
// The header switcher talks to this file. Three jobs:
//
//   switchWorkspace  — remember which workspace the user is looking at
//   createWorkspace  — add one from anywhere, without a detour to /onboarding
//   getWorkspaceDeletionSummary — what a delete would actually destroy
//
// Switch and create write the active-workspace cookie and revalidate the
// dashboard layout, so the change is visible on the very next render — no manual
// page refresh. The delete itself lives in @/actions/account, which owns the
// purge order for every workspace-scoped table.
// ============================================================================

"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/db";
import { checkWorkspaceLimit } from "@/lib/billing/entitlements";
import {
  resolveActiveWorkspaceId,
  setActiveWorkspaceCookie,
} from "@/lib/workspace/active";
import { attributeReferral } from "@/lib/affiliate/referral";

export interface WorkspaceSummary {
  id: string;
  name: string;
}

/**
 * How many workspaces an account may own is a plan decision, so it is not decided
 * here — `checkWorkspaceLimit` reads the entitlement and counts the rows, and its
 * refusal already names the limit and the plan that raises it. Free gets one,
 * Agency gets as many as the work needs.
 */

/** Every dashboard route hangs off the same layout, so one call covers all. */
function revalidateDashboard() {
  revalidatePath("/", "layout");
}

// ─────────────────────────────────────────────────────────────────────────────
// Switch
// ─────────────────────────────────────────────────────────────────────────────

export async function switchWorkspace(
  workspaceId: string
): Promise<{ success: true; workspace: WorkspaceSummary } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
  if (!id) return { success: false, error: "No workspace selected." };

  // Ownership check and name lookup in one round trip. An id from another
  // tenant simply does not match, so the cookie is never written for it.
  const workspace = await prisma.workspace
    .findFirst({ where: { id, userId }, select: { id: true, name: true } })
    .catch(() => null);

  if (!workspace) {
    return { success: false, error: "That workspace is no longer available." };
  }

  await setActiveWorkspaceCookie(workspace.id);
  revalidateDashboard();

  return { success: true, workspace };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters.")
    .max(120, "Workspace name is too long (max 120 characters)."),
  industry: z.string().trim().max(160, "Industry is too long (max 160 characters.)").optional(),
  website: z.string().trim().max(300, "Website URL is too long.").optional(),
});

/** Adds a protocol when the user typed a bare domain, so `example.com` works. */
function normalizeWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Clerk owns the login, so the local User row may not exist yet on a first
 * write. Created with the real email when Clerk answers in time — the unique
 * constraint is on email, so a placeholder would otherwise be permanent.
 */
async function ensureUserRow(userId: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (existing) return;

  const user = await currentUser().catch(() => null);
  const email = user?.emailAddresses?.[0]?.emailAddress || `${userId}@placeholder.local`;
  const name = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : null;

  try {
    await prisma.user.create({ data: { id: userId, email, name } });
  } catch (err) {
    // P2002 = that email already belongs to another row. The login is still
    // valid, so fall back to an id-derived address rather than failing the
    // whole create.
    if ((err as { code?: string })?.code !== "P2002") throw err;
    await prisma.user.create({
      data: { id: userId, email: `${userId}@placeholder.local`, name },
    });
  }

  // A user row born here is a signup that skipped onboarding's hook; attribute
  // any pending referral the same way. Idempotent and never fatal.
  await attributeReferral(userId).catch(() => undefined);
}

/**
 * Creates a workspace and makes it the active one, so the caller lands inside
 * the thing they just made. A BrandDNA row is created alongside it because
 * every downstream feature (AI Studio, Article Writer, Brand DNA) expects one
 * to exist — onboarding does the same.
 */
export async function createWorkspace(input: {
  name: string;
  industry?: string;
  website?: string;
}): Promise<{ success: true; workspace: WorkspaceSummary } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createSchema.safeParse({
    name: input?.name ?? "",
    industry: input?.industry ?? "",
    website: input?.website ?? "",
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid values." };
  }

  const website = normalizeWebsite(parsed.data.website || "");
  if (website && !z.string().url().safeParse(website).success) {
    return { success: false, error: "That website does not look like a valid URL." };
  }

  try {
    // The plan's ceiling, checked before anything is written. The gate counts the
    // account's own workspaces, so a second workspace on Free is refused with the
    // sentence that says which plan includes it.
    const gate = await checkWorkspaceLimit(userId);
    if (!gate.allowed) {
      return { success: false, error: gate.message ?? "Your plan does not include another workspace." };
    }

    const duplicate = await prisma.workspace.findFirst({
      where: { userId, name: { equals: parsed.data.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) {
      return { success: false, error: "You already have a workspace with that name." };
    }

    await ensureUserRow(userId);

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          name: parsed.data.name,
          industry: parsed.data.industry || null,
          website: website || null,
          userId,
        },
        select: { id: true, name: true },
      });

      await tx.brandDNA.create({ data: { workspaceId: ws.id } });
      return ws;
    });

    // Active immediately: creating a workspace you are then not inside is the
    // bug this replaces.
    await setActiveWorkspaceCookie(workspace.id);
    revalidateDashboard();

    return { success: true, workspace };
  } catch (err) {
    console.error("[createWorkspace]", err);
    return { success: false, error: "The workspace could not be created. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The switcher's own view of the world. The header already receives this from
 * the layout; this exists for clients that need to re-read it without a full
 * navigation (after a create, or when another tab switched underneath them).
 */
export async function getWorkspaces(): Promise<{
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
}> {
  const { userId } = await auth();
  if (!userId) return { workspaces: [], activeWorkspaceId: null };

  const [workspaces, activeWorkspaceId] = await Promise.all([
    prisma.workspace
      .findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => []),
    resolveActiveWorkspaceId(userId),
  ]);

  return { workspaces, activeWorkspaceId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deletion summary
//
// Deleting from the switcher has to be as honest as deleting from Settings' own
// Danger Zone: the dialog names what disappears before the button arms. The
// Danger Zone reads counts for the *active* workspace out of getSettingsData;
// this answers for any workspace the user owns, because from the switcher you
// can delete one you are not currently inside.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceDeletionSummary {
  id: string;
  name: string;
  /** True when this is the last workspace, which sends the user to onboarding. */
  isLast: boolean;
  counts: {
    posts: number;
    scheduledPosts: number;
    socialAccounts: number;
    chatSessions: number;
    mediaAssets: number;
    articleRuns: number;
  };
}

export async function getWorkspaceDeletionSummary(
  workspaceId: string
): Promise<{ success: true; summary: WorkspaceDeletionSummary } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
  if (!id) return { success: false, error: "No workspace selected." };

  const workspace = await prisma.workspace
    .findFirst({ where: { id, userId }, select: { id: true, name: true } })
    .catch(() => null);

  if (!workspace) {
    return { success: false, error: "That workspace is no longer available." };
  }

  // Every count is guarded on its own: a dialog that renders "0 posts" because
  // one query hiccuped is still a dialog that lists the right consequences for
  // everything else, and the delete itself does not depend on these numbers.
  const scope = { workspaceId: workspace.id };
  const [posts, scheduledPosts, socialAccounts, chatSessions, mediaAssets, articleRuns, others] =
    await Promise.all([
      prisma.post.count({ where: scope }).catch(() => 0),
      prisma.post.count({ where: { ...scope, status: "SCHEDULED" } }).catch(() => 0),
      prisma.socialAccount.count({ where: scope }).catch(() => 0),
      prisma.chatSession.count({ where: scope }).catch(() => 0),
      prisma.mediaAsset.count({ where: scope }).catch(() => 0),
      prisma.articleRun.count({ where: scope }).catch(() => 0),
      prisma.workspace.count({ where: { userId, id: { not: workspace.id } } }).catch(() => 1),
    ]);

  return {
    success: true,
    summary: {
      id: workspace.id,
      name: workspace.name,
      isLast: others === 0,
      counts: { posts, scheduledPosts, socialAccounts, chatSessions, mediaAssets, articleRuns },
    },
  };
}




