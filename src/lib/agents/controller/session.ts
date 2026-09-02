// ============================================================================
// CHAT SESSIONS
//
// Owns everything about a conversation's persistence: find-or-create, the live
// history window, the rolling summary that keeps older turns from being lost,
// and writing the user/assistant rows the UI reloads on refresh.
//
// The summary is what makes "pichla kuch b na bholy" true for a long session:
// once history is trimmed, the trimmed part is folded into ChatSession.summary
// and injected back into the system prompt on every later turn.
// ============================================================================

import prisma from "@/lib/db";
import { vertexProvider } from "../llm";
import { ensureControllerSchema } from "./schema";
import type { Artifact, AttachmentRef, ChatMessage, ChatSessionSummary, ToolRun } from "./types";
import type { ControllerHistoryMessage } from "./runtime";

/** Turns kept verbatim in the model's context window. */
const LIVE_HISTORY_TURNS = 24;
/** Turns loaded for the UI on first paint. */
const UI_HISTORY_MESSAGES = 80;
const MAX_SUMMARY_CHARS = 4000;

export interface SessionContext {
  sessionId: string;
  title: string;
  isNew: boolean;
  history: ControllerHistoryMessage[];
  summary: string | null;
  /** Messages that fell out of the live window and are not yet summarised. */
  overflow: ControllerHistoryMessage[];
}

function asArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

/** Short, human title from the first thing the user said. */
export function deriveTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] || clean;
  const base = firstSentence.length <= 60 ? firstSentence : clean.slice(0, 60).replace(/\s\S*$/, "");
  return (base || clean.slice(0, 60)).slice(0, 80);
}

/**
 * Loads (or creates) the session and returns the context the runtime needs.
 * Verifies workspace ownership so a session id from another workspace can never
 * be reopened here.
 */
export async function openSession(params: {
  workspaceId: string;
  sessionId?: string | null;
  firstMessage: string;
  model?: string;
}): Promise<SessionContext> {
  await ensureControllerSchema();

  let session: any = null;

  if (params.sessionId) {
    session = await prisma.chatSession
      .findFirst({
        where: { id: params.sessionId, workspaceId: params.workspaceId },
        select: { id: true, title: true, summary: true },
      })
      .catch(() => null);
  }

  if (!session) {
    const created = await prisma.chatSession.create({
      data: {
        workspaceId: params.workspaceId,
        title: deriveTitle(params.firstMessage),
        ...(params.model ? { model: params.model } : {}),
      },
      select: { id: true, title: true, summary: true },
    });
    return {
      sessionId: created.id,
      title: created.title || "New chat",
      isNew: true,
      history: [],
      summary: null,
      overflow: [],
    };
  }

  const rows = await prisma.message
    .findMany({
      where: { chatSessionId: session.id },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    })
    .catch(() => [] as any[]);

  const all: ControllerHistoryMessage[] = (rows as any[])
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));

  const history = all.slice(-LIVE_HISTORY_TURNS);
  const overflow = all.slice(0, Math.max(0, all.length - LIVE_HISTORY_TURNS));

  return {
    sessionId: session.id,
    title: session.title || "New chat",
    isNew: false,
    history,
    summary: session.summary || null,
    overflow,
  };
}

/** Persists the user's turn and returns its row id. */
export async function saveUserMessage(params: {
  sessionId: string;
  content: string;
  attachments?: AttachmentRef[];
}): Promise<string> {
  const row = await prisma.message.create({
    data: {
      role: "USER",
      content: params.content,
      chatSessionId: params.sessionId,
      ...(params.attachments && params.attachments.length > 0
        ? { attachments: params.attachments as any }
        : {}),
    },
    select: { id: true },
  });
  return row.id;
}

/** Persists the assistant's turn with everything the UI needs to re-render it. */
export async function saveAssistantMessage(params: {
  sessionId: string;
  content: string;
  reasoning?: string;
  toolRuns?: ToolRun[];
  artifacts?: Artifact[];
  suggestions?: string[];
  model?: string;
  durationMs?: number;
  finishReason?: string;
}): Promise<string> {
  const row = await prisma.message.create({
    data: {
      role: "AGENT",
      content: params.content || "",
      chatSessionId: params.sessionId,
      ...(params.reasoning ? { reasoning: params.reasoning } : {}),
      ...(params.toolRuns && params.toolRuns.length > 0 ? { toolCalls: params.toolRuns as any } : {}),
      ...(params.artifacts && params.artifacts.length > 0 ? { artifacts: params.artifacts as any } : {}),
      ...(params.suggestions && params.suggestions.length > 0
        ? { suggestions: params.suggestions as any }
        : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(typeof params.durationMs === "number" ? { durationMs: params.durationMs } : {}),
      ...(params.finishReason ? { finishReason: params.finishReason } : {}),
    },
    select: { id: true },
  });

  await prisma.chatSession
    .update({
      where: { id: params.sessionId },
      data: { updatedAt: new Date(), ...(params.model ? { model: params.model } : {}) },
    })
    .catch(() => null);

  return row.id;
}

/**
 * Folds the turns that fell out of the live window into the rolling summary.
 * Detached and best-effort — a failure only costs older context, never the turn.
 */
export async function refreshSessionSummary(params: {
  sessionId: string;
  existingSummary: string | null;
  overflow: ControllerHistoryMessage[];
}): Promise<void> {
  if (params.overflow.length === 0) return;

  try {
    const transcript = params.overflow
      .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content.slice(0, 1500)}`)
      .join("\n\n")
      .slice(0, 20_000);

    const data = await vertexProvider.generateJSON(
      [
        {
          role: "system",
          content:
            "You maintain the running memory of a marketing operations chat. Merge the existing summary with the " +
            'new transcript into ONE summary. Return {"summary": "..."}. Keep every durable detail: decisions made, ' +
            "content created (with its ids and platforms), campaigns, names, constraints, open threads, and anything " +
            "the user asked for that is not finished yet. Drop pleasantries and repetition. Write compact prose, " +
            `no more than ${MAX_SUMMARY_CHARS} characters.`,
        },
        {
          role: "user",
          content:
            `EXISTING SUMMARY:\n${params.existingSummary || "(none)"}\n\n` +
            `NEW TRANSCRIPT TO FOLD IN:\n${transcript}`,
        },
      ],
      { modelName: "gemini-3.6-flash", temperature: 0.2 }
    );

    const summary = typeof data?.summary === "string" ? data.summary.trim().slice(0, MAX_SUMMARY_CHARS) : "";
    if (!summary) return;

    await prisma.chatSession.update({ where: { id: params.sessionId }, data: { summary } }).catch(() => null);
  } catch (err) {
    console.warn("[Session] summary refresh skipped:", err instanceof Error ? err.message : err);
  }
}

/** Session rail listing. */
export async function listSessions(
  workspaceId: string,
  opts: { archived?: boolean; limit?: number } = {}
): Promise<ChatSessionSummary[]> {
  await ensureControllerSchema();

  const rows = await prisma.chatSession
    .findMany({
      where: { workspaceId, archived: opts.archived ?? false },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: Math.min(Math.max(opts.limit ?? 40, 1), 100),
      select: {
        id: true,
        title: true,
        pinned: true,
        archived: true,
        model: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    })
    .catch(() => [] as any[]);

  return (rows as any[]).map((s) => ({
    id: s.id,
    title: s.title || "New chat",
    pinned: !!s.pinned,
    archived: !!s.archived,
    model: s.model || undefined,
    messageCount: s._count?.messages ?? 0,
    updatedAt: (s.updatedAt instanceof Date ? s.updatedAt : new Date(s.updatedAt)).toISOString(),
  }));
}

/** Full transcript for the thread view. */
export async function loadSessionMessages(
  workspaceId: string,
  sessionId: string
): Promise<{ session: ChatSessionSummary | null; messages: ChatMessage[] }> {
  await ensureControllerSchema();

  const session = await prisma.chatSession
    .findFirst({
      where: { id: sessionId, workspaceId },
      select: {
        id: true,
        title: true,
        pinned: true,
        archived: true,
        model: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    })
    .catch(() => null);

  if (!session) return { session: null, messages: [] };

  const rows = await prisma.message
    .findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: "asc" },
      take: UI_HISTORY_MESSAGES,
      select: {
        id: true,
        role: true,
        content: true,
        reasoning: true,
        attachments: true,
        toolCalls: true,
        artifacts: true,
        suggestions: true,
        model: true,
        durationMs: true,
        finishReason: true,
        createdAt: true,
      },
    })
    .catch(() => [] as any[]);

  const messages: ChatMessage[] = (rows as any[]).map((m) => ({
    id: m.id,
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content || "",
    reasoning: m.reasoning || undefined,
    attachments: asArray<AttachmentRef>(m.attachments),
    toolRuns: asArray<ToolRun>(m.toolCalls),
    artifacts: asArray<Artifact>(m.artifacts),
    suggestions: asArray<string>(m.suggestions),
    model: m.model || undefined,
    durationMs: typeof m.durationMs === "number" ? m.durationMs : undefined,
    finishReason: m.finishReason || undefined,
    createdAt: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)).toISOString(),
  }));

  return {
    session: {
      id: session.id,
      title: session.title || "New chat",
      pinned: !!session.pinned,
      archived: !!session.archived,
      model: session.model || undefined,
      messageCount: session._count?.messages ?? messages.length,
      updatedAt: (session.updatedAt instanceof Date
        ? session.updatedAt
        : new Date(session.updatedAt)
      ).toISOString(),
    },
    messages,
  };
}

/** Rename / pin / archive. Scoped by workspace. */
export async function updateSession(
  workspaceId: string,
  sessionId: string,
  patch: { title?: string; pinned?: boolean; archived?: boolean }
): Promise<boolean> {
  const owned = await prisma.chatSession
    .findFirst({ where: { id: sessionId, workspaceId }, select: { id: true } })
    .catch(() => null);
  if (!owned) return false;

  const data: Record<string, unknown> = {};
  if (typeof patch.title === "string" && patch.title.trim()) data.title = patch.title.trim().slice(0, 120);
  if (typeof patch.pinned === "boolean") data.pinned = patch.pinned;
  if (typeof patch.archived === "boolean") data.archived = patch.archived;
  if (Object.keys(data).length === 0) return true;

  await prisma.chatSession.update({ where: { id: sessionId }, data });
  return true;
}

/** Deletes a session and its messages (cascade covers the messages). */
export async function deleteSession(workspaceId: string, sessionId: string): Promise<boolean> {
  const owned = await prisma.chatSession
    .findFirst({ where: { id: sessionId, workspaceId }, select: { id: true } })
    .catch(() => null);
  if (!owned) return false;

  await prisma.message.deleteMany({ where: { chatSessionId: sessionId } }).catch(() => null);
  await prisma.chatSession.delete({ where: { id: sessionId } });
  return true;
}
