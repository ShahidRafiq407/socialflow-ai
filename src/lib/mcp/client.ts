// ============================================================================
// MCP CLIENT RUNTIME — server-only. Never import from a client component.
//
// Opens a short-lived Streamable HTTP connection per operation (discover /
// call), which works on serverless platforms like Vercel: no persistent
// process, no SSE session management. Uses the official MCP SDK.
// ============================================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_TOOLS_PER_SERVER = 50;

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface DiscoveredMcpTools {
  serverName: string;
  tools: McpToolInfo[];
}

/** Normalizes and validates an MCP server URL (https required in production). */
export function validateMcpUrl(raw: string): { ok: boolean; url?: string; error?: string } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { ok: false, error: "Enter the MCP server URL." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Only http(s) MCP server URLs are supported." };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");

  // In production, block plain-HTTP and internal addresses (SSRF guard).
  if (process.env.NODE_ENV === "production") {
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "Only https:// MCP server URLs are allowed in production." };
    }
    if (isLocal || isPrivateHostname(hostname)) {
      return { ok: false, error: "Internal addresses cannot be used as MCP servers." };
    }
  }

  return { ok: true, url: parsed.toString() };
}

function isPrivateHostname(hostname: string): boolean {
  if (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^0\./.test(hostname)
  ) {
    return true;
  }
  return hostname.endsWith(".internal") || hostname.endsWith(".local");
}

/** Sanitizes a server name for use inside the prefixed chat tool name. */
export function sanitizeMcpName(name: string): string {
  const cleaned = (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return cleaned || "server";
}

async function createMcpClient(
  url: string,
  headers: Record<string, string>
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: {
        Accept: "application/json, text/event-stream",
        ...headers,
      },
    },
  });

  const client = new Client(
    { name: "postloomai-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, "connect");
  return { client, transport };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`MCP server ${label} timed out after ${ms / 1000}s.`)), ms)
    ),
  ]);
}

/** Connects, lists tools, closes. Used by the Plugins "Test" flow. */
export async function discoverMcpTools(
  url: string,
  headers: Record<string, string>
): Promise<{ success: boolean; tools?: McpToolInfo[]; error?: string }> {
  let client: Client | null = null;
  try {
    const created = await createMcpClient(url, headers);
    client = created.client;

    const res = await withTimeout(client.listTools(), CALL_TIMEOUT_MS, "tools/list");
    const tools: McpToolInfo[] = (res?.tools || []).slice(0, MAX_TOOLS_PER_SERVER).map((t: any) => ({
      name: String(t?.name || ""),
      description: String(t?.description || ""),
      inputSchema:
        t?.inputSchema && typeof t.inputSchema === "object"
          ? (t.inputSchema as Record<string, unknown>)
          : { type: "object", properties: {} },
    }));

    const valid = tools.filter((t) => t.name);
    if (valid.length === 0) {
      return { success: false, error: "The MCP server connected but exposed no tools." };
    }

    return { success: true, tools: valid };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not connect to the MCP server.",
    };
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
  }
}

/** Connects, calls one tool, closes. Used by the chat orchestrator. */
export async function callMcpTool(
  url: string,
  headers: Record<string, string>,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  let client: Client | null = null;
  try {
    const created = await createMcpClient(url, headers);
    client = created.client;

    const res = await withTimeout(
      client.callTool({ name: toolName, arguments: args }),
      CALL_TIMEOUT_MS,
      `call "${toolName}"`
    );

    if (res?.isError === true) {
      return {
        success: false,
        error: `MCP tool "${toolName}" returned an error: ${mcpContentToText(res)}`,
      };
    }

    return { success: true, result: simplifyToolResult(res) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : `MCP tool "${toolName}" failed.`,
    };
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
  }
}

function mcpContentToText(res: any): string {
  const content = Array.isArray(res?.content) ? res.content : [];
  const texts = content
    .map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : ""))
    .filter(Boolean);
  return texts.join(" ") || "(no details)";
}

/**
 * Flattens the MCP content envelope into a chat-friendly shape: plain string
 * when the tool only returned text, otherwise the structured result.
 */
export function simplifyToolResult(res: any): unknown {
  if (!res) return null;

  const content = Array.isArray(res.content) ? res.content : [];
  const textParts = content
    .map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : null))
    .filter((t: unknown): t is string => Boolean(t));

  if (content.length > 0 && textParts.length === content.length) {
    return textParts.join("\n");
  }

  return {
    content: content.length > 0 ? textParts.length === 0 ? content : textParts : undefined,
    structuredContent: res.structuredContent ?? undefined,
  };
}
