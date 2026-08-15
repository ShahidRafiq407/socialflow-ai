"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Cpu, Layers, ShieldCheck, Film, Image as ImageIcon, Loader2 } from "lucide-react";

interface GenerationProgressIndicatorProps {
  progress?: number; // Real progress: 0 to 100. If 0 or undefined, treated as honest indeterminate state
  stage?: string;
  title?: string;
  isVertical?: boolean;
  accentColor?: "indigo" | "pink" | "red" | "emerald";
  mediaType?: "video" | "image" | "carousel" | "ideapin" | "document";
}

const AGENT_STAGES_VIDEO = [
  { agent: "Visualizer Agent", action: "Analyzing prompt scene dynamics, subject action & camera motion...", icon: Film },
  { agent: "Video Synthesis Engine", action: "Synthesizing vertical 9:16 high-fps motion frames...", icon: Cpu },
  { agent: "Lighting & Colorist", action: "Balancing cinematic lighting, volumetric depth & color grade...", icon: Sparkles },
  { agent: "CEO Auditor Agent", action: "Inspecting frame consistency & stream integrity...", icon: ShieldCheck },
  { agent: "Media Pipeline", action: "Finalizing and packaging video asset...", icon: Layers },
];

const AGENT_STAGES_IMAGE = [
  { agent: "Visualizer Agent", action: "Analyzing scene composition, focal depth & brand DNA...", icon: ImageIcon },
  { agent: "Image Synthesis Engine", action: "Rendering photorealistic lighting, textures & high-res layers...", icon: Cpu },
  { agent: "Colorist & Enhancer", action: "Applying HDR color balance & aesthetic tone mapping...", icon: Sparkles },
  { agent: "CEO Auditor Agent", action: "Validating format resolution & aspect ratio compliance...", icon: ShieldCheck },
];

const AGENT_STAGES_CAROUSEL = [
  { agent: "Carousel Planner", action: "Structuring educational infographic narrative & step hierarchy...", icon: Layers },
  { agent: "Visualizer Agent", action: "Synthesizing visual canvases with clean composition space...", icon: ImageIcon },
  { agent: "Content Designer", action: "Formatting typography badges, key insights & takeaways...", icon: Sparkles },
  { agent: "CEO Auditor Agent", action: "Auditing multi-slide storyboard consistency & packaging...", icon: ShieldCheck },
];

export default function GenerationProgressIndicator({
  progress = 0,
  stage,
  title = "Generating Media...",
  isVertical = false,
  accentColor = "indigo",
  mediaType,
}: GenerationProgressIndicatorProps) {
  const isVideo = mediaType === "video" || title.toLowerCase().includes("video");
  const isMultiSlide =
    mediaType === "carousel" ||
    mediaType === "ideapin" ||
    mediaType === "document" ||
    title.toLowerCase().includes("slide") ||
    title.toLowerCase().includes("carousel");

  const stageList = isVideo ? AGENT_STAGES_VIDEO : isMultiSlide ? AGENT_STAGES_CAROUSEL : AGENT_STAGES_IMAGE;

  // Track active agent cycle for descriptive visual feedback without faking percentages
  const [currentStageIdx, setCurrentStageIdx] = useState(0);

  useEffect(() => {
    // Slowly rotate agent badge context every 3.5s for honest informational stages
    const interval = setInterval(() => {
      setCurrentStageIdx((prev) => (prev + 1) % stageList.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [stageList.length]);

  const activeStage = stageList[currentStageIdx] || stageList[0];
  const ActiveIcon = activeStage.icon;
  const currentActionText = stage && stage.trim() ? stage : activeStage.action;

  // Determine whether we have explicit numeric progress or indeterminate state
  const hasRealNumericProgress = typeof progress === "number" && progress > 0 && progress <= 100;
  const clampedProgress = Math.min(Math.max(Math.round(progress), 0), 100);

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = hasRealNumericProgress
    ? circumference - (clampedProgress / 100) * circumference
    : circumference * 0.7;

  const colorMap = {
    indigo: {
      stroke: "#6366f1",
      glow: "rgba(99, 102, 241, 0.5)",
      badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      barGrad: "from-indigo-500 via-purple-500 to-pink-500",
      ringGlow: "ring-indigo-500/30",
    },
    pink: {
      stroke: "#ec4899",
      glow: "rgba(236, 72, 153, 0.5)",
      badgeBg: "bg-pink-500/20 text-pink-300 border-pink-500/40",
      barGrad: "from-pink-500 via-rose-500 to-amber-500",
      ringGlow: "ring-pink-500/30",
    },
    red: {
      stroke: "#e11d48",
      glow: "rgba(225, 29, 72, 0.5)",
      badgeBg: "bg-red-500/20 text-red-300 border-red-500/40",
      barGrad: "from-red-500 via-orange-500 to-amber-500",
      ringGlow: "ring-red-500/30",
    },
    emerald: {
      stroke: "#10b981",
      glow: "rgba(16, 185, 129, 0.5)",
      badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      barGrad: "from-emerald-500 via-teal-500 to-cyan-500",
      ringGlow: "ring-emerald-500/30",
    },
  };

  const currentTheme = colorMap[accentColor] || colorMap.indigo;

  return (
    <div className="relative flex flex-col items-center justify-center p-6 text-center space-y-4 w-full h-full bg-slate-950/95 text-white rounded-2xl shadow-2xl backdrop-blur-md border border-slate-800/80 z-20 overflow-hidden">
      {/* BACKGROUND AMBIENT GLOW */}
      <div
        className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: currentTheme.stroke }}
      />

      {/* SVG CIRCULAR LOADER / PROGRESS */}
      <div className="relative flex items-center justify-center">
        <svg
          className={`w-24 h-24 transform -rotate-90 ${!hasRealNumericProgress ? "animate-spin [animation-duration:2.5s]" : ""}`}
          viewBox="0 0 96 96"
        >
          {/* Background circle track */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            className="text-slate-800/90"
            fill="transparent"
          />
          {/* Active stroke */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke={currentTheme.stroke}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-500 ease-out"
            style={{
              filter: `drop-shadow(0 0 10px ${currentTheme.glow})`,
            }}
          />
        </svg>

        {/* Center Indicator (Real Percentage or Animated AI Icon) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hasRealNumericProgress ? (
            <span className="text-xl font-black text-white tracking-tight font-mono drop-shadow-md">
              {clampedProgress}%
            </span>
          ) : (
            <Sparkles className="h-6 w-6 text-white animate-pulse" />
          )}
        </div>
      </div>

      {/* ACTIVE AGENT BADGE */}
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${currentTheme.badgeBg} shadow-xs transition-opacity duration-300`}
      >
        <ActiveIcon className="h-3 w-3 animate-pulse" />
        <span>{activeStage.agent}</span>
      </div>

      {/* STAGE & STATUS TEXT */}
      <div className="space-y-1 max-w-[260px]">
        <p className="text-xs font-black text-white tracking-wider uppercase drop-shadow-sm">
          {title}
        </p>
        <p className="text-xs text-slate-200 font-medium leading-relaxed min-h-[36px] transition-all duration-300 drop-shadow-sm">
          {currentActionText}
        </p>
      </div>

      {/* PROGRESS BAR (Indeterminate pulse or exact progress) */}
      <div className="w-full max-w-[210px] bg-slate-800/90 h-2 rounded-full overflow-hidden p-[1px] shadow-inner relative">
        {hasRealNumericProgress ? (
          <div
            className={`h-full rounded-full bg-gradient-to-r ${currentTheme.barGrad} transition-all duration-500 ease-out shadow-sm`}
            style={{ width: `${clampedProgress}%` }}
          />
        ) : (
          <div
            className={`h-full w-2/3 rounded-full bg-gradient-to-r ${currentTheme.barGrad} animate-pulse shadow-sm`}
          />
        )}
      </div>
    </div>
  );
}
