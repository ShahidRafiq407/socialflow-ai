"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Upload,
  ImageIcon,
  Trash2,
  Wand2,
  Loader2,
  Hash,
  MessageSquare,
  Eye,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";

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
}: StandardSocialEditorProps) {
  const isSquare = capability.defaultAspectRatio === "1:1";
  const isWide = capability.defaultAspectRatio === "16:9" || capability.defaultAspectRatio === "1.91:1";

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
        {/* LEFT: IMAGE PREVIEW & CONTROLS */}
        <div className="md:col-span-5 space-y-3">
          <div className={`relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center overflow-hidden group shadow-2xs mx-auto ${
            isSquare ? "w-full aspect-square max-w-[280px]" : "w-full aspect-[16/9]"
          }`}>
            {displayImageUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <img
                  src={displayImageUrl}
                  alt="Post preview"
                  className="w-full h-full object-cover rounded-xl"
                />
                <button
                  type="button"
                  onClick={onRemoveMedia}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors z-30"
                  title="Remove Image"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-center p-4 space-y-2">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  No Image Attached
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
                    disabled={isRenderingMedia}
                    onClick={onRenderAI}
                    className="h-7 text-[11px] bg-gradient-to-r from-primary to-indigo-600 text-white"
                  >
                    {isRenderingMedia ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Gen
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* AI IMAGE PROMPT CONTROLS */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Wand2 className="h-3.5 w-3.5 text-primary" /> Visual Prompt
              </span>
              <button
                type="button"
                disabled={isEnhancingPrompt}
                onClick={onEnhancePrompt}
                className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
              >
                {isEnhancingPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                <span>Enhance ✨</span>
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="Describe image visual design..."
                className="h-9 text-xs bg-white dark:bg-slate-900 flex-1"
              />
              <Button
                type="button"
                size="sm"
                disabled={isRenderingMedia}
                onClick={onRenderAI}
                className="h-9 px-3 text-xs bg-primary hover:bg-primary/90 text-white shrink-0"
              >
                Generate
              </Button>
            </div>
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
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5 text-primary" /> Hashtags
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
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5 text-slate-400" /> First Comment
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
