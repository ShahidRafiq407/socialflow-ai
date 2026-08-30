import { GoogleGenAI } from "@google/genai";

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
    const list = [primaryModel];
    if (primaryModel.includes("pro")) {
      list.push("gemini-3.6-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash");
    } else {
      list.push("gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash");
    }
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
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-3.1-pro-preview");
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
   * Generate text with Google Search Grounding and return grounding sources
   */
  async generateWithGrounding(
    prompt: string,
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<{ text: string; searchQueries: string[]; sources: { title: string; url: string; snippet: string }[] }> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-3.6-flash");
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
   * Stream text token-by-token using Google Cloud Vertex AI with automated multi-model fallback.
   * Used for live agent reasoning ("thinking") streams. If a model fails before emitting any
   * chunk, the next fallback model is tried. If every streaming attempt fails, falls back to a
   * single non-streamed generation delivered as one chunk.
   */
  async generateTextStream(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number; maxOutputTokens?: number } = {},
    onChunk?: (delta: string) => void
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-3.6-flash");
    let lastError: any = null;

    const prompt = messages.map(m => {
      if (m.role === "system") return `[System Instructions]: ${m.content}`;
      return m.content;
    }).join("\n\n");

    for (const modelName of candidateModels) {
      let emittedAny = false;
      let fullText = "";
      try {
        console.log(`[Vertex AI Stream] Executing generateTextStream with model: ${modelName}`);
        const streamResult = await this.ai.models.generateContentStream({
          model: modelName,
          contents: prompt,
          config: {
            temperature: options.temperature ?? 0.5,
            ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
          },
        });

        for await (const chunk of streamResult) {
          const delta = chunk.text;
          if (delta) {
            emittedAny = true;
            fullText += delta;
            try {
              onChunk?.(delta);
            } catch {
              // Consumer errors must never break the stream
            }
          }
        }

        if (fullText.trim()) {
          console.log(`[Vertex AI Stream] ✅ Success with model: ${modelName}`);
          return fullText;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Vertex AI Stream] ❌ Model ${modelName} stream failed:`, err?.message || err);
        if (emittedAny) {
          // Partial stream already delivered to the client — keep it and stop
          return fullText;
        }
      }
    }

    // Final fallback: single non-streamed generation emitted as one chunk
    try {
      const text = await this.generateText(messages, {
        modelName: options.modelName,
        temperature: options.temperature,
      });
      if (text) {
        try {
          onChunk?.(text);
        } catch {
          // ignore consumer errors
        }
      }
      return text;
    } catch {
      const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Vertex AI stream response error.");
      throw new Error(`Vertex AI Provider Stream: ${cleanErr}`);
    }
  }


  /**
   * Generate structured JSON output using Google Cloud Vertex AI with retry and fallback
   */
  async generateJSON(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<any> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-3.1-pro-preview");
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
