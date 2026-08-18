import { vertexProvider, MODELS } from "../llm";
import { getTool, describeTools, ToolContext } from "./tools";
import { recallMemories, saveMemory, MemoryFact } from "../memory";
import { getWorkspaceBrandDNA } from "@/actions/brand";

// ============================================================================
// MARKETING BRAIN ORCHESTRATOR
// plan → execute (parallel) → synthesize → remember
// A REAL agent workflow: the planner decides which tools/agents to invoke, the
// executor runs them against live data, and the synthesizer writes the answer.
// ============================================================================

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BrainInput {
  prompt: string;
  workspaceId: string;
  userId: string;
  history?: ChatMessage[];
  uploadedFiles?: { name: string; content: string; type: string }[];
  onEvent?: (event: Record<string, any>) => void;
}

export interface ToolCallResult {
  tool: string;
  args: any;
  result: any;
}

export interface BrainResult {
  answer: string;
  toolCalls: ToolCallResult[];
  memoryRecalled: MemoryFact[];
}

async function planActions(
  prompt: string,
  context: string
): Promise<{ reasoning: string; actions: { tool: string; args: any }[] }> {
  const sys = `You are the Marketing Brain orchestrator of an AI marketing SaaS.
You control a set of tools that read/write real data and search the live internet.

AVAILABLE TOOLS:
${describeTools()}

${context}

INSTRUCTIONS:
- Decide which tool(s) to call to fulfill the user's request. Prefer the fewest necessary tools.
- Independent tools should ALL be listed so they run in parallel.
- If no tool is needed (a simple question/chat), return an empty actions array.
- Always ground factual/time-sensitive requests in search_web or fetch_serp.
- Return ONLY valid JSON (no markdown) in this exact shape:
{ "reasoning": "short plan", "actions": [ { "tool": "tool_name", "args": { ... } } ] }`;

  const res = await vertexProvider.generateJSON(
    [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
    { modelName: MODELS.ORCHESTRATOR, temperature: 0.1 }
  );

  const actions = Array.isArray(res?.actions) ? res.actions : [];
  return {
    reasoning: res?.reasoning || "",
    actions: actions
      .filter((a: any) => a && typeof a.tool === "string")
      .map((a: any) => ({ tool: a.tool, args: a.args || {} })),
  };
}

export async function runBrain(input: BrainInput): Promise<BrainResult> {
  const { prompt, workspaceId, userId, history = [], uploadedFiles = [], onEvent } = input;

  const ctx: ToolContext = { workspaceId, userId, uploadedFiles };

  // 1. Recall long-term memory (semantic)
  onEvent?.({ type: "memory" });
  const memory = await recallMemories(workspaceId, prompt, 6);
  onEvent?.({ type: "memory_done", count: memory.length });

  // 2. Load brand DNA for grounding
  let brand: any = null;
  try {
    brand = await getWorkspaceBrandDNA(workspaceId);
  } catch {
    brand = null;
  }

  const historyBlock = history
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const memoryBlock = memory.length
    ? `\nRELEVANT LONG-TERM MEMORY:\n${memory.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const brandBlock = brand ? `\nBRAND DNA:\n${JSON.stringify(brand)}` : "";

  const filesBlock = uploadedFiles.length
    ? `\nUPLOADED ATTACHMENTS (${uploadedFiles.length}):\n${uploadedFiles.map((f) => `- ${f.name} (${f.type || "file"})`).join("\n")}`
    : "";

  const context = `\nCONVERSATION HISTORY:\n${historyBlock || "(none)"}${memoryBlock}${brandBlock}${filesBlock}`;

  // 3. Plan
  onEvent?.({ type: "planning" });
  const plan = await planActions(prompt, context);
  onEvent?.({ type: "reasoning", text: plan.reasoning || "Executing tasks" });

  // 4. Execute tools in parallel
  const toolCalls: ToolCallResult[] = [];
  if (plan.actions.length > 0) {
    const settled = await Promise.allSettled(
      plan.actions.map(async (action) => {
        const tool = getTool(action.tool);
        if (!tool) return { tool: action.tool, args: action.args, result: { error: "Unknown tool" } };
        onEvent?.({ type: "tool_start", tool: action.tool, args: action.args });
        const toolCtx: ToolContext = {
          ...ctx,
          onProgress: (progressMsg: string) => {
            onEvent?.({ type: "tool_progress", tool: action.tool, progress: progressMsg });
          },
        };
        try {
          const result = await tool.execute(action.args, toolCtx);
          onEvent?.({ type: "tool_end", tool: action.tool, result });
          return { tool: action.tool, args: action.args, result };
        } catch (err: any) {
          const msg = err?.message || "Tool error";
          onEvent?.({ type: "tool_end", tool: action.tool, result: { error: msg } });
          return { tool: action.tool, args: action.args, result: { error: msg } };
        }
      })
    );
    for (const s of settled) {
      toolCalls.push(s.status === "fulfilled" ? s.value : { tool: "unknown", args: {}, result: { error: "failed" } });
    }
  }

  // 5. Synthesize final answer
  onEvent?.({ type: "synthesizing" });
  const answer = await synthesize(prompt, toolCalls, memory, brand);

  // 6. Remember (best-effort)
  remember(workspaceId, prompt, answer).catch((e) => console.warn("[Brain] remember failed:", e));

  onEvent?.({ type: "done", answer });

  return { answer, toolCalls, memoryRecalled: memory };
}

async function synthesize(
  prompt: string,
  toolCalls: ToolCallResult[],
  memory: MemoryFact[],
  brand: any
): Promise<string> {
  const toolBlock =
    toolCalls.length === 0
      ? "(no tools were needed)"
      : toolCalls
          .map((c) => `[TOOL ${c.tool} RESULT]\n${JSON.stringify(c.result)?.slice(0, 10000)}`)
          .join("\n\n");

  const memoryBlock = memory.length
    ? `\nRemembered context about this user/brand:\n${memory.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const sys = `You are the Marketing Brain — the chief autonomous AI head of an AI marketing SaaS.
Write the final, direct, executive, human answer to the user in their language (match the user's language — if they write in Roman Urdu, reply in Roman Urdu; otherwise English).
Base your answer strictly on the real tool results below. Be concrete and cite real data.
If an image was generated (has a url), embed or link it in markdown format (e.g. ![Generated Visual](url)) and confirm it is saved to Content Library.
If a video or reel was generated, provide the link and confirm it is saved.
If a post was drafted or scheduled, provide the platform, content summary, and confirmation.
If a tool returned an error or empty result, explain what happened honestly.
${brand ? `\nBRAND DNA (for tone/context):\n${JSON.stringify(brand)}` : ""}${memoryBlock}`;

  const res = await vertexProvider.generateText(
    [
      { role: "system", content: sys },
      { role: "user", content: `USER REQUEST:\n${prompt}\n\nTOOL RESULTS:\n${toolBlock}\n\nNow write your final answer.` },
    ],
    { modelName: MODELS.ORCHESTRATOR, temperature: 0.4 }
  );

  return res || "I couldn't generate a response.";
}

async function remember(workspaceId: string, prompt: string, answer: string): Promise<void> {
  const res = await vertexProvider.generateJSON(
    [
      {
        role: "system",
        content:
          'From the exchange below, extract up to 2 durable facts/preferences about the user or their brand worth remembering long-term. Return JSON: { "facts": [{"category": "brand|preference|decision|note", "content": "..."}] }. If nothing is worth remembering, return { "facts": [] }.',
      },
      { role: "user", content: `User: ${prompt}\nAssistant: ${answer.slice(0, 1500)}` },
    ],
    { modelName: MODELS.ORCHESTRATOR, temperature: 0.1 }
  );
  const facts = Array.isArray(res?.facts) ? res.facts : [];
  for (const f of facts) {
    if (f && f.content && f.category) {
      await saveMemory(workspaceId, f.category, f.content);
    }
  }
}
