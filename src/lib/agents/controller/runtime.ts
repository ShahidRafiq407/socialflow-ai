// ============================================================================
// CONTROLLER RUNTIME
//
// The agent loop. One turn = repeat { stream a model turn → run whatever tools
// it asked for → feed the results back } until the model answers with no more
// tool calls, or the loop budget is spent.
//
// Three things make this different from the old JSON-planning brain:
//
//   1. NATIVE function calling — the model picks tools itself, so it can chain
//      six dependent calls in one turn without a hand-rolled planner.
//   2. LIVE thinking — thought summaries arrive on the same stream as the answer
//      and the tool calls, so reasoning shows up WHILE the work happens.
//   3. Tool results become ARTIFACTS derived from real return values, so a card
//      can never describe work that did not happen.
// ============================================================================

import type { Content, Part } from "@google/genai";
import { MODELS } from "../llm";
import { generateJSON, streamAgentTurn } from "@/lib/providers/gateway";
import type { AgentFunctionCall, ThinkingEffort } from "@/lib/providers/VertexAIProvider";
import { getChatSettings, type ChatSettings } from "./settings";
import { buildWorkspaceSnapshot } from "./snapshot";
import { buildSystemPrompt } from "./prompt";
import { loadMemoryContext, loadPlaybooks, rememberFact, savePlaybook, type ControllerMemoryFact } from "./memory";
import { extractSequence, isPlaybookWorthy } from "./playbooks";
import { summarizeOutcomes, type OutcomeEvent } from "./outcomes";
import { loadOutcomeEvents } from "./outcomeStore";
import { buildToolRegistry, toFunctionDeclarations, MUTATING_TOOLS, type ToolDef } from "./tools";
import { artifactsFromToolResult, dedupeArtifacts } from "./artifacts";
import type { Artifact, ControllerEvent, ToolRun } from "./types";
import { getChatModel } from "./models";
import { batchCalls, settleRuns } from "./turnFlow";
import { computeLimits, type CapabilityLimit } from "./limits";
import { getWorkspacePlan } from "@/lib/billing/gate";

const MAX_TOOL_RESULT_CHARS = 24_000;

/** Shown on a tool row the user stopped, so it reads as stopped, not as broken. */
const CANCELLED_RUN_NOTE = "Stopped before it finished";
/** Sent back to the model for a call that never ran because Stop landed first. */
const SKIPPED_RUN_NOTE = "Cancelled by the user before this step ran.";

export interface ControllerAttachment {
  name: string;
  type: string;
  size: number;
  kind: string;
  /** Parsed text for text-bearing files, or a data URL for media. */
  content: string;
  summary: string;
}

export interface ControllerHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunControllerParams {
  workspaceId: string;
  userId: string;
  sessionId: string;
  message: string;
  attachments?: ControllerAttachment[];
  history?: ControllerHistoryMessage[];
  sessionSummary?: string | null;
  /** Overrides the stored model for this turn only. */
  modelOverride?: string;
  settings?: ChatSettings;
  /**
   * The plan this turn was authorised under. Passed in by the route that already
   * holds a ticket, so the controller does not read the plan a second time — and
   * so what the chat is told it may do is the same plan that paid for the turn.
   */
  planTier?: string | null;
  /**
   * The plan's tool-loop allowance. A ceiling over the workspace's own
   * `maxToolLoops` setting, never a replacement for it: a workspace that asked for
   * four loops gets four on Agency, and a workspace that asked for twenty-four gets
   * whatever its plan pays for.
   */
  maxToolLoops?: number;
  signal?: AbortSignal;
  emit: (event: ControllerEvent) => void;
}

export interface RunControllerResult {
  text: string;
  reasoning: string;
  toolRuns: ToolRun[];
  artifacts: Artifact[];
  suggestions: string[];
  model: string;
  finishReason: "ok" | "error" | "cancelled" | "max_loops";
  durationMs: number;
  /**
   * How many full model calls this turn made — the agent loop's own counter.
   *
   * This is the turn's cost, and it is not `toolRuns.length`: one loop can call
   * four tools in parallel, and the loop after it is another whole call with the
   * grown transcript as input. The route bills on this, which is why it is on the
   * result rather than left inside the loop.
   */
  modelCalls: number;
}

const THINKING_EFFORT: Record<ChatSettings["thinkingLevel"], ThinkingEffort> = {
  off: "off",
  concise: "concise",
  balanced: "balanced",
  deep: "deep",
};

/** Human sentence for the tool timeline. */
function toolLabel(name: string, args: Record<string, unknown>): string {
  const s = (key: string) => (typeof args[key] === "string" ? String(args[key]) : "");
  switch (name) {
    case "search_web":
      return `Searching the web for “${s("query") || s("topic")}”`;
    case "scrape_url":
      return `Reading ${s("url")}`;
    case "fetch_serp":
      return `Checking search results for “${s("keyword") || s("query")}”`;
    case "generate_image":
      return `Generating a ${s("platform") || "brand"} image`;
    case "generate_video":
      return `Generating a ${s("platform") || "social"} video`;
    case "heygen_generate_video":
      return "Rendering an avatar video with HeyGen";
    case "save_draft":
      return `Saving a ${s("platform") || ""} draft`.replace("  ", " ");
    case "schedule_post":
      return `Scheduling a ${s("platform") || ""} post`.replace("  ", " ");
    case "publish_post":
      return `Publishing to ${s("platform") || "social"}`;
    case "open_tab":
      return `Building a link to ${s("tab") || "the dashboard"}`;
    case "remember":
      return "Saving that to memory";
    case "recall":
      return `Recalling what I know about “${s("query")}”`;
    case "list_memories":
      return "Reviewing stored memory";
    case "analyze_media":
      return `Analysing ${s("fileName") || "the attached media"}`;
    case "inspect_project":
      return `Inspecting ${s("fileName") || "the attached project"}`;
    case "list_capabilities":
      return "Checking what this workspace can do";
    case "github_status":
      return "Checking the GitHub connection";
    case "github_create_repo":
      return `Creating the repository “${s("name")}”`;
    case "github_push_files":
      return `Pushing files to ${s("repo")}`;
    case "read_uploaded_files":
      return "Reading the attached files";
    case "report_limitation":
      return `Logging a request we can't do yet: ${s("title") || "unnamed"}`;
    default:
      if (name.startsWith("mcp__")) {
        const parts = name.split("__");
        return `Calling ${parts[2] || name} on ${parts[1] || "an MCP server"}`;
      }
      return `Running ${name.replace(/_/g, " ")}`;
  }
}

/** One-line result summary for a finished tool. */
function summarizeResult(name: string, result: unknown): string {
  if (result == null) return "No result";
  if (typeof result === "string") return result.slice(0, 200);
  if (Array.isArray(result)) return `${result.length} item(s)`;

  const r = result as Record<string, any>;
  if (typeof r.error === "string" && r.error.trim()) return r.error.slice(0, 240);

  switch (name) {
    case "generate_image":
      return r.url ? "Image generated" : "No image returned";
    case "generate_video":
      return r.url ? "Video generated" : "No video returned";
    case "open_tab":
      return r.href ? `Link ready: ${r.href}` : "No link";
    case "remember":
      return r.merged ? "Merged into an existing memory" : "Saved to memory";
    case "recall":
    case "list_memories":
      return `${r.count ?? 0} fact(s)`;
    case "search_web":
      return `${Array.isArray(r.results) ? r.results.length : r.count ?? 0} source(s)`;
    case "publish_post":
      return r.liveUrl ? "Published — live URL returned" : String(r.status || "Published");
    case "github_push_files":
      return `${Array.isArray(r.pushed) ? r.pushed.length : r.count ?? 0} file(s) pushed`;
    case "inspect_project":
      return `${r.fileCount ?? 0} file(s) mapped`;
    case "analyze_media":
      return typeof r.analysis === "string" ? `${r.analysis.length.toLocaleString()} chars of analysis` : "Analysed";
    case "report_limitation":
      if (!r.recorded) return "Could not be logged";
      return r.firstTime ? "Logged for the product team" : `Logged — asked ${r.timesAsked} times now`;
    default:
      break;
  }

  const keys = Object.keys(r);
  if (keys.length === 0) return "Done";
  if (typeof r.count === "number") return `${r.count} result(s)`;
  if (typeof r.id === "string") return `id ${r.id}`;
  return `${keys.length} field(s) returned`;
}

/** Tool results go back to the model as JSON, bounded so one big result can't blow the window. */
function boundResult(result: unknown): Record<string, unknown> {
  try {
    const json = JSON.stringify(result ?? null);
    if (json.length <= MAX_TOOL_RESULT_CHARS) {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { result: parsed };
    }
    return {
      truncated: true,
      note: `Result was ${json.length.toLocaleString()} chars and has been truncated to ${MAX_TOOL_RESULT_CHARS}.`,
      result: json.slice(0, MAX_TOOL_RESULT_CHARS),
    };
  } catch {
    return { result: String(result).slice(0, MAX_TOOL_RESULT_CHARS) };
  }
}

function buildInitialContents(params: {
  message: string;
  history: ControllerHistoryMessage[];
  attachments: ControllerAttachment[];
  /** False for a text-only model, whose API rejects or ignores inline media. */
  supportsVision: boolean;
}): Content[] {
  const contents: Content[] = [];

  for (const msg of params.history) {
    const text = (msg.content || "").trim();
    if (!text) continue;
    contents.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text }] });
  }

  const parts: Part[] = [];

  // Media goes inline so the model can genuinely see/hear it; text-bearing files
  // are already parsed and reachable through read_uploaded_files.
  //
  // Only for a model that can actually take it. The picker now carries third-party
  // models an admin added, and a text-only one served an inline image part back as a
  // 400 for the whole turn — the user got a failed chat rather than an answer that
  // said it could not see the picture. Skipping the part leaves the message text and
  // the file tools intact, so the turn still does as much as the model allows.
  if (params.supportsVision) {
    for (const att of params.attachments) {
      if (att.kind === "image" || att.kind === "video" || att.kind === "audio") {
        const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(att.content || "");
        if (match) {
          parts.push({ inlineData: { mimeType: match[1] || att.type, data: match[2] } });
        }
      }
    }
  }

  parts.push({ text: params.message.trim() || "(no message text)" });
  contents.push({ role: "user", parts });

  return contents;
}

/**
 * Runs one controller turn end to end, emitting SSE events as it goes.
 * Never throws for tool-level failures — those become tool events and are fed
 * back to the model so it can recover or explain.
 */
export async function runController(params: RunControllerParams): Promise<RunControllerResult> {
  const startedAt = Date.now();
  const { emit } = params;

  const settings = params.settings || (await getChatSettings(params.workspaceId));
  const requestedModel = params.modelOverride || settings.model;
  const modelInfo = getChatModel(requestedModel);

  const attachments = params.attachments || [];
  const history = params.history || [];

  const toolRuns: ToolRun[] = [];
  const artifacts: Artifact[] = [];
  let answerText = "";
  let reasoningText = "";
  let servingModel = requestedModel;
  let finishReason: RunControllerResult["finishReason"] = "ok";

  // ---- setup: memory, workspace state, tools ------------------------------

  emit({ type: "status", step: "context", label: "Loading workspace context", state: "start" });

  let memory: ControllerMemoryFact[] = [];
  let playbooks: ControllerMemoryFact[] = [];
  let outcomes: OutcomeEvent[] = [];
  let planTier: string | null = params.planTier ?? null;
  const [snapshot, registry] = await Promise.all([
    buildWorkspaceSnapshot(params.workspaceId),
    buildToolRegistry(params.workspaceId, settings),
    (async () => {
      if (!settings.memoryEnabled) return;
      memory = await loadMemoryContext(params.workspaceId, params.message, settings.memoryRecallTopK);
    })(),
    (async () => {
      // Proven tool sequences for tasks like this one. Loaded alongside facts so
      // the model starts a recurring task from its own working procedure.
      if (!settings.memoryEnabled) return;
      playbooks = await loadPlaybooks(params.workspaceId, params.message);
    })(),
    (async () => {
      // Which of this workspace's own drafts got published and which got thrown
      // away, so generation leans toward what this user actually keeps.
      if (!settings.memoryEnabled) return;
      outcomes = await loadOutcomeEvents(params.workspaceId);
    })(),
    (async () => {
      // The plan is what decides which capabilities the chat may claim. There is
      // no kill-switch around this any more: entitlements are always enforced, so
      // a chat that ignored them would promise work the next request refuses.
      //
      // Skipped when the caller passed the plan it charged the turn against. That
      // is not only a saved read: `getWorkspacePlan` goes back through `auth()`,
      // so a turn started by anything other than a signed-in browser would read
      // FREE here and quietly narrow a paying account's capabilities.
      if (params.planTier !== undefined) return;
      try {
        planTier = (await getWorkspacePlan(params.workspaceId)).plan;
      } catch {
        planTier = null;
      }
    })(),
  ]);

  // Only the patterns that clear the honesty floor are worth telling the user
  // about — the raw event count would overstate what was actually learned.
  const outcomeSignals = (() => {
    const { kept, discarded } = summarizeOutcomes(outcomes);
    return kept.length + discarded.length;
  })();

  emit({
    type: "status",
    step: "context",
    label: "Loading workspace context",
    state: "done",
    detail:
      `${registry.tools.length} tools` +
      (registry.mcpCount > 0 ? `, ${registry.mcpCount} from MCP` : "") +
      (memory.length > 0 ? `, ${memory.length} memories` : "") +
      (playbooks.length > 0 ? `, ${playbooks.length} playbook${playbooks.length === 1 ? "" : "s"}` : "") +
      (outcomeSignals > 0 ? `, ${outcomeSignals} taste signal${outcomeSignals === 1 ? "" : "s"}` : ""),
  });

  if (memory.length > 0) {
    emit({
      type: "memory",
      facts: memory.slice(0, 12).map((f) => ({
        id: f.id,
        category: f.category,
        content: f.content,
        pinned: f.pinned,
      })),
    });
  }

  const toolsByName = new Map<string, ToolDef>();
  for (const tool of registry.tools) toolsByName.set(tool.name, tool);

  const { declarations, nameMap } = toFunctionDeclarations(registry.tools);

  // A model that cannot do native function calling is sent no declarations at all.
  // The picker carries admin-added third-party models now, and handing `tools` to an
  // endpoint that does not implement them fails the whole turn on some providers and
  // is silently dropped on others — either way the loop below then waited for tool
  // calls that could never arrive. With none sent, the turn is a straight answer,
  // which is what such a model is actually good for.
  const toolsUsable = modelInfo.supportsTools !== false && declarations.length > 0;
  const activeDeclarations = toolsUsable ? declarations : [];

  // The live boundary, computed from the same snapshot the prompt already shows,
  // plus the settings toggles and (only when billing is enforced) the plan tier.
  const limits: CapabilityLimit[] = computeLimits({
    settings,
    snapshot: {
      connectedPlatforms: snapshot.connectedPlatforms,
      connectedConnectors: snapshot.connectedConnectors,
      hasWordPress: snapshot.hasWordPress,
    },
    planTier,
    // Sent so the boundary reflects the model actually serving the turn, not just the
    // workspace: what the prompt lists as available has to match what was put on the wire.
    model: {
      label: modelInfo.label,
      supportsTools: modelInfo.supportsTools !== false,
      supportsVision: modelInfo.supportsVision !== false,
    },
  });

  const systemInstruction = buildSystemPrompt({
    settings,
    snapshot,
    memory,
    playbooks,
    outcomes,
    tools: registry.tools,
    attachments: attachments.map((a) => ({ name: a.name, kind: a.kind, summary: a.summary })),
    limits,
    sessionSummary: params.sessionSummary,
  });

  const toolContext = {
    workspaceId: params.workspaceId,
    userId: params.userId,
    brandDNA: {
      tone: snapshot.brandTone,
      targetAudience: snapshot.brandAudience,
      forbiddenWords: snapshot.forbiddenWords,
      industry: snapshot.industry,
      website: snapshot.website,
    },
    uploadedFiles: attachments.map((a) => ({
      name: a.name,
      content: a.content,
      type: a.type,
      size: a.size,
    })),
    sessionId: params.sessionId,
  };

  const contents = buildInitialContents({
    message: params.message,
    history,
    attachments,
    supportsVision: modelInfo.supportsVision !== false,
  });

  // ---- agent loop ---------------------------------------------------------

  // Each loop is another full model call, so this is where a turn's cost stops
  // being open-ended. The workspace setting asks; the plan's allowance decides.
  const loopCeiling = params.maxToolLoops ?? settings.maxToolLoops;
  const maxLoops = Math.max(1, Math.min(settings.maxToolLoops, loopCeiling));
  let loop = 0;
  let announcedModel = false;

  try {
    while (loop < maxLoops) {
      loop += 1;
      if (params.signal?.aborted) {
        finishReason = "cancelled";
        break;
      }

      const turn = await streamAgentTurn(
        {
          contents,
          systemInstruction,
          functionDeclarations: activeDeclarations,
          modelName: requestedModel,
          temperature: settings.temperature,
          thinkingEffort: modelInfo.supportsThinking ? THINKING_EFFORT[settings.thinkingLevel] : "off",
          signal: params.signal,
        },
        {
          onThought:
            settings.thinkingDisplay === "hidden"
              ? (delta) => {
                  reasoningText += "";
                  void delta;
                }
              : (delta) => {
                  reasoningText += delta;
                  emit({ type: "thought", delta });
                },
          onText: settings.streamTokens
            ? (delta) => {
                answerText += delta;
                emit({ type: "text", delta });
              }
            : undefined,
        }
      );

      servingModel = turn.model;
      if (!announcedModel) {
        announcedModel = true;
        emit({ type: "model", model: turn.model, fallback: turn.model !== requestedModel });
      }

      // With streamTokens off, the text arrives in one piece at the end of the turn.
      if (!settings.streamTokens && turn.text) {
        answerText += turn.text;
        emit({ type: "text", delta: turn.text });
      }
      if (settings.thinkingDisplay === "hidden" && turn.reasoning) {
        reasoningText += turn.reasoning;
      }

      if (turn.functionCalls.length === 0) {
        finishReason = "ok";
        break;
      }

      // Echo the model's own parts back (thoughtSignature included) before the
      // function responses — Gemini 3 requires this for multi-turn tool use.
      contents.push({ role: "model", parts: turn.modelParts });

      const calls = turn.functionCalls;
      const responseParts: Part[] = [];

      // Run in bounded batches: independent tools in parallel, quota-bound ones
      // (image, video) alone, without letting a model that asked for 20 calls
      // hammer every downstream API at once.
      const batches = batchCalls(calls, (name: string) => nameMap.get(name) || name);
      let placed = 0;

      for (const batch of batches) {
        const offset = placed;
        placed += batch.length;

        // Stop landed between batches: record the rest as cancelled rather than
        // starting work nobody is waiting for.
        if (params.signal?.aborted) {
          batch.forEach((call: AgentFunctionCall, idx: number) => {
            const realName = nameMap.get(call.name) || call.name;
            const run: ToolRun = {
              id: `${loop}-${offset + idx}-${realName}`,
              name: realName,
              label: toolLabel(realName, call.args),
              phase: "cancelled",
              args: call.args,
              mutating: MUTATING_TOOLS.has(realName),
              summary: CANCELLED_RUN_NOTE,
              durationMs: 0,
            };
            toolRuns.push(run);
            emit({ type: "tool", run: { ...run } });
            responseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { cancelled: true, error: SKIPPED_RUN_NOTE },
              },
            } as Part);
          });
          continue;
        }

        const settled = await Promise.all(
          batch.map(async (call: AgentFunctionCall, idx: number) => {
            const realName = nameMap.get(call.name) || call.name;
            const tool = toolsByName.get(realName);
            const runId = `${loop}-${offset + idx}-${realName}`;
            const startTool = Date.now();

            const run: ToolRun = {
              id: runId,
              name: realName,
              label: toolLabel(realName, call.args),
              phase: "running",
              args: call.args,
              mutating: MUTATING_TOOLS.has(realName),
            };
            toolRuns.push(run);
            emit({ type: "tool", run: { ...run } });

            if (!tool) {
              run.phase = "error";
              run.error = `Unknown tool "${realName}".`;
              run.durationMs = Date.now() - startTool;
              emit({ type: "tool", run: { ...run } });
              return { call, realName, result: { error: run.error } };
            }

            try {
              const result = await tool.execute(call.args, {
                ...toolContext,
                // The link that made Stop real: without it the tool keeps
                // rendering, retrying and polling after the user gave up.
                signal: params.signal,
                onProgress: (message: string) => {
                  if (run.phase !== "running") return;
                  run.progress = message;
                  emit({ type: "tool", run: { ...run } });
                },
              } as any);

              // Stop landed while this tool was working. Whatever came back, the
              // row is a stop, not a result.
              if (params.signal?.aborted) {
                run.phase = "cancelled";
                run.progress = undefined;
                run.summary = CANCELLED_RUN_NOTE;
                run.durationMs = Date.now() - startTool;
                emit({ type: "tool", run: { ...run } });
                return { call, realName, result: { cancelled: true, error: "Stopped by the user." } };
              }

              const failed = !!(result && typeof result === "object" && (result as any).error);
              const cancelled = !!(result && typeof result === "object" && (result as any).cancelled);
              run.phase = cancelled ? "cancelled" : failed ? "error" : "done";
              run.progress = undefined;
              run.durationMs = Date.now() - startTool;
              if (cancelled) {
                run.summary = CANCELLED_RUN_NOTE;
              } else if (failed) {
                run.error = String((result as any).error).slice(0, 400);
              } else {
                run.summary = summarizeResult(realName, result);
              }
              emit({ type: "tool", run: { ...run } });

              if (!failed && !cancelled) {
                for (const artifact of artifactsFromToolResult(realName, result)) {
                  artifacts.push(artifact);
                  emit({ type: "artifact", artifact });
                }
              }

              return { call, realName, result };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const cancelled = !!(err as any)?.isCancelled || !!params.signal?.aborted;
              run.phase = cancelled ? "cancelled" : "error";
              run.progress = undefined;
              if (cancelled) run.summary = CANCELLED_RUN_NOTE;
              else run.error = message.slice(0, 400);
              run.durationMs = Date.now() - startTool;
              emit({ type: "tool", run: { ...run } });
              return {
                call,
                realName,
                result: cancelled ? { cancelled: true, error: "Stopped by the user." } : { error: message },
              };
            }
          })
        );

        for (const entry of settled) {
          responseParts.push({
            functionResponse: {
              id: entry.call.id,
              name: entry.call.name,
              response: boundResult(entry.result),
            },
          } as Part);
        }
      }

      contents.push({ role: "user", parts: responseParts });

      // Stop means stop: the results are recorded for the transcript, but they do
      // not go back to the model for another round of work.
      if (params.signal?.aborted) {
        finishReason = "cancelled";
        break;
      }

      if (loop >= maxLoops) {
        finishReason = "max_loops";
        emit({
          type: "notice",
          level: "warn",
          message: `Stopped after ${maxLoops} tool rounds (the Max tool rounds setting). Ask me to continue and I'll pick up where I left off.`,
        });
      }
    }
  } catch (err) {
    if ((err as any)?.isCancelled || params.signal?.aborted) {
      finishReason = "cancelled";
    } else {
      finishReason = "error";
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message });
      for (const run of settleRuns(toolRuns, "error", message.slice(0, 400), startedAt)) {
        emit({ type: "tool", run: { ...run } });
      }
      return {
        text: answerText,
        reasoning: reasoningText,
        toolRuns,
        artifacts: dedupeArtifacts(artifacts),
        suggestions: [],
        model: servingModel,
        finishReason: "error",
        durationMs: Date.now() - startedAt,
        // Counts the call that threw. The provider had the request, so the tokens
        // it read are real; the route refunds the whole turn on an error that
        // produced nothing, which is where that generosity is settled.
        modelCalls: loop,
      };
    }
  }

  // Nothing may be left spinning. A row still marked "running" here is saved that
  // way too, so it would spin again every time the message is re-rendered.
  for (const run of settleRuns(toolRuns, "cancelled", CANCELLED_RUN_NOTE, startedAt)) {
    emit({ type: "tool", run: { ...run } });
  }

  // ---- follow-ups + auto memory ------------------------------------------

  let suggestions: string[] = [];
  if (settings.showSuggestions && finishReason === "ok" && answerText.trim()) {
    suggestions = await generateSuggestions({
      message: params.message,
      answer: answerText,
      modelName: requestedModel,
    });
    if (suggestions.length > 0) emit({ type: "suggestions", items: suggestions });
  }

  if (settings.memoryEnabled && settings.memoryAutoSave && finishReason === "ok") {
    void autoSaveMemory({
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      message: params.message,
      answer: answerText,
      modelName: requestedModel,
      known: memory,
    });

    // Capture the working tool sequence as a playbook, so a recurring task
    // starts from its own proven procedure next time. Only genuine multi-tool
    // turns qualify (see isPlaybookWorthy); a chat-only answer records nothing.
    if (isPlaybookWorthy(toolRuns)) {
      void savePlaybook({
        workspaceId: params.workspaceId,
        task: params.message,
        sequence: extractSequence(toolRuns),
        sessionId: params.sessionId,
      });
    }
  }

  return {
    text: answerText,
    reasoning: reasoningText,
    toolRuns,
    artifacts: dedupeArtifacts(artifacts),
    suggestions,
    model: servingModel,
    finishReason,
    durationMs: Date.now() - startedAt,
    modelCalls: loop,
  };
}

/** Three next steps the user can click. Best-effort — never blocks the answer. */
async function generateSuggestions(params: {
  message: string;
  answer: string;
  modelName: string;
}): Promise<string[]> {
  try {
    const data = await generateJSON(
      [
        {
          role: "system",
          content:
            "You suggest the next action in a marketing operations chat. Return ONLY " +
            '{"suggestions": ["...", "...", "..."]} — exactly three short imperative prompts the user could send next. ' +
            "Each must be a concrete next step that follows from what just happened (publish it, schedule it, make a " +
            "variant, analyse the results). Max 60 characters each. Same language as the user's message.",
        },
        {
          role: "user",
          content: `User asked: ${params.message.slice(0, 800)}\n\nAssistant did: ${params.answer.slice(0, 2000)}`,
        },
      ],
      { modelName: MODELS.CHAT_UTILITY, temperature: 0.6 }
    );
    const items = Array.isArray(data?.suggestions) ? data.suggestions : [];
    return items
      .filter((s: unknown) => typeof s === "string" && s.trim())
      .slice(0, 3)
      .map((s: string) => s.trim().slice(0, 90));
  } catch {
    return [];
  }
}

/**
 * Extracts durable facts from the exchange and stores them. Runs detached so the
 * user never waits on it, and skips anything already known.
 */
async function autoSaveMemory(params: {
  workspaceId: string;
  sessionId: string;
  message: string;
  answer: string;
  modelName: string;
  known: ControllerMemoryFact[];
}): Promise<void> {
  try {
    const data = await generateJSON(
      [
        {
          role: "system",
          content:
            "Extract only DURABLE facts worth remembering forever about this user or their business from the exchange: " +
            "preferences, brand rules, audience, products, names, recurring schedules, decisions. " +
            'Return {"facts": [{"content": "...", "category": "...", "importance": 1-5}]}. ' +
            "Ignore one-off task instructions, pleasantries, and anything already in the KNOWN list. " +
            "Write each fact as a standalone sentence. Return an empty array if there is nothing durable.",
        },
        {
          role: "user",
          content:
            `KNOWN:\n${params.known.map((f) => `- ${f.content}`).join("\n") || "(nothing yet)"}\n\n` +
            `USER: ${params.message.slice(0, 2000)}\n\nASSISTANT: ${params.answer.slice(0, 2000)}`,
        },
      ],
      { modelName: MODELS.CHAT_UTILITY, temperature: 0.1 }
    );

    const facts = Array.isArray(data?.facts) ? data.facts : [];
    for (const fact of facts.slice(0, 5)) {
      if (!fact || typeof fact.content !== "string" || !fact.content.trim()) continue;
      await rememberFact({
        workspaceId: params.workspaceId,
        content: fact.content,
        category: typeof fact.category === "string" ? fact.category : "general",
        importance: typeof fact.importance === "number" ? fact.importance : 3,
        source: "auto",
        sessionId: params.sessionId,
      });
    }
  } catch (err) {
    console.warn("[Controller] auto-memory skipped:", err instanceof Error ? err.message : err);
  }
}
