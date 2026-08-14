"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface GenerationProgressIndicatorProps {
  progress: number; // 0 to 100
  stage: string;
  title?: string;
  isVertical?: boolean;
  accentColor?: "indigo" | "pink" | "red" | "emerald";
}

export default function GenerationProgressIndicator({
  progress,
  stage,
  title = "Generating Media...",
  isVertical = false,
  accentColor = "indigo",
}: GenerationProgressIndicatorProps) {
  const clampedProgress = Math.min(Math.max(Math.round(progress), 0), 100);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  const colorMap = {
    indigo: {
      stroke: "#6366f1",
      glow: "rgba(99, 102, 241, 0.4)",
      badgeBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
      barGrad: "from-indigo-500 via-purple-500 to-pink-500",
    },
    pink: {
      stroke: "#ec4899",
      glow: "rgba(236, 72, 153, 0.4)",
      badgeBg: "bg-pink-500/10 text-pink-400 border-pink-500/30",
      barGrad: "from-pink-500 via-rose-500 to-amber-500",
    },
    red: {
      stroke: "#e11d48",
      glow: "rgba(225, 29, 72, 0.4)",
      badgeBg: "bg-red-500/10 text-red-400 border-red-500/30",
      barGrad: "from-red-500 via-orange-500 to-amber-500",
    },
    emerald: {
      stroke: "#10b981",
      glow: "rgba(16, 185, 129, 0.4)",
      badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      barGrad: "from-emerald-500 via-teal-500 to-cyan-500",
    },
  };

  const currentTheme = colorMap[accentColor] || colorMap.indigo;

  return (
    <div className="relative flex flex-col items-center justify-center p-6 text-center space-y-3.5 w-full h-full bg-slate-950/95 text-white rounded-2xl shadow-2xl backdrop-blur-md border border-slate-800/80 z-20">
      {/* SVG CIRCULAR PROGRESS WITH PERCENTAGE */}
      <div className="relative flex items-center justify-center">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 96 96">
          {/* Background circle track */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="7"
            className="text-slate-800/90"
            fill="transparent"
          />
          {/* Active progress stroke */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke={currentTheme.stroke}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-300 ease-out"
            style={{
              filter: `drop-shadow(0 0 8px ${currentTheme.glow})`,
            }}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black text-white tracking-tight font-mono drop-shadow-md">
            {clampedProgress}%
          </span>
        </div>
      </div>

      {/* STAGE & STATUS TEXT */}
      <div className="space-y-1 max-w-[240px]">
        <p className="text-xs font-black text-white tracking-wider uppercase drop-shadow-sm">
          {title}
        </p>
        <p className="text-xs text-slate-200 font-medium leading-snug min-h-[32px] transition-all drop-shadow-sm">
          {stage || "Synthesizing visual frames..."}
        </p>
      </div>

      {/* LINEAR PROGRESS BAR */}
      <div className="w-full max-w-[200px] bg-slate-800/90 h-2 rounded-full overflow-hidden p-[1px] shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${currentTheme.barGrad} transition-all duration-300 ease-out shadow-sm`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
