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
  RefreshCw,
  Loader2,
  Hash,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";

export interface CarouselSlideItem {
  slideNumber: number;
  title: string;
  body: string;
  visualPrompt: string;
  imageUrl?: string;
  theme?: string;
}

interface InstagramCarouselEditorProps {
  capability: PlatformCapability;
  caption: string;
  onCaptionChange: (val: string) => void;
  hashtags: string[];
  onHashtagsChange: (tags: string[]) => void;
  firstComment: string;
  onFirstCommentChange: (val: string) => void;
  slides: CarouselSlideItem[];
  onSlidesChange: (slides: CarouselSlideItem[]) => void;
  activeSlideIndex: number;
  onActiveSlideChange: (idx: number) => void;
  onGenerateCarouselAI: () => void;
  isGeneratingAI: boolean;
  onRegenerateSlideAI: (slideIdx: number) => void;
  isRegeneratingSlide: boolean;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  onRenderSlideMedia: () => void;
  isRenderingSlideMedia: boolean;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
  generationProgress?: number;
  generationStage?: string;
}

export default function InstagramCarouselEditor({
  capability,
  caption,
  onCaptionChange,
  hashtags,
  onHashtagsChange,
  firstComment,
  onFirstCommentChange,
  slides,
  onSlidesChange,
  activeSlideIndex,
  onActiveSlideChange,
  onGenerateCarouselAI,
  isGeneratingAI,
  onRegenerateSlideAI,
  isRegeneratingSlide,
  onOpenUpload,
  onOpenStock,
  onRenderSlideMedia,
  isRenderingSlideMedia,
  onCaptionToPrompt,
  isGeneratingPromptFromScript = false,
  generationProgress = 0,
  generationStage = "Rendering slide visual...",
}: InstagramCarouselEditorProps) {
  const [location, setLocation] = useState("");

  const effectiveSlides = slides && slides.length > 0 ? slides : [
    { slideNumber: 1, title: "Slide 1", body: "Engaging insight for your audience.", visualPrompt: "Clean modern visual", imageUrl: "" },
    { slideNumber: 2, title: "Slide 2", body: "Step-by-step breakdown or tactical tip.", visualPrompt: "Clean modern visual", imageUrl: "" },
    { slideNumber: 3, title: "Slide 3", body: "Summary and call to action.", visualPrompt: "Clean modern visual", imageUrl: "" },
  ];

  const currentIdx = Math.min(Math.max(activeSlideIndex, 0), effectiveSlides.length - 1);
  const activeSlide = effectiveSlides[currentIdx] || effectiveSlides[0];
  const hasCaption = Boolean(caption && caption.trim().length > 0);

  const handleUpdateActiveSlide = (field: keyof CarouselSlideItem, val: any) => {
    const updated = [...effectiveSlides];
    updated[currentIdx] = {
      ...updated[currentIdx],
      [field]: val,
    };
    onSlidesChange(updated);
  };

  const handleAddSlide = () => {
    if (effectiveSlides.length >= 10) return;
    const newSlideNum = effectiveSlides.length + 1;
    const updated = [
      ...effectiveSlides,
      {
        slideNumber: newSlideNum,
        title: `Slide ${newSlideNum} Strategy`,
        body: "Actionable takeaway or breakdown.",
        visualPrompt: `Professional visual for slide ${newSlideNum}`,
        imageUrl: "",
      },
    ];
    onSlidesChange(updated);
    onActiveSlideChange(effectiveSlides.length);
  };

  const handleRemoveSlide = (idx: number) => {
    if (effectiveSlides.length <= 1) return;
    const updated = effectiveSlides
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, slideNumber: i + 1 }));
    onSlidesChange(updated);
    onActiveSlideChange(Math.max(0, currentIdx - 1));
  };

  return (
    <div className="space-y-6 text-left">
      {/* HEADER & ACTIONS */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xs uppercase px-2.5 py-0.5">
            Instagram Feed Carousel
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            2–10 Seamless Slides (1:1 / 4:5 Aspect Ratio)
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={isGeneratingAI}
          onClick={onGenerateCarouselAI}
          className="h-8 text-xs font-bold gap-1.5 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 text-white shadow-xs hover:opacity-90"
        >
          {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>{isGeneratingAI ? `Generating Full Carousel (${generationProgress || 0}%)...` : "Generate Full Carousel with AI"}</span>
        </Button>
      </div>

      {/* SLIDE TIMELINE STRIP */}
      <div className="p-3.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-pink-500" />
            Carousel Slide Sequence ({effectiveSlides.length} Slides)
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            Active: Slide {currentIdx + 1} of {effectiveSlides.length}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => onActiveSlideChange(Math.max(0, currentIdx - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
            title="Previous Slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {effectiveSlides.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onActiveSlideChange(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                currentIdx === idx
                  ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xs ring-2 ring-pink-400/30"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>Slide {idx + 1}</span>
              {s.imageUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}

          <button
            type="button"
            disabled={currentIdx >= effectiveSlides.length - 1}
            onClick={() => onActiveSlideChange(Math.min(effectiveSlides.length - 1, currentIdx + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
            title="Next Slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {effectiveSlides.length < 10 && (
            <button
              type="button"
              onClick={handleAddSlide}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-pink-600 flex items-center gap-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add Slide
            </button>
          )}

          {effectiveSlides.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveSlide(currentIdx)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-100 flex items-center gap-1 ml-auto shrink-0 transition-colors"
              title={`Delete Slide ${currentIdx + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Slide {currentIdx + 1}</span>
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE SLIDE DESIGNER & PREVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT: SLIDE PREVIEW BOX (1:1 SQUARE) + UNIFIED PROMPT */}
        <div className="md:col-span-5 space-y-4">
          <div className="relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center min-h-[260px] aspect-square overflow-hidden group shadow-2xs">
            {isRenderingSlideMedia ? (
              <GenerationProgressIndicator
                progress={generationProgress}
                stage={generationStage}
                title={`Slide ${currentIdx + 1} Visual`}
                isVertical={false}
                accentColor="pink"
                mediaType="carousel"
              />
            ) : activeSlide.imageUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <img
                  src={activeSlide.imageUrl}
                  alt={`Slide ${currentIdx + 1}`}
                  className="w-full h-full object-cover rounded-xl"
                />
                {/* OVERLAY BADGE */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 pointer-events-none">
                  <span className="bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded w-max mb-1">
                    Slide {currentIdx + 1} of {effectiveSlides.length}
                  </span>
                  <p className="text-white text-xs font-bold line-clamp-1">{activeSlide.title}</p>
                </div>
              </div>
            ) : (
              <div className="text-center p-4 space-y-2.5">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5">
                    Slide Visual
                  </span>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Slide {currentIdx + 1}
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

          {/* UNIFIED SLIDE PROMPT CONTROLS */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Slide Prompt
              </label>
              <div className="flex items-center gap-3">
                {onCaptionToPrompt && (
                  <button
                    type="button"
                    disabled={isGeneratingPromptFromScript || !hasCaption}
                    onClick={onCaptionToPrompt}
                    title={hasCaption ? "Generate slide prompt from current caption" : "Please enter a caption first"}
                    className={`text-[11px] font-semibold transition-colors ${
                      hasCaption
                        ? "text-pink-600 hover:text-pink-700 hover:underline cursor-pointer"
                        : "text-slate-400 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {isGeneratingPromptFromScript ? "Generating..." : "Auto-Prompt from Caption"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    handleUpdateActiveSlide("visualPrompt", `${activeSlide.visualPrompt || "clean modern aesthetic"}, hyper-detailed photography, professional studio lighting, 8k resolution`);
                  }}
                  className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  <span>Enhance Prompt ✨</span>
                </button>
              </div>
            </div>

            <Textarea
              rows={3}
              value={activeSlide.visualPrompt}
              onChange={(e) => handleUpdateActiveSlide("visualPrompt", e.target.value)}
              placeholder="Describe image aesthetic, subject placement, and color palette for this slide..."
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 font-mono leading-relaxed"
            />

            <Button
              type="button"
              size="sm"
              disabled={isRenderingSlideMedia || !activeSlide.visualPrompt.trim()}
              onClick={onRenderSlideMedia}
              className="w-full h-9 text-xs font-bold gap-1.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xs hover:opacity-90"
            >
              {isRenderingSlideMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isRenderingSlideMedia ? `Generating Slide ${currentIdx + 1} (${generationProgress || 0}%)...` : `Generate Slide ${currentIdx + 1} Visual`}</span>
            </Button>
          </div>
        </div>

        {/* RIGHT: SLIDE CONTENT FIELDS */}
        <div className="md:col-span-7 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Slide {currentIdx + 1} Step Header
            </label>
            <Input
              value={activeSlide.title}
              onChange={(e) => handleUpdateActiveSlide("title", e.target.value)}
              placeholder={`e.g. 0${currentIdx + 1} // The Core Framework`}
              className="h-10 text-xs sm:text-sm font-semibold rounded-xl bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Slide {currentIdx + 1} Body Copy (Rendered on visual overlay)
            </label>
            <Textarea
              rows={4}
              value={activeSlide.body}
              onChange={(e) => handleUpdateActiveSlide("body", e.target.value)}
              placeholder="Write 1-2 high-value, crisp sentences for this carousel slide..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRegeneratingSlide}
            onClick={() => onRegenerateSlideAI(currentIdx)}
            className="w-full h-9 text-xs font-bold gap-1.5 border-pink-200 dark:border-pink-900/50 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/30"
          >
            {isRegeneratingSlide ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span>Regenerate Slide {currentIdx + 1} Copy & Visual</span>
          </Button>
        </div>
      </div>

      {/* SHARED POST CAPTION & HASHTAGS */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Instagram Post Caption (Shared)
            </label>
            <CharacterCounter current={caption.length} max={capability.captionLimit} />
          </div>
          <Textarea
            rows={4}
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Write your comprehensive carousel caption, breakdown, and call to action..."
            className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
          />
        </div>

        {/* HASHTAGS & LOCATION */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Hashtags
            </label>
            <Input
              value={hashtags.join(" ")}
              onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
              placeholder="#marketing #robotics #ai #growth"
              className="h-9 text-xs bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Add Location
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. San Francisco, California"
              className="h-9 text-xs bg-white dark:bg-slate-900"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
