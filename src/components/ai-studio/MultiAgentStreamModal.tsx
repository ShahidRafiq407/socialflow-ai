"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  X,
  Globe,
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

interface AgentStep {
  id: string;
  name: string;
  role: string;
  icon: any;
  status: StepStatus;
  thinkingMessages: string[];
}

interface QueuedEvent {
  nodeName: string;
  payload: any;
  type: "progress" | "complete" | "error";
  campaign?: any;
}

/* ─── Agent definitions ─────────────────────────────────────── */
const AGENT_DEFS: Omit<AgentStep, "status">[] = [
  {
    id: "brandAnalyst",
    name: "Brand Analyst",
    role: "Analyzing workspace Brand DNA & target audience",
    icon: Building2,
    thinkingMessages: [
      "Connecting to workspace database...",
      "Extracting Brand DNA profile & writing parameters...",
      "Analyzing brand tone, voice & target audience...",
      "Brand identity verified ✓",
    ],
  },
  {
    id: "trendResearcher",
    name: "Trend Researcher",
    role: "Live Google Search Grounding for viral trends",
    icon: TrendingUp,
    thinkingMessages: [
      "Initiating live Google Search Grounding...",
      "Scanning real-time trending topics & viral content...",
      "Cross-referencing with brand relevance scores...",
      "Sourcing 98% viral trend data with live citations...",
      "Trend intelligence compiled ✓",
    ],
  },
  {
    id: "competitorAnalyst",
    name: "Competitor Analyst",
    role: "Strategic positioning & market differentiation",
    icon: ShieldCheck,
    thinkingMessages: [
      "Analyzing competitor content strategies...",
      "Identifying market gaps & differentiation angles...",
      "Formulating unique positioning framework...",
      "Competitive edge established ✓",
    ],
  },
  {
    id: "contentCreator",
    name: "Pro Copywriter",
    role: "Crafting viral hooks & platform-specific copy",
    icon: PenTool,
    thinkingMessages: [], // Dynamic — filled at runtime per platform/format
  },
  {
    id: "visualizerCreator",
    name: "Visualizer",
    role: "Generating cinematic image & video prompts",
    icon: ImageIcon,
    thinkingMessages: [], // Dynamic
  },
  {
    id: "supervisor",
    name: "CEO Auditor",
    role: "Auditing for AI clichés & final quality approval",
    icon: Crown,
    thinkingMessages: [
      "Running AI-cliché detection scan...",
      'Checking for banned phrases: "fast-paced", "unlock", "dive into"...',
      "Evaluating hook strength & scroll-stop potential...",
      "Verifying human authenticity score...",
      "Final quality audit complete ✓",
    ],
  },
];

/* ─── Utility: pause ────────────────────────────────────────── */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─── Component ─────────────────────────────────────────────── */
export default function MultiAgentStreamModal({
  isOpen,
  onClose,
  platforms,
  contentTypes,
  onCompletePayload,
}: MultiAgentStreamModalProps) {
  // Core state
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedPayload, setCompletedPayload] = useState<any>(null);
  const [isApplied, setIsApplied] = useState(false);

  // Thinking log stream
  const [thinkingLines, setThinkingLines] = useState<string[]>([]);
  const [currentTypingLine, setCurrentTypingLine] = useState("");
  const [actionBanner, setActionBanner] = useState("Initializing Autonomous AI Network...");

  // Refs to avoid stale closures
  const eventQueueRef = useRef<QueuedEvent[]>([]);
  const completedPayloadRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const thinkingContainerRef = useRef<HTMLDivElement>(null);

  /* ── Build format list for dynamic messages ── */
  const formatList = React.useMemo(() => {
    const list: string[] = [];
    platforms.forEach((p) => {
      const types = contentTypes[p] || ["Feed"];
      types.forEach((t) => list.push(`${p.charAt(0).toUpperCase() + p.slice(1)} ${t}`));
    });
    return list;
  }, [platforms, contentTypes]);

  /* ── Initialize steps with dynamic thinking messages ── */
  const buildSteps = useCallback((): AgentStep[] => {
    return AGENT_DEFS.map((def) => {
      let thinkingMessages = [...def.thinkingMessages];

      if (def.id === "contentCreator") {
        thinkingMessages = ["Analyzing brand context & trend data for content generation..."];
        formatList.forEach((fmt) => {
          thinkingMessages.push(`Writing viral hook & caption for [ ${fmt} ]...`);
          thinkingMessages.push(`Generating hashtags & CTA for [ ${fmt} ]...`);
        });
        thinkingMessages.push("All platform captions generated ✓");
      }

      if (def.id === "visualizerCreator") {
        thinkingMessages = ["Reading captions to extract visual context..."];
        formatList.forEach((fmt) => {
          thinkingMessages.push(`Designing cinematic visual prompt for [ ${fmt} ]...`);
        });
        thinkingMessages.push("All visual prompts generated ✓");
      }

      return { ...def, status: "waiting" as StepStatus, thinkingMessages };
    });
  }, [formatList]);

  /* ── Typewriter effect for a single line ── */
  const typewriterLine = useCallback(async (line: string, speedMs = 18) => {
    setCurrentTypingLine("");
    for (let i = 0; i <= line.length; i++) {
      setCurrentTypingLine(line.slice(0, i));
      await sleep(speedMs);
    }
    // Move typed line into completed lines
    setThinkingLines((prev) => [...prev, line]);
    setCurrentTypingLine("");
  }, []);

  /* ── Animate a single agent step with thinking messages ── */
  const animateAgent = useCallback(
    async (stepIndex: number, agentSteps: AgentStep[]) => {
      const step = agentSteps[stepIndex];
      if (!step) return;

      // Set this step as running
      setActiveStepIdx(stepIndex);
      setSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i === stepIndex ? "running" : i < stepIndex ? "completed" : s.status,
        }))
      );
      setActionBanner(`${step.name}: ${step.role}`);
      setThinkingLines([]);
      setCurrentTypingLine("");

      // Type out each thinking message with delays
      for (const msg of step.thinkingMessages) {
        await typewriterLine(msg, 15);
        await sleep(600 + Math.random() * 800);
      }

      // Mark completed
      setSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i === stepIndex ? "completed" : s.status,
        }))
      );
    },
    [typewriterLine]
  );

  /* ── Main pipeline runner ── */
  const runPipeline = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setErrorMsg(null);
    setIsApplied(false);
    setCompletedPayload(null);
    completedPayloadRef.current = null;
    eventQueueRef.current = [];

    const agentSteps = buildSteps();
    setSteps(agentSteps);
    setActiveStepIdx(0);
    setActionBanner("Launching Autonomous AI Network...");
    setThinkingLines([]);

    const abort = new AbortController();
    abortRef.current = abort;

    // ─── Start SSE fetch in background ───
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
          let errorMessage = `Server error (${res.status} ${res.statusText})`;
          try {
            const err = await res.json();
            errorMessage = err.error || errorMessage;
          } catch {
            const textErr = await res.text().catch(() => "");
            if (textErr && !textErr.includes("<!DOCTYPE")) {
              errorMessage = textErr.slice(0, 150);
            }
          }
          throw new Error(errorMessage);
        }
        if (!res.body) throw new Error("No response stream received.");

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
              } else if (eventData.type === "complete") {
                // THIS is the critical event with the final campaign payload
                completedPayloadRef.current = eventData.campaign;
                eventQueueRef.current.push({
                  type: "complete",
                  nodeName: "__complete__",
                  payload: null,
                  campaign: eventData.campaign,
                });
              } else if (eventData.type === "error") {
                eventQueueRef.current.push({
                  type: "error",
                  nodeName: "__error__",
                  payload: eventData.error,
                });
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          eventQueueRef.current.push({
            type: "error",
            nodeName: "__error__",
            payload: err.message,
          });
        }
      }
    })();

    // ─── Animate agents step by step ───
    // We wait for real SSE events or a timeout before advancing each agent
    const STEP_IDS = agentSteps.map((s) => s.id);

    for (let i = 0; i < agentSteps.length; i++) {
      const stepId = STEP_IDS[i];

      // Check for errors first
      const errorEvent = eventQueueRef.current.find((e) => e.type === "error");
      if (errorEvent) {
        setErrorMsg(typeof errorEvent.payload === "string" ? errorEvent.payload : "An error occurred.");
        setIsRunning(false);
        return;
      }

      // Start animating this agent (typewriter thinking messages)
      const animationPromise = animateAgent(i, agentSteps);

      // Wait for either: real SSE event for this node, or the animation to finish
      // This ensures we show the animation for a minimum time
      const waitForSSE = async () => {
        // Poll until this node's SSE event arrives or complete/error event arrives
        const maxWait = 120_000; // 2 minutes max per agent
        const start = Date.now();
        while (Date.now() - start < maxWait) {
          const hasNodeEvent = eventQueueRef.current.some(
            (e) => e.nodeName === stepId || e.type === "complete" || e.type === "error"
          );
          if (hasNodeEvent) return;
          await sleep(300);
        }
      };

      // Run animation and SSE wait in parallel
      await Promise.all([animationPromise, waitForSSE()]);

      // Extra check for error after waiting
      const postError = eventQueueRef.current.find((e) => e.type === "error");
      if (postError) {
        setErrorMsg(typeof postError.payload === "string" ? postError.payload : "An error occurred.");
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

    // ─── Wait for SSE to fully complete ───
    await ssePromise;

    // ─── Set final payload ───
    const finalPayload = completedPayloadRef.current;
    if (finalPayload) {
      setCompletedPayload(finalPayload);
      setActionBanner("✨ Campaign Generated Successfully! All agents complete.");
    } else {
      // Fallback: try to find campaignPayload from progress events
      const contentEvent = eventQueueRef.current.find(
        (e) => e.nodeName === "visualizerCreator" || e.nodeName === "contentCreator"
      );
      if (contentEvent?.payload?.campaignPayload) {
        setCompletedPayload(contentEvent.payload.campaignPayload);
        completedPayloadRef.current = contentEvent.payload.campaignPayload;
        setActionBanner("✨ Campaign Generated Successfully! All agents complete.");
      } else {
        setErrorMsg("Pipeline completed but no campaign data was returned. Please try again.");
      }
    }

    setIsRunning(false);
  }, [isRunning, platforms, contentTypes, buildSteps, animateAgent]);

  /* ── Auto-start when modal opens ── */
  useEffect(() => {
    if (isOpen && !hasStartedRef.current) {
      hasStartedRef.current = true;
      // Small delay to let modal animate in
      const timer = setTimeout(() => runPipeline(), 400);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      hasStartedRef.current = false;
      abortRef.current?.abort();
    }
  }, [isOpen]);

  /* ── Auto-scroll thinking container ── */
  useEffect(() => {
    if (thinkingContainerRef.current) {
      thinkingContainerRef.current.scrollTop = thinkingContainerRef.current.scrollHeight;
    }
  }, [thinkingLines, currentTypingLine]);

  /* ── Apply to Editor ── */
  const handleApplyToEditors = () => {
    const payload = completedPayloadRef.current || completedPayload;
    if (payload) {
      setIsApplied(true);
      onCompletePayload(payload);
      setTimeout(() => {
        onClose();
        // Reset state for next use
        setIsApplied(false);
        setCompletedPayload(null);
        completedPayloadRef.current = null;
        hasStartedRef.current = false;
      }, 1800);
    }
  };

  if (!isOpen) return null;

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercentage = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const currentAgent = steps[activeStepIdx] || steps[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-start sm:items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden my-2 sm:my-4 max-h-[95vh] sm:max-h-[90vh]">
        
        {/* ─── HEADER ─── */}
        <div className="p-3 sm:p-5 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center shadow-md shadow-purple-500/20 text-white shrink-0">
              <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wide truncate">
                Autonomous AI Studio
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                Generating tailored content for {platforms.length} platform(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* ─── PROGRESS BAR ─── */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-600 via-indigo-500 to-pink-500 h-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* ─── ACTION BANNER ─── */}
        <div className="bg-purple-950/20 border-b border-purple-500/20 px-4 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between text-[10px] sm:text-xs font-extrabold shrink-0">
          <div className="flex items-center gap-2 text-purple-300 min-w-0">
            {isRunning && <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin text-purple-400 shrink-0" />}
            {!isRunning && completedPayload && <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400 shrink-0" />}
            {!isRunning && errorMsg && <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-400 shrink-0" />}
            <span className="truncate">{actionBanner}</span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-purple-400 uppercase tracking-widest ml-2 shrink-0">
            {progressPercentage}%
          </span>
        </div>

        {/* ─── BODY (scrollable) ─── */}
        <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0">
          
          {/* Error */}
          {errorMsg && (
            <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-[10px] sm:text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-words overflow-hidden">{errorMsg}</span>
            </div>
          )}

          {/* ─── COMPLETED STEPS → COLLAPSED PILLS ─── */}
          <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
            {steps
              .filter((s) => s.status === "completed")
              .map((st) => (
                <div
                  key={st.id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold animate-in fade-in slide-in-from-left-2 duration-300"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span>{st.name}</span>
                </div>
              ))}
          </div>

          {/* ─── ACTIVE AGENT SPOTLIGHT ─── */}
          {currentAgent && (
            <div
              className={`p-3 sm:p-5 rounded-xl sm:rounded-2xl border shadow-xl space-y-3 sm:space-y-4 transition-all duration-500 ${
                currentAgent.status === "running"
                  ? "border-purple-500/40 bg-gradient-to-b from-purple-500/5 via-slate-50/50 to-white dark:from-purple-950/30 dark:via-slate-900 dark:to-slate-900"
                  : currentAgent.status === "completed" && !isRunning && completedPayload
                  ? "border-emerald-500/30 bg-gradient-to-b from-emerald-500/5 via-slate-50/50 to-white dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
              }`}
            >
              {/* Agent Header */}
              <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2 sm:pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-7 w-7 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md font-bold text-white shrink-0 ${
                      currentAgent.status === "running"
                        ? "bg-purple-600 shadow-purple-500/30"
                        : currentAgent.status === "completed"
                        ? "bg-emerald-600 shadow-emerald-500/30"
                        : "bg-slate-600 shadow-slate-500/30"
                    }`}
                  >
                    {currentAgent.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : (
                      <currentAgent.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-[11px] sm:text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      {currentAgent.name}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                      {currentAgent.role}
                    </p>
                  </div>
                </div>

                {currentAgent.status === "running" && (
                  <Badge
                    variant="outline"
                    className="text-[9px] font-extrabold uppercase border-purple-500/40 text-purple-400 bg-purple-950/40 animate-pulse px-2 py-0.5"
                  >
                    Active
                  </Badge>
                )}
                {currentAgent.status === "completed" && (
                  <Badge
                    variant="outline"
                    className="text-[9px] font-extrabold uppercase border-emerald-500/40 text-emerald-400 bg-emerald-950/40 px-2 py-0.5"
                  >
                    Complete
                  </Badge>
                )}
              </div>

              {/* ─── LIVE THINKING LOG (Terminal Style) ─── */}
              <div
                ref={thinkingContainerRef}
                className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-slate-950 text-slate-200 font-mono text-[10px] sm:text-[11px] space-y-1.5 border border-slate-800 min-h-[80px] sm:min-h-[100px] max-h-[140px] sm:max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700"
              >
                {/* Already typed lines */}
                {thinkingLines.map((line, i) => (
                  <div key={i} className="flex items-start gap-2 text-slate-400">
                    <span className="text-emerald-500 font-bold shrink-0">✓</span>
                    <span>{line}</span>
                  </div>
                ))}

                {/* Currently typing line (cursor blink) */}
                {(currentTypingLine || currentAgent.status === "running") && (
                  <div className="flex items-start gap-2 text-slate-200">
                    <span className="text-purple-400 font-bold shrink-0">&gt;</span>
                    <span>
                      {currentTypingLine}
                      <span className="inline-block w-1.5 h-3.5 bg-purple-400 animate-pulse ml-0.5 align-middle" />
                    </span>
                  </div>
                )}

                {/* All done message */}
                {!isRunning && completedPayload && thinkingLines.length === 0 && (
                  <div className="flex items-center gap-2 text-emerald-400 font-sans font-semibold">
                    <Zap className="h-3.5 w-3.5" />
                    <span>All agents completed. Campaign ready for review.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── FOOTER ─── */}
        <div className="p-3 sm:p-4 px-4 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[11px] sm:text-xs">
            Cancel
          </Button>

          {isApplied ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 rounded-xl animate-in fade-in zoom-in-95 duration-300">
              <Check className="h-4 w-4" />
              <span>Added to Content Editor! Closing...</span>
            </div>
          ) : completedPayload ? (
            <Button
              onClick={handleApplyToEditors}
              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-extrabold text-[11px] sm:text-xs px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl shadow-lg shadow-purple-500/20 gap-2 transition-all hover:scale-[1.02]"
            >
              <ArrowRight className="h-4 w-4" />
              Add to Editor Section
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              {isRunning && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
              <span>{isRunning ? "AI Agents are working..." : errorMsg ? "Pipeline failed" : "Preparing..."}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
