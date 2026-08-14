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
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";

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
  onRenderSingleAI: () => void;
  isRenderingSingleAI: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
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
}: MultiMediaEditorProps) {
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

  return (
    <div className="space-y-6 text-left">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-600 text-white font-bold text-xs uppercase px-2.5 py-0.5">
            {capability.label}
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            Attach up to {capability.maxMedia} Photos & Videos
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isGeneratingAllMedia}
            onClick={onGenerateAllMediaAI}
            className="h-8 text-xs font-bold gap-1"
          >
            {isGeneratingAllMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-blue-600" />}
            <span>Regenerate All Assets</span>
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isGeneratingCopy}
            onClick={onGenerateCopyAI}
            className="h-8 text-xs font-bold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
          >
            {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>Auto-Generate Copy</span>
          </Button>
        </div>
      </div>

      {/* MEDIA GRID / STRIP */}
      <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-blue-600" />
            Media Assets ({mediaItems.length} of {capability.maxMedia})
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            Active: Asset {activeMediaIndex + 1}
          </span>
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
                  ? "bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/30"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>Asset {idx + 1}</span>
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
              <Plus className="h-3.5 w-3.5" /> Add Asset
            </button>
          )}

          {mediaItems.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveMedia(activeMediaIndex)}
              className="p-1.5 text-slate-400 hover:text-red-500 ml-auto shrink-0 transition-colors"
              title="Delete Active Asset"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE MEDIA VIEWER & PROMPT */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-5 space-y-3">
          <div className="relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center min-h-[240px] aspect-square overflow-hidden group shadow-2xs">
            {activeMedia.url ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <img
                  src={activeMedia.url}
                  alt={`Asset ${activeMediaIndex + 1}`}
                  className="w-full h-full object-cover rounded-xl"
                />
              </div>
            ) : (
              <div className="text-center p-4 space-y-2">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Asset {activeMediaIndex + 1}
                </p>
                <div className="flex gap-1.5 justify-center pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={onOpenUpload} className="h-7 text-[11px]">
                    <Upload className="h-3 w-3 mr-1 text-emerald-500" /> Upload
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={onOpenStock} className="h-7 text-[11px]">
                    <ImageIcon className="h-3 w-3 mr-1 text-pink-500" /> Stock
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isRenderingSingleAI}
                    onClick={onRenderSingleAI}
                    className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isRenderingSingleAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Gen
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PROMPT CONTROLS */}
        <div className="md:col-span-7 space-y-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-blue-600" />
                Asset {activeMediaIndex + 1} Visual Prompt
              </span>
              <button
                type="button"
                disabled={isEnhancingPrompt}
                onClick={onEnhancePrompt}
                className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                {isEnhancingPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                <span>Enhance Prompt ✨</span>
              </button>
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
                disabled={isRenderingSingleAI}
                onClick={onRenderSingleAI}
                className="h-9 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              >
                Generate
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* CAPTION & HASHTAGS */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
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
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <Hash className="h-3.5 w-3.5 text-blue-600" /> Hashtags
          </label>
          <Input
            value={hashtags.join(" ")}
            onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
            placeholder="#technology #automation #marketing"
            className="h-9 text-xs bg-white dark:bg-slate-900"
          />
        </div>
      </div>
    </div>
  );
}
