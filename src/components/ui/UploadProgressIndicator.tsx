"use client";

import React from "react";
import { UploadCloud, Film, Loader2 } from "lucide-react";

interface UploadProgressIndicatorProps {
  progress?: number; // 0 to 100
  fileName?: string;
  isVertical?: boolean;
  mediaType?: "video" | "image";
  transferredMB?: string;
  totalMB?: string;
}

export default function UploadProgressIndicator({
  progress = 0,
  fileName,
  isVertical = false,
  mediaType = "video",
  transferredMB,
  totalMB,
}: UploadProgressIndicatorProps) {
  const isVideo = mediaType === "video";
  const clampedProgress = Math.min(Math.max(Math.round(progress), 0), 100);

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center p-4 text-center select-none animate-in fade-in duration-300 ${
        isVertical ? "space-y-3 max-w-[190px]" : "space-y-2.5 max-w-[280px]"
      }`}
    >
      {/* GLOWING ICON CONTAINER */}
      <div className="relative">
        <div className="absolute -inset-2 bg-emerald-500/20 rounded-full blur-md animate-pulse" />
        <div className="relative w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg">
          {isVideo ? (
            <Film className="h-6 w-6 animate-bounce" />
          ) : (
            <UploadCloud className="h-6 w-6 animate-bounce" />
          )}
        </div>
      </div>

      {/* HEADER & TITLES */}
      <div className="space-y-0.5 w-full">
        <div className="flex items-center justify-center gap-1.5 text-emerald-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs font-bold tracking-tight">
            Uploading {isVideo ? "Video" : "Image"}...
          </span>
        </div>
        {fileName && (
          <p className="text-[10px] text-slate-300 font-mono truncate max-w-full px-2" title={fileName}>
            {fileName}
          </p>
        )}
      </div>

      {/* PERCENTAGE & PROGRESS BAR */}
      <div className="w-full space-y-1.5 px-2">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-slate-400 text-[10px]">Progress</span>
          <span className="text-emerald-400 font-mono text-xs">{clampedProgress}%</span>
        </div>

        {/* PROGRESS TRACK */}
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full transition-all duration-200 ease-out shadow-sm"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>

        {/* MB TRANSFERRED / STATUS */}
        <div className="text-[10px] text-slate-400 font-medium">
          {transferredMB && totalMB ? (
            <span>{transferredMB} MB / {totalMB} MB</span>
          ) : (
            <span>Uploading to cloud storage, please wait...</span>
          )}
        </div>
      </div>

      {/* SUB-NOTE */}
      <p className="text-[9px] text-slate-500 leading-tight">
        Syncs automatically across matching platform formats
      </p>
    </div>
  );
}
