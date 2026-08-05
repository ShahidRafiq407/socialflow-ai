import { AgentStateType } from "../graph/state";
import { llm } from "../llm";
import { HumanMessage } from "@langchain/core/messages";

export async function competitorAnalystNode(state: AgentStateType) {
  console.log("--- [Competitor Agent] Analyzing Market Gaps ---");

  const prompt = `You are a Competitor Analyst Agent.
Your job is to figure out how our brand can stand out from competitors while talking about the current trends.

BRAND IDENTITY:
${JSON.stringify(state.brandDNA, null, 2)}

CURRENT TRENDS WE WANT TO TARGET:
${state.trendData}

What are competitors likely doing wrong or doing boringly?
Give me a "Unique Angle" or "Differentiator" that our Content Creator can use to make our posts go viral instead of looking like everyone else.
Keep it to 2-3 sentences max. Do not output JSON.`;

  const res = await llm.invoke([new HumanMessage(prompt)]);

  return {
    competitorData: (res.content?.toString() || ""),
  };
}
