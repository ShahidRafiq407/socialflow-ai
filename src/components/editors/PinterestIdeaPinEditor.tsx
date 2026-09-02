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
  Settings2,
  Tag,
  ShoppingBag,
  X,
  AlertCircle,
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
  /** Real boards from the connected Pinterest account. */
  boards?: { id: string; name: string }[];
  taggedTopics: string[];
  onTaggedTopicsChange: (topics: string[]) => void;
  pages: IdeaPinPage[];
  onPagesChange: (pages: IdeaPinPage[], meta?: SlidesChangeMeta) => void;
  activePageIndex: number;
  onActivePageChange: (idx: number) => void;
  onGenerateIdeaPinAI: () => void;
  isGeneratingAI: boolean;
  onRegeneratePageAI: (pageIdx: number) => void;
  isRegeneratingPage: boolean;
  /** Renders just the active page's graphic with the Image Settings below the preview. */
  onRenderPageMedia?: (options?: {
    mediaType?: "image" | "video";
    prompt?: string;
    aspectRatio?: string;
    style?: string;
    quality?: string;
    imageModel?: string;
    slideIndex?: number;
  }) => void;
  isRenderingPageMedia?: boolean;
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
  // AI analysis of the attached (uploaded/stock) media
  onAnalyzeMedia?: () => void;
  isAnalyzingMedia?: boolean;
  // TRUE only when the current slot holds user-provided media (upload/stock)
  hasUserMedia?: boolean;
  // Description quick actions (rewrite / boost hook / executive tone / hashtags)
  onAIRefine?: (action: "regenerate" | "boost-hook" | "executive-tone" | "add-hashtags") => void;
  isRefiningCaption?: boolean;
  refiningAction?: string | null;
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
  boards,
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
  onRenderPageMedia,
  isRenderingPageMedia = false,
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
  onAnalyzeMedia,
  isAnalyzingMedia = false,
  hasUserMedia = false,
  onAIRefine,
  isRefiningCaption = false,
  refiningAction = null,
}: PinterestIdeaPinEditorProps) {
  const [topicInput, setTopicInput] = useState("");
  const [pageAspectRatio, setPageAspectRatio] = useState<string>("auto");
  const [pageStyle, setPageStyle] = useState<string>("photorealistic");
  const [pageQuality, setPageQuality] = useState<string>("studio_4k");
  const formatKey = `${capability.platform}-${capability.format}`;

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
  const isBusyOnPageVisual = isRegeneratingPage || isRenderingPageMedia;
  const hasSourceText = Boolean(description?.trim() || activePage.body?.trim());

  // Idea Pin pages are typeset informational graphics — the preview runs at the real
  // 9:16 publish ratio so the headline on the page is legible while editing.
  const previewFrame = mediaPreviewFrame(
    resolvePreviewRatio(pageAspectRatio, capability.defaultAspectRatio || "9:16")
  );

  const renderActivePageMedia = () => {
    onRenderPageMedia?.({
      aspectRatio: pageAspectRatio !== "auto" ? pageAspectRatio : (capability.defaultAspectRatio || "9:16"),
      style: pageStyle,
      quality: pageQuality,
      imageModel: IMAGE_MODEL_ID,
    });
  };

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
    // Same floor as the other decks: the page-count derivation upstream never goes
    // below MIN_DECK_SLIDES, so allowing a delete down to one page here just made the
    // storyboard snap back to three.
    if (!canRemoveDeckSlide(effectivePages.length)) return;
    const updated = effectivePages
      .filter((_, i) => i !== idx)
      .map((p, i) => ({ ...p, pageNumber: i + 1 }));
    onPagesChange(updated, { removedIndex: idx });
    onActivePageChange(nextActiveSlideIndex(idx, updated.length));
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
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. 5 Game-Changing AI Tools for Robotics"
            className="h-9 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-900"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Board & Link</label>
          <div className="flex gap-2">
            {boards && boards.length > 0 ? (
              <select
                value={board}
                onChange={(e) => onBoardChange(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium flex-1"
              >
                <option value="">Auto-detect (first board)</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
                {board && !boards.some((b) => b.name === board) && (
                  <option value={board}>{board}</option>
                )}
              </select>
            ) : (
              <Input
                value={board}
                onChange={(e) => onBoardChange(e.target.value)}
                placeholder="Exact board name from Pinterest"
                className="h-9 text-xs bg-white dark:bg-slate-900 flex-1"
              />
            )}
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
      <div className="p-3 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/15 dark:border-primary/20 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Storyboard Pages
            <span className="px-1.5 py-0.5 rounded-md bg-secondary/10 text-secondary text-[10px] font-bold tracking-normal normal-case">
              {effectivePages.length} pages
            </span>
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
            Active: Page {currentIdx + 1} of {effectivePages.length}
            {onReorderCards && effectivePages.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => onReorderCards(currentIdx, currentIdx - 1)}
                  className="p-1 rounded-md text-slate-400 hover:text-secondary hover:bg-secondary/10 disabled:opacity-30 transition-colors"
                  title="Move Page Left"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={currentIdx === effectivePages.length - 1}
                  onClick={() => onReorderCards(currentIdx, currentIdx + 1)}
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
            disabled={currentIdx === 0}
            onClick={() => onActivePageChange(Math.max(0, currentIdx - 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:hover:text-slate-600 shrink-0 transition-colors"
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
                  ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/25"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-primary hover:border-primary/40"
              }`}
            >
              <span>Page {idx + 1}</span>
              {p.mediaUrl && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${currentIdx === idx ? "bg-primary-foreground/70" : "bg-primary"}`}
                />
              )}
            </button>
          ))}

          <button
            type="button"
            disabled={currentIdx >= effectivePages.length - 1}
            onClick={() => onActivePageChange(Math.min(effectivePages.length - 1, currentIdx + 1))}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:hover:text-slate-600 shrink-0 transition-colors"
            title="Next Page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {effectivePages.length < 10 && (
            <button
              type="button"
              onClick={handleAddPage}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-dashed border-secondary/40 text-secondary hover:bg-secondary/10 hover:border-secondary flex items-center gap-1 shrink-0 transition-colors"
              title="Add Page"
            >
              <Plus className="h-3.5 w-3.5" /> Add Page
            </button>
          )}

          {/* Disabled rather than hidden at the floor — see the Instagram editor. */}
          <button
            type="button"
            disabled={!canRemoveDeckSlide(effectivePages.length)}
            onClick={() => handleDeletePage(currentIdx)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-destructive/10 border border-destructive/25 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:hover:bg-destructive/10 disabled:cursor-not-allowed flex items-center gap-1 ml-auto shrink-0 transition-colors"
            title={
              canRemoveDeckSlide(effectivePages.length)
                ? `Delete Page ${currentIdx + 1}`
                : `An Idea Pin needs at least ${MIN_DECK_SLIDES} pages`
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Page {currentIdx + 1}</span>
          </button>
        </div>
      </div>

      {/* ACTIVE PAGE PREVIEW (LEFT) + PIN COPY & ONE-CLICK GENERATE (RIGHT) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT: ACTIVE PAGE MEDIA AT FULL PUBLISH SIZE */}
        <div className="xl:col-span-5 space-y-3">
          <div
            className="relative w-full mx-auto rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col items-center justify-center overflow-hidden group shadow-2xs"
            style={{ aspectRatio: previewFrame.aspectRatio, maxWidth: previewFrame.maxWidth }}
          >
            {isBusyOnPageVisual ? (
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
                <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-destructive">Generation failed</p>
                  <p className="text-[10px] text-slate-400 line-clamp-2">{renderError}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => (onRenderPageMedia ? renderActivePageMedia() : onRegeneratePageAI(currentIdx))}
                  className="h-7 text-[11px] bg-destructive text-white hover:bg-destructive/90 font-bold"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              </div>
            ) : activePage.mediaUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <ContentMediaRenderer
                  url={activePage.mediaUrl}
                  mediaType={activePage.mediaType}
                  className={DECK_MEDIA_FIT}
                  isVertical={true}
                  showRemoveButton={false}
                  alt={`Page ${currentIdx + 1}`}
                />
                {/* STEP OVERLAY BADGE */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 pointer-events-none z-10">
                  <span className="bg-slate-900/90 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded w-max mb-1">
                    Page {currentIdx + 1} of {effectivePages.length}
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

        {/* RIGHT: PIN DESCRIPTION, TOPICS AND THE ONE ACTION THAT BUILDS THE PIN */}
        <div className="xl:col-span-7 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Pin Description (Shared)
              </label>
              <div className="flex items-center gap-2">
                {onGenerateField && (
                  <button type="button" onClick={() => {
                    if (generatingField === "description") {
                      cancelAIAction("field", `${formatKey}:description`);
                    } else {
                      onGenerateField("description");
                    }
                  }} disabled={generatingField !== null && generatingField !== "description"} title={generatingField === "description" ? "Stop generating description" : "Generate Description with AI"} className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                    generatingField === "description"
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "bg-secondary/10 text-secondary hover:bg-secondary/20"
                  } ${generatingField !== null && generatingField !== "description" ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {generatingField === "description" ? <Square className="h-3 w-3 fill-current" /> : <Sparkles className="h-3 w-3" />} {generatingField === "description" ? "Stop" : "AI"}
                  </button>
                )}
                <CharacterCounter current={(description || "").length} max={capability.captionLimit} />
              </div>
            </div>
            <Textarea
              rows={6}
              value={description || ""}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the Idea Pin with searchable keywords, the value inside, and a clear call to action..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-900 leading-relaxed min-h-44"
            />
            {onAIRefine && (
              <CaptionRefineActions
                formatKey={formatKey}
                caption={description || ""}
                onRefine={onAIRefine}
                isRefining={isRefiningCaption}
                refiningAction={refiningAction}
              />
            )}
          </div>

          {/* TAGGED TOPICS (PINTEREST INTEREST TAGS) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-secondary" /> Tagged Topics
            </label>
            <Input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={handleAddTopic}
              placeholder="Type a topic and press Enter (e.g. automation)"
              className="h-8.5 text-xs bg-white dark:bg-slate-900 rounded-lg"
            />
            {taggedTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {taggedTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/10 text-secondary text-[11px] font-bold"
                  >
                    {topic}
                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(topic)}
                      className="hover:text-destructive transition-colors"
                      title={`Remove ${topic}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* TAG PRODUCTS SECTION */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Tag Products</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTagProductDialogOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-primary" />
              <span>Add products</span>
            </Button>

            {taggedProducts.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {taggedProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/25 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium"
                  >
                    <ShoppingBag className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-bold">{prod.name}</span>
                    {prod.price && <span className="text-[11px] text-primary font-mono">({prod.price})</span>}
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(prod.id)}
                      className="ml-1 text-slate-400 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
            THE pin action. One press writes the storyboard + title + description and
            then designs every page graphic — nothing stops at a prompt.
          */}
          <div className="pt-1 space-y-1.5">
            <Button
              type="button"
              size="sm"
              onClick={isGeneratingAI ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                cancelAIAction("copy", formatKey);
              } : onGenerateIdeaPinAI}
              title={isGeneratingAI ? "Stop Idea Pin generation" : undefined}
              className={`w-full h-auto min-h-9 px-3 py-2 text-xs font-bold gap-1.5 shadow-xs rounded-lg whitespace-normal transition-colors ${
                isGeneratingAI
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {isGeneratingAI ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{generationProgress > 0 ? `Generating Idea Pin (${generationProgress}%)...` : "Generating Full Idea Pin..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate Complete Idea Pin Post with AI</span>
                </>
              )}
            </Button>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Writes the title and description, then designs all {effectivePages.length} page graphics.
              Every selected platform that shares this format gets the same post.
            </p>
          </div>
        </div>
      </div>

      {/* PAGE COPY, IMAGE SETTINGS & PROMPT — under the preview they change */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-start">
          {/* PAGE COPY — typeset into the page graphic */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Page {currentIdx + 1} Title / Step Header
              </label>
              <Input
                value={activePage.title}
                onChange={(e) => handleUpdateActivePage("title", e.target.value)}
                placeholder={`e.g. Step ${currentIdx + 1}: Key Strategy`}
                className="h-8.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900"
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
                placeholder="Write 1-2 punchy sentences that give immediate value on this page..."
                className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 leading-relaxed"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (isRegeneratingPage) {
                  cancelAIAction("slide", `${formatKey}:${currentIdx}`);
                  return;
                }
                onRegeneratePageAI(currentIdx);
              }}
              title={isRegeneratingPage ? "Stop regenerating this page" : undefined}
              className={`w-full h-8.5 text-xs font-bold gap-1.5 transition-colors ${
                isRegeneratingPage
                  ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                  : "border-secondary/30 text-secondary hover:bg-secondary/10"
              }`}
            >
              {isRegeneratingPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>{isRegeneratingPage ? `Stop Regenerating Page ${currentIdx + 1}` : `Regenerate Page ${currentIdx + 1} Copy & Visual`}</span>
            </Button>
          </div>

          {/* MODEL SETTINGS (GOOGLE NANO BANANA PRO / GEMINI 3 PRO IMAGE) */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-amber-500" /> Image Settings
            </span>

            <div className="space-y-2.5">
              {/* Aspect Ratio */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Aspect Ratio
                </label>
                <select
                  value={pageAspectRatio}
                  onChange={(e) => setPageAspectRatio(e.target.value)}
                  className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-mono"
                >
                  <option value="auto">Auto ({capability.defaultAspectRatio || "9:16"} Platform Default)</option>
                  <option value="9:16">9:16 (Tall Idea Pin)</option>
                  <option value="2:3">2:3 (Standard Pin)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Visual Style */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Visual Style
                  </label>
                  <select
                    value={pageStyle}
                    onChange={(e) => setPageStyle(e.target.value)}
                    className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="photorealistic">Photorealistic</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="commercial_product">Commercial Product</option>
                    <option value="minimalist">Minimalist Modern</option>
                    <option value="3d_render">3D Digital Art</option>
                    <option value="editorial">Editorial Fashion</option>
                    <option value="illustration">Vector Illustration</option>
                  </select>
                </div>

                {/* Quality */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Quality
                  </label>
                  <select
                    value={pageQuality}
                    onChange={(e) => setPageQuality(e.target.value)}
                    className="w-full h-8.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 text-slate-800 dark:text-slate-200 shadow-2xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="studio_4k">Studio 4K</option>
                    <option value="ultra_hd_8k">Ultra HD 8K</option>
                    <option value="standard_hd">Standard HD</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* UNIFIED PAGE PROMPT CONTROLS */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <Wand2 className="h-3 w-3 text-secondary" /> Page {currentIdx + 1} Visual AI Prompt
            </label>
            <div className="flex items-center gap-3">
              {onCaptionToPrompt && (
                <button
                  type="button"
                  disabled={!isGeneratingPromptFromScript && !hasSourceText}
                  onClick={() => {
                    if (isGeneratingPromptFromScript) {
                      cancelAIAction("script", formatKey);
                    } else {
                      onCaptionToPrompt();
                    }
                  }}
                  title={isGeneratingPromptFromScript ? "Stop generating prompt" : hasSourceText ? "Generate media prompt from current text" : "Write the description or page text first"}
                  className={`text-[11px] font-semibold transition-colors ${
                    isGeneratingPromptFromScript
                      ? "text-destructive hover:text-destructive/80 cursor-pointer"
                      : hasSourceText
                      ? "text-primary hover:underline cursor-pointer"
                      : "text-slate-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  {isGeneratingPromptFromScript ? "Stop" : "Auto-Prompt"}
                </button>
              )}
              {onEnhancePrompt && (
                <button
                  type="button"
                  disabled={!isEnhancingPrompt && (!activePage.visualPrompt || !activePage.visualPrompt.trim())}
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
                      : !activePage.visualPrompt || !activePage.visualPrompt.trim()
                        ? "text-slate-400 cursor-not-allowed opacity-50"
                        : "text-secondary hover:underline cursor-pointer"
                  }`}
                >
                  {isEnhancingPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  <span>{isEnhancingPrompt ? "Stop Enhancing" : "Enhance Prompt ✨"}</span>
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
            rows={3}
            value={activePage.visualPrompt}
            onChange={(e) => handleUpdateActivePage("visualPrompt", e.target.value)}
            placeholder="Describe vertical 9:16 layout, typography and colour palette for this page..."
            className="w-full text-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 font-mono text-slate-600 dark:text-slate-300 leading-relaxed"
          />

          <Button
            type="button"
            size="sm"
            onClick={isBusyOnPageVisual ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isRenderingPageMedia) {
                window.dispatchEvent(new CustomEvent("cancel-render-media", { detail: { formatKey } }));
              } else {
                cancelAIAction("slide", `${formatKey}:${currentIdx}`);
              }
            } : () => (onRenderPageMedia ? renderActivePageMedia() : onRegeneratePageAI(currentIdx))}
            className={`w-full h-9 text-xs font-bold gap-1.5 shadow-xs transition-colors ${
              isBusyOnPageVisual
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
            }`}
          >
            {isBusyOnPageVisual ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Stop Page Visual</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Generate Page {currentIdx + 1} Visual</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* TAG PRODUCTS MODAL */}
      {isTagProductDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
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
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-primary/10 text-slate-700 dark:text-slate-300 hover:text-primary transition-colors"
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
                className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
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
