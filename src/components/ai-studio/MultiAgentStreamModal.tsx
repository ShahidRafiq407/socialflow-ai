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
  SkipForward,
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
  /** True when the work in this phase genuinely happens at the same time. */
  parallel: boolean;
  /**
   * How the work overlaps, so the badge can be honest about it.
   *  - `sequential`: one thing at a time.
   *  - `parallel`: independent units side by side — either several agents that never
   *    wait for each other, or one agent fanning out over several targets at once
   *    (the visualizer rendering every platform's media simultaneously).
   *  - `pipeline`: overlapping but dependent — kept for streams that still send it.
   */
  mode: "sequential" | "parallel" | "pipeline";
  status: "waiting" | "running" | "completed";
}

/**
 * Placeholder grouping so the sidebar has structure before the first event lands.
 * Every field is overwritten by the real `phase_started` events, so the UI always
 * ends up showing the graph the backend actually executed.
 */
const DEFAULT_PHASES: PhaseInfo[] = [
  {
    phase: "foundation",
    label: "Brand foundation",
    agents: ["brand_analyst"],
    parallel: false,
    mode: "sequential",
    status: "waiting",
  },
  {
    phase: "research",
    label: "Market research",
    agents: ["trend_researcher", "competitor_analyst"],
    parallel: true,
    mode: "parallel",
    status: "waiting",
  },
  // Writing and rendering are two stages, not two peers: the visualizer cannot render
  // a format until the content creator has handed it that format's visual prompt.
  // Both fan out over formats in parallel — the text model's quota is roomy, and the
  // image model's per-minute quota is protected by the shared rate pacer, not by
  // rendering serially (serial rendering stacked 30-120s per format and blew the run
  // budget on multi-format campaigns).
  {
    phase: "copy",
    label: "Content writing",
    agents: ["content_creator"],
    parallel: true,
    mode: "parallel",
    status: "waiting",
  },
  {
    phase: "render",
    label: "Media production",
    agents: ["visualizer"],
    parallel: true,
    mode: "parallel",
    status: "waiting",
  },
  {
    phase: "audit",
    label: "CEO audit",
    agents: ["ceo_auditor"],
    parallel: false,
    mode: "sequential",
    status: "waiting",
  },
];

/** Keeps the console bounded on long campaigns without losing the recent history. */
const MAX_TIMELINE_ENTRIES = 400;

/**
 * Puts rendered media back onto the copy it belongs to.
 *
 * The content creator's payload is streamed BEFORE any media exists, and the visualizer
 * streams its assets separately — so the two have to be joined here. Without it, a run
 * that ends early hands the editor captions with no images even though the images
 * rendered, and a retry re-renders media the previous attempt already paid for.
 */
function mergeAssetsIntoContent(content: any, assets: any[]): any {
  if (!content?.platforms || !Array.isArray(assets) || assets.length === 0) return content;

  const merged = {
    ...content,
    platforms: Object.fromEntries(
      Object.entries(content.platforms as Record<string, Record<string, any>>).map(
        ([platform, formats]) => [
          platform,
          Object.fromEntries(
            Object.entries(formats || {}).map(([format, item]) => [format, { ...(item as any) }])
          ),
        ]
      )
    ),
  };

  for (const asset of assets) {
    const item = merged.platforms?.[asset?.platform]?.[asset?.contentType];
    if (!item || !asset?.url) continue;
    if (asset.type === "video") {
      item.videoUrl = item.videoUrl || asset.url;
      continue;
    }
    // Slides arrive as one asset per slide, in order, so a carousel rebuilds by appending.
    item.imageUrl = item.imageUrl || asset.url;
    const slides: string[] = Array.isArray(item.slideUrls) ? item.slideUrls : [];
    if (!slides.includes(asset.url)) item.slideUrls = [...slides, asset.url];
  }

  // A single image is not a carousel: drop the one-entry slide list so the editor does not
  // render a one-slide deck for a plain feed post.
  for (const formats of Object.values(merged.platforms as Record<string, Record<string, any>>)) {
    for (const item of Object.values(formats || {})) {
      if (Array.isArray((item as any).slideUrls) && (item as any).slideUrls.length < 2) {
        delete (item as any).slideUrls;
      }
    }
  }

  return merged;
}


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
  // When the stream opened. The console labels each step with its offset from this, so
  // it has to be state the render can read — not a ref.
  const [runStartedAt, setRunStartedAt] = useState(0);
  // Seconds since the last event arrived. A render can legitimately be quiet for a
  // minute or two, but a stream that has gone silent for a long time is the failure the
  // user experienced as "stuck": the server was killed mid-render, so no error ever came
  // and the spinner span forever. Surfacing the silence lets them skip or retry.
  const [secondsSinceEvent, setSecondsSinceEvent] = useState(0);
  const [skipRequested, setSkipRequested] = useState<string | null>(null);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
  /**
   * The format family being rendered right now, mirrored out of the ref so the UI can name
   * it on the Skip button. Without it the button would have to say "this step", and the
   * user could not tell which post they were about to ship without media.
   */
  const [activeScope, setActiveScope] = useState<string | null>(null);
  /**
   * Whether a stream is still being read. An agent failure does not always end the run —
   * "no media rendered at all" reports the visualizer as failed and carries on to the
   * audit — so the error banner has to know whether there is still a run in flight before
   * it offers to restart one.
   */
  const [isStreamLive, setIsStreamLive] = useState(false);

  const agentOutputsRef = useRef<Record<string, any>>({});
  const agentProgressRef = useRef<Record<string, number>>({});
  const runIdRef = useRef<string>(`run_${Date.now()}`);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<any>(null);
  // Wall-clock start, mirrored in a ref so the timer reads it synchronously. The elapsed
  // clock is computed as (now - this) on every tick rather than by incrementing a counter:
  // browsers throttle setInterval in a backgrounded tab (to ~once a minute when hidden), so
  // a "+1 each second" counter drifts badly — a 25-minute run showed as 7. Recomputing from
  // the timestamp is immune to that and snaps to the true value the moment the tab refocuses.
  const runStartedAtRef = useRef<number>(0);
  /** When the last SSE event landed, for the stall detector. Same wall-clock reasoning. */
  const lastEventAtRef = useRef<number>(0);
  /**
   * The scope (format family) the visualizer is currently working on, tracked from the
   * scoped events. A skip has to name what it is abandoning, and the user should not have
   * to tell the server something the stream already said.
   */
  const activeScopeRef = useRef<string | null>(null);
  // Event dedup: the backend stamps every event with a monotonic `seq`, so identity is
  // exact. Deriving the key from the payload (as this used to) collapsed two genuinely
  // different steps that happened to produce the same label, and real progress vanished
  // from the console. `seq` falls back to the payload key for older/other producers.
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const timelineBoxRef = useRef<HTMLDivElement>(null);
  const followScrollRef = useRef<boolean>(true);
  // `startStream` is memoised, so the handler it closes over is frozen at the render that
  // created it: a user's agent click never reached it and the panel kept auto-switching.
  // Dispatching through a ref always runs the current handler.
  const handleStreamEventRef = useRef<((event: any) => void) | null>(null);
  // Two `agent_started` events for a parallel phase arrive in the same tick, before React
  // has re-rendered. These mirrors let the handler read what it just decided.
  const agentStatusesRef = useRef<Record<string, AgentStatus>>({});
  const selectedAgentIdRef = useRef<string>("brand_analyst");
  const manualSelectionRef = useRef<boolean>(false);

  /** Applies a status change to both the ref (read by the handler) and the view. */
  const applyAgentStatus = (id: string, status: AgentStatus) => {
    agentStatusesRef.current = { ...agentStatusesRef.current, [id]: status };
    setAgentStatuses((prev) => ({ ...prev, [id]: status }));
  };

  /** Moves the focused panel. `manual` locks out further automatic switching. */
  const focusAgent = (id: string, manual = false) => {
    if (manual) manualSelectionRef.current = true;
    selectedAgentIdRef.current = id;
    setSelectedAgentId(id);
  };

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
      setSkipRequested(null);
      setSkipNotice(null);
      setActiveScope(null);
      activeScopeRef.current = null;
      manualSelectionRef.current = false;
      const startedAtNow = Date.now();
      runStartedAtRef.current = startedAtNow;
      setRunStartedAt(startedAtNow);
      focusAgent("brand_analyst");
      seenEventIdsRef.current.clear();
      const initialStatuses: Record<string, AgentStatus> = {
        brand_analyst: "running",
        trend_researcher: "waiting",
        competitor_analyst: "waiting",
        content_creator: "waiting",
        visualizer: "waiting",
        ceo_auditor: "waiting",
      };
      agentStatusesRef.current = initialStatuses;
      setAgentStatuses(initialStatuses);
    } else if (targetResumeAgent) {
      setFailedAgentId(null);
      focusAgent(targetResumeAgent);
      // Keep prior agents marked as completed, target as running, subsequent as waiting
      const resumed: Record<string, AgentStatus> = { ...agentStatusesRef.current };
      let foundTarget = false;
      for (const agent of AGENT_SEQUENCE) {
        if (agent.id === targetResumeAgent) {
          resumed[agent.id] = "running";
          foundTarget = true;
        } else if (foundTarget) {
          resumed[agent.id] = "waiting";
        } else {
          resumed[agent.id] = "completed";
        }
      }
      agentStatusesRef.current = resumed;
      setAgentStatuses(resumed);
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

    // A retry must not leave the previous stream reading in the background: two readers
    // would interleave two runs' events into one console, and the abandoned run would keep
    // burning quota server-side. Aborting also tells the server that client is gone.
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsStreamLive(true);

    if (timerRef.current) clearInterval(timerRef.current);
    // A retry keeps the original start (so elapsed is cumulative); only a fresh run reset it.
    if (!runStartedAtRef.current) runStartedAtRef.current = Date.now();
    lastEventAtRef.current = Date.now();
    setSecondsSinceEvent(0);
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.max(0, Math.round((Date.now() - runStartedAtRef.current) / 1000)));
      setSecondsSinceEvent(Math.max(0, Math.round((Date.now() - lastEventAtRef.current) / 1000)));
    }, 1000);

    const resumeState = isRetry && targetResumeAgent ? {
      brandData: agentOutputsRef.current?.brand_analyst,
      trendResearch: agentOutputsRef.current?.trend_researcher,
      competitorAnalysis: agentOutputsRef.current?.competitor_analyst,
      // Media is joined back onto the copy before it goes up. The server needs it ON the
      // items, not just in a separate asset list, to know which formats already have
      // media and must not be rendered again.
      generatedContent: mergeAssetsIntoContent(
        agentOutputsRef.current?.content_creator,
        agentOutputsRef.current?.visualizer?.generatedAssets || []
      ),
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
              handleStreamEventRef.current?.(event);
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
    } finally {
      // Only the current stream may report itself closed. A retry opens a new one and
      // swaps the ref, so the old reader finishing must not mark the live run as dead.
      if (abortControllerRef.current === abortController) setIsStreamLive(false);
    }
  }, [platforms, contentTypes]);

  const handleStreamEvent = (event: any) => {
    const { type, agentId, data } = event;

    // Any event at all means the stream is alive, so the stall clock restarts here —
    // before the dedup check, since even a duplicate proves the connection is up.
    lastEventAtRef.current = Date.now();
    setSecondsSinceEvent(0);

    // The scope the render is on, so Skip can name it. Both agents that render media
    // report it: the visualizer in the production phase, and the CEO when it re-renders a
    // format it found missing during review.
    if (
      (agentId === "visualizer" || agentId === "ceo_auditor") &&
      typeof data?.scope === "string" &&
      data.scope
    ) {
      if (type === "agent_scope_completed") {
        if (activeScopeRef.current === data.scope) {
          activeScopeRef.current = null;
          setActiveScope(null);
        }
      } else {
        activeScopeRef.current = data.scope;
        setActiveScope(data.scope);
      }
    }

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

    /**
     * Appends a console line and optionally closes the previous in-flight line.
     *
     * `"same-scope"` closes only the previous line of the SAME unit of work: several
     * format families run under one agentId at the same time, so family B's next step
     * must not close (or later fail) family A's line. `"all-scopes"` is for the agent
     * genuinely finishing everything.
     */
    const pushEntry = (entry: TimelineEntry, closePrevious?: "same-scope" | "all-scopes") => {
      setTimeline((prev) => {
        const base = closePrevious
          ? prev.map((e) =>
              e.agentId === entry.agentId &&
              e.status === "running" &&
              (closePrevious === "all-scopes" || (e.scope || "") === (entry.scope || ""))
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
            // `mode` is the newer, more precise field; fall back to the flag for any
            // stream that only sends `parallel`.
            mode:
              data?.mode === "parallel" || data?.mode === "pipeline" || data?.mode === "sequential"
                ? data.mode
                : data?.parallel
                  ? "parallel"
                  : "sequential",
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
      applyAgentStatus(agentId, "running");
      // In a parallel phase both agents start in the same tick. Auto-focus must not
      // hop off an agent that is still working — that is what made the first step
      // vanish behind the second. Only follow the stream when nothing is running.
      const selected = selectedAgentIdRef.current;
      const selectedStillRunning = agentStatusesRef.current[selected] === "running";
      if (!manualSelectionRef.current && (!selectedStillRunning || selected === agentId)) {
        focusAgent(agentId);
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
            ts: Date.now(),
          },
          "same-scope"
        );
      }
    } else if (type === "agent_scope_completed") {
      // One parallel unit of work (a format family) finished. Close its running lines
      // now so a sibling family's later failure cannot red-mark work that succeeded.
      const scope = (data?.scope || "") as string;
      setTimeline((prev) =>
        prev.map((e) =>
          e.agentId === agentId && e.status === "running" && (e.scope || "") === scope
            ? { ...e, status: "completed" as const }
            : e
        )
      );
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
      applyAgentStatus(agentId, "completed");
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
          ts: Date.now(),
        },
        "all-scopes"
      );
    } else if (type === "agent_error") {
      applyAgentStatus(agentId, "error");
      setFailedAgentId(agentId);
      // Only the failed unit of work turns red. A family that already rendered keeps
      // its green tick instead of being condemned by a sibling's 429.
      const failedScope = typeof data?.scope === "string" ? data.scope : null;
      setTimeline((prev) =>
        prev.map((e) =>
          e.agentId === agentId &&
          e.status === "running" &&
          (failedScope === null || (e.scope || "") === failedScope)
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
        scope: failedScope || undefined,
        ts: Date.now(),
      });
      // A failure is the one thing worth pulling the view to, even mid-parallel-phase.
      if (!manualSelectionRef.current) focusAgent(agentId);
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

  // The SSE loop lives inside a memoised `startStream`, so it must not close over the
  // handler directly — it would keep calling the version created on the first render.
  // Re-pointing the ref after every commit is what makes the handler see current state.
  // Declared before the streaming effect so it is already pointed when the stream opens.
  useEffect(() => {
    handleStreamEventRef.current = handleStreamEvent;
  });

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

  /**
   * Abandons the format the render is stuck on and lets the campaign carry on.
   *
   * Deliberately not a cancel: the stream stays open, every family that already rendered
   * keeps its media, and the skipped post ships with its copy for the user to add media
   * to in the content editor. The scope comes from the stream itself, so the click
   * targets the family the console is actually showing.
   */
  const handleSkipStep = async () => {
    const scope = activeScopeRef.current;
    setSkipRequested(scope || "current step");
    setSkipNotice(null);
    try {
      const res = await fetch("/api/ai-studio-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip-step", runId: runIdRef.current, scope }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Honest failure. The run lives in the server instance that opened the stream, so
        // a skip can miss it; saying so beats a button that silently does nothing.
        setSkipRequested(null);
        setSkipNotice(
          json?.message ||
            "Could not reach this run to skip it. Use Cancel Campaign, or wait for the step's own timeout."
        );
      }
    } catch {
      setSkipRequested(null);
      setSkipNotice("Could not reach the server to skip this step.");
    }
  };

  /**
   * The skip for a step that has already failed and taken the stream down with it.
   *
   * A live skip is impossible then — there is no run left to steer — so this skips the
   * FAILED STEP instead of the stalled one: if media generation is what broke, restart at
   * the review with whatever rendered, and let the campaign finish and report the gaps.
   * Once the review itself is the failure there is no step left after it, so the honest
   * move is to hand over everything that did generate.
   */
  const handleSkipFailedStep = () => {
    const failed = failedAgentId || selectedAgentId;
    if (failed === "visualizer") {
      startStream({ resumeFromAgent: "ceo_auditor" });
      return;
    }
    handleApplyToEditors();
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
    // A completed run already carries its media on the copy. A run that ended early does
    // not, so the visualizer's assets are joined back on here — otherwise a failure at the
    // audit would hand the editor captions with no images, even though the images rendered.
    const payload =
      completedPayload ||
      mergeAssetsIntoContent(
        agentOutputs?.content_creator,
        agentOutputs?.visualizer?.generatedAssets || []
      );
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
  // Skipping only means something while media is being produced: that is the one stage that
  // can sit on a single slow provider call for minutes, and the only work a post can ship
  // without. It covers the CEO too — it re-renders the formats it finds missing in review.
  // A dead stream cannot be steered, so a skip is only offered while one is being read.
  const isRenderingMedia =
    isStreamLive &&
    (agentStatuses.visualizer === "running" ||
      (agentStatuses.ceo_auditor === "running" && !!activeScope));
  // Long enough that a legitimately slow image render is never mistaken for a stall, short
  // enough that the user is not left guessing. The server's own family deadline is minutes
  // away, so this fires first and gives them the choice.
  const STALL_AFTER_SECONDS = 100;
  const isStalled =
    !isCompleted && secondsSinceEvent >= STALL_AFTER_SECONDS && (isRenderingMedia || !errorMessage);
  const mediaGaps: { platform: string; contentType: string; format: string; reason: string }[] =
    Array.isArray(auditResult?.mediaGaps) ? auditResult.mediaGaps : [];
  // Skipping a FAILED step only makes sense once the run is actually over and there is copy
  // worth keeping — while a run is still streaming, the live Skip in the footer is the right
  // control, and restarting from here would abandon a run that is still working.
  const canSkipFailedStep =
    Boolean(errorMessage) && !isStreamLive && Boolean(agentOutputs?.content_creator?.platforms);
  // The console shows the whole phase, not one agent at a time. Where a phase really
  // does have two agents live at once, filtering to the selected one hid half the run,
  // so the second agent's reasoning only appeared after the first had finished.
  const selectedPhase = phases.find((p) => p.agents.includes(selectedAgentId));
  const consoleAgentIds =
    selectedPhase && selectedPhase.mode !== "sequential" && selectedPhase.agents.length > 1
      ? selectedPhase.agents
      : [selectedAgentId];
  const consoleSpansAgents = consoleAgentIds.length > 1;
  const activeTimeline = timeline.filter((e) => consoleAgentIds.includes(e.agentId));
  const activeThoughtCount = activeTimeline.filter((e) => e.kind === "thought").length;
  const agentShortName = (id: string) => AGENT_SEQUENCE.find((a) => a.id === id)?.name || id;
  /** Seconds since this run began — a step's place in the run, not a fake percentage. */
  const entryOffset = (ts: number) =>
    runStartedAt ? `+${Math.max(0, Math.round((ts - runStartedAt) / 1000))}s` : "+0s";
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
        onClick={() => focusAgent(agent.id, true)}
        className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${
          isSelected
            ? "bg-[#161920] border-[#8B5CF6]/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
            : isRunning
            ? // A sibling running in parallel is NOT background noise. Dimming it to 50%
              // made a two-agent phase look like one agent had been skipped.
              "bg-[#0F1218] border-[#8B5CF6]/25 hover:bg-[#11141A]"
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
            <h4
              className={`text-xs sm:text-sm font-semibold truncate ${
                isSelected || isRunning ? "text-white" : "text-[#9CA3AF]"
              }`}
            >
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
                        {/* Parallel work really is simultaneous in the graph — the badge
                            and the spinners are not decorative. Content writing fans out
                            over formats at once; media production does NOT (it renders one
                            family at a time to stay under the image quota) so its phase is
                            sequential and carries no badge. `PIPELINED` marks the older
                            shape, where two agents overlap but one feeds the other. */}
                        {phase.mode !== "sequential" && (
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                              runningInPhase > 1 || (runningInPhase === 1 && phaseAgents.length === 1)
                                ? "bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/30"
                                : "bg-[#1A1D24] text-[#6B7280] border-[#252A32]"
                            }`}
                          >
                            <Zap className="w-2.5 h-2.5" />
                            {phase.mode === "pipeline" ? "PIPELINED" : "PARALLEL"}
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
                      <div className="flex items-center gap-1.5">
                        {consoleSpansAgents && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-mono text-[#A78BFA] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-1.5 py-0.5 rounded-full">
                            <Zap className="w-2.5 h-2.5" />
                            {consoleAgentIds.length} agents, interleaved
                          </span>
                        )}
                        {activeThoughtCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-mono text-[#A78BFA] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-1.5 py-0.5 rounded-full">
                            <Brain className="w-2.5 h-2.5" />
                            {activeThoughtCount} reasoning step{activeThoughtCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
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
                                <div className="flex items-center gap-2">
                                  {consoleSpansAgents && (
                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-[#8B5CF6]">
                                      {agentShortName(entry.agentId)}
                                    </span>
                                  )}
                                  {entry.scope && (
                                    <span className="text-[9px] uppercase tracking-wide text-[#4B5563]">
                                      {entry.scope}
                                    </span>
                                  )}
                                </div>
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
                                  {consoleSpansAgents && (
                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-[#8B5CF6]">
                                      {agentShortName(entry.agentId)}
                                    </span>
                                  )}
                                  <span className="text-[9px] uppercase tracking-wide text-[#4B5563]">
                                    {entry.scope || entry.stage}
                                  </span>
                                  {/* When the step happened. The old per-line percentage was
                                      the agent's progress at the moment the line was pushed,
                                      so a finished step sat next to a stale "0%". */}
                                  <span className="text-[9px] font-mono text-[#4B5563]">
                                    {entryOffset(entry.ts)}
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

                    {/*
                      A stalled run used to look exactly like a slow one: a spinner with no
                      way out. Now the silence itself is reported, with a way forward that
                      matches what is actually wrong — skip this one format while the run is
                      alive, or restart / keep what exists once the stream has dropped.
                    */}
                    {isStalled && (
                      <div className="p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/25 rounded-xl text-xs space-y-2.5">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-[#F59E0B]">
                              No update for {formatTime(secondsSinceEvent)}
                            </p>
                            <p className="text-[#9CA3AF] mt-0.5">
                              {isRenderingMedia
                                ? `${activeScope ? `“${activeScope}”` : "This format"} is still rendering. You can skip it and keep the rest of the campaign — the post ships with its copy, and you add the media yourself in the content editor.`
                                : isStreamLive
                                ? "This step is taking longer than usual. You can retry it, or cancel the campaign."
                                : "The connection to this run has dropped, so nothing further will arrive. Retry the step, or take everything that finished into the editor."}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          {isRenderingMedia && (
                            <Button
                              size="sm"
                              disabled={!!skipRequested}
                              onClick={handleSkipStep}
                              className="bg-[#F59E0B] hover:bg-[#D97706] disabled:opacity-60 text-[#111318] text-xs px-3 py-1.5 h-8 rounded-lg flex items-center gap-1.5 font-semibold"
                            >
                              <SkipForward className="w-3.5 h-3.5" />
                              {skipRequested ? "Skipping…" : "Skip this format"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetry(failedAgentId || selectedAgentId)}
                            className="bg-transparent border-[#252A32] text-slate-300 hover:bg-white/5 text-xs px-3 py-1.5 h-8 rounded-lg flex items-center gap-1.5 font-medium"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            Retry this step
                          </Button>
                          {!isStreamLive && Boolean(agentOutputs?.content_creator?.platforms) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleApplyToEditors}
                              className="bg-transparent border-[#252A32] text-slate-300 hover:bg-white/5 text-xs px-3 py-1.5 h-8 rounded-lg flex items-center gap-1.5 font-medium"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              Use what&apos;s ready
                            </Button>
                          )}
                        </div>
                        {skipNotice && <p className="text-[11px] text-[#EF4444] pl-6">{skipNotice}</p>}
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
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => handleRetry(failedAgentId || selectedAgentId)}
                              className="bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs px-3.5 py-1.5 h-8 rounded-lg flex items-center gap-1.5 shrink-0 transition-all font-medium"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              Retry {AGENT_SEQUENCE.find((a) => a.id === (failedAgentId || selectedAgentId))?.name || "Step"}
                            </Button>
                            {/*
                              Retry is not always what the user wants: a provider that just
                              failed will often fail again. Skipping the failed step keeps
                              everything that did generate — the missing media gets added by
                              hand in the content editor.
                            */}
                            {canSkipFailedStep && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleSkipFailedStep}
                                className="bg-transparent border-[#F59E0B]/40 text-[#F59E0B] hover:bg-[#F59E0B]/10 text-xs px-3.5 py-1.5 h-8 rounded-lg flex items-center gap-1.5 shrink-0 font-medium"
                              >
                                <SkipForward className="w-3.5 h-3.5" />
                                {failedAgentId === "visualizer" ? "Skip media, finish campaign" : "Skip & use what's ready"}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-[#252A32] flex items-center justify-between gap-3 bg-[#0B0D10] shrink-0">
              <div className="min-w-0">
                {errorMessage ? (
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 font-medium shadow-md shadow-indigo-950/30"
                    onClick={() => handleRetry(failedAgentId || selectedAgentId)}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Retry from {AGENT_SEQUENCE.find((a) => a.id === (failedAgentId || selectedAgentId))?.name || "Step"}
                  </Button>
                ) : (
                  skipNotice && <p className="text-[11px] text-[#EF4444] truncate">{skipNotice}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/*
                  Skip lives beside Cancel, and only while media is being produced: the two
                  are the same gesture at different cost. Cancel throws the campaign away;
                  skip gives up one format's media and keeps everything else. It stays
                  available after a visualizer failure, because the CEO renders media too.
                */}
                {isRenderingMedia && (
                  <Button
                    variant="outline"
                    disabled={!!skipRequested}
                    onClick={handleSkipStep}
                    title={activeScope ? `Skip ${activeScope} and continue the campaign` : "Skip the format being rendered and continue"}
                    className="bg-transparent border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/10 hover:border-[#F59E0B]/50 disabled:opacity-50 text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    {skipRequested ? "Skipping…" : "Skip this format"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="bg-transparent border-[#252A32] text-[#EF4444] hover:bg-[#EF4444]/10 hover:border-[#EF4444]/30 text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-colors shrink-0"
                  onClick={handleCancelCampaign}
                >
                  Cancel Campaign
                </Button>
              </div>
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
                <p className="text-xs sm:text-sm text-[#6B7280]">
                  {mediaGaps.length > 0
                    ? `Every post is written. ${mediaGaps.length} of them still need media.`
                    : "Your content has been successfully created."}
                </p>
              </div>
            </div>

            {/*
              A campaign that shipped without some of its media must say so HERE, by post.
              The run itself is a success — the copy is done and the rest of the media
              rendered — but the user has to know exactly which posts to open in the editor
              and generate an image for, or they will publish a blank one.
            */}
            {mediaGaps.length > 0 && (
              <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3 sm:p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm font-semibold text-[#92400E]">
                    Add media for {mediaGaps.length} post{mediaGaps.length === 1 ? "" : "s"} in the content editor
                  </p>
                </div>
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                  {mediaGaps.map((gap, gIdx) => (
                    <li
                      key={`${gap.platform}-${gap.contentType}-${gIdx}`}
                      className="text-[11px] sm:text-xs bg-white/70 border border-[#F59E0B]/20 rounded-lg px-2.5 py-2"
                    >
                      <span className="font-semibold capitalize text-[#111318]">
                        {gap.platform} — {gap.contentType}
                      </span>
                      <span className="text-[#6B7280]"> ({gap.format})</span>
                      <span className="block text-[#6B7280] mt-0.5">{gap.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
