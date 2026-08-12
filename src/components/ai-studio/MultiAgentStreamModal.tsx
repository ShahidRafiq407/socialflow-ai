"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Search,
  ChevronRight,
  Sparkle,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface MultiAgentStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: string[];
  contentTypes: Record<string, string[]>;
  onCompletePayload: (payload: any) => void;
}

interface AgentStep {
  id: string;
  name: string;
  role: string;
  icon: any;
  status: "waiting" | "running" | "completed" | "error";
  details?: any;
  thoughtLog?: string[];
}

export default function MultiAgentStreamModal({
  isOpen,
  onClose,
  platforms,
  contentTypes,
  onCompletePayload,
}: MultiAgentStreamModalProps) {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedPayload, setCompletedPayload] = useState<any | null>(null);

  const [steps, setSteps] = useState<AgentStep[]>([
    {
      id: "brandAnalyst",
      name: "Brand Analyst Agent",
      role: "Analyzing workspace Brand DNA & target audience",
      icon: Building2,
      status: "waiting",
      thoughtLog: [
        "Connecting to database...",
        "Extracting Brand DNA & writing style parameters...",
        "Identifying target audience personas & brand tone...",
      ]
    },
    {
      id: "trendResearcher",
      name: "Trend Researcher Agent",
      role: "Live Google Search Grounding for 98% viral trends",
      icon: TrendingUp,
      status: "waiting",
      thoughtLog: [
        "Initiating real-time Google Search Grounding...",
        "Scanning top tech & industry news for breaking trends...",
        "Extracting citations & filtering high-virality topics...",
      ]
    },
    {
      id: "competitorAnalyst",
      name: "Competitor Analyst Agent",
      role: "Strategic positioning & market differentiation check",
      icon: ShieldCheck,
      status: "waiting",
      thoughtLog: [
        "Analyzing competitor content strategies & angles...",
        "Identifying content gap opportunities for maximum reach...",
        "Formulating unique strategic positioning advice...",
      ]
    },
    {
      id: "contentCreator",
      name: "Pro Copywriter Agent",
      role: "Crafting viral hooks, pattern interrupts & platform copy",
      icon: PenTool,
      status: "waiting",
      thoughtLog: [
        "Designing 1-2 second attention hooks & pattern interrupts...",
        "Eliminating robotic AI clichés ('dive into', 'game-changer')...",
        "Formatting custom posts for selected target platforms...",
      ]
    },
    {
      id: "visualizerCreator",
      name: "Visualizer Agent",
      role: "Generating context-aware prompts for Nano Banana & Veo 3.1",
      icon: ImageIcon,
      status: "waiting",
      thoughtLog: [
        "Analyzing generated captions for visual themes & emotion...",
        "Constructing cinematic lighting, camera angles & style prompts...",
        "Preparing graphic slide specs for carousel & video rendering...",
      ]
    },
    {
      id: "supervisor",
      name: "CEO Auditor Agent",
      role: "Auditing text for robotic AI clichés & granting final approval",
      icon: Crown,
      status: "waiting",
      thoughtLog: [
        "Reviewing copy against strict human-written standards...",
        "Verifying hook strength & platform format compliance...",
        "Granting final CEO green light for campaign deployment...",
      ]
    },
  ]);

  const [currentThoughtIdx, setCurrentThoughtIdx] = useState<number>(0);
  const thoughtIntervalRef = useRef<any>(null);

  // Start Generation stream when modal opens
  useEffect(() => {
    if (isOpen && !isGenerating && !completedPayload) {
      runAgentPipeline();
    }
    return () => {
      if (thoughtIntervalRef.current) clearInterval(thoughtIntervalRef.current);
    };
  }, [isOpen]);

  // Animate thoughts for current running agent (Claude style thinking)
  useEffect(() => {
    if (isGenerating) {
      setCurrentThoughtIdx(0);
      if (thoughtIntervalRef.current) clearInterval(thoughtIntervalRef.current);

      thoughtIntervalRef.current = setInterval(() => {
        setCurrentThoughtIdx((prev) => (prev < 2 ? prev + 1 : prev));
      }, 1400);
    }
  }, [activeStepIndex, isGenerating]);

  const updateStepStatus = (
    stepId: string,
    status: "waiting" | "running" | "completed" | "error",
    details?: any
  ) => {
    setSteps((prev) => {
      const nextIdx = prev.findIndex((s) => s.id === stepId);
      if (nextIdx !== -1 && status === "completed") {
        setActiveStepIndex(Math.min(nextIdx + 1, prev.length - 1));
      } else if (nextIdx !== -1 && status === "running") {
        setActiveStepIndex(nextIdx);
      }

      return prev.map((step) => {
        if (step.id === stepId) {
          return { ...step, status, details: details || step.details };
        }
        return step;
      });
    });
  };

  const runAgentPipeline = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setActiveStepIndex(0);

    // Reset steps
    setSteps((prev) =>
      prev.map((s, idx) => ({
        ...s,
        status: idx === 0 ? "running" : "waiting",
        details: undefined,
      }))
    );

    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-campaign",
          platforms,
          contentTypes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to launch multi-agent pipeline.");
      }

      if (!res.body) {
        throw new Error("No response stream received from backend.");
      }

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
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.replace("data: ", ""));
              if (eventData.type === "progress") {
                const nodeName = eventData.node;
                const payload = eventData.payload;

                // Mark completed for nodeName
                updateStepStatus(nodeName, "completed", payload);

                // Delay slightly for smooth human-like AI stream feel
                await new Promise((r) => setTimeout(r, 600));

                if (payload?.campaignPayload) {
                  setCompletedPayload(payload.campaignPayload);
                }
              }
            } catch (err) {
              console.error("Error parsing SSE line:", err);
            }
          }
        }
      }

      // Mark all completed
      setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
      setIsGenerating(false);
    } catch (err: any) {
      console.error("Multi-agent error:", err);
      setErrorMsg(err.message || "An error occurred during AI generation.");
      setIsGenerating(false);
    }
  };

  const handleApplyToEditors = () => {
    if (completedPayload) {
      onCompletePayload(completedPayload);
      onClose();
    }
  };

  if (!isOpen) return null;

  const currentActiveAgent = steps[activeStepIndex] || steps[0];
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercentage = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden transition-all">
        
        {/* MODAL HEADER */}
        <div className="p-5 px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center shadow-md shadow-purple-500/20 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
                Autonomous AI Studio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generating tailored content for {platforms.length} platform(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* PROGRESS BAR */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-600 via-indigo-500 to-pink-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* CLAUDE AI-STYLE THINKING STREAM BODY */}
        <div className="p-6 space-y-5">
          
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* COMPLETED STEPS COLLAPSED PILLS (CLAUDE STYLE) */}
          <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
            {steps.filter(s => s.status === "completed").map((st) => {
              const Icon = st.icon;
              return (
                <div
                  key={st.id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold animate-in fade-in slide-in-from-left-2"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span>{st.name.replace(" Agent", "")}</span>
                </div>
              );
            })}

            {isGenerating && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-300 text-[11px] font-bold animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
                <span>Active Agent Pipeline...</span>
              </div>
            )}
          </div>

          {/* MAIN LIVE ACTIVE AGENT SPOTLIGHT (CLAUDE THINKING BOX) */}
          <div className="p-5 rounded-2xl border border-purple-500/30 bg-gradient-to-b from-purple-500/5 via-slate-50/50 to-white dark:from-purple-950/30 dark:via-slate-900 dark:to-slate-900 shadow-xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/30 font-bold">
                  {currentActiveAgent.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  ) : (
                    <currentActiveAgent.icon className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    {currentActiveAgent.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {currentActiveAgent.role}
                  </p>
                </div>
              </div>

              {currentActiveAgent.status === "running" && (
                <Badge variant="outline" className="text-[9px] font-extrabold uppercase border-purple-500/40 text-purple-400 bg-purple-950/40 animate-pulse px-2 py-0.5">
                  Thinking...
                </Badge>
              )}
              {currentActiveAgent.status === "completed" && (
                <Badge variant="outline" className="text-[9px] font-extrabold uppercase border-emerald-500/40 text-emerald-400 bg-emerald-950/40 px-2 py-0.5">
                  Complete
                </Badge>
              )}
            </div>

            {/* LIVE STREAMING LOG / THINKING LOG */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-2 border border-slate-800 min-h-[110px] flex flex-col justify-center">
              {currentActiveAgent.thoughtLog?.slice(0, currentThoughtIdx + 1).map((thought, idx) => (
                <div key={idx} className="flex items-center gap-2 text-slate-300 animate-in fade-in slide-in-from-bottom-1">
                  <span className="text-purple-400 font-bold">&gt;</span>
                  <span>{thought}</span>
                  {idx === currentThoughtIdx && currentActiveAgent.status === "running" && (
                    <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse ml-0.5" />
                  )}
                </div>
              ))}

              {currentActiveAgent.id === "trendResearcher" && currentActiveAgent.details?.trendData && (
                <div className="mt-2 pt-2 border-t border-slate-800 text-emerald-400 font-sans text-xs">
                  <div className="flex items-center gap-1 font-bold text-[10px] uppercase text-emerald-400 mb-1">
                    <Globe className="h-3 w-3" /> Live Google Search Grounding Sourced:
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300 line-clamp-3">
                    {currentActiveAgent.details.trendData}
                  </p>
                </div>
              )}

              {currentActiveAgent.id === "brandAnalyst" && currentActiveAgent.details?.brandDNA && (
                <div className="mt-2 pt-2 border-t border-slate-800 text-purple-300 font-sans text-xs">
                  <strong className="text-white">Brand:</strong> {currentActiveAgent.details.brandDNA.name}
                  <p className="text-[11px] text-slate-400 mt-0.5">{currentActiveAgent.details.brandDNA.tagline || currentActiveAgent.details.brandDNA.description}</p>
                </div>
              )}

              {currentActiveAgent.id === "contentCreator" && currentActiveAgent.details?.campaignPayload && (
                <div className="mt-2 pt-2 border-t border-slate-800 text-pink-300 font-sans text-xs">
                  <div className="font-bold text-[10px] uppercase text-pink-400 mb-1">Generated Hooks & Copy:</div>
                  <p className="text-[11px] text-slate-300 italic">
                    Platform copy crafted with pattern interrupts & zero robotic AI words.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500">
            Cancel
          </Button>

          {completedPayload ? (
            <Button
              onClick={handleApplyToEditors}
              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-purple-500/20 gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Apply & Populate All Editors
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
              <span>{isGenerating ? "AI Agent is reasoning..." : "Pipeline ready"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
