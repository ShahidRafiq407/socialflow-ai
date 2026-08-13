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
   * Target model for Vertex AI generation
   */
  private getFallbackModels(primaryModel: string): string[] {
    return [primaryModel].filter(Boolean);
  }

  /**
   * Generate text using Google Cloud Vertex AI
   */
  async generateText(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number; tools?: any[] } = {}
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-3.1-pro");
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
      try {
        console.log(`[Vertex AI] Executing generateText with model: ${modelName}`);
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
        console.warn(`[Vertex AI] ❌ Model ${modelName} failed:`, err?.message || err);
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
      try {
        console.log(`[Vertex AI Grounding] Executing with model: ${modelName}`);
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
        console.warn(`[Vertex AI Grounding] ❌ Model ${modelName} failed:`, err?.message || err);
      }
    }

    const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Vertex AI Grounding response error.");
    throw new Error(`Vertex AI Provider Grounding: ${cleanErr}`);
  }

  /**
   * Generate structured JSON output using Google Cloud Vertex AI
   */
  async generateJSON(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<any> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-3.1-pro");
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
      try {
        console.log(`[Vertex AI JSON] Executing generateJSON with model: ${modelName}`);
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
        console.warn(`[Vertex AI JSON] ❌ Model ${modelName} failed:`, err?.message || err);
      }
    }

    const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Vertex AI JSON model response error.");
    throw new Error(`Vertex AI Provider JSON: ${cleanErr}`);
  }
}
