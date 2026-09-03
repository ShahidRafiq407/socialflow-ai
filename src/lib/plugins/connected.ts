// ============================================================================
// WHAT IS CONNECTED, FOR THE CHAT COMPOSER
//
// The Plugins tab is where a connection is made; chat is where it gets used. So
// the composer needs the same list the directory shows — but only the rows that
// actually work right now, and reduced to what a mention chip needs: a name, a
// logo, and one line of what it can do.
//
// A plain module, deliberately not `"use server"`: every export of one of those
// is a public HTTP endpoint, and this is only ever read by a server component
// that has already resolved the signed-in user's workspace. Nothing here can
// return a credential — the queries never select one.
// ============================================================================

import prisma from "@/lib/db";
import { CMS_CONNECTION_PREFIX } from "@/lib/cms/registry";
import {
  getPluginEntry,
  matchMcpPlugin,
  type PluginLogoId,
} from "@/lib/plugins/catalog";

export interface ConnectedPlugin {
  /** Catalog key, or `mcp:<id>` for a server the user typed themselves. */
  key: string;
  name: string;
  logo: PluginLogoId;
  /** One grey line: the account it is connected as, or what it can do. */
  hint: string;
  /** Chips in the picker — the verbs, never prose. */
  can: string[];
}

/** The tool names cached on an MCP row at its last successful check. */
function toolCount(cache: unknown): number {
  const tools = (cache as { tools?: unknown[] } | null)?.tools;
  return Array.isArray(tools) ? tools.length : 0;
}

/**
 * Every plugin this workspace can put to work, in directory order: connectors
 * and publishing platforms first, then MCP servers.
 *
 * Failed and half-configured rows are left out on purpose. A chip that inserts
 * `@Gmail` into the composer is a promise that Gmail answers, and offering one
 * for a connection that is currently erroring just moves the failure into the
 * middle of a task.
 */
export async function listConnectedPlugins(workspaceId: string): Promise<ConnectedPlugin[]> {
  const [connections, mcpServers, legacyWordPress] = await Promise.all([
    (prisma as any).userConnection
      .findMany({
        where: { workspaceId, status: "connected" },
        select: { providerKey: true, accountLabel: true },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => [] as any[]),
    (prisma as any).mcpServerConnection
      .findMany({
        where: { workspaceId, enabled: true, lastError: null },
        select: { id: true, name: true, url: true, toolCache: true },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => [] as any[]),
    prisma.workspace
      .findUnique({ where: { id: workspaceId }, select: { wordpressSite: { select: { id: true } } } })
      .catch(() => null),
  ]);

  const out: ConnectedPlugin[] = [];
  const seen = new Set<string>();

  for (const row of (connections as any[]) || []) {
    const raw = String(row.providerKey || "");
    // `cms:wordpress` and `github` are both connections; only the prefix differs.
    const key = raw.startsWith(CMS_CONNECTION_PREFIX)
      ? raw.slice(CMS_CONNECTION_PREFIX.length)
      : raw;
    const entry = getPluginEntry(key);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);

    out.push({
      key: entry.key,
      name: entry.name,
      logo: entry.logo,
      hint: row.accountLabel ? String(row.accountLabel) : entry.blurb,
      can: entry.can,
    });
  }

  // A workspace that connected WordPress before the CMS layer existed still has
  // a working site — the same rule the publish targets use, so the two agree.
  if (!seen.has("wordpress") && (legacyWordPress as any)?.wordpressSite) {
    const entry = getPluginEntry("wordpress");
    if (entry) {
      seen.add("wordpress");
      out.push({
        key: entry.key,
        name: entry.name,
        logo: entry.logo,
        hint: entry.blurb,
        can: entry.can,
      });
    }
  }

  for (const server of (mcpServers as any[]) || []) {
    const url = String(server.url || "");
    const entry = matchMcpPlugin(url);
    const tools = toolCount(server.toolCache);
    out.push({
      // A hand-typed server has no catalog row, so its own id keeps the key unique.
      key: entry ? entry.key : `mcp:${String(server.id)}`,
      name: String(server.name || entry?.name || "MCP server"),
      logo: entry?.logo || "mcp",
      hint: tools > 0 ? `${tools} tool${tools === 1 ? "" : "s"} available` : entry?.blurb || "MCP server",
      can: entry?.can || [],
    });
  }

  return out;
}
