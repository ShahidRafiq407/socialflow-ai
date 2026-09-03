// ============================================================================
// ACTIVE WORKSPACE
//
// One place decides which workspace a request operates on. The header switcher
// writes the chosen id into a cookie; every server-side read comes back through
// here. Ownership is re-checked on every read, so a cookie carried over from
// another account resolves to nothing and falls back to the caller's own oldest
// workspace instead of exposing a stranger's data.
//
// The fallback is also what keeps single-workspace accounts behaving exactly as
// before: no cookie means "oldest workspace", which is what the whole app used
// to hardcode with `findFirst({ where: { userId } })`.
// ============================================================================

import { cache } from "react";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";

export const ACTIVE_WORKSPACE_COOKIE = "pl_active_workspace";

/** A year: switching is deliberate, it should survive a browser restart. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Cookie access throws outside a request scope (cron jobs, scripts, warm-ups).
 * That is not an error here — it only means "no preference expressed".
 */
async function readCookieValue(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

/**
 * Server actions and route handlers only — a Server Component cannot set
 * cookies and Next throws if it tries.
 */
export async function setActiveWorkspaceCookie(workspaceId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/** Used after a workspace is deleted, so the cookie never points at a ghost. */
export async function clearActiveWorkspaceCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(ACTIVE_WORKSPACE_COOKIE);
  } catch {
    // Outside a request scope there is nothing to clear.
  }
}

/**
 * The workspace this request is about: the switched-to one while the cookie
 * still points at a workspace the caller owns, otherwise their oldest one.
 * `null` only when the account has no workspace at all (onboarding never ran).
 *
 * Memoised per render pass, so a page that resolves it five times pays once.
 */
export const resolveActiveWorkspaceId = cache(
  async (userId: string): Promise<string | null> => {
    const requested = await readCookieValue();

    if (requested) {
      const owned = await prisma.workspace
        .findFirst({ where: { id: requested, userId }, select: { id: true } })
        .catch(() => null);
      if (owned) return owned.id;
    }

    const oldest = await prisma.workspace
      .findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
      .catch(() => null);

    return oldest?.id ?? null;
  }
);

export interface ActiveWorkspaceQuery {
  where: { userId: string; id?: string };
  orderBy: { createdAt: "asc" };
}

/**
 * Ready to spread into any workspace lookup:
 *
 *   prisma.workspace.findFirst({
 *     ...(await activeWorkspaceQuery(userId)),
 *     include: { brandDNA: true },
 *   })
 *
 * Callers keep their own select/include and their own not-found handling. The
 * only thing that changes is *which* workspace comes back.
 */
export async function activeWorkspaceQuery(userId: string): Promise<ActiveWorkspaceQuery> {
  const id = await resolveActiveWorkspaceId(userId);
  return {
    where: id ? { userId, id } : { userId },
    orderBy: { createdAt: "asc" },
  };
}

/** Signed-in caller plus their active workspace, for code that needs both. */
export async function getActiveWorkspace(): Promise<
  { userId: string; workspaceId: string } | null
> {
  const { userId } = await auth();
  if (!userId) return null;
  const workspaceId = await resolveActiveWorkspaceId(userId);
  return workspaceId ? { userId, workspaceId } : null;
}

export interface WorkspaceContext {
  workspaces: { id: string; name: string }[];
  activeWorkspaceId: string | null;
}

/**
 * Everything the header switcher renders, in a single query: the active id is
 * derived from the same list it is displayed against, so the highlighted row
 * and the workspace the pages actually load can never disagree.
 */
export async function getWorkspaceContext(userId: string): Promise<WorkspaceContext> {
  const [requested, workspaces] = await Promise.all([
    readCookieValue(),
    prisma.workspace.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const active = workspaces.find((w) => w.id === requested) ?? workspaces[0] ?? null;
  return { workspaces, activeWorkspaceId: active?.id ?? null };
}


