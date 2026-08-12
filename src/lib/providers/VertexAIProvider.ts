import { GoogleGenAI } from "@google/genai";

export class VertexAIProvider {
  private ai: GoogleGenAI;

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
      // Individual env vars (Vercel deployment)
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
    // IMPORTANT: Use "global" for new Gemini 3.x models - us-central1 gives 404
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

    const googleAuthOptions = credentials ? { credentials } : undefined;

    // Diagnostic logging (visible in Vercel Function Logs)
    console.log("[Provider Init - @google/genai]", {
      hasCredentials: !!credentials,
      credentialsType: credentials?.type || "none",
      credentialsEmail: credentials?.client_email ? credentials.client_email.slice(0, 15) + "..." : "none",
      projectId: projectId || "auto-detect",
      location,
    });

    // Initialize the NEW @google/genai SDK with Vertex AI mode
    this.ai = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: location,
      googleAuthOptions,
    });
  }

  /**
   * Get fallback model names to try if the primary model fails
   */
  private getFallbackModels(primaryModel: string): string[] {
    const models = [primaryModel];

    // Add preview variant
    if (!primaryModel.includes("-preview")) {
      models.push(`${primaryModel}-preview`);
    }

    // Add stable fallbacks
    if (primaryModel.includes("pro")) {
      models.push("gemini-2.5-pro", "gemini-2.5-pro-preview", "gemini-2.0-pro", "gemini-1.5-pro");
    } else {
      models.push("gemini-2.5-flash", "gemini-2.5-flash-preview", "gemini-2.0-flash", "gemini-1.5-flash");
    }

    // Remove duplicates
    return [...new Set(models)];
  }

  /**
   * Generate text using the new @google/genai SDK with Vertex AI backend
   */
  async generateText(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number; tools?: any[] } = {}
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-2.5-flash");
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`[GenAI] Trying model: ${modelName}`);

        // Build the contents string from messages
        const prompt = messages.map(m => {
          if (m.role === "system") return `[System Instructions]: ${m.content}`;
          return m.content;
        }).join("\n\n");

        // Build config
        const config: any = {
          temperature: options.temperature ?? 0.7,
        };

        // Add Google Search tool if requested
        if (options.tools) {
          const hasSearchTool = options.tools.some((t: any) => t.googleSearchRetrieval || t.google_search_retrieval);
          if (hasSearchTool) {
            config.tools = [{ googleSearch: {} }];
          }
        }

        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config,
        });

        const text = response.text;
        if (text) {
          console.log(`[GenAI] ✅ Success with model: ${modelName} (${text.length} chars)`);
          return text;
        }

        console.warn(`[GenAI] Model ${modelName} returned empty response, trying next...`);
      } catch (err: any) {
        lastError = err;
        console.warn(`[GenAI] ❌ ${modelName} failed:`, err?.message?.slice(0, 200) || err);
      }
    }

    throw lastError || new Error("All model attempts failed.");
  }

  /**
   * Generate structured JSON output
   */
  async generateJSON(
    messages: { role: string; content: string }[],
    options: { modelName?: string; temperature?: number } = {}
  ): Promise<any> {
    const candidateModels = this.getFallbackModels(options.modelName || "gemini-2.5-flash");
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`[GenAI JSON] Trying model: ${modelName}`);

        const prompt = messages.map(m => {
          if (m.role === "system") return `[System Instructions]: ${m.content}`;
          return m.content;
        }).join("\n\n");

        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: options.temperature ?? 0.1,
            responseMimeType: "application/json",
          },
        });

        const text = response.text;
        if (!text) {
          console.warn(`[GenAI JSON] Model ${modelName} returned empty, trying next...`);
          continue;
        }

        // Clean and parse JSON robustly
        let cleaned = text.trim();
        
        // Find the first { or [ and the last } or ]
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
        
        const parsed = JSON.parse(cleaned);
        console.log(`[GenAI JSON] ✅ Success with model: ${modelName}`);
        return parsed;
      } catch (err: any) {
        lastError = err;
        console.warn(`[GenAI JSON] ❌ ${modelName} failed:`, err?.message?.slice(0, 200) || err);
      }
    }

    throw lastError || new Error("All JSON generation attempts failed.");
  }
}
