import { AgentStateType } from "../graph/state";
import { llm, MODELS } from "../llm";
import { HumanMessage } from "@langchain/core/messages";

export async function trendResearcherNode(state: AgentStateType) {
  console.log("--- [Trend Agent] Researching Live Trends via Google Search Grounding ---");
  
  if (!state.brandDNA) {
    throw new Error("Brand DNA is required for Trend Research.");
  }

  const prompt = `You are an expert Trend Researcher Agent.
Your job is to find the absolute latest, breaking news and trends relevant to the industry of the brand below.

BRAND IDENTITY:
${JSON.stringify(state.brandDNA, null, 2)}

INSTRUCTIONS:
1. Use your built-in Google Search capability to find breaking news, viral topics, or emerging trends related to this brand's industry from the last 24-48 hours.
2. Output a detailed text summary of the best trending topics the brand should talk about in their next social media post.
3. CRITICAL: You MUST explicitly mention the sources and websites you analyzed and cite them properly. Do not output JSON. Just a clear, detailed text description of your research.`;

  // We invoke the LLM with the Google Search Retrieval tool enabled
  const res = await llm.invoke([new HumanMessage(prompt)], {
    modelName: MODELS.TREND_RESEARCHER,
    tools: [{ googleSearchRetrieval: {} }]
  });
  
  // Since we are using native grounding, the sources are embedded in the response or we can just extract them from the text.
  // The system's output will include citations.
  return {
    trendData: (res.content?.toString() || ""),
    trendSources: [], // The text will contain the citations directly now.
  };
}
