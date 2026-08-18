"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Upload,
  ImageIcon,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Wand2,
  RefreshCw,
  Loader2,
  Hash,
  ShoppingBag,
  Sliders,
  Check,
  Settings2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";
import ContentMediaRenderer from "@/components/ui/ContentMediaRenderer";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";

export interface MultiMediaItem {
  id: string;
  url: string;
  type: "image" | "video";
  prompt?: string;
  caption?: string;
}

interface MultiMediaEditorProps {
  capability: PlatformCapability;
  caption: string;
  onCaptionChange: (val: string) => void;
  hashtags: string[];
  onHashtagsChange: (tags: string[]) => void;
  mediaItems: MultiMediaItem[];
  onMediaItemsChange: (items: MultiMediaItem[]) => void;
  activeMediaIndex: number;
  onActiveMediaChange: (idx: number) => void;
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  onGenerateAllMediaAI: () => void;
  isGeneratingAllMedia: boolean;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  onRenderSingleAI: (options?: {
    mediaType?: "image" | "video";
    prompt?: string;
    aspectRatio?: string;
    style?: string;
    quality?: string;
    imageModel?: string;
  }) => void;
  isRenderingSingleAI: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  renderError?: string | null;
  generationProgress?: number;
  generationStage?: string;
  onReorderCards?: (fromIdx: number, toIdx: number) => void;
  originalPrompt?: string | null;
  onRestoreOriginalPrompt?: () => void;
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
}

export default function MultiMediaEditor({
  capability,
  caption,
  onCaptionChange,
  hashtags,
  onHashtagsChange,
  mediaItems,
  onMediaItemsChange,
  activeMediaIndex,
  onActiveMediaChange,
  onGenerateCopyAI,
  isGeneratingCopy,
  onGenerateAllMediaAI,
  isGeneratingAllMedia,
  onOpenUpload,
  onOpenStock,
  onRenderSingleAI,
  isRenderingSingleAI,
  prompt,
  onPromptChange,
  onEnhancePrompt,
  isEnhancingPrompt,
  renderError = null,
  generationProgress = 0,
  generationStage = "",
  onReorderCards,
  originalPrompt = null,
  onRestoreOriginalPrompt,
  onGenerateField,
  generatingField = null,
}: MultiMediaEditorProps) {
  const [tagInput, setTagInput] = useState("");
  const [imageAspectRatio, setImageAspectRatio] = useState<string>("auto");
  const [imageStyle, setImageStyle] = useState<string>("photorealistic");
  const [imageQuality, setImageQuality] = useState<string>("studio_4k");
  // X Thread = sequence of connected posts: label slots "Post 2/5" (Phase 13 numbering);
  // other multi-photo platforms keep the plain "Asset N" wording.
  const isThreadFormat = capability.formatKey === "x_thread";
  const slotLabel = (idx: number) =>
    isThreadFormat ? `Post ${idx + 1}/${mediaItems.length}` : `Asset ${idx + 1}`;
  const activeMedia = mediaItems[activeMediaIndex] || mediaItems[0] || {
    id: "item_1",
    url: "",
    type: "image" as const,
    prompt: "",
  };

  const handleRemoveMedia = (idx: number) => {
    if (mediaItems.length <= 1) return;
    const updated = mediaItems.filter((_, i) => i !== idx);
    onMediaItemsChange(updated);
    onActiveMediaChange(Math.max(0, activeMediaIndex - 1));
  };

  const handleAddMedia = () => {
    if (mediaItems.length >= capability.maxMedia) return;
    const updated: MultiMediaItem[] = [
      ...mediaItems,
      {
        id: `item_${Date.now()}`,
        url: "",
        type: "image",
        prompt: `Visual for asset ${mediaItems.length + 1}`,
      },
    ];
    onMediaItemsChange(updated);
    onActiveMediaChange(mediaItems.length);
  };

  // Real generation request for the ACTIVE asset slot — passes the per-asset
  // prompt (campaign slide prompt or user-typed) + selected aspect ratio /
  // style / quality to the shared render pipeline.
  const handleGenerateActiveAsset = () => {
    const supportedRatios = capability.supportedAspectRatios?.length ? capability.supportedAspectRatios : [];
    const safeAspectRatio =
      imageAspectRatio !== "auto" && supportedRatios.includes(imageAspectRatio as any)
        ? imageAspectRatio
        : capability.defaultAspectRatio;
    onRenderSingleAI({
      mediaType: "image",
      prompt: prompt.trim() || undefined,
      aspectRatio: safeAspectRatio,
      style: imageStyle,
      quality: imageQuality,
      imageModel: "gemini-3-pro-image",
    });
  };

  // Per-post text (X Thread): each connected post carries its own tweet text.
  const handleUpdateActiveMediaText = (text: string) => {
    const updated = mediaItems.map((item, i) =>
      i === activeMediaIndex ? { ...item, caption: text } : item
    );
    onMediaItemsChange(updated);
  };

  return (
    <div className="space-y-4 text-left">
      {/* MEDIA GRID / STRIP */}
      <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-blue-600" />
              {isThreadFormat ? "Thread Posts" : "Media Assets"} ({mediaItems.length} of {capability.maxMedia})
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isGeneratingAllMedia}
              onClick={onGenerateAllMediaAI}
              className="h-7 px-2.5 text-[11px] font-bold gap-1 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
            >
              {isGeneratingAllMedia ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-slate-600" />}
              <span>Regenerate All Assets</span>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">
              Active: {slotLabel(activeMediaIndex)}
            </span>
            {onReorderCards && mediaItems.length > 1 && (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={activeMediaIndex === 0}
                  onClick={() => onReorderCards(activeMediaIndex, activeMediaIndex - 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                  title={`Move ${slotLabel(activeMediaIndex)} Left`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={activeMediaIndex === mediaItems.length - 1}
                  onClick={() => onReorderCards(activeMediaIndex, activeMediaIndex + 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                  title={`Move ${slotLabel(activeMediaIndex)} Right`}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            type="button"
            disabled={activeMediaIndex === 0}
            onClick={() => onActiveMediaChange(Math.max(0, activeMediaIndex - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {mediaItems.map((item, idx) => (
            <button
              key={item.id || idx}
              type="button"
              onClick={() => onActiveMediaChange(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeMediaIndex === idx
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{slotLabel(idx)}</span>
              {item.url && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}

          <button
            type="button"
            disabled={activeMediaIndex >= mediaItems.length - 1}
            onClick={() => onActiveMediaChange(Math.min(mediaItems.length - 1, activeMediaIndex + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {mediaItems.length < capability.maxMedia && (
            <button
              type="button"
              onClick={handleAddMedia}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 flex items-center gap-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> {isThreadFormat ? "Add Post" : "Add Asset"}
            </button>
          )}

          {mediaItems.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveMedia(activeMediaIndex)}
              className="p-1.5 text-slate-400 hover:text-red-500 ml-auto shrink-0 transition-colors"
              title={isThreadFormat ? "Delete Active Post" : "Delete Active Asset"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE MEDIA VIEWER & PROMPT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-5 space-y-3.5">
          <div className="relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center min-h-[220px] max-w-[220px] aspect-square overflow-hidden group shadow-2xs mx-auto">
            {isRenderingSingleAI ? (
              <GenerationProgressIndicator
                progress={generationProgress}
                stage={generationStage}
                title={`Generating image for ${slotLabel(activeMediaIndex)}...`}
                accentColor="indigo"
                mediaType="image"
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
                  onClick={handleGenerateActiveAsset}
                  disabled={!prompt.trim()}
                  className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              </div>
            ) : activeMedia.url ? (
              <ContentMediaRenderer
                url={activeMedia.url}
                mediaType={activeMedia.type}
                isVertical={false}
                showRemoveButton={false}
                alt={slotLabel(activeMediaIndex)}
              />
            ) : (
              <div className="text-center p-4 space-y-2">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {slotLabel(activeMediaIndex)}
                </p>
                <div className="flex gap-1.5 justify-center pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={onOpenUpload} className="h-7 text-[11px] bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                    <Upload className="h-3 w-3 mr-1 text-emerald-500" /> Upload PC
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={onOpenStock} className="h-7 text-[11px] bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                    <ImageIcon className="h-3 w-3 mr-1 text-pink-500" /> Stock Media
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PROMPT CONTROLS */}
        <div className="xl:col-span-7 space-y-3.5">
          {/* MODEL SETTINGS (GOOGLE NANO BANANA PRO / GEMINI 3 PRO IMAGE) */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-amber-500" /> Image Settings
              </span>
            </div>

            <div className="space-y-2.5">

              {/* 2. Aspect Ratio — only ratios this platform/format actually supports */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Aspect Ratio
                </label>
                <select
                  value={imageAspectRatio}
                  onChange={(e) => setImageAspectRatio(e.target.value)}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-mono"
                >
                  <option value="auto">Auto ({capability.defaultAspectRatio || "1:1"} Platform Default)</option>
                  {(capability.supportedAspectRatios?.length ? capability.supportedAspectRatios : ["1:1", "4:5", "9:16", "16:9"] as const).map((ratio) => (
                    <option key={ratio} value={ratio}>{ratio}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 3. Visual Style */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Visual Style
                  </label>
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
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
                    value={imageQuality}
                    onChange={(e) => setImageQuality(e.target.value)}
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

          {/* VISUAL PROMPT */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-blue-600" />
                {slotLabel(activeMediaIndex)} Visual Prompt
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isEnhancingPrompt || !prompt || !prompt.trim()}
                  onClick={onEnhancePrompt}
                  className={`text-[11px] font-bold flex items-center gap-1 ${
                    !prompt || !prompt.trim()
                      ? "text-slate-400 cursor-not-allowed opacity-50"
                      : "text-blue-600 hover:underline cursor-pointer"
                  }`}
                >
                  {isEnhancingPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
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
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="Describe image for this asset slot..."
                className="h-9 text-xs bg-white dark:bg-slate-900 flex-1"
              />
              <Button
                type="button"
                size="sm"
                disabled={isRenderingSingleAI || (!prompt.trim() && !activeMedia.prompt)}
                onClick={handleGenerateActiveAsset}
                className="h-9 px-3 text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white shrink-0 font-bold gap-1"
              >
                {isRenderingSingleAI && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>
                  {isRenderingSingleAI
                    ? "Generating..."
                    : activeMedia.url
                    ? "Regenerate"
                    : "Generate"}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* CAPTION & HASHTAGS */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
        {isThreadFormat && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-blue-600" /> {slotLabel(activeMediaIndex)} Text
              </label>
              <CharacterCounter current={(activeMedia.caption || "").length} max={capability.captionLimit} />
            </div>
            <Textarea
              rows={2}
              value={activeMedia.caption || ""}
              onChange={(e) => handleUpdateActiveMediaText(e.target.value)}
              placeholder={`Write the text for post ${activeMediaIndex + 1} of this thread...`}
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Post Caption
            </label>
            <CharacterCounter current={caption.length} max={capability.captionLimit} />
          </div>
          <Textarea
            rows={4}
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Write your post caption..."
            className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <Hash className="h-3.5 w-3.5 text-blue-600" /> Hashtags
            </label>
            {onGenerateField && (<button type="button" onClick={() => onGenerateField("hashtags")} disabled={generatingField === "hashtags"} title="Generate Hashtags with AI" className="text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors">
                    {generatingField === "hashtags" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                  </button>)}
          </div>
          <Input
            value={hashtags.join(" ")}
            onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
            placeholder="#technology #automation #marketing"
            className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-lg"
          />
        </div>

        {/* AUTO-GENERATE CAPTION BUTTON */}
        <div className="pt-1">
          <Button
            type="button"
            size="sm"
            disabled={isGeneratingCopy}
            onClick={onGenerateCopyAI}
            className="w-full h-8.5 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white shadow-2xs rounded-lg"
          >
            {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>Generate Captions, Hashtags & Media Prompts with AI</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
