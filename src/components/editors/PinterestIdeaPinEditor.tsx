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
  Link as LinkIcon,
  Tag,
  ShoppingBag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";

interface IdeaPinPage {
  pageNumber: number;
  title: string;
  body: string;
  visualPrompt: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
}

interface PinterestIdeaPinEditorProps {
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
  pages: IdeaPinPage[];
  onPagesChange: (pages: IdeaPinPage[]) => void;
  activePageIndex: number;
  onActivePageChange: (idx: number) => void;
  onGenerateIdeaPinAI: () => void;
  isGeneratingAI: boolean;
  onRegeneratePageAI: (pageIdx: number) => void;
  isRegeneratingPage: boolean;
  onOpenUpload: () => void;
  onOpenStock: () => void;
}

export default function PinterestIdeaPinEditor({
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
  pages,
  onPagesChange,
  activePageIndex,
  onActivePageChange,
  onGenerateIdeaPinAI,
  isGeneratingAI,
  onRegeneratePageAI,
  isRegeneratingPage,
  onOpenUpload,
  onOpenStock,
}: PinterestIdeaPinEditorProps) {
  const [topicInput, setTopicInput] = useState("");
  const activePage = pages[activePageIndex] || pages[0] || {
    pageNumber: 1,
    title: "Intro Page",
    body: "Start with an eye-catching visual and problem statement.",
    visualPrompt: "Vertical aesthetic design",
    mediaUrl: ""
  };

  const handleUpdateActivePage = (field: keyof IdeaPinPage, value: any) => {
    const updated = [...pages];
    if (!updated[activePageIndex]) {
      updated[activePageIndex] = { ...activePage };
    }
    updated[activePageIndex] = {
      ...updated[activePageIndex],
      [field]: value,
    };
    onPagesChange(updated);
  };

  const handleAddPage = () => {
    if (pages.length >= 10) return;
    const newPageNum = pages.length + 1;
    const updated = [
      ...pages,
      {
        pageNumber: newPageNum,
        title: `Page ${newPageNum} Step`,
        body: "Key takeaway and actionable visual instruction.",
        visualPrompt: `Vertical design for step ${newPageNum}`,
        mediaUrl: "",
        mediaType: "image" as const,
      },
    ];
    onPagesChange(updated);
    onActivePageChange(pages.length);
  };

  const handleDeletePage = (idx: number) => {
    if (pages.length <= 2) return;
    const updated = pages
      .filter((_, i) => i !== idx)
      .map((p, i) => ({ ...p, pageNumber: i + 1 }));
    onPagesChange(updated);
    onActivePageChange(Math.max(0, activePageIndex - 1));
  };

  return (
    <div className="space-y-6 text-left">
      {/* HEADER & ACTION BAR */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase px-2.5 py-0.5">
            Pinterest Idea Pin Studio
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            Multi-Page Storyboard (9:16 Vertical)
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={isGeneratingAI}
          onClick={onGenerateIdeaPinAI}
          className="h-8 text-xs font-bold gap-1.5 bg-gradient-to-r from-red-600 to-pink-600 hover:opacity-90 text-white shadow-xs"
        >
          {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>Generate Full Idea Pin with AI</span>
        </Button>
      </div>

      {/* OVERALL IDEA PIN TITLE & DESCRIPTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Idea Pin Title</label>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. 5 Game-Changing AI Tools for Robotics"
            className="h-9 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-900"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Board & Link</label>
          <div className="flex gap-2">
            <select
              value={board}
              onChange={(e) => onBoardChange(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium flex-1"
            >
              <option value="Smart Robotics & AI">Smart Robotics & AI</option>
              <option value="Tech Inspiration">Tech Inspiration</option>
              <option value="Tutorials & Guides">Tutorials & Guides</option>
            </select>
            <Input
              value={destinationUrl}
              onChange={(e) => onDestinationUrlChange(e.target.value)}
              placeholder="Destination URL"
              className="h-9 text-xs bg-white dark:bg-slate-900 flex-1"
            />
          </div>
        </div>
      </div>

      {/* MULTI-PAGE STORYBOARD NAVIGATION STRIP */}
      <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-red-600" />
            Storyboard Pages ({pages.length} Total)
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            Active: Page {activePageIndex + 1} of {pages.length}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            type="button"
            disabled={activePageIndex === 0}
            onClick={() => onActivePageChange(Math.max(0, activePageIndex - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pages.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onActivePageChange(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activePageIndex === idx
                  ? "bg-red-600 text-white shadow-xs ring-2 ring-red-500/30"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>Page {idx + 1}</span>
              {p.mediaUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}

          <button
            type="button"
            disabled={activePageIndex >= pages.length - 1}
            onClick={() => onActivePageChange(Math.min(pages.length - 1, activePageIndex + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {pages.length < 10 && (
            <button
              type="button"
              onClick={handleAddPage}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-red-600 flex items-center gap-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add Page
            </button>
          )}

          {pages.length > 2 && (
            <button
              type="button"
              onClick={() => handleDeletePage(activePageIndex)}
              className="p-1.5 text-slate-400 hover:text-red-500 ml-auto shrink-0 transition-colors"
              title="Delete Active Page"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE PAGE EDITOR */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT: ACTIVE PAGE MEDIA FRAME (9:16 VERTICAL) */}
        <div className="md:col-span-5 space-y-3">
          <div className="relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center min-h-[320px] aspect-[9/16] overflow-hidden group shadow-2xs">
            {activePage.mediaUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <img
                  src={activePage.mediaUrl}
                  alt={`Page ${activePageIndex + 1}`}
                  className="w-full h-full object-cover rounded-xl"
                />
                {/* STEP OVERLAY BADGE */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 pointer-events-none">
                  <span className="bg-red-600 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded w-max mb-1">
                    Page {activePageIndex + 1}
                  </span>
                  <p className="text-white text-xs font-bold line-clamp-1">{activePage.title}</p>
                </div>
              </div>
            ) : (
              <div className="text-center p-4 space-y-2">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Page {activePageIndex + 1} Visual
                </p>
                <div className="flex gap-1.5 justify-center pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={onOpenUpload} className="h-7 text-[11px]">
                    <Upload className="h-3 w-3 mr-1" /> Upload
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={onOpenStock} className="h-7 text-[11px]">
                    <ImageIcon className="h-3 w-3 mr-1 text-pink-500" /> Stock
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* PER-PAGE REGENERATE BUTTON */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRegeneratingPage}
            onClick={() => onRegeneratePageAI(activePageIndex)}
            className="w-full h-8 text-xs font-bold gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            {isRegeneratingPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span>Regenerate Page {activePageIndex + 1} with AI</span>
          </Button>
        </div>

        {/* RIGHT: ACTIVE PAGE TEXT & PROMPTS */}
        <div className="md:col-span-7 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Page {activePageIndex + 1} Title / Step Header
            </label>
            <Input
              value={activePage.title}
              onChange={(e) => handleUpdateActivePage("title", e.target.value)}
              placeholder={`e.g. Step ${activePageIndex + 1}: Key Strategy`}
              className="h-10 text-xs sm:text-sm font-semibold rounded-xl bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Page {activePageIndex + 1} Key Insight / Body Text
            </label>
            <Textarea
              rows={3}
              value={activePage.body}
              onChange={(e) => handleUpdateActivePage("body", e.target.value)}
              placeholder="Write 1-2 punchy sentences that give immediate value on this slide..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <Wand2 className="h-3 w-3 text-red-500" /> Page {activePageIndex + 1} Visual AI Prompt
            </label>
            <Textarea
              rows={2}
              value={activePage.visualPrompt}
              onChange={(e) => handleUpdateActivePage("visualPrompt", e.target.value)}
              placeholder="Describe background scene and visual aesthetics for this page..."
              className="w-full text-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 font-mono text-slate-600 dark:text-slate-300"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
