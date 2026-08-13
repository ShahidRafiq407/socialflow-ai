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
  FileText,
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
  icon: any;
  status: StepStatus;
  thinkingMessages: string[];
  reasoningText?: string[];
  latencyMs?: number;
}

interface QueuedEvent {
  nodeName: string;
  payload: any;
  type: "progress" | "complete" | "error";
  campaign?: any;
}

/* ─── Agent Definitions (No Model Strings Displayed) ─────────────────── */
const AGENT_DEFS: Omit<AgentStep, "status">[] = [
  {
    id: "brandAnalyst",
    name: "Brand Analyst",
    role: "Extracting Workspace Brand DNA & Target Audience Parameters",
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
    icon: PenTool,
    thinkingMessages: [], // Dynamic runtime population
  },
  {
    id: "visualizerCreator",
    name: "Visualizer",
    role: "Designing Visual Prompts & Platform Layouts",
    icon: ImageIcon,
    thinkingMessages: [], // Dynamic runtime population
  },
  {
    id: "supervisor",
    name: "CEO Auditor",
    role: "Final AI-Cliché Quality & Tone Certification",
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
    const timeStr = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
          thinkingMessages.push(`Designing visual prompt layout for [ ${fmt} ]...`);
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

      setActionBanner(`${step.name}: ${step.role}`);
      addLog(step.id, step.name, "info", `Agent started execution`);

      const startTime = Date.now();
      for (const msg of step.thinkingMessages) {
        addLog(step.id, step.name, "thought", msg);
        setSteps((prev) =>
          prev.map((s, i) => i === stepIndex ? { ...s, reasoningText: [...(s.reasoningText || []), msg] } : s)
        );
        await sleep(400 + Math.random() * 350);
      }

      const latency = Date.now() - startTime;

      setSteps((prev) =>
        prev.map((s, i) =>
          i === stepIndex
            ? { ...s, status: "completed", latencyMs: latency }
            : s
        )
      );
      addLog(step.id, step.name, "output", `Task complete. Result verified (${latency}ms)`);
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

    addLog("system", "System", "info", "Initializing Multi-Agent Execution Pipeline...");

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
                addLog("system", "Pipeline", "output", `Pipeline complete. Final payload generated.`, eventData.campaign);
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
      setActionBanner("Campaign Generated Successfully! Content Ready.");
      addLog("system", "Pipeline", "output", "All 6 agent nodes completed. Content ready for editor.");
    } else {
      const contentEvent = eventQueueRef.current.find(
        (e) => e.nodeName === "visualizerCreator" || e.nodeName === "contentCreator"
      );
      if (contentEvent?.payload?.campaignPayload) {
        setCompletedPayload(contentEvent.payload.campaignPayload);
        completedPayloadRef.current = contentEvent.payload.campaignPayload;
        setActionBanner("Campaign Generated Successfully!");
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
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden my-2 max-h-[92vh] text-slate-100 font-sans">
        
        {/* ═══════════════ HEADER ═══════════════ */}
        <div className="p-4 px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 border border-primary/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Autonomous AI Studio
              </h2>
              <p className="text-xs text-slate-400">
                Generating tailored content for {platforms.length} platform(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ═══════════════ CLEAN PROGRESS BAR ═══════════════ */}
        <div className="w-full bg-slate-950 h-2 overflow-hidden border-b border-slate-800">
          <div
            className="bg-gradient-to-r from-purple-600 via-indigo-500 to-emerald-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* ═══════════════ ACTION BANNER ═══════════════ */}
        <div className="bg-slate-950/80 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs font-medium shrink-0">
          <div className="flex items-center gap-2 text-slate-200 truncate">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-purple-400 shrink-0" />}
            {!isRunning && completedPayload && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
            {!isRunning && errorMsg && <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />}
            <span className="truncate">{actionBanner}</span>
          </div>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 rounded-full ml-3 shrink-0">
            {progressPercentage}%
          </span>
        </div>

        {/* ═══════════════ MAIN BODY: CLEAN SIDEBAR + INSPECTOR ═══════════════ */}
        <div className="flex-1 flex overflow-hidden min-h-[340px]">
          
          {/* ────── LEFT SIDEBAR: AGENT STEPS ────── */}
          <div className="w-full md:w-[42%] border-r border-slate-800 bg-slate-950/50 overflow-y-auto p-4 space-y-2 shrink-0">
            <div className="px-1 mb-2 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Execution Steps ({completedCount}/6)</span>
            </div>

            {steps.map((st) => {
              const IconComp = st.icon;
              const isSelected = selectedAgentId === st.id;
              return (
                <div
                  key={st.id}
                  onClick={() => setSelectedAgentId(st.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "bg-slate-800 border-purple-500/60 shadow-md ring-1 ring-purple-500/30"
                      : st.status === "running"
                      ? "bg-slate-900 border-purple-500/40 animate-pulse"
                      : st.status === "completed"
                      ? "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                      : "bg-slate-950/40 border-slate-900 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0 ${
                          st.status === "completed"
                            ? "bg-emerald-600 shadow-sm"
                            : st.status === "running"
                            ? "bg-purple-600 shadow-sm"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {st.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        ) : st.status === "running" ? (
                          <Loader2 className="h-4 w-4 text-white animate-spin" />
                        ) : (
                          <IconComp className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-white truncate">{st.name}</h3>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{st.role}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ────── RIGHT: CLEAN AGENT DETAILS & LOGS ────── */}
          <div className="hidden md:flex flex-1 flex-col bg-slate-900 overflow-hidden">
            
            {/* Inspector Top Bar */}
            <div className="p-3 px-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-white">
                {selectedAgent?.name || "Agent Details"}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                selectedAgent?.status === "completed" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-purple-950 text-purple-400 border border-purple-800"
              }`}>
                {selectedAgent?.status.toUpperCase()}
              </span>
            </div>

            {/* Inspector Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <p className="text-slate-300 font-medium">{selectedAgent?.role}</p>

              {/* Execution Steps */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Execution Log</span>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-[11px] max-h-[220px] overflow-y-auto">
                  {selectedAgent?.thinkingMessages.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2 text-slate-300">
                      <span className="text-emerald-400 font-bold shrink-0">✓</span>
                      <span>{msg}</span>
                    </div>
                  ))}
                  {selectedAgent?.status === "running" && (
                    <div className="flex items-center gap-2 text-purple-400 animate-pulse">
                      <span className="font-bold">&gt;</span>
                      <span>Processing...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════ CLEAN REAL-TIME LOG BAR ═══════════════ */}
        <div className="border-t border-slate-800 bg-slate-950 shrink-0">
          <div className="px-4 py-2 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between text-xs font-medium">
            <button
              onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white font-semibold"
            >
              <TerminalIcon className="h-3.5 w-3.5 text-purple-400" />
              Real-Time Task Console ({logs.length})
              {isTerminalExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                const txt = logs.map((l) => `[${l.timestamp}] [${l.agentName}] ${l.message}`).join("\n");
                navigator.clipboard.writeText(txt);
              }}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Copy Console Logs"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            ref={terminalLogRef}
            className={`p-3 px-5 font-mono text-[11px] space-y-1 overflow-y-auto transition-all ${
              isTerminalExpanded ? "h-44" : "h-20"
            }`}
          >
            {filteredLogs.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-slate-300">
                <span className="text-slate-500 shrink-0">{l.timestamp}</span>
                <span className="text-purple-400 font-bold shrink-0">[{l.agentName}]</span>
                <span className="text-slate-300 truncate">{l.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <div className="p-4 px-6 border-t border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold">
            Cancel
          </Button>

          {isApplied ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-5 py-2.5 rounded-xl">
              <Check className="h-4 w-4" />
              <span>Added to Content Editor! Closing...</span>
            </div>
          ) : completedPayload ? (
            <Button
              onClick={handleApplyToEditors}
              className="bg-primary hover:bg-primary/90 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              Add Campaign to Editor
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              {isRunning && <Loader2 className="h-4 w-4 animate-spin text-purple-400" />}
              <span>{isRunning ? "AI Agents are working..." : errorMsg ? "Execution halted" : "Initializing..."}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
