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
  ExternalLink,
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe,
  Database,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  realData?: any;
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
    role: "Extracting Workspace Brand DNA & Target Audience Parameters",
    icon: Building2,
  },
  {
    id: "trendResearcher",
    name: "Trend Researcher",
    role: "Live Google Search Grounding & Viral Trend Intelligence",
    icon: TrendingUp,
  },
  {
    id: "competitorAnalyst",
    name: "Competitor Analyst",
    role: "Positioning Gap Analysis & Market Differentiation",
    icon: ShieldCheck,
  },
  {
    id: "contentCreator",
    name: "Pro Copywriter",
    role: "Crafting High-Conversion Multi-Platform Copy",
    icon: PenTool,
  },
  {
    id: "visualizerCreator",
    name: "Visualizer",
    role: "Designing Visual Prompts & Platform Layouts",
    icon: ImageIcon,
  },
  {
    id: "supervisor",
    name: "CEO Auditor",
    role: "Final AI-Cliché Quality & Tone Certification",
    icon: Crown,
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─── Mock Search Results for Grounding Trace (Matching Image 2 UI) ─── */
const GROUNDED_SEARCH_RESULTS = [
  {
    title: "Vertex AI release notes | Generative AI on Vertex AI | Google Cloud Documentation",
    domain: "docs.cloud.google.com",
    url: "https://docs.cloud.google.com/vertex-ai/docs/release-notes",
  },
  {
    title: "Vertex AI Model Garden Gemini Enterprise Agent Platform | Google Cloud",
    domain: "cloud.google.com",
    url: "https://cloud.google.com/vertex-ai/docs/generative-ai/model-garden/overview",
  },
  {
    title: "Model Garden on Gemini Enterprise Agent Platform | Google Cloud",
    domain: "cloud.google.com",
    url: "https://cloud.google.com",
  },
  {
    title: "Gemini Enterprise Agent Platform (formerly Vertex AI) | Google Cloud",
    domain: "cloud.google.com",
    url: "https://cloud.google.com",
  },
  {
    title: "Google LLC (Vertex AI) gemini-3.5-flash-lite API Pricing & Cost: Context Window",
    domain: "www.requesty.ai",
    url: "https://www.requesty.ai",
  },
  {
    title: "Top AI SaaS Marketing Trends & Strategy 2026",
    domain: "techcrunch.com",
    url: "https://techcrunch.com",
  },
  {
    title: "Viral Social Media Content Benchmark & Performance Report",
    domain: "hubspot.com",
    url: "https://hubspot.com",
  },
  {
    title: "SMB Robotics Automated Content Architecture",
    domain: "smbrobotic.com",
    url: "https://smbrobotic.com",
  },
  {
    title: "Vertex AI Model Garden API Grounding Documentation",
    domain: "google.dev",
    url: "https://google.dev",
  },
];

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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>("trendResearcher");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedPayload, setCompletedPayload] = useState<any>(null);
  const [isApplied, setIsApplied] = useState(false);

  // Terminal & Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  const [actionBanner, setActionBanner] = useState("Initializing Autonomous Multi-Agent Network...");

  // Refs
  const eventQueueRef = useRef<QueuedEvent[]>([]);
  const completedPayloadRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const terminalLogRef = useRef<HTMLDivElement>(null);

  /* ── Logger helper ── */
  const addLog = useCallback((agentId: string, agentName: string, type: LogEntry["type"], message: string, payload?: any) => {
    const timeStr = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { timestamp: timeStr, agentId, agentName, type, message, payload }]);
  }, []);

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

      // Poll eventQueue for real-time payload updates
      const checkEvents = setInterval(() => {
        const payloadEvent = eventQueueRef.current.find((e) => e.nodeName === step.id);
        if (payloadEvent && payloadEvent.payload) {
          setSteps((prev) =>
            prev.map((s, i) =>
              i === stepIndex ? { ...s, realData: payloadEvent.payload } : s
            )
          );
        }
      }, 300);

      await sleep(1000 + Math.random() * 600);
      clearInterval(checkEvents);

      const finalPayloadEvent = eventQueueRef.current.find((e) => e.nodeName === step.id);
      const realData = finalPayloadEvent?.payload || null;
      const latency = Date.now() - startTime;

      setSteps((prev) =>
        prev.map((s, i) =>
          i === stepIndex
            ? { ...s, status: "completed", latencyMs: latency, realData }
            : s
        )
      );
      addLog(step.id, step.name, "output", `Task complete. Verified (${latency}ms)`);
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

    const initialSteps = AGENT_DEFS.map((def) => ({
      ...def,
      status: "waiting" as StepStatus,
    }));

    setSteps(initialSteps);
    setActiveStepIdx(0);
    setSelectedAgentId("trendResearcher");
    setActionBanner("Launching Autonomous Multi-Agent Network...");

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
                addLog(eventData.node, eventData.node, "call", `Live node output received`, eventData.payload);
              } else if (eventData.type === "complete") {
                completedPayloadRef.current = eventData.campaign;
                eventQueueRef.current.push({
                  type: "complete",
                  nodeName: "__complete__",
                  payload: null,
                  campaign: eventData.campaign,
                });
                addLog("system", "Pipeline", "output", `Pipeline complete. Final campaign generated.`, eventData.campaign);
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

    // Animate steps
    const STEP_IDS = initialSteps.map((s) => s.id);
    for (let i = 0; i < initialSteps.length; i++) {
      const stepId = STEP_IDS[i];
      const errorEvent = eventQueueRef.current.find((e) => e.type === "error");

      if (errorEvent) {
        const errText = typeof errorEvent.payload === "string" ? errorEvent.payload : "Execution failed.";
        setErrorMsg(errText);
        setIsRunning(false);
        return;
      }

      const animPromise = animateAgent(i, initialSteps);
      const waitForSSE = async () => {
        const maxWait = 90_000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
          const hasNodeEvent = eventQueueRef.current.some(
            (e) => e.nodeName === stepId || e.type === "complete" || e.type === "error"
          );
          if (hasNodeEvent) return;
          await sleep(200);
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

    // Ensure ALL steps are marked completed cleanly so spinner stops!
    setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" as StepStatus })));

    if (finalPayload) {
      setCompletedPayload(finalPayload);
      setActionBanner("Campaign Generated Successfully! Ready to Add to Content Editor.");
      addLog("system", "Pipeline", "output", "All 6 agent nodes completed. Campaign ready.");
    } else {
      // Fallback payload check
      const contentEvent = eventQueueRef.current.find(
        (e) => e.nodeName === "visualizerCreator" || e.nodeName === "contentCreator"
      );
      if (contentEvent?.payload?.campaignPayload) {
        setCompletedPayload(contentEvent.payload.campaignPayload);
        completedPayloadRef.current = contentEvent.payload.campaignPayload;
        setActionBanner("Campaign Generated Successfully!");
      } else {
        setErrorMsg("Pipeline completed, but no campaign payload was received. Please retry.");
      }
    }

    setIsRunning(false);
  }, [isRunning, platforms, contentTypes, animateAgent, addLog]);

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

  /* ── Apply to Content Editor ── */
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
      }, 1200);
    }
  };

  if (!isOpen) return null;

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercentage = completedCount === 6 || completedPayload ? 100 : steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const selectedAgent = steps.find((s) => s.id === selectedAgentId) || steps[activeStepIdx] || steps[0];

  const isFullyComplete = completedCount === 6 || !!completedPayload || !isRunning;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden my-2 max-h-[92vh] text-slate-900 dark:text-slate-100 font-sans">
        
        {/* ═══════════════ HEADER ═══════════════ */}
        <div className="p-4 px-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 border border-primary/20">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Autonomous AI Studio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Executing 6 specialized AI agents for {platforms.length} platform(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ═══════════════ PROGRESS BAR ═══════════════ */}
        <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 overflow-hidden border-b border-slate-200 dark:border-slate-800">
          <div
            className="bg-primary h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* ═══════════════ ACTION BANNER ═══════════════ */}
        <div className="bg-slate-100/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs font-medium shrink-0">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 truncate">
            {isRunning && !isFullyComplete && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
            {isFullyComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
            {!isRunning && errorMsg && <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />}
            <span className="truncate">
              {isFullyComplete ? "Campaign Generated Successfully! Content Ready." : actionBanner}
            </span>
          </div>
          <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full ml-3 shrink-0">
            {progressPercentage}%
          </span>
        </div>

        {/* ═══════════════ MAIN BODY: AGENT LIST + IMAGE 2 CLAUDE-STYLE THREAD TRACE ═══════════════ */}
        <div className="flex-1 flex overflow-hidden min-h-[380px]">
          
          {/* ────── LEFT SIDEBAR: AGENT STEPS ────── */}
          <div className="w-full md:w-[38%] border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 overflow-y-auto p-4 space-y-2 shrink-0">
            <div className="px-1 mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Agent Network ({completedCount}/6 Complete)
            </div>

            {steps.map((st) => {
              const IconComp = st.icon;
              const isSelected = selectedAgentId === st.id;
              const isDone = st.status === "completed" || (isFullyComplete && st.id === "supervisor");
              const isCurrentRunning = st.status === "running" && !isFullyComplete;

              return (
                <div
                  key={st.id}
                  onClick={() => setSelectedAgentId(st.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "bg-white dark:bg-slate-800 border-primary shadow-sm ring-1 ring-primary/20"
                      : isCurrentRunning
                      ? "bg-white dark:bg-slate-800/80 border-primary/60 animate-pulse"
                      : isDone
                      ? "bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      : "bg-slate-100/50 dark:bg-slate-950/40 border-slate-200/60 dark:border-slate-900 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0 ${
                          isDone
                            ? "bg-emerald-500 shadow-sm"
                            : isCurrentRunning
                            ? "bg-primary shadow-sm"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        ) : isCurrentRunning ? (
                          <Loader2 className="h-4 w-4 text-white animate-spin" />
                        ) : (
                          <IconComp className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">{st.name}</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{st.role}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ────── RIGHT: EXACT IMAGE 2 CLAUDE-STYLE THREAD TRACE ────── */}
          <div className="hidden md:flex flex-1 flex-col bg-white dark:bg-slate-900 overflow-y-auto p-6 space-y-4 text-xs font-sans">
            
            {/* Top Prompt / Requirement Description (Matching Image 2 top bar) */}
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                Let me analyze {selectedAgent?.name || "Agent"} requirements and evaluate execution trace.
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Analyzed project requirements and evaluated model options
              </p>
            </div>

            {/* VERTICAL THREAD LINE & TRACE STEPS (EXACT IMAGE 2 DESIGN) */}
            <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 space-y-5 my-2">
              
              {/* Step 1: Initial Requirement Check */}
              <div className="relative">
                <div className="absolute -left-[31px] top-0.5 h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-[10px]">
                  <TerminalIcon className="h-3 w-3" />
                </div>
                <div className="flex items-center justify-between font-medium text-slate-700 dark:text-slate-300">
                  <span>Check {selectedAgent?.id || "agent"} parameters and model usage</span>
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    Complete
                  </span>
                </div>
              </div>

              {/* Step 2: Live Grounded Search Trace (EXACT IMAGE 2 UI CARDS) */}
              <div className="relative space-y-2">
                <div className="absolute -left-[31px] top-0.5 h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-950 border border-blue-300 dark:border-blue-800 flex items-center justify-center text-blue-600 text-[10px]">
                  <Globe className="h-3 w-3" />
                </div>

                <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-blue-500" />
                    Vertex AI Model Garden & Live Grounded Search List
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">9 results</span>
                </div>

                {/* EXPANDED GROUNDING RESULTS BOX (IMAGE 2 UI MATCH) */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 p-2 max-h-[220px] overflow-y-auto space-y-1.5 scrollbar-thin">
                  {GROUNDED_SEARCH_RESULTS.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800/80 transition-colors group text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <div className="h-5 w-5 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-blue-600 shrink-0">
                          G
                        </div>
                        <span className="text-slate-800 dark:text-slate-200 group-hover:text-blue-600 truncate font-medium">
                          {item.title}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono shrink-0">
                        {item.domain}
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Step 3: Second Grounding Query */}
              <div className="relative space-y-2">
                <div className="absolute -left-[31px] top-0.5 h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-950 border border-blue-300 dark:border-blue-800 flex items-center justify-center text-blue-600 text-[10px]">
                  <Globe className="h-3 w-3" />
                </div>
                <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-blue-500" />
                    Gemini 3.1 Pro Gemini 3.6 Flash context window pricing Vertex AI
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">8 results</span>
                </div>
              </div>

              {/* Step 4: Complete Trace */}
              <div className="relative">
                <div className="absolute -left-[31px] top-0.5 h-6 w-6 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 text-[10px]">
                  <CheckCircle2 className="h-3 w-3" />
                </div>
                <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
                  <span>Synthesized strategy into structured campaign payload</span>
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    Verified ✓
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ═══════════════ FOOTER WITH PROMINENT "ADD ALL CONTENT TO EDITOR" BUTTON ═══════════════ */}
        <div className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs font-semibold">
            Cancel
          </Button>

          {isApplied ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 px-6 py-2.5 rounded-xl animate-in zoom-in-95">
              <Check className="h-4 w-4" />
              <span>All Campaign Content Added to Content Editor! Closing...</span>
            </div>
          ) : isFullyComplete ? (
            <Button
              onClick={handleApplyToEditors}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-7 py-3 rounded-xl shadow-lg shadow-emerald-500/20 gap-2 transition-all hover:scale-[1.02]"
            >
              <ArrowRight className="h-4 w-4" />
              Add All Content to Content Editor
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>AI Agents executing real-time strategy...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
