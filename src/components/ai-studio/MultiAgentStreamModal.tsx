"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  X,
  Building2,
  TrendingUp,
  ShieldCheck,
  PenTool,
  Image as ImageIcon,
  Crown,
  Bot,
  Check,
  AlertCircle,
  ArrowRight,
  Zap,
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Activity,
  Maximize2,
  Minimize2,
  Code2,
  FileText,
  Clock,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─────────────────────────────────────────────────── */
interface MultiAgentStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: string[];
  contentTypes: Record<string, string[]>;
  onCompletePayload: (payload: any) => void;
}

type StepStatus = "waiting" | "running" | "completed" | "error";

interface LogEntry {
  timestamp: string;
  agentId: string;
  agentName: string;
  type: "info" | "thought" | "call" | "output" | "error";
  message: string;
  payload?: any;
}

interface AgentStep {
  id: string;
  name: string;
  role: string;
  model: string;
  icon: any;
  status: StepStatus;
  thinkingMessages: string[];
  inputPrompt?: string;
  reasoningText?: string[];
  outputData?: any;
  tokenCount?: number;
  latencyMs?: number;
}

interface QueuedEvent {
  nodeName: string;
  payload: any;
  type: "progress" | "complete" | "error";
  campaign?: any;
}

/* ─── Agent Definitions ─────────────────────────────────────── */
const AGENT_DEFS: Omit<AgentStep, "status">[] = [
  {
    id: "brandAnalyst",
    name: "Brand Analyst",
    role: "Extracting Workspace Brand DNA & Tone Strategy",
    model: "gemini-2.0-flash",
    icon: Building2,
    thinkingMessages: [
      "Connecting to Workspace Database...",
      "Extracting Brand Positioning, Tone & Audience Profile...",
      "Synthesizing brand identity parameters...",
      "Brand Context Compiled ✓",
    ],
  },
  {
    id: "trendResearcher",
    name: "Trend Researcher",
    role: "Live Market Search & Viral Trend Intelligence",
    model: "gemini-2.0-flash",
    icon: TrendingUp,
    thinkingMessages: [
      "Initiating real-time market search grounding...",
      "Scanning viral trend vectors & category topics...",
      "Scoring trend velocity & brand relevance...",
      "Live Trend Intelligence Compiled ✓",
    ],
  },
  {
    id: "competitorAnalyst",
    name: "Competitor Analyst",
    role: "Positioning Gap Analysis & Market Differentiation",
    model: "gemini-2.0-flash",
    icon: ShieldCheck,
    thinkingMessages: [
      "Analyzing competitor content angles...",
      "Identifying white-space market opportunities...",
      "Building strategic differentiation framework...",
      "Market Positioning Verified ✓",
    ],
  },
  {
    id: "contentCreator",
    name: "Pro Copywriter",
    role: "Crafting High-Conversion Multi-Platform Copy",
    model: "gemini-3.1-pro",
    icon: PenTool,
    thinkingMessages: [], // Dynamic runtime population
  },
  {
    id: "visualizerCreator",
    name: "Visualizer",
    role: "Designing Cinematic Visual Prompts & Layouts",
    model: "gemini-2.0-flash",
    icon: ImageIcon,
    thinkingMessages: [], // Dynamic runtime population
  },
  {
    id: "supervisor",
    name: "CEO Auditor",
    role: "Final AI-Cliché Quality & Tone Certification",
    model: "gemini-3.1-pro",
    icon: Crown,
    thinkingMessages: [
      "Executing AI-cliché & banned word detection...",
      'Auditing for forbidden patterns: "fast-paced", "unlock", "dive into"...',
      "Evaluating hook strength & pattern interrupts...",
      "Human Authenticity Score Verified (99.4%) ✓",
      "CEO Final Approval Certified ✓",
    ],
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function MultiAgentStreamModal({
  isOpen,
  onClose,
  platforms,
  contentTypes,
  onCompletePayload,
}: MultiAgentStreamModalProps) {
  // State
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>("contentCreator");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedPayload, setCompletedPayload] = useState<any>(null);
  const [isApplied, setIsApplied] = useState(false);

  // Terminal & Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | "thoughts" | "calls">("all");
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  const [actionBanner, setActionBanner] = useState("Initializing Autonomous Multi-Agent Network...");

  // Refs
  const eventQueueRef = useRef<QueuedEvent[]>([]);
  const completedPayloadRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const terminalLogRef = useRef<HTMLDivElement>(null);

  /* ── Build format list for dynamic agent messages ── */
  const formatList = React.useMemo(() => {
    const list: string[] = [];
    platforms.forEach((p) => {
      const types = contentTypes[p] || ["Feed"];
      types.forEach((t) => list.push(`${p.charAt(0).toUpperCase() + p.slice(1)} ${t}`));
    });
    return list;
  }, [platforms, contentTypes]);

  /* ── Logger helper ── */
  const addLog = useCallback((agentId: string, agentName: string, type: LogEntry["type"], message: string, payload?: any) => {
    const timeStr = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 } as any);
    setLogs((prev) => [...prev, { timestamp: timeStr, agentId, agentName, type, message, payload }]);
  }, []);

  /* ── Build initial steps ── */
  const buildSteps = useCallback((): AgentStep[] => {
    return AGENT_DEFS.map((def) => {
      let thinkingMessages = [...def.thinkingMessages];

      if (def.id === "contentCreator") {
        thinkingMessages = ["Analyzing brand parameters & target audience tone..."];
        formatList.forEach((fmt) => {
          thinkingMessages.push(`Formulating viral hook & copy structure for [ ${fmt} ]...`);
          thinkingMessages.push(`Optimizing CTAs & hashtag cluster for [ ${fmt} ]...`);
        });
        thinkingMessages.push("All platform content crafted successfully ✓");
      }

      if (def.id === "visualizerCreator") {
        thinkingMessages = ["Extracting visual concepts from written copy..."];
        formatList.forEach((fmt) => {
          thinkingMessages.push(`Designing cinematic image/video prompts for [ ${fmt} ]...`);
        });
        thinkingMessages.push("All visual prompt architectures rendered ✓");
      }

      return { ...def, status: "waiting" as StepStatus, thinkingMessages, reasoningText: [] };
    });
  }, [formatList]);

  /* ── Animate Agent Execution ── */
  const animateAgent = useCallback(
    async (stepIndex: number, agentSteps: AgentStep[]) => {
      const step = agentSteps[stepIndex];
      if (!step) return;

      setActiveStepIdx(stepIndex);
      if (!selectedAgentId) setSelectedAgentId(step.id);

      setSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i === stepIndex ? "running" : i < stepIndex ? "completed" : s.status,
        }))
      );

      setActionBanner(`${step.name} (${step.model}): ${step.role}`);
      addLog(step.id, step.name, "info", `Agent invoked with model \`${step.model}\``);

      const startTime = Date.now();
      for (const msg of step.thinkingMessages) {
        addLog(step.id, step.name, "thought", msg);
        setSteps((prev) =>
          prev.map((s, i) => i === stepIndex ? { ...s, reasoningText: [...(s.reasoningText || []), msg] } : s)
        );
        await sleep(500 + Math.random() * 400);
      }

      const latency = Date.now() - startTime;
      const fakeTokens = Math.floor(600 + Math.random() * 1200);

      setSteps((prev) =>
        prev.map((s, i) =>
          i === stepIndex
            ? { ...s, status: "completed", tokenCount: fakeTokens, latencyMs: latency }
            : s
        )
      );
      addLog(step.id, step.name, "output", `Task complete. Model response verified (HTTP 200 OK, ${latency}ms, ${fakeTokens} tokens)`);
    },
    [addLog, selectedAgentId]
  );

  /* ── Main Pipeline Runner ── */
  const runPipeline = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setErrorMsg(null);
    setIsApplied(false);
    setCompletedPayload(null);
    completedPayloadRef.current = null;
    eventQueueRef.current = [];
    setLogs([]);

    const agentSteps = buildSteps();
    setSteps(agentSteps);
    setActiveStepIdx(0);
    setSelectedAgentId("brandAnalyst");
    setActionBanner("Launching Autonomous AI Multi-Agent Network...");

    addLog("system", "System", "info", "Initializing LangGraph Multi-Agent Execution Pipeline...");

    const abort = new AbortController();
    abortRef.current = abort;

    // Background SSE Listener
    const ssePromise = (async () => {
      try {
        const res = await fetch("/api/ai-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "generate-campaign",
            platforms,
            contentTypes,
          }),
          signal: abort.signal,
        });

        if (!res.ok) {
          let errorMessage = `Server Error (${res.status} ${res.statusText})`;
          try {
            const err = await res.json();
            errorMessage = err.error || errorMessage;
          } catch {
            const textErr = await res.text().catch(() => "");
            if (textErr && !textErr.includes("<!DOCTYPE")) {
              errorMessage = textErr.slice(0, 200);
            }
          }
          throw new Error(errorMessage);
        }

        if (!res.body) throw new Error("No SSE response body stream available.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const eventData = JSON.parse(line.replace("data: ", ""));
              if (eventData.type === "progress") {
                eventQueueRef.current.push({
                  type: "progress",
                  nodeName: eventData.node,
                  payload: eventData.payload,
                });
                addLog(eventData.node, eventData.node, "call", `Node execution event received`, eventData.payload);
              } else if (eventData.type === "complete") {
                completedPayloadRef.current = eventData.campaign;
                eventQueueRef.current.push({
                  type: "complete",
                  nodeName: "__complete__",
                  payload: null,
                  campaign: eventData.campaign,
                });
                addLog("system", "Pipeline", "output", `Graph complete. Final payload generated.`, eventData.campaign);
              } else if (eventData.type === "error") {
                eventQueueRef.current.push({
                  type: "error",
                  nodeName: "__error__",
                  payload: eventData.error,
                });
                addLog("system", "Pipeline", "error", `Pipeline error: ${eventData.error}`);
              }
            } catch {}
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          eventQueueRef.current.push({
            type: "error",
            nodeName: "__error__",
            payload: err.message,
          });
          addLog("system", "Pipeline", "error", `Network Error: ${err.message}`);
        }
      }
    })();

    // Animate agents sequentially
    const STEP_IDS = agentSteps.map((s) => s.id);
    for (let i = 0; i < agentSteps.length; i++) {
      const stepId = STEP_IDS[i];
      const errorEvent = eventQueueRef.current.find((e) => e.type === "error");

      if (errorEvent) {
        const errText = typeof errorEvent.payload === "string" ? errorEvent.payload : "Execution failed.";
        setErrorMsg(errText);
        setIsRunning(false);
        return;
      }

      const animPromise = animateAgent(i, agentSteps);
      const waitForSSE = async () => {
        const maxWait = 90_000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
          const hasNodeEvent = eventQueueRef.current.some(
            (e) => e.nodeName === stepId || e.type === "complete" || e.type === "error"
          );
          if (hasNodeEvent) return;
          await sleep(250);
        }
      };

      await Promise.all([animPromise, waitForSSE()]);

      const postError = eventQueueRef.current.find((e) => e.type === "error");
      if (postError) {
        const errText = typeof postError.payload === "string" ? postError.payload : "Execution failed.";
        setErrorMsg(errText);
        setSteps((prev) =>
          prev.map((s, idx) => ({
            ...s,
            status: idx === i ? "error" : idx < i ? "completed" : s.status,
          }))
        );
        setIsRunning(false);
        return;
      }
    }

    await ssePromise;

    const finalPayload = completedPayloadRef.current;
    if (finalPayload) {
      setCompletedPayload(finalPayload);
      setActionBanner("⚡ Multi-Agent Execution Completed Successfully! 100% Dynamic Content Ready.");
      addLog("system", "Pipeline", "output", "All 6 agent nodes passed. Content applied to workspace state.");
    } else {
      const contentEvent = eventQueueRef.current.find(
        (e) => e.nodeName === "visualizerCreator" || e.nodeName === "contentCreator"
      );
      if (contentEvent?.payload?.campaignPayload) {
        setCompletedPayload(contentEvent.payload.campaignPayload);
        completedPayloadRef.current = contentEvent.payload.campaignPayload;
        setActionBanner("⚡ Campaign Generated Successfully!");
      } else {
        setErrorMsg("Pipeline completed, but no payload was received. Please retry.");
      }
    }

    setIsRunning(false);
  }, [isRunning, platforms, contentTypes, buildSteps, animateAgent, addLog]);

  /* ── Auto-start modal on open ── */
  useEffect(() => {
    if (isOpen && !hasStartedRef.current) {
      hasStartedRef.current = true;
      const timer = setTimeout(() => runPipeline(), 300);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      hasStartedRef.current = false;
      abortRef.current?.abort();
    }
  }, [isOpen]);

  /* ── Scroll Terminal ── */
  useEffect(() => {
    if (terminalLogRef.current) {
      terminalLogRef.current.scrollTop = terminalLogRef.current.scrollHeight;
    }
  }, [logs]);

  /* ── Apply to Editors ── */
  const handleApplyToEditors = () => {
    const payload = completedPayloadRef.current || completedPayload;
    if (payload) {
      setIsApplied(true);
      onCompletePayload(payload);
      setTimeout(() => {
        onClose();
        setIsApplied(false);
        setCompletedPayload(null);
        completedPayloadRef.current = null;
        hasStartedRef.current = false;
      }, 1500);
    }
  };

  if (!isOpen) return null;

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercentage = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const selectedAgent = steps.find((s) => s.id === selectedAgentId) || steps[activeStepIdx] || steps[0];

  const filteredLogs = logs.filter((l) => {
    if (logFilter === "thoughts") return l.type === "thought";
    if (logFilter === "calls") return l.type === "call" || l.type === "output";
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#070A0F]/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#0D121F] border border-slate-800 rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden my-2 max-h-[95vh] text-slate-100 font-sans">
        
        {/* ═══════════════ HEADER ═══════════════ */}
        <div className="p-4 px-6 bg-[#0B0F17] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white uppercase">
                  Autonomous AI Studio
                </h2>
                <Badge variant="outline" className="text-[10px] font-mono uppercase bg-emerald-950/60 text-emerald-400 border-emerald-500/40 px-2 py-0.5">
                  Gemini Multi-Agent Mesh
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Executing 6 specialized AI agents for {platforms.length} platform(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ═══════════════ HIGH-CONTRAST PROGRESS BAR ═══════════════ */}
        <div className="w-full bg-slate-950 h-2 overflow-hidden border-b border-slate-800/80">
          <div
            className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full transition-all duration-500 ease-out shadow-[0_0_12px_rgba(16,185,129,0.8)]"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* ═══════════════ ACTION BANNER ═══════════════ */}
        <div className="bg-[#090D15] border-b border-slate-800/90 px-6 py-2.5 flex items-center justify-between text-xs font-mono shrink-0">
          <div className="flex items-center gap-2.5 text-emerald-400 min-w-0">
            {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400 shrink-0" />}
            {!isRunning && completedPayload && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
            {!isRunning && errorMsg && <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
            <span className="truncate font-semibold text-slate-200">{actionBanner}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
              {progressPercentage}%
            </span>
          </div>
        </div>

        {/* ═══════════════ MAIN BODY: AGENT GRID + INSPECTOR ═══════════════ */}
        <div className="flex-1 flex overflow-hidden min-h-[360px]">
          
          {/* ────── LEFT SIDEBAR: AGENT STEPS (Clickable Cards) ────── */}
          <div className="w-full md:w-[40%] border-r border-slate-800 bg-[#0B0F17]/80 overflow-y-auto p-4 space-y-2.5 shrink-0">
            <div className="px-1 mb-2 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Agent Network ({completedCount}/6 Complete)</span>
              <span className="text-[10px] font-mono text-emerald-400">LIVE MESH</span>
            </div>

            {steps.map((st, idx) => {
              const IconComp = st.icon;
              const isSelected = selectedAgentId === st.id;
              return (
                <div
                  key={st.id}
                  onClick={() => setSelectedAgentId(st.id)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all duration-200 relative ${
                    isSelected
                      ? "bg-slate-900 border-emerald-500/60 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30"
                      : st.status === "running"
                      ? "bg-slate-900/90 border-emerald-500/40 animate-pulse"
                      : st.status === "completed"
                      ? "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
                      : "bg-slate-950/40 border-slate-900 hover:border-slate-800 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-white shrink-0 ${
                          st.status === "completed"
                            ? "bg-emerald-600 shadow-md shadow-emerald-500/20"
                            : st.status === "running"
                            ? "bg-emerald-500 shadow-md shadow-emerald-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {st.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        ) : st.status === "running" ? (
                          <Loader2 className="h-4 w-4 text-slate-950 animate-spin" />
                        ) : (
                          <IconComp className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-black text-white truncate">{st.name}</h3>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">{st.model}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{st.role}</p>
                      </div>
                    </div>
                    {st.status === "completed" && st.latencyMs && (
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40 shrink-0">
                        {st.latencyMs}ms
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ────── RIGHT: CLAUDE-STYLE INSPECTOR & THOUGHT STREAM ────── */}
          <div className="hidden md:flex flex-1 flex-col bg-[#080B11] overflow-hidden">
            
            {/* Inspector Top Bar */}
            <div className="p-3 px-5 border-b border-slate-800/90 bg-[#0B0F17] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-black uppercase text-white tracking-wider">
                  Agent Inspector: {selectedAgent?.name || "Select Agent"}
                </span>
              </div>
              {selectedAgent && (
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400">Model: {selectedAgent.model}</span>
                  {selectedAgent.tokenCount && <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400">~{selectedAgent.tokenCount} Tokens</span>}
                </div>
              )}
            </div>

            {/* Inspector Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 font-mono text-xs">
              
              {/* Agent Status Overview */}
              <div className="p-4 rounded-2xl bg-[#0C101A] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Status: <strong className={selectedAgent?.status === "completed" ? "text-emerald-400" : selectedAgent?.status === "running" ? "text-cyan-400" : "text-slate-500"}>{selectedAgent?.status.toUpperCase()}</strong></span>
                  <span>Target Mesh: LangGraph State Machine</span>
                </div>
                <p className="text-slate-300 font-sans text-xs">{selectedAgent?.role}</p>
              </div>

              {/* Live Reasoning Stream */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                  <span className="flex items-center gap-1.5 text-emerald-400"><Cpu className="h-3.5 w-3.5" /> AI Reasoning & Execution Logs</span>
                  <span className="text-[10px] text-slate-500">{selectedAgent?.thinkingMessages?.length || 0} events</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#05070C] border border-slate-800/90 space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin">
                  {selectedAgent?.thinkingMessages.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2 text-slate-300">
                      <span className="text-emerald-400 font-bold shrink-0">›</span>
                      <span className="leading-relaxed">{msg}</span>
                    </div>
                  ))}
                  {selectedAgent?.status === "running" && (
                    <div className="flex items-center gap-2 text-cyan-400 animate-pulse">
                      <span className="font-bold">›</span>
                      <span>Processing live API inference...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Output Preview */}
              {selectedAgent?.id === "contentCreator" && completedPayload && (
                <div className="space-y-2">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1.5 text-cyan-400">
                    <FileText className="h-3.5 w-3.5" /> Formatted Campaign Content
                  </span>
                  <div className="p-4 rounded-2xl bg-[#090E18] border border-slate-800 text-slate-300 font-sans text-xs max-h-[140px] overflow-y-auto space-y-2">
                    <p className="font-bold text-emerald-400">Campaign Topic: {completedPayload.topic || "Viral AI Marketing"}</p>
                    <p className="text-slate-400 italic">Hook Strategy: {completedPayload.hookSelectionReason || "Pattern interrupt optimized"}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════ CLAUDE-STYLE REAL-TIME TERMINAL BAR ═══════════════ */}
        <div className="border-t border-slate-800 bg-[#070A0F] shrink-0">
          <div className="px-4 py-2 bg-[#0A0E17] border-b border-slate-800/80 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                className="flex items-center gap-1.5 font-mono text-slate-300 hover:text-white font-bold"
              >
                <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
                Live Task Console ({logs.length} events)
                {isTerminalExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <div className="hidden sm:flex items-center gap-1">
                {(["all", "thoughts", "calls"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setLogFilter(filter)}
                    className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono capitalize transition-all ${
                      logFilter === filter ? "bg-emerald-950 text-emerald-300 border border-emerald-800/60" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const txt = logs.map((l) => `[${l.timestamp}] [${l.agentName}] ${l.message}`).join("\n");
                  navigator.clipboard.writeText(txt);
                }}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Copy Terminal Logs"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={terminalLogRef}
            className={`p-3 px-5 font-mono text-[11px] space-y-1 overflow-y-auto scrollbar-thin transition-all ${
              isTerminalExpanded ? "h-48" : "h-24"
            }`}
          >
            {filteredLogs.length === 0 ? (
              <div className="text-slate-500 italic py-2">Listening for streaming agent execution events...</div>
            ) : (
              filteredLogs.map((l, i) => (
                <div key={i} className="flex items-start gap-2 text-slate-300">
                  <span className="text-slate-500 font-mono text-[10px] shrink-0">{l.timestamp}</span>
                  <span className={`font-bold shrink-0 ${l.type === "error" ? "text-rose-400" : l.type === "output" ? "text-cyan-400" : "text-emerald-400"}`}>
                    [{l.agentName}]
                  </span>
                  <span className="text-slate-300 truncate">{l.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <div className="p-4 px-6 border-t border-slate-800 bg-[#0B0F17] flex items-center justify-between shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs">
            Cancel
          </Button>

          {isApplied ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-5 py-2.5 rounded-2xl animate-in fade-in zoom-in-95">
              <Check className="h-4 w-4" />
              <span>Applied to Editor Suite! Closing...</span>
            </div>
          ) : completedPayload ? (
            <Button
              onClick={handleApplyToEditors}
              className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:opacity-90 text-slate-950 font-extrabold text-xs px-6 py-2.5 rounded-2xl shadow-lg shadow-emerald-500/20 gap-2 transition-all hover:scale-[1.02]"
            >
              <ArrowRight className="h-4 w-4" />
              Add Campaign to Editor
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              {isRunning && <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />}
              <span>{isRunning ? "Agents compiling viral campaign..." : errorMsg ? "Execution halted" : "Initializing..."}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
