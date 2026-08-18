"use client";

import React, { useState } from "react";
import {
  Sparkles,
  FileText,
  Upload,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Wand2,
  RefreshCw,
  Loader2,
  Download,
  CheckCircle2,
  Briefcase,
  Hash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import CharacterCounter from "@/components/CharacterCounter";

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
  onSlidesChange: (slides: DocumentSlide[]) => void;
  activeSlideIndex: number;
  onActiveSlideChange: (idx: number) => void;
  onGenerateDocumentAI: () => void;
  isGeneratingAI: boolean;
  onRegenerateSlideAI: (slideIdx: number) => void;
  isRegeneratingSlide: boolean;
  onExportPDF?: () => void;
  isExportingPDF?: boolean;
  onReorderCards?: (fromIdx: number, toIdx: number) => void;
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
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
  isExportingPDF,
  onReorderCards,
  onGenerateField,
  generatingField = null,
}: LinkedInDocumentEditorProps) {
  const activeSlide = slides[activeSlideIndex] || slides[0] || {
    slideNumber: 1,
    type: "hook",
    title: "The Strategic Blueprint",
    points: ["Critical insight", "Key data takeaway"],
    visualPrompt: "Clean corporate minimalist graphic",
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
    if (slides.length <= 2) return;
    const updated = slides
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, slideNumber: i + 1 }));
    onSlidesChange(updated);
    onActiveSlideChange(Math.max(0, activeSlideIndex - 1));
  };

  return (
    <div className="space-y-4 text-left">
      {/* DOCUMENT TITLE & PDF DETAILS */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-[#0A66C2]" />
            Document Title
          </label>
          {onGenerateField && (
            <button type="button" onClick={() => onGenerateField("title")} disabled={generatingField === "title"} title="Generate Title with AI" className="text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors">
              {generatingField === "title" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
            </button>
          )}
        </div>
        <Input
          value={documentTitle}
          onChange={(e) => onDocumentTitleChange(e.target.value)}
          placeholder="e.g. 2026 Modern Automation Playbook: Executive Guide"
          className="h-10 text-xs sm:text-sm font-semibold rounded-xl bg-white dark:bg-slate-900"
        />
      </div>

      {/* SLIDE NAVIGATION STRIP */}
      <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-[#0A66C2]" />
              Document Slides ({slides.length} Pages)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportPDF}
              disabled={isExportingPDF}
              className="h-7 px-2.5 text-[11px] font-bold gap-1 border-slate-300 dark:border-slate-700"
            >
              {isExportingPDF ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 text-slate-600" />}
              <span>Export PDF</span>
            </Button>
          </div>
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            Active: Slide {activeSlideIndex + 1} of {slides.length}
            {onReorderCards && slides.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={activeSlideIndex === 0}
                  onClick={() => onReorderCards(activeSlideIndex, activeSlideIndex - 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-[#0A66C2] hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                  title="Move Slide Left"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={activeSlideIndex === slides.length - 1}
                  onClick={() => onReorderCards(activeSlideIndex, activeSlideIndex + 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-[#0A66C2] hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
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
                  ? "bg-[#0A66C2] text-white shadow-xs ring-2 ring-blue-400/30"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>Slide {idx + 1}</span>
              <span className="text-[9px] opacity-70 uppercase font-mono">({s.type})</span>
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

          {slides.length < 15 && (
            <button
              type="button"
              onClick={handleAddSlide}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-[#0A66C2] flex items-center gap-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add Slide
            </button>
          )}

          {slides.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveSlide(activeSlideIndex)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-100 flex items-center gap-1 ml-auto shrink-0 transition-colors"
              title={`Delete Slide ${activeSlideIndex + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Slide {activeSlideIndex + 1}</span>
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE SLIDE CONTENT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT: SLIDE PREVIEW MOCKUP */}
        <div className="xl:col-span-5 space-y-3.5">
          <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-900 text-white p-4 flex flex-col justify-between min-h-[250px] max-w-[220px] mx-auto aspect-[4/5] shadow-lg relative overflow-hidden">
            {/* TOP HEADER */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">
                {documentTitle || "Executive Presentation"}
              </span>
              <span className="text-[10px] font-mono text-white/50">
                {activeSlideIndex + 1} / {slides.length}
              </span>
            </div>

            {/* MIDDLE SLIDE BODY */}
            <div className="space-y-3 my-auto">
              <h4 className="text-base font-extrabold text-white leading-tight">
                {activeSlide.title}
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {(activeSlide.points || []).map((pt, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-blue-400 font-bold">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* FOOTER */}
            <div className="border-t border-white/10 pt-2 flex items-center justify-between text-[9px] text-slate-400">
              <span>Swipe for next strategy →</span>
              <span className="font-semibold text-blue-400 uppercase">{activeSlide.type}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRegeneratingSlide}
            onClick={() => onRegenerateSlideAI(activeSlideIndex)}
            className="w-full h-8 text-xs font-bold gap-1.5 border-blue-200 text-[#0A66C2] hover:bg-blue-50 dark:hover:bg-blue-950/30"
          >
            {isRegeneratingSlide ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span>Regenerate Slide {activeSlideIndex + 1} with AI</span>
          </Button>
        </div>

        {/* RIGHT: SLIDE EDITING FIELDS */}
        <div className="xl:col-span-7 space-y-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Slide Type</label>
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
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Slide Heading</label>
              <Input
                value={activeSlide.title}
                onChange={(e) => handleUpdateActiveSlide("title", e.target.value)}
                placeholder="Heading on slide"
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
        </div>
      </div>

      {/* POST COMMENTARY (LINKEDIN CAPTION) */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-[#0A66C2]" />
            Post Commentary (LinkedIn Feed Copy)
          </label>
          <CharacterCounter current={commentary.length} max={capability.captionLimit} />
        </div>
        <Textarea
          rows={4}
          value={commentary}
          onChange={(e) => onCommentaryChange(e.target.value)}
          placeholder="Share your executive perspective and introduce the document attached below..."
          className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
        />

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <Hash className="h-3.5 w-3.5 text-[#0A66C2]" /> Professional Hashtags (Max 5 recommended)
          </label>
          <Input
            value={hashtags.join(" ")}
            onChange={(e) => onHashtagsChange(e.target.value.split(" ").filter(Boolean))}
            placeholder="#management #leadership #innovation #b2b"
            className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-lg"
          />
        </div>

        {/* AUTO-GENERATE DOCUMENT BUTTON */}
        <div className="pt-1">
          <Button
            type="button"
            size="sm"
            disabled={isGeneratingAI}
            onClick={onGenerateDocumentAI}
            className="w-full h-8.5 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white shadow-2xs rounded-lg"
          >
            {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>Generate Document Slides & Post Copy with AI</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
