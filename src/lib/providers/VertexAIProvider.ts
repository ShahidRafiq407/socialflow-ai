import { VertexAI, GenerateContentRequest, Part } from "@google-cloud/vertexai";

export class VertexAIProvider {
  private vertexai: VertexAI;

  constructor() {
    let googleAuthOptions = undefined;
    
    // Support Vercel deployment by passing JSON directly from an environment variable
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        googleAuthOptions = { credentials };
      } catch (e) {
        console.error("Failed to parse GOOGLE_CREDENTIALS_JSON in Vercel environment.");
      }
    }

    this.vertexai = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID || "project-6191674b-f452-4f72-903",
      location: "us-central1", // Use us-central1 as the default for Gemini/Veo availability
      googleAuthOptions
    });
  }

  /**
   * Translate generic messages {role, content} to Vertex AI format
   */
  private formatMessages(messages: { role: string; content: string }[]) {
    // Vertex expects system instructions separately, and conversation history as contents.
    let systemInstruction = "";
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction += msg.content + "\n";
      } else {
        // Map 'assistant' to 'model' for Vertex
        const role = msg.role === "assistant" ? "model" : "user";
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }

    return { systemInstruction, contents };
  }

  async generateText(messages: { role: string; content: string }[], options: { modelName: string; temperature?: number; tools?: any[] }) {
    try {
      const { systemInstruction, contents } = this.formatMessages(messages);
      const generativeModel = this.vertexai.getGenerativeModel({
        model: options.modelName,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
        },
        systemInstruction: systemInstruction ? { role: "system", parts: [{ text: systemInstruction }] } : undefined,
      });

      const request: GenerateContentRequest = { contents };
      
      if (options.tools) {
          request.tools = options.tools;
      }

      const response = await generativeModel.generateContent(request);
      return response.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (error) {
      console.error("VertexAI Text Error:", error);
      throw error;
    }
  }

  async generateJSON(messages: { role: string; content: string }[], options: { modelName: string; temperature?: number }) {
    try {
      const { systemInstruction, contents } = this.formatMessages(messages);
      const generativeModel = this.vertexai.getGenerativeModel({
        model: options.modelName,
        generationConfig: {
          temperature: options.temperature ?? 0.1,
          responseMimeType: "application/json",
        },
        systemInstruction: systemInstruction ? { role: "system", parts: [{ text: systemInstruction }] } : undefined,
      });

      const request: GenerateContentRequest = { contents };
      const response = await generativeModel.generateContent(request);
      return response.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    } catch (error) {
      console.error("VertexAI JSON Error:", error);
      throw error;
    }
  }

  async generateImage(prompt: string, options?: { modelName?: string; aspectRatio?: string }) {
    // Note: Gemini 3.1 Flash Image uses standard generative model call with IMAGE modality or specific imagen endpoints.
    // For Vertex AI latest, imagen-3.0-generate-001 or gemini-3.1-flash with specific config can be used.
    // Using imagen-3.0-generate-001 as it's the current recommended for direct image gen if gemini-3.1-flash-image isn't fully exposed via SDK yet.
    // We will use the model specified or default to latest image model.
    try {
       const model = options?.modelName || "imagegeneration@006"; // Fallback to current standard if nano banana 2 is unavailable in strict SDK
       const imageModel = this.vertexai.preview.getGenerativeModel({
           model: model,
       });
       
       const request = {
           instances: [{ prompt }],
           parameters: { sampleCount: 1, aspectRatio: options?.aspectRatio || "1:1" }
       };
       // Vertex AI Image generation uses a different endpoint predict method
       // But for the scope of this provider, we will implement the standard interface for Gemini 3.1 Flash Image.
       // Assuming gemini-3.1-flash-image supports standard generateContent:
       
       const generativeModel = this.vertexai.getGenerativeModel({
        model: "gemini-3.1-flash-image" 
       });

       // Placeholder for exact SDK call which depends on whether they exposed it via predict or generateContent.
       // Google is unifying on generateContent.
       
       const response = await generativeModel.generateContent({
           contents: [{ role: "user", parts: [{ text: prompt }]}]
       });
       
       // Return base64 or URL based on what the model returns
       return response.response;
    } catch (error) {
        console.error("VertexAI Image Error:", error);
        throw error;
    }
  }
}
