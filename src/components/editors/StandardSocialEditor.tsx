"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Upload,
  ImageIcon,
  Video as VideoIcon,
  Settings2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";
import ContentMediaRenderer, { isMediaVideo } from "@/components/ui/ContentMediaRenderer";

interface StandardSocialEditorProps {
  capability: PlatformCapability;
  caption: string;
  onCaptionChange: (val: string) => void;
  hashtags: string[];
  onHashtagsChange: (tags: string[]) => void;
  firstComment: string;
  onFirstCommentChange: (val: string) => void;
  altText: string;
  onAltTextChange: (val: string) => void;
  displayImageUrl: string | null;
  onRemoveMedia: () => void;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  onRenderAI: (options?: {
    mediaType?: "image" | "video";
    duration?: number;
    prompt?: string;
    aspectRatio?: string;
    style?: string;
    quality?: string;
    imageModel?: string;
  }) => void;
  isRenderingMedia: boolean;
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
  videoStatus?: "idle" | "queued" | "processing" | "completed" | "failed";
  videoError?: string | null;
  durationSec?: number;
  onDurationChange?: (sec: number) => void;
  generationProgress?: number;
  generationStage?: string;
}

export default function StandardSocialEditor({
  capability,
  caption,
  onCaptionChange,
  hashtags,
  onHashtagsChange,
  firstComment,
  onFirstCommentChange,
  altText,
  onAltTextChange,
  displayImageUrl,
  onRemoveMedia,
  onOpenUpload,
  onOpenStock,
  onRenderAI,
  isRenderingMedia,
  onGenerateCopyAI,
  isGeneratingCopy,
  prompt,
  onPromptChange,
  onEnhancePrompt,
  isEnhancingPrompt,
  onCaptionToPrompt,
  isGeneratingPromptFromScript = false,
  videoStatus = "idle",
  videoError = null,
  durationSec = 5,
  onDurationChange,
  generationProgress = 0,
  generationStage = "Rendering media canvas...",
}: StandardSocialEditorProps) {
  const isVertical = capability.defaultAspectRatio === "9:16";
  const isSquare = capability.defaultAspectRatio === "1:1";
  const isFourFive = capability.defaultAspectRatio === "4:5";
  const hasCaption = Boolean(caption && caption.trim().length > 0);

  // Model settings for image synthesis (Google Cloud Nano Banana Pro / gemini-3-pro-image)
  const [imageAspectRatio, setImageAspectRatio] = useState<string>("auto");
  const [imageStyle, setImageStyle] = useState<string>("photorealistic");
  const [imageQuality, setImageQuality] = useState<string>("studio_4k");

  // For formats supporting both Image and Video (such as Instagram Story)
  const supportsBothMedia = capability.supportsAIVideo && capability.supportsAIImage;
  const [selectedMediaType, setSelectedMediaType] = useState<"image" | "video">(
    capability.mediaType === "video" ? "video" : "image"
  );
  const [videoDuration, setVideoDuration] = useState(durationSec || 5);

  const handleDurationSelect = (sec: number) => {
    setVideoDuration(sec);
    if (onDurationChange) onDurationChange(sec);
  };

  const handleTriggerGenerate = () => {
    const isVid = supportsBothMedia ? selectedMediaType === "video" : capability.mediaType === "video";
    if (isVid) {
      onRenderAI({
        mediaType: "video",
        duration: videoDuration,
        prompt,
      });
    } else {
      onRenderAI({
        mediaType: "image",
        prompt,
        aspectRatio: imageAspectRatio === "auto" ? capability.defaultAspectRatio : imageAspectRatio,
        style: imageStyle,
        quality: imageQuality,
        imageModel: "gemini-3-pro-image",
      });
    }
  };

  const mediaTitle = capability.format === "Story"
    ? `Story ${selectedMediaType === "video" ? "Video" : "Image"}`
    : isVertical
    ? "Vertical Media"
    : isSquare
    ? "Square Image"
    : "Image";

  return (
    <div className="space-y-6 text-left">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-bold text-xs uppercase px-2.5 py-0.5 border-slate-300 dark:border-slate-700">
            {capability.label}
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            {capability.format} ({capability.defaultAspectRatio} Aspect Ratio)
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={isGeneratingCopy}
          onClick={onGenerateCopyAI}
          className="h-8 text-xs font-bold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:opacity-90 text-white shadow-xs"
        >
          {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>Generate Caption with AI</span>
        </Button>
      </div>

      {/* TWO COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT: MEDIA PREVIEW & UNIFIED PROMPT SECTION */}
        <div className="md:col-span-5 space-y-4">
          {/* MEDIA PREVIEW CONTAINER */}
          <div
            className={`relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center overflow-hidden group shadow-2xs mx-auto ${
              isVertical
                ? "w-full max-w-[240px] aspect-[9/16]"
                : isSquare
                ? "w-full aspect-square max-w-[280px]"
                : isFourFive
                ? "w-full aspect-[4/5] max-w-[280px]"
                : "w-full aspect-[16/9]"
            }`}
          >
            {isRenderingMedia ? (
              <GenerationProgressIndicator
                progress={generationProgress}
                stage={generationStage}
                title={`Generating ${mediaTitle}...`}
                isVertical={isVertical}
                accentColor={selectedMediaType === "video" ? "pink" : "indigo"}
                mediaType={selectedMediaType === "video" ? "video" : "image"}
              />
            ) : videoStatus === "failed" && selectedMediaType === "video" ? (
              <div className="text-center p-4 space-y-2.5">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-red-400">Generation failed</p>
                  <p className="text-[10px] text-slate-400 line-clamp-2">{videoError || "Synthesis failed."}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleTriggerGenerate}
                  className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              </div>
            ) : displayImageUrl ? (
              <ContentMediaRenderer
                url={displayImageUrl}
                isVertical={isVertical}
                onRemove={onRemoveMedia}
                alt={`${capability.format} preview`}
              />
            ) : (
              <div className="text-center p-4 space-y-2.5">
                {selectedMediaType === "video" ? (
                  <VideoIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                )}
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5">
                    {capability.format} Preview
                  </span>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    No media attached yet
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenUpload}
                    className="h-7 text-[11px] bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  >
                    <Upload className="h-3 w-3 mr-1 text-emerald-500" /> Upload PC
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenStock}
                    className="h-7 text-[11px] bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  >
                    {selectedMediaType === "video" ? (
                      <VideoIcon className="h-3 w-3 mr-1 text-pink-500" />
                    ) : (
                      <ImageIcon className="h-3 w-3 mr-1 text-pink-500" />
                    )}
                    Stock Media
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* SAVE / DOWNLOAD TO PC BUTTON WHEN MEDIA AVAILABLE */}
          {displayImageUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const ext = selectedMediaType === "video" || isMediaVideo(displayImageUrl) ? "mp4" : "png";
                  const filename = `${capability.platform}_${capability.format}_${Date.now()}.${ext}`;
                  if (displayImageUrl.startsWith("data:")) {
                    const a = document.createElement("a");
                    a.href = displayImageUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    return;
                  }
                  const res = await fetch(displayImageUrl);
                  const blob = await res.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = blobUrl;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
                } catch (err) {
                  window.open(displayImageUrl, "_blank");
                }
              }}
              className="w-full text-xs font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center gap-1.5 h-8.5 rounded-xl shadow-2xs transition-all"
            >
              <Download className="h-4 w-4" /> Save Media to PC ({selectedMediaType === "video" || isMediaVideo(displayImageUrl) ? ".mp4" : ".png"})
            </Button>
          )}

          {/* DUAL MEDIA TYPE SELECTOR (FOR STORY FORMATS) */}
          {supportsBothMedia && (
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Media Type
                </span>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full font-mono">
                  9:16 Vertical
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedMediaType("image")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    selectedMediaType === "image"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Story Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMediaType("video")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    selectedMediaType === "video"
                      ? "bg-pink-600 text-white border-pink-600 shadow-xs"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <VideoIcon className="h-3.5 w-3.5" />
                  <span>Story Video</span>
                </button>
              </div>

              {/* VIDEO DURATION SETTINGS WHEN VIDEO SELECTED */}
              {selectedMediaType === "video" && (
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Settings2 className="h-3 w-3 text-pink-500" /> Duration
                    </span>
                    <span className="font-mono">{videoDuration}s</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[3, 5, 8, 10].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleDurationSelect(s)}
                        className={`py-1 rounded-md text-[11px] font-bold transition-all border ${
                          videoDuration === s
                            ? "bg-pink-600 text-white border-pink-600 shadow-xs"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODEL SETTINGS (GOOGLE NANO BANANA PRO / GEMINI 3 PRO IMAGE) */}
          {selectedMediaType === "image" && (
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Settings2 className="h-3.5 w-3.5 text-amber-500" /> Model Settings
                </span>
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                  🍌 Nano Banana Pro
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* 1. Aspect Ratio */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Aspect Ratio
                  </label>
                  <select
                    value={imageAspectRatio}
                    onChange={(e) => setImageAspectRatio(e.target.value)}
                    className="w-full h-8 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-mono"
                  >
                    <option value="auto">Auto ({capability.defaultAspectRatio || "1:1"})</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="4:5">4:5 (Portrait)</option>
                    <option value="9:16">9:16 (Story)</option>
                    <option value="16:9">16:9 (Wide)</option>
                    <option value="2:3">2:3 (Pin)</option>
                    <option value="3:2">3:2 (Photo)</option>
                    <option value="4:3">4:3 (Classic)</option>
                  </select>
                </div>

                {/* 2. Visual Style */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Visual Style
                  </label>
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                    className="w-full h-8 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="photorealistic">Photorealistic</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="commercial_product">Commercial Product</option>
                    <option value="minimalist">Minimalist Modern</option>
                    <option value="3d_render">3D Digital Art</option>
                    <option value="editorial">Editorial Fashion</option>
                    <option value="illustration">Vector Illustration</option>
                  </select>
                </div>

                {/* 3. Quality Standard */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Quality Standard
                  </label>
                  <select
                    value={imageQuality}
                    onChange={(e) => setImageQuality(e.target.value)}
                    className="w-full h-8 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="studio_4k">Studio 4K (Sharp)</option>
                    <option value="ultra_hd_8k">Ultra HD 8K</option>
                    <option value="standard_hd">Standard HD</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* UNIFIED PROMPT CONTROLS */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Prompt
              </label>
              <div className="flex items-center gap-3">
                {onCaptionToPrompt && (
                  <button
                    type="button"
                    disabled={isGeneratingPromptFromScript || !hasCaption}
                    onClick={onCaptionToPrompt}
                    title={hasCaption ? "Generate media prompt from current caption" : "Please enter a caption first"}
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
                )}
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

            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={
                isVertical
                  ? selectedMediaType === "video"
                    ? "Describe 9:16 vertical video scene, dynamic physical motion, cinematic lighting..."
                    : "Describe vertical 9:16 visual style, composition, lighting, textures..."
                  : "Describe photographic visual style, subject composition, lighting, and textures..."
              }
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 font-mono leading-relaxed"
            />

            <Button
              type="button"
              size="sm"
              disabled={isRenderingMedia || !prompt.trim()}
              onClick={handleTriggerGenerate}
              className={`w-full h-9 text-xs font-bold gap-1.5 text-white shadow-xs hover:opacity-90 ${
                selectedMediaType === "video"
                  ? "bg-gradient-to-r from-pink-600 to-purple-600"
                  : "bg-gradient-to-r from-primary to-indigo-600"
              }`}
            >
              {isRenderingMedia ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>
                {isRenderingMedia
                  ? selectedMediaType === "video"
                    ? "Generating Video..."
                    : "Generating Image..."
                  : selectedMediaType === "video"
                  ? `Generate ${videoDuration}s Video`
                  : `Generate ${capability.format === "Story" ? "Story Image" : "Image"}`}
              </span>
            </Button>
          </div>
        </div>

        {/* RIGHT: CAPTION, HASHTAGS, ALT TEXT */}
        <div className="md:col-span-7 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Post Caption
              </label>
              <CharacterCounter current={caption.length} max={capability.captionLimit} />
            </div>
            <Textarea
              rows={5}
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Type or paste your post caption here..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {capability.supportsHashtags && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Hashtags
                </label>
                <Input
                  value={hashtags.join(" ")}
                  onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
                  placeholder="#tag1 #tag2 #tag3"
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
                  placeholder="Auto-post first comment..."
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
              </div>
            )}
          </div>

          {capability.supportsAltText && (
            <div className="space-y-1 pt-1">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Accessibility Alt Text
              </label>
              <Input
                value={altText}
                onChange={(e) => onAltTextChange(e.target.value)}
                placeholder="Describe image for screen readers..."
                className="h-9 text-xs bg-white dark:bg-slate-900"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
