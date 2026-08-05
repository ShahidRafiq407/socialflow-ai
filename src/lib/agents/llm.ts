import { GroqProvider } from "../providers/GroqProvider";

// The primary model the user requested
const PRIMARY_MODEL = "llama-3.3-70b-versatile";
export const NVIDIA_MODELS = [PRIMARY_MODEL]; // Keeping array for backwards compatibility

let currentWorkingModel = PRIMARY_MODEL;

export function getWorkingModelName() {
  return currentWorkingModel;
}

export function setWorkingModelName(name: string) {
  currentWorkingModel = name;
}

// Instantiate our custom Groq Provider
const groqProvider = new GroqProvider();

/**
 * Adapter to translate LangChain messages to Groq API messages
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
    
    // Some messages might be passed directly as strings in raw implementations
    let content = typeof msg === "string" ? msg : (msg.content || JSON.stringify(msg));
    
    return { role, content };
  });
}

class GroqLLMAdapter {
  async invoke(input: any[], options?: any) {
    const messages = translateMessages(input);
    const content = await groqProvider.generateText(messages, {
      modelName: currentWorkingModel,
      temperature: 0.7,
      maxRetries: 3,
    });
    
    // Return standard Langchain-like response object
    return { content };
  }

  withStructuredOutput(schema: any, config?: any) {
    return {
      invoke: async (input: any[], options?: any) => {
        const messages = translateMessages(input);
        const content = await groqProvider.generateJSON(messages, {
          modelName: currentWorkingModel,
          temperature: 0.1,
          maxRetries: 3,
        });
        
        return { content };
      }
    };
  }
}

export const llm = new GroqLLMAdapter();

export const ceoLlm = {
  invoke: async (input: any[], options?: any) => {
    const messages = translateMessages(input);
    const content = await groqProvider.generateText(messages, {
      modelName: "llama-3.3-70b-versatile",
      temperature: 0.3,
      maxRetries: 3,
    });
    
    return { content };
  }
};
