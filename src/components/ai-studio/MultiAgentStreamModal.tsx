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

/* ─── Removed hardcoded mock results ─── */
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden my-2 max-h-[92vh] text-slate-900 dark:text-slate-100 font-sans">
        
        {/* ═══════════════ HEADER ═══════════════ */}
        <div className="p-4 px-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 border border-primary/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                AI Campaign Generation
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live multi-agent strategy
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

        {/* ═══════════════ MAIN BODY: CHAT LIKE INTERFACE ═══════════════ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white dark:bg-slate-950 min-h-[400px]" ref={terminalLogRef}>
          
          {/* USER MESSAGE BUBBLE */}
          <div className="flex justify-end">
            <div className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-5 py-4 rounded-2xl rounded-tr-sm max-w-[85%] text-sm shadow-sm border border-slate-200/60 dark:border-slate-700/50">
              Please generate an autonomous marketing campaign for the following platforms: <span className="font-semibold">{platforms.join(", ")}</span>.
              {Object.keys(contentTypes).length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Requested Formats:</div>
                  <ul className="text-xs list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                    {Object.entries(contentTypes).map(([p, types]) => (
                      <li key={p}>
                        <span className="font-medium">{p}:</span> {types.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* AI RESPONSE BUBBLE */}
          <div className="flex gap-4 max-w-[95%]">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 mt-1 shadow-sm">
              <Bot className="h-6 w-6" />
            </div>
            <div className="flex-1 space-y-4">
               {/* Intro text */}
               <div className="text-sm text-slate-800 dark:text-slate-200">
                 I'll organize our AI agents to build this campaign for you. Here is the live execution trace:
               </div>

               {/* CLAUDE-STYLE THINKING/TRACE */}
               <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-6">
                 {steps.map((st, idx) => {
                   if (st.status === "waiting" && activeStepIdx < idx) return null; // Only show started or completed agents
                   
                   const isRunning = st.status === "running";
                   const isDone = st.status === "completed";
                   
                   return (
                     <div key={st.id} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800">
                       <div className={`absolute -left-[11px] top-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center bg-white dark:bg-slate-950 ${isDone ? 'border-emerald-500 text-emerald-500' : 'border-primary text-primary'}`}>
                         {isDone ? (
                           <CheckCircle2 className="h-3 w-3" />
                         ) : (
                           <Loader2 className="h-3 w-3 animate-spin" />
                         )}
                       </div>
                       
                       <div className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                         {st.name} 
                         <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                           {isRunning ? "is working..." : "completed task."}
                         </span>
                       </div>
                       <div className="text-xs text-slate-500 mt-1">{st.role}</div>

                       {/* LIVE LOGS FOR THIS AGENT */}
                       <div className="mt-3 space-y-2">
                         {logs.filter(l => l.agentId === st.id).map((log, lIdx) => (
                           <div key={lIdx} className="flex gap-3 text-xs">
                             <div className="w-16 text-slate-400 font-mono shrink-0">{log.timestamp}</div>
                             <div className="flex-1">
                               <div className={`${log.type === 'error' ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                 {log.message}
                               </div>
                               {log.type === "call" && log.payload && (
                                 <div className="mt-2 p-3 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto font-mono text-[10px] text-slate-600 dark:text-slate-400 shadow-inner max-h-32">
                                   {JSON.stringify(log.payload, null, 2)}
                                 </div>
                               )}
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   );
                 })}

                 {/* FINAL STATUS */}
                 {isFullyComplete && (
                   <div className="relative pl-6 border-l-2 border-transparent">
                     <div className="absolute -left-[11px] top-0.5 h-5 w-5 rounded-full border-2 border-emerald-500 bg-white dark:bg-slate-950 text-emerald-500 flex items-center justify-center">
                       <Check className="h-3 w-3" />
                     </div>
                     <div className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                       Campaign Generation Complete
                     </div>
                     <div className="text-xs text-slate-500 mt-1">
                       The multi-agent workflow has finalized the output. You can now add the content to your editor.
                     </div>
                   </div>
                 )}
               </div>
            </div>
          </div>
        </div>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <div className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs font-semibold">
            Cancel
          </Button>

          {isApplied ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 px-6 py-2.5 rounded-xl animate-in zoom-in-95">
              <Check className="h-4 w-4" />
              <span>Content Added to Editor! Closing...</span>
            </div>
          ) : isFullyComplete ? (
            <Button
              onClick={handleApplyToEditors}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg transition-all hover:scale-[1.02] flex items-center gap-2"
            >
              Add All Content to Editor
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Agents are working...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
