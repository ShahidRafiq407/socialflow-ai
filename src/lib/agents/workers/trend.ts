import { AgentStateType } from "../graph/state";
import { llm } from "../llm";
import { HumanMessage } from "@langchain/core/messages";
import { fetchLiveTrendingNews } from "@/actions/trends";

export async function trendResearcherNode(state: AgentStateType) {
  console.log("--- [Trend Agent] Researching Live Trends ---");
  
  if (!state.brandDNA) {
    throw new Error("Brand DNA is required for Trend Research.");
  }

  // Fetch live trends based on industry
  let rawTrends = "";
  try {
    const liveTrendsResponse = await fetchLiveTrendingNews(state.brandDNA.industry || "Marketing");
    if (liveTrendsResponse && liveTrendsResponse.trends && liveTrendsResponse.trends.length > 0) {
      rawTrends = liveTrendsResponse.trends.map(t => `- Title: ${t.title}\n  Source: ${t.source}\n  URL: ${t.link}\n  Snippet: ${t.snippet}`).join("\n\n");
    }
  } catch (err) {
    console.error("Failed to fetch live trends:", err);
  }

  const prompt = `You are a Trend Researcher Agent.
Analyze the following brand identity and current live industry news to find 1-2 highly relevant, viral trends that this brand can capitalize on today.

BRAND IDENTITY:
${JSON.stringify(state.brandDNA, null, 2)}

LIVE INDUSTRY NEWS EXPLORED:
${rawTrends || "No live news available right now."}

Output a detailed text summary of the best trending topics the brand should talk about in their next social media post.
CRITICAL: You MUST explicitly mention the sources and websites you analyzed from the LIVE INDUSTRY NEWS EXPLORED section above (e.g. "I explored TechCrunch and Forbes and found..."). Do not output JSON. Just a clear, detailed text description of your research.`;

  const res = await llm.invoke([new HumanMessage(prompt)]);
  
  let sources: { title: string; link: string; source: string }[] = [];
  try {
    const liveTrendsResponse = await fetchLiveTrendingNews(state.brandDNA.industry || "Marketing");
    if (liveTrendsResponse?.trends) {
      sources = liveTrendsResponse.trends.map((t: any) => ({ title: t.title, link: t.link, source: t.source }));
    }
  } catch (e) {}

  return {
    trendData: (res.content?.toString() || ""),
    trendSources: sources,
  };
}
