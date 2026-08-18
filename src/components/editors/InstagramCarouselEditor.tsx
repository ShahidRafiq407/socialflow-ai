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
  MapPin,
  Download,
  Settings2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";
import ContentMediaRenderer from "@/components/ui/ContentMediaRenderer";

export interface CarouselSlideItem {
  slideNumber: number;
  title: string;
  body: string;
  visualPrompt: string;
  imageUrl?: string;
  theme?: string;
  type?: string;
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
  onRenderSlideMedia: (options?: {
    mediaType?: "image" | "video";
    duration?: number;
    prompt?: string;
    aspectRatio?: string;
    videoTask?: string;
    sourceImage?: string | null;
    sourceVideo?: string | null;
    style?: string;
    quality?: string;
    slideIndex?: number;
  }) => void;
  onReorderCards?: (fromIdx: number, toIdx: number) => void;
  isRenderingSlideMedia?: boolean;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
  generationProgress?: number;
  generationStage?: string;
  renderError?: string | null;
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
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
  onReorderCards,
  isRenderingSlideMedia = false,
  onCaptionToPrompt,
  isGeneratingPromptFromScript = false,
  generationProgress = 0,
  generationStage,
  renderError = null,
  onGenerateField,
  generatingField = null,
}: InstagramCarouselEditorProps) {
  const [slideStyle, setSlideStyle] = useState("photorealistic");
  const [slideQuality, setSlideQuality] = useState("studio_4k");
  const [slideAspectRatio, setSlideAspectRatio] = useState("auto");
  const [location, setLocation] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(true);

  const effectiveSlides = slides.length > 0 ? slides : [
    { slideNumber: 1, title: "Cover Slide", body: "Hook your audience with a compelling headline", visualPrompt: "Clean minimal cover graphic" },
    { slideNumber: 2, title: "Key Insight 1", body: "Explain the first core concept with value", visualPrompt: "Infographic visual style diagram" },
    { slideNumber: 3, title: "Action Step", body: "Provide actionable takeaway and closing CTA", visualPrompt: "Call to action checklist graphic" },
  ];

  const currentIdx = Math.min(Math.max(0, activeSlideIndex), effectiveSlides.length - 1);
  const activeSlide = effectiveSlides[currentIdx] || effectiveSlides[0];
  const hasCaption = Boolean(caption && caption.trim().length > 0);

  const handleUpdateActiveSlide = (field: keyof CarouselSlideItem, value: any) => {
    const updated = [...effectiveSlides];
    if (!updated[currentIdx]) {
      updated[currentIdx] = { ...activeSlide };
    }
    updated[currentIdx] = {
      ...updated[currentIdx],
      [field]: value,
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
        title: `Slide ${newSlideNum}`,
        body: `Details and takeaways for slide ${newSlideNum}`,
        visualPrompt: `Visual design concept for slide ${newSlideNum}`,
      },
    ];
    onSlidesChange(updated);
    onActiveSlideChange(effectiveSlides.length);
  };

  const handleRemoveSlide = (idx: number) => {
    if (effectiveSlides.length <= 2) return;
    const updated = effectiveSlides
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, slideNumber: i + 1 }));
    onSlidesChange(updated);
    onActiveSlideChange(Math.max(0, currentIdx - 1));
  };

  return (
    <div className="space-y-4 text-left">
      {/* SLIDE TIMELINE STRIP */}
      <div className="p-3.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-pink-500" />
            Carousel Slide Sequence ({effectiveSlides.length} Slides)
          </span>
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            Active: Slide {currentIdx + 1} of {effectiveSlides.length}
            {onReorderCards && effectiveSlides.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => onReorderCards(currentIdx, currentIdx - 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-pink-600 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                  title="Move Slide Left"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={currentIdx === effectiveSlides.length - 1}
                  onClick={() => onReorderCards(currentIdx, currentIdx + 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-pink-600 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                  title="Move Slide Right"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => onActiveSlideChange(Math.max(0, currentIdx - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
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
                  ? "bg-pink-600 text-white shadow-xs ring-2 ring-pink-400/30"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>Slide {idx + 1}</span>
            </button>
          ))}

          <button
            type="button"
            disabled={currentIdx >= effectiveSlides.length - 1}
            onClick={() => onActiveSlideChange(Math.min(effectiveSlides.length - 1, currentIdx + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
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

          {effectiveSlides.length > 2 && (
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

      {/* ACTIVE SLIDE EDITOR (LEFT PREVIEW + RIGHT CONTENT) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: ACTIVE SLIDE VISUAL CARD */}
        <div className="xl:col-span-5 space-y-3.5">
          <div className="relative rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2 flex flex-col items-center justify-center min-h-[260px] max-w-[220px] mx-auto aspect-[4/5] overflow-hidden group shadow-2xs">
            {isRenderingSlideMedia ? (
              <GenerationProgressIndicator
                progress={generationProgress || 0}
                stage={generationStage}
                title={`Slide ${currentIdx + 1} Visual`}
                accentColor="pink"
                mediaType="carousel"
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
                  disabled={!activeSlide.visualPrompt.trim()}
                  onClick={() => {
                    const supportedRatios = capability.supportedAspectRatios?.length ? capability.supportedAspectRatios : [];
                    const safeAspectRatio =
                      slideAspectRatio !== "auto" && supportedRatios.includes(slideAspectRatio as any)
                        ? slideAspectRatio
                        : capability.defaultAspectRatio;
                    onRenderSlideMedia({
                      aspectRatio: safeAspectRatio,
                      style: slideStyle,
                      quality: slideQuality,
                    });
                  }}
                  className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              </div>
            ) : activeSlide.imageUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <ContentMediaRenderer
                  url={activeSlide.imageUrl}
                  isVertical={false}
                  showRemoveButton={false}
                  showDownloadButton={false}
                  alt={`Slide ${currentIdx + 1}`}
                />
                {/* OVERLAY BADGE */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 pointer-events-none z-10">
                  <span className="bg-slate-900/90 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded w-max mb-1">
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

          {/* SAVE / DOWNLOAD SLIDE IMAGE BUTTON */}
          {activeSlide.imageUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation();
                const imgUrl = activeSlide.imageUrl;
                if (!imgUrl) return;
                try {
                  const filename = `carousel_slide_${currentIdx + 1}_${Date.now()}.png`;
                  if (imgUrl.startsWith("data:")) {
                    const a = document.createElement("a");
                    a.href = imgUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    return;
                  }
                  const res = await fetch(imgUrl);
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
                  window.open(imgUrl, "_blank");
                }
              }}
              className="w-full text-xs font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center gap-1.5 h-8.5 rounded-xl shadow-2xs transition-all"
            >
              <Download className="h-4 w-4" /> Save Slide {currentIdx + 1} Image (.png)
            </Button>
          )}

          {/* MODEL SETTINGS (GOOGLE NANO BANANA PRO / GEMINI 3 PRO IMAGE) */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-amber-500" /> Image Settings
              </span>
            </div>

            <div className="space-y-2.5">

              {/* 2. Aspect Ratio */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Aspect Ratio
                </label>
                <select
                  value={slideAspectRatio}
                  onChange={(e) => setSlideAspectRatio(e.target.value)}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-mono"
                >
                  <option value="auto">Auto ({capability.defaultAspectRatio || "1:1"} Platform Default)</option>
                  {(capability.supportedAspectRatios?.length ? capability.supportedAspectRatios : ["1:1", "4:5", "9:16", "16:9"] as const).map((ratio) => (
                    <option key={ratio} value={ratio}>{ratio}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 3. Visual Style */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Visual Style
                  </label>
                  <select
                    value={slideStyle}
                    onChange={(e) => setSlideStyle(e.target.value)}
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

                {/* 4. Quality */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Quality
                  </label>
                  <select
                    value={slideQuality}
                    onChange={(e) => setSlideQuality(e.target.value)}
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
                  disabled={!activeSlide.visualPrompt || !activeSlide.visualPrompt.trim()}
                  onClick={() => {
                    handleUpdateActiveSlide("visualPrompt", `${activeSlide.visualPrompt}, hyper-detailed photography, professional studio lighting, 8k resolution`);
                  }}
                  className={`text-[11px] font-semibold flex items-center gap-0.5 transition-all ${
                    !activeSlide.visualPrompt || !activeSlide.visualPrompt.trim()
                      ? "text-slate-400 cursor-not-allowed opacity-50"
                      : "text-purple-600 hover:text-purple-700 hover:underline cursor-pointer"
                  }`}
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
              onClick={() => {
                const supportedRatios = capability.supportedAspectRatios?.length ? capability.supportedAspectRatios : [];
                const safeAspectRatio =
                  slideAspectRatio !== "auto" && supportedRatios.includes(slideAspectRatio as any)
                    ? slideAspectRatio
                    : capability.defaultAspectRatio;
                onRenderSlideMedia({
                  aspectRatio: safeAspectRatio,
                  style: slideStyle,
                  quality: slideQuality,
                });
              }}
              className="w-full h-9 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white shadow-xs"
            >
              {isRenderingSlideMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isRenderingSlideMedia ? `Generating Slide ${currentIdx + 1} Visual...` : `Generate Slide ${currentIdx + 1} Visual`}</span>
            </Button>
          </div>
        </div>

        {/* RIGHT: SLIDE CONTENT FIELDS */}
        <div className="xl:col-span-7 space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Slide {currentIdx + 1} Step Header
            </label>
            <Input
              value={activeSlide.title}
              onChange={(e) => handleUpdateActiveSlide("title", e.target.value)}
              placeholder={`e.g. 0${currentIdx + 1} // The Core Framework`}
              className="h-8.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Slide {currentIdx + 1} Body Copy (Rendered on visual overlay)
            </label>
            <Textarea
              rows={3}
              value={activeSlide.body}
              onChange={(e) => handleUpdateActiveSlide("body", e.target.value)}
              placeholder="Write 1-2 high-value, crisp sentences for this carousel slide..."
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRegeneratingSlide}
            onClick={() => onRegenerateSlideAI(currentIdx)}
            className="w-full h-8.5 text-xs font-bold gap-1.5 border-pink-200 dark:border-pink-900/50 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/30"
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
                  {onGenerateField && (<button type="button" onClick={() => onGenerateField("hashtags")} disabled={generatingField === "hashtags"} title="Generate Hashtags with AI" className="text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors">
                      {generatingField === "hashtags" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                    </button>)}
            <Input
              value={hashtags.join(" ")}
              onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
              placeholder="#marketing #robotics #ai #growth"
              className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-lg"
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
              className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-lg"
            />
          </div>
        </div>

        {/* AUTO-GENERATE FULL CAROUSEL BUTTON */}
        <div className="pt-1">
          <Button
            type="button"
            size="sm"
            disabled={isGeneratingAI}
            onClick={onGenerateCarouselAI}
            className="w-full h-8.5 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white shadow-2xs rounded-lg"
          >
            {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>{isGeneratingAI ? (generationProgress > 0 ? `Generating Carousel (${generationProgress}%)...` : "Generating Full Carousel...") : "Generate Carousel Slides, Captions & Prompts with AI"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
