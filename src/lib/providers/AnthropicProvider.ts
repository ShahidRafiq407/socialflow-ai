// ============================================================================
// ANTHROPIC PROVIDER
//
// Claude speaks `/v1/messages`, not `/chat/completions`, and the difference is
// not cosmetic: tool results are content blocks inside a user turn rather than
// their own role, extended thinking arrives as `thinking` blocks that must be
// echoed back with their signature for a multi-turn tool loop to keep working,
// and `max_tokens` is required rather than optional. That is why Claude gets its
// own client instead of riding the OpenAI-compatible one.
//
// Like the OpenAI client it presents `VertexAIProvider`'s surface and speaks
// Gemini's `Content[]` / `Part[]` at its edges, so nothing above it changed:
//
//   Gemini `{ functionResponse }`  → `{ type: "tool_result", tool_use_id }`
//   Gemini `{ text, thought:true, thoughtSignature }` ↔ `{ type: "thinking" }`
//   Gemini `{ functionCall }`      ↔ `{ type: "tool_use" }`
// ============================================================================

import type { Content, FunctionDeclaration, Part } from "@google/genai";
import {
  classifyError,
  estimateMessageTokens,
  estimateTokens,
  recordUsageAsync,
  type CallKind,
} from "@/lib/billing/meter";
import { reportUserFailure } from "@/lib/admin/report";
import type { AgentFunctionCall, AgentTurnResult, ThinkingEffort } from "./VertexAIProvider";
import {
  extractJson,
  geminiSchemaToJsonSchema,
  readUsage,
  type RemoteProviderConfig,
} from "./OpenAICompatibleProvider";

const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 180_000;

/** Claude requires an explicit ceiling; this is the default when no row sets one. */
const DEFAULT_MAX_TOKENS = 16_384;

/**
 * Thinking budget by the product's effort vocabulary. Anthropic requires
 * `budget_tokens >= 1024` and strictly less than `max_tokens`, so the caller's
 * ceiling is honoured by `budgetFor` below rather than by these constants alone.
 */
const THINKING_BUDGET: Record<Exclude<ThinkingEffort, "off">, number> = {
  concise: 2_048,
  balanced: 6_144,
  deep: 12_288,
};

function budgetFor(effort: Exclude<ThinkingEffort, "off">, maxTokens: number): number | null {
  const wanted = THINKING_BUDGET[effort];
  // Leave room for the answer itself; below the 1024 floor thinking is not legal.
  const allowed = Math.min(wanted, Math.floor(maxTokens * 0.6));
  return allowed >= 1_024 ? allowed : null;
}

interface AnthropicBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [k: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation
// ─────────────────────────────────────────────────────────────────────────────

export function toAnthropicTools(declarations: FunctionDeclaration[]): Array<Record<string, unknown>> {
  return declarations.map((d) => ({
    name: d.name,
    description: d.description || "",
    input_schema: geminiSchemaToJsonSchema(d.parameters ?? { type: "OBJECT", properties: {} }),
  }));
}

function synthesizeId(name: string, index: number): string {
  return `toolu_${index}_${name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/**
 * Gemini contents → Anthropic messages. Consecutive same-role turns are merged
 * (Anthropic rejects two user messages in a row) and any leading assistant turn
 * is dropped, because a conversation must open with the user.
 */
export function toAnthropicMessages(contents: Content[]): Array<Record<string, unknown>> {
  const out: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [];
  let minted = 0;
  let pending: Array<{ id: string; name: string }> = [];

  const takeId = (id: string | undefined, name: string): string => {
    if (id?.trim()) {
      pending = pending.filter((p) => p.id !== id.trim());
      return id.trim();
    }
    const hit = pending.findIndex((p) => p.name === name);
    if (hit >= 0) return pending.splice(hit, 1)[0].id;
    return synthesizeId(name, minted++);
  };

  const push = (role: "user" | "assistant", blocks: AnthropicBlock[]) => {
    if (blocks.length === 0) return;
    if (out.length === 0 && role === "assistant") return;
    const tail = out[out.length - 1];
    if (tail && tail.role === role) tail.content.push(...blocks);
    else out.push({ role, content: blocks });
  };

  for (const content of contents || []) {
    const parts = (content.parts || []) as Part[];
    const isModel = content.role === "model" || content.role === "assistant";

    // Tool results ride in a user turn, and must come before anything else in it.
    const results: AnthropicBlock[] = [];
    for (const part of parts) {
      const fr = (part as { functionResponse?: { id?: string; name?: string; response?: unknown } })
        .functionResponse;
      if (!fr) continue;
      results.push({
        type: "tool_result",
        tool_use_id: takeId(fr.id, fr.name || "tool"),
        content: typeof fr.response === "string" ? fr.response : JSON.stringify(fr.response ?? {}),
      });
    }
    if (results.length > 0) push("user", results);

    const blocks: AnthropicBlock[] = [];
    const announced: Array<{ id: string; name: string }> = [];

    for (const part of parts) {
      if ((part as { functionResponse?: unknown }).functionResponse) continue;

      const fc = (part as { functionCall?: { id?: string; name?: string; args?: unknown } }).functionCall;
      if (fc) {
        const name = fc.name || "tool";
        const id = fc.id?.trim() || synthesizeId(name, minted++);
        announced.push({ id, name });
        blocks.push({ type: "tool_use", id, name, input: fc.args ?? {} });
        continue;
      }

      const inline = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData;
      if (inline?.data) {
        // Claude accepts images only; other media is dropped rather than rejected.
        const media = inline.mimeType || "image/png";
        if (media.startsWith("image/")) {
          blocks.push({ type: "image", source: { type: "base64", media_type: media, data: inline.data } });
        }
        continue;
      }

      const text = (part as { text?: string }).text;
      if (typeof text !== "string" || !text) continue;
      const thought = (part as { thought?: boolean }).thought === true;
      const signature = (part as { thoughtSignature?: string }).thoughtSignature;
      if (thought) {
        // A thinking block without its signature is rejected on the next request,
        // so an unsigned thought is sent as nothing at all.
        if (signature) blocks.push({ type: "thinking", thinking: text, signature });
        continue;
      }
      blocks.push({ type: "text", text });
    }

    if (announced.length > 0) pending = announced;
    push(isModel ? "assistant" : "user", blocks);
  }

  // A trailing assistant turn would make Claude continue its own message; the
  // controller never does that, but a truncated history could.
  while (out.length > 0 && out[out.length - 1].role === "assistant") out.pop();
  return out.map((m) => ({ role: m.role, content: m.content }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

function isTransient(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export class AnthropicProvider {
  constructor(private readonly config: RemoteProviderConfig) {}

  private get label(): string {
    return this.config.providerId || "anthropic";
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      "x-api-key": this.config.apiKey,
      ...(this.config.headers || {}),
    };
  }

  /** One POST with a timeout, retried once when the failure looks transient. */
  private async post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/messages`;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const timer = new AbortController();
      const timeout = setTimeout(() => timer.abort(), REQUEST_TIMEOUT_MS);
      const onAbort = () => timer.abort();
      signal?.addEventListener("abort", onAbort);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: timer.signal,
        });
        if (res.ok) return res;

        const detail = await res.text().catch(() => "");
        const error = new Error(`${this.label} ${res.status}: ${detail.slice(0, 600)}`);
        if (attempt === 0 && isTransient(res.status) && !signal?.aborted) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        throw error;
      } catch (err) {
        if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { isCancelled: true });
        lastError = err;
        if (attempt === 1) throw err;
        await new Promise((r) => setTimeout(r, 700));
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${this.label} request failed`);
  }

  /** SSE `data:` payloads, in order. Anthropic also sends `event:` lines, but
   *  every payload repeats its own `type`, so only the data is needed. */
  private async *events(res: Response, signal?: AbortSignal): AsyncGenerator<Record<string, unknown>> {
    const body = res.body;
    if (!body) return;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { isCancelled: true });
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        for (;;) {
          const boundary = /\r?\n\r?\n/.exec(buffer);
          if (!boundary) break;
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);

          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("");
          if (!data || data === "[DONE]") continue;
          try {
            yield JSON.parse(data) as Record<string, unknown>;
          } catch {
            // A partial frame is not worth killing the turn over.
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  /**
   * One assistant turn, streamed. Returns the same `AgentTurnResult` the Vertex
   * provider returns, including `modelParts` in Gemini shape so the controller
   * can push it straight back onto the history.
   */
  async streamAgentTurn(
    params: {
      contents: Content[];
      systemInstruction?: string;
      functionDeclarations?: FunctionDeclaration[];
      enableGoogleSearch?: boolean;
      modelName?: string;
      temperature?: number;
      thinkingEffort?: ThinkingEffort;
      maxOutputTokens?: number;
      signal?: AbortSignal;
    },
    callbacks: {
      onThought?: (text: string) => void;
      onText?: (text: string) => void;
      onFunctionCall?: (call: AgentFunctionCall) => void;
      onModelFallback?: (from: string, to: string) => void;
    } = {},
  ): Promise<AgentTurnResult> {
    const model = params.modelName || "claude-sonnet-5";
    const maxTokens =
      params.maxOutputTokens || this.config.maxOutputTokens || DEFAULT_MAX_TOKENS;
    const effort = params.thinkingEffort ?? "off";
    const budget = effort === "off" ? null : budgetFor(effort, maxTokens);

    const messages = toAnthropicMessages(params.contents);
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
      stream: true,
    };
    if (params.systemInstruction) body.system = params.systemInstruction;
    if (params.functionDeclarations?.length) {
      body.tools = toAnthropicTools(params.functionDeclarations);
    }
    if (budget) {
      // Extended thinking pins temperature at 1; sending anything else is a 400.
      body.thinking = { type: "enabled", budget_tokens: budget };
    } else if (typeof params.temperature === "number") {
      body.temperature = Math.max(0, Math.min(1, params.temperature));
    }

    const started = Date.now();
    const promptTokens = estimateMessageTokens(
      messages.map((m) => ({ role: String(m.role), content: JSON.stringify(m.content) })),
    );

    let res: Response;
    try {
      res = await this.post(body, params.signal);
    } catch (err) {
      this.record({
        model,
        callKind: "stream",
        usage: null,
        estimatedInput: promptTokens,
        startedAt: started,
        error: err,
      });
      throw err;
    }

    // Block index → what it is, so deltas can be routed without re-reading type.
    const kinds = new Map<number, string>();
    const texts = new Map<number, string>();
    const signatures = new Map<number, string>();
    const toolMeta = new Map<number, { id: string; name: string }>();
    const toolJson = new Map<number, string>();
    const order: number[] = [];

    let finishReason = "STOP";
    let usage: Record<string, unknown> | null = null;

    try {
      for await (const event of this.events(res, params.signal)) {
        const type = String(event.type || "");

        if (type === "message_start") {
          const message = (event.message || {}) as Record<string, unknown>;
          if (message.usage) usage = { ...(message.usage as Record<string, unknown>) };
          continue;
        }

        if (type === "content_block_start") {
          const index = Number(event.index ?? 0);
          const block = (event.content_block || {}) as AnthropicBlock;
          const kind = String(block.type || "text");
          kinds.set(index, kind);
          if (!order.includes(index)) order.push(index);
          if (kind === "tool_use") {
            toolMeta.set(index, {
              id: String(block.id || synthesizeId(String(block.name || "tool"), index)),
              name: String(block.name || "tool"),
            });
            toolJson.set(index, "");
          } else {
            texts.set(index, typeof block.text === "string" ? block.text : "");
            if (kind === "thinking" && typeof block.thinking === "string") texts.set(index, block.thinking);
          }
          continue;
        }

        if (type === "content_block_delta") {
          const index = Number(event.index ?? 0);
          const delta = (event.delta || {}) as Record<string, unknown>;
          const deltaType = String(delta.type || "");

          if (deltaType === "text_delta" && typeof delta.text === "string") {
            texts.set(index, (texts.get(index) || "") + delta.text);
            if (delta.text) callbacks.onText?.(delta.text);
          } else if (deltaType === "thinking_delta" && typeof delta.thinking === "string") {
            texts.set(index, (texts.get(index) || "") + delta.thinking);
            if (delta.thinking) callbacks.onThought?.(delta.thinking);
          } else if (deltaType === "signature_delta" && typeof delta.signature === "string") {
            signatures.set(index, (signatures.get(index) || "") + delta.signature);
          } else if (deltaType === "input_json_delta" && typeof delta.partial_json === "string") {
            toolJson.set(index, (toolJson.get(index) || "") + delta.partial_json);
          }
          continue;
        }

        if (type === "message_delta") {
          const delta = (event.delta || {}) as Record<string, unknown>;
          if (typeof delta.stop_reason === "string" && delta.stop_reason) {
            finishReason = delta.stop_reason.toUpperCase();
          }
          if (event.usage) usage = { ...(usage || {}), ...(event.usage as Record<string, unknown>) };
          continue;
        }

        if (type === "error") {
          const detail = (event.error || {}) as Record<string, unknown>;
          throw new Error(`${this.label}: ${String(detail.message || "stream error")}`);
        }
      }
    } catch (err) {
      const partial = order.map((i) => texts.get(i) || "").join("");
      this.record({
        model,
        callKind: "stream",
        usage,
        estimatedInput: promptTokens,
        outputText: partial,
        startedAt: started,
        error: err,
      });
      throw err;
    }

    // Assemble in wire order so `modelParts` replays the turn faithfully.
    let text = "";
    let reasoning = "";
    const functionCalls: AgentFunctionCall[] = [];
    const modelParts: Part[] = [];

    for (const index of order) {
      const kind = kinds.get(index) || "text";

      if (kind === "thinking" || kind === "redacted_thinking") {
        const thought = texts.get(index) || "";
        if (!thought) continue;
        reasoning += thought;
        const signature = signatures.get(index);
        // Without the signature Claude rejects the block on the next request, so
        // it is carried only when signed — same rule as the translator above.
        if (signature) {
          modelParts.push({ text: thought, thought: true, thoughtSignature: signature } as Part);
        }
        continue;
      }

      if (kind === "tool_use") {
        const meta = toolMeta.get(index);
        if (!meta) continue;
        const raw = (toolJson.get(index) || "").trim();
        let args: Record<string, unknown> = {};
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            args = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { _raw: raw };
          } catch {
            // Let the tool report a useful argument error instead of dying here.
            args = { _raw: raw };
          }
        }
        const call: AgentFunctionCall = { id: meta.id, name: meta.name, args };
        functionCalls.push(call);
        modelParts.push({ functionCall: { id: meta.id, name: meta.name, args } } as Part);
        callbacks.onFunctionCall?.(call);
        continue;
      }

      const chunk = texts.get(index) || "";
      if (!chunk) continue;
      text += chunk;
      modelParts.push({ text: chunk } as Part);
    }

    const wire = readUsage(usage);
    this.record({
      model,
      callKind: "stream",
      usage,
      estimatedInput: wire.inputTokens ?? promptTokens,
      outputText: text,
      thoughtChars: reasoning.length,
      startedAt: started,
    });

    return {
      text,
      reasoning,
      functionCalls,
      modelParts,
      model,
      thinkingUsed: reasoning.length > 0,
      finishReason,
      searchQueries: [],
      sources: [],
    };
  }

  /** One non-streaming call, returning the concatenated `text` blocks. */
  private async complete(
    messages: Array<{ role: string; content: string }>,
    options: { modelName?: string; temperature?: number; maxTokens?: number; jsonHint?: string },
  ): Promise<string> {
    const model = options.modelName || "claude-sonnet-5";
    const maxTokens = options.maxTokens || this.config.maxOutputTokens || DEFAULT_MAX_TOKENS;

    // Anthropic takes the system prompt out of band, and needs the first turn to
    // be a user turn, so system messages are hoisted and the rest is merged.
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .concat(options.jsonHint ? [options.jsonHint] : [])
      .join("\n\n")
      .trim();

    const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const message of messages) {
      if (message.role === "system") continue;
      const role: "user" | "assistant" = message.role === "assistant" || message.role === "model" ? "assistant" : "user";
      if (turns.length === 0 && role === "assistant") continue;
      const tail = turns[turns.length - 1];
      if (tail && tail.role === role) tail.content += `\n\n${message.content}`;
      else turns.push({ role, content: message.content });
    }
    if (turns.length === 0) turns.push({ role: "user", content: system || "Continue." });

    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages: turns };
    if (system) body.system = system;
    if (typeof options.temperature === "number") {
      body.temperature = Math.max(0, Math.min(1, options.temperature));
    }

    const started = Date.now();
    const promptTokens = estimateMessageTokens(messages);

    try {
      const res = await this.post(body);
      const payload = (await res.json()) as Record<string, unknown>;
      const blocks = (payload.content || []) as AnthropicBlock[];
      const text = blocks
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");

      this.record({
        model,
        callKind: options.jsonHint ? "json" : "text",
        usage: (payload.usage as Record<string, unknown> | undefined) ?? null,
        estimatedInput: promptTokens,
        outputText: text,
        startedAt: started,
      });
      return text;
    } catch (err) {
      this.record({
        model,
        callKind: options.jsonHint ? "json" : "text",
        usage: null,
        estimatedInput: promptTokens,
        startedAt: started,
        error: err,
      });
      throw err;
    }
  }

  async generateText(
    messages: Array<{ role: string; content: string }>,
    options: { modelName?: string; temperature?: number } = {},
  ): Promise<string> {
    return this.complete(messages, options);
  }

  /** Claude has no JSON mode, so the contract is stated in the system prompt and
   *  the fenced-block stripper in `extractJson` cleans up what comes back. */
  async generateJSON(
    messages: Array<{ role: string; content: string }>,
    options: { modelName?: string; temperature?: number } = {},
  ): Promise<unknown> {
    const raw = await this.complete(messages, {
      ...options,
      jsonHint: "Reply with a single valid JSON value and nothing else. No prose, no code fences.",
    });
    return extractJson(raw, this.label);
  }

  /** One `UsageEvent` per attempt, in exactly the shape the OpenAI-compatible
   *  client reports, so the cost table does not care which vendor served a turn.
   *  Anthropic never reports reasoning tokens, so thinking is estimated from the
   *  characters streamed in its `thinking` blocks. */
  private record(args: {
    model: string;
    callKind: CallKind;
    usage: Record<string, unknown> | null;
    estimatedInput: number;
    outputText?: string;
    thoughtChars?: number;
    startedAt: number;
    error?: unknown;
  }): void {
    const counts = readUsage(args.usage);
    const thinking = Math.ceil((args.thoughtChars || 0) / 4);
    recordUsageAsync({
      model: args.model,
      callKind: args.callKind,
      inputTokens: counts.inputTokens ?? args.estimatedInput,
      outputTokens: counts.outputTokens ?? estimateTokens(args.outputText || "") + thinking,
      thinkingTokens: counts.thinkingTokens ?? thinking,
      cachedTokens: counts.cachedTokens ?? 0,
      latencyMs: Date.now() - args.startedAt,
      ok: !args.error,
      errorKind: args.error ? classifyError(args.error) : null,
    });
    // Third-party calls do not pass through `meteredCall`, so this is the only
    // place a Claude turn that failed can be written down for the admin.
    if (args.error !== undefined) {
      reportUserFailure({
        feature: "model",
        message: `${args.model} call failed`,
        error: args.error,
        context: { model: args.model, callKind: args.callKind, provider: this.config.providerId },
      });
    }
  }
}
