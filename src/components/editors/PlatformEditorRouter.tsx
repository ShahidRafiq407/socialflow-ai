"use client";

import React from "react";
import { getPlatformCapability, PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import PinterestPinEditor from "./PinterestPinEditor";
import PinterestIdeaPinEditor from "./PinterestIdeaPinEditor";
import InstagramCarouselEditor, { CarouselSlideItem } from "./InstagramCarouselEditor";
import LinkedInDocumentEditor, { DocumentSlide } from "./LinkedInDocumentEditor";
import MultiMediaEditor, { MultiMediaItem } from "./MultiMediaEditor";
import VideoPostEditor from "./VideoPostEditor";
import StandardSocialEditor from "./StandardSocialEditor";
import { SlidesChangeMeta } from "./deckSlides";

export interface PlatformEditorRouterProps {
  platform: string;
  format: string;
  
  // Generic / Unified State
  title: string;
  onTitleChange: (val: string) => void;
  caption: string;
  onCaptionChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  destinationUrl: string;
  onDestinationUrlChange: (val: string) => void;
  board: string;
  onBoardChange: (val: string) => void;
  taggedTopics: string[];
  onTaggedTopicsChange: (topics: string[]) => void;
  altText: string;
  onAltTextChange: (val: string) => void;
  hashtags: string[];
  onHashtagsChange: (tags: string[]) => void;
  firstComment: string;
  onFirstCommentChange: (val: string) => void;

  // Media state
  displayImageUrl: string | null;
  displayImageUrls: string[];
  onRemoveMedia: () => void;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  isUploadingMedia?: boolean;
  uploadProgress?: number;
  uploadFileName?: string;
  uploadTransferredMB?: string;
  uploadTotalMB?: string;
  onRenderAI: (options?: {
    mediaType?: "image" | "video";
    duration?: number;
    prompt?: string;
    aspectRatio?: string;
    videoTask?: string;
    sourceImage?: string | null;
    sourceVideo?: string | null;
    style?: string;
    quality?: string;
    imageModel?: string;
  }) => void;
  isRenderingMedia: boolean;

  // Video State
  videoStatus?: "idle" | "queued" | "processing" | "completed" | "failed";
  videoError?: string | null;
  durationSec?: number;
  onDurationChange?: (sec: number) => void;

  // Multi-Slide Carousel / Idea Pin / Document state
  slides: CarouselSlideItem[];
  /**
   * `meta.removedIndex` is set when the change came from deleting a slide, so the
   * page can shift the per-slide rendered media down with it.
   */
  onSlidesChange: (slides: CarouselSlideItem[], meta?: SlidesChangeMeta) => void;
  activeSlideIndex: number;
  onActiveSlideChange: (idx: number) => void;

  // Multi-Media Items state (for FB/LinkedIn multi-photo)
  mediaItems: MultiMediaItem[];
  onMediaItemsChange: (items: MultiMediaItem[]) => void;
  activeMediaIndex: number;
  onActiveMediaChange: (idx: number) => void;

  // AI Prompt State
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  onCaptionToPrompt?: () => void;
  isGeneratingPromptFromScript?: boolean;

  // AI Operations
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  onRegenerateSlideAI: (slideIdx: number, prompt?: string) => void;
  isRegeneratingSlide: boolean;
  onGenerateFullCarouselAI: () => void;
  isGeneratingFullCarousel: boolean;
  onExportPDF?: () => void;
  isExportingPDF?: boolean;
  onUploadPDF?: (file: File) => void;
  generationProgress?: number;
  generationStage?: string;
  renderError?: string | null;
  // Reorder a slide/page/post card (from index → to index); media + text move with it
  onReorderCards?: (fromIdx: number, toIdx: number) => void;
  // Original prompt recovery after "Enhance Prompt"
  originalPrompt?: string | null;
  onRestoreOriginalPrompt?: () => void;
  // Field-level AI generation (generates ONLY the requested field)
  onGenerateField?: (field: "title" | "description" | "hashtags" | "altText") => void;
  generatingField?: string | null;
  // AI analysis of the attached (uploaded/stock) media → generates matching text
  onAnalyzeMedia?: () => void;
  isAnalyzingMedia?: boolean;
  // TRUE only when the current slot holds user-provided media (upload/stock)
  hasUserMedia?: boolean;
  // Caption quick actions (rewrite / boost hook / executive tone / hashtags)
  onAIRefine?: (action: "regenerate" | "boost-hook" | "executive-tone" | "add-hashtags") => void;
  isRefiningCaption?: boolean;
  refiningAction?: string | null;

  // Pinterest-specific: real boards + AI-modified disclosure (syncs via ai_disclosures)
  pinterestBoards?: { id: string; name: string }[];
  pinterestAiModified?: boolean;
  onPinterestAiModifiedChange?: (val: boolean) => void;
}

export default function PlatformEditorRouter(props: PlatformEditorRouterProps) {
  const { platform, format } = props;
  const capability = getPlatformCapability(platform, format);

  // 1. PINTEREST STANDARD & VIDEO PIN
  if (platform === "pinterest" && (format === "Pin" || format === "Standard Pin" || format === "Video Pin")) {
    return (
      <PinterestPinEditor
        key={`${platform}-${format}`}
        capability={capability}
        title={props.title}
        onTitleChange={props.onTitleChange}
        description={props.description || props.caption}
        onDescriptionChange={props.onDescriptionChange}
        destinationUrl={props.destinationUrl}
        onDestinationUrlChange={props.onDestinationUrlChange}
        board={props.board || ""}
        onBoardChange={props.onBoardChange}
        taggedTopics={props.taggedTopics || []}
        onTaggedTopicsChange={props.onTaggedTopicsChange}
        altText={props.altText}
        onAltTextChange={props.onAltTextChange}
        boards={props.pinterestBoards}
        aiModified={props.pinterestAiModified}
        onAiModifiedChange={props.onPinterestAiModifiedChange}
        displayImageUrl={props.displayImageUrl}
        onRemoveMedia={props.onRemoveMedia}
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
        onRenderAI={props.onRenderAI}
        isRenderingMedia={props.isRenderingMedia}
        onGenerateCopyAI={props.onGenerateCopyAI}
        isGeneratingCopy={props.isGeneratingCopy}
        prompt={props.prompt}
        onPromptChange={props.onPromptChange}
        onEnhancePrompt={props.onEnhancePrompt}
        isEnhancingPrompt={props.isEnhancingPrompt}
        originalPrompt={props.originalPrompt}
        onRestoreOriginalPrompt={props.onRestoreOriginalPrompt}
        isVideo={format === "Video Pin" || capability.mediaType === "video"}
        generationProgress={props.generationProgress}
        generationStage={props.generationStage}
        renderError={props.renderError}
        onCaptionToPrompt={props.onCaptionToPrompt}
        isGeneratingPromptFromScript={props.isGeneratingPromptFromScript}
        onAnalyzeMedia={props.onAnalyzeMedia}
        isAnalyzingMedia={props.isAnalyzingMedia}
        hasUserMedia={props.hasUserMedia}
        onAIRefine={props.onAIRefine}
        isRefiningCaption={props.isRefiningCaption}
        refiningAction={props.refiningAction}
      />
    );
  }

  // 2. PINTEREST IDEA PIN
  if (platform === "pinterest" && (format === "Idea Pin" || format === "ideapin")) {
    const ideaPages = props.slides.map((s, i) => ({
      pageNumber: i + 1,
      title: s.title ?? "",
      body: s.body ?? "",
      visualPrompt: s.visualPrompt ?? "",
      mediaUrl: props.displayImageUrls[i] || s.imageUrl || "",
      mediaType: "image" as const,
    }));

    return (
      <PinterestIdeaPinEditor
        key={`${platform}-${format}`}
        capability={capability}
        title={props.title ?? ""}
        onTitleChange={props.onTitleChange}
        description={props.description || props.caption}
        onDescriptionChange={props.onDescriptionChange}
        destinationUrl={props.destinationUrl}
        onDestinationUrlChange={props.onDestinationUrlChange}
        board={props.board || ""}
        onBoardChange={props.onBoardChange}
        boards={props.pinterestBoards}
        taggedTopics={props.taggedTopics || []}
        onTaggedTopicsChange={props.onTaggedTopicsChange}
        pages={ideaPages}
        onPagesChange={(pages, meta) => {
          props.onSlidesChange(
            pages.map((p) => ({
              slideNumber: p.pageNumber,
              title: p.title,
              body: p.body,
              visualPrompt: p.visualPrompt,
              imageUrl: p.mediaUrl,
            })),
            meta
          );
        }}
        activePageIndex={props.activeSlideIndex}
        onActivePageChange={props.onActiveSlideChange}
        onGenerateIdeaPinAI={props.onGenerateFullCarouselAI}
        isGeneratingAI={props.isGeneratingFullCarousel}
        onRegeneratePageAI={props.onRegenerateSlideAI}
        isRegeneratingPage={props.isRegeneratingSlide}
        onReorderCards={props.onReorderCards}
        onOpenUpload={props.onOpenUpload}
        onGenerateField={props.onGenerateField}
        generatingField={props.generatingField}
        onOpenStock={props.onOpenStock}
        onCaptionToPrompt={props.onCaptionToPrompt}
        isGeneratingPromptFromScript={props.isGeneratingPromptFromScript}
        onEnhancePrompt={props.onEnhancePrompt}
        isEnhancingPrompt={props.isEnhancingPrompt}
        originalPrompt={props.originalPrompt}
        onRestoreOriginalPrompt={props.onRestoreOriginalPrompt}
        generationProgress={props.generationProgress}
        generationStage={props.generationStage}
        renderError={props.renderError}
        onAnalyzeMedia={props.onAnalyzeMedia}
        isAnalyzingMedia={props.isAnalyzingMedia}
        hasUserMedia={props.hasUserMedia}
      />
    );
  }

  // 3. INSTAGRAM CAROUSEL
  if (platform === "instagram" && format === "Carousel") {
    const carouselSlides = props.slides.map((s, i) => ({
      slideNumber: i + 1,
      title: s.title ?? "",
      body: s.body ?? "",
      visualPrompt: s.visualPrompt ?? "",
      imageUrl: props.displayImageUrls[i] || s.imageUrl || "",
    }));

    return (
      <InstagramCarouselEditor
        key={`${platform}-${format}`}
        capability={capability}
        caption={props.caption ?? ""}
        onCaptionChange={props.onCaptionChange}
        hashtags={props.hashtags}
        onHashtagsChange={props.onHashtagsChange}
        firstComment={props.firstComment}
        onFirstCommentChange={props.onFirstCommentChange}
        slides={carouselSlides}
        onSlidesChange={props.onSlidesChange}
        activeSlideIndex={props.activeSlideIndex}
        onActiveSlideChange={props.onActiveSlideChange}
        onGenerateCarouselAI={props.onGenerateFullCarouselAI}
        isGeneratingAI={props.isGeneratingFullCarousel}
        onRegenerateSlideAI={props.onRegenerateSlideAI}
        isRegeneratingSlide={props.isRegeneratingSlide}
        onReorderCards={props.onReorderCards}
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
        onRenderSlideMedia={props.onRenderAI}
        onGenerateField={props.onGenerateField}
        generatingField={props.generatingField}
        isRenderingSlideMedia={props.isRenderingMedia}
        onCaptionToPrompt={props.onCaptionToPrompt}
        isGeneratingPromptFromScript={props.isGeneratingPromptFromScript}
        onAnalyzeMedia={props.onAnalyzeMedia}
        isAnalyzingMedia={props.isAnalyzingMedia}
        hasUserMedia={props.hasUserMedia}
        onAIRefine={props.onAIRefine}
        isRefiningCaption={props.isRefiningCaption}
        refiningAction={props.refiningAction}
        generationProgress={props.generationProgress}
        generationStage={props.generationStage}
        renderError={props.renderError}
      />
    );
  }

  // 4. LINKEDIN DOCUMENT (PDF)
  if (platform === "linkedin" && (format === "Document" || format === "Carousel")) {
    const docSlides: DocumentSlide[] = props.slides.map((s, i) => ({
      slideNumber: i + 1,
      type: (s.type as any) || (s.theme as any) || (i === 0 ? "hook" : i === props.slides.length - 1 ? "cta" : "content"),
      title: s.title ?? "",
      points: s.body ? (s.body.includes("\n") ? s.body.split("\n") : s.body.split(". ").filter(Boolean)) : [],
      visualPrompt: s.visualPrompt ?? "",
      imageUrl: props.displayImageUrls[i] || s.imageUrl || "",
    }));

    return (
      <LinkedInDocumentEditor
        key={`${platform}-${format}`}
        capability={capability}
        documentTitle={props.title ?? ""}
        onDocumentTitleChange={props.onTitleChange}
        commentary={props.caption ?? ""}
        onCommentaryChange={props.onCaptionChange}
        hashtags={props.hashtags}
        onHashtagsChange={props.onHashtagsChange}
        slides={docSlides}
        onSlidesChange={(newSlides, meta) => {
          props.onSlidesChange(
            newSlides.map((s) => ({
              slideNumber: s.slideNumber,
              title: s.title,
              body: Array.isArray(s.points) ? s.points.join("\n") : (s.points || ""),
              visualPrompt: s.visualPrompt || "",
              imageUrl: s.imageUrl,
              type: s.type,
              theme: s.type,
            })),
            meta
          );
        }}
        activeSlideIndex={props.activeSlideIndex}
        onActiveSlideChange={props.onActiveSlideChange}
        onGenerateDocumentAI={props.onGenerateFullCarouselAI}
        isGeneratingAI={props.isGeneratingFullCarousel}
        onRegenerateSlideAI={props.onRegenerateSlideAI}
        isRegeneratingSlide={props.isRegeneratingSlide}
        onReorderCards={props.onReorderCards}
        onExportPDF={props.onExportPDF}
        onUploadPDF={props.onUploadPDF}
        onGenerateField={props.onGenerateField}
        generatingField={props.generatingField}
        isExportingPDF={props.isExportingPDF}
        onAnalyzeMedia={props.onAnalyzeMedia}
        isAnalyzingMedia={props.isAnalyzingMedia}
        hasUserMedia={props.hasUserMedia}
        onAIRefine={props.onAIRefine}
        isRefiningCaption={props.isRefiningCaption}
        refiningAction={props.refiningAction}
      />
    );
  }

  // 5. MULTI-MEDIA / MULTIPLE PHOTOS (Facebook Multiple Photos, LinkedIn Multi-Image,
  //    X Thread, X Post, TikTok Photo, Pinterest Carousel)
  if (
    (platform === "facebook" && (format === "Multiple Photos" || format === "Multiple Photos & Videos")) ||
    (platform === "linkedin" && format === "Multi-Image") ||
    (platform === "x" && (format === "Thread" || format === "Post")) ||
    (platform === "tiktok" && format === "Photo") ||
    (platform === "pinterest" && format === "Carousel")
  ) {
    return (
      <MultiMediaEditor
        key={`${platform}-${format}`}
        capability={capability}
        caption={props.caption}
        onCaptionChange={props.onCaptionChange}
        hashtags={props.hashtags}
        onHashtagsChange={props.onHashtagsChange}
        mediaItems={props.mediaItems}
        onMediaItemsChange={props.onMediaItemsChange}
        activeMediaIndex={props.activeMediaIndex}
        onActiveMediaChange={props.onActiveMediaChange}
        onGenerateCopyAI={props.onGenerateCopyAI}
        isGeneratingCopy={props.isGeneratingCopy}
        onGenerateAllMediaAI={props.onGenerateFullCarouselAI}
        isGeneratingAllMedia={props.isGeneratingFullCarousel}
        onReorderCards={props.onReorderCards}
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
        onRenderSingleAI={props.onRenderAI}
        isRenderingSingleAI={props.isRenderingMedia}
        prompt={props.prompt}
        onPromptChange={props.onPromptChange}
        onEnhancePrompt={props.onEnhancePrompt}
        isEnhancingPrompt={props.isEnhancingPrompt}
        originalPrompt={props.originalPrompt}
        onRestoreOriginalPrompt={props.onRestoreOriginalPrompt}
        onCaptionToPrompt={props.onCaptionToPrompt}
        isGeneratingPromptFromScript={props.isGeneratingPromptFromScript}
        renderError={props.renderError}
        generationProgress={props.generationProgress}
        generationStage={props.generationStage}
        onGenerateField={props.onGenerateField}
        generatingField={props.generatingField}
        onAnalyzeMedia={props.onAnalyzeMedia}
        isAnalyzingMedia={props.isAnalyzingMedia}
        hasUserMedia={props.hasUserMedia}
        onAIRefine={props.onAIRefine}
        isRefiningCaption={props.isRefiningCaption}
        refiningAction={props.refiningAction}
      />
    );
  }

  // 6. VIDEO FORMATS (Reels, Shorts, TikTok Video, YouTube Video, LinkedIn Video)
  if (
    capability.mediaType === "video" ||
    ["Reel", "Shorts", "Video", "Short Video"].includes(format)
  ) {
    return (
      <VideoPostEditor
        key={`${platform}-${format}`}
        capability={capability}
        title={props.title}
        onTitleChange={props.onTitleChange}
        caption={props.caption}
        onCaptionChange={props.onCaptionChange}
        description={props.description}
        onDescriptionChange={props.onDescriptionChange}
        hashtags={props.hashtags}
        onHashtagsChange={props.onHashtagsChange}
        firstComment={props.firstComment}
        onFirstCommentChange={props.onFirstCommentChange}
        displayVideoUrl={props.displayImageUrl}
        videoStatus={props.videoStatus}
        videoError={props.videoError}
        onRemoveVideo={props.onRemoveMedia}
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
        isUploadingMedia={props.isUploadingMedia}
        uploadProgress={props.uploadProgress}
        uploadFileName={props.uploadFileName}
        uploadTransferredMB={props.uploadTransferredMB}
        uploadTotalMB={props.uploadTotalMB}
        onRenderAIVideo={props.onRenderAI}
        onGenerateField={props.onGenerateField}
        generatingField={props.generatingField}
        isRenderingVideo={props.isRenderingMedia}
        onGenerateCopyAI={props.onGenerateCopyAI}
        isGeneratingCopy={props.isGeneratingCopy}
        prompt={props.prompt}
        onPromptChange={props.onPromptChange}
        onEnhancePrompt={props.onEnhancePrompt}
        isEnhancingPrompt={props.isEnhancingPrompt}
        originalPrompt={props.originalPrompt}
        onRestoreOriginalPrompt={props.onRestoreOriginalPrompt}
        onCaptionToPrompt={props.onCaptionToPrompt || (() => {})}
        isGeneratingPromptFromScript={props.isGeneratingPromptFromScript}
        durationSec={props.durationSec || 5}
        onDurationChange={props.onDurationChange || (() => {})}
        generationProgress={props.generationProgress}
        generationStage={props.generationStage}
        onAnalyzeMedia={props.onAnalyzeMedia}
        isAnalyzingMedia={props.isAnalyzingMedia}
        hasUserMedia={props.hasUserMedia}
        onAIRefine={props.onAIRefine}
        isRefiningCaption={props.isRefiningCaption}
        refiningAction={props.refiningAction}
      />
    );
  }

  // 7. DEFAULT STANDARD SOCIAL EDITOR (Feed Single Image / Story / Text Post)
  return (
    <StandardSocialEditor
      key={`${platform}-${format}`}
      capability={capability}
      caption={props.caption}
      onCaptionChange={props.onCaptionChange}
      hashtags={props.hashtags}
      onHashtagsChange={props.onHashtagsChange}
      firstComment={props.firstComment}
      onFirstCommentChange={props.onFirstCommentChange}
      altText={props.altText}
      onAltTextChange={props.onAltTextChange}
      displayImageUrl={props.displayImageUrl}
      onRemoveMedia={props.onRemoveMedia}
      onOpenUpload={props.onOpenUpload}
      onOpenStock={props.onOpenStock}
      isUploadingMedia={props.isUploadingMedia}
      uploadProgress={props.uploadProgress}
      uploadFileName={props.uploadFileName}
      uploadTransferredMB={props.uploadTransferredMB}
      uploadTotalMB={props.uploadTotalMB}
      onRenderAI={props.onRenderAI}
      isRenderingMedia={props.isRenderingMedia}
      onGenerateCopyAI={props.onGenerateCopyAI}
      isGeneratingCopy={props.isGeneratingCopy}
      prompt={props.prompt}
      onPromptChange={props.onPromptChange}
      onEnhancePrompt={props.onEnhancePrompt}
      isEnhancingPrompt={props.isEnhancingPrompt}
      originalPrompt={props.originalPrompt}
      onRestoreOriginalPrompt={props.onRestoreOriginalPrompt}
      onCaptionToPrompt={props.onCaptionToPrompt}
      isGeneratingPromptFromScript={props.isGeneratingPromptFromScript}
      videoStatus={props.videoStatus}
      videoError={props.videoError}
      durationSec={props.durationSec || 5}
      onDurationChange={props.onDurationChange || (() => {})}
      generationProgress={props.generationProgress}
      generationStage={props.generationStage}
      renderError={props.renderError}
      onGenerateField={props.onGenerateField}
      generatingField={props.generatingField}
      onAnalyzeMedia={props.onAnalyzeMedia}
      isAnalyzingMedia={props.isAnalyzingMedia}
      hasUserMedia={props.hasUserMedia}
      onAIRefine={props.onAIRefine}
      isRefiningCaption={props.isRefiningCaption}
      refiningAction={props.refiningAction}
    />
  );
}
