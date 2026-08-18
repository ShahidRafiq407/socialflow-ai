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
  ShoppingBag,
  X,
  Check,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";

import GenerationProgressIndicator from "@/components/ui/GenerationProgressIndicator";
import ContentMediaRenderer from "@/components/ui/ContentMediaRenderer";

export interface IdeaPinPage {
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
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;
  onEnhancePrompt?: () => void;
  isEnhancingPrompt?: boolean;
  generationProgress?: number;
  generationStage?: string;
  renderError?: string | null;
  onReorderCards?: (fromIdx: number, toIdx: number) => void;
  originalPrompt?: string | null;
  onRestoreOriginalPrompt?: () => void;
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
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
  onCaptionToPrompt,
  isGeneratingPromptFromScript = false,
  onEnhancePrompt,
  isEnhancingPrompt = false,
  generationProgress = 0,
  generationStage = "Rendering Idea Pin page...",
  renderError = null,
  onReorderCards,
  originalPrompt = null,
  onRestoreOriginalPrompt,
  onGenerateField,
  generatingField = null,
}: PinterestIdeaPinEditorProps) {
  const [topicInput, setTopicInput] = useState("");
  const [pageAspectRatio, setPageAspectRatio] = useState<string>("auto");
  const [pageStyle, setPageStyle] = useState<string>("photorealistic");
  const [pageQuality, setPageQuality] = useState<string>("studio_4k");

  // Tag Products State
  const [taggedProducts, setTaggedProducts] = useState<Array<{ id: string; name: string; price: string; url: string }>>([]);
  const [isTagProductDialogOpen, setIsTagProductDialogOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductUrl, setNewProductUrl] = useState("");

  const handleAddProduct = () => {
    if (!newProductName.trim()) return;
    const newProd = {
      id: `prod_${Date.now()}`,
      name: newProductName.trim(),
      price: newProductPrice.trim(),
      url: newProductUrl.trim() || destinationUrl || "https://smbrobotic.com",
    };
    setTaggedProducts((prev) => [...prev, newProd]);
    setNewProductName("");
    setNewProductPrice("");
    setNewProductUrl("");
    setIsTagProductDialogOpen(false);
  };

  const handleRemoveProduct = (id: string) => {
    setTaggedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const effectivePages = pages && pages.length > 0 ? pages : [
    { pageNumber: 1, title: "Intro Page", body: "Start with an eye-catching visual and problem statement.", visualPrompt: "Vertical aesthetic design", mediaUrl: "", mediaType: "image" as const },
    { pageNumber: 2, title: "Step 2", body: "Actionable tip or process breakdown.", visualPrompt: "Vertical aesthetic design", mediaUrl: "", mediaType: "image" as const },
    { pageNumber: 3, title: "Summary & CTA", body: "Wrap up and call to action.", visualPrompt: "Vertical aesthetic design", mediaUrl: "", mediaType: "image" as const },
  ];

  const currentIdx = Math.min(Math.max(activePageIndex, 0), effectivePages.length - 1);
  const activePage = effectivePages[currentIdx] || effectivePages[0];

  const handleUpdateActivePage = (field: keyof IdeaPinPage, value: any) => {
    const updated = [...effectivePages];
    updated[currentIdx] = {
      ...updated[currentIdx],
      [field]: value,
    };
    onPagesChange(updated);
  };

  const handleAddPage = () => {
    if (effectivePages.length >= 10) return;
    const newPageNum = effectivePages.length + 1;
    const updated = [
      ...effectivePages,
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
    onActivePageChange(effectivePages.length);
  };

  const handleDeletePage = (idx: number) => {
    if (effectivePages.length <= 1) return;
    const updated = effectivePages
      .filter((_, i) => i !== idx)
      .map((p, i) => ({ ...p, pageNumber: i + 1 }));
    onPagesChange(updated);
    onActivePageChange(Math.max(0, currentIdx - 1));
  };

  const handleAddTopic = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && topicInput.trim()) {
      e.preventDefault();
      if (!taggedTopics.includes(topicInput.trim())) {
        onTaggedTopicsChange([...taggedTopics, topicInput.trim()]);
      }
      setTopicInput("");
    }
  };

  const handleRemoveTopic = (topic: string) => {
    onTaggedTopicsChange(taggedTopics.filter((t) => t !== topic));
  };

  return (
    <div className="space-y-4 text-left">
      {/* OVERALL IDEA PIN TITLE & BOARD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Idea Pin Title</label>
            {onGenerateField && (
              <button type="button" onClick={() => onGenerateField("title")} disabled={generatingField === "title"} title="Generate Title with AI" className="text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors">
                {generatingField === "title" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
              </button>
            )}
          </div>
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-red-600" />
              Storyboard Pages ({effectivePages.length} Pages)
            </span>
            <Button
              type="button"
              size="sm"
              disabled={isGeneratingAI}
              onClick={onGenerateIdeaPinAI}
              className="h-7 px-2.5 text-[11px] font-bold gap-1 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white shadow-2xs rounded-lg"
            >
              {isGeneratingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              <span>{isGeneratingAI ? (generationProgress > 0 ? `Generating Idea Pin (${generationProgress}%)...` : "Generating Idea Pin...") : "Generate Idea Pin with AI"}</span>
            </Button>
          </div>
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            Active: Page {currentIdx + 1} of {effectivePages.length}
            {onReorderCards && effectivePages.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => onReorderCards(currentIdx, currentIdx - 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                  title="Move Page Left"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={currentIdx === effectivePages.length - 1}
                  onClick={() => onReorderCards(currentIdx, currentIdx + 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
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
            disabled={currentIdx === 0}
            onClick={() => onActivePageChange(Math.max(0, currentIdx - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
            title="Previous Page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {effectivePages.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onActivePageChange(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                currentIdx === idx
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
            disabled={currentIdx >= effectivePages.length - 1}
            onClick={() => onActivePageChange(Math.min(effectivePages.length - 1, currentIdx + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 shrink-0"
            title="Next Page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {effectivePages.length < 10 && (
            <button
              type="button"
              onClick={handleAddPage}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-red-600 flex items-center gap-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add Page
            </button>
          )}

          {effectivePages.length > 1 && (
            <button
              type="button"
              onClick={() => handleDeletePage(currentIdx)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-100 flex items-center gap-1 ml-auto shrink-0 transition-colors"
              title={`Delete Page ${currentIdx + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Page {currentIdx + 1}</span>
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE PAGE EDITOR */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT: ACTIVE PAGE MEDIA FRAME (9:16 VERTICAL) */}
        <div className="md:col-span-5 space-y-3">
          <div className="relative rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center min-h-[320px] aspect-[9/16] overflow-hidden group shadow-2xs">
            {isRegeneratingPage ? (
              <GenerationProgressIndicator
                progress={generationProgress}
                stage={generationStage}
                title={`Generating Page ${currentIdx + 1}`}
                isVertical={true}
                accentColor="red"
                mediaType="ideapin"
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
                  onClick={() => onRegeneratePageAI(currentIdx)}
                  className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              </div>
            ) : activePage.mediaUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <ContentMediaRenderer
                  url={activePage.mediaUrl}
                  mediaType={activePage.mediaType}
                  isVertical={true}
                  showRemoveButton={false}
                  alt={`Page ${currentIdx + 1}`}
                />
                {/* STEP OVERLAY BADGE */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 pointer-events-none z-10">
                  <span className="bg-red-600 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded w-max mb-1">
                    Page {currentIdx + 1}
                  </span>
                  <p className="text-white text-xs font-bold line-clamp-1">{activePage.title}</p>
                </div>
              </div>
            ) : (
              <div className="text-center p-4 space-y-2">
                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Page {currentIdx + 1} Visual
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
        </div>

        {/* RIGHT: ACTIVE PAGE TEXT & PROMPTS */}
        <div className="md:col-span-7 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Page {currentIdx + 1} Title / Step Header
            </label>
            <Input
              value={activePage.title}
              onChange={(e) => handleUpdateActivePage("title", e.target.value)}
              placeholder={`e.g. Step ${currentIdx + 1}: Key Strategy`}
              className="h-10 text-xs sm:text-sm font-semibold rounded-xl bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Page {currentIdx + 1} Key Insight / Body Text
            </label>
            <Textarea
              rows={3}
              value={activePage.body}
              onChange={(e) => handleUpdateActivePage("body", e.target.value)}
              placeholder="Write 1-2 punchy sentences that give immediate value on this slide..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed"
            />
          </div>

          {/* MODEL SETTINGS (GOOGLE NANO BANANA PRO / GEMINI 3 PRO IMAGE) */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-amber-500" /> Image Settings
              </span>
            </div>

            <div className="space-y-2.5">

              {/* 2. Aspect Ratio */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Aspect Ratio
                </label>
                <select
                  value={pageAspectRatio}
                  onChange={(e) => setPageAspectRatio(e.target.value)}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-mono"
                >
                  <option value="auto">Auto (9:16 Story / Idea Pin Default)</option>
                  <option value="9:16">9:16 (Tall Idea Pin)</option>
                  <option value="2:3">2:3 (Standard Pin)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 3. Visual Style */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Visual Style
                  </label>
                  <select
                    value={pageStyle}
                    onChange={(e) => setPageStyle(e.target.value)}
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

                {/* 4. Quality Standard */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Quality Standard
                  </label>
                  <select
                    value={pageQuality}
                    onChange={(e) => setPageQuality(e.target.value)}
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

          {/* UNIFIED PAGE PROMPT CONTROLS */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Wand2 className="h-3 w-3 text-red-500" /> Page {currentIdx + 1} Visual AI Prompt
              </label>
              <div className="flex items-center gap-3">
                {onCaptionToPrompt && (
                  <button
                    type="button"
                    disabled={isGeneratingPromptFromScript}
                    onClick={onCaptionToPrompt}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                  >
                    {isGeneratingPromptFromScript ? "Generating..." : "Auto-Prompt"}
                  </button>
                )}
                {onEnhancePrompt && (
                  <button
                    type="button"
                    disabled={isEnhancingPrompt || !activePage.visualPrompt || !activePage.visualPrompt.trim()}
                    onClick={onEnhancePrompt}
                    className={`text-[11px] font-semibold flex items-center gap-0.5 transition-all ${
                      !activePage.visualPrompt || !activePage.visualPrompt.trim()
                        ? "text-slate-400 cursor-not-allowed opacity-50"
                        : "text-pink-600 hover:text-pink-700 hover:underline cursor-pointer"
                    }`}
                  >
                    <span>Enhance Prompt ✨</span>
                  </button>
                )}
                {originalPrompt && originalPrompt !== activePage.visualPrompt && onRestoreOriginalPrompt && (
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
              rows={2}
              value={activePage.visualPrompt}
              onChange={(e) => handleUpdateActivePage("visualPrompt", e.target.value)}
              placeholder="Describe vertical 9:16 background scene and visual aesthetics for this page..."
              className="w-full text-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 font-mono text-slate-600 dark:text-slate-300 leading-relaxed"
            />

            <Button
              type="button"
              size="sm"
              disabled={isRegeneratingPage}
              onClick={() => onRegeneratePageAI(currentIdx)}
              className="w-full h-8 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white shadow-xs"
            >
              {isRegeneratingPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isRegeneratingPage ? `Generating Page ${currentIdx + 1} Visual...` : `Generate Page ${currentIdx + 1} Visual`}</span>
            </Button>
          </div>

          {/* TAG PRODUCTS SECTION */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Tag Products</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTagProductDialogOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-red-600" />
              <span>Add products</span>
            </Button>

            {taggedProducts.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {taggedProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-300 px-2.5 py-1 rounded-lg text-xs font-medium"
                  >
                    <ShoppingBag className="h-3 w-3 text-red-600 shrink-0" />
                    <span className="font-bold">{prod.name}</span>
                    {prod.price && <span className="text-[11px] text-red-600 dark:text-red-400 font-mono">({prod.price})</span>}
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(prod.id)}
                      className="hover:text-red-700 ml-1 text-slate-400 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AUTO-GENERATE FULL IDEA PIN BUTTON */}
          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              disabled={isGeneratingAI}
              onClick={onGenerateIdeaPinAI}
              className="w-full h-8.5 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white shadow-2xs rounded-lg"
            >
              {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isGeneratingAI ? (generationProgress > 0 ? `Generating Idea Pin (${generationProgress}%)...` : "Generating Full Idea Pin...") : "Auto-Generate Full Idea Pin with AI"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* TAG PRODUCTS MODAL */}
      {isTagProductDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tag Product to Idea Pin</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTagProductDialogOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Product Title / Name</label>
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Smart Robotic Gripper Kit"
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Price (optional)</label>
                  <Input
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="e.g. $49.99"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Product URL</label>
                  <Input
                    value={newProductUrl}
                    onChange={(e) => setNewProductUrl(e.target.value)}
                    placeholder="https://smbrobotic.com/..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* QUICK PRESET PICKS */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400">Quick Pick Sample Products:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: "Pro Starter Kit", price: "$99", url: "https://example.com/starter" },
                    { name: "Premium Plan", price: "$149", url: "https://example.com/premium" },
                    { name: "Enterprise Solution", price: "$299", url: "https://example.com/enterprise" },
                    { name: "Digital Guide Bundle", price: "$49", url: "https://example.com/guide" },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setNewProductName(p.name);
                        setNewProductPrice(p.price);
                        setNewProductUrl(p.url);
                      }}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-700 dark:text-slate-300 hover:text-red-600 transition-colors"
                    >
                      + {p.name} ({p.price})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTagProductDialogOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!newProductName.trim()}
                onClick={handleAddProduct}
                className="h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
              >
                Add Tag
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
