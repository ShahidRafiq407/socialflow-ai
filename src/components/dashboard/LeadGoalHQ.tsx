"use client";

import React, { useState, useTransition } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
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
  ArrowRight,
  Calculator,
  RefreshCw,
  Check,
  Building2,
  FileText,
  Loader2,
  Sliders,
  Calendar,
  Zap,
  TrendingUp,
  AlertTriangle,
  HelpCircle,
  Clock,
  Send,
  Layers,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  MessageSquare,
  BarChart3,
  Flame,
  Globe,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GrowthStrategy,
  GrowthKPIs,
  LeadType,
  AutopilotMode,
  GrowthPlanTask,
  PlatformStrategyItem,
  ContentPillar,
} from "@/lib/agents/growthEngine";
import {
  saveGrowthGoal,
  toggleAutopilot,
  executeGrowthPlanTask,
  applyGrowthRecommendation,
} from "@/actions/goals";

interface LeadGoalHQProps {
  workspaceId: string;
  workspaceName: string;
  industry: string;
  website: string;
  initialGoal: any;
  initialKPIs: GrowthKPIs;
  initialStrategy: GrowthStrategy | null;
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

  // Modals & Drawers
  const [openGoalSettings, setOpenGoalSettings] = useState<boolean>(false);
  const [openFunnelModal, setOpenFunnelModal] = useState<boolean>(false);
  const [openWhyModal, setOpenWhyModal] = useState<boolean>(false);
  const [whyModalData, setWhyModalData] = useState<{ title: string; explanation: string; metrics?: string } | null>(null);
  const [openAutopilotModal, setOpenAutopilotModal] = useState<boolean>(false);

  // Live Streamed Strategy Generation
  const [isBuildingStrategy, setIsBuildingStrategy] = useState<boolean>(false);
  const [streamSteps, setStreamSteps] = useState<{ step: string; status: "running" | "done" | "info" }[]>([]);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);
  const [taskExecutionStatus, setTaskExecutionStatus] = useState<Record<string, string>>({});

  // Storage Key for Instant Workspace Persistence
  const STORAGE_KEY = `socialflow_lead_goal_data_${workspaceId}`;

  // Hydrate from localStorage on client-side mount if initialStrategy was empty/cached
  React.useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.strategy && !initialStrategy) {
            setStrategy(parsed.strategy);
          }
          if (parsed.kpis && initialKPIs.status === "INSUFFICIENT_DATA") {
            setKpis(parsed.kpis);
          }
          if (parsed.leadTarget && !initialGoal?.leadTarget) setLeadTarget(parsed.leadTarget);
          if (parsed.leadType && !initialGoal?.leadType) setLeadType(parsed.leadType);
          if (parsed.timeframeDays && !initialGoal?.timeframeDays) setTimeframeDays(parsed.timeframeDays);
          if (parsed.targetPlatforms && !initialGoal?.targetPlatforms) setTargetPlatforms(parsed.targetPlatforms);
          if (parsed.autopilotMode && !initialGoal?.autopilotMode) setAutopilotMode(parsed.autopilotMode);
        } else if (initialStrategy) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              strategy: initialStrategy,
              kpis: initialKPIs,
              leadTarget,
              leadType,
              timeframeDays,
              targetPlatforms,
              autopilotMode,
              updatedAt: Date.now(),
            })
          );
        }
      }
    } catch (e) {
      console.warn("[LeadGoalHQ] LocalStorage hydration warning:", e);
    }
  }, [workspaceId]);

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

  // Available platform list
  const availablePlatforms = ["LinkedIn", "Instagram", "X", "TikTok", "YouTube", "Facebook", "Pinterest"];

  const togglePlatformSelection = (pl: string) => {
    if (targetPlatforms.includes(pl)) {
      if (targetPlatforms.length > 1) {
        setTargetPlatforms(targetPlatforms.filter((p) => p !== pl));
      }
    } else {
      setTargetPlatforms([...targetPlatforms, pl]);
    }
  };

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
            leadType,
            timeframeDays,
            targetPlatforms,
            autopilotMode,
            updatedAt: Date.now(),
          })
        );
      }
    } catch {}
  };

  // 1. REAL STREAMED AGENT WORKFLOW: BUILD GROWTH STRATEGY
  const handleBuildStrategy = async () => {
    setIsBuildingStrategy(true);
    setStreamSteps([
      { step: "Initializing Organic Growth Engine & Agent Architecture...", status: "running" },
    ]);

    try {
      const response = await fetch("/api/growth/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          leadTarget,
          leadType,
          timeframeDays,
          targetPlatforms,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to start strategy generation");
      }

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
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (eventType === "agent_step") {
              setStreamSteps((prev) => [
                ...prev.map((s) => ({ ...s, status: "done" as const })),
                { step: data.step, status: data.status || "running" },
              ]);
            } else if (eventType === "strategy_completed") {
              const newStrategy = data.strategy as GrowthStrategy;
              const newKpis: GrowthKPIs = {
                ...kpis,
                targetLeads: newStrategy.targetLeads,
                status: "ON_TRACK",
                statusReason: `Active strategy generated: ${newStrategy.funnel.requiredPostsPerWeek} posts/week across ${newStrategy.platformStrategies.length} channels.`,
              };

              setStrategy(newStrategy);
              setKpis(newKpis);
              persistState(newStrategy, newKpis);

              setStreamSteps((prev) => [
                ...prev.map((s) => ({ ...s, status: "done" as const })),
                { step: "✓ Organic Growth Strategy successfully generated & active!", status: "done" },
              ]);
              setTimeout(() => {
                setIsBuildingStrategy(false);
              }, 1200);
            } else if (eventType === "strategy_error") {
              setStreamSteps((prev) => [
                ...prev,
                { step: `Error: ${data.error}`, status: "info" },
              ]);
              setIsBuildingStrategy(false);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Strategy build stream error:", err);
      setIsBuildingStrategy(false);
    }
  };

  // 2. SAVE GOAL CONFIGURATION & RECALCULATE
  const handleSaveGoalSettings = () => {
    startTransition(async () => {
      persistState(strategy);
      await saveGrowthGoal(workspaceId, {
        leadTarget,
        leadType,
        timeframeDays,
        targetPlatforms,
        autopilotMode,
      });
      setOpenGoalSettings(false);
      // Trigger automatic recalculation
      handleBuildStrategy();
    });
  };

  // 3. EXECUTE TASK (HAND OFF TO CONTENT CREATOR & AI STUDIO)
  const handleExecuteTask = async (task: GrowthPlanTask, scheduleNow: boolean = false) => {
    setExecutingTaskId(task.id);
    setTaskExecutionStatus((prev) => ({ ...prev, [task.id]: "Generating copy & visuals via AI..." }));

    try {
      const res = await executeGrowthPlanTask(workspaceId, task, {
        generateVisuals: true,
        scheduleNow,
      });

      if (res.success) {
        setTaskExecutionStatus((prev) => ({
          ...prev,
          [task.id]: scheduleNow ? "✓ Scheduled & Saved to Library" : "✓ Draft Created in Studio",
        }));
        // Update task status in local state and persistent storage
        if (strategy) {
          const updatedToday: GrowthPlanTask[] = strategy.todayPlan.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: (scheduleNow ? "SCHEDULED" : "PENDING_APPROVAL") as any,
                  postId: res.postId,
                  mediaUrl: res.mediaUrl || undefined,
                }
              : t
          );
          const updatedStrategy = { ...strategy, todayPlan: updatedToday };
          setStrategy(updatedStrategy);
          persistState(updatedStrategy);
        }
      } else {
        setTaskExecutionStatus((prev) => ({ ...prev, [task.id]: `Failed: ${res.error}` }));
      }
    } catch (err: any) {
      setTaskExecutionStatus((prev) => ({ ...prev, [task.id]: "Execution failed" }));
    } finally {
      setExecutingTaskId(null);
    }
  };

  // 4. APPLY RECOMMENDATION
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

  // 5. OPEN "WHY?" MODAL
  const openWhyExplanation = (title: string, explanation: string, metrics?: string) => {
    setWhyModalData({ title, explanation, metrics });
    setOpenWhyModal(true);
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ON_TRACK":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-black">🟢 ON TRACK</Badge>;
      case "NEEDS_OPTIMIZATION":
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs font-black">🟡 NEEDS OPTIMIZATION</Badge>;
      case "BEHIND_TARGET":
        return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 text-xs font-black">🔴 BEHIND TARGET</Badge>;
      case "GOAL_ACHIEVED":
        return <Badge className="bg-emerald-600 text-white text-xs font-black">✓ GOAL ACHIEVED</Badge>;
      default:
        return <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 text-xs font-bold">⚪ INSUFFICIENT DATA</Badge>;
    }
  };

  return (
    <div className="flex flex-col space-y-6 w-full max-w-7xl mx-auto font-sans pb-20">
      {/* =====================================================================
          1. HEADER ROW: CONTROL CENTER TITLE + STATUS + AUTOPILOT CONTROLS
         ===================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm font-black">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                  Organic Lead Growth Control Center
                </h1>
                {getStatusBadge(kpis.status)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                AI orchestration layer for {workspaceName} • Target: <strong>{leadTarget} {leadType.replace(/_/g, " ")}</strong> in {timeframeDays} days.
              </p>
            </div>
          </div>
        </div>

        {/* TOP ACTION CONTROLS */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Autopilot Mode Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold">
            <span className="text-slate-500 dark:text-slate-400">Mode:</span>
            <span className="text-slate-900 dark:text-white font-extrabold">{autopilotMode}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpenAutopilotModal(true)}
              className="h-6 px-1.5 text-[10px] text-primary hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md ml-1"
            >
              Configure
            </Button>
          </div>

          {/* Ask Marketing Brain */}
          <Link href="/dashboard/chat">
            <Button
              variant="outline"
              className="h-9 px-3.5 text-xs font-bold gap-1.5 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <span>Ask Marketing Brain</span>
            </Button>
          </Link>

          {/* Goal Settings */}
          <Button
            variant="outline"
            onClick={() => setOpenGoalSettings(true)}
            className="h-9 px-3.5 text-xs font-bold gap-1.5 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <Sliders className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
            <span>Goal Settings</span>
          </Button>

          {/* Primary CTA: Build / Recalculate Strategy */}
          <Button
            onClick={handleBuildStrategy}
            disabled={isBuildingStrategy}
            className="h-9 px-4 text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 gap-1.5 shadow-sm"
          >
            {isBuildingStrategy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Agent Squad Operating...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>{strategy ? "Recalculate Growth Strategy" : "Build Growth Strategy"}</span>
              </>
            )}
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
                            onClick={() => openWhyExplanation(`Why ${ps.platform}?`, ps.reason, `Confidence: ${ps.confidence}% • Attribution CVR: ${ps.attributionData.conversionRate}`)}
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
              <span>Brand DNA Synced: <strong>{strategy.dataSources.brandDNASynced ? "Yes" : "No"}</strong></span>
              <span>•</span>
              <span>Analyzed Posts: <strong>{strategy.dataSources.analyzedPostsCount}</strong></span>
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
    </div>
  );
}
