"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { discoverMcpTools, validateMcpUrl } from "@/lib/mcp/client";

// ============================================================================
// MCP SERVER ACTIONS
// Real connect → real tools/list discovery → encrypted header storage.
// Headers are write-only: the browser never receives them back.
// ============================================================================

const MAX_SERVERS_PER_WORKSPACE = 10;

export interface McpServerView {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  toolCount: number;
  toolNames: string[];
  lastVerifiedAt: string | null;
  lastError: string | null;
  hasHeaders: boolean;
}

export interface McpToolSummary {
  name: string;
  description: string;
}

/** Verifies the caller owns the workspace before any write. */
async function assertWorkspaceOwnership(workspaceId: string): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return "Sign in required.";

  const workspace = await (prisma as any).workspace
    .findUnique({ where: { id: workspaceId }, select: { userId: true } })
    .catch(() => null);

  if (!workspace || workspace.userId !== userId) {
    return "You do not have access to this workspace.";
  }
  return null;
}

function toView(row: any): McpServerView {
  const tools = Array.isArray(row?.toolCache?.tools) ? row.toolCache.tools : [];
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled !== false,
    toolCount: tools.filter((t: any) => t?.name).length,
    toolNames: tools
      .filter((t: any) => t?.name)
      .map((t: any) => String(t.name))
      .slice(0, 50),
    lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toISOString() : null,
    lastError: row.lastError || null,
    hasHeaders: Boolean(row.headers),
  };
}

export async function listMcpServers(workspaceId: string): Promise<McpServerView[]> {
  try {
    const rows = await (prisma as any).mcpServerConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toView);
  } catch (error: any) {
    console.warn("[listMcpServers] unavailable:", error);
    return [];
  }
}

export async function addMcpServer(
  workspaceId: string,
  input: { name: string; url: string; headers?: { key: string; value: string }[] }
): Promise<{
  success: boolean;
  error?: string;
  server?: McpServerView;
  tools?: McpToolSummary[];
}> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  const name = (input.name || "").trim();
  if (!name) return { success: false, error: "Give this MCP server a name." };
  if (name.length > 40) return { success: false, error: "Name must be 40 characters or fewer." };

  const urlCheck = validateMcpUrl(input.url);
  if (!urlCheck.ok || !urlCheck.url) {
    return { success: false, error: urlCheck.error || "Invalid URL." };
  }
  const url = urlCheck.url;

  try {
    const duplicate = await (prisma as any).mcpServerConnection
      .findUnique({ where: { workspaceId_name: { workspaceId, name } } })
      .catch(() => null);
    if (duplicate) {
      return { success: false, error: `An MCP server named "${name}" already exists.` };
    }

    const count = await (prisma as any).mcpServerConnection.count({ where: { workspaceId } });
    if (count >= MAX_SERVERS_PER_WORKSPACE) {
      return {
        success: false,
        error: `You can add up to ${MAX_SERVERS_PER_WORKSPACE} MCP servers per workspace.`,
      };
    }

    // Build the header map (values write-only, stored encrypted).
    const headerMap: Record<string, string> = {};
    for (const h of input.headers || []) {
      const key = (h?.key || "").trim();
      const value = (h?.value || "").trim();
      if (key && value) {
        headerMap[key] = value;
      }
    }

    let encryptedHeaders: string | null = null;
    if (Object.keys(headerMap).length > 0) {
      const enc = encryptSecret(JSON.stringify(headerMap));
      if (!enc) {
        return {
          success: false,
          error:
            "APP_ENCRYPTION_KEY is not set on the server, so auth headers cannot be stored securely. Add it to your environment variables and try again.",
        };
      }
      encryptedHeaders = enc;
    }

    // REAL verification: connect and list tools before saving anything.
    const discovery = await discoverMcpTools(url, headerMap);
    if (!discovery.success || !discovery.tools) {
      return { success: false, error: discovery.error || "Could not connect to the MCP server." };
    }

    const row = await (prisma as any).mcpServerConnection.create({
      data: {
        workspaceId,
        name,
        url,
        headers: encryptedHeaders,
        enabled: true,
        toolCache: {
          tools: discovery.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          discoveredAt: new Date().toISOString(),
        },
        lastVerifiedAt: new Date(),
        lastError: null,
      },
    });

    revalidatePath("/dashboard/plugins");

    return {
      success: true,
      server: toView(row),
      tools: discovery.tools.map((t) => ({ name: t.name, description: t.description })),
    };
  } catch (error: any) {
    console.error("[addMcpServer] error:", error);
    return { success: false, error: error?.message || "Failed to add the MCP server." };
  }
}

/** Re-connects, re-discovers tools, refreshes the cache. */
export async function testMcpServer(
  workspaceId: string,
  serverId: string
): Promise<{ success: boolean; error?: string; server?: McpServerView; tools?: McpToolSummary[] }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  try {
    const row = await (prisma as any).mcpServerConnection.findFirst({
      where: { id: serverId, workspaceId },
    });
    if (!row) return { success: false, error: "MCP server not found." };

    const headers = decodeStoredHeaders(row.headers);
    const discovery = await discoverMcpTools(row.url, headers);

    if (!discovery.success || !discovery.tools) {
      await (prisma as any).mcpServerConnection
        .update({
          where: { id: row.id },
          data: { lastVerifiedAt: null, lastError: discovery.error || "Connection test failed." },
        })
        .catch(() => null);
      revalidatePath("/dashboard/plugins");
      return { success: false, error: discovery.error || "Connection test failed." };
    }

    const updated = await (prisma as any).mcpServerConnection.update({
      where: { id: row.id },
      data: {
        toolCache: {
          tools: discovery.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          discoveredAt: new Date().toISOString(),
        },
        lastVerifiedAt: new Date(),
        lastError: null,
      },
    });

    revalidatePath("/dashboard/plugins");

    return {
      success: true,
      server: toView(updated),
      tools: discovery.tools.map((t) => ({ name: t.name, description: t.description })),
    };
  } catch (error: any) {
    return { success: false, error: error?.message || "Connection test failed." };
  }
}

export async function toggleMcpServer(
  workspaceId: string,
  serverId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string; server?: McpServerView }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  try {
    // updateMany with workspace filter — a foreign id can never be flipped.
    const updated = await (prisma as any).mcpServerConnection.updateMany({
      where: { id: serverId, workspaceId },
      data: { enabled: enabled === true },
    });

    if (updated.count === 0) {
      return { success: false, error: "MCP server not found." };
    }

    const row = await (prisma as any).mcpServerConnection.findFirst({
      where: { id: serverId, workspaceId },
    });

    revalidatePath("/dashboard/plugins");
    return { success: true, server: row ? toView(row) : undefined };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to update the MCP server." };
  }
}

export async function deleteMcpServer(
  workspaceId: string,
  serverId: string
): Promise<{ success: boolean; error?: string }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  try {
    const deleted = await (prisma as any).mcpServerConnection
      .deleteMany({ where: { id: serverId, workspaceId } })
      .catch(() => null);

    if (!deleted || deleted.count === 0) {
      return { success: false, error: "MCP server not found." };
    }

    revalidatePath("/dashboard/plugins");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to delete the MCP server." };
  }
}

function decodeStoredHeaders(raw: string | null): Record<string, string> {
  if (!raw) return {};
  const decrypted = decryptSecret(raw);
  if (!decrypted) return {};
  try {
    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object") return {};
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v) headers[k] = v;
    }
    return headers;
  } catch {
    return {};
  }
}

/** Server-side flag for the UI: whether secret encryption is configured. */
export async function mcpEncryptionStatus(): Promise<boolean> {
  return isEncryptionConfigured();
}
