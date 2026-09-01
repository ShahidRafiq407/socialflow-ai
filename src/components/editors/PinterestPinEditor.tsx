"use client";

import React, { useState } from "react";
import {
  Upload,
  Sparkles,
  ImageIcon,
  Trash2,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Tag,
  ShoppingBag,
  Info,
  Layers,
  Wand2,
  Settings2,
  Loader2,
  Calendar,
  Check,
  Edit2,
  X,
  Plus,
  AlertCircle,
  RefreshCw,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";
import AnalyzeMediaAIButton from "./AnalyzeMediaAIButton";
import CaptionRefineActions from "./CaptionRefineActions";
import { cancelAIAction } from "@/lib/aiActionEvents";

interface PinterestPinEditorProps {
  capability: PlatformCapability;
  title: string;
  onTitleChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  destinationUrl: string;
  onDestinationUrlChange: (val: string) => void;
  board: string;
  onBoardChange: (val: string) => void;
  taggedTopics: string[];
  onTaggedTopicsChange: (topics: string[]) => void;
  altText: string;
  onAltTextChange: (val: string) => void;
  /** Real boards from the connected Pinterest account (rendered in the Board dropdown). */
  boards?: { id: string; name: string }[];
  /** AI-modified disclosure — synced to the Pin create API via ai_disclosures. */
  aiModified?: boolean;
  onAiModifiedChange?: (val: boolean) => void;
  displayImageUrl: string | null;
  onRemoveMedia: () => void;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  onRenderAI: (options?: {
    aspectRatio?: string;
    style?: string;
    quality?: string;
    imageModel?: string;
    mediaType?: "image" | "video";
    duration?: number;
    videoTask?: string;
    sourceImage?: string | null;
    sourceVideo?: string | null;
  }) => void;
  isRenderingMedia: boolean;
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  isVideo?: boolean;
  generationProgress?: number;
  generationStage?: string;
  renderError?: string | null;
  originalPrompt?: string | null;
  onRestoreOriginalPrompt?: () => void;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
  // AI analysis of the attached (uploaded/stock) media
  onAnalyzeMedia?: () => void;
  isAnalyzingMedia?: boolean;
  // TRUE only when the current slot holds user-provided media (upload/stock)
  hasUserMedia?: boolean;
  // Description quick actions (rewrite / boost hook / executive tone / hashtags)
  onAIRefine?: (action: "regenerate" | "boost-hook" | "executive-tone" | "add-hashtags") => void;
  isRefiningCaption?: boolean;
  refiningAction?: string | null;
}

export default function PinterestPinEditor({
  capability,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  destinationUrl,
  onDestinationUrlChange,
  board,
  onBoardChange,
  taggedTopics,
  onTaggedTopicsChange,
  altText,
  onAltTextChange,
  boards,
  aiModified,
  onAiModifiedChange,
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
  isVideo = false,
  generationProgress,
  generationStage,
  renderError = null,
  originalPrompt = null,
  onRestoreOriginalPrompt,
  onCaptionToPrompt,
  isGeneratingPromptFromScript = false,
  onGenerateField,
  generatingField = null,
  onAnalyzeMedia,
  isAnalyzingMedia = false,
  hasUserMedia = false,
  onAIRefine,
  isRefiningCaption = false,
  refiningAction = null,
}: PinterestPinEditorProps) {
  const formatKey = `${capability.platform}-${capability.format}`;
  // Pinterest Image Settings for Image Pins (Google Cloud Nano Banana Pro / gemini-3-pro-image)
  const [pinAspectRatio, setPinAspectRatio] = useState<string>("auto");
  // Video Pin settings (9:16 vertical video)
  const [pinVideoDuration, setPinVideoDuration] = useState<number>(5);
  const [pinVideoTask, setPinVideoTask] = useState<string>("auto");
  const [pinVideoAspectRatio, setPinVideoAspectRatio] = useState<string>("auto");
  const [attachedSourceImage, setAttachedSourceImage] = useState<string | null>(null);
  const [pinStyle, setPinStyle] = useState<string>("photorealistic");
  const [pinQuality, setPinQuality] = useState<string>("studio_4k");

  // Pinterest Native Form State
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(true);
  // AI-modified disclosure — local mirror of the aiModified prop so the toggle
  // stays responsive; changes propagate up via onAiModifiedChange.
  const [isAiModified, setIsAiModified] = useState<boolean>(aiModified ?? true);

  const handleGeneratePin = () => {
    if (isVideo) {
      onRenderAI({
        mediaType: "video",
        aspectRatio: pinVideoAspectRatio !== "auto" ? pinVideoAspectRatio : "9:16",
        duration: pinVideoDuration,
        videoTask: pinVideoTask,
        sourceImage: attachedSourceImage,
        sourceVideo: pinVideoTask === "edit" ? displayImageUrl : null,
      });
    } else {
      onRenderAI({
        mediaType: "image",
        aspectRatio: pinAspectRatio === "auto" ? "2:3" : pinAspectRatio,
        style: pinStyle,
        quality: pinQuality,
        imageModel: "gemini-3-pro-image",
      });
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* HEADER & AI ACTION BAR */}
      <div className="flex items-center justify-end pb-2.5 border-b border-slate-200 dark:border-slate-800">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            if (isGeneratingCopy) {
              cancelAIAction("copy", formatKey);
              return;
            }
            onGenerateCopyAI();
          }}
          title={isGeneratingCopy ? "Stop generating Pin copy" : undefined}
          className={`h-auto min-h-7 px-3 py-1 text-[11px] font-bold gap-1.5 shadow-2xs rounded-lg whitespace-normal transition-colors ${
            isGeneratingCopy
              ? "bg-red-500 hover:bg-red-600 text-white dark:bg-red-600 dark:hover:bg-red-700"
              : "bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white"
          }`}
        >
          {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>{isGeneratingCopy ? "Stop Generating" : "Generate Pin Title, Description & Prompt with AI"}</span>
        </Button>
      </div>

      {/* TWO-COLUMN PINTEREST LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: PINTEREST MEDIA CONTAINER */}
        <div className="xl:col-span-5 space-y-3.5">
          <div className={`relative rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2 flex flex-col items-center justify-center min-h-[260px] max-w-[210px] sm:max-w-[220px] mx-auto ${isVideo ? "aspect-[9/16]" : "aspect-[2/3]"} overflow-hidden group shadow-2xs`}>
            {isRenderingMedia ? (
              <GenerationProgressIndicator
                progress={generationProgress || 0}
                stage={generationStage}
                title={isVideo ? "Generating Video Pin" : "Generating Pin Visual"}
                isVertical={true}
                accentColor="red"
                mediaType={isVideo ? "video" : "image"}
              />
            ) : displayImageUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                {isVideo ? (
                  <VideoPreviewPlayer
                    src={displayImageUrl}
                    className="w-full h-full object-cover rounded-xl"
                    isVertical={true}
                    showAlwaysPlayButton={true}
                  />
                ) : (
                  <img
                    src={displayImageUrl}
                    alt={title || "Pinterest Pin Preview"}
                    className="w-full h-full object-cover rounded-xl"
                  />
                )}
                {/* EDIT/DELETE ACTIONS */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
                  <button
                    type="button"
                    onClick={onOpenUpload}
                    className="p-2 rounded-full bg-black/70 hover:bg-black text-white transition-colors shadow-md"
                    title="Replace Media"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onRemoveMedia}
                    className="p-2 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors shadow-md"
                    title="Remove Media"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : renderError ? (
              <div className="text-center p-4 space-y-2.5">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-red-400">Generation failed</p>
                  <p className="text-[10px] text-slate-400 line-clamp-2">{renderError}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleGeneratePin}
                  disabled={!prompt.trim()}
                  className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              </div>
            ) : (
              <div className="p-3 text-center space-y-2 w-full">
                <div className="h-11 w-11 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div className="px-1">
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    {isVideo ? "Upload Video Pin" : "Upload Pin Media"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {isVideo ? "9:16 MP4 under 20MB" : "2:3 JPG/PNG (1000×1500)"}
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
                    <ImageIcon className="h-3 w-3 mr-1 text-pink-500" /> Stock Media
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* VIDEO PIN SETTINGS */}
          {isVideo && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Settings2 className="h-3.5 w-3.5 text-red-600" />
                  Video settings
                </span>
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full font-mono">
                  {pinVideoAspectRatio !== "auto" ? pinVideoAspectRatio : "9:16"}
                </span>
              </div>

              {/* 1. Aspect Ratio */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Aspect ratio
                </label>
                <select
                  value={pinVideoAspectRatio}
                  onChange={(e) => setPinVideoAspectRatio(e.target.value)}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                >
                  <option value="auto">Auto (9:16 Pinterest Vertical Video Default)</option>
                  <option value="9:16">9:16 (Vertical Video Pin)</option>
                  <option value="2:3">2:3 (Standard Pin)</option>
                  <option value="16:9">16:9 (Landscape Video)</option>
                  <option value="1:1">1:1 (Square Video)</option>
                </select>
              </div>

              {/* 2. Video Task */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Video task
                </label>
                <select
                  value={pinVideoTask}
                  onChange={(e) => {
                    setPinVideoTask(e.target.value);
                    if (e.target.value === "text_to_video") {
                      setAttachedSourceImage(null);
                    }
                  }}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                >
                  <option value="auto">Auto</option>
                  <option value="text_to_video">Text to video</option>
                  <option value="image_to_video">Image to video</option>
                  <option value="reference_to_video">Reference to video</option>
                  <option value="edit">Edit</option>
                </select>
              </div>

              {/* 3. Duration */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Duration
                </label>
                <select
                  value={pinVideoDuration}
                  onChange={(e) => setPinVideoDuration(Number(e.target.value))}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-red-500 focus:outline-none font-mono"
                >
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((sec) => (
                    <option key={sec} value={sec}>
                      {sec} seconds {sec === 5 ? "(Recommended)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Source Image Attachment */}
              {(pinVideoTask === "image_to_video" || pinVideoTask === "reference_to_video") && (
                <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-red-700 dark:text-red-300">
                    <span>
                      {pinVideoTask === "image_to_video" ? "Starting Image to Animate" : "Reference Style Image"}
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
                      <img src={attachedSourceImage} alt="Source for video" className="h-12 w-12 object-cover rounded-md border border-red-300 dark:border-red-700" />
                      <span className="text-[10px] text-slate-500 font-mono">Image attached</span>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        id="pin-source-image-upload"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const formData = new FormData();
                            formData.append("file", file);
                            fetch("/api/uploads", { method: "POST", body: formData })
                              .then(res => res.json())
                              .then(data => {
                                if (data.url) setAttachedSourceImage(data.url);
                              })
                              .catch(() => {
                                const reader = new FileReader();
                                reader.onload = () => setAttachedSourceImage(reader.result as string);
                                reader.readAsDataURL(file);
                              });
                          }
                        }}
                      />
                      <label
                        htmlFor="pin-source-image-upload"
                        className="cursor-pointer flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-red-400 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {pinVideoTask === "image_to_video" ? "Upload Starting Image" : "Upload Reference Image"}
                      </label>
                    </div>
                  )}
                </div>
              )}

              {pinVideoTask === "edit" && (
                <div className="p-2 rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 text-[11px] font-medium text-red-700 dark:text-red-300">
                  {displayImageUrl ? "Editing active video stream." : "Generate or upload a video first to use Edit task."}
                </div>
              )}
            </div>
          )}

          {/* MODEL SETTINGS (GOOGLE NANO BANANA PRO / GEMINI 3 PRO IMAGE) */}
          {!isVideo && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5 text-amber-500" /> Image Settings
                </span>
              </div>

              <div className="space-y-2.5">

                {/* 2. Aspect Ratio */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Aspect Ratio
                  </label>
                  <select
                    value={pinAspectRatio}
                    onChange={(e) => setPinAspectRatio(e.target.value)}
                    className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-mono"
                  >
                    <option value="auto">Auto (2:3)</option>
                    <option value="2:3">2:3 (Standard Pin)</option>
                    <option value="9:16">9:16 (Tall Pin)</option>
                    <option value="1:1">1:1 (Square Pin)</option>
                    <option value="3:4">3:4 (Portrait)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* 3. Visual Style */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                      Visual Style
                    </label>
                    <select
                      value={pinStyle}
                      onChange={(e) => setPinStyle(e.target.value)}
                      className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
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

                  {/* 4. Quality */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                      Quality
                    </label>
                    <select
                      value={pinQuality}
                      onChange={(e) => setPinQuality(e.target.value)}
                      className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="studio_4k">Studio 4K</option>
                      <option value="ultra_hd_8k">Ultra HD 8K</option>
                      <option value="standard_hd">Standard HD</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI VISUAL PROMPT ENHANCER */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Prompt
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                {onCaptionToPrompt && (
                  <button
                    type="button"
                    disabled={!isGeneratingPromptFromScript && !description.trim()}
                    onClick={() => {
                      if (isGeneratingPromptFromScript) {
                        cancelAIAction("script", formatKey);
                      } else {
                        onCaptionToPrompt();
                      }
                    }}
                    title={isGeneratingPromptFromScript ? "Stop generating prompt from description" : "Generate media prompt from current description"}
                    className={`text-[11px] font-semibold flex items-center gap-1 transition-all ${
                      isGeneratingPromptFromScript
                        ? "text-red-500 hover:text-red-600 cursor-pointer"
                        : "text-amber-600 hover:text-amber-700 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}
                  >
                    {isGeneratingPromptFromScript ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    <span>{isGeneratingPromptFromScript ? "Stop" : "Auto Prompt from Description"}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={!isEnhancingPrompt && (!prompt || !prompt.trim())}
                  onClick={() => {
                    if (isEnhancingPrompt) {
                      cancelAIAction("enhance", formatKey);
                    } else {
                      onEnhancePrompt();
                    }
                  }}
                  className={`text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    isEnhancingPrompt
                      ? "text-red-500 hover:text-red-600 cursor-pointer"
                      : !prompt || !prompt.trim()
                        ? "text-slate-400 cursor-not-allowed opacity-50"
                        : "text-pink-600 hover:text-pink-700 hover:underline cursor-pointer"
                  }`}
                >
                  {isEnhancingPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  <span>{isEnhancingPrompt ? "Stop Enhancing" : "Enhance Prompt ✨"}</span>
                </button>
                {originalPrompt && originalPrompt !== prompt && onRestoreOriginalPrompt && (
                  <button
                    type="button"
                    onClick={onRestoreOriginalPrompt}
                    title={originalPrompt}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline cursor-pointer"
                  >
                    ↩ Original
                  </button>
                )}
              </div>
            </div>
            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={isVideo ? "Describe 9:16 vertical video motion, scene, and aesthetics..." : "Describe 2:3 vertical Pin visual style, typography, and aesthetic..."}
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 font-mono leading-relaxed"
            />
            <Button
              type="button"
              size="sm"
              disabled={!isRenderingMedia && !prompt.trim()}
              onClick={isRenderingMedia ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("cancel-render-media", { 
                  detail: { formatKey: `${capability.platform}-${capability.format}` } 
                }));
              } : handleGeneratePin}
              className={`w-full h-9 text-xs font-bold gap-1.5 shadow-xs transition-colors ${
                isRenderingMedia 
                ? "bg-red-500 hover:bg-red-600 text-white dark:bg-red-600 dark:hover:bg-red-700" 
                : "bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white"
              }`}
            >
              {isRenderingMedia ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Stop Generation</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isVideo ? "Generate Video Pin" : "Generate Pin Visual"}</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN: PINTEREST NATIVE FIELDS */}
        <div className="xl:col-span-7 space-y-3.5">
          {/* AI MEDIA ANALYSIS — analyze the uploaded/stock media and write matching text */}
          {onAnalyzeMedia && (
            <AnalyzeMediaAIButton
              formatKey={formatKey}
              onClick={onAnalyzeMedia}
              isAnalyzing={isAnalyzingMedia}
              hasMedia={hasUserMedia}
            />
          )}

          {/* TITLE */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Title</label>
                {onGenerateField && (
                  <button type="button" onClick={() => {
                    if (generatingField === "title") {
                      cancelAIAction("field", `${formatKey}:title`);
                    } else {
                      onGenerateField("title");
                    }
                  }} disabled={generatingField !== null && generatingField !== "title"} title={generatingField === "title" ? "Stop generating title" : "Generate Title with AI"} className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                    generatingField === "title"
                      ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                      : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                  } ${generatingField !== null && generatingField !== "title" ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {generatingField === "title" ? <Square className="h-3 w-3 fill-current" /> : <Sparkles className="h-3 w-3" />} {generatingField === "title" ? "Stop" : "AI"}
                  </button>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-mono">{title.length} / 100</span>
            </div>
            <Input
              value={title}
              maxLength={100}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Tell everyone what your Pin is about"
              className="h-8.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* DESCRIPTION */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Description</label>
                {onGenerateField && (
                  <button type="button" onClick={() => {
                    if (generatingField === "description") {
                      cancelAIAction("field", `${formatKey}:description`);
                    } else {
                      onGenerateField("description");
                    }
                  }} disabled={generatingField !== null && generatingField !== "description"} title={generatingField === "description" ? "Stop generating description" : "Generate Description with AI"} className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                    generatingField === "description"
                      ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                      : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                  } ${generatingField !== null && generatingField !== "description" ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {generatingField === "description" ? <Square className="h-3 w-3 fill-current" /> : <Sparkles className="h-3 w-3" />} {generatingField === "description" ? "Stop" : "AI"}
                  </button>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-mono">{description.length} / 500</span>
            </div>
            <Textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe your Pin"
              className="w-full text-xs leading-relaxed p-2.5 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
            {onAIRefine && (
              <CaptionRefineActions
                formatKey={formatKey}
                caption={description}
                onRefine={onAIRefine}
                isRefining={isRefiningCaption}
                refiningAction={refiningAction}
              />
            )}
          </div>

          {/* DESTINATION LINK */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Link</label>
            <div className="relative">
              <LinkIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={destinationUrl}
                onChange={(e) => onDestinationUrlChange(e.target.value)}
                placeholder="Add a link (e.g. https://yourwebsite.com/article)"
                className="h-8.5 pl-8 text-xs rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          {/* BOARD SELECTOR — real boards from the connected Pinterest account.
              The publisher resolves the board NAME to a board ID via /v5/boards. */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Board</label>
            {boards && boards.length > 0 ? (
              <div className="relative">
                <select
                  value={board}
                  onChange={(e) => onBoardChange(e.target.value)}
                  className="w-full h-8.5 px-2.5 pr-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 appearance-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="">Auto-detect (first board)</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                  {/* Keep the currently typed board selectable even if it is not in the list yet */}
                  {board && !boards.some((b) => b.name === board) && (
                    <option value={board}>{board}</option>
                  )}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            ) : (
              <Input
                value={board}
                onChange={(e) => onBoardChange(e.target.value)}
                placeholder="Type the exact board name from your Pinterest account"
                className="h-8.5 text-xs rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              />
            )}
            <p className="text-[11px] text-slate-400">
              Boards are matched by name against your connected Pinterest account (exact spelling).
            </p>
          </div>

          {/* NOTE: "Tagged topics", "Tag products", comment toggles and
              "show similar products" were removed — the Pinterest v5 Create Pin
              API does not accept them, so they could never sync to the real
              platform. Only fields the real API accepts are shown here. */}

          {/* TOGGLES: AI MODIFIED DISCLOSURE (synced via ai_disclosures on the Pin create API) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">

            {/* MARK AS AI-MODIFIED */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Mark as AI-Modified</span>
                  <span className="text-[11px] text-slate-400 block">Content that was made completely or partly with AI</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isAiModified;
                    setIsAiModified(next);
                    onAiModifiedChange?.(next);
                  }}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    isAiModified ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      isAiModified ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* MORE OPTIONS (COLLAPSIBLE) — only settings the real API accepts */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <button
              type="button"
              onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}
              className="flex items-center justify-between w-full text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              <span>More options</span>
              {moreOptionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {moreOptionsOpen && (
              <div className="space-y-4 pt-1">
                {/* ALT TEXT */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Alt Text</label>
                    {onGenerateField && (
                      <button type="button" onClick={() => {
                        if (generatingField === "altText") {
                          cancelAIAction("field", `${formatKey}:altText`);
                        } else {
                          onGenerateField("altText");
                        }
                      }} disabled={generatingField !== null && generatingField !== "altText"} title={generatingField === "altText" ? "Stop generating alt text" : "Generate Alt Text with AI"} className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                        generatingField === "altText"
                          ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                          : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                      } ${generatingField !== null && generatingField !== "altText" ? "opacity-50 cursor-not-allowed" : ""}`}>
                        {generatingField === "altText" ? <Square className="h-3 w-3 fill-current" /> : <Sparkles className="h-3 w-3" />} {generatingField === "altText" ? "Stop" : "AI"}
                      </button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    maxLength={500}
                    value={altText}
                    onChange={(e) => onAltTextChange(e.target.value)}
                    placeholder="Describe your Pin's visual details"
                    className="w-full text-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  />
                  <p className="text-[11px] text-slate-400">
                    This helps people using screen readers understand what your Pin is about.
                  </p>
                </div>
              </div>
             )}
           </div>
         </div>
       </div>
    </div>
  );
}
