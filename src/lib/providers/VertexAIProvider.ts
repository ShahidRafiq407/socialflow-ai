import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";

/** A tool call the model asked for during an agent turn. */
export interface AgentFunctionCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

/** Result of one streamed agent turn (see `streamAgentTurn`). */
export interface AgentTurnResult {
  /** Visible answer text emitted on this turn (may be empty on a pure tool turn). */
  text: string;
  /** Concatenated thought summaries emitted on this turn. */
  reasoning: string;
  /** Tools the model wants executed before it continues. */
  functionCalls: AgentFunctionCall[];
  /**
   * The model's raw parts, verbatim. Append these back as a `model` turn before
   * the function responses — Gemini 3 requires its own `thoughtSignature` parts
   * to be echoed for multi-turn tool use to keep working.
   */
  modelParts: Part[];
  model: string;
  thinkingUsed: boolean;
  finishReason: string;
  searchQueries: string[];
  sources: { title: string; url: string; snippet: string }[];
}

/** How hard the model should think, mapped to the SDK's ThinkingLevel. */
export type ThinkingEffort = "off" | "concise" | "balanced" | "deep";

const THINKING_LEVEL_BY_EFFORT: Record<Exclude<ThinkingEffort, "off">, string> = {
  concise: "LOW",
  balanced: "MEDIUM",
  deep: "HIGH",
};

// ---------------------------------------------------------------------------
// Model defaults
//
// Every id here is a default, not a constant: a deployment whose project has a
// different set of Gemini models enabled changes these through the environment
// instead of through a code change. This file cannot import llm.ts (llm.ts
// imports this class), so the vars are read directly.
// ---------------------------------------------------------------------------

/** Comma-separated env list, trimmed and de-duped; empty falls back. */
function modelList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (typeof raw !== "string") return fallback;
  const items = Array.from(new Set(raw.split(",").map((p) => p.trim()).filter(Boolean)));
  return items.length > 0 ? items : fallback;
}

/** The model a caller gets when it names none and wants reasoning depth. */
const DEFAULT_FRONTIER_MODEL = process.env.VERTEX_DEFAULT_PRO_MODEL?.trim() || "gemini-3.1-pro-preview";
/** The model a caller gets when it names none and wants speed (vision, grounding). */
const DEFAULT_FAST_MODEL = process.env.VERTEX_DEFAULT_FAST_MODEL?.trim() || "gemini-3.6-flash";

/** Tried in order after a "pro" model fails on quota or a transient error. */
const PRO_FALLBACKS = modelList("VERTEX_PRO_FALLBACKS", [
  DEFAULT_FAST_MODEL,
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
]);

/** Tried in order after any other model fails the same way. */
const FAST_FALLBACKS = modelList("VERTEX_FAST_FALLBACKS", [
  DEFAULT_FAST_MODEL,
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
]);

export class VertexAIProvider {
  public ai: GoogleGenAI;
  public mediaAi: GoogleGenAI;

  constructor() {
    // Resolve Google Cloud credentials for Vertex AI
    let credentials: any = null;

    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      } catch (e) {
        console.error("[VertexAIProvider] Failed to parse GOOGLE_CREDENTIALS_JSON.");
      }
    } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      credentials = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID,
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        token_uri: "https://oauth2.googleapis.com/token",
        universe_domain: "googleapis.com",
      };
    }

    const projectId = credentials?.project_id || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || "marketing-ai-saas";
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
    const googleAuthOptions = credentials ? { credentials } : undefined;
    const httpOptions = { headers: { "Api-Revision": "2026-05-20" } };

    console.log("[Vertex AI Provider Init]", {
      hasCredentials: !!credentials,
      projectId,
      location,
    });

    // Unified GoogleGenAI client with Vertex AI and Api-Revision 2026-05-20
    this.ai = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location,
      googleAuthOptions,
      httpOptions,
    });

    this.mediaAi = this.ai;
  }

  /**
   * Resilient fallback model resolution for Vertex AI
   */
  private getFallbackModels(primaryModel: string): string[] {
    const list = [primaryModel, ...(primaryModel.includes("pro") ? PRO_FALLBACKS : FAST_FALLBACKS)];
    return Array.from(new Set(list.filter(Boolean)));
  }

  /**
   * Detects 429 (Resource Exhausted / Rate Limit) and transient 503 errors
   */
  private isRateLimitOrTransientError(err: any): boolean {
    if (!err) return false;
    const msg = (err.message || (typeof err === "string" ? err : "") || JSON.stringify(err)).toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("resource_exhausted") ||
      msg.includes("resource exhausted") ||
      msg.includes("quota") ||
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("503") ||
      msg.includes("unavailable")
    );
  }

  /**
   * Generate text using Google Cloud Vertex AI with automated retry and multi-model fallback
   */
  async generateText(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number; tools?: any[] } = {}
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName || DEFAULT_FRONTIER_MODEL);
    let lastError: any = null;

    const prompt = messages.map(m => {
      if (m.role === "system") return `[System Instructions]: ${m.content}`;
      return m.content;
    }).join("\n\n");

    const config: any = {
      temperature: options.temperature ?? 0.7,
    };

    if (options.tools) {
      const hasSearchTool = options.tools.some((t: any) => t.googleSearchRetrieval || t.google_search_retrieval);
      if (hasSearchTool) {
        config.tools = [{ googleSearch: {} }];
      }
    }

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[Vertex AI] Executing generateText with model: ${modelName} (attempt ${attempt + 1})`);
          const response = await this.ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config,
          });

          if (response.text) {
            console.log(`[Vertex AI] ✅ Success with model: ${modelName} (${response.text.length} chars)`);
            return response.text;
          }
        } catch (err: any) {
          lastError = err;
          const isRateLimit = this.isRateLimitOrTransientError(err);
          console.warn(`[Vertex AI] ❌ Model ${modelName} failed (attempt ${attempt + 1}, is429: ${isRateLimit}):`, err?.message || err);

          if (isRateLimit && attempt === 0) {
            // Wait 1.2s before second attempt on same model
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          // On non-transient error or exhausted attempts, proceed to next candidate model
          break;
        }
      }
    }

    const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Vertex AI model response error.");
    throw new Error(`Vertex AI Provider: ${cleanErr}`);
  }

  /**
   * Generate text from multimodal parts (inline images / video frames + text)
   * with the same retry + model-fallback behaviour as generateText.
   */
  async generateVisionText(
    parts: Part[],
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName || DEFAULT_FAST_MODEL);
    let lastError: unknown = null;

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[Vertex AI Vision] Executing generateVisionText with model: ${modelName} (attempt ${attempt + 1}, ${parts.length} parts)`);
          const response = await this.ai.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts }],
            config: {
              temperature: options.temperature ?? 0.4,
            },
          });

          if (response.text) {
            console.log(`[Vertex AI Vision] ✅ Success with model: ${modelName} (${response.text.length} chars)`);
            return response.text;
          }
        } catch (err) {
          lastError = err;
          const isRateLimit = this.isRateLimitOrTransientError(err);
          console.warn(`[Vertex AI Vision] ❌ Model ${modelName} failed (attempt ${attempt + 1}, is429: ${isRateLimit}):`, err instanceof Error ? err.message : err);

          if (isRateLimit && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break;
        }
      }
    }

    const cleanErr = (lastError as Error)?.message || (typeof lastError === "string" ? lastError : "Vertex AI vision response error.");
    throw new Error(`Vertex AI Provider Vision: ${cleanErr}`);
  }

  /**
   * Generate text with Google Search Grounding and return grounding sources
   */
  async generateWithGrounding(
    prompt: string,
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<{ text: string; searchQueries: string[]; sources: { title: string; url: string; snippet: string }[] }> {
    const candidateModels = this.getFallbackModels(options.modelName || DEFAULT_FAST_MODEL);
    let lastError: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[Vertex AI Grounding] Executing with model: ${modelName} (attempt ${attempt + 1})`);
          const response = await this.ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              temperature: options.temperature ?? 0.3,
              tools: [{ googleSearch: {} }],
            },
          });

          const text = response.text || "";
          const searchQueries: string[] = [];
          const sources: { title: string; url: string; snippet: string }[] = [];

          const candidates = (response as any).candidates || [];
          for (const candidate of candidates) {
            const groundingMetadata = candidate?.groundingMetadata;
            if (groundingMetadata) {
              if (Array.isArray(groundingMetadata.webSearchQueries)) {
                searchQueries.push(...groundingMetadata.webSearchQueries);
              }
              if (Array.isArray(groundingMetadata.groundingChunks)) {
                for (const chunk of groundingMetadata.groundingChunks) {
                  if (chunk.web) {
                    sources.push({
                      title: chunk.web.title || "Web Source",
                      url: chunk.web.uri || chunk.web.url || "",
                      snippet: chunk.web.snippet || "",
                    });
                  }
                }
              }
            }
          }

          console.log(`[Vertex AI Grounding] Found ${sources.length} sources and ${searchQueries.length} queries.`);
          return { text, searchQueries, sources };
        } catch (err: any) {
          lastError = err;
          const isRateLimit = this.isRateLimitOrTransientError(err);
          console.warn(`[Vertex AI Grounding] ❌ Model ${modelName} failed (attempt ${attempt + 1}, is429: ${isRateLimit}):`, err?.message || err);

          if (isRateLimit && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break;
        }
      }
    }

    const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Vertex AI Grounding response error.");
    throw new Error(`Vertex AI Provider Grounding: ${cleanErr}`);
  }

  /**
   * Shared JSON extraction for both the buffered and the streamed JSON paths:
   * models wrap the object in prose or fences often enough that slicing to the
   * outermost brace/bracket pair is more reliable than trusting the raw text.
   */
  private extractJSON(text: string): any {
    let cleaned = text.trim();
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    const lastBrace = cleaned.lastIndexOf("}");
    const lastBracket = cleaned.lastIndexOf("]");
    let startIndex = -1;
    let endIndex = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIndex = firstBrace;
      endIndex = lastBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
      endIndex = lastBracket;
    }

    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      cleaned = cleaned.substring(startIndex, endIndex + 1);
    }

    return JSON.parse(cleaned);
  }

  /**
   * Core streaming call used by every "show the real reasoning" agent path.
   *
   * `thinkingConfig.includeThoughts` makes Gemini emit thought-summary parts on
   * the SAME request as the answer, so live reasoning costs no extra latency and
   * no extra call. Parts are separated by the `thought` flag: flagged parts go to
   * `onThought`, everything else is the actual answer.
   *
   * Not every model in the fallback chain accepts `thinkingConfig` — when a model
   * rejects it, the same model is retried once with thinking disabled so the run
   * degrades to "no live reasoning" instead of failing.
   */
  private async streamGenerate(
    prompt: string,
    options: {
      modelName?: string;
      temperature?: number;
      responseMimeType?: string;
      grounded?: boolean;
      includeThoughts?: boolean;
      signal?: AbortSignal;
    },
    callbacks: { onThought?: (chunk: string) => void; onText?: (chunk: string) => void } = {}
  ): Promise<{
    text: string;
    thoughtChars: number;
    searchQueries: string[];
    sources: { title: string; url: string; snippet: string }[];
    model: string;
    thinkingUsed: boolean;
  }> {
    const candidateModels = this.getFallbackModels(options.modelName || DEFAULT_FRONTIER_MODEL);
    let lastError: any = null;

    if (typeof (this.ai as any)?.models?.generateContentStream !== "function") {
      throw new Error("Vertex AI Provider: generateContentStream is unavailable in this SDK build.");
    }

    for (const modelName of candidateModels) {
      // Two passes per model: with thought summaries, then without if the model
      // rejects the thinking config outright.
      for (const withThinking of options.includeThoughts === false ? [false] : [true, false]) {
        const config: any = { temperature: options.temperature ?? 0.4 };
        if (options.responseMimeType) config.responseMimeType = options.responseMimeType;
        if (options.grounded) config.tools = [{ googleSearch: {} }];
        if (withThinking) config.thinkingConfig = { includeThoughts: true };

        try {
          console.log(
            `[Vertex AI Stream] ${modelName} (thoughts: ${withThinking}, grounded: ${!!options.grounded})`
          );
          const stream = await this.ai.models.generateContentStream({
            model: modelName,
            contents: prompt,
            config,
          });

          let answer = "";
          let thoughtChars = 0;
          const searchQueries: string[] = [];
          const sources: { title: string; url: string; snippet: string }[] = [];

          for await (const chunk of stream) {
            if (options.signal?.aborted) {
              const abortErr: any = new Error("Generation cancelled by user");
              abortErr.isCancelled = true;
              throw abortErr;
            }

            const candidates = (chunk as any)?.candidates || [];
            for (const candidate of candidates) {
              for (const part of candidate?.content?.parts || []) {
                const partText: string = part?.text || "";
                if (!partText) continue;
                // `thought: true` marks a summary of the model's reasoning.
                if (part?.thought === true) {
                  thoughtChars += partText.length;
                  callbacks.onThought?.(partText);
                } else {
                  answer += partText;
                  callbacks.onText?.(partText);
                }
              }

              const groundingMetadata = candidate?.groundingMetadata;
              if (groundingMetadata) {
                if (Array.isArray(groundingMetadata.webSearchQueries)) {
                  searchQueries.push(...groundingMetadata.webSearchQueries);
                }
                for (const gChunk of groundingMetadata.groundingChunks || []) {
                  if (gChunk?.web) {
                    sources.push({
                      title: gChunk.web.title || "Web Source",
                      url: gChunk.web.uri || gChunk.web.url || "",
                      snippet: gChunk.web.snippet || "",
                    });
                  }
                }
              }
            }
          }

          if (answer.trim()) {
            return {
              text: answer,
              thoughtChars,
              searchQueries: Array.from(new Set(searchQueries)),
              sources,
              model: modelName,
              thinkingUsed: withThinking && thoughtChars > 0,
            };
          }
          lastError = new Error(`${modelName} streamed an empty response.`);
        } catch (err: any) {
          if (err?.isCancelled) throw err;
          lastError = err;
          const msg = (err?.message || "").toLowerCase();
          const rejectedThinking =
            withThinking &&
            (msg.includes("thinking") ||
              msg.includes("thought") ||
              msg.includes("invalid_argument") ||
              msg.includes("400"));

          console.warn(
            `[Vertex AI Stream] ❌ ${modelName} (thoughts: ${withThinking}) failed:`,
            err?.message || err
          );

          if (rejectedThinking) continue; // retry same model without thinking
          if (this.isRateLimitOrTransientError(err)) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break; // move to the next candidate model
        }
      }
    }

    throw new Error(
      `Vertex AI Provider Stream: ${lastError?.message || "no candidate model produced a response."}`
    );
  }

  /**
   * Streamed JSON generation that surfaces the model's real thought summaries as
   * they arrive. Falls back to the buffered `generateJSON` path when streaming is
   * unavailable, so callers always get a parsed object.
   */
  async generateJSONWithThoughts(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number; signal?: AbortSignal } = {},
    callbacks: { onThought?: (chunk: string) => void } = {}
  ): Promise<{ data: any; thinkingUsed: boolean; model: string }> {
    const prompt = messages
      .map((m) => (m.role === "system" ? `[System Instructions]: ${m.content}` : m.content))
      .join("\n\n");

    try {
      const res = await this.streamGenerate(
        prompt,
        {
          modelName: options.modelName,
          temperature: options.temperature ?? 0.1,
          responseMimeType: "application/json",
          includeThoughts: true,
          signal: options.signal,
        },
        callbacks
      );
      return { data: this.extractJSON(res.text), thinkingUsed: res.thinkingUsed, model: res.model };
    } catch (err: any) {
      if (err?.isCancelled) throw err;
      console.warn("[Vertex AI] Streamed JSON failed, falling back to buffered call:", err?.message || err);
      const data = await this.generateJSON(messages, {
        modelName: options.modelName,
        temperature: options.temperature,
      });
      return { data, thinkingUsed: false, model: options.modelName || "fallback" };
    }
  }

  /**
   * Streamed Google-Search-grounded generation with live thought summaries and
   * real citation metadata. Falls back to the buffered grounded call.
   */
  async generateGroundedWithThoughts(
    prompt: string,
    options: { modelName?: string; temperature?: number; signal?: AbortSignal } = {},
    callbacks: { onThought?: (chunk: string) => void; onText?: (chunk: string) => void } = {}
  ): Promise<{
    text: string;
    searchQueries: string[];
    sources: { title: string; url: string; snippet: string }[];
    thinkingUsed: boolean;
  }> {
    try {
      const res = await this.streamGenerate(
        prompt,
        {
          modelName: options.modelName,
          temperature: options.temperature ?? 0.3,
          grounded: true,
          includeThoughts: true,
          signal: options.signal,
        },
        callbacks
      );
      return {
        text: res.text,
        searchQueries: res.searchQueries,
        sources: res.sources,
        thinkingUsed: res.thinkingUsed,
      };
    } catch (err: any) {
      if (err?.isCancelled) throw err;
      console.warn("[Vertex AI] Streamed grounding failed, falling back to buffered call:", err?.message || err);
      const res = await this.generateWithGrounding(prompt, {
        modelName: options.modelName,
        temperature: options.temperature,
      });
      return { ...res, thinkingUsed: false };
    }
  }

  /**
   * ONE streamed turn of a native-function-calling agent loop.
   *
   * This is the engine behind the Automate controller. Unlike the other stream
   * helpers it takes a full `contents` history (so the caller owns the loop) and
   * real `functionDeclarations` (so the model picks tools itself instead of being
   * asked to emit planning JSON). Thought summaries arrive on the SAME request as
   * the answer and the tool calls, which is what makes live thinking free.
   *
   * A turn is a success when it produced text OR at least one function call — a
   * pure tool turn legitimately has no visible text.
   *
   * Model/thinking resilience mirrors `streamGenerate`: walk the fallback chain,
   * and if a model rejects `thinkingConfig` retry it once without thinking rather
   * than failing the run.
   */
  async streamAgentTurn(
    params: {
      contents: Content[];
      systemInstruction?: string;
      functionDeclarations?: FunctionDeclaration[];
      /** Only honoured when no functionDeclarations are supplied (Vertex rejects both). */
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
      /** Fired when the turn falls back to a different model than requested. */
      onModelFallback?: (modelName: string) => void;
    } = {}
  ): Promise<AgentTurnResult> {
    const requested = params.modelName || DEFAULT_FRONTIER_MODEL;
    const candidateModels = this.getFallbackModels(requested);
    const declarations = params.functionDeclarations || [];
    const wantsThinking = params.thinkingEffort !== "off";
    let lastError: any = null;

    if (typeof (this.ai as any)?.models?.generateContentStream !== "function") {
      throw new Error("Vertex AI Provider: generateContentStream is unavailable in this SDK build.");
    }

    for (const modelName of candidateModels) {
      for (const withThinking of wantsThinking ? [true, false] : [false]) {
        const config: any = {
          temperature: params.temperature ?? 0.4,
        };
        if (params.maxOutputTokens) config.maxOutputTokens = params.maxOutputTokens;
        if (params.systemInstruction) config.systemInstruction = params.systemInstruction;

        if (declarations.length > 0) {
          config.tools = [{ functionDeclarations: declarations }];
          config.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
        } else if (params.enableGoogleSearch) {
          config.tools = [{ googleSearch: {} }];
        }

        if (withThinking) {
          config.thinkingConfig = {
            includeThoughts: true,
            thinkingLevel:
              THINKING_LEVEL_BY_EFFORT[(params.thinkingEffort || "balanced") as Exclude<ThinkingEffort, "off">] ||
              "MEDIUM",
          };
        }

        try {
          if (modelName !== requested) callbacks.onModelFallback?.(modelName);
          console.log(
            `[Vertex Agent] ${modelName} (thoughts: ${withThinking}, tools: ${declarations.length})`
          );

          const stream = await this.ai.models.generateContentStream({
            model: modelName,
            contents: params.contents,
            config,
          });

          let text = "";
          let reasoning = "";
          const functionCalls: AgentFunctionCall[] = [];
          const modelParts: Part[] = [];
          const searchQueries: string[] = [];
          const sources: { title: string; url: string; snippet: string }[] = [];
          let finishReason = "STOP";

          for await (const chunk of stream) {
            if (params.signal?.aborted) {
              const abortErr: any = new Error("Generation cancelled by user");
              abortErr.isCancelled = true;
              throw abortErr;
            }

            for (const candidate of (chunk as any)?.candidates || []) {
              if (candidate?.finishReason) finishReason = String(candidate.finishReason);

              for (const part of (candidate?.content?.parts || []) as Part[]) {
                modelParts.push(part);

                if (part?.functionCall?.name) {
                  const call: AgentFunctionCall = {
                    id: part.functionCall.id,
                    name: part.functionCall.name,
                    args: (part.functionCall.args as Record<string, unknown>) || {},
                  };
                  functionCalls.push(call);
                  callbacks.onFunctionCall?.(call);
                  continue;
                }

                const partText = part?.text || "";
                if (!partText) continue;
                if (part?.thought === true) {
                  reasoning += partText;
                  callbacks.onThought?.(partText);
                } else {
                  text += partText;
                  callbacks.onText?.(partText);
                }
              }

              const grounding = candidate?.groundingMetadata;
              if (grounding) {
                if (Array.isArray(grounding.webSearchQueries)) {
                  searchQueries.push(...grounding.webSearchQueries);
                }
                for (const gChunk of grounding.groundingChunks || []) {
                  if (gChunk?.web) {
                    sources.push({
                      title: gChunk.web.title || "Web Source",
                      url: gChunk.web.uri || gChunk.web.url || "",
                      snippet: gChunk.web.snippet || "",
                    });
                  }
                }
              }
            }
          }

          if (text.trim() || functionCalls.length > 0) {
            return {
              text,
              reasoning,
              functionCalls,
              modelParts,
              model: modelName,
              thinkingUsed: withThinking && reasoning.length > 0,
              finishReason,
              searchQueries: Array.from(new Set(searchQueries)),
              sources,
            };
          }

          lastError = new Error(`${modelName} streamed neither text nor a tool call.`);
        } catch (err: any) {
          if (err?.isCancelled) throw err;
          lastError = err;
          const msg = (err?.message || "").toLowerCase();
          const rejectedThinking =
            withThinking &&
            (msg.includes("thinking") ||
              msg.includes("thought") ||
              msg.includes("invalid_argument") ||
              msg.includes("400"));

          console.warn(
            `[Vertex Agent] ❌ ${modelName} (thoughts: ${withThinking}) failed:`,
            err?.message || err
          );

          if (rejectedThinking) continue; // retry same model, thinking off
          if (this.isRateLimitOrTransientError(err)) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break; // next candidate model
        }
      }
    }

    throw new Error(
      `Vertex AI Provider Agent: ${lastError?.message || "no candidate model produced a response."}`
    );
  }

  /**
   * Generate structured JSON output using Google Cloud Vertex AI with retry and fallback
   */
  async generateJSON(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<any> {
    const candidateModels = this.getFallbackModels(options.modelName || DEFAULT_FRONTIER_MODEL);
    let lastError: any = null;

    const prompt = messages.map(m => {
      if (m.role === "system") return `[System Instructions]: ${m.content}`;
      return m.content;
    }).join("\n\n");

    const tryParseJSON = (text: string) => {
      let cleaned = text.trim();
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');
      const lastBrace = cleaned.lastIndexOf('}');
      const lastBracket = cleaned.lastIndexOf(']');
      let startIndex = -1;
      let endIndex = -1;

      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIndex = firstBrace;
        endIndex = lastBrace;
      } else if (firstBracket !== -1) {
        startIndex = firstBracket;
        endIndex = lastBracket;
      }

      if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
        cleaned = cleaned.substring(startIndex, endIndex + 1);
      }

      return JSON.parse(cleaned);
    };

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[Vertex AI JSON] Executing generateJSON with model: ${modelName} (attempt ${attempt + 1})`);
          const response = await this.ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              temperature: options.temperature ?? 0.1,
              responseMimeType: "application/json",
            },
          });

          if (response.text) {
            const parsed = tryParseJSON(response.text);
            console.log(`[Vertex AI JSON] ✅ Success with model: ${modelName}`);
            return parsed;
          }
        } catch (err: any) {
          lastError = err;
          const isRateLimit = this.isRateLimitOrTransientError(err);
          console.warn(`[Vertex AI JSON] ❌ Model ${modelName} failed (attempt ${attempt + 1}, is429: ${isRateLimit}):`, err?.message || err);

          if (isRateLimit && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break;
        }
      }
    }

    const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Vertex AI JSON model response error.");
    throw new Error(`Vertex AI Provider JSON: ${cleanErr}`);
  }

  /**
   * Generate text embeddings using Vertex AI (text-embedding-004, 768 dims by default).
   * Returns one float[] per input string. Configurable via MODEL_EMBEDDING.
   */
  async embed(texts: string[]): Promise<number[][]> {
    const modelName = process.env.MODEL_EMBEDDING || "text-embedding-004";
    const out: number[][] = [];
    for (const text of texts) {
      try {
        const response = (await this.ai.models.embedContent({
          model: modelName,
          contents: text,
        })) as any;
        const values = response?.embeddings?.[0]?.values;
        out.push(Array.isArray(values) && values.length > 0 ? values.map(Number) : []);
      } catch (err: any) {
        console.warn(`[Vertex AI Embed] ❌ ${modelName} failed:`, err?.message || err);
        out.push([]);
      }
    }
    return out;
  }
}
