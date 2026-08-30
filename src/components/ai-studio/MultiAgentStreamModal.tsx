"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Database,
  Globe,
  Users,
  PenTool,
  Image as ImageIcon,
  ShieldCheck,
  CheckCircle2,
  Edit,
  X,
  Sparkles,
  Loader2,
  ArrowRight,
  ExternalLink,
  Search,
  Film,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MultiAgentStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: string[];
  contentTypes: Record<string, string[]>;
  onCompletePayload: (payload: any) => void;
}

type AgentStatus = "waiting" | "running" | "completed" | "error";

interface AgentConfig {
  id: string;
  number: number;
  name: string;
  icon: React.ElementType;
  description: string;
}

const AGENT_SEQUENCE: AgentConfig[] = [
  {
    id: "brand_analyst",
    number: 1,
    name: "Brand Analyst",
    icon: Database,
    description: "Loading brand DNA from database",
  },
  {
    id: "trend_researcher",
    number: 2,
    name: "Trend Researcher",
    icon: Globe,
    description: "Live Google Search & trend research",
  },
  {
    id: "competitor_analyst",
    number: 3,
    name: "Competitor Analyst",
    icon: Users,
    description: "Evaluating market positioning & gaps",
  },
  {
    id: "content_creator",
    number: 4,
    name: "Content Creator",
    icon: PenTool,
    description: "Writing platform-native viral copy",
  },
  {
    id: "visualizer",
    number: 5,
    name: "Visualizer",
    icon: ImageIcon,
    description: "Generating visual & video assets",
  },
  {
    id: "ceo_auditor",
    number: 6,
    name: "CEO Auditor",
    icon: ShieldCheck,
    description: "Quality & brand alignment audit",
  },
];

export default function MultiAgentStreamModal({
  isOpen,
  onClose,
  platforms,
  contentTypes,
  onCompletePayload,
}: MultiAgentStreamModalProps) {
  const [isCompleted, setIsCompleted] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({
    brand_analyst: "waiting",
    trend_researcher: "waiting",
    competitor_analyst: "waiting",
    content_creator: "waiting",
    visualizer: "waiting",
    ceo_auditor: "waiting",
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string>("brand_analyst");
  const [userHasManuallySelected, setUserHasManuallySelected] = useState(false);
  const [agentOutputs, setAgentOutputs] = useState<Record<string, any>>({});
  const [agentActivities, setAgentActivities] = useState<Record<string, { label: string; status: AgentStatus }[]>>({});
  const [trendSources, setTrendSources] = useState<{ title: string; url: string; snippet: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [completedPayload, setCompletedPayload] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedAgentId, setFailedAgentId] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [agentThoughts, setAgentThoughts] = useState<Record<string, string>>({});

  const agentOutputsRef = useRef<Record<string, any>>({});
  const thinkingEndRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef<string>(`run_${Date.now()}`);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<any>(null);

  const startStream = useCallback(async (retryOptions?: { resumeFromAgent?: string }) => {
    setIsCompleted(false);
    setErrorMessage(null);
    setUpgradeRequired(false);
    setCompletedPayload(null);

    const isRetry = Boolean(retryOptions?.resumeFromAgent);
    const targetResumeAgent = retryOptions?.resumeFromAgent;

    if (!isRetry) {
      setElapsedTime(0);
      setTrendSources([]);
      setSearchQuery("");
      setAgentOutputs({});
      agentOutputsRef.current = {};
      setAgentThoughts({});
      setFailedAgentId(null);
      setAgentActivities({
        brand_analyst: [{ label: "Querying workspace database for Brand DNA...", status: "running" }],
      });
      setUserHasManuallySelected(false);
      setSelectedAgentId("brand_analyst");
      setAgentStatuses({
        brand_analyst: "running",
        trend_researcher: "waiting",
        competitor_analyst: "waiting",
        content_creator: "waiting",
        visualizer: "waiting",
        ceo_auditor: "waiting",
      });
    } else if (targetResumeAgent) {
      setFailedAgentId(null);
      setSelectedAgentId(targetResumeAgent);
      // Clear the retried agent's previous reasoning so it re-streams live
      setAgentThoughts((prev) => ({ ...prev, [targetResumeAgent]: "" }));
      
      // Keep prior agents marked as completed, target as running, subsequent as waiting
      setAgentStatuses((prev) => {
        const next: Record<string, AgentStatus> = { ...prev };
        let foundTarget = false;
        for (const agent of AGENT_SEQUENCE) {
          if (agent.id === targetResumeAgent) {
            next[agent.id] = "running";
            foundTarget = true;
          } else if (foundTarget) {
            next[agent.id] = "waiting";
          } else {
            next[agent.id] = "completed";
          }
        }
        return next;
      });

      setAgentActivities((prev) => ({
        ...prev,
        [targetResumeAgent]: [
          ...(prev[targetResumeAgent] || []).filter(a => a.status === "completed"),
          { label: `Retrying ${AGENT_SEQUENCE.find(a => a.id === targetResumeAgent)?.name || targetResumeAgent}...`, status: "running" }
        ],
      }));
    }

    const runId = `run_${Date.now()}`;
    runIdRef.current = runId;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    const resumeState = isRetry && targetResumeAgent ? {
      brandData: agentOutputsRef.current?.brand_analyst,
      trendResearch: agentOutputsRef.current?.trend_researcher,
      competitorAnalysis: agentOutputsRef.current?.competitor_analyst,
      generatedContent: agentOutputsRef.current?.content_creator,
      generatedAssets: agentOutputsRef.current?.visualizer?.generatedAssets || [],
    } : undefined;

    try {
      const res = await fetch("/api/ai-studio-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-campaign",
          platforms,
          contentTypes,
          runId,
          resumeState,
          resumeFromAgent: targetResumeAgent,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: "Server error" }));
        if (errJson.error === "UPGRADE_REQUIRED") {
          setUpgradeRequired(true);
        }
        throw new Error(errJson.message || errJson.error || `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() || "";

        for (const rawChunk of chunks) {
          const chunk = rawChunk.trim();
          if (!chunk) continue;

          // Extract data: payload across lines
          const dataPayload = chunk
            .split(/\r?\n/)
            .filter((line) => line.trim().startsWith("data:"))
            .map((line) => line.trim().replace(/^data:\s*/, ""))
            .join("\n");

          if (dataPayload) {
            try {
              const event = JSON.parse(dataPayload);
              handleStreamEvent(event);
            } catch (e) {
              console.error("Failed to parse SSE JSON payload:", dataPayload);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        setErrorMessage(err.message || "Pipeline execution failed");
      }
    }
  }, [platforms, contentTypes]);

  const handleStreamEvent = (event: any) => {
    const { type, agentId, data } = event;

    if (type === "agent_started") {
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "running" }));
      // Automatically switch active panel to running agent unless user explicitly clicked another
      if (!userHasManuallySelected) {
        setSelectedAgentId(agentId);
      }
    } else if (type === "agent_action") {
      if (data?.label) {
        setAgentActivities((prev) => ({
          ...prev,
          [agentId]: [...(prev[agentId] || []), { label: data.label, status: "running" }],
        }));
      }
    } else if (type === "agent_thought") {
      // Live agent reasoning stream (Claude-style thinking), token-by-token from the pipeline
      if (typeof data === "string") {
        setAgentThoughts((prev) => ({ ...prev, [agentId]: prev[agentId] ? prev[agentId] : data }));
      } else if (data?.reset) {
        setAgentThoughts((prev) => ({ ...prev, [agentId]: "" }));
      } else if (typeof data?.delta === "string") {
        setAgentThoughts((prev) => ({ ...prev, [agentId]: (prev[agentId] || "") + data.delta }));
      }
    } else if (type === "web_search") {
      if (data?.query) setSearchQuery(data.query);
    } else if (type === "source_found") {
      if (Array.isArray(data?.sources)) {
        setTrendSources(data.sources);
      }
    } else if (type === "output_ready") {
      if (data) {
        agentOutputsRef.current[agentId] = data;
        setAgentOutputs((prev) => ({ ...prev, [agentId]: data }));
      }
    } else if (type === "agent_completed") {
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "completed" }));
      setAgentActivities((prev) => ({
        ...prev,
        [agentId]: (prev[agentId] || []).map((act) => ({ ...act, status: "completed" })),
      }));
    } else if (type === "agent_error") {
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "error" }));
      setFailedAgentId(agentId);
      if (data?.message) setErrorMessage(data.message);
    } else if (type === "workflow_completed") {
      if (timerRef.current) clearInterval(timerRef.current);
      const payload = data?.campaign || data?.resultState?.generatedContent || data;
      if (payload) {
        setCompletedPayload(payload);
      }
      setIsCompleted(true);
    } else if (type === "workflow_cancelled") {
      if (timerRef.current) clearInterval(timerRef.current);
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      startStream();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, startStream]);

  // Keep the live reasoning stream pinned to the latest token
  useEffect(() => {
    thinkingEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agentThoughts, selectedAgentId]);

  const handleRetry = (agentId?: string) => {
    const targetAgent = agentId || failedAgentId || selectedAgentId || "visualizer";
    startStream({ resumeFromAgent: targetAgent });
  };

  const handleCancelCampaign = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    try {
      await fetch("/api/ai-studio-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", runId: runIdRef.current }),
      });
    } catch (e) {
      // Ignore network cancellation errors
    }
    onClose();
  };

  const handleApplyToEditors = () => {
    const payload = completedPayload || agentOutputs?.content_creator;
    if (payload) {
      onCompletePayload(payload);
    }
    onClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  const completedCount = Object.values(agentStatuses).filter((s) => s === "completed").length;
  const runningCount = Object.values(agentStatuses).filter((s) => s === "running").length;
  const realProgress = Math.min(100, Math.round(((completedCount + (runningCount ? 0.5 : 0)) / AGENT_SEQUENCE.length) * 100));

  const activeAgentConfig = AGENT_SEQUENCE.find((a) => a.id === selectedAgentId) || AGENT_SEQUENCE[0];
  const activeAgentOutput = agentOutputs[selectedAgentId];
  const activeActivities = agentActivities[selectedAgentId] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm transition-all duration-300 font-sans overflow-hidden">
      {/* Main Modal Container */}
      <div
        className={`relative overflow-hidden shadow-2xl transition-all duration-300 ease-in-out w-full flex flex-col ${
          isCompleted
            ? "max-w-[520px] bg-white rounded-2xl md:rounded-[20px] border border-[#E5E7EB]"
            : "max-w-[1180px] h-[92vh] max-h-[750px] min-h-[500px] bg-[#0B0D10] rounded-2xl md:rounded-[18px] border border-[#252A32]"
        }`}
      >
        {/* Processing State */}
        {!isCompleted && (
          <div className="flex flex-col h-full text-white overflow-hidden">
            {/* Top Bar / Campaign Status */}
            <div className="px-4 sm:px-6 py-3 flex items-center justify-between border-b border-[#252A32] bg-[#11141A] shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs font-medium text-[#22C55E]">Live</span>
                </div>
                <h3 className="text-[#9CA3AF] font-medium text-xs sm:text-sm truncate">Creating your campaign...</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs sm:text-sm font-mono text-[#9CA3AF] shrink-0">{formatTime(elapsedTime)}</div>
                <button onClick={handleCancelCampaign} className="p-1 text-[#9CA3AF] hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 2-Column Responsive Layout */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
              {/* Left Column: Agents List */}
              <div className="w-full md:w-[35%] lg:w-[32%] md:min-w-[280px] border-b md:border-b-0 md:border-r border-[#252A32] overflow-y-auto p-3 sm:p-4 space-y-2 max-h-[180px] sm:max-h-[220px] md:max-h-none shrink-0 md:shrink">
                {AGENT_SEQUENCE.map((agent) => {
                  const Icon = agent.icon;
                  const status = agentStatuses[agent.id] || "waiting";
                  const isSelected = agent.id === selectedAgentId;
                  const isAgentCompleted = status === "completed";
                  const isRunning = status === "running";

                  return (
                    <div
                      key={agent.id}
                      onClick={() => {
                        setUserHasManuallySelected(true);
                        setSelectedAgentId(agent.id);
                      }}
                      className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? "bg-[#161920] border-[#8B5CF6]/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                          : isAgentCompleted
                          ? "bg-transparent border-[#252A32] opacity-80 hover:bg-[#11141A]"
                          : "bg-transparent border-transparent opacity-50 hover:opacity-75"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border mt-0.5 ${
                          isAgentCompleted
                            ? "bg-[#22C55E]/10 border-[#22C55E]/20 text-[#22C55E]"
                            : isRunning
                            ? "bg-[#8B5CF6]/10 border-[#8B5CF6]/20 text-[#8B5CF6]"
                            : "bg-[#1A1D24] border-[#252A32] text-[#9CA3AF]"
                        }`}
                      >
                        {isAgentCompleted ? (
                          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        ) : isRunning ? (
                          <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        ) : (
                          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <h4 className={`text-xs sm:text-sm font-semibold truncate ${isSelected ? "text-white" : "text-[#9CA3AF]"}`}>
                            {agent.name}
                          </h4>
                          {isRunning && (
                            <span className="text-[9px] sm:text-[10px] font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-1.5 py-0.5 rounded-full border border-[#8B5CF6]/20 shrink-0 ml-1">
                              RUNNING
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-[#6B7280] line-clamp-1 md:line-clamp-2 leading-tight sm:leading-relaxed">
                          {agent.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Active Agent Details */}
              <div className="flex-1 p-4 sm:p-6 md:p-8 bg-[#0B0D10] overflow-y-auto">
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-[#9CA3AF]">
                      <span>Overall Progress</span>
                      <span className="text-white">{realProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-[#1A1D24] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA] transition-all duration-700 ease-out rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                        style={{ width: `${realProgress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Activity & Details Panel */}
                  <div className="bg-[#11141A] border border-[#252A32] rounded-[16px] p-4 sm:p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs sm:text-sm font-semibold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
                        {activeAgentConfig.name} — Live Activity
                      </h4>
                      <span className="text-[10px] font-mono text-[#9CA3AF] uppercase bg-[#1A1D24] px-2 py-0.5 rounded border border-[#252A32]">
                        {agentStatuses[selectedAgentId] || "waiting"}
                      </span>
                    </div>

                    {/* Agent Live Activity Messages */}
                    {activeActivities.length > 0 ? (
                      <div className="space-y-3">
                        {activeActivities.map((act, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            {act.status === "completed" ? (
                              <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                            ) : (
                              <Loader2 className="w-4 h-4 text-[#8B5CF6] animate-spin shrink-0" />
                            )}
                            <span className="text-xs sm:text-sm text-white font-medium truncate">{act.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#6B7280]">Agent waiting to execute...</p>
                    )}

                    {/* Live Agent Reasoning — streamed token-by-token from the pipeline */}
                    {(agentStatuses[selectedAgentId] === "running" || (agentThoughts[selectedAgentId] || "").length > 0) && (
                      <div className="rounded-xl border border-[#252A32] bg-[#0D1015] p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles
                            className={`w-3.5 h-3.5 ${
                              agentStatuses[selectedAgentId] === "running" ? "text-[#A78BFA] animate-pulse" : "text-[#6B7280]"
                            }`}
                          />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Agent Reasoning</span>
                          {agentStatuses[selectedAgentId] === "running" && (
                            <span className="text-[10px] text-[#A78BFA] animate-pulse ml-auto">Thinking...</span>
                          )}
                        </div>
                        <div className="max-h-36 overflow-y-auto pr-1">
                          <p className="text-xs leading-relaxed text-[#9CA3AF] italic whitespace-pre-wrap border-l-2 border-[#8B5CF6]/40 pl-3">
                            {agentThoughts[selectedAgentId] || ""}
                            {agentStatuses[selectedAgentId] === "running" && (
                              <span className="inline-block w-1.5 h-3.5 bg-[#A78BFA]/80 animate-pulse ml-0.5 align-middle" />
                            )}
                          </p>
                          <div ref={thinkingEndRef} />
                        </div>
                      </div>
                    )}

                    {/* Real Data Details Panel for selectedAgentId */}
                    {selectedAgentId === "trend_researcher" && (
                      <div className="pt-3 border-t border-[#252A32] space-y-3">
                        {searchQuery && (
                          <div className="flex items-center gap-2 text-xs text-[#9CA3AF] bg-[#0B0D10] p-2.5 rounded-lg border border-[#252A32]">
                            <Search className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
                            <span className="font-mono text-[11px] truncate">{searchQuery}</span>
                          </div>
                        )}

                        {trendSources.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Live Web Sources Found</h5>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                              {trendSources.map((src, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block bg-[#161920] border border-[#252A32] hover:border-[#8B5CF6]/40 p-2.5 rounded-lg transition-colors group"
                                >
                                  <div className="flex items-center justify-between text-xs font-semibold text-white group-hover:text-[#8B5CF6]">
                                    <span className="truncate">{src.title}</span>
                                    <ExternalLink className="w-3 h-3 text-[#9CA3AF] shrink-0 ml-2" />
                                  </div>
                                  {src.snippet && <p className="text-[11px] text-[#6B7280] line-clamp-1 mt-1">{src.snippet}</p>}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedAgentId === "brand_analyst" && activeAgentOutput && (
                      <div className="pt-3 border-t border-[#252A32] text-xs space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold text-[#9CA3AF] uppercase">Brand DNA Context</h5>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              activeAgentOutput.hasCustomDNA
                                ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            }`}
                          >
                            {activeAgentOutput.hasCustomDNA ? "CONFIGURED" : "DEFAULT PROFILE"}
                          </span>
                        </div>

                        {!activeAgentOutput.hasCustomDNA && (
                          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                            <span className="text-amber-300 text-[11px]">Brand DNA not yet customized in settings.</span>
                            <a
                              href="/dashboard/brand"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 font-bold text-[11px] hover:underline flex items-center gap-1 shrink-0 ml-2"
                            >
                              Setup Brand DNA <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}

                        <div className="bg-[#0B0D10] p-3 rounded-lg border border-[#252A32] space-y-1.5">
                          <p><span className="text-[#9CA3AF]">Brand:</span> <span className="text-white font-medium">{activeAgentOutput.name}</span></p>
                          <p><span className="text-[#9CA3AF]">Industry:</span> <span className="text-white font-medium">{activeAgentOutput.industry}</span></p>
                          <p><span className="text-[#9CA3AF]">Target Audience:</span> <span className="text-white font-medium">{activeAgentOutput.targetAudience}</span></p>
                          <p><span className="text-[#9CA3AF]">Tone:</span> <span className="text-white font-medium">{activeAgentOutput.tone}</span></p>
                        </div>
                      </div>
                    )}

                    {selectedAgentId === "competitor_analyst" && activeAgentOutput && (
                      <div className="pt-3 border-t border-[#252A32] text-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold text-[#9CA3AF] uppercase">Market & Competitor Intelligence</h5>
                          {activeAgentOutput.winningAngle && (
                            <span className="text-[10px] font-bold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded border border-[#22C55E]/20">
                              Winning Angle Found
                            </span>
                          )}
                        </div>

                        <div className="bg-[#0B0D10] p-3 rounded-lg border border-[#252A32] space-y-2.5">
                          {Array.isArray(activeAgentOutput.topCompetitors) && activeAgentOutput.topCompetitors.length > 0 && (
                            <div>
                              <span className="text-[#9CA3AF] font-semibold text-[11px] block mb-1">Top Market Competitors:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {activeAgentOutput.topCompetitors.map((comp: string, cIdx: number) => (
                                  <span key={cIdx} className="bg-[#1A1D24] text-slate-200 text-[11px] font-medium px-2 py-0.5 rounded border border-[#252A32]">
                                    {comp}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {activeAgentOutput.winningAngle && (
                            <div className="p-2.5 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/30">
                              <span className="text-[#A78BFA] font-bold text-[11px] block mb-0.5">🎯 Winning Topic Strategy:</span>
                              <p className="text-white text-xs font-medium leading-relaxed">{activeAgentOutput.winningAngle}</p>
                            </div>
                          )}

                          <div>
                            <span className="text-[#9CA3AF] font-semibold text-[11px] block mb-1">Differentiation Plan:</span>
                            {Array.isArray(activeAgentOutput.differentiation) && (
                              <ul className="list-disc list-inside text-[#9CA3AF] space-y-1 text-[11px]">
                                {activeAgentOutput.differentiation.map((diff: string, dIdx: number) => (
                                  <li key={dIdx} className="text-slate-300">{diff}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CONTENT CREATOR LIVE GRANULAR PREVIEW */}
                    {selectedAgentId === "content_creator" && (
                      <div className="pt-3 border-t border-[#252A32] text-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold text-[#9CA3AF] uppercase">Platform-Tailored Content Drafts</h5>
                          <span className="text-[10px] font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-2 py-0.5 rounded border border-[#8B5CF6]/20">
                            High User Intent
                          </span>
                        </div>

                        {activeAgentOutput?.platforms ? (
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                            {Object.entries(activeAgentOutput.platforms).map(([pltKey, formats]: [string, any]) =>
                              Object.entries(formats).map(([fmtKey, item]: [string, any]) => (
                                <div key={`${pltKey}-${fmtKey}`} className="bg-[#0B0D10] p-3 rounded-lg border border-[#252A32] space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]"></span>
                                      {pltKey} — {fmtKey}
                                    </span>
                                    <span className="text-[10px] font-mono text-[#9CA3AF] bg-[#1A1D24] px-1.5 py-0.5 rounded">
                                      {item.aspectRatio || "1:1"}
                                    </span>
                                  </div>

                                  {item.hook && (
                                    <div className="p-2 rounded bg-[#161920] border border-[#252A32]">
                                      <span className="text-[10px] font-bold text-[#8B5CF6] uppercase block">Scroll-Stopping Hook:</span>
                                      <p className="text-white text-xs font-medium mt-0.5 italic">"{item.hook}"</p>
                                    </div>
                                  )}

                                  {item.caption && (
                                    <div>
                                      <span className="text-[10px] font-bold text-[#9CA3AF] uppercase block mb-0.5">Caption Preview:</span>
                                      <p className="text-slate-300 text-xs line-clamp-2 leading-relaxed">{item.caption}</p>
                                    </div>
                                  )}

                                  {item.visualPrompt && (
                                    <div className="p-2 rounded bg-[#161920] border border-[#252A32]">
                                      <span className="text-[10px] font-bold text-[#22C55E] uppercase block">Visualizer AI Prompt:</span>
                                      <p className="text-slate-300 text-[11px] font-mono line-clamp-2 mt-0.5">{item.visualPrompt}</p>
                                    </div>
                                  )}

                                  {Array.isArray(item.hashtags) && item.hashtags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-1">
                                      {item.hashtags.slice(0, 5).map((tag: string, tIdx: number) => (
                                        <span key={tIdx} className="text-[10px] text-[#A78BFA]">
                                          {tag.startsWith("#") ? tag : `#${tag}`}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          <div className="p-3 bg-[#0B0D10] rounded-lg border border-[#252A32] text-slate-400 text-xs">
                            Generating platform-native content with custom hooks, tailored algorithms, and visual prompts...
                          </div>
                        )}
                      </div>
                    )}

                    {selectedAgentId === "visualizer" && activeAgentOutput?.generatedAssets && (
                      <div className="pt-3 border-t border-[#252A32] text-xs space-y-2">
                        <h5 className="font-semibold text-[#9CA3AF] uppercase">Generated Media Assets</h5>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {activeAgentOutput.generatedAssets.map((asset: any, aIdx: number) => (
                            <div key={aIdx} className="bg-[#0B0D10] p-2.5 rounded-lg border border-[#252A32] flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {asset.type === "video" ? (
                                  <Film className="w-4 h-4 text-[#8B5CF6]" />
                                ) : (
                                  <ImageIcon className="w-4 h-4 text-[#22C55E]" />
                                )}
                                <div>
                                  <p className="text-white font-medium capitalize">{asset.platform} — {asset.contentType} ({asset.type.toUpperCase()})</p>
                                  <p className="text-[10px] text-[#6B7280]">Aspect Ratio: {asset.aspectRatio}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (asset.url.startsWith("http://") || asset.url.startsWith("https://")) {
                                    window.open(asset.url, "_blank");
                                    return;
                                  }
                                  if (asset.url.startsWith("data:")) {
                                    try {
                                      const parts = asset.url.split(",");
                                      const mimeMatch = parts[0].match(/:(.*?);/);
                                      const mimeType = mimeMatch ? mimeMatch[1] : asset.type === "video" ? "video/mp4" : "image/png";
                                      const byteCharacters = atob(parts[1]);
                                      const byteArrays = [];
                                      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                                        const slice = byteCharacters.slice(offset, offset + 512);
                                        const byteNumbers = new Array(slice.length);
                                        for (let i = 0; i < slice.length; i++) {
                                          byteNumbers[i] = slice.charCodeAt(i);
                                        }
                                        byteArrays.push(new Uint8Array(byteNumbers));
                                      }
                                      const blob = new Blob(byteArrays, { type: mimeType });
                                      const blobUrl = URL.createObjectURL(blob);
                                      window.open(blobUrl, "_blank");
                                      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                                    } catch (e) {
                                      window.open(asset.url, "_blank");
                                    }
                                  }
                                }}
                                className="text-[#8B5CF6] hover:text-[#A78BFA] hover:underline flex items-center gap-1 text-[11px] font-semibold bg-transparent border-0 cursor-pointer p-0"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedAgentId === "ceo_auditor" && activeAgentOutput && (
                      <div className="pt-3 border-t border-[#252A32] text-xs space-y-2">
                        <h5 className="font-semibold text-[#9CA3AF] uppercase">CEO Audit Verification</h5>
                        <div className="bg-[#0B0D10] p-3 rounded-lg border border-[#252A32] space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-bold text-sm">Quality Score: {activeAgentOutput.score}/100</p>
                              <p className="text-[#9CA3AF] mt-0.5">{activeAgentOutput.notes}</p>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${
                                activeAgentOutput.passed
                                  ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20"
                                  : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20"
                              }`}
                            >
                              {activeAgentOutput.passed ? "APPROVED" : "REJECTED"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#252A32]">
                            <div className="bg-[#161920] p-2 rounded text-[11px]">
                              <span className="text-[#22C55E] font-bold">✓</span> <span className="text-slate-300">Brand Voice Alignment</span>
                            </div>
                            <div className="bg-[#161920] p-2 rounded text-[11px]">
                              <span className="text-[#22C55E] font-bold">✓</span> <span className="text-slate-300">Hook & Retention</span>
                            </div>
                            <div className="bg-[#161920] p-2 rounded text-[11px]">
                              <span className="text-[#22C55E] font-bold">✓</span> <span className="text-slate-300">Platform Specs</span>
                            </div>
                            <div className="bg-[#161920] p-2 rounded text-[11px]">
                              <span className="text-[#22C55E] font-bold">✓</span> <span className="text-slate-300">Media Compliance</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {errorMessage && (
                      <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/25 rounded-xl text-xs text-[#EF4444] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-red-950/20">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-red-400">{errorMessage}</span>
                        </div>
                        {upgradeRequired ? (
                          <button
                            type="button"
                            onClick={() => (window.location.href = "/dashboard/billing?plan=PRO")}
                            className="inline-flex items-center gap-1.5 bg-white text-slate-900 text-xs font-semibold px-3.5 py-1.5 h-8 rounded-lg flex items-center shrink-0 transition-colors hover:opacity-90"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Upgrade Plan
                          </button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleRetry(failedAgentId || selectedAgentId)}
                            className="bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs px-3.5 py-1.5 h-8 rounded-lg flex items-center gap-1.5 shrink-0 transition-all font-medium"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            Retry {AGENT_SEQUENCE.find((a) => a.id === (failedAgentId || selectedAgentId))?.name || "Step"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-[#252A32] flex items-center justify-between bg-[#0B0D10] shrink-0">
              <div>
                {errorMessage && (
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 font-medium shadow-md shadow-indigo-950/30"
                    onClick={() => handleRetry(failedAgentId || selectedAgentId)}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Retry from {AGENT_SEQUENCE.find((a) => a.id === (failedAgentId || selectedAgentId))?.name || "Step"}
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                className="bg-transparent border-[#252A32] text-[#EF4444] hover:bg-[#EF4444]/10 hover:border-[#EF4444]/30 text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-colors shrink-0"
                onClick={handleCancelCampaign}
              >
                Cancel Campaign
              </Button>
            </div>
          </div>
        )}

        {/* Completed State */}
        {isCompleted && (
          <div className="flex flex-col text-[#111318] p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">AI Studio</h2>
                <p className="text-xs sm:text-sm text-[#6B7280]">Multi-Agent Campaign</p>
              </div>
              <button onClick={onClose} className="p-2 text-[#6B7280] hover:text-[#111318] hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Message */}
            <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4 my-4 sm:my-6">
              <div className="w-[72px] h-[72px] sm:w-[86px] sm:h-[86px] rounded-full bg-[#22C55E]/10 flex items-center justify-center mb-1">
                <CheckCircle2 className="w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] text-[#22C55E]" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold mb-1.5">Campaign Ready!</h3>
                <p className="text-xs sm:text-sm text-[#6B7280]">Your content has been successfully created.</p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 sm:mt-6">
              <Button
                onClick={handleApplyToEditors}
                className="w-full h-12 sm:h-[56px] bg-[#0B0D10] hover:bg-black text-white rounded-xl text-sm sm:text-base font-medium transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                Add Content to Editor
                <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
