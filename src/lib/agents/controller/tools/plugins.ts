// ============================================================================
// CONTROLLER TOOLS — PLUGINS / WORKSPACE CAPABILITY AWARENESS
//
// Before the controller promises "I'll push this to GitHub" it should know
// whether GitHub is actually connected. These tools let it check the workspace's
// real capability surface (connectors, MCP servers, social accounts, WordPress)
// in one call, so it never invents a capability it does not have.
// ============================================================================

import prisma from "@/lib/db";
import type { ToolDef } from "@/lib/agents/chat/tools";
import { CONNECTOR_REGISTRY, PLANNED_CONNECTORS } from "@/lib/connectors/registry";
import { buildDeepLink } from "../navigation";

export const PLUGIN_TOOLS: ToolDef[] = [
  {
    name: "list_capabilities",
    description:
      "List what this workspace can actually do right now: which Plugin connectors are connected (GitHub, HeyGen…), " +
      "which MCP servers are attached and what tools they expose, which social accounts are linked, and whether " +
      "WordPress is set up. Call this before promising any external action, and when the user asks 'what can you do'.",
    parameters: { type: "object", properties: {} },
    execute: async (_args, ctx) => {
      const [connections, mcpServers, socialAccounts, wordpress] = await Promise.all([
        (prisma as any).userConnection
          .findMany({ where: { workspaceId: ctx.workspaceId } })
          .catch(() => [] as any[]),
        (prisma as any).mcpServerConnection
          .findMany({ where: { workspaceId: ctx.workspaceId } })
          .catch(() => [] as any[]),
        prisma.socialAccount
          .findMany({ where: { workspaceId: ctx.workspaceId }, select: { platform: true, handle: true, pageName: true } })
          .catch(() => [] as any[]),
        (prisma as any).wordPressSite
          .findUnique({ where: { workspaceId: ctx.workspaceId } })
          .catch(() => null),
      ]);

      const connectionByKey = new Map<string, any>();
      for (const c of connections || []) connectionByKey.set(c.providerKey, c);

      const connectors = CONNECTOR_REGISTRY.map((def) => {
        const row = connectionByKey.get(def.key);
        return {
          key: def.key,
          name: def.name,
          connected: !!row && row.status === "connected",
          status: row?.status || "not_connected",
          account: row?.accountLabel || null,
          lastError: row?.lastError || null,
          unlockedTools: def.chatTools || [],
          connectUrl: buildDeepLink("plugins", def.key),
        };
      });

      const mcp = (mcpServers || []).map((s: any) => {
        const cached = s.toolCache && typeof s.toolCache === "object" ? s.toolCache : {};
        const tools = Array.isArray((cached as any).tools) ? (cached as any).tools : [];
        return {
          name: s.name,
          enabled: !!s.enabled,
          toolCount: tools.length,
          tools: tools.slice(0, 25).map((t: any) => `mcp__${String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}__${t.name}`),
          lastError: s.lastError || null,
        };
      });

      return {
        connectors,
        plannedConnectors: PLANNED_CONNECTORS.map((p) => ({ key: p.key, name: p.name, status: "not_built_yet" })),
        mcpServers: mcp,
        socialAccounts: (socialAccounts || []).map((a: any) => ({
          platform: a.platform,
          handle: a.handle || a.pageName || null,
        })),
        wordpress: wordpress
          ? { connected: true, siteUrl: wordpress.siteUrl, lastVerifiedAt: wordpress.lastVerifiedAt }
          : { connected: false, setupUrl: buildDeepLink("goals") },
        pluginsUrl: buildDeepLink("plugins"),
        integrationsUrl: buildDeepLink("integrations"),
      };
    },
  },
];
