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
  const now = new Date();
  const currentDateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentYear = now.getFullYear();

  const sys = `You are the Marketing Brain orchestrator of an AI marketing SaaS.
CURRENT DATE: ${currentDateStr} (Current Year: ${currentYear})

You control a set of tools that read/write real data and search the live internet.

AVAILABLE TOOLS:
${describeTools()}

${context}

INSTRUCTIONS:
- Decide which tool(s) to call to fulfill the user's request. Prefer the fewest necessary tools.
- DO NOT call any tool for simple greetings (e.g. "hi", "hello") or general conversational remarks.
- Independent tools should ALL be listed so they run in parallel.
- If no tool is needed (a simple question/chat), return an empty actions array.
- For search_web or fetch_serp queries: ALWAYS search for current ${currentYear} information, latest breaking trends, or real-time news. NEVER search for past years (like 2024 or 2023) unless the user explicitly requested historical info.
- If the user provides a reference image in attachments for a video or image request, specify sourceImage in generate_video or generate_image.
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

    // 3 & 4. Agentic execution loop: plan -> execute (parallel batch) -> observe -> re-plan.
  // A natural-language request describes a DEPENDENCY graph (e.g. "generate an image,
  // then schedule a post WITH that image URL"). The previous version picked the whole
  // plan in one LLM call and ran every tool in a single parallel batch, so a dependent
  // step could never receive an artifact (URL/id) produced by a sibling in the same batch.
  // This loop re-plans after every batch, feeding real tool results back in, so dependent
  // steps resolve in the correct order. It also re-emits `reasoning` per iteration (live
  // plan in the UI) and stops cleanly on a hard batch failure instead of spinning.
  const toolCalls: ToolCallResult[] = [];
  const resultLog: string[] = [];
  const MAX_ITERATIONS = 6;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    onEvent?.({ type: "planning" });
    const planCtx = resultLog.length
      ? `${context}\n\nOBSERVED TOOL RESULTS SO FAR:\n${resultLog.join("\n\n")}\n\n` +
        `Continue the workflow from these results. ONLY call tools required for the NEXT ` +
        `dependent step(s). Do NOT repeat a tool that already succeeded unless re-running ` +
        `is explicitly required by an unresolved dependency.`
      : context;
    const plan = await planActions(prompt, planCtx);
    onEvent?.({ type: "reasoning", text: plan.reasoning || `Planning step ${iter + 1}` });

    if (!plan.actions || plan.actions.length === 0) break;

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
      const r =
        s.status === "fulfilled"
          ? s.value
          : { tool: "unknown", args: {}, result: { error: "failed" } };
      toolCalls.push(r);
      const payload = typeof r.result === "string" ? r.result : JSON.stringify(r.result);
      resultLog.push(
        `[TOOL ${r.tool}]\nargs: ${JSON.stringify(r.args)}\nresult: ${payload?.slice(0, 10000)}`
      );
    }

    // Hard failure across the whole batch -> nothing to build on, stop re-planning.
    if (settled.length > 0 && settled.every((s) => s.status === "rejected")) break;
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
  const now = new Date();
  const currentDateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentYear = now.getFullYear();

  const toolBlock =
    toolCalls.length === 0
      ? "(no tools were needed)"
      : toolCalls
          .map((c) => `[TOOL ${c.tool} RESULT]\n${JSON.stringify(c.result)?.slice(0, 10000)}`)
          .join("\n\n");

  const memoryBlock = memory.length
    ? `\nRemembered context about this user/brand:\n${memory.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const sys = `You are the Marketing Brain — the elite executive AI CMO of an AI marketing SaaS.
CURRENT DATE: ${currentDateStr} (Year: ${currentYear}). Always speak in present terms for ${currentYear}.

FORMATTING & QUALITY RULES:
1. Multi-Day Plans & Content Calendars:
   - When asked for a posting plan (e.g. 5-day, 7-day, 10-day, 30-day plan), ALWAYS format it as a standard GitHub Markdown Table.
   - Strictly format tables with markdown pipe syntax:
     | Day | Platform | Content Pillar & Hook | Full Post Caption (English) | Suggested Visual / Format | Call to Action |
     |:---|:---|:---|:---|:---|:---|
     | **Day 1** | LinkedIn | AIoT & Edge Automation | *Ready-to-post English caption...* | 16:9 Architecture diagram | smbrobotic.com |
   - Never output raw bullet walls with messy asterisks for multi-day plans.
2. Social Media Posts & Copywriting:
   - All marketing post captions, hooks, and hashtags MUST be written in high-converting, professional English.
   - Conversational explanations, summaries, and executive advice can match the user's conversational language (e.g. Roman Urdu or English).
3. Generated Media:
   - If an image was generated (url present), render it as an embedded preview: ![Generated Image](url)
   - If a video or reel was generated, link it clearly and confirm it was saved to the Content Library and Media Assets.
   - If posts were drafted or scheduled, provide a clean summary table confirming platform, format, and status.
4. Grounded in Real Data:
   - Base facts, trends, and numbers strictly on the search tool results for ${currentYear}. Do NOT reference outdated 2023/2024 data as "current".
${brand ? `\nBRAND DNA (for tone/context):\n${JSON.stringify(brand)}` : ""}${memoryBlock}`;

  const res = await vertexProvider.generateText(
    [
      { role: "system", content: sys },
      { role: "user", content: `USER REQUEST:\n${prompt}\n\nTOOL RESULTS:\n${toolBlock}\n\nNow write your executive answer.` },
    ],
    { modelName: MODELS.ORCHESTRATOR, temperature: 0.3 }
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
