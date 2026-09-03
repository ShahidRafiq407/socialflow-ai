// ============================================================================
// REQUEST AUTH
//
// Every controller route needs the same two facts: who is calling, and which
// workspace they own. Resolving it in one place means a session or memory id
// from another tenant can never be reached through this chat.
// ============================================================================

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";

export interface ControllerIdentity {
  userId: string;
  workspaceId: string;
}

export type IdentityResult =
  | { ok: true; identity: ControllerIdentity }
  | { ok: false; status: 401 | 404; error: string };

/**
 * Resolves the caller's workspace. When `requestedWorkspaceId` is given it must
 * belong to the caller; otherwise the workspace the header is currently pointing
 * at is used, so the chat answers about the brand on screen.
 */
export async function resolveIdentity(requestedWorkspaceId?: string | null): Promise<IdentityResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };

  const scope = requestedWorkspaceId
    ? { where: { id: requestedWorkspaceId, userId }, orderBy: { createdAt: "asc" as const } }
    : await activeWorkspaceQuery(userId);

  const workspace = await prisma.workspace
    .findFirst({ ...scope, select: { id: true } })
    .catch(() => null);

  if (!workspace) {
    return {
      ok: false,
      status: 404,
      error: requestedWorkspaceId ? "Workspace not found" : "No workspace yet — finish onboarding first.",
    };
  }

  return { ok: true, identity: { userId, workspaceId: workspace.id } };
}
