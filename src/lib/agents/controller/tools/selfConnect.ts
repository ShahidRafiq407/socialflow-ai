// ============================================================================
// CONTROLLER TOOLS — CONSTRAINED SELF-CONNECT
//
// The one place the controller is allowed to extend its own capabilities. A user
// who says "connect my Linear MCP server" should not have to go find the Plugins
// tab; the controller can attach it and be using those tools by the next message.
//
// The constraint is the point. Attaching a server sends this workspace's auth
// headers to an outside host and puts that host's tools inside the model's reach,
// so it takes two calls with the human's own words in between:
//
//   propose_tool_connection → validates the URL through the same SSRF guard the
//     Plugins tab uses, connects once to list what the server really exposes, and
//     parks the request. NOTHING is attached, so this step is safe to reach for.
//   connect_tool_server → re-reads the user's actual reply from the Message table
//     and only then calls addMcpServer, the same pipeline the Plugins tab calls.
//
// Why the answer is read from the database rather than taken as an argument: the
// model cannot write a USER message. So "the user approved" is a fact it can
// report but not manufacture. Same-turn confirmation is impossible by construction
// — there is no reply row yet — which is exactly the property that makes this
// safe to leave switched on. Both steps also re-check workspace ownership, and
// addMcpServer checks the signed-in user again on its own.
//
// This gate holds in AUTO autonomy too: "act without asking" was granted over
// this product's own actions, not over what this product is wired into.
// ============================================================================

import prisma from "@/lib/db";
import type { ToolContext, ToolDef } from "@/lib/agents/chat/tools";
import { addMcpServer } from "@/actions/mcpServers";
import { discoverMcpTools, validateMcpUrl } from "@/lib/mcp/client";
import { buildDeepLink } from "../navigation";
import {
  CONNECT_REQUEST_TTL_MS,
  MAX_CONNECT_HEADERS,
  describeConnectedServer,
  describeProposalForUser,
  headerKeysOf,
  isConnectRequestExpired,
  normalizeHeaders,
  toHeaderMap,
} from "../selfConnect";
import {
  discardPendingConnect,
  loadPendingConnect,
  pendingHeaderMap,
  readApprovalAfter,
  savePendingConnect,
} from "../selfConnectStore";

const TTL_MINUTES = Math.round(CONNECT_REQUEST_TTL_MS / 60_000);

/**
 * Ownership, checked here as well as inside addMcpServer. The chat route already
 * resolves the caller's own workspace, so this is the second lock rather than the
 * only one — and it is the lock that still holds if this controller is ever run
 * from a context with no signed-in request behind it.
 */
async function denyIfNotOwner(ctx: ToolContext): Promise<string | null> {
  if (!ctx.userId) return "Sign in required before changing what this workspace is connected to.";
  if (!ctx.workspaceId) return "No workspace in context.";
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { userId: true },
    });
    if (!workspace || workspace.userId !== ctx.userId) {
      return "You do not have access to this workspace.";
    }
    return null;
  } catch {
    return "Could not verify who owns this workspace, so nothing was connected.";
  }
}

export const SELF_CONNECT_TOOLS: ToolDef[] = [
  {
    name: "propose_tool_connection",
    description:
      "Step 1 of connecting a new MCP tool server to this workspace. Validates the URL, connects once to list " +
      "the tools the server really exposes, and parks the request — it attaches NOTHING. Use it when the user " +
      "asks to connect a server, or when a task needs a capability this workspace does not have and the user " +
      "has an MCP server for it. Show the confirmation_message it returns and stop; only after the user answers " +
      "yes in their own next message can connect_tool_server finish the job.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'Short label for the server, e.g. "Linear". 40 characters max, must be unique in this workspace.',
        },
        url: {
          type: "string",
          description:
            "The server's Streamable HTTP MCP endpoint, e.g. https://mcp.example.com/mcp. Must be https in production. " +
            "Use exactly what the user gave you — never guess a URL.",
        },
        why: {
          type: "string",
          description: "One line on what the user wants it for. Shown to them in the confirmation.",
        },
        headers: {
          type: "array",
          description:
            `Auth headers the server needs, at most ${MAX_CONNECT_HEADERS}. Only include a value the user has ` +
            "actually given you in this conversation. Never invent, guess or reuse a token from anywhere else.",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: 'Header name, e.g. "Authorization".' },
              value: { type: "string", description: "Header value exactly as the user supplied it." },
            },
            required: ["key", "value"],
          },
        },
      },
      required: ["name", "url"],
    },
    execute: async (args, ctx) => {
      const denied = await denyIfNotOwner(ctx);
      if (denied) return { error: denied };

      // No session means no future message to read consent out of, so the second
      // step could never be satisfied. Refuse now rather than park a dead request.
      if (!ctx.sessionId) {
        return { error: "A connection can only be proposed inside a chat session." };
      }

      const name = String(args?.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!name) return { error: "Give the server a short name first." };

      const urlCheck = validateMcpUrl(String(args?.url || ""));
      if (!urlCheck.ok || !urlCheck.url) {
        return { error: urlCheck.error || "That is not a usable MCP server URL." };
      }
      const url = urlCheck.url;

      const duplicate = await prisma.mcpServerConnection
        .findFirst({ where: { workspaceId: ctx.workspaceId, name }, select: { id: true } })
        .catch(() => null);
      if (duplicate) {
        return {
          error: `An MCP server named "${name}" is already attached to this workspace. Use a different name, or check list_capabilities first.`,
        };
      }

      const headers = normalizeHeaders(args?.headers);

      // A real connection now, so the user approves a known tool surface instead
      // of a URL. This is also the honest place to fail: a server that cannot be
      // reached is not something to ask permission for.
      ctx.onProgress?.(`Testing the MCP server "${name}"...`);
      const discovery = await discoverMcpTools(url, toHeaderMap(headers));
      if (!discovery.success || !discovery.tools) {
        return {
          error: `Could not reach that MCP server, so there is nothing to confirm: ${discovery.error || "connection failed"}`,
          url,
        };
      }

      const toolNames = discovery.tools.map((t) => t.name);
      const parked = await savePendingConnect({
        workspaceId: ctx.workspaceId,
        sessionId: ctx.sessionId,
        name,
        url,
        reason: String(args?.why || ""),
        toolNames,
        headers,
      });
      if (!parked.saved || !parked.id) {
        return { error: parked.error || "Could not park the connection request." };
      }

      return {
        parked: true,
        connected: false,
        request_id: parked.id,
        server: { name, url },
        auth_headers: headerKeysOf(headers),
        tool_count: toolNames.length,
        tools: toolNames.slice(0, 25),
        expires_in_minutes: TTL_MINUTES,
        confirmation_message: describeProposalForUser({
          name,
          url,
          reason: String(args?.why || "").replace(/\s+/g, " ").trim().slice(0, 240),
          headerKeys: headerKeysOf(headers),
          toolNames,
          secret: null,
        }),
        next_step:
          "Show confirmation_message to the user, then end your turn. When their NEXT message says yes, call " +
          "connect_tool_server with this request_id. You cannot approve this yourself and you cannot complete it " +
          "in this turn — the approval is read from the user's own message.",
        manual_alternative: buildDeepLink("plugins"),
      };
    },
  },
  {
    name: "connect_tool_server",
    description:
      "Step 2: actually attach a server that propose_tool_connection parked, once the user has said yes in their " +
      "own message. Takes only the request_id — the name, URL and headers come from what they approved, so they " +
      "cannot be changed after the fact. Returns declined or waiting_for_user instead of connecting if their " +
      "answer was no, unclear, or has not arrived yet. On success the new tools are callable from your next turn.",
    parameters: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "The request_id returned by propose_tool_connection in an earlier turn.",
        },
      },
      required: ["request_id"],
    },
    execute: async (args, ctx) => {
      const denied = await denyIfNotOwner(ctx);
      if (denied) return { error: denied };

      const requestId = String(args?.request_id || "").trim();
      if (!requestId) return { error: "Pass the request_id from propose_tool_connection." };

      const pending = await loadPendingConnect(ctx.workspaceId, requestId);
      if (!pending) {
        return {
          connected: false,
          error:
            "No pending connection request with that id. It was already used, declined, or it expired — " +
            "call propose_tool_connection again if the user still wants it.",
        };
      }

      if (isConnectRequestExpired(pending.createdAt)) {
        await discardPendingConnect(ctx.workspaceId, requestId);
        return {
          connected: false,
          error: `That request is older than ${TTL_MINUTES} minutes. Propose it again so the user approves the current one.`,
        };
      }

      // Consent belongs to the conversation it was given in.
      if (!pending.sessionId || pending.sessionId !== ctx.sessionId) {
        return {
          connected: false,
          error: "That request was made in a different conversation. Propose it again here.",
        };
      }

      // THE GATE. Not an argument, not a claim — the user's own rows.
      const approval = await readApprovalAfter(pending.sessionId, pending.createdAt);

      if (approval.replies === 0) {
        return {
          connected: false,
          waiting_for_user: true,
          request_id: requestId,
          confirmation_message: describeProposalForUser(pending.record),
          note:
            "The user has not replied since the proposal. Show confirmation_message and end your turn — the " +
            "approval has to be their next message, and you cannot supply it yourself.",
        };
      }

      if (approval.verdict === "declined") {
        await discardPendingConnect(ctx.workspaceId, requestId);
        return {
          connected: false,
          declined: true,
          server: { name: pending.record.name, url: pending.record.url },
          note: "The user said no, so nothing was connected. Do not propose this server again unless they bring it up.",
        };
      }

      if (approval.verdict !== "approved") {
        return {
          connected: false,
          needs_clear_answer: true,
          request_id: requestId,
          expires_in_minutes: TTL_MINUTES,
          note:
            "Their reply was not a clear yes or no, so nothing was connected. Ask once, plainly, whether to " +
            `connect "${pending.record.name}" — a clear yes in a later message still works while the request lives.`,
        };
      }

      // Approved. From here on, only what was parked is used — the model never
      // gets a second chance to name the target.
      const { name, url } = pending.record;
      const headerMap = pendingHeaderMap(pending.record);
      const headers = Object.entries(headerMap).map(([key, value]) => ({ key, value }));

      ctx.onProgress?.(`Connecting "${name}"...`);
      const added = await addMcpServer(ctx.workspaceId, { name, url, headers });

      if (!added.success) {
        // The row stays: the yes is still on file, so a retry inside the TTL does
        // not make the user approve the same thing twice.
        return {
          connected: false,
          approved: true,
          request_id: requestId,
          error: `The user approved it, but attaching failed: ${added.error || "unknown error"}`,
        };
      }

      await discardPendingConnect(ctx.workspaceId, requestId);

      const attached = (added.tools || []).map((t) => t.name);
      return {
        connected: true,
        server: { name, url, tool_count: attached.length },
        tools: attached.slice(0, 25),
        summary: describeConnectedServer(name, attached),
        note: "These tools load at the start of a turn, so they are callable from your next message, not this one.",
        plugins_url: buildDeepLink("plugins"),
      };
    },
  },
];
