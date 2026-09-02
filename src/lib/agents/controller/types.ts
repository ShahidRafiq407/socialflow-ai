// ============================================================================
// CONTROLLER WIRE PROTOCOL
//
// The single contract between the streaming route and the browser. Pure types
// plus tiny pure helpers — safe to import from client components (no prisma, no
// server SDKs).
// ============================================================================

export type ArtifactKind = "image" | "video" | "link" | "post" | "file" | "publish" | "plan" | "data";

/** A card the chat renders under an assistant message. */
export interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  /** Short supporting line: platform, dimensions, destination, etc. */
  subtitle?: string;
  /** Media URL for image/video artifacts. */
  url?: string;
  /** In-app destination that opens the exact object in its own tab. */
  href?: string;
  /** Label for the deep-link button, e.g. "Open in AI Studio". */
  hrefLabel?: string;
  /** Which dashboard tab `href` lands on, for the icon + grouping. */
  tab?: string;
  /** Extra key/values shown as a compact table on the card. */
  meta?: Record<string, string | number | boolean | null>;
  /** Longer body for plan/data artifacts (markdown). */
  body?: string;
}

export type ToolPhase = "running" | "done" | "error";

/** One entry in the tool timeline shown inline with the reasoning. */
export interface ToolRun {
  id: string;
  name: string;
  /** Human sentence: "Generating an Instagram feed image…". */
  label: string;
  phase: ToolPhase;
  args?: Record<string, unknown>;
  /** Latest progress line emitted by the tool while running. */
  progress?: string;
  /** One-line result summary once done. */
  summary?: string;
  error?: string;
  durationMs?: number;
  /** True for publish/delete/push-class tools, so the UI can mark them. */
  mutating?: boolean;
}

export interface AttachmentRef {
  name: string;
  type: string;
  size: number;
  /** "image" | "video" | "audio" | "document" | "archive" | "text" */
  kind: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// SSE events
// ---------------------------------------------------------------------------

export type ControllerEvent =
  /** Session id + persisted user message id, sent before any model work. */
  | { type: "session"; sessionId: string; userMessageId: string; title?: string }
  /** The session renamed itself from the conversation; the rail should follow. */
  | { type: "title"; sessionId: string; title: string }
  /** Named setup step: memory recall, workspace snapshot, plugin load. */
  | { type: "status"; step: string; label: string; state: "start" | "done"; detail?: string }
  /** Memory facts that were loaded into context for this turn. */
  | { type: "memory"; facts: { id: string; category: string; content: string; pinned: boolean }[] }
  /** A live thought-summary fragment. */
  | { type: "thought"; delta: string }
  /** A visible answer fragment. */
  | { type: "text"; delta: string }
  /** Tool lifecycle. */
  | { type: "tool"; run: ToolRun }
  /** A finished artifact card. */
  | { type: "artifact"; artifact: Artifact }
  /** Follow-up prompts offered under the message. */
  | { type: "suggestions"; items: string[] }
  /** Which model actually served the turn (may differ from the requested one). */
  | { type: "model"; model: string; fallback: boolean }
  /** A recoverable problem the user should know about; the turn continues. */
  | { type: "notice"; level: "info" | "warn"; message: string }
  /** Turn finished. */
  | {
      type: "done";
      messageId: string;
      finishReason: "ok" | "error" | "cancelled" | "max_loops";
      durationMs: number;
      model: string;
      toolCount: number;
    }
  /** Turn failed outright. */
  | { type: "error"; message: string; code?: string };

/** Serializes one event as an SSE frame. */
export function sseFrame(event: ControllerEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Splits a streamed buffer into whole SSE frames and returns the trailing
 * partial frame, so the reader can prepend it to the next network chunk. Frames
 * are separated by a blank line; `\r\n` is normalised because a proxy may
 * rewrite the line endings on the way to the browser.
 */
export function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() || "";
  return { frames: parts.filter((frame) => frame.trim().length > 0), rest };
}

/**
 * Parses one SSE frame back into an event, or null if it carries no event.
 *
 * The reader gets exactly what `sseFrame` wrote, so the `data:` field prefix has
 * to come off before the JSON is touched — a bare `JSON.parse` on the frame
 * throws on every single event. `event:`/`id:`/`retry:` fields and `:` heartbeat
 * comments are skipped, multi-line `data:` fields are joined per the SSE spec,
 * and a caller that already holds a bare payload still works.
 */
export function parseControllerEvent(raw: string): ControllerEvent | null {
  if (!raw) return null;

  const data: string[] = [];
  const bare: string[] = [];

  for (const line of raw.split("\n")) {
    const clean = line.replace(/\r$/, "").trimEnd();
    if (!clean || clean.startsWith(":")) continue;
    if (/^data\s*:/.test(clean)) {
      data.push(clean.replace(/^data\s*:\s?/, ""));
      continue;
    }
    if (/^(event|id|retry)\s*:/.test(clean)) continue;
    bare.push(clean);
  }

  const payload = (data.length > 0 ? data.join("\n") : bare.join("\n")).trim();
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed.type === "string" ? (parsed as ControllerEvent) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Client-side message shape (also what the history route returns)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: AttachmentRef[];
  toolRuns?: ToolRun[];
  artifacts?: Artifact[];
  suggestions?: string[];
  model?: string;
  durationMs?: number;
  finishReason?: string;
  createdAt: string;
  /** Client-only: this message is still streaming. */
  streaming?: boolean;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  model?: string | null;
  messageCount: number;
  updatedAt: string;
}
