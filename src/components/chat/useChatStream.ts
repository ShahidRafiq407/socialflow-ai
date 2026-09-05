"use client";

// ============================================================================
// useChatStream
//
// The client half of the controller: opens the SSE stream, folds every event
// into the message that is currently being written, and exposes it as ordinary
// React state. Thoughts, text, tool cards and artifacts all land on the same
// in-flight message object, which is why reasoning appears WHILE the work runs
// instead of after it.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseControllerEvent,
  splitSseFrames,
  STOPPED_TURN_TEXT,
  type Artifact,
  type AttachmentRef,
  type ChatMessage,
  type ToolRun,
} from "@/lib/agents/controller/types";

export interface PendingFile {
  name: string;
  type: string;
  size: number;
  content: string;
}

export interface MemoryFlash {
  id: string;
  category: string;
  content: string;
  pinned: boolean;
}

export interface StreamStatus {
  step: string;
  label: string;
  detail?: string;
}

interface UseChatStreamOptions {
  workspaceId: string;
  initialSessionId?: string | null;
  initialMessages?: ChatMessage[];
  onSessionCreated?: (sessionId: string, title: string) => void;
  onTitle?: (sessionId: string, title: string) => void;
  onTurnComplete?: () => void;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Matches the note the server writes on a stopped tool row. */
const CANCELLED_RUN_NOTE = "Stopped before it finished";

/**
 * Ends a message locally: nothing keeps spinning, and when it was stopped the
 * text says so. The server persists the same thing, so a reload of the thread
 * matches what was on screen when it stopped.
 */
function settleMessage(message: ChatMessage, cancelled: boolean): ChatMessage {
  const runs = message.toolRuns || [];
  const stillRunning = runs.some((r) => r.phase === "running");

  return {
    ...message,
    streaming: false,
    finishReason: cancelled ? message.finishReason || "cancelled" : message.finishReason,
    toolRuns: stillRunning
      ? runs.map((r) =>
          r.phase === "running"
            ? { ...r, phase: "cancelled" as const, progress: undefined, summary: CANCELLED_RUN_NOTE }
            : r
        )
      : runs,
    content: !cancelled
      ? message.content
      : message.content.trim()
        ? `${message.content.trimEnd()}\n\n${STOPPED_TURN_TEXT}`
        : STOPPED_TURN_TEXT,
  };
}

/**
 * The one-line banner above the thread.
 *
 * `action` is optional and is the whole reason this is a named type: a refusal the
 * user can lift themselves has to arrive with the link that lifts it. A plan boundary
 * rendered as bare prose left the user reading "needs a paid plan" with nothing to
 * click, which is indistinguishable from a dead end.
 */
export interface ChatNotice {
  level: "info" | "warn";
  message: string;
  action?: { label: string; href: string };
}

export function useChatStream(options: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages || []);
  const [sessionId, setSessionId] = useState<string | null>(options.initialSessionId || null);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [memoryFlash, setMemoryFlash] = useState<MemoryFlash[]>([]);
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  // Bumped on every send and on every stop. A turn only owns the shared state
  // (streaming flag, abort handle, status line) while its token is still the
  // current one — so an aborted turn whose `finally` runs late cannot reset the
  // turn the user started right after pressing Stop.
  const turnRef = useRef(0);

  // The live session id, so a second message sent right after the first turn
  // joins the same session instead of opening a new one on a stale closure.
  const sessionIdRef = useRef<string | null>(options.initialSessionId || null);
  const setActiveSession = useCallback((id: string | null) => {
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Applies a patch to the in-flight assistant message. */
  const patchAssistant = useCallback((patch: (m: ChatMessage) => ChatMessage) => {
    const id = assistantIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  /**
   * Stop means stop, on screen as well as on the server. Aborting the fetch takes
   * the request down with it (the route bridges the abort into the model and into
   * every tool), and the rows are settled here because the events that would have
   * finished them are never arriving.
   */
  const stop = useCallback(() => {
    const id = assistantIdRef.current;
    turnRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    assistantIdRef.current = null;
    setStreaming(false);
    setStatus(null);
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? settleMessage(m, true) : m)));
  }, []);

  const send = useCallback(
    async (params: { text: string; files?: PendingFile[]; model?: string }) => {
      const text = params.text.trim();
      const files = params.files || [];
      if ((!text && files.length === 0) || streaming) return;

      const attachments: AttachmentRef[] = files.map((f) => ({
        name: f.name,
        type: f.type,
        size: f.size,
        kind: f.type.startsWith("image/")
          ? "image"
          : f.type.startsWith("video/")
            ? "video"
            : f.type.startsWith("audio/")
              ? "audio"
              : "document",
      }));

      const userMessage: ChatMessage = {
        id: makeId("u"),
        role: "user",
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
        createdAt: new Date().toISOString(),
      };

      const assistantId = makeId("a");
      assistantIdRef.current = assistantId;
      const turn = turnRef.current + 1;
      turnRef.current = turn;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        reasoning: "",
        toolRuns: [],
        artifacts: [],
        createdAt: new Date().toISOString(),
        streaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setStreaming(true);
      setNotice(null);
      setMemoryFlash([]);
      setStatus({ step: "connect", label: "Connecting" });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            workspaceId: options.workspaceId,
            sessionId: sessionIdRef.current,
            model: params.model,
            files,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => ({}) as any);
          throw new Error(detail?.error || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const { frames, rest } = splitSseFrames(buffer);
          buffer = rest;

          for (const frame of frames) {
            const event = parseControllerEvent(frame);
            if (!event) continue;

            switch (event.type) {
              case "session":
                if (event.sessionId !== sessionIdRef.current) {
                  setActiveSession(event.sessionId);
                  options.onSessionCreated?.(event.sessionId, event.title || "New chat");
                }
                break;

              case "title":
                options.onTitle?.(event.sessionId, event.title);
                break;

              case "status":
                setStatus(
                  event.state === "done" && event.step === "context"
                    ? null
                    : { step: event.step, label: event.label, detail: event.detail }
                );
                break;

              case "memory":
                setMemoryFlash(event.facts);
                break;

              case "model":
                setActiveModel(event.model);
                patchAssistant((m) => ({ ...m, model: event.model }));
                if (event.fallback) {
                  setNotice({ level: "info", message: `Running on ${event.model} (fallback).` });
                }
                break;

              case "thought":
                patchAssistant((m) => ({ ...m, reasoning: (m.reasoning || "") + event.delta }));
                break;

              case "text":
                setStatus(null);
                patchAssistant((m) => ({ ...m, content: m.content + event.delta }));
                break;

              case "tool":
                patchAssistant((m) => {
                  const runs = [...(m.toolRuns || [])];
                  const at = runs.findIndex((r) => r.id === event.run.id);
                  if (at >= 0) runs[at] = event.run as ToolRun;
                  else runs.push(event.run as ToolRun);
                  return { ...m, toolRuns: runs };
                });
                break;

              case "artifact":
                patchAssistant((m) => {
                  const list = [...(m.artifacts || [])];
                  if (!list.some((a) => a.id === (event.artifact as Artifact).id)) {
                    list.push(event.artifact as Artifact);
                  }
                  return { ...m, artifacts: list };
                });
                break;

              case "suggestions":
                patchAssistant((m) => ({ ...m, suggestions: event.items }));
                break;

              case "notice":
                setNotice({ level: event.level, message: event.message });
                break;

              case "error":
                // A plan boundary is not a fault. The server sends the refusal down the
                // open stream as an `error` frame because a 402 body would arrive as an
                // unparseable chunk, and it marks it `plan_blocked` for exactly this
                // branch — which used to ignore the code and print "Something went
                // wrong", so a turn refused for want of credits read as a broken
                // product and the upgrade link was nowhere on screen.
                if (event.code === "plan_blocked") {
                  setNotice({
                    level: "warn",
                    message: event.message || "This needs a paid plan.",
                    action: { label: "See plans", href: "/dashboard/billing" },
                  });
                  patchAssistant((m) => ({
                    ...m,
                    content:
                      m.content +
                      (m.content ? "\n\n" : "") +
                      (event.message || "This needs a paid plan."),
                    finishReason: "plan_blocked",
                  }));
                  break;
                }
                patchAssistant((m) => ({
                  ...m,
                  content:
                    m.content +
                    (m.content ? "\n\n" : "") +
                    `**Something went wrong.** ${event.message}`,
                  finishReason: "error",
                }));
                break;

              case "done":
                patchAssistant((m) => ({
                  ...m,
                  id: event.messageId && event.messageId !== "unsaved" ? event.messageId : m.id,
                  streaming: false,
                  durationMs: event.durationMs,
                  model: event.model,
                  finishReason: event.finishReason,
                }));
                setStatus(null);
                break;

              default:
                break;
            }
          }
        }
      } catch (err) {
        const aborted = (err as any)?.name === "AbortError";
        if (!aborted) {
          const message = err instanceof Error ? err.message : String(err);
          patchAssistant((m) => ({
            ...m,
            content: m.content + (m.content ? "\n\n" : "") + `**Connection lost.** ${message}`,
            finishReason: "error",
          }));
        }
      } finally {
        // Only the turn that still owns the stream may reset it. After a Stop the
        // user can send again immediately, and this block must not take the new
        // turn's abort handle or streaming flag down with the old one.
        if (turnRef.current === turn) {
          // However the turn ended — cleanly, a dropped connection, a thrown
          // error — nothing is allowed to stay marked running once it is over.
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? settleMessage(m, false) : m)));
          assistantIdRef.current = null;
          abortRef.current = null;
          setStreaming(false);
          setStatus(null);
          options.onTurnComplete?.();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.workspaceId, streaming, patchAssistant, setActiveSession]
  );

  /** Swaps the whole thread when the user opens another session. */
  const loadSession = useCallback(
    (id: string | null, loaded: ChatMessage[]) => {
      turnRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      assistantIdRef.current = null;
      setStreaming(false);
      setStatus(null);
      setNotice(null);
      setMemoryFlash([]);
      setActiveSession(id);
      setMessages(loaded);
    },
    [setActiveSession]
  );

  return {
    messages,
    sessionId,
    streaming,
    status,
    memoryFlash,
    notice,
    activeModel,
    send,
    stop,
    loadSession,
    setNotice,
  };
}
