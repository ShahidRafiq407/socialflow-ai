import { VertexAIProvider } from "../providers/VertexAIProvider";

// The primary models mapping based on the Vertex AI Migration Plan
export const MODELS = {
  TREND_RESEARCHER: "gemini-3.6-flash",
  COMPETITOR_ANALYST: "gemini-3.5-flash-lite",
  CONTENT_CREATOR: "gemini-3.1-pro",
  CEO_SUPERVISOR: "gemini-3.1-pro",
  ARTICLE_GENERATOR: "gemini-3.1-pro",
  VISUALIZER: "gemini-3.1-flash-image",
  VIDEO: "veo-3.1-fast-generate-preview",
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
    
    // For tools (like Google Search Grounding), we check if the caller passed tools in options
    const generateOptions: any = {
      modelName: currentWorkingModel,
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
        const content = await vertexProvider.generateJSON(messages, {
          modelName: currentWorkingModel,
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
