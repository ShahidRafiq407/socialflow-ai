/**
 * THOUGHT STREAM — turns a model's own streamed reasoning into narrow,
 * one-step-at-a-time lines for the live campaign console.
 *
 * WHY: the execution console used to show only hand-written strings emitted from
 * code ("Writing copy for INSTAGRAM..."), so every run narrated the same fixed
 * script no matter what the agent actually did. Gemini returns *thought
 * summaries* alongside the answer when `thinkingConfig.includeThoughts` is on —
 * that is real, model-produced reasoning about this specific campaign, and it
 * arrives on the SAME request, so surfacing it costs no extra latency.
 *
 * Thought summaries arrive as a token stream of markdown-ish prose. The console
 * needs short discrete steps instead, so this module buffers the stream and cuts
 * it at sentence boundaries into single clean lines.
 */

/** Longest single reasoning line the console shows before it gets trimmed. */
export const DEFAULT_THOUGHT_LINE_LENGTH = 140;

/**
 * Strips the markdown scaffolding Gemini wraps its thought summaries in
 * (`**Planning the hook**`, `- bullet`, `#### Step 2`) so the console renders a
 * plain sentence.
 */
export function cleanThoughtText(raw: string): string {
  return (raw || "")
    .replace(/```[\s\S]*?```/g, " ")       // code fences are never useful as a step
    .replace(/[*_`>#]+/g, "")               // emphasis / heading / quote markers
    .replace(/^\s*[-•–]\s*/gm, "")          // list bullets
    .replace(/^\s*\d+[.)]\s*/gm, "")        // ordered-list markers
    .replace(/\s+/g, " ")
    .trim();
}

/** Cuts a line to `maxLen` on a word boundary, without leaving dangling punctuation. */
export function trimThoughtLine(line: string, maxLen = DEFAULT_THOUGHT_LINE_LENGTH): string {
  const clean = line.trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[,;:.\-—]+$/, "").trim()}…`;
}

export interface ThoughtEmitterOptions {
  /** Called once per finished reasoning line. */
  emit: (line: string, index: number) => void;
  maxLineLength?: number;
  /**
   * Hard cap on lines per agent. Long deliberations otherwise flood the console
   * and push the real work steps out of view.
   */
  maxLines?: number;
  /** Shortest line worth showing — filters stray fragments like "Okay." */
  minLineLength?: number;
}

export interface ThoughtEmitter {
  /** Feed a raw chunk of thought text from the model stream. */
  push: (chunk: string) => void;
  /** Emit whatever is left in the buffer (call when the stream ends). */
  flush: () => void;
  /** How many lines were actually emitted. */
  count: () => number;
}

/**
 * Buffers streamed thought text and emits it as discrete single-step lines.
 *
 * Cutting happens at sentence-ish boundaries (`. ! ? : ;` or a newline). A very
 * long run with no boundary is force-cut once it exceeds ~1.5x the line budget,
 * so the console keeps moving even when the model writes one giant sentence.
 */
export function createThoughtEmitter(options: ThoughtEmitterOptions): ThoughtEmitter {
  const maxLineLength = options.maxLineLength ?? DEFAULT_THOUGHT_LINE_LENGTH;
  const minLineLength = options.minLineLength ?? 12;
  const maxLines = options.maxLines ?? 40;

  let buffer = "";
  let emitted = 0;
  let lastEmitted = "";

  const emitLine = (candidate: string) => {
    if (emitted >= maxLines) return;
    const clean = cleanThoughtText(candidate);
    if (clean.length < minLineLength) return;
    const line = trimThoughtLine(clean, maxLineLength);
    // Streams repeat themselves when a thought is revised mid-flight; showing the
    // same sentence twice in a row reads like the UI is stuck.
    if (line.toLowerCase() === lastEmitted.toLowerCase()) return;
    lastEmitted = line;
    options.emit(line, emitted);
    emitted += 1;
  };

  const drain = (force: boolean) => {
    // Split on sentence terminators and hard newlines, keeping the terminator.
    const parts = buffer.split(/(?<=[.!?:;])\s+|\n+/);
    buffer = parts.pop() ?? "";
    for (const part of parts) emitLine(part);

    if (force) {
      emitLine(buffer);
      buffer = "";
      return;
    }

    // No boundary in sight but the buffer is already longer than a line: cut it
    // at the last word break so the console isn't held hostage by one sentence.
    if (cleanThoughtText(buffer).length > maxLineLength * 1.5) {
      const clean = cleanThoughtText(buffer);
      const cutAt = clean.lastIndexOf(" ", maxLineLength);
      if (cutAt > minLineLength) {
        emitLine(clean.slice(0, cutAt));
        buffer = clean.slice(cutAt);
      }
    }
  };

  return {
    push(chunk: string) {
      if (!chunk) return;
      buffer += chunk;
      drain(false);
    },
    flush() {
      drain(true);
    },
    count() {
      return emitted;
    },
  };
}
