import Groq from "groq-sdk";

export class GroqProvider {
  private defaultModel = "llama-3.3-70b-versatile";

  private getClient(): Groq {
    const apiKey = process.env.GROQ_API_KEY || "";
    return new Groq({ apiKey });
  }

  /**
   * Universal Generate Text Method
   */
  async generateText(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, options);
  }

  /**
   * Specialized Content Methods
   */
  async generateArticle(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, options);
  }

  async generateSEOArticle(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, options);
  }

  async generateSocialPost(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, options);
  }

  async rewrite(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, options);
  }

  async summarize(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, options);
  }

  async translate(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, options);
  }

  /**
   * JSON Mode Output
   */
  async generateJSON(messages: any[], options?: any) {
    return this.executeChatCompletion(messages, {
      ...options,
      response_format: { type: "json_object" },
    });
  }

  /**
   * Stream Output
   */
  async streamText(messages: any[], options?: any) {
    const model = options?.modelName || this.defaultModel;
    const stream = await this.getClient().chat.completions.create({
      messages,
      model,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });

    return stream;
  }

  /**
   * Core Execution Engine (Handles Retry, Timeout, Errors)
   */
  private async executeChatCompletion(messages: any[], options?: any) {
    const model = options?.modelName || this.defaultModel;
    const maxRetries = options?.maxRetries ?? 3;
    const timeout = options?.timeout ?? 30000;

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const response = await this.getClient().chat.completions.create(
          {
            messages,
            model,
            temperature: options?.temperature ?? 0.7,
            response_format: options?.response_format,
            tools: options?.tools,
            tool_choice: options?.tool_choice,
          },
          {
            timeout: timeout,
            maxRetries: 0, // We handle retries manually for better logging
          }
        );

        return response.choices[0]?.message?.content || "";
      } catch (error: any) {
        attempt++;
        if (attempt > maxRetries) {
          console.error(`[GroqProvider] Failed after ${maxRetries} attempts:`, error.message);
          throw error;
        }
        
        // Rate limit handling (HTTP 429)
        if (error.status === 429) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(`[GroqProvider] Rate limited. Retrying in ${waitTime}ms...`);
          await new Promise((res) => setTimeout(res, waitTime));
        } else {
          console.warn(`[GroqProvider] Error: ${error.message}. Retrying...`);
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
    }
  }
}
