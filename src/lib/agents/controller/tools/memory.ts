// ============================================================================
// CONTROLLER TOOLS — MEMORY
//
// The "never forgets" surface the model itself drives: remember, recall, list,
// forget. Backed by controller/memory.ts (pgvector + pinned always-load).
// ============================================================================

import type { ToolDef } from "@/lib/agents/chat/tools";
import { forgetMemory, loadMemoryContext, rememberFact, searchMemories } from "../memory";

export const MEMORY_TOOLS: ToolDef[] = [
  {
    name: "remember",
    description:
      "Store a durable fact about the user, their business, their preferences, or a decision they made, so it is " +
      "available in every future conversation. Call this whenever the user tells you something worth keeping — their " +
      "brand voice, target audience, posting rules, a name, a deadline, a preference like 'never use emojis'. " +
      "Set importance 5 (or pinned) for identity-level facts that must load on every single turn.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact, written as a standalone sentence that will make sense months from now." },
        category: {
          type: "string",
          description: "Grouping label, e.g. brand, audience, preference, product, schedule, person, decision.",
        },
        importance: {
          type: "number",
          description: "1 = trivia, 3 = normal, 5 = never forget (always loaded). Default 3.",
        },
        pinned: { type: "boolean", description: "Force this fact to load on every turn." },
      },
      required: ["content"],
    },
    execute: async (args, ctx) => {
      const res = await rememberFact({
        workspaceId: ctx.workspaceId,
        content: String(args.content || ""),
        category: args.category,
        importance: args.importance,
        pinned: args.pinned === true,
        source: "user",
        sessionId: ctx.sessionId ?? null,
      });
      if (!res.saved) return { error: "Could not store that memory." };
      return {
        stored: true,
        merged: res.merged === true,
        id: res.id,
        note: res.merged ? "Updated an existing near-identical memory instead of duplicating it." : undefined,
      };
    },
  },
  {
    name: "recall",
    description:
      "Search long-term memory for what you already know about a topic. Use it before asking the user something they " +
      "may have already told you.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in natural language." },
        limit: { type: "number", description: "Max facts to return (default 10)." },
      },
      required: ["query"],
    },
    execute: async (args, ctx) => {
      const facts = await loadMemoryContext(
        ctx.workspaceId,
        String(args.query || ""),
        Math.min(30, Math.max(1, Math.round(args.limit || 10)))
      );
      return {
        count: facts.length,
        facts: facts.map((f) => ({
          id: f.id,
          category: f.category,
          content: f.content,
          importance: f.importance,
          pinned: f.pinned,
        })),
      };
    },
  },
  {
    name: "list_memories",
    description:
      "List everything stored in memory, optionally filtered by category or a text match. Use when the user asks " +
      "'what do you remember about me' or wants to audit their memory.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string" },
        query: { type: "string", description: "Substring filter over the fact text." },
        limit: { type: "number", description: "Default 50, max 200." },
      },
    },
    execute: async (args, ctx) => {
      const facts = await searchMemories(ctx.workspaceId, {
        category: args.category,
        query: args.query,
        limit: Math.min(200, Math.max(1, Math.round(args.limit || 50))),
      });
      const byCategory: Record<string, number> = {};
      for (const f of facts) byCategory[f.category] = (byCategory[f.category] || 0) + 1;
      return {
        count: facts.length,
        byCategory,
        facts: facts.map((f) => ({
          id: f.id,
          category: f.category,
          content: f.content,
          importance: f.importance,
          pinned: f.pinned,
          source: f.source,
        })),
      };
    },
  },
  {
    name: "forget",
    description:
      "Permanently delete one stored memory by id. Only do this when the user explicitly asks you to forget " +
      "something — look the id up with list_memories or recall first.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Memory id to delete." } },
      required: ["id"],
    },
    execute: async (args, ctx) => {
      const ok = await forgetMemory(ctx.workspaceId, String(args.id || ""));
      return ok ? { deleted: true } : { error: "No such memory in this workspace." };
    },
  },
];
