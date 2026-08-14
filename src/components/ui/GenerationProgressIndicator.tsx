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
    <div className="flex flex-col items-center justify-center p-4 text-center space-y-3 w-full h-full">
      {/* SVG CIRCULAR PROGRESS WITH PERCENTAGE */}
      <div className="relative flex items-center justify-center">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 96 96">
          {/* Background circle track */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            className="text-slate-800/80"
            fill="transparent"
          />
          {/* Active progress stroke */}
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
            className="transition-all duration-300 ease-out"
            style={{
              filter: `drop-shadow(0 0 6px ${currentTheme.glow})`,
            }}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-white tracking-tight font-mono">
            {clampedProgress}%
          </span>
        </div>
      </div>

      {/* STAGE & STATUS TEXT */}
      <div className="space-y-1 max-w-[220px]">
        <p className="text-xs font-bold text-white tracking-wide">
          {title}
        </p>
        <p className="text-[11px] text-slate-400 leading-snug min-h-[28px] transition-all">
          {stage || "Synthesizing visual frames..."}
        </p>
      </div>

      {/* LINEAR PROGRESS BAR */}
      <div className="w-full max-w-[180px] bg-slate-800/80 h-1.5 rounded-full overflow-hidden p-[1px]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${currentTheme.barGrad} transition-all duration-300 ease-out`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
