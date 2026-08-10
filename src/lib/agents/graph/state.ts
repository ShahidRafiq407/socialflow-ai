import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  workspaceId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  platforms: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  contentTypes: Annotation<Record<string, string[]>>({
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  }),
  
  // Agent Data Payloads
  brandDNA: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  trendData: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  trendSources: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  competitorData: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  
  // Final CEO Approved Payload
  campaignPayload: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  
  // Routing
  nextWorker: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  ceoVerdict: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
});

export type AgentStateType = typeof AgentState.State;
