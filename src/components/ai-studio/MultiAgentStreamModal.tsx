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
  Check,
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
  subStatusText?: string;
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
  const [isApplied, setIsApplied] = useState<boolean>(false);
  const [currentActionText, setCurrentActionText] = useState<string>("Initializing Autonomous AI Network...");

  const [steps, setSteps] = useState<AgentStep[]>([
    {
      id: "brandAnalyst",
      name: "Brand Analyst Agent",
      role: "Analyzing workspace Brand DNA & target audience",
      icon: Building2,
      status: "waiting",
      subStatusText: "Fetching workspace Brand DNA & writing parameters...",
    },
    {
      id: "trendResearcher",
      name: "Trend Researcher Agent",
      role: "Live Google Search Grounding for 98% viral trends",
      icon: TrendingUp,
      status: "waiting",
      subStatusText: "Initiating live web search & sourcing 98% viral trends...",
    },
    {
      id: "competitorAnalyst",
      name: "Competitor Analyst Agent",
      role: "Strategic positioning & market differentiation check",
      icon: ShieldCheck,
      status: "waiting",
      subStatusText: "Checking competitor gap & market positioning...",
    },
    {
      id: "contentCreator",
      name: "Pro Copywriter Agent",
      role: "Crafting viral hooks & platform copy",
      icon: PenTool,
      status: "waiting",
      subStatusText: "Writing platform-specific captions & pattern interrupts...",
    },
    {
      id: "visualizerCreator",
      name: "Visualizer Agent",
      role: "Generating visual prompts for Nano Banana & Veo 3.1",
      icon: ImageIcon,
      status: "waiting",
      subStatusText: "Designing image, reel & carousel prompts per platform...",
    },
    {
      id: "supervisor",
      name: "CEO Auditor Agent",
      role: "Auditing text for robotic AI clichés & granting final approval",
      icon: Crown,
      status: "waiting",
      subStatusText: "Performing quality check & verifying hook strength...",
    },
  ]);

  // Dynamic status runner for Granular Step Action Messages
  useEffect(() => {
    if (!isOpen) return;

    if (!isGenerating && !completedPayload) {
      runAgentPipeline();
    }
  }, [isOpen]);

  const runAgentPipeline = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setIsApplied(false);
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
      // Step 1: Brand Analyst Simulation pacing
      setCurrentActionText("Brand Analyst: Extracting Brand Profile & Writing Tone...");
      await new Promise(r => setTimeout(r, 1200));

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

      // List of platforms to dynamically update action text
      const formatList: string[] = [];
      platforms.forEach(p => {
        const types = contentTypes[p] || ["Feed"];
        types.forEach(t => formatList.push(`${p.toUpperCase()} ${t}`));
      });

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

                // Update Action Text dynamically depending on node
                if (nodeName === "brandAnalyst") {
                  setCurrentActionText("Brand Analyst: Identity Verified. Handing over to Trend Researcher...");
                  setSteps(prev => prev.map(s => s.id === "brandAnalyst" ? { ...s, status: "completed", details: payload } : s.id === "trendResearcher" ? { ...s, status: "running" } : s));
                  setActiveStepIndex(1);
                  await new Promise(r => setTimeout(r, 1500));
                } else if (nodeName === "trendResearcher") {
                  setCurrentActionText("Trend Researcher: Grounding 98% Viral Trends via Live Google Search...");
                  setSteps(prev => prev.map(s => s.id === "trendResearcher" ? { ...s, status: "completed", details: payload } : s.id === "competitorAnalyst" ? { ...s, status: "running" } : s));
                  setActiveStepIndex(2);
                  await new Promise(r => setTimeout(r, 1500));
                } else if (nodeName === "competitorAnalyst") {
                  setCurrentActionText("Competitor Analyst: Formulating Market Differentiation Angle...");
                  setSteps(prev => prev.map(s => s.id === "competitorAnalyst" ? { ...s, status: "completed", details: payload } : s.id === "contentCreator" ? { ...s, status: "running" } : s));
                  setActiveStepIndex(3);
                  await new Promise(r => setTimeout(r, 1500));
                } else if (nodeName === "contentCreator") {
                  // Dynamic step loop through selected platform formats
                  for (const fmtName of formatList) {
                    setCurrentActionText(`Pro Copywriter: Writing viral caption & hook for [ ${fmtName} ]...`);
                    await new Promise(r => setTimeout(r, 800));
                  }
                  setSteps(prev => prev.map(s => s.id === "contentCreator" ? { ...s, status: "completed", details: payload } : s.id === "visualizerCreator" ? { ...s, status: "running" } : s));
                  setActiveStepIndex(4);
                } else if (nodeName === "visualizerCreator") {
                  for (const fmtName of formatList) {
                    setCurrentActionText(`Visualizer: Generating tailored cinematic prompts for [ ${fmtName} ]...`);
                    await new Promise(r => setTimeout(r, 800));
                  }
                  setSteps(prev => prev.map(s => s.id === "visualizerCreator" ? { ...s, status: "completed", details: payload } : s.id === "supervisor" ? { ...s, status: "running" } : s));
                  setActiveStepIndex(5);
                } else if (nodeName === "supervisor") {
                  setCurrentActionText("CEO Auditor: Auditing text for AI clichés & granting final approval...");
                  setSteps(prev => prev.map(s => s.id === "supervisor" ? { ...s, status: "completed", details: payload } : s));
                  await new Promise(r => setTimeout(r, 1200));
                }

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
      setCurrentActionText("✨ Campaign Generation Completed Successfully!");
      setIsGenerating(false);
    } catch (err: any) {
      console.error("Multi-agent error:", err);
      setErrorMsg(err.message || "An error occurred during AI generation.");
      setIsGenerating(false);
    }
  };

  const handleApplyToEditors = () => {
    if (completedPayload) {
      setIsApplied(true);
      onCompletePayload(completedPayload);
      
      // Auto close after 1.5 seconds showing success message
      setTimeout(() => {
        onClose();
        setIsApplied(false);
      }, 1500);
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

        {/* PROGRESS BAR WITH DYNAMIC ACTION TEXT */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-600 via-indigo-500 to-pink-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* DYNAMIC ACTION STATUS BANNER */}
        <div className="bg-purple-950/20 border-b border-purple-500/20 px-6 py-2.5 flex items-center justify-between text-xs font-extrabold text-purple-300">
          <div className="flex items-center gap-2">
            <Loader2 className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin text-purple-400" : "hidden"}`} />
            <span>{currentActionText}</span>
          </div>
          <span className="text-[10px] text-purple-400 uppercase tracking-widest">{progressPercentage}%</span>
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
            {steps.filter(s => s.status === "completed").map((st) => (
              <div
                key={st.id}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold animate-in fade-in slide-in-from-left-2"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                <span>{st.name.replace(" Agent", "")}</span>
              </div>
            ))}
          </div>

          {/* MAIN LIVE ACTIVE AGENT SPOTLIGHT */}
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
                  Active
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
              <div className="flex items-center gap-2 text-slate-300">
                <span className="text-purple-400 font-bold">&gt;</span>
                <span>{currentActiveAgent.subStatusText}</span>
                {currentActiveAgent.status === "running" && (
                  <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse ml-0.5" />
                )}
              </div>

              {currentActiveAgent.id === "trendResearcher" && currentActiveAgent.details?.trendData && (
                <div className="mt-2 pt-2 border-t border-slate-800 text-emerald-400 font-sans text-xs">
                  <div className="flex items-center gap-1 font-bold text-[10px] uppercase text-emerald-400 mb-1">
                    <Globe className="h-3 w-3" /> Grounded Viral News:
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
            </div>
          </div>
        </div>

        {/* FOOTER WITH "ADD TO EDITOR SECTION" BUTTON */}
        <div className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500">
            Cancel
          </Button>

          {isApplied ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-xl animate-in fade-in">
              <Check className="h-4 w-4" />
              <span>Added to Content Editor Section! Closing popup...</span>
            </div>
          ) : completedPayload ? (
            <Button
              onClick={handleApplyToEditors}
              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-purple-500/20 gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Add to Editor Section
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
              <span>{isGenerating ? "AI Agent is processing..." : "Pipeline ready"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
