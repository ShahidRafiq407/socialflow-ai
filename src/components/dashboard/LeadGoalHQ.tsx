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
import { Textarea } from "@/components/ui/textarea";
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
  Briefcase,
  Sparkles,
  ArrowRight,
  Calculator,
  Flame,
  Download,
  RefreshCw,
  Check,
  MessageSquare,
  Building2,
  FileText,
  Loader2,
  ChevronRight,
  Layers,
  Sliders,
} from "lucide-react";
import Link from "next/link";
import { createCampaignFromGoal } from "@/actions/goals";

interface LeadGoalHQProps {
  workspaceId: string;
  workspaceName: string;
}

export function LeadGoalHQ({
  workspaceId,
  workspaceName,
}: LeadGoalHQProps) {
  // STAGES: CONFIG -> PLAN_PREVIEW -> WAR_ROOM
  const [stage, setStage] = useState<"CONFIG" | "PLAN_PREVIEW" | "WAR_ROOM">(
    "CONFIG"
  );
  const [isPending, startTransition] = useTransition();

  // Selected Sprint Tier (Curated Realistic Organic Targets)
  const [sprintTier, setSprintTier] = useState<"1_MONTH" | "2_MONTHS" | "3_MONTHS">(
    "2_MONTHS"
  );

  // Optional Custom Override Toggle
  const [showCustomOverride, setShowCustomOverride] = useState<boolean>(false);
  const [customLeadTarget, setCustomLeadTarget] = useState<number>(150);

  // Dynamic Multi-Platform Selection (Supports up to 7 platforms)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "LinkedIn",
    "Instagram",
    "X",
    "TikTok",
  ]);

  // Revision / Feedback State
  const [openRevisionModal, setOpenRevisionModal] = useState<boolean>(false);
  const [customFeedback, setCustomFeedback] = useState<string>("");
  const [revisionCount, setRevisionCount] = useState<number>(0);

  // Sprint Tier Definitions (Short, clear, easy to understand)
  const sprintDefinitions = {
    "1_MONTH": {
      label: "30-Day Starter Sprint",
      days: 30,
      targetLeads: 60,
      pace: "Steady Posting (~2 leads/day)",
    },
    "2_MONTHS": {
      label: "60-Day Growth Acceleration",
      days: 60,
      targetLeads: 150,
      pace: "Active Omnichannel Posting (~2.5 leads/day)",
    },
    "3_MONTHS": {
      label: "90-Day Market Domination",
      days: 90,
      targetLeads: 300,
      pace: "High-Volume Posting (~3.3 leads/day)",
    },
  };

  const activeSprint = sprintDefinitions[sprintTier];
  const effectiveLeads = showCustomOverride
    ? customLeadTarget
    : activeSprint.targetLeads;
  const totalDays = activeSprint.days;

  // Funnel Math: 1.5% Capture CVR + 8% Profile Click CTR
  const requiredClicks = Math.round((effectiveLeads / 1.5) * 100);
  const requiredImpressions = Math.round((requiredClicks / 8) * 100);

  const postsPerDayTotal = Math.max(
    1,
    Math.ceil(effectiveLeads / (totalDays * 1.2))
  );
  const totalPostsNeeded = postsPerDayTotal * totalDays;

  // Toggle Platform Checkbox
  const togglePlatform = (platform: string) => {
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(
          selectedPlatforms.filter((p) => p !== platform)
        );
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  };

  // Stage 1: Generate Plan
  const handleGeneratePlan = () => {
    setStage("PLAN_PREVIEW");
  };

  // Stage 2: Regenerate Plan with Feedback
  const handleApplyRevision = () => {
    setRevisionCount((prev) => prev + 1);
    setOpenRevisionModal(false);
  };

  // Stage 3: Approve & Start Autonomous War Room
  const handleApproveAndLaunch = () => {
    startTransition(async () => {
      try {
        await createCampaignFromGoal({
          workspaceId,
          leadTarget: effectiveLeads,
          timeframe: sprintTier,
          customFeedback: customFeedback.trim()
            ? customFeedback.trim()
            : undefined,
        });
        setStage("WAR_ROOM");
      } catch (error) {
        console.error("Failed to launch autonomous squad:", error);
        setStage("WAR_ROOM");
      }
    });
  };

  // Boardroom Live Inter-Agent Consultation Log
  const boardroomLog = [
    {
      time: "08:45:12 AM",
      from: "Intelligence Scout",
      to: "Copywriting Lead",
      message: `Extracted ${workspaceName} Brand DNA profile. Identified top organic hooks across ${selectedPlatforms.length} platforms.`,
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      time: "08:45:15 AM",
      from: "Copywriting Lead",
      to: "CEO Orchestrator",
      message: `Drafted ${selectedPlatforms.length} channel campaigns using your Brand DNA value proposition and destination URL. Requesting review.`,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      time: "08:45:18 AM",
      from: "CEO Orchestrator",
      to: "Copywriting Lead",
      message: `Approved. Tone aligns with Brand DNA. Directing Visual Studio to render creative assets.`,
      color: "text-primary font-bold",
    },
    {
      time: "08:45:22 AM",
      from: "Visual Studio",
      to: "Publisher Lead",
      message: `Rendered Carousel slides, 9:16 Reels, and Card assets. High contrast and branding verified.`,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      time: "08:45:26 AM",
      from: "Publisher Lead",
      to: "CEO Orchestrator",
      message: `All ${selectedPlatforms.length} platform queues ready for peak hour release across ${selectedPlatforms.join(", ")}.`,
      color: "text-emerald-600 dark:text-emerald-400 font-bold",
    },
  ];

  return (
    <div className="flex flex-col space-y-8 w-full max-w-6xl mx-auto font-sans pb-16">
      {/* TOP HEADER - SIMPLE & CLEAR COPY */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                Lead Goal &amp; Strategy HQ
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Set your organic lead target and let AI agents build your marketing plan.
              </p>
            </div>
          </div>
        </div>

        {/* PREMIUM SEGMENTED WORKFLOW STEPPER */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-x-auto max-w-full shrink-0">
          {/* STEP 1 */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-extrabold ${
              stage === "CONFIG"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                stage === "CONFIG"
                  ? "bg-primary text-white"
                  : stage === "PLAN_PREVIEW" || stage === "WAR_ROOM"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              {stage === "PLAN_PREVIEW" || stage === "WAR_ROOM" ? "✓" : "1"}
            </span>
            <span>Goal &amp; Channels</span>
          </div>

          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />

          {/* STEP 2 */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-extrabold ${
              stage === "PLAN_PREVIEW"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                stage === "PLAN_PREVIEW"
                  ? "bg-primary text-white"
                  : stage === "WAR_ROOM"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              {stage === "WAR_ROOM" ? "✓" : "2"}
            </span>
            <span>Strategy Review</span>
          </div>

          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />

          {/* STEP 3 */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-extrabold ${
              stage === "WAR_ROOM"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                stage === "WAR_ROOM"
                  ? "bg-white text-emerald-700"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              3
            </span>
            <span>Agency War Room</span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          STAGE 1: GOAL CONFIGURATOR
         ===================================================================== */}
      {stage === "CONFIG" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in-50 duration-300">
          {/* LEFT CARD: CURATED ORGANIC SPRINT GROWTH TIERS */}
          <Card className="lg:col-span-1 border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40">
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span>1. Select Growth Tier</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Choose a realistic organic target for your brand.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              {/* CURATED ORGANIC SPRINT TIERS (STACKED VERTICAL RESPONSIVE DESIGN) */}
              <div className="space-y-2.5">
                <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  Target &amp; Timeframe
                </label>

                <div className="space-y-3">
                  {/* TIER 1: 1 MONTH */}
                  <button
                    type="button"
                    onClick={() => {
                      setSprintTier("1_MONTH");
                      setShowCustomOverride(false);
                    }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex flex-col gap-2.5 ${
                      sprintTier === "1_MONTH" && !showCustomOverride
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full flex-wrap gap-1">
                      <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                        30-Day Starter Sprint
                      </p>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        1 Month
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Consistent posting across{" "}
                      <strong>{selectedPlatforms.length} selected platforms</strong>.
                    </p>

                    <div className="flex items-center justify-between w-full pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Projected Organic Leads
                      </span>
                      <Badge className="bg-primary/15 text-primary border-primary/30 text-xs font-bold font-mono px-2.5 py-0.5">
                        ~60 Leads
                      </Badge>
                    </div>
                  </button>

                  {/* TIER 2: 2 MONTHS (RECOMMENDED) */}
                  <button
                    type="button"
                    onClick={() => {
                      setSprintTier("2_MONTHS");
                      setShowCustomOverride(false);
                    }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex flex-col gap-2.5 ${
                      sprintTier === "2_MONTHS" && !showCustomOverride
                        ? "border-emerald-500 bg-emerald-500/10 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full flex-wrap gap-1.5">
                      <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                        60-Day Growth Acceleration
                      </p>
                      <span className="text-[10px] bg-emerald-500 text-white font-extrabold px-2 py-0.5 rounded-full shrink-0">
                        ⭐ RECOMMENDED
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Active omnichannel posting across{" "}
                      <strong>{selectedPlatforms.length} selected platforms</strong>.
                    </p>

                    <div className="flex items-center justify-between w-full pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Projected Organic Leads
                      </span>
                      <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-black font-mono px-2.5 py-0.5">
                        ~150 Leads
                      </Badge>
                    </div>
                  </button>

                  {/* TIER 3: 3 MONTHS */}
                  <button
                    type="button"
                    onClick={() => {
                      setSprintTier("3_MONTHS");
                      setShowCustomOverride(false);
                    }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex flex-col gap-2.5 ${
                      sprintTier === "3_MONTHS" && !showCustomOverride
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full flex-wrap gap-1">
                      <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                        90-Day Market Domination
                      </p>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        3 Months
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      High-volume posting across{" "}
                      <strong>{selectedPlatforms.length} selected platforms</strong>.
                    </p>

                    <div className="flex items-center justify-between w-full pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Projected Organic Leads
                      </span>
                      <Badge className="bg-primary/15 text-primary border-primary/30 text-xs font-bold font-mono px-2.5 py-0.5">
                        ~300 Leads
                      </Badge>
                    </div>
                  </button>
                </div>

                {/* OPTIONAL ADVANCED TOGGLE */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomOverride(!showCustomOverride)}
                    className="text-[11px] font-bold text-slate-500 hover:text-primary flex items-center gap-1"
                  >
                    <Sliders className="h-3 w-3" />
                    <span>
                      {showCustomOverride
                        ? "← Use Standard Tiers"
                        : "Advanced: Set Custom Lead Number"}
                    </span>
                  </button>

                  {showCustomOverride && (
                    <div className="mt-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5 animate-in fade-in-50 duration-200">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Custom Leads Goal ({totalDays} Days):
                      </label>
                      <Input
                        type="number"
                        min={10}
                        max={5000}
                        value={customLeadTarget}
                        onChange={(e) =>
                          setCustomLeadTarget(Number(e.target.value) || 10)
                        }
                        className="h-9 text-xs font-extrabold"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* TARGET PLATFORMS CHECKBOX PILLS (DYNAMICS FOR ALL 7 PLATFORMS) */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Target Social Channels</span>
                  <span className="text-[11px] text-primary font-bold">
                    {selectedPlatforms.length} Selected
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "LinkedIn",
                    "Instagram",
                    "X",
                    "TikTok",
                    "YouTube",
                    "Facebook",
                    "Pinterest",
                  ].map((pl) => {
                    const isChecked = selectedPlatforms.includes(pl);
                    return (
                      <button
                        key={pl}
                        type="button"
                        onClick={() => togglePlatform(pl)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          isChecked
                            ? "bg-primary text-white border-primary shadow-xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary"
                        }`}
                      >
                        {isChecked ? "✓ " : ""}
                        {pl}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT CARD: AI ORGANIC FEASIBILITY MATH & FUNNEL CALCULATION */}
          <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 flex flex-col justify-between overflow-hidden">
            <div>
              <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-extrabold flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-primary" />
                    <span>2. Projected Pipeline Math</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    How your agent squad converts viewers into leads over {totalDays} days.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* ACHIEVABLE ORGANIC BANNER */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-base shrink-0">
                      ✓
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                        {activeSprint.label} ({totalDays} Days)
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Pace: <strong>{activeSprint.pace}</strong>. Engineered
                        for organic reach without paid ads.
                      </p>
                    </div>
                  </div>
                </div>

                {/* FUNNEL MATH GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center space-y-1">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      1. Required Impressions
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                      {requiredImpressions.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      8% avg. engagement rate
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center space-y-1">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      2. Profile Visitors
                    </p>
                    <p className="text-2xl font-extrabold text-primary">
                      {requiredClicks.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      1.5% capture conversion
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 text-center space-y-1">
                    <p className="text-[11px] font-bold text-primary uppercase">
                      3. Projected Leads
                    </p>
                    <p className="text-3xl font-black text-primary">
                      ~{effectiveLeads}
                    </p>
                    <p className="text-[10px] text-primary/80 font-bold">
                      Estimated Pipeline Goal
                    </p>
                  </div>
                </div>

                {/* SIMPLE SUMMARY STRATEGY BANNER (100% DYNAMIC CHANNELS) */}
                <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                  <Flame className="h-5 w-5 text-amber-500 shrink-0" />
                  <span>
                    To achieve <strong>~{effectiveLeads} projected leads</strong>{" "}
                    across <strong>{selectedPlatforms.length} platforms</strong> (
                    {selectedPlatforms.join(", ")}), your agent squad will
                    create <strong>{postsPerDayTotal} posts per day</strong>{" "}
                    (<strong>{totalPostsNeeded} total campaigns</strong> across{" "}
                    {totalDays} days).
                  </span>
                </div>
              </CardContent>
            </div>

            {/* CARD FOOTER WITH BIG GENERATE PLAN BUTTON */}
            <CardFooter className="p-5 border-t bg-slate-50/60 dark:bg-slate-800/40 flex justify-end">
              <Button
                onClick={handleGeneratePlan}
                className="h-11 px-7 font-extrabold bg-primary text-white gap-2 shadow-sm hover:opacity-95 text-sm"
              >
                <Sparkles className="h-4 w-4" />
                <span>Generate Strategy Plan</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* =====================================================================
          STAGE 2: STRATEGY PLAN PREVIEW, PDF DOWNLOAD, FEEDBACK & REGENERATE
         ===================================================================== */}
      {stage === "PLAN_PREVIEW" && (
        <Card className="border-2 border-primary/30 bg-white dark:bg-slate-900 shadow-lg animate-in fade-in-50 duration-300 overflow-hidden">
          {/* HEADER BAR WITH DOWNLOAD PDF AND REGENERATE BUTTONS */}
          <CardHeader className="p-6 border-b bg-slate-50/80 dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-white text-xs font-bold">
                  Strategy Plan v1.{revisionCount}
                </Badge>
                {revisionCount > 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-bold">
                    ✓ Feedback Applied
                  </Badge>
                )}
              </div>
              <CardTitle className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                Organic Lead Strategy &amp; Roadmap
              </CardTitle>
              <CardDescription className="text-xs">
                Prepared for <strong>{workspaceName}</strong> • Target:{" "}
                <strong>~{effectiveLeads} Projected Leads</strong> across{" "}
                <strong>{selectedPlatforms.length} platforms</strong> ({totalDays} days).
              </CardDescription>
            </div>

            {/* ACTION BUTTONS: DOWNLOAD PDF & REGENERATE */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="h-9 px-3.5 text-xs font-bold gap-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs"
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                <span>Download PDF Plan</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => setOpenRevisionModal(true)}
                className="h-9 px-3.5 text-xs font-bold gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              >
                <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
                <span>Request Plan Change</span>
              </Button>
            </div>
          </CardHeader>

          {/* DOCUMENT BODY */}
          <CardContent className="p-6 space-y-6 text-xs sm:text-sm">
            {/* 1. EXECUTIVE SUMMARY BOX */}
            <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span>1. Strategy Overview</span>
              </h3>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs">
                To drive an estimated <strong>~{effectiveLeads} qualified leads</strong>{" "}
                for <strong>{workspaceName}</strong>, your AI agent squad will
                publish consistent organic content across{" "}
                <strong>{selectedPlatforms.length} selected platforms ({selectedPlatforms.join(", ")})</strong>. Every
                post is tailored to your Brand DNA without requiring paid ads.
              </p>
              {customFeedback && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs italic">
                  <strong>Applied Guidance:</strong> "{customFeedback}"
                </div>
              )}
            </div>

            {/* 2. FORMAT PRODUCTION BREAKDOWN */}
            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span>
                  2. Content Production Goal ({totalPostsNeeded} Total Posts
                  across {selectedPlatforms.length} Channels)
                </span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                      Short-Form Reels
                    </span>
                    <Badge className="bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20 text-[10px]">
                      9:16 Reel
                    </Badge>
                  </div>
                  <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
                    {Math.ceil(totalPostsNeeded * 0.45)} videos
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Vertical video explainers &amp; reveals
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                      Carousels &amp; Slides
                    </span>
                    <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 text-[10px]">
                      4:5 Carousel
                    </Badge>
                  </div>
                  <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
                    {Math.ceil(totalPostsNeeded * 0.3)} posts
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Step-by-step slide breakdowns
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                      Text &amp; Infographic Cards
                    </span>
                    <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 text-[10px]">
                      16:9 Card
                    </Badge>
                  </div>
                  <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
                    {Math.ceil(totalPostsNeeded * 0.25)} posts
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Engaging announcement posts
                  </p>
                </div>
              </div>
            </div>

            {/* 3. SPRINT RELEASE CALENDAR */}
            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <span>3. Publishing Schedule</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 space-y-1">
                  <p className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                    Phase 1 — Hook &amp; Problem Awareness
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Publishing authoritative hooks and educational slides
                    tailored to your Brand DNA.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 space-y-1">
                  <p className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                    Phase 2 — Conversion &amp; CTA Focus
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Deploying social proof and clear CTAs across all{" "}
                    <strong>{selectedPlatforms.length} channels</strong> to capture leads.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          {/* CARD FOOTER: APPROVE PLAN AND LAUNCH AUTONOMOUS WAR ROOM */}
          <CardFooter className="p-6 border-t bg-slate-50/80 dark:bg-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Button
              variant="outline"
              onClick={() => setStage("CONFIG")}
              disabled={isPending}
              className="w-full sm:w-auto text-xs font-bold"
            >
              ← Back to Configuration
            </Button>

            <Button
              onClick={handleApproveAndLaunch}
              disabled={isPending}
              className="w-full sm:w-auto h-11 px-8 font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-md text-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Launching Agent Squad...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Approve Plan &amp; Start Live War Room</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* =====================================================================
          REVISION / FEEDBACK MODAL
         ===================================================================== */}
      <Dialog open={openRevisionModal} onOpenChange={setOpenRevisionModal}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-500" />
              <span>Request Plan Change</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Tell your AI CEO what you want changed so it can generate an
              upgraded plan.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* QUICK CHIP FEEDBACK */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                Quick Changes:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "More Video Reels",
                  "Focus 80% on LinkedIn",
                  "Target Decision Makers",
                  "Add ROI Calculator CTA",
                  "Increase Carousel Posts",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setCustomFeedback((prev) =>
                        prev ? `${prev}, ${chip}` : chip
                      )
                    }
                    className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* CUSTOM NOTE TEXTAREA */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                Custom Guidance:
              </label>
              <Textarea
                value={customFeedback}
                onChange={(e) => setCustomFeedback(e.target.value)}
                placeholder="e.g., We want more LinkedIn PDF Carousels and an ROI calculator CTA..."
                className="min-h-[100px] text-xs leading-relaxed rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenRevisionModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyRevision}
              className="font-bold bg-primary text-white gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              <span>Generate New Plan</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          STAGE 3: AUTONOMOUS WAR ROOM
         ===================================================================== */}
      {stage === "WAR_ROOM" && (
        <div className="space-y-6 animate-in fade-in-50 duration-500">
          {/* CELEBRATION BANNER */}
          <Card className="border-2 border-emerald-500 bg-gradient-to-r from-emerald-500/10 via-white to-emerald-500/5 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 p-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0 font-bold text-lg">
                  ✓
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-600 text-white text-[11px] font-bold">
                      Strategy Approved • War Room Active
                    </Badge>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                    4-Agent Specialist Squad Operating in Parallel!
                  </h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    Campaign drafts for an estimated <strong>~{effectiveLeads} leads</strong>{" "}
                    across <strong>{selectedPlatforms.length} platforms</strong> have been generated in your Content Library.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link href="/dashboard/content">
                  <Button className="h-10 px-5 font-bold bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-sm">
                    <span>View Content Library</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* VIRTUAL AGENCY WAR ROOM */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span>
                    Agency Floor — 4 Specialist Squads Collaborating Live
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Specialists audit each other and report to the CEO Orchestrator.
                </p>
              </div>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold px-3 py-1 animate-pulse">
                ● LIVE RUNNING
              </Badge>
            </div>

            {/* 4 SPECIALIST ROOM CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ROOM 1: EXECUTIVE SUITE */}
              <Card className="border-2 border-primary/30 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <CardHeader className="p-4 border-b bg-slate-50/70 dark:bg-slate-800/40 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center font-bold">
                      🏛️
                    </div>
                    <div>
                      <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        Room 1: CEO Orchestrator
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Final Validator &amp; Brand DNA Enforcer
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                    ● ACTIVE
                  </Badge>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <p className="font-extrabold text-slate-800 dark:text-slate-200">
                      Live Supervision Status:
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Verifying all outputs against{" "}
                      <strong>{workspaceName} Brand DNA</strong>. Approved{" "}
                      <strong>{selectedPlatforms.length} platform queues</strong> for release.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Consults: All 3 Squads</span>
                    <span className="font-bold text-primary">
                      100% Brand Safe
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* ROOM 2: INTELLIGENCE LAB */}
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <CardHeader className="p-4 border-b bg-slate-50/70 dark:bg-slate-800/40 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                      📡
                    </div>
                    <div>
                      <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        Room 2: Intelligence Scout
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Trend &amp; Keyword Spy
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                    ● SCANNING
                  </Badge>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <p className="font-extrabold text-slate-800 dark:text-slate-200">
                      Live Discovery:
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Extracted target audience pain points. Forwarded high-intent
                      hooks across {selectedPlatforms.length} channels.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Consults → Copywriting Lead</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {selectedPlatforms.length} Hooks Exported
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* ROOM 3: CREATIVE STUDIO */}
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <CardHeader className="p-4 border-b bg-slate-50/70 dark:bg-slate-800/40 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                      🎨
                    </div>
                    <div>
                      <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        Room 3: Creative Studio
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Visual &amp; Video Production
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 text-[10px] font-bold">
                    ● RENDERING
                  </Badge>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <p className="font-extrabold text-slate-800 dark:text-slate-200">
                      Live Production Task:
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Rendered Carousel slides &amp; 9:16 Reels. Verified visual
                      branding against Brand DNA.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Consults → Publisher Lead</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">
                      {selectedPlatforms.length} Assets Rendered
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* ROOM 4: OPERATIONS & CTA ROOM */}
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <CardHeader className="p-4 border-b bg-slate-50/70 dark:bg-slate-800/40 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      🚀
                    </div>
                    <div>
                      <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        Room 4: Distribution Lead
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Publishing &amp; CTR Engine
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                    ● QUEUED
                  </Badge>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <p className="font-extrabold text-slate-800 dark:text-slate-200">
                      Live CTA Destination:
                    </p>
                    <p className="font-mono text-[11px] text-primary truncate bg-primary/5 p-1 rounded">
                      Synced from Brand DNA Profile
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Consults → CEO Orchestrator</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {selectedPlatforms.length} Channels Synced
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* BOARDROOM LIVE INTER-AGENT CONSULTATION LOG */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <CardHeader className="p-5 border-b bg-slate-50/60 dark:bg-slate-800/40">
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span>4. Live Squad Activity Log</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time transcript of autonomous agents collaborating and reporting to the CEO Orchestrator.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-3 font-mono text-xs">
              {boardroomLog.map((log, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      [{log.time}] • {log.from}{" "}
                      <span className="text-slate-400">→</span> {log.to}
                    </span>
                    <span className={log.color}>Verified</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 font-sans leading-relaxed text-xs">
                    {log.message}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
