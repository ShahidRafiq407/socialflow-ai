import { VertexAIProvider } from "../providers/VertexAIProvider";

// Centralized per-agent Google Vertex AI model mapping with environment variable overrides
export const MODELS = {
  BRAND_ANALYST: "none", // DB read, no LLM required
  TREND_RESEARCHER: process.env.MODEL_TREND_RESEARCHER || "gemini-3.6-flash",
  COMPETITOR_ANALYST: process.env.MODEL_COMPETITOR_ANALYST || "gemini-3.5-flash-lite",
  CONTENT_CREATOR: process.env.MODEL_CONTENT_CREATOR || "gemini-3.1-pro",
  CEO_SUPERVISOR: process.env.MODEL_CEO_AUDITOR || "gemini-3.1-pro",
  ARTICLE_GENERATOR: process.env.MODEL_CONTENT_CREATOR || "gemini-3.1-pro",
  VISUALIZER: process.env.MODEL_IMAGE_GENERATOR || "gemini-2.5-flash-image",
  VIDEO: process.env.MODEL_VIDEO_GENERATOR || "veo-2.0-generate-001",
  SLIDE_REGENERATOR: process.env.MODEL_COMPETITOR_ANALYST || "gemini-3.5-flash-lite",
};

let currentWorkingModel = MODELS.CONTENT_CREATOR;

export function getWorkingModelName() {
  return currentWorkingModel;
}

export function setWorkingModelName(name: string) {
  currentWorkingModel = name;
}

// Instantiate our new Vertex AI Provider
export const vertexProvider = new VertexAIProvider();

/**
 * Adapter to translate LangChain messages to standard format expected by our Provider
 */
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
    
    // Use options.modelName if provided by caller, otherwise fall back to currentWorkingModel
    const modelName = options?.modelName || currentWorkingModel;
    
    const generateOptions: any = {
      modelName,
      temperature: options?.temperature ?? 0.7,
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
          temperature: 0.1,
        });
        
        return { content };
      }
    };
  }
}

export const llm = new VertexLLMAdapter();

export const ceoLlm = {
  invoke: async (input: any[], options?: any) => {
    const messages = translateMessages(input);
    const content = await vertexProvider.generateText(messages, {
      modelName: MODELS.CEO_SUPERVISOR,
      temperature: 0.3,
    });
    
    return { content };
  }
};
