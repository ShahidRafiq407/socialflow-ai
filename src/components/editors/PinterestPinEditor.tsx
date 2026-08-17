"use client";

import React, { useState } from "react";
import {
  Upload,
  Sparkles,
  ImageIcon,
  Video as VideoIcon,
  Trash2,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Tag,
  ShoppingBag,
  Info,
  Layers,
  Wand2,
  Loader2,
  Calendar,
  Check,
  Edit2,
  X,
  Plus,
  AlertCircle,
  RefreshCw,
  Settings2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";

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
    prompt?: string;
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
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
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
  onGenerateField,
  generatingField = null,
}: PinterestPinEditorProps) {
  // Pinterest Image Settings for Image Pins (Google Cloud Nano Banana Pro / gemini-3-pro-image)
  const [pinAspectRatio, setPinAspectRatio] = useState<string>("auto");
  const [pinStyle, setPinStyle] = useState<string>("photorealistic");
  const [pinQuality, setPinQuality] = useState<string>("studio_4k");

  // Video Settings for Video Pins — only ratios the video backend can synthesize
  const BACKEND_VIDEO_RATIOS = ["16:9", "9:16"];
  const pinVideoRatioOptions = (capability.supportedAspectRatios?.length
    ? capability.supportedAspectRatios
    : ["9:16"]
  ).filter((r) => BACKEND_VIDEO_RATIOS.includes(r));
  const [pinVideoAspect, setPinVideoAspect] = useState<string>("auto");
  const effectivePinVideoAspect =
    pinVideoAspect !== "auto" && pinVideoRatioOptions.includes(pinVideoAspect)
      ? pinVideoAspect
      : capability.defaultAspectRatio;
  const [pinVideoTask, setPinVideoTask] = useState<string>("auto");
  const [pinVideoDuration, setPinVideoDuration] = useState<number>(5);
  const [pinSourceImage, setPinSourceImage] = useState<string | null>(null);

  // Pinterest Native Form State
  const [topicInput, setTopicInput] = useState("");
  const [publishLater, setPublishLater] = useState(false);
  const [isAiModified, setIsAiModified] = useState(true);
  const [includesAiPerson, setIncludesAiPerson] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [showSimilarProducts, setShowSimilarProducts] = useState(true);

  // Tag Products State
  const [taggedProducts, setTaggedProducts] = useState<Array<{ id: string; name: string; price: string; url: string }>>([]);
  const [isTagProductDialogOpen, setIsTagProductDialogOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductUrl, setNewProductUrl] = useState("");

  const handleAddProduct = () => {
    if (!newProductName.trim()) return;
    const newProd = {
      id: `prod_${Date.now()}`,
      name: newProductName.trim(),
      price: newProductPrice.trim(),
      url: newProductUrl.trim() || destinationUrl || "https://smbrobotic.com",
    };
    setTaggedProducts((prev) => [...prev, newProd]);
    setNewProductName("");
    setNewProductPrice("");
    setNewProductUrl("");
    setIsTagProductDialogOpen(false);
  };

  const handleRemoveProduct = (id: string) => {
    setTaggedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddTopic = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && topicInput.trim()) {
      e.preventDefault();
      if (!taggedTopics.includes(topicInput.trim())) {
        onTaggedTopicsChange([...taggedTopics, topicInput.trim()]);
      }
      setTopicInput("");
    }
  };

  const handleRemoveTopic = (topic: string) => {
    onTaggedTopicsChange(taggedTopics.filter((t) => t !== topic));
  };

  const handleGeneratePin = () => {
    if (isVideo) {
      onRenderAI({
        mediaType: "video",
        aspectRatio: effectivePinVideoAspect,
        duration: pinVideoDuration,
        videoTask: pinVideoTask,
        sourceImage: pinVideoTask === "image_to_video" ? pinSourceImage : null,
        prompt,
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

  // Editor preview container follows the selected Pin ratio (image or video)
  const effectiveImageAspect = pinAspectRatio === "auto" ? "2:3" : pinAspectRatio;
  const frameAspect = isVideo ? effectivePinVideoAspect : effectiveImageAspect;
  const frameShapeClass =
    frameAspect === "9:16"
      ? "w-full max-w-[300px] aspect-[9/16]"
      : frameAspect === "1:1"
      ? "w-full max-w-[320px] aspect-square"
      : frameAspect === "3:4"
      ? "w-full max-w-[320px] aspect-[3/4]"
      : frameAspect === "16:9"
      ? "w-full max-w-[400px] aspect-video"
      : "w-full max-w-[320px] aspect-[2/3]";

  return (
    <div className="space-y-6 text-left">
      {/* HEADER & AI ACTION BAR */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase px-2.5 py-0.5">
            Pinterest {capability.format}
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            {isVideo || capability.format.toLowerCase().includes("idea")
              ? "9:16 Vertical Recommended (1080 × 1920 px)"
              : "2:3 Vertical Recommended (1000 × 1500 px)"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isGeneratingCopy}
            onClick={onGenerateCopyAI}
            className="h-8 text-xs font-bold gap-1.5 bg-gradient-to-r from-red-600 to-pink-600 hover:opacity-90 text-white shadow-xs"
          >
            {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>Auto-Generate Pin Copy & SEO</span>
          </Button>
        </div>
      </div>

      {/* TWO-COLUMN PINTEREST LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: LARGE PINTEREST MEDIA CONTAINER (MATCHES SCREENSHOT) */}
        <div className="md:col-span-5 space-y-3">
          <div className={`relative rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2 flex flex-col items-center justify-center min-h-[360px] ${frameShapeClass} overflow-hidden group shadow-2xs`}>
            {isRenderingMedia ? (
              <GenerationProgressIndicator
                progress={generationProgress || 0}
                stage={generationStage}
                title={isVideo ? "Generating Video Pin" : "Generating Pin Visual"}
                isVertical={true}
                accentColor="red"
                mediaType={isVideo ? "video" : "image"}
              />
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
            ) : (
              <div className="p-6 text-center space-y-3">
                <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto">
                  <ImageIcon className="h-7 w-7" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200">Choose a file or drag and drop it here</p>
                  <p className="text-xs text-slate-400 mt-1">We recommend high quality .jpg or .mp4 files under 20MB</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenUpload}
                    className="h-8 text-xs font-bold gap-1 w-full sm:w-auto bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  >
                    <Upload className="h-3.5 w-3.5 text-emerald-500" /> Upload PC
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenStock}
                    className="h-8 text-xs font-bold gap-1 w-full sm:w-auto bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-pink-500" /> Stock Media
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* VIDEO SETTINGS (VIDEO PIN) — aspect ratio + generation task + duration */}
          {isVideo && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Settings2 className="h-3.5 w-3.5 text-red-500" /> Video Settings
                </span>
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full font-mono">
                  {effectivePinVideoAspect}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Aspect Ratio
                </label>
                {pinVideoRatioOptions.length > 1 ? (
                  <select
                    value={pinVideoAspect}
                    onChange={(e) => setPinVideoAspect(e.target.value)}
                    className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                  >
                    <option value="auto">Auto ({capability.defaultAspectRatio} Default)</option>
                    {pinVideoRatioOptions.map((ratio) => (
                      <option key={ratio} value={ratio}>{ratio}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center justify-between h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>{pinVideoRatioOptions[0] || capability.defaultAspectRatio}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Platform standard</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Video Task
                </label>
                <select
                  value={pinVideoTask}
                  onChange={(e) => {
                    setPinVideoTask(e.target.value);
                    if (e.target.value === "text_to_video") setPinSourceImage(null);
                  }}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                >
                  <option value="auto">Auto</option>
                  <option value="text_to_video">Text to Video</option>
                  <option value="image_to_video">Image to Video</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <VideoIcon className="h-3 w-3 text-red-500" /> Duration
                  </span>
                  <span className="font-mono">{pinVideoDuration}s</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[3, 5, 8, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPinVideoDuration(s)}
                      className={`py-1 rounded-md text-[11px] font-bold transition-all border ${
                        pinVideoDuration === s
                          ? "bg-red-600 text-white border-red-600 shadow-xs"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>

              {pinVideoTask === "image_to_video" && (
                <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-red-700 dark:text-red-300">
                    <span className="flex items-center gap-1">
                      <VideoIcon className="h-3.5 w-3.5" />
                      Starting Image (First Frame to Animate)
                    </span>
                    {pinSourceImage && (
                      <button
                        type="button"
                        onClick={() => setPinSourceImage(null)}
                        className="text-red-500 hover:underline text-[10px]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {pinSourceImage ? (
                    <div className="flex items-center gap-2">
                      <img src={pinSourceImage} alt="Source for video" className="h-12 w-12 object-cover rounded-md border border-red-300 dark:border-red-700" />
                      <span className="text-[10px] text-slate-500 font-mono">Starting image attached</span>
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
                            const reader = new FileReader();
                            reader.onload = () => setPinSourceImage(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <label
                        htmlFor="pin-source-image-upload"
                        className="cursor-pointer flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-red-400 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload Starting Image to Animate into Video
                      </label>
                    </div>
                  )}
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
                    <option value="auto">Auto (2:3 Standard Pin Default)</option>
                    <option value="2:3">2:3 (Standard Pin)</option>
                    <option value="9:16">9:16 (Tall Pin)</option>
                    <option value="1:1">1:1 (Square Pin)</option>
                    <option value="3:4">3:4 (Portrait)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                      <option value="photorealistic">Photorealistic (Studio Lighting)</option>
                      <option value="cinematic">Cinematic (Dramatic Lighting)</option>
                      <option value="commercial_product">Commercial Product (Studio Box)</option>
                      <option value="minimalist">Minimalist Modern (Clean Space)</option>
                      <option value="3d_render">3D Digital Art (Octane Render)</option>
                      <option value="editorial">Editorial Fashion (Magazine Style)</option>
                      <option value="illustration">Vector Illustration (Clean Art)</option>
                    </select>
                  </div>

                  {/* 4. Quality Standard */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                      Quality Standard
                    </label>
                    <select
                      value={pinQuality}
                      onChange={(e) => setPinQuality(e.target.value)}
                      className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="studio_4k">Studio 4K (Sharp Focus)</option>
                      <option value="ultra_hd_8k">Ultra HD 8K (Extreme Detail)</option>
                      <option value="standard_hd">Standard High Definition</option>
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isEnhancingPrompt || !prompt || !prompt.trim()}
                  onClick={onEnhancePrompt}
                  className={`text-[11px] font-semibold flex items-center gap-0.5 transition-all ${
                    !prompt || !prompt.trim()
                      ? "text-slate-400 cursor-not-allowed opacity-50"
                      : "text-pink-600 hover:text-pink-700 hover:underline cursor-pointer"
                  }`}
                >
                  <span>Enhance Prompt ✨</span>
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
              disabled={isRenderingMedia || !prompt.trim()}
              onClick={handleGeneratePin}
              className="w-full h-9 text-xs font-bold gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-xs"
            >
              {isRenderingMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isRenderingMedia ? (isVideo ? "Generating Video Pin..." : "Generating Pin Visual...") : (isVideo ? "Generate Video Pin" : "Generate Pin Visual")}</span>
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN: PINTEREST NATIVE FIELDS (MATCHES SCREENSHOT EXACTLY) */}
        <div className="md:col-span-7 space-y-4">
          {/* TITLE */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Title</label>
                {onGenerateField && (
                  <button type="button" onClick={() => onGenerateField("title")} disabled={generatingField === "title"} title="Generate Title with AI" className="text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors">
                    {generatingField === "title" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
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
              className="h-10 text-sm font-semibold rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* DESCRIPTION */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Description</label>
                {onGenerateField && (
                  <button type="button" onClick={() => onGenerateField("description")} disabled={generatingField === "description"} title="Generate Description with AI" className="text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors">
                    {generatingField === "description" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                  </button>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-mono">{description.length} / 500</span>
            </div>
            <Textarea
              rows={4}
              maxLength={500}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe your Pin"
              className="w-full text-xs sm:text-sm leading-relaxed p-3 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* DESTINATION LINK */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Link</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                value={destinationUrl}
                onChange={(e) => onDestinationUrlChange(e.target.value)}
                placeholder="Add a link (e.g. https://yourwebsite.com/article)"
                className="h-10 pl-9 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          {/* BOARD SELECTOR */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Board</label>
            <div className="relative">
              <select
                value={board}
                onChange={(e) => onBoardChange(e.target.value)}
                className="w-full h-10 px-3 pr-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 appearance-none focus:ring-2 focus:ring-red-500/20"
              >
                <option value="Smart Robotics & AI">Smart Robotics & AI</option>
                <option value="Tech Inspiration">Tech Inspiration</option>
                <option value="DIY Electronics">DIY Electronics</option>
                <option value="Digital Marketing Strategies">Digital Marketing Strategies</option>
              </select>
              <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* TAGGED TOPICS */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Tagged topics ({taggedTopics.length})
              </label>
              <span className="text-[10px] text-slate-400">Press Enter to add tag</span>
            </div>
            <Input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={handleAddTopic}
              placeholder="Search for a tag (e.g. Robotics, Artificial Intelligence, Automation)"
              className="h-10 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
            <p className="text-[11px] text-slate-400">Don't worry, people won't see your tags</p>

            {taggedTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {taggedTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-full"
                  >
                    <span>{topic}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(topic)}
                      className="hover:text-red-500 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* TAG PRODUCTS */}
          <div className="pt-1 space-y-2">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Tag Products</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTagProductDialogOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-red-600" />
              <span>Add products</span>
            </Button>

            {taggedProducts.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {taggedProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-300 px-2.5 py-1 rounded-lg text-xs font-medium"
                  >
                    <ShoppingBag className="h-3 w-3 text-red-600 shrink-0" />
                    <span className="font-bold">{prod.name}</span>
                    {prod.price && <span className="text-[11px] text-red-600 dark:text-red-400 font-mono">({prod.price})</span>}
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(prod.id)}
                      className="hover:text-red-700 ml-1 text-slate-400 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TOGGLES: PUBLISH LATER & AI MODIFIED (MATCHES SCREENSHOT) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* PUBLISH AT A LATER DATE */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Publish at a later date</span>
              <button
                type="button"
                onClick={() => setPublishLater(!publishLater)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  publishLater ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    publishLater ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* MARK AS AI-MODIFIED */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Mark as AI-Modified</span>
                  <span className="text-[11px] text-slate-400 block">Content that was made completely or partly with AI</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAiModified(!isAiModified)}
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

              {isAiModified && (
                <div className="pl-6 pt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ai-person"
                    checked={includesAiPerson}
                    onChange={(e) => setIncludesAiPerson(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <label htmlFor="ai-person" className="text-xs text-slate-500 dark:text-slate-400">
                    This Pin includes an AI-generated person
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* MORE OPTIONS (COLLAPSIBLE - MATCHES SCREENSHOT) */}
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
                {/* ALLOW COMMENTS */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-700 dark:text-slate-300">Allow people to comment</span>
                  <button
                    type="button"
                    onClick={() => setAllowComments(!allowComments)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      allowComments ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        allowComments ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* SHOW SIMILAR PRODUCTS */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-700 dark:text-slate-300">Show similar products</span>
                    <button
                      type="button"
                      onClick={() => setShowSimilarProducts(!showSimilarProducts)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                        showSimilarProducts ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          showSimilarProducts ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    People can shop products similar to what's shown in this Pin using visual search.
                  </p>
                </div>

                {/* ALT TEXT */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Alt Text</label>
                    {onGenerateField && (
                      <button type="button" onClick={() => onGenerateField("altText")} disabled={generatingField === "altText"} title="Generate Alt Text with AI" className="text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors">
                        {generatingField === "altText" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                      </button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
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
      {/* TAG PRODUCTS MODAL */}
      {isTagProductDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tag Product to Pin</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTagProductDialogOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Product Title / Name</label>
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Smart Robotic Gripper Kit"
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Price (optional)</label>
                  <Input
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="e.g. $49.99"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Product URL</label>
                  <Input
                    value={newProductUrl}
                    onChange={(e) => setNewProductUrl(e.target.value)}
                    placeholder="https://smbrobotic.com/..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* QUICK PRESET PICKS */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400">Quick Pick Sample Products:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: "Pro Starter Kit", price: "$99", url: "https://example.com/starter" },
                    { name: "Premium Plan", price: "$149", url: "https://example.com/premium" },
                    { name: "Enterprise Solution", price: "$299", url: "https://example.com/enterprise" },
                    { name: "Digital Guide Bundle", price: "$49", url: "https://example.com/guide" },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setNewProductName(p.name);
                        setNewProductPrice(p.price);
                        setNewProductUrl(p.url);
                      }}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-700 dark:text-slate-300 hover:text-red-600 transition-colors"
                    >
                      + {p.name} ({p.price})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTagProductDialogOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!newProductName.trim()}
                onClick={handleAddProduct}
                className="h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
              >
                Add Tag
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
