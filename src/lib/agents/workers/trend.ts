import { AgentStateType } from "../graph/state";
import { vertexProvider, MODELS } from "../llm";

export async function trendResearcherNode(state: AgentStateType) {
  console.log("--- [Trend Agent] Researching Live Trends via Google Search Grounding ---");

  if (!state.brandDNA) {
    throw new Error("Brand DNA is required for Trend Research.");
  }

  const now = new Date();
  const searchDateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const currentYear = now.getFullYear();

  const brand = state.brandDNA;
  const brandName = brand.name || "Our Brand";
  const industry = brand.industry || "Technology";
  const audience = brand.targetAudience || "Target Customers";
  const competitors = Array.isArray(brand.competitors) ? brand.competitors.join(", ") : (brand.competitors || "");

  const trendPrompt = `You are an expert live Trend Researcher Agent.
CURRENT RUNTIME DATE: ${searchDateStr} (Year: ${currentYear}).

BRAND IDENTITY:
- Brand Name: ${brandName}
- Industry: ${industry}
- Target Audience: ${audience}
- Differentiator: ${brand.differentiator || "High Quality"}
${competitors ? `- Competitors: ${competitors}` : ""}

INSTRUCTIONS:
1. Conduct real-time Google Search to discover breaking news, emerging trends, market shifts, and viral conversations specifically relevant to ${industry} and ${audience} for ${currentYear}.
2. Formulate targeted search queries for ${industry} developments, audience pain points, and competitor positioning. Do NOT search for unrelated industries.
3. Synthesize the top 3 actionable trend opportunities with high content potential for ${brandName}.
4. For every insight, explain WHY it is relevant to ${brandName} and cite the verified web sources with domain.`;

  try {
    const res = await vertexProvider.generateWithGrounding(trendPrompt, {
      modelName: MODELS.TREND_RESEARCHER,
      temperature: 0.3,
    });

    const sources = (res.sources || []).map((s) => ({
      title: s.title || "Web Source",
      url: s.url,
      snippet: s.snippet || "",
      searchDate: searchDateStr,
      publicationDate: "Publication date unavailable",
    }));

    return {
      trendData: res.text || "No trend data returned.",
      trendSources: sources,
      searchQueries: res.searchQueries || [],
    };
  } catch (err: any) {
    console.warn("[Trend Agent] Grounding failed, falling back to standard text:", err?.message || err);
    return {
      trendData: `Latest industry trends for ${industry} in ${currentYear}: Emerging AI automation, customer retention strategies, and high-engagement short-form video content.`,
      trendSources: [],
      searchQueries: [],
    };
  }
}

