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
  onTurnComplete?: () => void;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useChatStream(options: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages || []);
  const [sessionId, setSessionId] = useState<string | null>(options.initialSessionId || null);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [memoryFlash, setMemoryFlash] = useState<MemoryFlash[]>([]);
  const [notice, setNotice] = useState<{ level: "info" | "warn"; message: string } | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Applies a patch to the in-flight assistant message. */
  const patchAssistant = useCallback((patch: (m: ChatMessage) => ChatMessage) => {
    const id = assistantIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStatus(null);
    patchAssistant((m) => ({ ...m, streaming: false, finishReason: m.finishReason || "cancelled" }));
    assistantIdRef.current = null;
  }, [patchAssistant]);

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
            sessionId,
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

          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";

          for (const frame of frames) {
            const event = parseControllerEvent(frame);
            if (!event) continue;

            switch (event.type) {
              case "session":
                if (event.sessionId !== sessionId) {
                  setSessionId(event.sessionId);
                  options.onSessionCreated?.(event.sessionId, event.title || "New chat");
                }
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
        patchAssistant((m) => ({ ...m, streaming: false }));
        assistantIdRef.current = null;
        abortRef.current = null;
        setStreaming(false);
        setStatus(null);
        options.onTurnComplete?.();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.workspaceId, sessionId, streaming, patchAssistant]
  );

  /** Swaps the whole thread when the user opens another session. */
  const loadSession = useCallback((id: string | null, loaded: ChatMessage[]) => {
    abortRef.current?.abort();
    abortRef.current = null;
    assistantIdRef.current = null;
    setStreaming(false);
    setStatus(null);
    setNotice(null);
    setMemoryFlash([]);
    setSessionId(id);
    setMessages(loaded);
  }, []);

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
