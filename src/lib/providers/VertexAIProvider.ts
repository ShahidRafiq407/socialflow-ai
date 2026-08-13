import { GoogleGenAI } from "@google/genai";

export class VertexAIProvider {
  private ai: GoogleGenAI | null = null;
  private aiStudio: GoogleGenAI | null = null;

  constructor() {
    // Resolve credentials from multiple sources for Vercel/local compatibility
    let credentials: any = null;

    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      } catch (e) {
        console.error("[Provider] Failed to parse GOOGLE_CREDENTIALS_JSON string.");
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

    const projectId = credentials?.project_id || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    const googleAuthOptions = credentials ? { credentials } : undefined;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (projectId && credentials) {
      try {
        this.ai = new GoogleGenAI({
          vertexai: true,
          project: projectId,
          location: location,
          googleAuthOptions,
        });
      } catch (e) {
        console.warn("[Provider] Vertex AI init warning:", e);
      }
    }

    if (apiKey) {
      try {
        this.aiStudio = new GoogleGenAI({ apiKey });
      } catch (e) {
        console.warn("[Provider] AI Studio init warning:", e);
      }
    }
  }

  /**
   * Get fallback model names to try if the primary model fails
   */
  private getFallbackModels(primaryModel: string): string[] {
    const models = [primaryModel];

    if (primaryModel.includes("pro")) {
      models.push("gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite");
    } else {
      models.push("gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-lite");
    }

    return [...new Set(models)];
  }

  /**
   * Generate text using @google/genai SDK with Vertex AI & AI Studio fallbacks
   */
  async generateText(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number; tools?: any[] } = {}
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-2.0-flash");
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

    // Try Vertex AI provider if initialized
    if (this.ai) {
      for (const modelName of candidateModels) {
        try {
          console.log(`[GenAI Vertex] Trying model: ${modelName}`);
          const response = await this.ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config,
          });

          if (response.text) {
            console.log(`[GenAI Vertex] ✅ Success with model: ${modelName}`);
            return response.text;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[GenAI Vertex] ❌ ${modelName} failed:`, err?.message || err);
        }
      }
    }

    // Fallback to Google AI Studio API Key mode
    if (this.aiStudio) {
      for (const modelName of candidateModels) {
        try {
          console.log(`[GenAI Studio] Trying model: ${modelName}`);
          const response = await this.aiStudio.models.generateContent({
            model: modelName,
            contents: prompt,
            config,
          });

          if (response.text) {
            console.log(`[GenAI Studio] ✅ Success with model: ${modelName}`);
            return response.text;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[GenAI Studio] ❌ ${modelName} failed:`, err?.message || err);
        }
      }
    }

    // Fallback to direct fetch REST API if key exists
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (apiKey) {
      for (const modelName of candidateModels) {
        try {
          console.log(`[GenAI REST] Trying model: ${modelName}`);
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              console.log(`[GenAI REST] ✅ Success with model: ${modelName}`);
              return text;
            }
          }
        } catch (e: any) {
          lastError = e;
        }
      }
    }

    const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Gemini API unavailable.");
    throw new Error(`AI Generation Service: ${cleanErr}`);
  }

  /**
   * Generate structured JSON output
   */
  async generateJSON(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<any> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-2.0-flash");
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

    // Try Vertex AI
    if (this.ai) {
      for (const modelName of candidateModels) {
        try {
          console.log(`[GenAI JSON Vertex] Trying model: ${modelName}`);
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
            console.log(`[GenAI JSON Vertex] ✅ Success with model: ${modelName}`);
            return parsed;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[GenAI JSON Vertex] ❌ ${modelName} failed:`, err?.message || err);
        }
      }
    }

    // Try AI Studio
    if (this.aiStudio) {
      for (const modelName of candidateModels) {
        try {
          console.log(`[GenAI JSON Studio] Trying model: ${modelName}`);
          const response = await this.aiStudio.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              temperature: options.temperature ?? 0.1,
              responseMimeType: "application/json",
            },
          });

          if (response.text) {
            const parsed = tryParseJSON(response.text);
            console.log(`[GenAI JSON Studio] ✅ Success with model: ${modelName}`);
            return parsed;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[GenAI JSON Studio] ❌ ${modelName} failed:`, err?.message || err);
        }
      }
    }

    // Fallback to direct REST API
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (apiKey) {
      for (const modelName of candidateModels) {
        try {
          console.log(`[GenAI JSON REST] Trying model: ${modelName}`);
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" }
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parsed = tryParseJSON(text);
              console.log(`[GenAI JSON REST] ✅ Success with model: ${modelName}`);
              return parsed;
            }
          }
        } catch (e: any) {
          lastError = e;
        }
      }
    }

    const cleanErr = lastError?.message || (typeof lastError === "string" ? lastError : "Gemini JSON service unavailable.");
    throw new Error(`AI JSON Service: ${cleanErr}`);
  }
}
