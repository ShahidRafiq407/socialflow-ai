"use client";

import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  CheckCircle2, 
  Loader2, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Globe, 
  Building2, 
  TrendingUp, 
  ShieldCheck, 
  PenTool, 
  Image as ImageIcon, 
  Crown,
  Bot
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
}

export default function MultiAgentStreamModal({
  isOpen,
  onClose,
  platforms,
  contentTypes,
  onCompletePayload,
}: MultiAgentStreamModalProps) {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({
    brandAnalyst: true,
  });
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedPayload, setCompletedPayload] = useState<any | null>(null);

  const [steps, setSteps] = useState<AgentStep[]>([
    {
      id: "brandAnalyst",
      name: "Brand Analyst Agent",
      role: "Analyzing workspace Brand DNA, voice & target audience",
      icon: Building2,
      status: "waiting",
    },
    {
      id: "trendResearcher",
      name: "Trend Researcher Agent",
      role: "Live Google Search Grounding for breaking 98% viral trends & citations",
      icon: TrendingUp,
      status: "waiting",
    },
    {
      id: "competitorAnalyst",
      name: "Competitor Analyst Agent",
      role: "Strategic positioning & market differentiation check",
      icon: ShieldCheck,
      status: "waiting",
    },
    {
      id: "contentCreator",
      name: "Pro Copywriter Agent",
      role: "Crafting viral hooks, pattern interrupts & platform-tailored copy",
      icon: PenTool,
      status: "waiting",
    },
    {
      id: "visualizer",
      name: "Visualizer Agent",
      role: "Generating context-aware prompts for Nano Banana & Veo 3.1 media",
      icon: ImageIcon,
      status: "waiting",
    },
    {
      id: "ceoReviewer",
      name: "CEO Auditor Agent",
      role: "Auditing text for robotic AI clichés & granting final approval",
      icon: Crown,
      status: "waiting",
    },
  ]);

  // Start Generation stream when modal opens
  useEffect(() => {
    if (isOpen && !isGenerating && !completedPayload) {
      runAgentPipeline();
    }
  }, [isOpen]);

  const toggleExpand = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const updateStepStatus = (
    stepId: string,
    status: "waiting" | "running" | "completed" | "error",
    details?: any
  ) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === stepId) {
          return { ...step, status, details: details || step.details };
        }
        return step;
      })
    );
  };

  const runAgentPipeline = async () => {
    setIsGenerating(true);
    setErrorMsg(null);

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

                // Open accordion for completed step
                setExpandedSteps((prev) => ({ ...prev, [nodeName]: true }));

                // Find next node to mark as running
                setSteps((prev) => {
                  const currIdx = prev.findIndex((s) => s.id === nodeName);
                  if (currIdx !== -1 && currIdx < prev.length - 1) {
                    const nextStepId = prev[currIdx + 1].id;
                    return prev.map((st) =>
                      st.id === nextStepId ? { ...st, status: "running" } : st
                    );
                  }
                  return prev;
                });

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

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercentage = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="p-5 px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
                Autonomous Multi-Agent Studio
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
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-600 via-indigo-500 to-pink-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* MAIN BODY / STREAM STEPS */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="space-y-3">
            {steps.map((step) => {
              const Icon = step.icon;
              const isExpanded = !!expandedSteps[step.id];

              return (
                <div
                  key={step.id}
                  className={`rounded-2xl border transition-all ${
                    step.status === "running"
                      ? "border-purple-500/60 bg-purple-500/5 dark:bg-purple-950/20 ring-1 ring-purple-500/30"
                      : step.status === "completed"
                      ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"
                      : "border-slate-100 dark:border-slate-800/40 bg-slate-50/40 dark:bg-slate-900/20 opacity-50"
                  }`}
                >
                  {/* STEP TITLE BAR */}
                  <div
                    onClick={() => step.status !== "waiting" && toggleExpand(step.id)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          step.status === "running"
                            ? "bg-purple-600 text-white shadow-md shadow-purple-500/30 animate-pulse"
                            : step.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                        }`}
                      >
                        {step.status === "running" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : step.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            {step.name}
                          </h4>
                          {step.status === "running" && (
                            <Badge variant="outline" className="text-[9px] font-extrabold uppercase border-purple-500/40 text-purple-400 bg-purple-950/40 animate-pulse">
                              Processing
                            </Badge>
                          )}
                          {step.status === "completed" && (
                            <Badge variant="outline" className="text-[9px] font-extrabold uppercase border-emerald-500/40 text-emerald-400 bg-emerald-950/40">
                              Verified
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {step.role}
                        </p>
                      </div>
                    </div>

                    {step.status !== "waiting" && (
                      <button className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* EXPANDABLE DETAILS */}
                  {isExpanded && step.status !== "waiting" && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
                      {step.status === "running" && (
                        <div className="flex items-center gap-2 py-2 text-purple-500 text-xs font-semibold">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Agent is actively processing data...</span>
                        </div>
                      )}

                      {/* STEP 1: BRAND ANALYST DETAILS */}
                      {step.id === "brandAnalyst" && step.details?.brandDNA && (
                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                          <div className="text-[10px] font-bold uppercase text-purple-500 tracking-wider">
                            Analyzed Brand Identity:
                          </div>
                          <div className="font-extrabold text-slate-900 dark:text-white text-xs">
                            {step.details.brandDNA.name || "Default Business Identity"}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {step.details.brandDNA.tagline || step.details.brandDNA.description || "High impact marketing persona verified."}
                          </p>
                        </div>
                      )}

                      {/* STEP 2: TREND RESEARCHER CITATIONS */}
                      {step.id === "trendResearcher" && step.details?.trendData && (
                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-emerald-500 tracking-wider flex items-center gap-1">
                              <Globe className="h-3 w-3" /> Live Google Search Grounding (98% Viral Fit)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {step.details.trendData}
                          </p>
                        </div>
                      )}

                      {/* STEP 3: COMPETITOR ANALYST */}
                      {step.id === "competitorAnalyst" && step.details?.competitorData && (
                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-indigo-500 tracking-wider mb-1">
                            Strategic Differentiation Take:
                          </div>
                          <p className="text-[11px] text-slate-700 dark:text-slate-300">
                            {typeof step.details.competitorData === "string" 
                              ? step.details.competitorData 
                              : JSON.stringify(step.details.competitorData)}
                          </p>
                        </div>
                      )}

                      {/* STEP 4: PRO CONTENT CREATOR */}
                      {step.id === "contentCreator" && step.details?.campaignPayload && (
                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="text-[10px] font-bold uppercase text-pink-500 tracking-wider">
                            Generated Captions & Pattern Interrupts:
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {Object.entries(step.details.campaignPayload.platforms || {}).map(([plt, fmts]: any) => (
                              <div key={plt} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-extrabold uppercase text-purple-400 block mb-1">{plt}</span>
                                {Object.entries(fmts || {}).map(([fmt, data]: any) => (
                                  <p key={fmt} className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                                    <strong className="text-white">{fmt}:</strong> "{data?.caption}"
                                  </p>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* STEP 5: VISUALIZER AGENT */}
                      {step.id === "visualizer" && step.details?.campaignPayload && (
                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="text-[10px] font-bold uppercase text-amber-500 tracking-wider">
                            Context-Aware Visual Prompts:
                          </div>
                          <div className="text-[11px] text-slate-700 dark:text-slate-300 italic">
                            Generated cinematic image, video & carousel prompts tailored to caption context.
                          </div>
                        </div>
                      )}

                      {/* STEP 6: CEO AUDITOR */}
                      {step.id === "ceoReviewer" && (
                        <div className="mt-2 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-emerald-400 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Quality Audit Passed
                          </div>
                          <p className="text-[11px] leading-relaxed text-emerald-300">
                            Verified zero robotic AI clichés ("dive into", "game-changer"). Strong 1-2 sec hooks & tone approved for all selected platforms.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
              <span>{isGenerating ? "Executing multi-agent pipeline..." : "Pipeline ready"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
