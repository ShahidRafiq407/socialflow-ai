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
  ChevronDown,
  ChevronRight,
  Globe,
  Database,
  Cpu,
  Play,
  Pause,
  RefreshCw,
  FileText,
  Link2,
  Search,
  Target,
  Lightbulb,
  Video,
  Clock,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MultiAgentStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: string[];
  contentTypes: Record<string, string[]>;
  onCompletePayload: (payload: any) => void;
  workspaceId?: string;
}

type StepStatus = "waiting" | "thinking" | "running" | "completed" | "error";
type AgentActionType = "search" | "analyze" | "write" | "generate" | "review" | "info";

interface AgentOutput {
  brandDNA?: any;
  trendData?: string;
  trendSources?: any[];
  competitorData?: string;
  campaignPayload?: any;
  nextWorker?: string;
  ceoVerdict?: string;
  [key: string]: any;
}

interface LogEntry {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  type: "info" | "thought" | "call" | "output" | "error" | "search" | "source";
  message: string;
  payload?: any;
  sources?: Array<{ url: string; title?: string }>;
  searchQuery?: string;
}

interface AgentStep {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: any;
  model: string;
  status: StepStatus;
  output?: AgentOutput;
  latencyMs?: number;
  startTime?: number;
  endTime?: number;
  expanded?: boolean;
}

interface StreamEvent {
  type: "agent-start" | "agent-action" | "agent-thought" | "agent-output" | "agent-complete" | "pipeline-error";
  agentId: string;
  data?: any;
}

/* ─── Agent Definitions ─────────────────────────────────────── */
const AGENT_DEFS: Omit<AgentStep, "status">[] = [
  {
    id: "brandAnalyst",
    name: "Brand Analyst",
    role: "Extract Brand DNA",
    description: "Analyzes workspace brand profile, target audience, tone, and unique differentiators from database.",
    icon: Building2,
  },
  {
    id: "trendResearcher",
    name: "Trend Researcher",
    role: "Live Web Research",
    description: "Uses Google Search Grounding to find breaking news and viral trends from the last 24-48 hours.",
    icon: TrendingUp,
  },
  {
    id: "competitorAnalyst",
    name: "Competitor Analyst",
    role: "Market Gap Analysis",
    description: "Identifies unique angles and differentiation strategies based on competitor weaknesses.",
    icon: ShieldCheck,
  },
  {
    id: "contentCreator",
    name: "Pro Copywriter",
    role: "Viral Content Creation",
    description: "Crafts human-sounding, platform-optimized copy with pattern interrupts and emotional triggers.",
    icon: PenTool,
  },
  {
    id: "visualizerCreator",
    name: "Visual Director",
    role: "Visual Asset Generation",
    description: "Generates vivid image prompts, slide overlays, and assigns HD stock media for visual formats.",
    icon: ImageIcon,
  },
  {
    id: "supervisor",
    name: "CEO Auditor",
    role: "Quality Certification",
    description: "Final review for AI clichés, hook strength, tone authenticity, and professional quality.",
    icon: Crown,
  },
];

const formatTime = (ms?: number) => {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatTimestamp = () => {
  return new Date().toLocaleTimeString("en-US", { 
    hour12: false, 
    hour: "2-digit", 
    minute: "2-digit", 
    second: "2-digit" 
  });
};
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
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const completedPayloadRef = useRef<any>(null);

  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  const updateAgent = useCallback((agentId: string, updates: Partial<AgentStep>) => {
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, ...updates } : a)));
  }, []);

  const addAction = useCallback((agentId: string, action: Omit<AgentAction, "timestamp">) => {
    setAgents((prev) => prev.map((a) => a.id !== agentId ? a : { ...a, actions: [...a.actions, { ...action, timestamp: Date.now() }] }));
  }, []);

  const addThought = useCallback((agentId: string, thought: string) => {
    setAgents((prev) => prev.map((a) => a.id !== agentId ? a : { ...a, thoughts: [...(a.thoughts || []), thought] }));
  }, []);

  const runPipeline = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setErrorMsg(null);
    setIsApplied(false);
    setCompletedPayload(null);
    completedPayloadRef.current = null;

    const initialAgents: AgentStep[] = AGENT_CONFIGS.map((config) => ({ ...config, status: "waiting" as StepStatus, actions: [], thoughts: [], output: null, latencyMs: undefined, startTime: undefined }));
    setAgents(initialAgents);
    setExpandedAgents(new Set());

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/ai-studio-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "generate-campaign", platforms, contentTypes }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Server error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error("No response body");

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
            const event: StreamEvent = JSON.parse(line.replace("data: ", ""));
            handleStreamEvent(event);
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setErrorMsg(err.message || "Pipeline failed");
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, platforms, contentTypes, addAction, addThought, updateAgent]);

  const handleStreamEvent = (event: StreamEvent) => {
    const { agentId, type, data } = event;
    switch (type) {
      case "agent-start":
        updateAgent(agentId, { status: "thinking", startTime: Date.now() });
        setActiveAgentId(agentId);
        setExpandedAgents((prev) => new Set([...prev, agentId]));
        break;
      case "agent-action": addAction(agentId, data); break;
      case "agent-thought": addThought(agentId, data); break;
      case "agent-output": updateAgent(agentId, { status: "completed", output: data, latencyMs: Date.now() - (agents.find((a) => a.id === agentId)?.startTime || Date.now()) }); break;
      case "agent-complete": updateAgent(agentId, { status: "completed", latencyMs: Date.now() - (agents.find((a) => a.id === agentId)?.startTime || Date.now()) }); break;
      case "pipeline-error": setErrorMsg(data?.message || "Pipeline error"); break;
    }
  };

  useEffect(() => {
    if (isOpen && !hasStartedRef.current) {
      hasStartedRef.current = true;
      setTimeout(() => runPipeline(), 300);
    }
    if (!isOpen) {
      hasStartedRef.current = false;
      abortRef.current?.abort();
    }
  }, [isOpen, runPipeline]);

  const handleApplyToEditors = () => {
    const payload = completedPayloadRef.current || completedPayload;
    if (payload) {
      setIsApplied(true);
      onCompletePayload(payload);
      setTimeout(() => { onClose(); setIsApplied(false); setCompletedPayload(null); completedPayloadRef.current = null; hasStartedRef.current = false; }, 1200);
    }
  };

  if (!isOpen) return null;

  const completedCount = agents.filter((a) => a.status === "completed").length;
  const progressPercentage = agents.length > 0 ? Math.round((completedCount / agents.length) * 100) : 0;
  const isFullyComplete = completedCount === agents.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden my-4 max-h-[95vh]">
        <div className="p-5 px-7 bg-gradient-to-r from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white flex items-center justify-center shadow-lg shrink-0">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Autonomous Campaign Engine</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Multi-agent AI workflow with live execution tracking</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-all shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-7 py-4 bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Pipeline Progress</span>
            <span className="text-xs font-bold text-slate-900 dark:text-white">{completedCount} / {agents.length} agents complete</span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary via-primary/90 to-primary transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-900 space-y-3">
          {agents.map((agent) => {
            const isActive = agent.id === activeAgentId;
            const isExpanded = expandedAgents.has(agent.id);
            const isRunning = agent.status === "thinking" || agent.status === "running";
            const isDone = agent.status === "completed";
            const Icon = agent.icon;

            return (
              <div key={agent.id} className={`border rounded-2xl overflow-hidden transition-all duration-300 ${isActive ? "border-primary shadow-lg shadow-primary/10 bg-white dark:bg-slate-950" : isDone ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10" : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50"}`}>
                <button onClick={() => toggleAgent(agent.id)} className="w-full p-5 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isDone ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400" : isActive ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-400"}`}>
                    {isDone ? <CheckCircle2 className="h-6 w-6" /> : isRunning ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className="h-6 w-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{agent.name}</h3>
                      {isRunning && <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">{agent.status === "thinking" ? "ANALYZING" : "WORKING"}</span>}
                      {isDone && agent.latencyMs && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">{agent.latencyMs}ms</span>}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{agent.role}</p>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      <Cpu className="h-3 w-3" />
                      {agent.model}
                    </div>
                  </div>
                  <div className="shrink-0">{isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}</div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                    {agent.thoughts && agent.thoughts.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Agent Reasoning</div>
                        <div className="space-y-2">
                          {agent.thoughts.map((thought, tIdx) => (
                            <div key={tIdx} className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3 border-l-2 border-primary/50">{thought}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {agent.actions.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Live Actions</div>
                        <div className="space-y-2">
                          {agent.actions.map((action, aIdx) => {
                            const ActionIcon = getAgentIcon(action.type);
                            const color = getAgentColor(action.type);
                            return (
                              <div key={aIdx} className="flex items-start gap-3 text-xs bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                <div className={`${color} shrink-0 mt-0.5`}><ActionIcon className="h-4 w-4" /></div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-slate-900 dark:text-white">{action.label}</div>
                                  {action.detail && <div className="text-slate-500 dark:text-slate-400 mt-1 text-[11px]">{action.detail}</div>}
                                  {action.url && (
                                    <a href={action.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 mt-2 font-semibold">
                                      <Link2 className="h-3 w-3" />View Source<ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {agent.output && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Output</div>
                        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{JSON.stringify(agent.output, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-5 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-700 dark:text-red-400 text-sm mb-1">Pipeline Error</div>
                <div className="text-xs text-red-600 dark:text-red-300">{errorMsg}</div>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 px-7 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs font-semibold">Cancel</Button>
          {isApplied ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 px-6 py-2.5 rounded-xl animate-in zoom-in-95">
              <Check className="h-4 w-4" /><span>Content Added to Editor! Closing...</span>
            </div>
          ) : isFullyComplete && completedPayload ? (
            <Button onClick={handleApplyToEditors} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg transition-all hover:scale-[1.02] flex items-center gap-2">
              Add All Content to Editor<ArrowRight className="h-4 w-4" />
            </Button>
          ) : isRunning ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /><span>Agents are executing...</span>
            </div>
          ) : (
            <div className="text-xs text-slate-400">Ready</div>
          )}
        </div>
      </div>
    </div>
  );
}
