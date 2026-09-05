// ============================================================================
// OPENAI-COMPATIBLE PROVIDER
//
// One client for every vendor that serves `POST {baseUrl}/chat/completions`:
// OpenAI itself, Azure, xAI, Mistral, DeepSeek, Qwen/DashScope, Moonshot (Kimi),
// Zhipu (GLM), MiniMax, Baidu, OpenRouter, Groq, Together, Fireworks, and any
// self-hosted vLLM / Ollama / LM Studio endpoint.
//
// It presents the SAME surface as `VertexAIProvider` — `streamAgentTurn`,
// `generateText`, `generateJSON` — and speaks Gemini's `Content[]` / `Part[]`
// vocabulary at its edges. That is deliberate: the controller loop, the tool
// registry, the artifact extraction and the SSE emitter are written against
// Gemini's shape, and none of them had to change to gain a second provider.
// The translation lives here and only here:
//
//   Gemini `Content[]`            → OpenAI `messages[]`
//   Gemini `FunctionDeclaration[]`→ OpenAI `tools[]` (types lower-cased)
//   OpenAI streamed deltas        → onText / onThought / onFunctionCall
//   OpenAI `tool_calls`           → Gemini `{ functionCall }` parts
//   Gemini `{ functionResponse }` → OpenAI `{ role: "tool" }` messages
//
// Metering: every attempt records a `UsageEvent` through the same meter the
// Vertex provider uses, with the vendor's own token counts when it reports them
// and an estimate when it does not. A model added from the back office therefore
// shows up in the usage table and the cost view like any built-in one.
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

export interface RemoteProviderConfig {
  /** Provider id from the registry, for logs and error messages. */
  providerId: string;
  /** Endpoint root, without a trailing slash and without `/chat/completions`. */
  baseUrl: string;
  apiKey: string;
  /** Extra headers a vendor needs (OpenRouter attribution, Azure api-key, …). */
  headers?: Record<string, string>;
  /** Hard ceiling on one response, when the model row sets one. */
  maxOutputTokens?: number | null;
}

interface WireToolCall {
  id: string;
  name: string;
  args: string;
}

/** How long to wait for the first byte before giving up on a vendor. */
const REQUEST_TIMEOUT_MS = 180_000;

/** Reasoning budgets we ask for, by the product's own effort vocabulary. */
const REASONING_EFFORT: Record<Exclude<ThinkingEffort, "off">, "low" | "medium" | "high"> = {
  concise: "low",
  balanced: "medium",
  deep: "high",
};

// ─────────────────────────────────────────────────────────────────────────────
// Schema translation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gemini's function schemas use UPPERCASE type names (`OBJECT`, `STRING`) — see
 * `toGeminiSchema` in the tool registry. JSON Schema, which both OpenAI and
 * Anthropic want, uses lowercase. Everything else about the two shapes agrees.
 */
export function geminiSchemaToJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return { type: "object", properties: {} };
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (value === undefined || value === null) continue;

    if (key === "type" && typeof value === "string") {
      out.type = value.toLowerCase();
      continue;
    }
    if (key === "properties" && typeof value === "object") {
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(value as Record<string, unknown>)) {
        props[name] = geminiSchemaToJsonSchema(sub);
      }
      out.properties = props;
      continue;
    }
    if (key === "items") {
      out.items = geminiSchemaToJsonSchema(value);
      continue;
    }
    if (key === "anyOf" && Array.isArray(value)) {
      out.anyOf = value.map((v) => geminiSchemaToJsonSchema(v));
      continue;
    }
    if (key === "nullable") continue; // not a JSON Schema keyword
    out[key] = value;
  }

  if (!out.type) out.type = out.properties ? "object" : "string";
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

export function toOpenAITools(declarations: FunctionDeclaration[]): Array<Record<string, unknown>> {
  return declarations.map((d) => ({
    type: "function",
    function: {
      name: d.name,
      description: d.description || "",
      parameters: geminiSchemaToJsonSchema(d.parameters ?? { type: "OBJECT", properties: {} }),
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Message translation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tool call needs the same id on the assistant message and on the tool result
 * that answers it. Gemini's `functionCall.id` is optional; this provider always
 * mints one on the way out, so the id the controller echoes back matches. The
 * name-based pairing below is the safety net for a history that arrived without
 * ids at all — better a correctly paired synthetic id than a dropped result.
 */
function synthesizeId(name: string, index: number): string {
  return `call_${index}_${name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function partsOf(content: Content): Part[] {
  return (content.parts || []) as Part[];
}

/** Base64 inline data → the data: URL that OpenAI's vision input expects. */
function dataUrl(part: Part): string | null {
  const inline = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData;
  if (!inline?.data) return null;
  return `data:${inline.mimeType || "image/png"};base64,${inline.data}`;
}

export function toOpenAIMessages(
  contents: Content[],
  systemInstruction?: string
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  if (systemInstruction?.trim()) messages.push({ role: "system", content: systemInstruction });

  // Ids announced by the most recent assistant message and not yet answered.
  let pending: Array<{ id: string; name: string }> = [];
  let minted = 0;

  const takeId = (id: string | undefined, name: string): string => {
    if (id?.trim()) {
      pending = pending.filter((p) => p.id !== id.trim());
      return id.trim();
    }
    const hitIndex = pending.findIndex((p) => p.name === name);
    if (hitIndex >= 0) return pending.splice(hitIndex, 1)[0].id;
    return synthesizeId(name, minted++);
  };

  for (const content of contents || []) {
    const parts = partsOf(content);
    const isModel = content.role === "model" || content.role === "assistant";

    // Tool results become their own `tool` messages, in the order they arrived.
    const toolResults = parts.filter((p) => (p as { functionResponse?: unknown }).functionResponse);
    if (toolResults.length > 0) {
      for (const part of toolResults) {
        const fr = (part as { functionResponse: { id?: string; name?: string; response?: unknown } })
          .functionResponse;
        messages.push({
          role: "tool",
          tool_call_id: takeId(fr.id, fr.name || "tool"),
          content: typeof fr.response === "string" ? fr.response : JSON.stringify(fr.response ?? {}),
        });
      }
      if (toolResults.length === parts.length) continue;
    }

    if (isModel) {
      const text = parts
        .filter((p) => !(p as { thought?: boolean }).thought && typeof (p as { text?: string }).text === "string")
        .map((p) => (p as { text?: string }).text || "")
        .join("");
      const calls = parts.filter((p) => (p as { functionCall?: unknown }).functionCall);
      const toolCalls = calls.map((p, i) => {
        const fc = (p as { functionCall: { id?: string; name?: string; args?: unknown } }).functionCall;
        const name = fc.name || "tool";
        const id = fc.id?.trim() || synthesizeId(name, minted++);
        return {
          id,
          type: "function",
          function: { name, arguments: JSON.stringify(fc.args ?? {}) },
        };
      });
      if (!text && toolCalls.length === 0) continue;
      if (toolCalls.length > 0) {
        pending = toolCalls.map((c) => ({ id: c.id, name: c.function.name }));
      }
      messages.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // A user turn: text plus any images the composer attached.
    const blocks: Array<Record<string, unknown>> = [];
    for (const part of parts) {
      if ((part as { functionResponse?: unknown }).functionResponse) continue;
      const url = dataUrl(part);
      if (url) {
        blocks.push({ type: "image_url", image_url: { url } });
        continue;
      }
      const text = (part as { text?: string }).text;
      if (typeof text === "string" && text) blocks.push({ type: "text", text });
    }
    if (blocks.length === 0) continue;
    const onlyText = blocks.every((b) => b.type === "text");
    messages.push({
      role: "user",
      content: onlyText ? blocks.map((b) => b.text as string).join("\n") : blocks,
    });
  }

  return messages;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP + SSE
// ─────────────────────────────────────────────────────────────────────────────

/** Reads an SSE body and yields each `data:` payload, stopping at `[DONE]`. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; \r\n is legal too.
      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        boundary = /\r?\n\r?\n/.exec(buffer);

        const payload = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!payload) continue;
        if (payload === "[DONE]") return;
        try {
          yield JSON.parse(payload);
        } catch {
          // A vendor that splits JSON across frames is not something we can
          // recover from mid-stream; skip the fragment rather than abort.
        }
      }
    }
  } finally {
    reader.releaseLock();
    void body.cancel?.().catch(() => undefined);
  }
}

function authHeaders(config: RemoteProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(config.headers || {}),
  };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  // Azure authenticates with its own header instead of a bearer token.
  if (config.providerId === "azure-openai" && config.apiKey) headers["api-key"] = config.apiKey;
  if (config.providerId === "openrouter") {
    headers["http-referer"] = process.env.NEXT_PUBLIC_APP_URL || "https://postloom.app";
    headers["x-title"] = "Postloom";
  }
  return headers;
}

function endpoint(config: RemoteProviderConfig, path: string): string {
  const root = (config.baseUrl || "").trim().replace(/\/+$/, "");
  if (!root) throw new Error(`${config.providerId}: no base URL configured for this model.`);
  return `${root}${path}`;
}

/** A vendor error body is usually `{error:{message}}`; fall back to raw text. */
async function describeFailure(response: Response, providerId: string): Promise<Error> {
  let detail = "";
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      detail = parsed?.error?.message || parsed?.message || text.slice(0, 400);
    } catch {
      detail = text.slice(0, 400);
    }
  } catch {
    detail = "";
  }
  const err = new Error(
    `${providerId} returned ${response.status}${detail ? `: ${detail}` : ""}`
  ) as Error & { status?: number };
  err.status = response.status;
  return err;
}

/** Retryable: rate limits, overload, and the transient 5xx family. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429 || status === 408 || (status && status >= 500)) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("503") ||
    msg.includes("502")
  );
}

/** `AbortSignal` that fires on the caller's stop or on our own timeout. */
function requestSignal(outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("request timed out")), REQUEST_TIMEOUT_MS);
  const forward = () => controller.abort(new Error("Generation cancelled by user"));
  if (outer) {
    if (outer.aborted) forward();
    else outer.addEventListener("abort", forward, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", forward);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The provider
// ─────────────────────────────────────────────────────────────────────────────

export class OpenAICompatibleProvider {
  constructor(private readonly config: RemoteProviderConfig) {}

  private get id(): string {
    return this.config.providerId;
  }

  /** POST with one retry on a transient failure. */
  private async post(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Response> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { signal: composed, done } = requestSignal(signal);
      try {
        const response = await fetch(endpoint(this.config, path), {
          method: "POST",
          headers: authHeaders(this.config),
          body: JSON.stringify(body),
          signal: composed,
          cache: "no-store",
        });
        if (!response.ok) throw await describeFailure(response, this.id);
        return response;
      } catch (err) {
        lastError = err;
        if (signal?.aborted) {
          const cancelled = new Error("Generation cancelled by user") as Error & { isCancelled?: boolean };
          cancelled.isCancelled = true;
          throw cancelled;
        }
        if (attempt === 0 && isTransient(err)) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        throw err;
      } finally {
        done();
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * ONE streamed agent turn, in the same contract as `VertexAIProvider`.
   *
   * There is no model fallback chain here on purpose: the admin chose this exact
   * model from this exact vendor, and silently answering on a different one
   * would make the "which model served this turn" label a lie. A failure is
   * reported so the caller can refund the turn.
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
      onThought?: (chunk: string) => void;
      onText?: (chunk: string) => void;
      onFunctionCall?: (call: AgentFunctionCall) => void;
      onModelFallback?: (modelName: string) => void;
    } = {}
  ): Promise<AgentTurnResult> {
    const model = params.modelName || "";
    if (!model) throw new Error(`${this.id}: no model id supplied.`);

    const declarations = params.functionDeclarations || [];
    const messages = toOpenAIMessages(params.contents, params.systemInstruction);
    const maxTokens = params.maxOutputTokens || this.config.maxOutputTokens || undefined;

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (typeof params.temperature === "number") body.temperature = params.temperature;
    if (maxTokens) body.max_tokens = maxTokens;
    if (declarations.length > 0) {
      body.tools = toOpenAITools(declarations);
      body.tool_choice = "auto";
      body.parallel_tool_calls = true;
    }
    if (params.thinkingEffort && params.thinkingEffort !== "off") {
      // Ignored by vendors that do not reason; the ones that do read one of these.
      body.reasoning_effort = REASONING_EFFORT[params.thinkingEffort];
    }

    const startedAt = Date.now();
    const estimatedInput =
      estimateMessageTokens(
        messages.map((m) => ({
          role: String(m.role),
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
        }))
      ) + estimateTokens(params.systemInstruction);

    let text = "";
    let reasoning = "";
    let finishReason = "STOP";
    let usage: Record<string, unknown> | null = null;
    const pendingCalls = new Map<number, WireToolCall>();

    try {
      const response = await this.post("/chat/completions", body, params.signal);
      if (!response.body) throw new Error(`${this.id} returned no response body.`);

      for await (const event of sseEvents(response.body)) {
        const chunk = event as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              reasoning?: string | null;
              reasoning_content?: string | null;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>;
          usage?: Record<string, unknown> | null;
          error?: { message?: string };
        };

        if (chunk.error?.message) throw new Error(`${this.id}: ${chunk.error.message}`);
        if (chunk.usage) usage = chunk.usage;

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = String(choice.finish_reason).toUpperCase();

        const delta = choice.delta || {};
        const thought = delta.reasoning_content ?? delta.reasoning;
        if (typeof thought === "string" && thought) {
          reasoning += thought;
          callbacks.onThought?.(thought);
        }
        if (typeof delta.content === "string" && delta.content) {
          text += delta.content;
          callbacks.onText?.(delta.content);
        }

        // Tool calls stream in fragments: the name lands once, the JSON
        // arguments arrive a few characters at a time, keyed by index.
        for (const part of delta.tool_calls || []) {
          const index = part.index ?? 0;
          const existing = pendingCalls.get(index) || { id: "", name: "", args: "" };
          pendingCalls.set(index, {
            id: part.id || existing.id,
            name: part.function?.name || existing.name,
            args: existing.args + (part.function?.arguments || ""),
          });
        }
      }
    } catch (err) {
      this.record({
        model,
        callKind: "stream",
        usage,
        estimatedInput,
        outputText: text,
        thoughtChars: reasoning.length,
        startedAt,
        error: err,
      });
      if ((err as { isCancelled?: boolean })?.isCancelled) throw err;
      throw err instanceof Error ? err : new Error(String(err));
    }

    const functionCalls: AgentFunctionCall[] = [];
    const modelParts: Part[] = [];
    if (reasoning) modelParts.push({ text: reasoning, thought: true } as Part);
    if (text) modelParts.push({ text } as Part);

    for (const [index, call] of [...pendingCalls.entries()].sort((a, b) => a[0] - b[0])) {
      if (!call.name) continue;
      let args: Record<string, unknown> = {};
      const raw = call.args.trim();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
        } catch {
          // A truncated argument stream is a real failure mode on small models.
          // Passing the raw string through lets the tool report a useful error
          // instead of the turn dying with a JSON parse exception.
          args = { _raw: raw };
        }
      }
      const resolved: AgentFunctionCall = {
        id: call.id || synthesizeId(call.name, index),
        name: call.name,
        args,
      };
      functionCalls.push(resolved);
      callbacks.onFunctionCall?.(resolved);
      modelParts.push({ functionCall: { id: resolved.id, name: resolved.name, args } } as Part);
    }

    this.record({
      model,
      callKind: "stream",
      usage,
      estimatedInput,
      outputText: text,
      thoughtChars: reasoning.length,
      startedAt,
    });

    if (!text.trim() && functionCalls.length === 0) {
      throw new Error(`${this.id}: ${model} returned neither text nor a tool call.`);
    }

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

  /** Non-streamed completion, for the agents that just want prose. */
  async generateText(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number; maxOutputTokens?: number } = {}
  ): Promise<string> {
    const model = options.modelName || "";
    if (!model) throw new Error(`${this.id}: no model id supplied.`);
    const startedAt = Date.now();
    const maxTokens = options.maxOutputTokens || this.config.maxOutputTokens || undefined;

    const body: Record<string, unknown> = { model, messages, stream: false };
    if (typeof options.temperature === "number") body.temperature = options.temperature;
    if (maxTokens) body.max_tokens = maxTokens;

    try {
      const response = await this.post("/chat/completions", body);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: Record<string, unknown> | null;
      };
      const out = payload.choices?.[0]?.message?.content || "";
      this.record({
        model,
        callKind: "text",
        usage: payload.usage ?? null,
        estimatedInput: estimateMessageTokens(messages),
        outputText: out,
        startedAt,
      });
      if (!out.trim()) throw new Error(`${this.id}: ${model} returned an empty completion.`);
      return out;
    } catch (err) {
      this.record({
        model,
        callKind: "text",
        usage: null,
        estimatedInput: estimateMessageTokens(messages),
        startedAt,
        error: err,
      });
      throw err;
    }
  }

  /** Structured output, using JSON mode where the vendor supports it. */
  async generateJSON(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<unknown> {
    const model = options.modelName || "";
    if (!model) throw new Error(`${this.id}: no model id supplied.`);
    const startedAt = Date.now();

    const attempt = async (withJsonMode: boolean): Promise<string> => {
      const body: Record<string, unknown> = {
        model,
        messages,
        stream: false,
        temperature: options.temperature ?? 0.1,
      };
      if (this.config.maxOutputTokens) body.max_tokens = this.config.maxOutputTokens;
      if (withJsonMode) body.response_format = { type: "json_object" };
      const response = await this.post("/chat/completions", body);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: Record<string, unknown> | null;
      };
      const out = payload.choices?.[0]?.message?.content || "";
      this.record({
        model,
        callKind: "json",
        usage: payload.usage ?? null,
        estimatedInput: estimateMessageTokens(messages),
        outputText: out,
        startedAt,
      });
      return out;
    };

    let raw = "";
    try {
      raw = await attempt(true);
    } catch (err) {
      // Plenty of OpenAI-compatible hosts reject `response_format`. Ask again in
      // plain mode rather than failing the caller.
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes("response_format") || msg.includes("json_object") || msg.includes("400")) {
        raw = await attempt(false);
      } else {
        this.record({
          model,
          callKind: "json",
          usage: null,
          estimatedInput: estimateMessageTokens(messages),
          startedAt,
          error: err,
        });
        throw err;
      }
    }

    return extractJson(raw, `${this.id}: ${model}`);
  }

  /** One `UsageEvent` per attempt, priced by the model's admin-set rate card. */
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
    const estimatedOutput =
      estimateTokens(args.outputText || "") + Math.ceil((args.thoughtChars || 0) / 4);
    recordUsageAsync({
      model: args.model,
      callKind: args.callKind,
      inputTokens: counts.inputTokens ?? args.estimatedInput,
      outputTokens: counts.outputTokens ?? estimatedOutput,
      thinkingTokens: counts.thinkingTokens ?? 0,
      cachedTokens: counts.cachedTokens ?? 0,
      latencyMs: Date.now() - args.startedAt,
      ok: !args.error,
      errorKind: args.error ? classifyError(args.error) : null,
    });
    // Same reason as the Anthropic client: nothing wraps these calls, so a failed
    // turn against OpenAI, Grok, DeepSeek or a self-hosted endpoint would otherwise
    // exist only in the usage table's `ok: false` column.
    if (args.error !== undefined) {
      reportUserFailure({
        feature: "model",
        message: `${args.model} call failed`,
        error: args.error,
        context: { model: args.model, callKind: args.callKind, provider: this.id },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers, also used by the Anthropic provider
// ─────────────────────────────────────────────────────────────────────────────

export interface WireUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  cachedTokens: number | null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

/**
 * Token counts out of a vendor's `usage` object. Covers the OpenAI spelling
 * (`prompt_tokens`), the Anthropic spelling (`input_tokens`), and the nested
 * detail objects that carry cached and reasoning counts.
 */
export function readUsage(usage: Record<string, unknown> | null | undefined): WireUsage {
  if (!usage || typeof usage !== "object") {
    return { inputTokens: null, outputTokens: null, thinkingTokens: null, cachedTokens: null };
  }
  const promptDetails = (usage.prompt_tokens_details || {}) as Record<string, unknown>;
  const completionDetails = (usage.completion_tokens_details || {}) as Record<string, unknown>;

  const cached =
    int(promptDetails.cached_tokens) ??
    int(usage.cache_read_input_tokens) ??
    int((usage as Record<string, unknown>).prompt_cache_hit_tokens);

  // Anthropic bills cache reads separately from `input_tokens`; OpenAI counts
  // them inside `prompt_tokens`. Normalise to "input includes everything sent".
  const rawInput = int(usage.prompt_tokens) ?? int(usage.input_tokens);
  const inputTokens =
    rawInput === null
      ? null
      : usage.input_tokens !== undefined && cached
        ? rawInput + cached + (int(usage.cache_creation_input_tokens) ?? 0)
        : rawInput;

  return {
    inputTokens,
    outputTokens: int(usage.completion_tokens) ?? int(usage.output_tokens),
    thinkingTokens: int(completionDetails.reasoning_tokens) ?? null,
    cachedTokens: cached,
  };
}

/** Pulls the first complete JSON value out of a model's prose. */
export function extractJson(raw: string, who: string): unknown {
  const text = (raw || "").trim();
  if (!text) throw new Error(`${who} returned an empty JSON response.`);

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1].trim() : text;

  const firstBrace = body.indexOf("{");
  const firstBracket = body.indexOf("[");
  let start = -1;
  let end = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = body.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = body.lastIndexOf("]");
  }

  const candidate = start !== -1 && end >= start ? body.slice(start, end + 1) : body;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error(`${who} did not return parseable JSON.`);
  }
}

