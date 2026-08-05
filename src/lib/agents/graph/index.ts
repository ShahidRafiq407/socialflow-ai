import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import { brandAnalystNode } from "../workers/brand";
import { trendResearcherNode } from "../workers/trend";
import { competitorAnalystNode } from "../workers/competitor";
import { contentWorkerNode } from "../workers/content";
import { visualizerCreatorNode } from "../workers/visualizer";
import { supervisorNode } from "../ceo/supervisor";

const builder = new StateGraph(AgentState)
  .addNode("brandAnalyst", brandAnalystNode)
  .addNode("trendResearcher", trendResearcherNode)
  .addNode("competitorAnalyst", competitorAnalystNode)
  .addNode("contentCreator", contentWorkerNode)
  .addNode("visualizerCreator", visualizerCreatorNode)
  .addNode("supervisor", supervisorNode)
  .addEdge(START, "brandAnalyst")
  .addEdge("brandAnalyst", "trendResearcher")
  .addEdge("trendResearcher", "competitorAnalyst")
  .addEdge("competitorAnalyst", "contentCreator")
  .addEdge("contentCreator", "visualizerCreator")
  .addEdge("visualizerCreator", "supervisor")
  .addConditionalEdges(
    "supervisor",
    (state: AgentStateType) => {
      if (state.nextWorker === "FINISH") {
        return END;
      }
      return END; // For safety, we always end in this version unless we build retry loops
    },
    {
      [END]: END,
    }
  );

export const marketingGraph = builder.compile();
