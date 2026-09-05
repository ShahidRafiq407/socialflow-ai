// ============================================================================
// PROVIDER GATEWAY
//
// One entry point the rest of the app calls instead of picking a client itself.
//
//   providerFor("claude-opus-5")  → AnthropicProvider  (x-api-key, /v1/messages)
//   providerFor("deepseek-chat")  → OpenAICompatibleProvider (bearer, /chat/completions)
//   providerFor("gemini-3.6-flash") → the built-in Vertex client
//
// The lookup is by model id, because that is the only thing the call sites have.
// An admin-created `AiModel` row carries the provider, the base URL and which
// managed key to use; a model id nobody registered falls through to Vertex,
// which is what every id meant before this file existed.
//
// Credentials are read through `managedKey()`, so rotating a key in the back
// office takes effect on the next call without a redeploy. Nothing here caches a
// key: the runtime-config layer already does, with a short TTL.
// ============================================================================

import type { Content, FunctionDeclaration } from "@google/genai";
import {
  VertexAIProvider,
  type AgentFunctionCall,
  type AgentTurnResult,
  type ThinkingEffort,
} from "./VertexAIProvider";
import { OpenAICompatibleProvider, type RemoteProviderConfig } from "./OpenAICompatibleProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { providerSpec, type ProviderWire } from "./registry";
import { reportUserFailure } from "@/lib/admin/report";

/**
 * The one Google client for the process. It lives here rather than in
 * `llm.ts` so this module has no import edge back into the agent layer —
 * `runtimeConfig` pushes the routing table in here, and a cycle through
 * `llm.ts` would put `vertexProvider` in a temporal dead zone on some
 * module-evaluation orders. `llm.ts` re-exports what this returns, so every
 * existing `import { vertexProvider } from "@/lib/agents/llm"` still works and
 * still gets the same instance.
 */
let vertex: VertexAIProvider | null = null;
export function vertexClient(): VertexAIProvider {
  if (!vertex) vertex = new VertexAIProvider();
  return vertex;
}

/** What a model row tells the gateway. Filled from `AiModel`, or from nothing. */
export interface ModelRouting {
  modelId: string;
  provider: string;
  baseUrl: string | null;
  apiKeyRef: string | null;
  maxOutputTokens: number | null;
}

/** The subset of a provider both remote clients implement identically. */
export interface RemoteClient {
  streamAgentTurn(
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
    callbacks?: {
      onThought?: (text: string) => void;
      onText?: (text: string) => void;
      onFunctionCall?: (call: AgentFunctionCall) => void;
      onModelFallback?: (from: string, to: string) => void;
    },
  ): Promise<AgentTurnResult>;
  generateText(
    messages: Array<{ role: string; content: string }>,
    options?: { modelName?: string; temperature?: number },
  ): Promise<string>;
  generateJSON(
    messages: Array<{ role: string; content: string }>,
    options?: { modelName?: string; temperature?: number },
    // Parsed model output. `any` matches what the Vertex client has always
    // returned, so every existing call site keeps compiling unchanged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any>;
}

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

/**
 * A half-configured model row, on the admin's Errors tab as well as in the throw.
 *
 * This is the failure an admin is most likely to cause and least likely to see:
 * the row lists in the chat picker, a user picks it, and every turn dies on a
 * missing key. The message is the same one the user's turn fails with, so the two
 * are recognisably the same incident.
 */
function configFault(message: string, context: Record<string, unknown>): ProviderConfigError {
  reportUserFailure({ feature: "provider-config", message, context });
  return new ProviderConfigError(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// The routing table
//
// Injected by the runtime-config layer on every reload, the same way plan and
// rate overrides are. Keeping the arrow pointing that way means this file can be
// imported by anything without dragging prisma in behind it.
// ─────────────────────────────────────────────────────────────────────────────

let ROUTING = new Map<string, ModelRouting>();
let RESOLVE_KEY: (name: string) => string = () => "";

/** Called by `runtimeConfig.applyOverrides()`. Clears the client cache too. */
export function setModelRouting(rows: ModelRouting[], resolveKey?: (name: string) => string): void {
  const next = new Map<string, ModelRouting>();
  for (const row of rows) {
    if (!row?.modelId) continue;
    next.set(row.modelId, row);
    // Aggregator ids carry a vendor prefix ("anthropic/claude-opus-5"); the chat
    // settings sometimes hold the bare id, so both spellings resolve.
    const bare = row.modelId.includes("/") ? row.modelId.split("/").pop() || "" : "";
    if (bare && !next.has(bare)) next.set(bare, row);
  }
  ROUTING = next;
  if (resolveKey) RESOLVE_KEY = resolveKey;
  CLIENTS.clear();
}

export function modelRouting(modelId: string | null | undefined): ModelRouting | null {
  const id = (modelId || "").trim();
  return id ? ROUTING.get(id) ?? null : null;
}

/** Which dialect a model id speaks. Unregistered ids are Vertex, as before. */
export function wireFor(modelId: string | null | undefined): ProviderWire {
  const routing = modelRouting(modelId);
  return routing ? providerSpec(routing.provider).wire : "vertex";
}

/** True when a model id needs a remote client rather than the built-in one. */
export function isRemoteModel(modelId: string | null | undefined): boolean {
  return wireFor(modelId) !== "vertex";
}

// ─────────────────────────────────────────────────────────────────────────────
// Building clients
// ─────────────────────────────────────────────────────────────────────────────

const CLIENTS = new Map<string, RemoteClient>();

/**
 * The base URL, key and headers a row resolves to. Throws `ProviderConfigError`
 * with a message an admin can act on, because "the model just fails" is the
 * worst possible outcome of a half-configured row.
 */
export function resolveConfig(routing: ModelRouting): RemoteProviderConfig {
  const spec = providerSpec(routing.provider);
  const baseUrl = (routing.baseUrl || spec.baseUrl || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw configFault(
      `${spec.label} needs a base URL. Set it on the model row in the back office.`,
      { provider: routing.provider, model: routing.modelId, missing: "baseUrl" }
    );
  }

  const keyName = (routing.apiKeyRef || spec.keyName || "").trim();
  const apiKey = keyName ? RESOLVE_KEY(keyName) : "";
  if (!apiKey) {
    throw configFault(
      `No API key for ${spec.label}. Add its credential in the company panel on the back office Models screen.`,
      { provider: routing.provider, model: routing.modelId, missing: "apiKey" }
    );
  }

  return {
    providerId: routing.provider,
    baseUrl,
    apiKey,
    maxOutputTokens: routing.maxOutputTokens,
  };
}

function build(routing: ModelRouting): RemoteClient {
  const config = resolveConfig(routing);
  return providerSpec(routing.provider).wire === "anthropic"
    ? new AnthropicProvider(config)
    : new OpenAICompatibleProvider(config);
}

/**
 * The client that serves this model id. Vertex ids get the built-in provider,
 * which already satisfies `RemoteClient` structurally.
 *
 * Clients are cached per model id and thrown away whenever the routing table is
 * replaced, so a key rotated in the back office is picked up on the next reload
 * rather than living on inside a stale client.
 */
export function providerFor(modelId: string | null | undefined): RemoteClient {
  const routing = modelRouting(modelId);
  if (!routing || providerSpec(routing.provider).wire === "vertex") {
    return vertexClient() as unknown as RemoteClient;
  }

  const cached = CLIENTS.get(routing.modelId);
  if (cached) return cached;
  const client = build(routing);
  CLIENTS.set(routing.modelId, client);
  return client;
}

/** Drop-in for `vertexProvider.streamAgentTurn`, routed by `params.modelName`. */
export function streamAgentTurn(
  params: Parameters<RemoteClient["streamAgentTurn"]>[0],
  callbacks: Parameters<RemoteClient["streamAgentTurn"]>[1] = {},
): Promise<AgentTurnResult> {
  return providerFor(params.modelName).streamAgentTurn(params, callbacks);
}

export function generateText(
  messages: Array<{ role: string; content: string }>,
  options: { modelName?: string; temperature?: number } = {},
): Promise<string> {
  return providerFor(options.modelName).generateText(messages, options);
}

export function generateJSON(
  messages: Array<{ role: string; content: string }>,
  options: { modelName?: string; temperature?: number } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return providerFor(options.modelName).generateJSON(messages, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection test
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderTestResult {
  ok: boolean;
  /** What the model actually replied, trimmed. Empty on failure. */
  reply: string;
  /** An admin-readable reason when `ok` is false. */
  error: string;
  latencyMs: number;
  wire: ProviderWire;
}

/**
 * Sends the cheapest possible real request so the admin finds out the key is
 * wrong on the Models screen rather than from a user's failed chat turn.
 */
export async function testModel(routing: ModelRouting): Promise<ProviderTestResult> {
  const wire = providerSpec(routing.provider).wire;
  const startedAt = Date.now();

  if (wire === "vertex") {
    try {
      const reply = await vertexClient().generateText(
        [{ role: "user", content: "Reply with the single word: ok" }],
        { modelName: routing.modelId, temperature: 0 },
      );
      return { ok: true, reply: reply.trim().slice(0, 200), error: "", latencyMs: Date.now() - startedAt, wire };
    } catch (err) {
      return {
        ok: false,
        reply: "",
        error: err instanceof Error ? err.message.slice(0, 400) : "Request failed",
        latencyMs: Date.now() - startedAt,
        wire,
      };
    }
  }

  try {
    const client = build(routing);
    const reply = await client.generateText([{ role: "user", content: "Reply with the single word: ok" }], {
      modelName: routing.modelId,
      temperature: 0,
    });
    const trimmed = reply.trim();
    return {
      ok: trimmed.length > 0,
      reply: trimmed.slice(0, 200),
      error: trimmed ? "" : "The model accepted the request but returned nothing.",
      latencyMs: Date.now() - startedAt,
      wire,
    };
  } catch (err) {
    return {
      ok: false,
      reply: "",
      error: err instanceof Error ? err.message.slice(0, 400) : "Request failed",
      latencyMs: Date.now() - startedAt,
      wire,
    };
  }
}




