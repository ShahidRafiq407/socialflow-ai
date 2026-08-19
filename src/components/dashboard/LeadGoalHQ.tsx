"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Target,
  Users,
  Sparkles,
  RefreshCw,
  FileText,
  Loader2,
  Sliders,
  Zap,
  TrendingUp,
  AlertTriangle,
  HelpCircle,
  Clock,
  Layers,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Play,
  Pause,
  Flame,
  Settings,
  Eye,
  Video,
  ChevronDown,
  ChevronUp,
  Calculator,
  Globe,
  Calendar,
  BarChart3,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GrowthStrategy,
  GrowthKPIs,
  LeadType,
  AutopilotMode,
  GrowthPlanTask,
  validateGoalFeasibility,
  GoalFeasibilityResult,
} from "@/lib/types/growth";
import {
  saveGrowthGoal,
  toggleAutopilot,
  executeGrowthPlanTask,
  executeTodayPlanBatch,
  applyGrowthRecommendation,
  GrowthActivityItem,
  getRecentGrowthActivity,
} from "@/actions/goals";

interface LeadGoalHQProps {
  workspaceId: string;
  workspaceName: string;
  industry: string;
  website: string;
  initialGoal: any;
  initialKPIs: GrowthKPIs;
  initialStrategy: GrowthStrategy | null;
  initialActivity?: GrowthActivityItem[];
  connectedPlatforms: string[];
}

export function LeadGoalHQ({
  workspaceId,
  workspaceName,
  industry,
  website,
  initialGoal,
  initialKPIs,
  initialStrategy,
  initialActivity = [],
  connectedPlatforms,
}: LeadGoalHQProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State Management
  const [kpis, setKpis] = useState<GrowthKPIs>(initialKPIs);
  const [strategy, setStrategy] = useState<GrowthStrategy | null>(initialStrategy);
  const [leadTarget, setLeadTarget] = useState<number>(initialGoal?.leadTarget || 150);
  const [leadType, setLeadType] = useState<LeadType>(initialGoal?.leadType || "QUALIFIED_LEADS");
  const [timeframeDays, setTimeframeDays] = useState<number>(initialGoal?.timeframeDays || 60);
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(
    initialGoal?.targetPlatforms || ["LinkedIn", "Instagram", "X", "TikTok"]
  );
  const [autopilotMode, setAutopilotMode] = useState<AutopilotMode>(
    initialGoal?.autopilotMode || "ASSISTED"
  );
  const [isAutopilotPaused, setIsAutopilotPaused] = useState<boolean>(
    Boolean(initialGoal?.isAutopilotPaused)
  );

  // Recent AI Activity State
  const [activityList, setActivityList] = useState<GrowthActivityItem[]>(initialActivity);
  const [isRefreshingActivity, setIsRefreshingActivity] = useState<boolean>(false);

  // Modals & Drawers
  const [openGoalSettings, setOpenGoalSettings] = useState<boolean>(false);
  const [openAutopilotModal, setOpenAutopilotModal] = useState<boolean>(false);
  const [openWhyModal, setOpenWhyModal] = useState<boolean>(false);
  const [openFunnelModal, setOpenFunnelModal] = useState<boolean>(false);
  const [whyModalData, setWhyModalData] = useState<{ title: string; explanation: string; metrics?: string } | null>(null);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<{ url: string; type: "image" | "video"; title: string; caption?: string } | null>(null);
  const [showAdvancedStrategy, setShowAdvancedStrategy] = useState<boolean>(false);

  // Live Streamed Strategy Generation
  const [isBuildingStrategy, setIsBuildingStrategy] = useState<boolean>(false);
  const [streamSteps, setStreamSteps] = useState<{ step: string; status: "running" | "done" | "info" }[]>([]);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);
  const [taskExecutionStatus, setTaskExecutionStatus] = useState<Record<string, string>>({});
  const [isBatchExecuting, setIsBatchExecuting] = useState<boolean>(false);

  // Storage Key for Instant Workspace Persistence
  const STORAGE_KEY = `socialflow_lead_goal_data_${workspaceId}`;

  // Real-time Feasibility Calculation
  const feasibility: GoalFeasibilityResult = React.useMemo(() => {
    return validateGoalFeasibility({
      leadTarget: Number(leadTarget) || 150,
      timeframeDays: Number(timeframeDays) || 60,
      leadType,
    });
  }, [leadTarget, timeframeDays, leadType]);

  // Hydrate from localStorage on client-side mount
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.strategy && !initialStrategy) setStrategy(parsed.strategy);
          if (parsed.kpis) setKpis(parsed.kpis);
          if (parsed.leadTarget) setLeadTarget(parsed.leadTarget);
          if (parsed.timeframeDays) setTimeframeDays(parsed.timeframeDays);
          if (parsed.targetPlatforms) setTargetPlatforms(parsed.targetPlatforms);
        }
      }
    } catch (e) {
      console.warn("[LeadGoalHQ] LocalStorage hydration warning:", e);
    }
  }, [workspaceId, initialStrategy]);

  // Helper to persist state to localStorage
  const persistState = (newStrategy: GrowthStrategy | null, newKpis?: GrowthKPIs) => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            strategy: newStrategy,
            kpis: newKpis || kpis,
            leadTarget,
            timeframeDays,
            targetPlatforms,
            updatedAt: Date.now(),
          })
        );
      }
    } catch {}
  };

  // Refresh recent activity feed
  const refreshActivityFeed = async () => {
    setIsRefreshingActivity(true);
    try {
      const fresh = await getRecentGrowthActivity(workspaceId);
      setActivityList(fresh);
    } catch (e) {
      console.warn("[LeadGoalHQ] Activity refresh failed:", e);
    } finally {
      setIsRefreshingActivity(false);
    }
  };

  const availablePlatforms = ["LinkedIn", "Instagram", "X", "TikTok", "YouTube", "Facebook", "Pinterest"];

  const togglePlatformSelection = (pl: string) => {
    if (targetPlatforms.includes(pl)) {
      if (targetPlatforms.length > 1) setTargetPlatforms(targetPlatforms.filter((p) => p !== pl));
    } else {
      setTargetPlatforms([...targetPlatforms, pl]);
    }
  };

  // 1. STREAMED STRATEGY GENERATION
  const handleBuildStrategy = async () => {
    setIsBuildingStrategy(true);
    setStreamSteps([{ step: `Grounded Research: Connecting to ${workspaceName} Brand DNA (${industry})...`, status: "running" }]);

    try {
      const response = await fetch("/api/growth/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, leadTarget, leadType, timeframeDays, targetPlatforms }),
      });

      if (!response.ok || !response.body) throw new Error("Failed to start strategy generation");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const eventMatch = block.match(/^event:\s*(\w+)/);
          const dataMatch = block.match(/data:\s*(.+)$/m);

          if (eventMatch && dataMatch) {
            const data = JSON.parse(dataMatch[1]);
            if (eventMatch[1] === "agent_step") {
              setStreamSteps((prev) => [...prev.map((s) => ({ ...s, status: "done" as const })), { step: data.step, status: data.status || "running" }]);
            } else if (eventMatch[1] === "strategy_completed") {
              const newStrategy = data.strategy as GrowthStrategy;
              const newKpis: GrowthKPIs = {
                ...kpis,
                targetLeads: newStrategy.targetLeads,
                status: "ON_TRACK" as const,
              };
              setStrategy(newStrategy);
              setKpis(newKpis);
              persistState(newStrategy, newKpis);
              refreshActivityFeed();
              setStreamSteps((prev) => [...prev.map((s) => ({ ...s, status: "done" as const })), { step: "✓ Organic Growth Strategy successfully generated!", status: "done" }]);
              setTimeout(() => setIsBuildingStrategy(false), 1200);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Strategy build stream error:", err);
      setIsBuildingStrategy(false);
    }
  };

  // 2. SAVE GOAL
  const handleSaveGoalSettings = () => {
    startTransition(async () => {
      persistState(strategy);
      await saveGrowthGoal(workspaceId, { leadTarget, leadType, timeframeDays, targetPlatforms, autopilotMode });
      setOpenGoalSettings(false);
      handleBuildStrategy();
    });
  };

  // 3. EXECUTE SINGLE TASK
  const handleExecuteTask = async (task: GrowthPlanTask, scheduleNow: boolean = false) => {
    setExecutingTaskId(task.id);
    setTaskExecutionStatus((prev) => ({ ...prev, [task.id]: "Generating copy & visuals via AI..." }));
    try {
      const res = await executeGrowthPlanTask(workspaceId, task, { generateVisuals: true, scheduleNow });
      if (res.success) {
        setTaskExecutionStatus((prev) => ({ ...prev, [task.id]: scheduleNow ? "✓ Scheduled" : "✓ Draft Created" }));
        if (strategy) {
          const updatedToday = strategy.todayPlan.map((t) => (t.id === task.id ? { ...t, status: "SCHEDULED" as any } : t));
          setStrategy({ ...strategy, todayPlan: updatedToday });
        }
        refreshActivityFeed();
      }
    } finally {
      setExecutingTaskId(null);
    }
  };

  // 4. BATCH EXECUTE
  const handleBatchExecuteTodayPlan = async () => {
    setIsBatchExecuting(true);
    try {
      const res = await executeTodayPlanBatch(workspaceId, { generateVisuals: true });
      if (res.success) {
        if (strategy) {
          const updatedToday = strategy.todayPlan.map((t) => ({ ...t, status: "SCHEDULED" as const }));
          setStrategy({ ...strategy, todayPlan: updatedToday });
        }
        refreshActivityFeed();
      }
    } finally {
      setIsBatchExecuting(false);
    }
  };

  // 5. APPLY RECOMMENDATION
  const handleApplyRec = (recId: string) => {
    startTransition(async () => {
      await applyGrowthRecommendation(workspaceId, recId);
      if (strategy && strategy.recommendations) {
        const updatedRecs = strategy.recommendations.map((r) =>
          r.id === recId ? { ...r, applied: true } : r
        );
        const updatedStrategy = { ...strategy, recommendations: updatedRecs };
        setStrategy(updatedStrategy);
        persistState(updatedStrategy);
      }
    });
  };

  // 6. OPEN "WHY?" MODAL
  const openWhyExplanation = (title: string, explanation: string, metrics?: string) => {
    setWhyModalData({ title, explanation, metrics });
    setOpenWhyModal(true);
  };

  // Lead Type options
  const leadTypeOptions: { value: LeadType; label: string }[] = [
    { value: "QUALIFIED_LEADS", label: "Qualified Leads (High-Intent B2B)" },
    { value: "LEADS", label: "All Organic Leads" },
    { value: "WEBSITE_INQUIRIES", label: "Website & Quote Inquiries" },
    { value: "CONTACT_FORM", label: "Contact Form Submissions" },
    { value: "WHATSAPP", label: "WhatsApp & DM Inquiries" },
    { value: "BOOKINGS", label: "Consultation / Demo Bookings" },
    { value: "CUSTOM", label: "Custom Conversion Target" },
  ];

  const getPlatformStyle = (pl: string) => {
    const p = pl.toLowerCase();
    if (p.includes("linkedin")) return { bg: "bg-sky-500/10 text-sky-400 border-sky-500/30", text: "text-sky-400" };
    if (p.includes("instagram")) return { bg: "bg-pink-500/10 text-pink-400 border-pink-500/30", text: "text-pink-400" };
    if (p.includes("x") || p.includes("twitter")) return { bg: "bg-slate-500/10 text-slate-300 border-slate-500/30", text: "text-slate-300" };
    if (p.includes("tiktok")) return { bg: "bg-teal-500/10 text-teal-400 border-teal-500/30", text: "text-teal-400" };
    if (p.includes("youtube")) return { bg: "bg-red-500/10 text-red-400 border-red-500/30", text: "text-red-400" };
    if (p.includes("facebook")) return { bg: "bg-blue-500/10 text-blue-400 border-blue-500/30", text: "text-blue-400" };
    if (p.includes("pinterest")) return { bg: "bg-rose-500/10 text-rose-400 border-rose-500/30", text: "text-rose-400" };
    return { bg: "bg-violet-500/10 text-violet-400 border-violet-500/30", text: "text-violet-400" };
  };

  const hasActiveStrategy = Boolean(strategy);

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* HEADER & CONTROLLER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Lead Goal &amp; Growth Controller
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-xs font-medium">
                  Autonomous AI
                </Badge>
              </h1>
              <p className="text-xs md:text-sm text-slate-400">
                You define the lead goal. AI researches, plans, creates, and publishes value-first content for {workspaceName}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Autopilot Mode Selector */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => {
                setAutopilotMode("AUTOPILOT");
                startTransition(async () => {
                  await toggleAutopilot(workspaceId, { mode: "AUTOPILOT", isAutopilotPaused: false });
                });
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                autopilotMode === "AUTOPILOT" && !isAutopilotPaused
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Auto-Pilot
            </button>
            <button
              onClick={() => {
                setAutopilotMode("ASSISTED");
                startTransition(async () => {
                  await toggleAutopilot(workspaceId, { mode: "ASSISTED", isAutopilotPaused: false });
                });
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                autopilotMode === "ASSISTED" && !isAutopilotPaused
                  ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-900/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Assisted
            </button>
            <button
              onClick={() => {
                setIsAutopilotPaused(!isAutopilotPaused);
                startTransition(async () => {
                  await toggleAutopilot(workspaceId, { isAutopilotPaused: !isAutopilotPaused });
                });
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                isAutopilotPaused
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isAutopilotPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3" />}
              {isAutopilotPaused ? "Paused" : "Pause"}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenGoalSettings(true)}
            className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            Edit Target
          </Button>

          <Button
            size="sm"
            onClick={handleBuildStrategy}
            disabled={isBuildingStrategy}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold gap-1.5 shadow-lg shadow-indigo-900/30"
          >
            {isBuildingStrategy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hasActiveStrategy ? "Recalculate AI Plan" : "Build Strategy"}
          </Button>
        </div>
      </div>

      {/* =====================================================================
          2. LIVE KPI DASHBOARD BAR (REAL DATA & PACING MATH)
         ===================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* KPI 1: TARGET */}
        <Card className="p-4 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Target Goal
          </p>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {leadTarget}
          </p>
          <p className="text-[10px] text-slate-400 truncate">
            {leadType.replace(/_/g, " ")}
          </p>
        </Card>

        {/* KPI 2: ACHIEVED */}
        <Card className="p-4 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Achieved
            </p>
            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">
              {kpis.progressPercentage}%
            </span>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {kpis.achievedLeads}
          </p>
          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, kpis.progressPercentage))}%` }}
            />
          </div>
        </Card>

        {/* KPI 3: REMAINING */}
        <Card className="p-4 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Remaining
          </p>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {kpis.remainingLeads}
          </p>
          <p className="text-[10px] text-slate-400">
            Leads to target
          </p>
        </Card>

        {/* KPI 4: DAYS LEFT */}
        <Card className="p-4 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Time Remaining
          </p>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {kpis.daysLeft} <span className="text-xs font-normal text-slate-400">days</span>
          </p>
          <p className="text-[10px] text-slate-400">
            {kpis.daysElapsed} of {kpis.daysTotal} elapsed
          </p>
        </Card>

        {/* KPI 5: CURRENT PACE */}
        <Card className="p-4 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Current Pace
          </p>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {kpis.currentPace} <span className="text-xs font-normal text-slate-400">/day</span>
          </p>
          <p className="text-[10px] text-slate-400">
            Projected: ~{kpis.projectedResult} total
          </p>
        </Card>

        {/* KPI 6: REQUIRED PACE */}
        <Card className="p-4 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Required Pace
          </p>
          <p className="text-2xl font-black text-primary">
            {kpis.requiredPace} <span className="text-xs font-normal text-primary/70">/day</span>
          </p>
          <p className="text-[10px] text-primary/80 font-bold">
            Target Velocity
          </p>
        </Card>
      </div>

      {/* STATUS EXPLANATION BANNER */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Flame className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-slate-700 dark:text-slate-300 font-medium">
            <strong>AI Growth Diagnostic:</strong> {kpis.statusReason}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openWhyExplanation("AI Growth Status Analysis", kpis.statusReason)}
          className="h-7 px-2.5 text-xs text-primary font-bold hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          Why?
        </Button>
      </div>

      {/* =====================================================================
          3. REAL-TIME STREAMED AGENT ACTIVITY MODAL / ACCORDION
         ===================================================================== */}
      {isBuildingStrategy && (
        <Card className="border-2 border-slate-900 dark:border-white p-5 bg-slate-950 text-white shadow-xl animate-in fade-in-50 duration-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-5 w-5 text-amber-400 animate-spin" />
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Autonomous Growth Engine Active
                </h3>
                <p className="text-xs text-slate-400">
                  Executing multi-agent strategy pipeline for {leadTarget} leads across {targetPlatforms.join(", ")}...
                </p>
              </div>
            </div>
            <Badge className="bg-amber-400 text-slate-900 text-xs font-black">
              STREAMING LIVE
            </Badge>
          </div>

          <div className="space-y-2 font-mono text-xs max-h-60 overflow-y-auto pr-2">
            {streamSteps.map((s, idx) => (
              <div key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="shrink-0 mt-0.5">
                  {s.status === "done" ? (
                    <span className="text-emerald-400 font-bold">✓</span>
                  ) : s.status === "running" ? (
                    <span className="text-amber-400 font-bold animate-pulse">⟳</span>
                  ) : (
                    <span className="text-slate-500 font-bold">○</span>
                  )}
                </span>
                <span className={s.status === "running" ? "text-white font-bold" : "text-slate-300"}>
                  {s.step}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* =====================================================================
          4. MAIN SECTION (2 COLUMNS): STRATEGY & FUNNEL | TODAY'S AI PLAN
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN (7 COLUMNS): FUNNEL & PLATFORM ALLOCATION */}
        <div className="lg:col-span-7 space-y-6">
          {/* CARD: ORGANIC LEAD FUNNEL & BLUEPRINT */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span>Organic Lead Funnel Math</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Requirements to achieve {leadTarget} leads in {timeframeDays} days.
                </CardDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenFunnelModal(true)}
                className="h-8 px-2.5 text-xs font-bold border-slate-300 dark:border-slate-700"
              >
                View Calculation
              </Button>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              {strategy ? (
                <>
                  {/* FUNNEL STEPPER GRID */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-center space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        1. Required Impressions
                      </p>
                      <p className="text-xl font-black text-slate-900 dark:text-slate-100">
                        {strategy.funnel.requiredImpressions.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {(strategy.funnel.engagementCTR * 100).toFixed(1)}% CTR target
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-center space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        2. Profile / Link Visits
                      </p>
                      <p className="text-xl font-black text-slate-900 dark:text-slate-100">
                        {strategy.funnel.requiredProfileVisits.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {(strategy.funnel.organicCVR * 100).toFixed(1)}% organic CVR
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-center space-y-1">
                      <p className="text-[10px] font-bold opacity-80 uppercase">
                        3. Target Leads
                      </p>
                      <p className="text-2xl font-black">
                        {strategy.targetLeads}
                      </p>
                      <p className="text-[10px] opacity-80">
                        {strategy.funnel.requiredPostsPerWeek} posts/week needed
                      </p>
                    </div>
                  </div>

                  {/* DATA DISCLOSURE BADGE */}
                  <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                    <span>{strategy.funnel.dataSourceSummary}</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <p className="text-xs text-slate-500">
                    Click <strong>"Build Growth Strategy"</strong> to generate your dynamic organic funnel calculations.
                  </p>
                  <Button
                    onClick={handleBuildStrategy}
                    className="h-9 px-4 text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  >
                    Build Growth Strategy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CARD: PLATFORM STRATEGY & CAPABILITIES MATRIX */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40">
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span>Platform Strategy &amp; Channel Roles</span>
              </CardTitle>
              <CardDescription className="text-xs">
                AI allocation based on platform conversion potential and capability limits.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-3">
              {strategy ? (
                <div className="space-y-3">
                  {strategy.platformStrategies.map((ps) => {
                    const isConnected = connectedPlatforms.map(p => p.toLowerCase()).includes(ps.platform.toLowerCase());
                    return (
                      <div
                        key={ps.platform}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                              {ps.platform}
                            </span>
                            <Badge
                              className={`text-[10px] font-bold ${
                                ps.leadPotential === "HIGH"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {ps.leadPotential} Lead Potential
                            </Badge>
                            <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px]">
                              {ps.recommendedFrequency}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
                            <strong>Role:</strong> {ps.role}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-tight">
                            {ps.capabilityNotice}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openWhyExplanation(`Why ${ps.platform}?`, ps.reason, `Confidence: ${ps.confidence || 85}% • Attribution CVR: ${ps.attributionData?.conversionRate || "2.1%"}`)}
                            className="h-8 px-2.5 text-xs text-primary font-bold"
                          >
                            Why?
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">
                  Channel allocation will appear once strategy is built.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN (5 COLUMNS): TODAY'S AI PLAN & RECOMMENDATIONS */}
        <div className="lg:col-span-5 space-y-6">
          {/* CARD: TODAY'S GROWTH PLAN */}
          <Card className="border-2 border-slate-900 dark:border-white bg-white dark:bg-slate-900 shadow-md overflow-hidden">
            <CardHeader className="p-5 border-b bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <span>Today's AI Growth Plan</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-300 dark:text-slate-600">
                  Daily content tasks scheduled to maintain required lead velocity.
                </CardDescription>
              </div>
              <Badge className="bg-amber-400 text-slate-900 text-xs font-black">
                TODAY
              </Badge>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {strategy && strategy.todayPlan.length > 0 ? (
                strategy.todayPlan.map((task) => {
                  const isExecuting = executingTaskId === task.id;
                  const executionStatus = taskExecutionStatus[task.id];

                  return (
                    <div
                      key={task.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                            {task.time}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                            {task.platform}
                          </span>
                          <Badge className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {task.format}
                          </Badge>
                        </div>
                        <Badge
                          className={`text-[10px] ${
                            task.status === "SCHEDULED"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {task.status}
                        </Badge>
                      </div>

                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {task.topic}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                        "{task.hook}"
                      </p>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400 truncate">
                          Reason: {task.reason}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            disabled={isExecuting}
                            onClick={() => handleExecuteTask(task, false)}
                            className="h-7 px-2 text-[11px] font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                          >
                            {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generate"}
                          </Button>
                          <Link href="/dashboard/ai-studio">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] font-bold"
                            >
                              Studio
                            </Button>
                          </Link>
                        </div>
                      </div>

                      {executionStatus && (
                        <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          {executionStatus}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 space-y-2">
                  <p className="text-xs text-slate-500">
                    No active tasks for today. Build strategy to generate today's growth schedule.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CARD: AI RECOMMENDATIONS & ALERTS */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40">
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>AI Recommendations</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Data-backed optimizations to increase organic pipeline velocity.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-3">
              {strategy && strategy.recommendations.length > 0 ? (
                strategy.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                          {rec.title}
                        </span>
                      </div>
                      {rec.applied ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">
                          ✓ Applied
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleApplyRec(rec.id)}
                          className="h-6 px-2 text-[10px] font-bold bg-primary text-white"
                        >
                          Apply
                        </Button>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {rec.description}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>Impact: <strong>{rec.expectedImpact}</strong></span>
                      <button
                        onClick={() => openWhyExplanation(rec.title, rec.why, rec.data)}
                        className="text-primary font-bold hover:underline"
                      >
                        Why?
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">
                  Recommendations will appear after strategy generation.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* =====================================================================
          5. 7-DAY GROWTH CALENDAR & TASK BOARD
         ===================================================================== */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-extrabold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span>7-Day Growth Plan Calendar</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Upcoming scheduled campaigns to maintain lead generation pace.
            </CardDescription>
          </div>
          <Link href="/dashboard/content">
            <Button variant="outline" size="sm" className="h-8 text-xs font-bold">
              Open Content Library
            </Button>
          </Link>
        </CardHeader>

        <CardContent className="p-5">
          {strategy && strategy.weeklyPlan.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {strategy.weeklyPlan.map((task, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                        {task.day}
                      </span>
                      <Badge className="text-[9px] bg-slate-200 dark:bg-slate-800">
                        {task.platform}
                      </Badge>
                    </div>

                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 line-clamp-2">
                      {task.topic}
                    </p>
                    <p className="text-[10px] text-slate-400 line-clamp-2 italic">
                      "{task.hook}"
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">
                      {task.time}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExecuteTask(task, false)}
                      className="h-6 px-1.5 text-[10px] text-primary font-bold hover:bg-slate-200 dark:hover:bg-slate-800"
                    >
                      Create
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-6">
              7-Day Growth Calendar will populate when you build your strategy.
            </p>
          )}
        </CardContent>
      </Card>

      {/* =====================================================================
          6. DYNAMIC CONTENT PILLARS
         ===================================================================== */}
      {strategy && strategy.contentPillars.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40">
            <CardTitle className="text-base font-extrabold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>AI Content Pillars &amp; Lead Conversion Roles</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Synthesized from Brand DNA, buyer awareness stages, and competitor content gaps.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {strategy.contentPillars.map((pillar) => (
                <div
                  key={pillar.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-black">
                      {pillar.allocationPercentage}% Volume
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {pillar.audienceStage.split(" ")[0]}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                      {pillar.name}
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug mt-1">
                      {pillar.purpose}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 text-[11px] space-y-1">
                    <p className="font-bold text-slate-700 dark:text-slate-300 text-[10px] uppercase">
                      Lead-Gen Role:
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-tight">
                      {pillar.leadGenerationRole}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* =====================================================================
          6.5 RECENT AI ACTIVITY & REAL PUBLISHING FEED (MAIN HIGHLIGHT)
         ===================================================================== */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-extrabold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Flame className="h-5 w-5 text-orange-500" />
              <span>Recent AI Activity &amp; Publishing</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Live chronological feed of autonomous posts created, scheduled, and published with visual media assets and direct links.
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={refreshActivityFeed}
            disabled={isRefreshingActivity}
            className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white gap-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingActivity ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </CardHeader>

        <CardContent className="p-5 space-y-3">
          {activityList && activityList.length > 0 ? (
            <div className="space-y-3">
              {activityList.slice(0, 15).map((act) => {
                const isPub = act.type === "POST_PUBLISHED" || act.status === "PUBLISHED";
                const isSched = act.type === "POST_SCHEDULED" || act.status === "SCHEDULED";

                return (
                  <div
                    key={act.id}
                    className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col md:flex-row gap-4 items-start justify-between"
                  >
                    {/* Left: Media Thumbnail (Image / Video) */}
                    <div className="flex items-start gap-3 flex-1">
                      {act.mediaUrl ? (
                        <div
                          onClick={() =>
                            setPreviewMediaUrl({
                              url: act.mediaUrl!,
                              type: act.mediaType === "video" ? "video" : "image",
                              title: act.topic || act.title,
                              caption: act.captionPreview,
                            })
                          }
                          className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer relative group hover:border-primary transition-all shadow-xs"
                        >
                          {act.mediaType === "video" ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-indigo-400">
                              <Video className="w-6 h-6" />
                              <span className="text-[9px] font-bold mt-1">Video</span>
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={act.mediaUrl}
                              alt={act.topic || "Post Visual"}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center text-slate-400">
                          <FileText className="w-6 h-6" />
                        </div>
                      )}

                      {/* Middle: Content & Metadata */}
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {act.platform && (
                            <Badge variant="outline" className="text-[10px] font-bold border">
                              {act.platform} {act.format ? `• ${act.format}` : ""}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold ${
                              isPub
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                : isSched
                                ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {isPub ? "✓ Published" : isSched ? "Scheduled" : "Draft Ready"}
                          </Badge>
                          <span className="text-[11px] text-slate-400 font-medium">{act.formattedTime}</span>
                        </div>

                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{act.topic || act.title}</h4>
                        {act.captionPreview && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed font-sans">
                            {act.captionPreview}
                          </p>
                        )}

                        {act.stats && (act.stats.impressions > 0 || act.stats.clicks > 0) && (
                          <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 font-mono">
                            <span>Reach: <strong className="text-slate-800 dark:text-slate-200">{act.stats.impressions.toLocaleString()}</strong></span>
                            <span>Clicks: <strong className="text-slate-800 dark:text-slate-200">{act.stats.clicks}</strong></span>
                            <span>Leads: <strong className="text-emerald-600 dark:text-emerald-400">{act.stats.leads}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Direct Interactive Links */}
                    <div className="flex flex-row md:flex-col items-end gap-1.5 shrink-0 self-end md:self-center">
                      {isPub && act.publishedUrl ? (
                        <a
                          href={act.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> View Live Post
                        </a>
                      ) : (
                        <Link
                          href={act.editorUrl || "/dashboard/content"}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 flex items-center gap-1 transition-colors"
                        >
                          <Eye className="w-3 h-3" /> View Schedule Preview
                        </Link>
                      )}

                      <Link
                        href={act.studioUrl || "/dashboard/ai-studio"}
                        className="px-2.5 py-1 rounded-md text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition-colors font-medium"
                      >
                        Open in AI Studio &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-500">No recent autonomous posts recorded yet.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBuildStrategy}
                className="text-xs border-slate-300 dark:border-slate-700"
              >
                Generate First Campaign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================================
          7. EXPERIMENTS & AI LEARNING LOOP
         ===================================================================== */}
      {strategy && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* EXPERIMENTS */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40">
              <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span>Growth Experiments</span>
              </CardTitle>
              <CardDescription className="text-xs">
                A/B tests on hooks, formats, and posting times to maximize conversion.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-3">
              {strategy.experiments.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                      {exp.name}
                    </span>
                    <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600">
                      {exp.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                    {exp.hypothesis}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Target Metric: <strong>{exp.metric}</strong> • Sample Size: {exp.sampleSize} posts
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AI LEARNING LOOP */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40">
              <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span>Daily AI Learning Loop</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Autonomous performance insights driving strategic adjustments.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-3">
              {strategy.learningInsights.map((insight, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-1.5 text-xs"
                >
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong>Observation:</strong> {insight.observation}
                  </p>
                  <p className="text-primary font-medium leading-relaxed">
                    <strong>AI Conclusion:</strong> {insight.conclusion}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    <strong>Next Action:</strong> {insight.nextAction}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* =====================================================================
          8. EXPLAINABLE AI DECISION LOG & DATA TRANSPARENCY
         ===================================================================== */}
      {strategy && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span>Explainable AI Decision Log &amp; Data Sources</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Full transparency into every strategic choice and the underlying datasets used.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Brand DNA Synced: <strong>{strategy.dataSources?.brandDNASynced ? "Yes" : "No"}</strong></span>
              <span>•</span>
              <span>Analyzed Posts: <strong>{strategy.dataSources?.analyzedPostsCount ?? 0}</strong></span>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-3 font-mono text-xs">
            {strategy.decisions.map((dec) => (
              <div
                key={dec.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1 font-sans"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                    [{dec.date}] • {dec.title}
                  </span>
                  <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">
                    {dec.status}
                  </Badge>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-xs">
                  <strong>Action:</strong> {dec.action}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  <strong>Reason:</strong> {dec.reason} ({dec.data})
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* =====================================================================
          MODAL: GOAL CONFIGURATION & EDITING
         ===================================================================== */}
      <Dialog open={openGoalSettings} onOpenChange={setOpenGoalSettings}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" />
              <span>Set Your Organic Lead Target</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              AI will recalculate required impressions, funnel flow, and posting cadence.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            {/* Field 1: Lead Target */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 dark:text-slate-200">
                Lead Target (Total Volume):
              </label>
              <Input
                type="number"
                min={10}
                max={5000}
                value={leadTarget}
                onChange={(e) => setLeadTarget(Number(e.target.value) || 10)}
                className="h-10 text-sm font-black"
              />
            </div>

            {/* Field 2: Lead Type */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 dark:text-slate-200">
                Lead Type:
              </label>
              <select
                value={leadType}
                onChange={(e) => setLeadType(e.target.value as LeadType)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
              >
                {leadTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Field 3: Timeframe Days */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 dark:text-slate-200">
                Timeframe (Days):
              </label>
              <div className="flex gap-2">
                {[14, 30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setTimeframeDays(d)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                      timeframeDays === d
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {d} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Field 4: Target Platforms */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>Target Social Channels:</span>
                <span className="text-primary font-bold">{targetPlatforms.length} Selected</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availablePlatforms.map((pl) => {
                  const isChecked = targetPlatforms.includes(pl);
                  return (
                    <button
                      key={pl}
                      type="button"
                      onClick={() => togglePlatformSelection(pl)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        isChecked
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {isChecked ? "✓ " : ""}
                      {pl}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenGoalSettings(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveGoalSettings}
              disabled={isPending}
              className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold"
            >
              {isPending ? "Saving..." : "Save & Recalculate Strategy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL: VIEW FUNNEL CALCULATION
         ===================================================================== */}
      <Dialog open={openFunnelModal} onOpenChange={setOpenFunnelModal}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <span>Organic Lead Funnel Mathematics</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Complete calculation flow derived from active project analytics and industry benchmarks.
            </DialogDescription>
          </DialogHeader>

          {strategy && (
            <div className="space-y-4 py-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <p className="font-bold text-slate-900 dark:text-slate-100">
                  Mathematical Conversion Sequence:
                </p>
                <div className="font-mono text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
                  <p>1. Target Lead Volume: <strong>{strategy.targetLeads} leads</strong></p>
                  <p>2. Lead Conversion CVR: <strong>{(strategy.funnel.organicCVR * 100).toFixed(1)}%</strong> → Requires <strong>{strategy.funnel.requiredProfileVisits.toLocaleString()} profile clicks</strong></p>
                  <p>3. Profile Click CTR: <strong>{(strategy.funnel.engagementCTR * 100).toFixed(1)}%</strong> → Requires <strong>{strategy.funnel.requiredImpressions.toLocaleString()} organic impressions</strong></p>
                  <p>4. Avg Post Reach: <strong>~{strategy.funnel.avgImpressionsPerPost.toLocaleString()} impressions / post</strong></p>
                  <p>5. Total Production Volume: <strong>{strategy.funnel.requiredTotalPosts} posts</strong> over {strategy.timeframeDays} days (<strong>{strategy.funnel.requiredPostsPerWeek} posts/week</strong>)</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  Assumptions &amp; Data Priority Applied:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                  {strategy.funnel.assumptions.map((ass, i) => (
                    <li key={i}>{ass}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setOpenFunnelModal(false)} className="font-bold">
              Close Breakdown
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL: "WHY?" AI EXPLANATION DRAWER
         ===================================================================== */}
      <Dialog open={openWhyModal} onOpenChange={setOpenWhyModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <span>{whyModalData?.title || "AI Strategic Rationale"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {whyModalData?.explanation}
            </p>
            {whyModalData?.metrics && (
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-primary font-bold">
                {whyModalData.metrics}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setOpenWhyModal(false)}>
              Got It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL: AUTOPILOT PERMISSIONS
         ===================================================================== */}
      <Dialog open={openAutopilotModal} onOpenChange={setOpenAutopilotModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span>Growth Autopilot Controls</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure how autonomously AI agents operate across your growth pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            <div className="space-y-2">
              <label className="font-bold text-slate-800 dark:text-slate-200">
                Operating Mode:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["MANUAL", "ASSISTED", "AUTOPILOT"] as AutopilotMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAutopilotMode(mode)}
                    className={`py-2.5 px-3 rounded-xl border text-center font-extrabold text-xs transition-all ${
                      autopilotMode === mode
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2 text-[11px]">
              <p className="font-bold text-slate-800 dark:text-slate-200">
                Active Permissions (Guaranteed Safety):
              </p>
              <p className="text-slate-600 dark:text-slate-400">✓ AI generates captions &amp; copy into drafts</p>
              <p className="text-slate-600 dark:text-slate-400">✓ AI generates visual assets via gemini-3-pro-image</p>
              <p className="text-slate-600 dark:text-slate-400">✓ AI schedules content during audience peak hours</p>
              <p className="text-slate-600 dark:text-slate-400">□ Direct API publishing requires user approval in Assisted mode</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                toggleAutopilot(workspaceId, { mode: autopilotMode });
                setOpenAutopilotModal(false);
              }}
              className="font-extrabold bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            >
              Save Autopilot Preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL: MEDIA LIGHTBOX & CAPTION PREVIEW
         ===================================================================== */}
      {previewMediaUrl && (
        <Dialog open={Boolean(previewMediaUrl)} onOpenChange={() => setPreviewMediaUrl(null)}>
          <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl p-5">
            <DialogHeader>
              <DialogTitle className="text-sm font-extrabold text-white">
                {previewMediaUrl.title}
              </DialogTitle>
            </DialogHeader>

            <div className="relative rounded-xl overflow-hidden bg-black max-h-[65vh] flex items-center justify-center border border-slate-800">
              {previewMediaUrl.type === "video" ? (
                <video src={previewMediaUrl.url} controls autoPlay className="max-h-[60vh] w-auto rounded-lg" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewMediaUrl.url} alt={previewMediaUrl.title} className="max-h-[60vh] w-auto object-contain rounded-lg" />
              )}
            </div>

            {previewMediaUrl.caption && (
              <div className="space-y-1 pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Post Caption Preview:</span>
                <p className="text-xs text-slate-300 leading-relaxed font-sans max-h-24 overflow-y-auto bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                  {previewMediaUrl.caption}
                </p>
              </div>
            )}

            <DialogFooter className="flex justify-between items-center w-full pt-2">
              <Link
                href="/dashboard/content"
                className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
              >
                Open in Content Library &rarr;
              </Link>
              <Button size="sm" variant="outline" onClick={() => setPreviewMediaUrl(null)} className="text-xs border-slate-700">
                Close Preview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
