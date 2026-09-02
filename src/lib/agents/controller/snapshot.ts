// ============================================================================
// WORKSPACE SNAPSHOT
//
// One cheap read of "what is true about this workspace right now", injected into
// the system prompt so the controller never has to ask the user something the
// database already knows, and never claims a capability that isn't connected.
// ============================================================================

import prisma from "@/lib/db";
import type { WorkspaceSnapshot } from "./prompt";

export async function buildWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  const fallback: WorkspaceSnapshot = {
    workspaceName: "Workspace",
    connectedPlatforms: [],
    connectedConnectors: [],
    mcpServers: [],
    hasLeadGoal: false,
    hasWordPress: false,
  };

  try {
    const [workspace, postGroups, connections, mcpServers] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          name: true,
          industry: true,
          website: true,
          brandDNA: { select: { tone: true, targetAudience: true, forbiddenWords: true } },
          socialAccounts: { select: { platform: true, handle: true } },
          growthGoal: { select: { id: true } },
          wordpressSite: { select: { id: true } },
        },
      }),
      prisma.post.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }).catch(() => []),
      (prisma as any).userConnection
        .findMany({ where: { workspaceId, status: "connected" }, select: { providerKey: true } })
        .catch(() => [] as any[]),
      (prisma as any).mcpServerConnection
        .findMany({ where: { workspaceId, enabled: true }, select: { name: true } })
        .catch(() => [] as any[]),
    ]);

    if (!workspace) return fallback;

    const counts = { draft: 0, pendingApproval: 0, scheduled: 0, published: 0 };
    for (const group of (postGroups as any[]) || []) {
      const n = Number(group?._count?._all ?? 0);
      switch (String(group?.status || "").toUpperCase()) {
        case "DRAFT":
          counts.draft += n;
          break;
        case "PENDING_APPROVAL":
          counts.pendingApproval += n;
          break;
        case "SCHEDULED":
          counts.scheduled += n;
          break;
        case "PUBLISHED":
          counts.published += n;
          break;
        default:
          break;
      }
    }

    return {
      workspaceName: workspace.name,
      industry: workspace.industry,
      website: workspace.website,
      brandTone: workspace.brandDNA?.tone ?? null,
      brandAudience: workspace.brandDNA?.targetAudience ?? null,
      forbiddenWords: workspace.brandDNA?.forbiddenWords ?? [],
      connectedPlatforms: (workspace.socialAccounts || []).map((a) =>
        a.handle ? `${a.platform} (@${a.handle})` : String(a.platform)
      ),
      connectedConnectors: ((connections as any[]) || []).map((c) => String(c.providerKey)),
      mcpServers: ((mcpServers as any[]) || []).map((s) => String(s.name)),
      postCounts: counts,
      hasLeadGoal: !!workspace.growthGoal,
      hasWordPress: !!workspace.wordpressSite,
    };
  } catch (err) {
    console.warn("[WorkspaceSnapshot] failed:", err instanceof Error ? err.message : err);
    return fallback;
  }
}
