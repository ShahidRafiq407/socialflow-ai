"use client";

import React from "react";
import { Loader2, ScanSearch, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelAIAction } from "@/lib/aiActionEvents";

interface AnalyzeMediaAIButtonProps {
  /** `${platform}-${format}` key used to route the stop signal */
  formatKey: string;
  onClick: () => void;
  isAnalyzing: boolean;
  hasMedia: boolean;
  /** Hide text generation when the format publishes no text fields at all (e.g. Instagram Story) */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * "Analyze Uploaded Media with AI" — sends the attached image/video to the
 * vision model and fills the editor's caption / hashtags / alt text fields
 * with text that matches what is actually shown in the media.
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
  const effectiveDisabled = disabled || (!hasMedia && !isAnalyzing);
  const title = isAnalyzing
    ? "Stop media analysis"
    : disabled
    ? disabledReason || "Not available for this format"
    : hasMedia
    ? "Let AI analyze the attached image/video and generate a matching caption, hashtags and more"
    : "Upload or generate an image/video first, then AI can analyze it and write matching text";

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
          <span>Analyze Uploaded Media with AI (Caption & More)</span>
        </>
      )}
    </Button>
  );
}

/** Small stop square icon re-exported for consistency in mini buttons. */
export function StopIcon() {
  return <Square className="h-3 w-3 fill-current" />;
}
