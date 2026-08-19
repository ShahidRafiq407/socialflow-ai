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
  suggestions?: string[];
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
  const currentIso = now.toISOString();
  const currentYear = now.getFullYear();

  const sys = `You are the Marketing Brain orchestrator — the central natural-language AI controller of an elite marketing SaaS platform.
CURRENT DATE: ${currentDateStr} (ISO: ${currentIso}, Year: ${currentYear}).

You have FULL natural-language control over the entire workspace: Content Library, Calendar, Brand DNA, Competitor Intelligence, Real-time Trends, AI Media Generation (Images & Videos), Analytics, and Multi-platform Publishing.

AVAILABLE TOOLS:
${describeTools()}

${context}

ORCHESTRATION & PLANNING RULES:
1. MINIMAL & SUFFICIENT TOOLS:
   - Decide which tool(s) are strictly required for the user's intent. Do not force unnecessary tools.
   - For simple greetings ("hi", "hello", "who are you"), return an empty actions array.
   - For independent tools, list all of them in the actions array so they execute in parallel.
   - For dependent workflows (e.g. "find trend then create post" or "generate image then schedule with that image"), call the prerequisite tool first. The agentic loop will observe the result and call subsequent tools in the next iteration.

2. SCHEDULING & DATES:
   - Always calculate ISO 8601 timestamps relative to CURRENT DATE (${currentIso}).
   - "tomorrow at 7 PM" -> calculate tomorrow's date at 19:00:00 local/UTC time.
   - "next Monday", "in 3 days", "this Friday at 10 AM" -> compute the exact date.
   - When asked to view calendar, use get_calendar with appropriate startDate and endDate.

3. WORKSPACE CRUD OPERATIONS:
   - READ: Use get_content_library, list_posts, get_post, get_calendar, list_campaigns, get_workspace_state, get_brand_dna, list_competitors, get_analytics.
   - CREATE: Use save_draft, create_campaign_post, schedule_post, generate_image, generate_video.
   - UPDATE: Use update_post, update_brand_dna, reschedule_post, approve_content.
   - DELETE: If user asks to delete a post without an ID (e.g. "delete yesterday's LinkedIn draft"), FIRST search using get_content_library or list_posts to find the matching item ID. If only 1 matches and intent is explicit, delete it; if ambiguous, ask for confirmation.
   - REPURPOSE: Use repurpose_content to adapt existing content from one platform/format to another.

4. PLATFORM & FORMAT AWARENESS:
   - LinkedIn: Post (1.91:1), Document (PDF slide deck, 4:5), Video (16:9).
   - Instagram: Feed (1:1/4:5), Reel (9:16), Carousel (1:1), Story (9:16).
   - TikTok: Video (9:16), Photo (9:16 carousel).
   - YouTube: Video (16:9), Shorts (9:16).
   - X: Post (16:9), Thread (multi-tweet).
   - Pinterest: Pin (2:3), Video Pin (9:16), Idea Pin (9:16), Carousel (2:3).
   - Facebook: Feed (1:1), Reel (9:16), Story (9:16), Multiple Photos (1:1).
   - Never generate an image when the user requested a video or Reel.
   - Never generate a video when the user requested an image or graphic.

5. LIVE INTERNET & TRENDS:
   - For search_web and fetch_serp queries: ALWAYS search for current ${currentYear} data, latest news, and active trends. Never search for outdated years.

6. RETURN FORMAT:
   - Return ONLY valid JSON (no markdown fences) in this exact shape:
{ "reasoning": "short explanation of the plan", "actions": [ { "tool": "tool_name", "args": { ... } } ] }`;

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

/**
 * Generate 3-5 smart, contextual next actions based on tool outputs, user prompt, and Brand DNA.
 */
function generateSuggestions(
  toolCalls: ToolCallResult[],
  brand: any,
  prompt: string
): string[] {
  const toolsUsed = new Set(toolCalls.map((t) => t.tool));
  const suggestions: string[] = [];

  if (toolsUsed.has("search_web") || toolsUsed.has("fetch_serp")) {
    suggestions.push(
      "Create a LinkedIn post from these trends",
      "Create an Instagram Reel script for this topic",
      "Save these ideas to my 7-day content plan"
    );
  } else if (toolsUsed.has("get_analytics")) {
    suggestions.push(
      "Create 3 more posts around our top-performing topic",
      "Repurpose our highest-engagement post for LinkedIn",
      "Plan next week's content strategy based on these insights"
    );
  } else if (toolsUsed.has("generate_image")) {
    suggestions.push(
      "Write a high-converting caption for this image and save as draft",
      "Schedule this image post for tomorrow at peak time",
      "Create a matching visual variation for LinkedIn"
    );
  } else if (toolsUsed.has("generate_video")) {
    suggestions.push(
      "Write an Instagram Reel caption & hashtags for this video",
      "Schedule this video post for optimal peak time",
      "Repurpose this video concept into a LinkedIn document carousel"
    );
  } else if (toolsUsed.has("save_draft") || toolsUsed.has("create_campaign_post")) {
    suggestions.push(
      "Schedule this post for tomorrow at 7 PM",
      "Generate an AI visual graphic for this draft",
      "Repurpose this draft for Twitter/X and LinkedIn"
    );
  } else if (toolsUsed.has("schedule_post") || toolsUsed.has("reschedule_post")) {
    suggestions.push(
      "Show me what else is scheduled this week",
      "Create another post for Friday",
      "Analyze audience peak activity times"
    );
  } else if (toolsUsed.has("repurpose_content")) {
    suggestions.push(
      "Schedule the repurposed post for tomorrow",
      "Generate a matching image for this new format",
      "Repurpose this content for another social platform"
    );
  } else if (toolsUsed.has("get_calendar")) {
    suggestions.push(
      "Create content to fill open schedule slots",
      "Reschedule my next post to peak engagement time",
      "Plan next week's campaign schedule"
    );
  } else if (toolsUsed.has("list_campaigns")) {
    suggestions.push(
      "Create a new product launch campaign",
      "Generate 3 more posts for the active campaign",
      "Schedule all approved campaign posts"
    );
  } else if (toolsUsed.has("get_workspace_state") || toolsUsed.has("get_content_library")) {
    suggestions.push(
      "Create today's social media content",
      "Find trending topics in my industry",
      "Review and approve pending drafts"
    );
  } else if (toolsUsed.has("update_brand_dna")) {
    suggestions.push(
      "Generate a sample post using the updated tone",
      "Plan this week's content with the new Brand DNA",
      "Research competitor positioning in our niche"
    );
  } else {
    // Default smart starter suggestions
    const brandName = brand?.name || "my brand";
    suggestions.push(
      `Create today's social media post for ${brandName}`,
      "Find the latest trending topics in my industry",
      "Plan a 7-day multi-platform content schedule",
      "Show me what is scheduled on my calendar"
    );
  }

  return suggestions.slice(0, 4);
}

export async function runBrain(input: BrainInput): Promise<BrainResult> {
  const { prompt, workspaceId, userId, history = [], uploadedFiles = [], onEvent } = input;

  const ctx: ToolContext = { workspaceId, userId, uploadedFiles };

  // 1. Recall long-term memory (semantic)
  onEvent?.({ type: "memory" });
  const memory = await recallMemories(workspaceId, prompt, 6);
  onEvent?.({ type: "memory_done", count: memory.length });

  // 2. Load brand DNA for grounding (cached once for this workflow)
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

  // 6. Generate contextual next actions
  const suggestions = generateSuggestions(toolCalls, brand, prompt);

  // 7. Remember (best-effort)
  remember(workspaceId, prompt, answer).catch((e) => console.warn("[Brain] remember failed:", e));

  onEvent?.({ type: "done", answer, suggestions });

  return { answer, toolCalls, memoryRecalled: memory, suggestions };
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

3. Generated Media & Assets:
   - If an image was generated (url present), render it as an embedded preview: ![Generated Image](url)
   - If a video or reel was generated, clearly state the video is ready, provide the link, and confirm it was saved to the Content Library and Media Assets.
   - If posts were drafted, scheduled, deleted, rescheduled, or published, provide a concise confirmation table with platform, format, date, and status.

4. Truthfulness & Error Reporting:
   - NEVER claim an action completed unless the tool result confirms it.
   - If a tool encountered an error, explicitly tell the user what failed and why (e.g. "Image generation failed: API timeout. The caption draft was saved.").
   - Never show fake success for failed actions.

5. Grounded in Real Data:
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

