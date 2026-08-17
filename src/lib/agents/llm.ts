import { VertexAIProvider } from "../providers/VertexAIProvider";

// Centralized ELITE-tier Google Vertex AI model mapping
// Removed all flash, lite, and low-scale constraints to guarantee production depth
export const MODELS = {
  BRAND_ANALYST: "none", // Database processing

  // Premium frontier intelligence text infrastructure from your exact GCP project models list
  TREND_RESEARCHER: process.env.MODEL_TREND_RESEARCHER || "gemini-3.6-flash",
  COMPETITOR_ANALYST: process.env.MODEL_COMPETITOR_ANALYST || "gemini-3.5-flash-lite",
  CONTENT_CREATOR: process.env.MODEL_CONTENT_CREATOR || "gemini-3.1-pro-preview",
  CEO_SUPERVISOR: process.env.MODEL_CEO_AUDITOR || "gemini-3.1-pro-preview", // Exact model string from your Google Usage Dashboard
  ARTICLE_GENERATOR: process.env.MODEL_CONTENT_CREATOR || "gemini-3.1-pro-preview",

  // Master Grade Multimedia Pipelines (Maximum structural clarity)
  VISUALIZER: process.env.MODEL_IMAGE_GENERATOR || "gemini-3-pro-image",
  // "gemini-omni-flash-preview" was decommissioned by Google (404 Publisher model
  // not found) — Veo 3.1 preview is the current video model; generateRealVideo
  // falls back to stable Veo GA models automatically.
  VIDEO: process.env.MODEL_VIDEO_GENERATOR || "veo-3.1-generate-preview",

  SLIDE_REGENERATOR: process.env.MODEL_COMPETITOR_ANALYST || "gemini-3.1-pro-preview",
};

let currentWorkingModel = MODELS.CONTENT_CREATOR;

export function getWorkingModelName() {
  return currentWorkingModel;
}

export function setWorkingModelName(name: string) {
  currentWorkingModel = name;
}

export const vertexProvider = new VertexAIProvider();

function translateMessages(langchainMessages: any[]): any[] {
  return langchainMessages.map((msg) => {
    let role = "user";
    if (msg._getType) {
      const type = msg._getType();
      if (type === "system") role = "system";
      if (type === "ai") role = "assistant";
    } else if (msg.role) {
      role = msg.role;
    }
    let content = typeof msg === "string" ? msg : (msg.content || JSON.stringify(msg));
    return { role, content };
  });
}

class VertexLLMAdapter {
  async invoke(input: any[], options?: any) {
    const messages = translateMessages(input);
    const modelName = options?.modelName || currentWorkingModel;

    const generateOptions: any = {
      modelName,
      temperature: options?.temperature ?? 0.4, // Deep contextual focus
    };

    if (options?.tools) {
      generateOptions.tools = options.tools;
    }

    const content = await vertexProvider.generateText(messages, generateOptions);
    return { content };
  }

  withStructuredOutput(schema: any, config?: any) {
    return {
      invoke: async (input: any[], options?: any) => {
        const messages = translateMessages(input);
        const modelName = options?.modelName || currentWorkingModel;
        const content = await vertexProvider.generateJSON(messages, {
          modelName,
          temperature: 0.1, // Strict layout compliance
        });
        return { content };
      },
    };
  }
}

export const llm = new VertexLLMAdapter();

export const ceoLlm = {
  invoke: async (input: any[], options?: any) => {
    const messages = translateMessages(input);
    const content = await vertexProvider.generateText(messages, {
      modelName: MODELS.CEO_SUPERVISOR,
      temperature: 0.2,
    });
    return { content };
  },
};
