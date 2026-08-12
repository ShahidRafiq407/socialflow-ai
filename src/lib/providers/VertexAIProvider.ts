import { VertexAI, GenerateContentRequest } from "@google-cloud/vertexai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

export class VertexAIProvider {
  private vertexai: VertexAI | null = null;
  private googleAI: GoogleGenerativeAI | null = null;

  constructor() {
    // 1. Initialize Google AI Studio SDK if GEMINI_API_KEY is available
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        this.googleAI = new GoogleGenerativeAI(apiKey);
      } catch (e) {
        console.warn("[Provider] Failed to initialize GoogleGenerativeAI with GEMINI_API_KEY:", e);
      }
    }

    // 2. Resolve Vertex AI credentials from multiple sources
    let credentials: any = null;

    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      } catch (e) {
        console.error("Failed to parse GOOGLE_CREDENTIALS_JSON string.");
      }
    } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      // Individual env vars (Vercel) - MUST include 'type' and 'token_uri' for google-auth-library
      credentials = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID,
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        token_uri: "https://oauth2.googleapis.com/token",
        universe_domain: "googleapis.com",
      };
    } else {
      const localPath = path.resolve(process.cwd(), "google-credentials.json");
      if (fs.existsSync(localPath)) {
        try {
          credentials = JSON.parse(fs.readFileSync(localPath, "utf8"));
        } catch (e) {
          console.error("Failed to read local google-credentials.json file.");
        }
      }
    }

    const projectId = credentials?.project_id || process.env.GOOGLE_CLOUD_PROJECT_ID || "project-6191674b-f452-4f72-903";
    const googleAuthOptions = credentials ? { credentials } : undefined;

    // Diagnostic logging (visible in Vercel Function Logs)
    console.log("[Provider Init]", {
      hasGeminiApiKey: !!this.googleAI,
      hasCredentials: !!credentials,
      credentialsType: credentials?.type || "none",
      credentialsEmail: credentials?.client_email ? credentials.client_email.slice(0, 15) + "..." : "none",
      projectId,
      location: process.env.GOOGLE_CLOUD_LOCATION || "global",
    });

    try {
      const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
      this.vertexai = new VertexAI({
        project: projectId,
        location: location,
        googleAuthOptions,
      });
    } catch (e) {
      console.warn("[Provider] Failed to initialize VertexAI client:", e);
    }
  }

  /**
   * Helper to resolve candidate model names prioritizing exact preview strings
   */
  private getFallbackModels(requestedModel: string): string[] {
    const list: string[] = [];

    // 1. If requested model doesn't have -preview, add the -preview version FIRST (e.g. gemini-3.1-pro-preview)
    if (!requestedModel.endsWith("-preview")) {
      list.push(`${requestedModel}-preview`);
    }

    // 2. Add exact requested model
    list.push(requestedModel);

    // 3. Add latest Gemini 3 / 2.5 preview & GA variations in order of recency
    if (requestedModel.includes("3.1-pro") || requestedModel.includes("pro")) {
      list.push(
        "gemini-3.1-pro-preview",
        "gemini-3.1-pro",
        "gemini-3.0-pro-preview",
        "gemini-2.5-pro-preview",
        "gemini-2.5-pro",
        "gemini-1.5-pro"
      );
    } else if (requestedModel.includes("flash")) {
      list.push(
        "gemini-3.6-flash-preview",
        "gemini-3.6-flash",
        "gemini-3.5-flash-preview",
        "gemini-2.5-flash-preview",
        "gemini-2.5-flash",
        "gemini-1.5-flash"
      );
    } else {
      list.push("gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro");
    }

    return Array.from(new Set(list));
  }

  private formatMessages(messages: { role: string; content: string }[]) {
    let systemInstruction = "";
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction += msg.content + "\n";
      } else {
        const role = msg.role === "assistant" ? "model" : "user";
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }

    return { systemInstruction, contents };
  }

  async generateText(
    messages: { role: string; content: string }[],
    options: { modelName: string; temperature?: number; tools?: any[] }
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName);
    let lastError: any = null;

    // Try Google AI Studio first if available
    if (this.googleAI) {
      for (const modelName of candidateModels) {
        try {
          const { systemInstruction, contents } = this.formatMessages(messages);
          const model = this.googleAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemInstruction || undefined,
            generationConfig: { temperature: options.temperature ?? 0.7 },
          });

          // Convert contents format for GoogleGenerativeAI
          const response = await model.generateContent({ contents });
          const text = response.response.text();
          if (text) return text;
        } catch (err: any) {
          lastError = err;
          console.warn(`[GoogleAI Fallback] ${modelName} failed, trying next...`, err?.message || err);
        }
      }
    }

    // Try Vertex AI
    if (this.vertexai) {
      for (const modelName of candidateModels) {
        try {
          const { systemInstruction, contents } = this.formatMessages(messages);
          const generativeModel = this.vertexai.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: options.temperature ?? 0.7,
            },
            systemInstruction: systemInstruction ? { role: "system", parts: [{ text: systemInstruction }] } : undefined,
          });

          const request: GenerateContentRequest = { contents };
          if (options.tools) request.tools = options.tools;

          const response = await generativeModel.generateContent(request);
          const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        } catch (err: any) {
          lastError = err;
          console.warn(`[VertexAI Fallback] ${modelName} failed, trying next model...`, err?.message || err);
        }
      }
    }

    throw lastError || new Error("All LLM model attempts failed.");
  }

  async generateJSON(
    messages: { role: string; content: string }[],
    options: { modelName: string; temperature?: number }
  ): Promise<string> {
    const candidateModels = this.getFallbackModels(options.modelName);
    let lastError: any = null;

    // Try Google AI Studio first if available
    if (this.googleAI) {
      for (const modelName of candidateModels) {
        try {
          const { systemInstruction, contents } = this.formatMessages(messages);
          const model = this.googleAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemInstruction || undefined,
            generationConfig: {
              temperature: options.temperature ?? 0.1,
              responseMimeType: "application/json",
            },
          });

          const response = await model.generateContent({ contents });
          const text = response.response.text();
          if (text) return text;
        } catch (err: any) {
          lastError = err;
          console.warn(`[GoogleAI JSON Fallback] ${modelName} failed:`, err?.message || err);
        }
      }
    }

    // Try Vertex AI
    if (this.vertexai) {
      for (const modelName of candidateModels) {
        try {
          const { systemInstruction, contents } = this.formatMessages(messages);
          const generativeModel = this.vertexai.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: options.temperature ?? 0.1,
              responseMimeType: "application/json",
            },
            systemInstruction: systemInstruction ? { role: "system", parts: [{ text: systemInstruction }] } : undefined,
          });

          const request: GenerateContentRequest = { contents };
          const response = await generativeModel.generateContent(request);
          const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        } catch (err: any) {
          lastError = err;
          console.warn(`[VertexAI JSON Fallback] ${modelName} failed:`, err?.message || err);
        }
      }
    }

    throw lastError || new Error("All JSON generation attempts failed.");
  }

  async generateImage(prompt: string, options?: { modelName?: string; aspectRatio?: string }) {
    try {
      if (this.vertexai) {
        const generativeModel = this.vertexai.getGenerativeModel({
          model: options?.modelName || "imagen-3.0-generate-001",
        });

        const response = await generativeModel.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        return response.response;
      }
      return null;
    } catch (error) {
      console.error("VertexAI Image Error:", error);
      throw error;
    }
  }
}
