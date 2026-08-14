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
  MapPin,
  Tag,
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
}: InstagramCarouselEditorProps) {
  const [location, setLocation] = useState("");
  const activeSlide = slides[activeSlideIndex] || slides[0] || {
    slideNumber: 1,
    title: "Slide 1",
    body: "Engaging insight for your audience.",
    visualPrompt: "Clean modern visual",
    imageUrl: "",
  };

  const handleUpdateActiveSlide = (field: keyof CarouselSlideItem, val: any) => {
    const updated = [...slides];
    if (!updated[activeSlideIndex]) {
      updated[activeSlideIndex] = { ...activeSlide };
    }
    updated[activeSlideIndex] = {
      ...updated[activeSlideIndex],
      [field]: val,
    };
    onSlidesChange(updated);
  };

  const handleAddSlide = () => {
    if (slides.length >= 10) return;
    const newSlideNum = slides.length + 1;
    const updated = [
      ...slides,
      {
        slideNumber: newSlideNum,
        title: `Slide ${newSlideNum} Strategy`,
        body: "Actionable takeaway or breakdown.",
        visualPrompt: `Professional visual for slide ${newSlideNum}`,
        imageUrl: "",
      },
    ];
    onSlidesChange(updated);
    onActiveSlideChange(slides.length);
  };

  const handleRemoveSlide = (idx: number) => {
    if (slides.length <= 2) return;
    const updated = slides
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, slideNumber: i + 1 }));
    onSlidesChange(updated);
    onActiveSlideChange(Math.max(0, activeSlideIndex - 1));
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
          <span>Generate Full Carousel with AI</span>
        </Button>
      </div>

      {/* SLIDE TIMELINE STRIP */}
      <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-pink-500" />
            Carousel Slide Sequence ({slides.length} Slides)
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            Active: Slide {activeSlideIndex + 1} of {slides.length}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            type="button"
            disabled={activeSlideIndex === 0}
            onClick={() => onActiveSlideChange(Math.max(0, activeSlideIndex - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {slides.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onActiveSlideChange(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeSlideIndex === idx
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
            disabled={activeSlideIndex >= slides.length - 1}
            onClick={() => onActiveSlideChange(Math.min(slides.length - 1, activeSlideIndex + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {slides.length < 10 && (
            <button
              type="button"
              onClick={handleAddSlide}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-pink-600 flex items-center gap-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add Slide
            </button>
          )}

          {slides.length > 2 && (
            <button
              type="button"
              onClick={() => handleRemoveSlide(activeSlideIndex)}
              className="p-1.5 text-slate-400 hover:text-red-500 ml-auto shrink-0 transition-colors"
              title="Delete Active Slide"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE SLIDE DESIGNER & PREVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT: SLIDE PREVIEW BOX (1:1 SQUARE) */}
        <div className="md:col-span-5 space-y-3">
          <div className="relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center min-h-[260px] aspect-square overflow-hidden group shadow-2xs">
            {activeSlide.imageUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <img
                  src={activeSlide.imageUrl}
                  alt={`Slide ${activeSlideIndex + 1}`}
                  className="w-full h-full object-cover rounded-xl"
                />
                {/* OVERLAY BADGE */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 pointer-events-none">
                  <span className="bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded w-max mb-1">
                    Slide {activeSlideIndex + 1} of {slides.length}
                  </span>
                  <p className="text-white text-xs font-bold line-clamp-1">{activeSlide.title}</p>
                </div>
              </div>
            ) : (
              <div className="text-center p-4 space-y-2">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Slide {activeSlideIndex + 1} Visual
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
                    disabled={isRenderingSlideMedia}
                    onClick={onRenderSlideMedia}
                    className="h-7 text-[11px] bg-pink-600 hover:bg-pink-700 text-white"
                  >
                    {isRenderingSlideMedia ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Gen
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRegeneratingSlide}
            onClick={() => onRegenerateSlideAI(activeSlideIndex)}
            className="w-full h-8 text-xs font-bold gap-1.5 border-pink-200 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/30"
          >
            {isRegeneratingSlide ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span>Regenerate Slide {activeSlideIndex + 1} Copy & Visual</span>
          </Button>
        </div>

        {/* RIGHT: SLIDE CONTENT FIELDS */}
        <div className="md:col-span-7 space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Slide {activeSlideIndex + 1} Step Header
            </label>
            <Input
              value={activeSlide.title}
              onChange={(e) => handleUpdateActiveSlide("title", e.target.value)}
              placeholder={`e.g. 0${activeSlideIndex + 1} // The Core Framework`}
              className="h-9 text-xs sm:text-sm font-semibold rounded-xl bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Slide {activeSlideIndex + 1} Body Copy (Rendered on visual overlay)
            </label>
            <Textarea
              rows={2}
              value={activeSlide.body}
              onChange={(e) => handleUpdateActiveSlide("body", e.target.value)}
              placeholder="Write 1-2 high-value, crisp sentences for this carousel slide..."
              className="w-full text-xs sm:text-sm p-2.5 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <Wand2 className="h-3 w-3 text-pink-500" /> Slide {activeSlideIndex + 1} Image Prompt
            </label>
            <div className="flex gap-1.5">
              <Input
                value={activeSlide.visualPrompt}
                onChange={(e) => handleUpdateActiveSlide("visualPrompt", e.target.value)}
                placeholder="Describe image aesthetic for this slide..."
                className="h-9 text-xs bg-white dark:bg-slate-900 flex-1"
              />
              <Button
                type="button"
                size="sm"
                disabled={isRenderingSlideMedia}
                onClick={onRenderSlideMedia}
                className="h-9 px-2.5 text-xs bg-pink-600 hover:bg-pink-700 text-white shrink-0"
              >
                <Sparkles className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* SHARED POST CAPTION & HASHTAGS */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <span>Instagram Post Caption (Shared)</span>
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
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <Hash className="h-3.5 w-3.5 text-pink-500" /> Hashtags
            </label>
            <Input
              value={hashtags.join(" ")}
              onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
              placeholder="#marketing #robotics #ai #growth"
              className="h-9 text-xs bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" /> Add Location
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
