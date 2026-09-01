"use client";

import React from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelAIAction } from "@/lib/aiActionEvents";

interface AnalyzeMediaAIButtonProps {
  /** `${platform}-${format}` key used to route the stop signal */
  formatKey: string;
  onClick: () => void;
  isAnalyzing: boolean;
  /** TRUE only when the current slot holds confirmed user media (local upload / stock) */
  hasMedia: boolean;
  /** Disable text generation when the format publishes no text fields at all (e.g. Instagram Story) */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * "Analyze Uploaded Media with AI" — hidden until the slot holds confirmed
 * LOCAL/STOCK media. Sends the image/video to the vision model (videos are
 * sent with audio for transcription) and fills the editor's caption /
 * hashtags / alt text fields with text matching the actual media content.
 * While analyzing, the button turns into a Stop control.
 */
export default function AnalyzeMediaAIButton({
  formatKey,
  onClick,
  isAnalyzing,
  hasMedia,
  disabled = false,
  disabledReason,
}: AnalyzeMediaAIButtonProps) {
  // Hidden unless confirmed user-provided media exists (or analysis is running)
  if (!hasMedia && !isAnalyzing) return null;

  const effectiveDisabled = disabled;
  const title = isAnalyzing
    ? "Stop media analysis"
    : disabled
    ? disabledReason || "Not available for this format"
    : "AI analyzes the uploaded image/video (including its voice) and writes a matching caption, hashtags and more";

  return (
    <Button
      type="button"
      size="sm"
      disabled={effectiveDisabled && !isAnalyzing}
      onClick={() => {
        if (isAnalyzing) {
          cancelAIAction("analyze", formatKey);
          return;
        }
        if (!effectiveDisabled) onClick();
      }}
      title={title}
      className={`w-full h-auto min-h-8 px-3 py-1.5 text-xs font-bold gap-1.5 shadow-2xs rounded-lg whitespace-normal transition-colors ${
        isAnalyzing
          ? "bg-red-500 hover:bg-red-600 text-white dark:bg-red-600 dark:hover:bg-red-700"
          : effectiveDisabled
          ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
          : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white"
      }`}
    >
      {isAnalyzing ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Stop Analyzing Media</span>
        </>
      ) : (
        <>
          <ScanSearch className="h-3.5 w-3.5" />
          <span>Analyze Uploaded Media with AI (Caption &amp; More)</span>
        </>
      )}
    </Button>
  );
}
