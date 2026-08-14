"use client";

import React from "react";
import {
  Sparkles,
  Upload,
  ImageIcon,
  Trash2,
  Loader2,
  Hash,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";

import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";

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
  onRenderAI: () => void;
  isRenderingMedia: boolean;
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
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
  generationProgress = 0,
  generationStage = "Rendering image canvas...",
}: StandardSocialEditorProps) {
  const isSquare = capability.defaultAspectRatio === "1:1";
  const hasCaption = Boolean(caption && caption.trim().length > 0);

  return (
    <div className="space-y-6 text-left">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-bold text-xs uppercase px-2.5 py-0.5 border-slate-300 dark:border-slate-700">
            {capability.label}
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            Standard Post ({capability.defaultAspectRatio} Aspect Ratio)
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
        {/* LEFT: IMAGE PREVIEW & UNIFIED PROMPT SECTION */}
        <div className="md:col-span-5 space-y-4">
          {/* IMAGE PREVIEW CONTAINER */}
          <div className={`relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center overflow-hidden group shadow-2xs mx-auto ${
            isSquare ? "w-full aspect-square max-w-[280px]" : "w-full aspect-[16/9]"
          }`}>
            {isRenderingMedia ? (
              <GenerationProgressIndicator
                progress={generationProgress}
                stage={generationStage}
                title="Generating Image..."
                isVertical={isSquare}
                accentColor="indigo"
                mediaType="image"
              />
            ) : displayImageUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <img
                  src={displayImageUrl}
                  alt="Post preview"
                  className="w-full h-full object-cover rounded-xl"
                />
                <button
                  type="button"
                  onClick={onRemoveMedia}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors z-30 shadow-md"
                  title="Remove Image"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-center p-4 space-y-2.5">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5">
                    Image Preview
                  </span>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    No image attached
                  </p>
                </div>
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

          {/* UNIFIED PROMPT CONTROLS (ORGANIZED & LARGE LIKE REEL) */}
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
                    title={hasCaption ? "Generate image prompt from current caption" : "Please enter a caption first"}
                    className={`text-[11px] font-semibold transition-colors ${
                      hasCaption
                        ? "text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                        : "text-slate-400 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {isGeneratingPromptFromScript ? "Generating Prompt..." : "Auto-Prompt from Caption"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isEnhancingPrompt}
                  onClick={onEnhancePrompt}
                  className="text-[11px] font-semibold text-pink-600 hover:text-pink-700 hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  <span>Enhance Prompt ✨</span>
                </button>
              </div>
            </div>

            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Describe photographic visual style, subject composition, lighting, and textures..."
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 font-mono leading-relaxed"
            />

            <Button
              type="button"
              size="sm"
              disabled={isRenderingMedia || !prompt.trim()}
              onClick={onRenderAI}
              className="w-full h-9 text-xs font-bold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 text-white shadow-xs hover:opacity-90"
            >
              {isRenderingMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isRenderingMedia ? `Generating Image (${generationProgress || 0}%)...` : "Generate Image"}</span>
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
