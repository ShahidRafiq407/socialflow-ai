"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Upload,
  Video as VideoIcon,
  Film,
  Trash2,
  Settings2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Download,
  Sliders,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";
import ContentMediaRenderer from "@/components/ui/ContentMediaRenderer";
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
  videoStatus?: "idle" | "queued" | "processing" | "completed" | "failed";
  videoError?: string | null;
  onRemoveVideo: () => void;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  onRenderAIVideo: (options?: {
    mediaType?: "image" | "video";
    duration?: number;
    prompt?: string;
    aspectRatio?: string;
    videoTask?: string;
    sourceImage?: string | null;
    sourceVideo?: string | null;
  }) => void;
  isRenderingVideo: boolean;
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt?: () => void;
  isEnhancingPrompt?: boolean;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
  durationSec: number;
  onDurationChange: (duration: number) => void;
  generationProgress?: number;
  generationStage?: string;
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
  videoStatus = "idle",
  videoError = null,
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
  isEnhancingPrompt = false,
  onCaptionToPrompt,
  isGeneratingPromptFromScript = false,
  durationSec,
  onDurationChange,
  generationProgress = 0,
  generationStage = "Synthesizing cinematic motion...",
}: VideoPostEditorProps) {
  const isVertical = capability.defaultAspectRatio === "9:16";
  const hasCaption = Boolean(caption && caption.trim().length > 0);

  // Model settings state
  const [videoModel, setVideoModel] = useState<string>("gemini-omni-flash");
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>("auto");
  const [videoTask, setVideoTask] = useState<string>("auto");
  const [attachedSourceImage, setAttachedSourceImage] = useState<string | null>(null);

  const handleDownloadVideo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!displayVideoUrl) return;
    try {
      const filename = `${capability.platform}_${capability.format}_${Date.now()}.mp4`;
      if (displayVideoUrl.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = displayVideoUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      const response = await fetch(displayVideoUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(displayVideoUrl, "_blank");
    }
  };

  // TikTok / Shorts Settings
  const [allowDuet, setAllowDuet] = React.useState(true);
  const [allowStitch, setAllowStitch] = React.useState(true);
  const [aiDisclosure, setAiDisclosure] = React.useState(true);

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
        {/* LEFT: VIDEO PLAYER / PREVIEW + VIDEO CONTROLS */}
        <div className="md:col-span-5 space-y-4">
          {/* VIDEO PREVIEW FRAME */}
          <div
            className={`relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-950 p-2 flex flex-col items-center justify-center overflow-hidden group shadow-md mx-auto ${
              isVertical ? "w-full max-w-[240px] aspect-[9/16]" : "w-full aspect-[16/9]"
            }`}
          >
            {isRenderingVideo ? (
              <GenerationProgressIndicator
                progress={generationProgress}
                stage={generationStage}
                title={`Generating ${durationSec}s Video`}
                isVertical={isVertical}
                accentColor="indigo"
                mediaType="video"
              />
            ) : videoStatus === "failed" ? (
              <div className="text-center p-4 space-y-2.5">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-red-300">Video generation failed</p>
                  <p className="text-[10px] text-slate-400 line-clamp-2">{videoError || "Synthesis could not be completed."}</p>
                </div>
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onRenderAIVideo({ mediaType: "video", duration: durationSec, prompt })}
                    className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white font-bold"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Retry
                  </Button>
                </div>
              </div>
            ) : displayVideoUrl ? (
              <ContentMediaRenderer
                url={displayVideoUrl}
                mediaType="video"
                isVertical={isVertical}
                onRemove={onRemoveVideo}
                alt={`${capability.label} video preview`}
              />
            ) : (
              <div className="text-center p-4 space-y-2.5">
                <Film className="h-9 w-9 text-slate-400 mx-auto opacity-60" />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5">
                    Video Preview
                  </span>
                  <p className="text-xs font-bold text-slate-200">No video generated yet</p>
                </div>

                <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenUpload}
                    className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-200"
                  >
                    <Upload className="h-3 w-3 mr-1 text-emerald-400" /> Upload PC
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenStock}
                    className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-200"
                  >
                    <VideoIcon className="h-3 w-3 mr-1 text-pink-400" /> Stock Media
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* SAVE / DOWNLOAD TO PC BUTTON WHEN VIDEO AVAILABLE */}
          {displayVideoUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadVideo}
              className="w-full text-xs font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center gap-1.5 h-8.5 rounded-xl shadow-2xs transition-all"
            >
              <Download className="h-4 w-4" /> Save Video to PC (.mp4)
            </Button>
          )}

          {/* MODEL SETTINGS (GOOGLE CLOUD STUDIO ALIGNED) */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-slate-800">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-indigo-600" />
                Model settings
              </span>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full font-mono">
                {videoAspectRatio !== "auto" ? videoAspectRatio : capability.defaultAspectRatio}
              </span>
            </div>

            {/* 1. Model Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                Model
              </label>
              <select
                value={videoModel}
                onChange={(e) => setVideoModel(e.target.value)}
                className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="gemini-omni-flash">Gemini Omni Flash</option>
              </select>
            </div>

            {/* 2. Aspect Ratio Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                Aspect ratio
              </label>
              <select
                value={videoAspectRatio}
                onChange={(e) => setVideoAspectRatio(e.target.value)}
                className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>

            {/* 3. Video Task Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                Video task
              </label>
              <select
                value={videoTask}
                onChange={(e) => {
                  setVideoTask(e.target.value);
                  if (e.target.value === "text_to_video") {
                    setAttachedSourceImage(null);
                  }
                }}
                className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="text_to_video">Text to video</option>
                <option value="image_to_video">Image to video</option>
                <option value="reference_to_video">Reference to video</option>
                <option value="edit">Edit</option>
              </select>
            </div>

            {/* 4. Duration Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                Duration
              </label>
              <select
                value={durationSec}
                onChange={(e) => onDurationChange(Number(e.target.value))}
                className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
              >
                {[3, 4, 5, 6, 7, 8, 9, 10, 15, 30].map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* UNIFIED PROMPT & REAL TASK ATTACHMENT SECTION */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Prompt
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isGeneratingPromptFromScript || !hasCaption}
                  onClick={onCaptionToPrompt}
                  title={hasCaption ? "Generate video prompt from current caption" : "Please enter a caption first"}
                  className={`text-[11px] font-semibold transition-colors ${
                    hasCaption
                      ? "text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                      : "text-slate-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  {isGeneratingPromptFromScript ? (
                    <span className="flex items-center gap-1 text-indigo-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Generating...
                    </span>
                  ) : (
                    "Auto-Prompt from Caption"
                  )}
                </button>
                <button
                  type="button"
                  disabled={isEnhancingPrompt || !prompt || !prompt.trim()}
                  onClick={onEnhancePrompt}
                  className={`text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    isEnhancingPrompt
                      ? "text-pink-400 cursor-wait opacity-80"
                      : !prompt || !prompt.trim()
                      ? "text-slate-400 cursor-not-allowed opacity-50"
                      : "text-pink-600 hover:text-pink-700 hover:underline cursor-pointer"
                  }`}
                >
                  {isEnhancingPrompt ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-pink-500" />
                      <span>Enhancing Prompt...</span>
                    </>
                  ) : (
                    <span>Enhance Prompt ✨</span>
                  )}
                </button>
              </div>
            </div>

            {/* REAL TASK SOURCE ATTACHMENT */}
            {(videoTask === "image_to_video" || videoTask === "reference_to_video") && (
              <div className="p-2.5 rounded-lg border border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                  <span className="flex items-center gap-1">
                    <Film className="h-3.5 w-3.5" /> Source Image for Image-to-Video
                  </span>
                  {attachedSourceImage && (
                    <button
                      type="button"
                      onClick={() => setAttachedSourceImage(null)}
                      className="text-red-500 hover:underline text-[10px]"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {attachedSourceImage ? (
                  <div className="flex items-center gap-2">
                    <img src={attachedSourceImage} alt="Source for video" className="h-12 w-12 object-cover rounded-md border border-indigo-300 dark:border-indigo-700" />
                    <span className="text-[10px] text-slate-500 font-mono">Image attached for animation</span>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      id="source-image-upload"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => setAttachedSourceImage(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <label
                      htmlFor="source-image-upload"
                      className="cursor-pointer flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-indigo-400 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" /> Upload Image to Animate into Video
                    </label>
                  </div>
                )}
              </div>
            )}

            {videoTask === "edit" && (
              <div className="p-2 rounded-lg border border-pink-500/30 bg-pink-50/50 dark:bg-pink-950/20 text-[11px] font-medium text-pink-700 dark:text-pink-300 flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5" />
                {displayVideoUrl
                  ? "Editing active video stream. Type instructions below (e.g. adjust lighting, camera angle, action)."
                  : "No video generated yet. Upload or generate a video first to use the Edit task."}
              </div>
            )}

            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={
                videoTask === "image_to_video"
                  ? "Describe how this source image should animate and move in 9:16 vertical video..."
                  : videoTask === "edit"
                  ? "Describe modifications to the current video (e.g. increase motion speed, dramatic cinematic lighting)..."
                  : "Describe 9:16 vertical video scene, subject action, camera movement, cinematic lighting, and 1-2s hook..."
              }
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 font-mono leading-relaxed"
            />

            <Button
              type="button"
              size="sm"
              disabled={isRenderingVideo || !prompt.trim()}
              onClick={() =>
                onRenderAIVideo({
                  mediaType: "video",
                  duration: durationSec,
                  prompt,
                  aspectRatio: videoAspectRatio !== "auto" ? videoAspectRatio : capability.defaultAspectRatio,
                  videoTask,
                  sourceImage: attachedSourceImage,
                  sourceVideo: videoTask === "edit" ? displayVideoUrl : null,
                })
              }
              className="w-full h-9 text-xs font-bold gap-1.5 bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-xs hover:opacity-90"
            >
              {isRenderingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isRenderingVideo ? "Generating Video..." : `Generate ${durationSec}s Video`}</span>
            </Button>
          </div>
        </div>

        {/* RIGHT: PLATFORM CONTENT FIELDS */}
        <div className="md:col-span-7 space-y-4">
          {/* TITLE (YOUTUBE / SHORTS) */}
          {capability.supportsTitle && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Video Title</label>
                {capability.titleLimit && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    {title.length} / {capability.titleLimit}
                  </span>
                )}
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
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Hashtags
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
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  First Comment
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
