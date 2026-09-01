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
  Brain,
  Zap,
  AlertTriangle,
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

/** Structured, safe execution entry derived from real backend/SSE events. */
interface TimelineEntry {
  id: string;
  agentId: string;
  status: "running" | "completed" | "error" | "pending" | "thought";
  /**
   * "action" = a step the agent performed. "thought" = a reasoning line streamed
   * straight from the model that is doing the work (Gemini thought summaries), so the
   * console shows what the agent is actually considering, one step at a time.
   */
  kind: "action" | "thought";
  stage: string;
  summary: string;
  /** Which parallel unit of work this line belongs to (e.g. "vertical video (9:16)"). */
  scope?: string;
  progress?: number;
  ts: number;
}

interface AgentConfig {
  id: string;
  number: number;
  name: string;
  icon: React.ElementType;
  description: string;
  /**
   * Share of the overall progress bar. These are relative costs of the real work
   * (a database read is not worth as much as rendering every asset), so the bar
   * tracks how much of the campaign is actually done instead of counting agents.
   */
  weight: number;
}

const AGENT_SEQUENCE: AgentConfig[] = [
  {
    id: "brand_analyst",
    number: 1,
    name: "Brand Analyst",
    icon: Database,
    description: "Loading brand DNA from database",
    weight: 5,
  },
  {
    id: "trend_researcher",
    number: 2,
    name: "Trend Researcher",
    icon: Globe,
    description: "Live Google Search & trend research",
    weight: 15,
  },
  {
    id: "competitor_analyst",
    number: 3,
    name: "Competitor Analyst",
    icon: Users,
    description: "Evaluating market positioning & gaps",
    weight: 15,
  },
  {
    id: "content_creator",
    number: 4,
    name: "Content Creator",
    icon: PenTool,
    description: "Writing platform-native viral copy",
    weight: 25,
  },
  {
    id: "visualizer",
    number: 5,
    name: "Visualizer",
    icon: ImageIcon,
    description: "Generating visual & video assets",
    weight: 30,
  },
  {
    id: "ceo_auditor",
    number: 6,
    name: "CEO Auditor",
    icon: ShieldCheck,
    description: "Quality audit, revision & re-verification",
    weight: 10,
  },
];

interface PhaseInfo {
  phase: string;
  label: string;
  agents: string[];
  /** True when the agents in this phase genuinely run at the same time. */
  parallel: boolean;
  status: "waiting" | "running" | "completed";
}

/**
 * Placeholder grouping so the sidebar has structure before the first event lands.
 * Every field is overwritten by the real `phase_started` events, so the UI always
 * ends up showing the graph the backend actually executed.
 */
const DEFAULT_PHASES: PhaseInfo[] = [
  { phase: "foundation", label: "Brand foundation", agents: ["brand_analyst"], parallel: false, status: "waiting" },
  {
    phase: "research",
    label: "Market research",
    agents: ["trend_researcher", "competitor_analyst"],
    parallel: true,
    status: "waiting",
  },
  {
    phase: "production",
    label: "Content production",
    agents: ["content_creator", "visualizer"],
    parallel: true,
    status: "waiting",
  },
  { phase: "audit", label: "CEO audit", agents: ["ceo_auditor"], parallel: false, status: "waiting" },
];

/** Keeps the console bounded on long campaigns without losing the recent history. */
const MAX_TIMELINE_ENTRIES = 400;


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
  const [agentProgress, setAgentProgress] = useState<Record<string, number>>({});
  const [agentStages, setAgentStages] = useState<Record<string, string>>({});
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [phases, setPhases] = useState<PhaseInfo[]>(DEFAULT_PHASES);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [trendSources, setTrendSources] = useState<{ title: string; url: string; snippet: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [completedPayload, setCompletedPayload] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedAgentId, setFailedAgentId] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const agentOutputsRef = useRef<Record<string, any>>({});
  const agentProgressRef = useRef<Record<string, number>>({});
  const runIdRef = useRef<string>(`run_${Date.now()}`);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<any>(null);
  // Event dedup: the backend stamps every event with a monotonic `seq`, so identity is
  // exact. Deriving the key from the payload (as this used to) collapsed two genuinely
  // different steps that happened to produce the same label, and real progress vanished
  // from the console. `seq` falls back to the payload key for older/other producers.
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const timelineBoxRef = useRef<HTMLDivElement>(null);
  const followScrollRef = useRef<boolean>(true);

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
      setAgentProgress({});
      setAgentStages({});
      setTimeline([]);
      setPhases(DEFAULT_PHASES);
      setAuditResult(null);
      setFailedAgentId(null);
      setUserHasManuallySelected(false);
      setSelectedAgentId("brand_analyst");
      seenEventIdsRef.current.clear();
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
      // Show a real retry entry based on the actual resume target
      setTimeline((prev) => [
        ...prev,
        {
          id: `${runIdRef.current}:retry:${targetResumeAgent}:${Date.now()}`,
          agentId: targetResumeAgent,
          status: "running",
          kind: "action",
          stage: "retrying",
          summary: `Retrying ${AGENT_SEQUENCE.find((a) => a.id === targetResumeAgent)?.name || targetResumeAgent}`,
          ts: Date.now(),
        },
      ]);
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

    // Dedup. `seq` is a monotonic counter the backend stamps on every event, so two
    // steps with identical text are still distinct. Replayed events on a resume are
    // ignored because the runId changes with each stream.
    const payloadKey =
      data?.timestamp ??
      data?.progress ??
      data?.safe_summary ??
      data?.stage ??
      data?.label ??
      data?.query ??
      data?.message ??
      JSON.stringify(data ?? {})?.slice(0, 80);
    const eventId =
      typeof data?.seq === "number"
        ? `${runIdRef.current}:${data.seq}`
        : `${runIdRef.current}:${type}:${agentId}:${payloadKey}`;
    if (seenEventIdsRef.current.has(eventId)) return;
    seenEventIdsRef.current.add(eventId);

    /** Appends a console line, closing off the agent's previous in-flight action. */
    const pushEntry = (entry: TimelineEntry, closePreviousAction = false) => {
      setTimeline((prev) => {
        const base = closePreviousAction
          ? prev.map((e) =>
              e.agentId === entry.agentId && e.status === "running"
                ? { ...e, status: "completed" as const }
                : e
            )
          : prev;
        const next = [...base, entry];
        return next.length > MAX_TIMELINE_ENTRIES ? next.slice(next.length - MAX_TIMELINE_ENTRIES) : next;
      });
    };

    if (type === "phase_started") {
      const phase = data?.phase;
      if (phase) {
        setPhases((prev) => {
          const incoming: PhaseInfo = {
            phase,
            label: data?.label || phase,
            agents: Array.isArray(data?.agents) ? data.agents : [],
            parallel: Boolean(data?.parallel),
            status: "running",
          };
          const idx = prev.findIndex((p) => p.phase === phase);
          if (idx === -1) return [...prev, incoming];
          const next = [...prev];
          // The backend is authoritative about which agents ran in this phase.
          next[idx] = { ...incoming, agents: incoming.agents.length ? incoming.agents : prev[idx].agents };
          return next;
        });
      }
    } else if (type === "phase_completed") {
      const phase = data?.phase;
      if (phase) {
        setPhases((prev) =>
          prev.map((p) => (p.phase === phase ? { ...p, status: "completed" as const } : p))
        );
      }
    } else if (type === "agent_started") {
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "running" }));
      // Automatically switch active panel to running agent unless user explicitly clicked another
      if (!userHasManuallySelected) {
        setSelectedAgentId(agentId);
      }
    } else if (type === "agent_progress") {
      const p = data?.progress;
      if (typeof p === "number") {
        agentProgressRef.current[agentId] = p;
        setAgentProgress((prev) => ({ ...prev, [agentId]: p }));
      }
      if (data?.safe_summary) {
        setAgentStages((prev) => ({ ...prev, [agentId]: data.safe_summary }));
      }
      // Only update the progress bar + current stage label.
      // Do NOT add timeline entries — agent_action events carry the
      // real work steps that the user actually sees.
    } else if (type === "agent_thought") {
      // A single reasoning step, already trimmed to one narrow line server-side.
      if (data?.line) {
        pushEntry({
          id: eventId,
          agentId,
          status: "thought",
          kind: "thought",
          stage: "thinking",
          summary: data.line,
          scope: data?.scope,
          ts: Date.now(),
        });
      }
    } else if (type === "agent_action") {
      if (data?.label) {
        pushEntry(
          {
            id: eventId,
            agentId,
            status: "running",
            kind: "action",
            stage: "action",
            summary: data.label,
            scope: data?.scope,
            progress: agentProgressRef.current[agentId] ?? 0,
            ts: Date.now(),
          },
          true
        );
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
        if (agentId === "ceo_auditor") setAuditResult(data);
      }
    } else if (type === "agent_completed") {
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "completed" }));
      agentProgressRef.current[agentId] = 100;
      setAgentProgress((prev) => ({ ...prev, [agentId]: 100 }));
      pushEntry(
        {
          id: eventId,
          agentId,
          status: "completed",
          kind: "action",
          stage: "completed",
          summary: "Completed",
          progress: 100,
          ts: Date.now(),
        },
        true
      );
    } else if (type === "agent_error") {
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "error" }));
      setFailedAgentId(agentId);
      // Mark this agent's running entries as error, then append the error entry
      setTimeline((prev) =>
        prev.map((e) =>
          e.agentId === agentId && e.status === "running"
            ? { ...e, status: "error" as const }
            : e
        )
      );
      pushEntry({
        id: eventId,
        agentId,
        status: "error",
        kind: "action",
        stage: "error",
        summary: data?.message || "Failed",
        ts: Date.now(),
      });
      if (data?.message) setErrorMessage(data.message);
    } else if (type === "workflow_completed") {
      if (timerRef.current) clearInterval(timerRef.current);
      const payload = data?.campaign || data?.resultState?.generatedContent || data;
      if (payload) {
        setCompletedPayload(payload);
      }
      if (data?.audit) setAuditResult(data.audit);
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

  // Keep the live execution timeline pinned to the latest event, but respect
  // manual scroll: if the user scrolled up, don't yank the view back down.
  useEffect(() => {
    if (followScrollRef.current) {
      timelineEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [timeline, selectedAgentId]);

  const handleTimelineScroll = () => {
    const el = timelineBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    followScrollRef.current = distanceFromBottom < 80;
  };

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

  // Weighted by how much real work each agent does, so the bar reflects campaign
  // completion rather than "3 of 6 boxes ticked". Two agents running in parallel both
  // contribute at once, which is exactly what the production phase does.
  const totalWeight = AGENT_SEQUENCE.reduce((acc, a) => acc + a.weight, 0);
  const realProgress = Math.min(
    100,
    Math.round(
      AGENT_SEQUENCE.reduce((acc, a) => {
        const status = agentStatuses[a.id] || "waiting";
        const pct = status === "completed" ? 100 : Math.max(0, Math.min(100, agentProgress[a.id] ?? 0));
        return acc + (a.weight * pct) / 100;
      }, 0) / (totalWeight / 100)
    )
  );

  const activeAgentConfig = AGENT_SEQUENCE.find((a) => a.id === selectedAgentId) || AGENT_SEQUENCE[0];
  const activeAgentOutput = agentOutputs[selectedAgentId];
  const activeAgentStatus = agentStatuses[selectedAgentId] || "waiting";
  const activeAgentProgress = agentProgress[selectedAgentId] ?? 0;
  // Timeline filtered to the selected agent so the execution console stays scoped
  const activeTimeline = timeline.filter((e) => e.agentId === selectedAgentId);
  const activeThoughtCount = activeTimeline.filter((e) => e.kind === "thought").length;
  // Every agent the backend has grouped into a phase, so the sidebar can only show an
  // agent once even if a phase list changes mid-run.
  const phasedAgentIds = new Set(phases.flatMap((p) => p.agents));
  const ungroupedAgents = AGENT_SEQUENCE.filter((a) => !phasedAgentIds.has(a.id));
  // All agents' progress for the sidebar (real, from backend)
  const sidebarProgress = (agentId: string) => {
    const st = agentStatuses[agentId] || "waiting";
    if (st === "completed") return 100;
    if (st === "error") return agentProgress[agentId] ?? 0;
    return agentProgress[agentId] ?? (st === "running" ? 0 : 0);
  };

  const renderAgentCard = (agent: AgentConfig) => {
    const Icon = agent.icon;
    const status = agentStatuses[agent.id] || "waiting";
    const isSelected = agent.id === selectedAgentId;
    const isAgentCompleted = status === "completed";
    const isRunning = status === "running";
    const isFailed = status === "error";

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
            : isFailed
            ? "bg-transparent border-[#EF4444]/30 hover:bg-[#11141A]"
            : "bg-transparent border-transparent opacity-50 hover:opacity-75"
        }`}
      >
        <div
          className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border mt-0.5 ${
            isAgentCompleted
              ? "bg-[#22C55E]/10 border-[#22C55E]/20 text-[#22C55E]"
              : isFailed
              ? "bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]"
              : isRunning
              ? "bg-[#8B5CF6]/10 border-[#8B5CF6]/20 text-[#8B5CF6]"
              : "bg-[#1A1D24] border-[#252A32] text-[#9CA3AF]"
          }`}
        >
          {isAgentCompleted ? (
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          ) : isFailed ? (
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              {isRunning && (
                <span className="text-[9px] sm:text-[10px] font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-1.5 py-0.5 rounded-full border border-[#8B5CF6]/20">
                  {Math.round(sidebarProgress(agent.id))}%
                </span>
              )}
              {isAgentCompleted && <span className="text-[9px] sm:text-[10px] font-mono text-[#22C55E]">100%</span>}
            </div>
          </div>
          <p className="text-[11px] sm:text-xs text-[#6B7280] line-clamp-1 md:line-clamp-2 leading-tight sm:leading-relaxed">
            {agentStages[agent.id] || agent.description}
          </p>
          {/* Compact per-agent progress bar (real backend progress) */}
          {(isRunning || isAgentCompleted || isFailed) && (
            <div className="h-0.5 w-full bg-[#1A1D24] rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isAgentCompleted ? "bg-[#22C55E]" : isFailed ? "bg-[#EF4444]" : "bg-[#8B5CF6]"
                }`}
                style={{ width: `${sidebarProgress(agent.id)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

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
              {/* Left Column: Agents grouped by execution phase */}
              <div className="w-full md:w-[35%] lg:w-[32%] md:min-w-[280px] border-b md:border-b-0 md:border-r border-[#252A32] overflow-y-auto p-3 sm:p-4 space-y-3 max-h-[180px] sm:max-h-[220px] md:max-h-none shrink-0 md:shrink">
                {phases.map((phase) => {
                  const phaseAgents = phase.agents
                    .map((id) => AGENT_SEQUENCE.find((a) => a.id === id))
                    .filter(Boolean) as AgentConfig[];
                  if (phaseAgents.length === 0) return null;

                  const runningInPhase = phaseAgents.filter((a) => agentStatuses[a.id] === "running").length;

                  return (
                    <div key={phase.phase} className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider ${
                            phase.status === "completed"
                              ? "text-[#22C55E]"
                              : phase.status === "running"
                              ? "text-[#A78BFA]"
                              : "text-[#4B5563]"
                          }`}
                        >
                          {phase.label}
                        </span>
                        {/* Parallel phases really do run at the same time in the graph —
                            the badge and the simultaneous spinners are not decorative. */}
                        {phase.parallel && phaseAgents.length > 1 && (
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                              runningInPhase > 1
                                ? "bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/30"
                                : "bg-[#1A1D24] text-[#6B7280] border-[#252A32]"
                            }`}
                          >
                            <Zap className="w-2.5 h-2.5" />
                            PARALLEL
                          </span>
                        )}
                        <div className="flex-1 h-px bg-[#252A32]" />
                      </div>
                      {phaseAgents.map(renderAgentCard)}
                    </div>
                  );
                })}
                {ungroupedAgents.length > 0 && (
                  <div className="space-y-1.5">{ungroupedAgents.map(renderAgentCard)}</div>
                )}
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
                  <div className="bg-[#11141A] border border-[#252A32] rounded-[16px] p-4 sm:p-5 space-y-4">
                    {/* Header: agent + real progress + status */}
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
                          {activeAgentConfig.name}
                        </h4>
                        <div className="text-[10px] font-mono uppercase text-[#6B7280] mt-0.5">
                          {activeAgentStatus === "running"
                            ? agentStages[selectedAgentId] || "Executing"
                            : activeAgentStatus === "completed"
                            ? "Completed"
                            : activeAgentStatus === "error"
                            ? "Failed"
                            : "Queued"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeAgentStatus === "running" && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8B5CF6] opacity-60" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#8B5CF6]" />
                          </span>
                        )}
                        <span className="text-sm font-mono font-bold text-white">
                          {activeAgentStatus === "completed"
                            ? "100%"
                            : `${Math.round(activeAgentProgress)}%`}
                        </span>
                      </div>
                    </div>

                    {/* Compact progress bar — real backend progress, no fake animation */}
                    <div className="h-1.5 w-full bg-[#1A1D24] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          activeAgentStatus === "error"
                            ? "bg-[#EF4444]"
                            : activeAgentStatus === "completed"
                            ? "bg-[#22C55E]"
                            : "bg-[#8B5CF6]"
                        }`}
                        style={{
                          width: `${
                            activeAgentStatus === "completed" ? 100 : Math.round(activeAgentProgress)
                          }%`,
                        }}
                      />
                    </div>
                    {/* Scrollable live execution console: real actions interleaved with the
                        model's own reasoning, in the order they actually happened. */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                        Live execution
                      </span>
                      {activeThoughtCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono text-[#A78BFA] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-1.5 py-0.5 rounded-full">
                          <Brain className="w-2.5 h-2.5" />
                          {activeThoughtCount} reasoning step{activeThoughtCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <div
                      ref={timelineBoxRef}
                      onScroll={handleTimelineScroll}
                      className="h-52 sm:h-56 overflow-y-auto pr-1 -mr-1 space-y-1"
                    >
                      {activeTimeline.length > 0 ? (
                        activeTimeline.map((entry) =>
                          entry.kind === "thought" ? (
                            // One reasoning step, one narrow line — streamed from the model
                            // that is doing this work, not a scripted string.
                            <div key={entry.id} className="flex items-start gap-2.5 px-2 py-1">
                              <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6D28D9]" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] italic leading-snug text-[#9CA3AF]">{entry.summary}</p>
                                {entry.scope && (
                                  <span className="text-[9px] uppercase tracking-wide text-[#4B5563]">
                                    {entry.scope}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div
                              key={entry.id}
                              className={`flex items-start gap-2.5 px-2 py-1.5 rounded-md ${
                                entry.status === "running"
                                  ? "bg-[#0D1015] border border-[#252A32]/60"
                                  : ""
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                  entry.status === "completed"
                                    ? "bg-[#22C55E]/15 text-[#22C55E]"
                                    : entry.status === "error"
                                    ? "bg-[#EF4444]/15 text-[#EF4444]"
                                    : entry.status === "pending"
                                    ? "bg-[#1A1D24] text-[#4B5563]"
                                    : "bg-[#8B5CF6]/15 text-[#8B5CF6]"
                                }`}
                              >
                                {entry.status === "completed" ? (
                                  "✓"
                                ) : entry.status === "error" ? (
                                  "✕"
                                ) : entry.status === "pending" ? (
                                  "○"
                                ) : (
                                  "●"
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-xs leading-snug ${
                                    entry.status === "completed" || entry.status === "running"
                                      ? "text-white"
                                      : entry.status === "error"
                                      ? "text-[#F87171]"
                                      : "text-[#6B7280]"
                                  }`}
                                >
                                  {entry.summary}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {typeof entry.progress === "number" && (
                                    <span className="text-[9px] font-mono text-[#6B7280]">
                                      {Math.round(entry.progress)}%
                                    </span>
                                  )}
                                  <span className="text-[9px] uppercase tracking-wide text-[#4B5563]">
                                    {entry.scope || entry.stage}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        )
                      ) : (
                        <div className="px-2 py-4 text-center">
                          {activeAgentStatus === "waiting" ? (
                            <div className="flex items-center justify-center gap-2 text-xs text-[#6B7280]">
                              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1A1D24] text-[10px] text-[#4B5563]">○</span>
                              Queued — waiting for the previous phase
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2 text-xs text-[#6B7280]">
                              <span className="inline-block h-2 w-2 rounded-full bg-[#8B5CF6] animate-pulse" />
                              Waiting for execution events…
                            </div>
                          )}
                        </div>
                      )}
                      <div ref={timelineEndRef} />
                    </div>
                  </div>

                    {/* Agent Live Activity Messages — rendered from real backend events above */}
{/* REAL-DETAILS-ANCHOR */}

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
