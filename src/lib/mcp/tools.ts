// ============================================================================
// MCP TOOL LOADER — server-only. Reads the workspace's enabled MCP servers
// and converts their cached tool snapshots into chat ToolDefs so the
// orchestrator can plan with them and execute them like built-in tools.
// ============================================================================

import prisma from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { ToolDef, ToolContext } from "@/lib/agents/chat/tools";
import { sanitizeMcpName, callMcpTool, McpToolInfo } from "@/lib/mcp/client";

const MAX_MCP_TOOLS_PER_WORKSPACE = 50;

interface CachedTool {
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface ToolCacheShape {
  tools?: CachedTool[];
  discoveredAt?: string;
}

function decodeToolCache(cache: unknown): McpToolInfo[] {
  if (!cache || typeof cache !== "object") return [];
  const shape = cache as ToolCacheShape;
  if (!Array.isArray(shape.tools)) return [];

  return shape.tools
    .filter((t) => t && typeof t.name === "string" && t.name.trim())
    .map((t) => ({
      name: String(t.name),
      description: typeof t.description === "string" ? t.description : "",
      inputSchema:
        t.inputSchema && typeof t.inputSchema === "object"
          ? (t.inputSchema as Record<string, unknown>)
          : { type: "object", properties: {} },
    }));
}

function decodeHeaders(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  const decrypted = decryptSecret(raw);
  if (!decrypted) return {};
  try {
    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object") return {};
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) headers[k] = v;
    }
    return headers;
  } catch {
    return {};
  }
}

/**
 * Loads every enabled, verified MCP server for a workspace and returns
 * chat-ready ToolDefs. Tool names are prefixed `mcp__<server>__<tool>` so
 * they can never collide with built-in tools. Failures degrade to an empty
 * list — a broken MCP server must not break the whole chat.
 */
export async function getWorkspaceMcpTools(workspaceId: string): Promise<ToolDef[]> {
  let servers: any[] = [];
  try {
    servers = await (prisma as any).mcpServerConnection.findMany({
      where: { workspaceId, enabled: true },
    });
  } catch (error) {
    console.warn("[getWorkspaceMcpTools] unavailable:", error);
    return [];
  }

  const toolDefs: ToolDef[] = [];
  const serverPrefixes = new Set<string>();

  for (const server of servers) {
    const tools = decodeToolCache(server.toolCache);
    if (tools.length === 0) continue;

    // Unique prefix even when two servers share a sanitized name
    let prefix = sanitizeMcpName(server.name);
    if (serverPrefixes.has(prefix)) {
      let n = 2;
      while (serverPrefixes.has(`${prefix}-${n}`)) n++;
      prefix = `${prefix}-${n}`;
    }
    serverPrefixes.add(prefix);

    const url: string = server.url;
    const headers = decodeHeaders(server.headers);

    for (const tool of tools) {
      if (toolDefs.length >= MAX_MCP_TOOLS_PER_WORKSPACE) break;

      toolDefs.push({
        name: `mcp__${prefix}__${tool.name}`,
        description: `[MCP tool from server "${server.name}"] ${
          tool.description || `Calls the "${tool.name}" tool.`
        }`.slice(0, 500),
        parameters:
          tool.inputSchema && tool.inputSchema.type === "object"
            ? (tool.inputSchema as Record<string, any>)
            : { type: "object", properties: {} },
        execute: async (args: any, ctx: ToolContext) => {
          ctx.onProgress?.(`Calling MCP tool "${tool.name}" on server "${server.name}"...`);
          const res = await callMcpTool(url, headers, tool.name, args || {});
          if (!res.success) {
            return {
              error: `MCP tool "${tool.name}" failed: ${res.error}`,
              server: server.name,
            };
          }
          return res.result;
        },
      });
    }
  }

  return toolDefs;
}

/** Test-time helper: build ToolDefs from an explicit tool list (no DB). */
export function buildMcpToolDefs(
  serverName: string,
  url: string,
  headers: Record<string, string>,
  tools: McpToolInfo[]
): ToolDef[] {
  const prefix = sanitizeMcpName(serverName);
  return tools.map((tool) => ({
    name: `mcp__${prefix}__${tool.name}`,
    description: `[MCP tool from server "${serverName}"] ${tool.description || tool.name}`,
    parameters:
      tool.inputSchema && tool.inputSchema.type === "object"
        ? (tool.inputSchema as Record<string, any>)
        : { type: "object", properties: {} },
    execute: async (args: any) => {
      const res = await callMcpTool(url, headers, tool.name, args || {});
      return res.success ? res.result : { error: res.error };
    },
  }));
}
