"use client";

import React, { useState, useRef } from "react";
import {
  Sparkles,
  FileText,
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
  Download,
  Settings2,
  AlertCircle,
  Briefcase,
  Hash,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";
import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";
import ContentMediaRenderer from "@/components/ui/ContentMediaRenderer";
import AnalyzeMediaAIButton from "./AnalyzeMediaAIButton";
import CaptionRefineActions from "./CaptionRefineActions";
import { cancelAIAction } from "@/lib/aiActionEvents";
import { IMAGE_MODEL_ID } from "@/lib/agents/mediaModels";
import {
  MIN_DECK_SLIDES,
  SlidesChangeMeta,
  canRemoveDeckSlide,
  nextActiveSlideIndex,
} from "./deckSlides";
import { DECK_MEDIA_FIT, mediaPreviewFrame, resolvePreviewRatio } from "./mediaPreviewFrame";

export interface DocumentSlide {
  slideNumber: number;
  type: "hook" | "content" | "proof" | "cta";
  title: string;
  points: string[];
  visualPrompt: string;
  imageUrl?: string;
}

interface LinkedInDocumentEditorProps {
  capability: PlatformCapability;
  documentTitle: string;
  onDocumentTitleChange: (val: string) => void;
  commentary: string;
  onCommentaryChange: (val: string) => void;
  hashtags: string[];
  onHashtagsChange: (tags: string[]) => void;
  slides: DocumentSlide[];
  onSlidesChange: (slides: DocumentSlide[], meta?: SlidesChangeMeta) => void;
  activeSlideIndex: number;
  onActiveSlideChange: (idx: number) => void;
  onGenerateDocumentAI: () => void;
  isGeneratingAI: boolean;
  onRegenerateSlideAI: (slideIdx: number, prompt?: string) => void;
  isRegeneratingSlide: boolean;
  onExportPDF?: () => void;
  isExportingPDF?: boolean;
  onUploadPDF?: (file: File) => void;
  onReorderCards?: (fromIdx: number, toIdx: number) => void;
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
  onEnhancePrompt?: () => void;
  isEnhancingPrompt?: boolean;
  originalPrompt?: string | null;
  onRestoreOriginalPrompt?: () => void;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
  // Per-page visual generation (same contract the carousel editor uses)
  onRenderSlideMedia?: (options?: {
    mediaType?: "image" | "video";
    prompt?: string;
    aspectRatio?: string;
    style?: string;
    quality?: string;
    imageModel?: string;
    slideIndex?: number;
  }) => void;
  isRenderingSlideMedia?: boolean;
  generationProgress?: number;
  generationStage?: string;
  renderError?: string | null;
  onOpenUpload?: () => void;
  onOpenStock?: () => void;
  // AI analysis of the attached (uploaded/stock) media
  onAnalyzeMedia?: () => void;
  isAnalyzingMedia?: boolean;
  // TRUE only when the current slot holds user-provided media (upload/stock)
  hasUserMedia?: boolean;
  // Caption quick actions (rewrite / boost hook / executive tone / hashtags)
  onAIRefine?: (action: "regenerate" | "boost-hook" | "executive-tone" | "add-hashtags") => void;
  isRefiningCaption?: boolean;
  refiningAction?: string | null;
}

export default function LinkedInDocumentEditor({
  capability,
  documentTitle,
  onDocumentTitleChange,
  commentary,
  onCommentaryChange,
  hashtags,
  onHashtagsChange,
  slides,
  onSlidesChange,
  activeSlideIndex,
  onActiveSlideChange,
  onGenerateDocumentAI,
  isGeneratingAI,
  onRegenerateSlideAI,
  isRegeneratingSlide,
  onExportPDF,
  isExportingPDF = false,
  onUploadPDF,
  onReorderCards,
  onGenerateField,
  generatingField = null,
  onEnhancePrompt,
  isEnhancingPrompt = false,
  originalPrompt,
  onRestoreOriginalPrompt,
  onCaptionToPrompt,
  isGeneratingPromptFromScript = false,
  onRenderSlideMedia,
  isRenderingSlideMedia = false,
  generationProgress = 0,
  generationStage,
  renderError = null,
  onOpenUpload,
  onOpenStock,
  onAnalyzeMedia,
  isAnalyzingMedia = false,
  hasUserMedia = false,
  onAIRefine,
  isRefiningCaption = false,
  refiningAction = null,
}: LinkedInDocumentEditorProps) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [slideCustomPrompt, setSlideCustomPrompt] = useState("");
  const [slideStyle, setSlideStyle] = useState("minimalist");
  const [slideQuality, setSlideQuality] = useState("studio_4k");
  const [slideAspectRatio, setSlideAspectRatio] = useState("auto");
  const formatKey = `${capability.platform}-${capability.format}`;

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onUploadPDF) {
      onUploadPDF(file);
    }
    const cleanName = file.name.replace(/\.pdf$/i, "");
    if (cleanName) {
      onDocumentTitleChange(cleanName);
    }
    e.target.value = "";
  };

  const activeSlide = slides[activeSlideIndex] || slides[0] || {
    slideNumber: 1,
    type: "hook",
    title: "The Strategic Blueprint",
    points: ["Critical insight", "Key data takeaway"],
    visualPrompt: "Clean corporate minimalist graphic",
  };

  const hasCommentary = Boolean(commentary && commentary.trim().length > 0);

  // Document pages are typeset graphics — shown at the real publish ratio so the
  // heading and the bullets are actually readable in the editor.
  const previewFrame = mediaPreviewFrame(
    resolvePreviewRatio(slideAspectRatio, capability.defaultAspectRatio)
  );

  const resolveSlideAspectRatio = () => {
    const supportedRatios = capability.supportedAspectRatios?.length ? capability.supportedAspectRatios : [];
    return slideAspectRatio !== "auto" && supportedRatios.includes(slideAspectRatio as any)
      ? slideAspectRatio
      : capability.defaultAspectRatio;
  };

  const renderActivePageMedia = () => {
    onRenderSlideMedia?.({
      aspectRatio: resolveSlideAspectRatio(),
      style: slideStyle,
      quality: slideQuality,
      imageModel: IMAGE_MODEL_ID,
    });
  };

  const handleUpdateActiveSlide = (field: keyof DocumentSlide, val: any) => {
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
    if (slides.length >= 15) return;
    const newSlideNum = slides.length + 1;
    const updated: DocumentSlide[] = [
      ...slides,
      {
        slideNumber: newSlideNum,
        type: newSlideNum === slides.length + 1 ? "cta" : "content",
        title: `Strategy Step ${newSlideNum}`,
        points: ["Actionable executive takeaway", "Measurable business outcome"],
        visualPrompt: `Professional presentation slide graphic ${newSlideNum}`,
      },
    ];
    onSlidesChange(updated);
    onActiveSlideChange(slides.length);
  };

  const handleRemoveSlide = (idx: number) => {
    // The guard and the button's enabled state now read the same helper. They used to
    // disagree (`<= 2` here, `> 1` on the button), so on a two-page document Delete
    // Slide was clickable and did nothing at all.
    if (!canRemoveDeckSlide(slides.length)) return;
    const updated = slides
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, slideNumber: i + 1 }));
    onSlidesChange(updated, { removedIndex: idx });
    onActiveSlideChange(nextActiveSlideIndex(idx, updated.length));
  };

  return (
    <div className="space-y-4 text-left">
      {/* SLIDE NAVIGATION STRIP */}
      <div className="p-3 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/15 dark:border-primary/20 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mr-1">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Document Pages
              <span className="px-1.5 py-0.5 rounded-md bg-secondary/10 text-secondary text-[10px] font-bold tracking-normal normal-case">
                {slides.length} pages
              </span>
            </span>
            <input
              type="file"
              ref={pdfInputRef}
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handlePdfUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pdfInputRef.current?.click()}
              className="h-7 px-2.5 text-[11px] font-bold gap-1 border-primary/25 text-slate-700 dark:text-slate-200 hover:bg-primary/10 hover:border-primary/50"
              title="Upload an existing PDF document"
            >
              <Upload className="h-3 w-3 text-primary" />
              <span>Upload PDF</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportPDF}
              disabled={isExportingPDF}
              className="h-7 px-2.5 text-[11px] font-bold gap-1 border-primary/25 text-slate-700 dark:text-slate-200 hover:bg-primary/10 hover:border-primary/50"
            >
              {isExportingPDF ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 text-primary" />}
              <span>Export PDF</span>
            </Button>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
            Active: Page {activeSlideIndex + 1} of {slides.length}
            {onReorderCards && slides.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={activeSlideIndex === 0}
                  onClick={() => onReorderCards(activeSlideIndex, activeSlideIndex - 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-secondary hover:bg-secondary/10 disabled:opacity-30 transition-colors"
                  title="Move Page Left"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={activeSlideIndex === slides.length - 1}
                  onClick={() => onReorderCards(activeSlideIndex, activeSlideIndex + 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-secondary hover:bg-secondary/10 disabled:opacity-30 transition-colors"
                  title="Move Page Right"
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
            disabled={activeSlideIndex === 0}
            onClick={() => onActiveSlideChange(Math.max(0, activeSlideIndex - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:hover:text-slate-600 shrink-0 transition-colors"
            title="Previous Page"
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
                  ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/25"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-primary hover:border-primary/40"
              }`}
            >
              <span>Page {idx + 1}</span>
              <span className="text-[9px] opacity-70 uppercase font-mono">({s.type})</span>
              {s.imageUrl && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${activeSlideIndex === idx ? "bg-primary-foreground/70" : "bg-primary"}`}
                />
              )}
            </button>
          ))}

          <button
            type="button"
            disabled={activeSlideIndex >= slides.length - 1}
            onClick={() => onActiveSlideChange(Math.min(slides.length - 1, activeSlideIndex + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:hover:text-slate-600 shrink-0 transition-colors"
            title="Next Page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {slides.length < 15 && (
            <button
              type="button"
              onClick={handleAddSlide}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-secondary/40 text-secondary hover:bg-secondary/10 hover:border-secondary flex items-center gap-1 shrink-0 transition-colors"
              title="Add Page"
            >
              <Plus className="h-3.5 w-3.5" /> Add Page
            </button>
          )}

          {/* Disabled rather than hidden at the floor — see the Instagram editor. */}
          <button
            type="button"
            disabled={!canRemoveDeckSlide(slides.length)}
            onClick={() => handleRemoveSlide(activeSlideIndex)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-destructive/10 border border-destructive/25 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:hover:bg-destructive/10 disabled:cursor-not-allowed flex items-center gap-1 ml-auto shrink-0 transition-colors"
            title={
              canRemoveDeckSlide(slides.length)
                ? `Delete Page ${activeSlideIndex + 1}`
                : `A document needs at least ${MIN_DECK_SLIDES} pages`
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Page {activeSlideIndex + 1}</span>
          </button>
        </div>
      </div>

      {/* PAGE PREVIEW (LEFT) + POST COPY & ONE-CLICK GENERATE (RIGHT) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT: THE GENERATED PAGE AT FULL PUBLISH SIZE */}
        <div className="xl:col-span-5 space-y-3.5">
          <div
            className="relative w-full mx-auto rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-2 flex flex-col items-center justify-center overflow-hidden shadow-2xs"
            style={{ aspectRatio: previewFrame.aspectRatio, maxWidth: previewFrame.maxWidth }}
          >
            {isRenderingSlideMedia ? (
              <GenerationProgressIndicator
                progress={generationProgress || 0}
                stage={generationStage}
                title={`Page ${activeSlideIndex + 1} Visual`}
                accentColor="blue"
                mediaType="carousel"
              />
            ) : activeSlide.imageUrl ? (
              /*
                The generated page graphic — this used to be a hardcoded dark text mock
                that never displayed the image the AI had just produced.
              */
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <ContentMediaRenderer
                  url={activeSlide.imageUrl}
                  className={DECK_MEDIA_FIT}
                  isVertical={false}
                  showRemoveButton={false}
                  showDownloadButton={false}
                  alt={`Document page ${activeSlideIndex + 1}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 pointer-events-none z-10">
                  <span className="bg-slate-900/90 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded w-max mb-1">
                    Page {activeSlideIndex + 1} of {slides.length} · {activeSlide.type}
                  </span>
                  <p className="text-white text-xs font-bold line-clamp-1">{activeSlide.title}</p>
                </div>
              </div>
            ) : (
              /* NO GRAPHIC YET — layout mock of the copy that will be typeset into it */
              <div className="w-full h-full rounded-xl bg-slate-900 text-white p-4 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
                    {documentTitle || "Executive Presentation"}
                  </span>
                  <span className="text-[10px] font-mono text-white/50">
                    {activeSlideIndex + 1} / {slides.length}
                  </span>
                </div>

                <div className="space-y-3 my-auto">
                  <h4 className="text-base font-extrabold text-white leading-tight">
                    {activeSlide.title}
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {(activeSlide.points || []).map((pt, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-primary font-bold">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  {renderError ? (
                    <div className="flex items-start gap-1.5 rounded-lg bg-destructive/15 border border-destructive/30 p-2">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-px" />
                      <p className="text-[10px] text-destructive font-semibold line-clamp-2">{renderError}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>Layout preview — generate to design this page</span>
                    </div>
                  )}
                  {(onOpenUpload || onOpenStock) && (
                    <div className="flex gap-1.5">
                      {onOpenUpload && (
                        <button
                          type="button"
                          onClick={onOpenUpload}
                          className="flex-1 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white flex items-center justify-center gap-1 transition-colors"
                        >
                          <Upload className="h-3 w-3" /> Upload PC
                        </button>
                      )}
                      {onOpenStock && (
                        <button
                          type="button"
                          onClick={onOpenStock}
                          className="flex-1 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white flex items-center justify-center gap-1 transition-colors"
                        >
                          <ImageIcon className="h-3 w-3" /> Stock Media
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

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
                  const filename = `document_page_${activeSlideIndex + 1}_${Date.now()}.png`;
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
              <Download className="h-4 w-4" /> Save Page {activeSlideIndex + 1} Image (.png)
            </Button>
          )}
        </div>

        {/* RIGHT: DOCUMENT TITLE, FEED COPY AND THE ONE ACTION THAT BUILDS THE POST */}
        <div className="xl:col-span-7 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Document Title
              </label>
              {onGenerateField && (
                <button type="button" onClick={() => {
                  if (generatingField === "title") {
                    cancelAIAction("field", `${formatKey}:title`);
                  } else {
                    onGenerateField("title");
                  }
                }} disabled={generatingField !== null && generatingField !== "title"} title={generatingField === "title" ? "Stop generating title" : "Generate Title with AI"} className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                  generatingField === "title"
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : "bg-secondary/10 text-secondary hover:bg-secondary/20"
                } ${generatingField !== null && generatingField !== "title" ? "opacity-50 cursor-not-allowed" : ""}`}>
                  {generatingField === "title" ? <Square className="h-3 w-3 fill-current" /> : <Sparkles className="h-3 w-3" />} {generatingField === "title" ? "Stop" : "AI"}
                </button>
              )}
            </div>
            <Input
              value={documentTitle}
              onChange={(e) => onDocumentTitleChange(e.target.value)}
              placeholder="e.g. 2026 Modern Automation Playbook: Executive Guide"
              className="h-9 text-xs sm:text-sm font-semibold rounded-xl bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
                Post Commentary (Feed Copy)
              </label>
              <CharacterCounter current={commentary.length} max={capability.captionLimit} />
            </div>
            <Textarea
              rows={6}
              value={commentary}
              onChange={(e) => onCommentaryChange(e.target.value)}
              placeholder="Share your executive perspective and introduce the document attached below..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed min-h-44"
            />
            {onAIRefine && (
              <CaptionRefineActions
                formatKey={formatKey}
                caption={commentary}
                onRefine={onAIRefine}
                isRefining={isRefiningCaption}
                refiningAction={refiningAction}
              />
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Hash className="h-3.5 w-3.5 text-secondary" /> Professional Hashtags
              </label>
              {onGenerateField && (
                <button type="button" onClick={() => {
                  if (generatingField === "hashtags") {
                    cancelAIAction("field", `${formatKey}:hashtags`);
                  } else {
                    onGenerateField("hashtags");
                  }
                }} disabled={generatingField !== null && generatingField !== "hashtags"} title={generatingField === "hashtags" ? "Stop generating hashtags" : "Generate Hashtags with AI"} className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                  generatingField === "hashtags"
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : "bg-secondary/10 text-secondary hover:bg-secondary/20"
                } ${generatingField !== null && generatingField !== "hashtags" ? "opacity-50 cursor-not-allowed" : ""}`}>
                  {generatingField === "hashtags" ? <Square className="h-3 w-3 fill-current" /> : <Sparkles className="h-3 w-3" />} {generatingField === "hashtags" ? "Stop" : "AI"}
                </button>
              )}
            </div>
            <Input
              value={hashtags.join(" ")}
              onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
              placeholder="#management #leadership #innovation #b2b"
              className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-lg"
            />
          </div>

          {/* AI MEDIA ANALYSIS — analyze the uploaded/stock media and write matching text */}
          {onAnalyzeMedia && (
            <AnalyzeMediaAIButton
              formatKey={formatKey}
              onClick={onAnalyzeMedia}
              isAnalyzing={isAnalyzingMedia}
              hasMedia={hasUserMedia}
            />
          )}

          {/*
            THE post action. One press writes the page storyboard + commentary +
            hashtags and then designs every page graphic — nothing stops at a prompt.
          */}
          <div className="pt-1 space-y-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (isGeneratingAI) {
                  cancelAIAction("copy", formatKey);
                  return;
                }
                onGenerateDocumentAI();
              }}
              title={isGeneratingAI ? "Stop document generation" : undefined}
              className={`w-full h-auto min-h-9 px-3 py-2 text-xs font-bold gap-1.5 shadow-xs rounded-lg whitespace-normal transition-colors ${
                isGeneratingAI
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isGeneratingAI ? (generationProgress > 0 ? `Generating Document (${generationProgress}%)...` : "Generating Full Document...") : `Generate Complete ${capability.format} Post with AI`}</span>
            </Button>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Writes the commentary and hashtags, then designs all {slides.length} page graphics.
              Every selected platform that shares this format gets the same post.
            </p>
          </div>
        </div>
      </div>

      {/* PAGE CONTENT, IMAGE SETTINGS & PROMPT — under the preview they change */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-start">
          {/* PAGE COPY — typeset into the page graphic */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Page Type</label>
                <select
                  value={activeSlide.type}
                  onChange={(e) => handleUpdateActiveSlide("type", e.target.value)}
                  className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
                >
                  <option value="hook">Hook Slide (Cover)</option>
                  <option value="content">Content / Strategy Slide</option>
                  <option value="proof">Proof / Case Study Slide</option>
                  <option value="cta">Final CTA Slide</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Page Heading</label>
                <Input
                  value={activeSlide.title}
                  onChange={(e) => handleUpdateActiveSlide("title", e.target.value)}
                  placeholder="Heading on page"
                  className="h-8.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Key Bullet Points (1 per line)
              </label>
              <Textarea
                rows={4}
                value={(activeSlide.points || []).join("\n")}
                onChange={(e) => handleUpdateActiveSlide("points", e.target.value.split("\n"))}
                placeholder="First key insight&#10;Second actionable takeaway&#10;Third supporting data point"
                className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 leading-relaxed font-mono"
              />
            </div>

            <div className="space-y-1.5 pt-0.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Wand2 className="h-3 w-3 text-secondary" /> Rewrite Page {activeSlideIndex + 1} Instructions
              </label>
              <Input
                value={slideCustomPrompt}
                onChange={(e) => setSlideCustomPrompt(e.target.value)}
                placeholder="e.g. Focus on measurable ROI and scalability metrics..."
                className="h-8 text-xs bg-white dark:bg-slate-900 rounded-lg"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isRegeneratingSlide && !slideCustomPrompt.trim()}
                onClick={() => {
                  if (isRegeneratingSlide) {
                    cancelAIAction("slide", `${formatKey}:${activeSlideIndex}`);
                    return;
                  }
                  onRegenerateSlideAI(activeSlideIndex, slideCustomPrompt);
                  setSlideCustomPrompt("");
                }}
                className={`w-full h-8 text-xs font-bold gap-1.5 transition-colors ${
                  isRegeneratingSlide
                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                    : "border-secondary/30 text-secondary hover:bg-secondary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
                title={isRegeneratingSlide ? "Stop regenerating this page" : !slideCustomPrompt.trim() ? "Type instructions above to enable page regeneration" : `Regenerate Page ${activeSlideIndex + 1}`}
              >
                {isRegeneratingSlide ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>{isRegeneratingSlide ? `Stop Regenerating Page ${activeSlideIndex + 1}` : `Regenerate Page ${activeSlideIndex + 1} with AI`}</span>
              </Button>
            </div>
          </div>

          {/* MODEL SETTINGS (GOOGLE NANO BANANA PRO / GEMINI 3 PRO IMAGE) */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-amber-500" /> Image Settings
            </span>

            <div className="space-y-2.5">
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
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Visual Style
                  </label>
                  <select
                    value={slideStyle}
                    onChange={(e) => setSlideStyle(e.target.value)}
                    className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="minimalist">Minimalist Corporate (Clean Space)</option>
                    <option value="editorial">Editorial Report (Magazine Style)</option>
                    <option value="photorealistic">Photorealistic (Studio Lighting)</option>
                    <option value="illustration">Vector Illustration (Clean Art)</option>
                    <option value="3d_render">3D Digital Art (Octane Render)</option>
                  </select>
                </div>

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
        </div>

        {/* PAGE VISUAL PROMPT */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Page {activeSlideIndex + 1} Visual Prompt
            </label>
            <div className="flex items-center gap-3">
              {onCaptionToPrompt && (
                <button
                  type="button"
                  disabled={!isGeneratingPromptFromScript && !hasCommentary}
                  onClick={() => {
                    if (isGeneratingPromptFromScript) {
                      cancelAIAction("script", formatKey);
                    } else {
                      onCaptionToPrompt();
                    }
                  }}
                  title={isGeneratingPromptFromScript ? "Stop generating page prompt" : hasCommentary ? "Generate page prompt from the commentary" : "Please write the commentary first"}
                  className={`text-[11px] font-semibold transition-colors ${
                    isGeneratingPromptFromScript
                      ? "text-destructive hover:text-destructive/80 cursor-pointer"
                      : hasCommentary
                      ? "text-primary hover:underline cursor-pointer"
                      : "text-slate-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  {isGeneratingPromptFromScript ? "Stop" : "Auto-Prompt from Commentary"}
                </button>
              )}
              {onEnhancePrompt && (
                <button
                  type="button"
                  disabled={!isEnhancingPrompt && !activeSlide.visualPrompt?.trim()}
                  onClick={() => {
                    if (isEnhancingPrompt) {
                      cancelAIAction("enhance", formatKey);
                    } else {
                      onEnhancePrompt();
                    }
                  }}
                  className={`text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    isEnhancingPrompt
                      ? "text-destructive hover:text-destructive/80 cursor-pointer"
                      : !activeSlide.visualPrompt?.trim()
                        ? "text-slate-400 cursor-not-allowed opacity-50"
                        : "text-secondary hover:underline cursor-pointer"
                  }`}
                >
                  {isEnhancingPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  <span>{isEnhancingPrompt ? "Stop Enhancing" : "Enhance Prompt ✨"}</span>
                </button>
              )}
              {originalPrompt && originalPrompt !== activeSlide.visualPrompt && onRestoreOriginalPrompt && (
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
            value={activeSlide.visualPrompt || ""}
            onChange={(e) => handleUpdateActiveSlide("visualPrompt", e.target.value)}
            placeholder="Describe the page layout, chart or diagram, colour palette and typography for this page..."
            className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 font-mono leading-relaxed"
          />

          {onRenderSlideMedia && (
            <Button
              type="button"
              size="sm"
              disabled={!isRenderingSlideMedia && !activeSlide.visualPrompt?.trim()}
              onClick={isRenderingSlideMedia ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("cancel-render-media", {
                  detail: { formatKey }
                }));
              } : renderActivePageMedia}
              className={`w-full h-9 text-xs font-bold gap-1.5 shadow-xs transition-colors ${
                isRenderingSlideMedia
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
              }`}
            >
              {isRenderingSlideMedia ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Stop Generation</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{`Generate Page ${activeSlideIndex + 1} Visual`}</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
