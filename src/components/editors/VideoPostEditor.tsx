"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Upload,
  Video as VideoIcon,
  Play,
  Film,
  Trash2,
  Settings2,
  Wand2,
  Loader2,
  Hash,
  Info,
  Clock,
  CheckCircle2,
  Sliders,
  Eye,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";
import CharacterCounter from "@/components/CharacterCounter";

interface VideoPostEditorProps {
  capability: PlatformCapability;
  title: string;
  onTitleChange: (val: string) => void;
  caption: string;
  onCaptionChange: (val: string) => void;
  description?: string;
  onDescriptionChange?: (val: string) => void;
  hashtags: string[];
  onHashtagsChange: (tags: string[]) => void;
  firstComment: string;
  onFirstCommentChange: (val: string) => void;
  displayVideoUrl: string | null;
  onRemoveVideo: () => void;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  onRenderAIVideo: () => void;
  isRenderingVideo: boolean;
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  onCaptionToPrompt: () => void;
}

export default function VideoPostEditor({
  capability,
  title,
  onTitleChange,
  caption,
  onCaptionChange,
  description,
  onDescriptionChange,
  hashtags,
  onHashtagsChange,
  firstComment,
  onFirstCommentChange,
  displayVideoUrl,
  onRemoveVideo,
  onOpenUpload,
  onOpenStock,
  onRenderAIVideo,
  isRenderingVideo,
  onGenerateCopyAI,
  isGeneratingCopy,
  prompt,
  onPromptChange,
  onEnhancePrompt,
  isEnhancingPrompt,
  onCaptionToPrompt,
}: VideoPostEditorProps) {
  // Video Generation Settings (Strictly Gemini Omni Flash Specs)
  const [durationSec, setDurationSec] = useState<number>(5);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-omni-flash-preview");
  const isVertical = capability.defaultAspectRatio === "9:16";

  // TikTok / Shorts Settings
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [aiDisclosure, setAiDisclosure] = useState(true);
  const [privacy, setPrivacy] = useState("Public");

  return (
    <div className="space-y-6 text-left">
      {/* HEADER & ACTIONS */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-gradient-to-r from-red-500 via-pink-600 to-indigo-600 text-white font-bold text-xs uppercase px-2.5 py-0.5">
            {capability.label}
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            {isVertical ? "9:16 Vertical Video (Reels / Shorts / TikTok)" : "16:9 Widescreen Video"}
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={isGeneratingCopy}
          onClick={onGenerateCopyAI}
          className="h-8 text-xs font-bold gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white shadow-xs"
        >
          {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>Auto-Generate Video Script & Hook</span>
        </Button>
      </div>

      {/* TWO COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT: VIDEO PLAYER / PREVIEW (FORMAT ADAPTIVE) */}
        <div className="md:col-span-5 space-y-3">
          <div className={`relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-950 p-2 flex flex-col items-center justify-center overflow-hidden group shadow-md mx-auto ${
            isVertical ? "w-full max-w-[240px] aspect-[9/16]" : "w-full aspect-[16/9]"
          }`}>
            {displayVideoUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <VideoPreviewPlayer
                  src={displayVideoUrl}
                  className="w-full h-full object-cover rounded-xl"
                  isVertical={isVertical}
                  showAlwaysPlayButton={true}
                />
                <button
                  type="button"
                  onClick={onRemoveVideo}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors z-30"
                  title="Remove Video"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-center p-4 space-y-2.5">
                <Film className="h-9 w-9 text-slate-400 mx-auto opacity-60" />
                <div>
                  <p className="text-xs font-bold text-slate-200">
                    No Video Attached
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Generate cinematic AI video or upload MP4
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={onOpenUpload} className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-200">
                    <Upload className="h-3 w-3 mr-1 text-emerald-400" /> Upload
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={onOpenStock} className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-200">
                    <VideoIcon className="h-3 w-3 mr-1 text-pink-400" /> Stock
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isRenderingVideo}
                    onClick={onRenderAIVideo}
                    className="h-7 text-[11px] bg-gradient-to-r from-indigo-600 to-pink-600 text-white"
                  >
                    {isRenderingVideo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Gen
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* AI VIDEO ENGINE CONTROLS */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-indigo-600" />
                Video AI Engine Settings
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                720p HD Ready
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Duration</label>
                <select
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                >
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                    <option key={s} value={s}>{s} seconds</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Model Tier</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                >
                  <option value="gemini-omni-flash-preview">Gemini Omni Flash (Fast)</option>
                  <option value="veo-3.1-generate-001">Google Veo 3.1 (Cinematic)</option>
                </select>
              </div>
            </div>

            {/* VIDEO PROMPT */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Wand2 className="h-3 w-3 text-indigo-600" /> Video Motion Prompt
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCaptionToPrompt}
                    className="text-[10px] font-bold text-indigo-600 hover:underline"
                  >
                    Auto-Prompt from Script
                  </button>
                  <button
                    type="button"
                    disabled={isEnhancingPrompt}
                    onClick={onEnhancePrompt}
                    className="text-[10px] font-bold text-pink-600 hover:underline flex items-center gap-0.5"
                  >
                    {isEnhancingPrompt ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                    <span>Enhance ✨</span>
                  </button>
                </div>
              </div>

              <Textarea
                rows={2}
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="Cinematic motion, dynamic subject action, moody studio lighting..."
                className="w-full text-xs p-2 rounded-lg bg-white dark:bg-slate-900 font-mono"
              />

              <Button
                type="button"
                size="sm"
                disabled={isRenderingVideo}
                onClick={onRenderAIVideo}
                className="w-full h-8 text-xs font-bold gap-1 bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-xs"
              >
                {isRenderingVideo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                <span>Synthesize {durationSec}s AI Video</span>
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT: PLATFORM CONTENT FIELDS */}
        <div className="md:col-span-7 space-y-4">
          {/* TITLE (YOUTUBE / SHORTS) */}
          {capability.supportsTitle && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Video Title</label>
                {capability.titleLimit && <span className="text-[11px] text-slate-400 font-mono">{title.length} / {capability.titleLimit}</span>}
              </div>
              <Input
                value={title}
                maxLength={capability.titleLimit || 100}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Enter a high-CTR, curiosity-driven title..."
                className="h-10 text-sm font-semibold rounded-xl bg-white dark:bg-slate-900"
              />
            </div>
          )}

          {/* CAPTION / SCRIPT */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {capability.platform === "youtube" ? "Video Description & Timestamps" : "Post Caption & Video Hook Script"}
              </label>
              <CharacterCounter current={caption.length} max={capability.captionLimit} />
            </div>
            <Textarea
              rows={5}
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Start with a 1-second visual hook, deliver core value, and close with CTA..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>

          {/* HASHTAGS & FIRST COMMENT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {capability.supportsHashtags && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5 text-pink-500" /> Video Hashtags
                </label>
                <Input
                  value={hashtags.join(" ")}
                  onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
                  placeholder="#reels #shorts #tiktok #viral"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
              </div>
            )}

            {capability.supportsFirstComment && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-500" /> Auto First Comment
                </label>
                <Input
                  value={firstComment}
                  onChange={(e) => onFirstCommentChange(e.target.value)}
                  placeholder="Drop a comment or link..."
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
              </div>
            )}
          </div>

          {/* TIKTOK NATIVE CONTROLS */}
          {capability.platform === "tiktok" && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5 text-xs">
              <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider block text-[11px]">
                TikTok Content & Privacy Settings
              </span>
              <div className="flex items-center justify-between">
                <span>AI-Generated Content Disclosure</span>
                <input
                  type="checkbox"
                  checked={aiDisclosure}
                  onChange={(e) => setAiDisclosure(e.target.checked)}
                  className="h-4 w-4 rounded text-pink-600 focus:ring-pink-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Allow Duet</span>
                <input
                  type="checkbox"
                  checked={allowDuet}
                  onChange={(e) => setAllowDuet(e.target.checked)}
                  className="h-4 w-4 rounded text-pink-600 focus:ring-pink-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Allow Stitch</span>
                <input
                  type="checkbox"
                  checked={allowStitch}
                  onChange={(e) => setAllowStitch(e.target.checked)}
                  className="h-4 w-4 rounded text-pink-600 focus:ring-pink-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
