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
  onRenderAI: () => void;
  isRenderingMedia: boolean;

  // Multi-Slide Carousel / Idea Pin / Document state
  slides: CarouselSlideItem[];
  onSlidesChange: (slides: CarouselSlideItem[]) => void;
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

  // AI Operations
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  onRegenerateSlideAI: (slideIdx: number) => void;
  isRegeneratingSlide: boolean;
  onGenerateFullCarouselAI: () => void;
  isGeneratingFullCarousel: boolean;
  onExportPDF?: () => void;
  isExportingPDF?: boolean;
}

export default function PlatformEditorRouter(props: PlatformEditorRouterProps) {
  const { platform, format } = props;
  const capability = getPlatformCapability(platform, format);

  // 1. PINTEREST STANDARD & VIDEO PIN
  if (platform === "pinterest" && (format === "Pin" || format === "Standard Pin" || format === "Video Pin")) {
    return (
      <PinterestPinEditor
        capability={capability}
        title={props.title}
        onTitleChange={props.onTitleChange}
        description={props.description || props.caption}
        onDescriptionChange={props.onDescriptionChange}
        destinationUrl={props.destinationUrl}
        onDestinationUrlChange={props.onDestinationUrlChange}
        board={props.board || "Smart Robotics & AI"}
        onBoardChange={props.onBoardChange}
        taggedTopics={props.taggedTopics || []}
        onTaggedTopicsChange={props.onTaggedTopicsChange}
        altText={props.altText}
        onAltTextChange={props.onAltTextChange}
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
        isVideo={format === "Video Pin" || capability.mediaType === "video"}
      />
    );
  }

  // 2. PINTEREST IDEA PIN
  if (platform === "pinterest" && (format === "Idea Pin" || format === "ideapin")) {
    const ideaPages = props.slides.map((s, i) => ({
      pageNumber: i + 1,
      title: s.title || `Page ${i + 1}`,
      body: s.body || "",
      visualPrompt: s.visualPrompt || "",
      mediaUrl: props.displayImageUrls[i] || s.imageUrl || "",
      mediaType: "image" as const,
    }));

    return (
      <PinterestIdeaPinEditor
        capability={capability}
        title={props.title || props.caption.slice(0, 60)}
        onTitleChange={props.onTitleChange}
        description={props.description || props.caption}
        onDescriptionChange={props.onDescriptionChange}
        destinationUrl={props.destinationUrl}
        onDestinationUrlChange={props.onDestinationUrlChange}
        board={props.board || "Smart Robotics & AI"}
        onBoardChange={props.onBoardChange}
        taggedTopics={props.taggedTopics || []}
        onTaggedTopicsChange={props.onTaggedTopicsChange}
        pages={ideaPages}
        onPagesChange={(pages) => {
          props.onSlidesChange(
            pages.map((p) => ({
              slideNumber: p.pageNumber,
              title: p.title,
              body: p.body,
              visualPrompt: p.visualPrompt,
              imageUrl: p.mediaUrl,
            }))
          );
        }}
        activePageIndex={props.activeSlideIndex}
        onActivePageChange={props.onActiveSlideChange}
        onGenerateIdeaPinAI={props.onGenerateFullCarouselAI}
        isGeneratingAI={props.isGeneratingFullCarousel}
        onRegeneratePageAI={props.onRegenerateSlideAI}
        isRegeneratingPage={props.isRegeneratingSlide}
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
      />
    );
  }

  // 3. INSTAGRAM CAROUSEL
  if (platform === "instagram" && format === "Carousel") {
    const carouselSlides = props.slides.map((s, i) => ({
      slideNumber: i + 1,
      title: s.title || `Slide ${i + 1}`,
      body: s.body || "",
      visualPrompt: s.visualPrompt || "",
      imageUrl: props.displayImageUrls[i] || s.imageUrl || "",
    }));

    return (
      <InstagramCarouselEditor
        capability={capability}
        caption={props.caption}
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
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
        onRenderSlideMedia={props.onRenderAI}
        isRenderingSlideMedia={props.isRenderingMedia}
      />
    );
  }

  // 4. LINKEDIN DOCUMENT (PDF)
  if (platform === "linkedin" && (format === "Document" || format === "Carousel")) {
    const docSlides: DocumentSlide[] = props.slides.map((s, i) => ({
      slideNumber: i + 1,
      type: i === 0 ? "hook" : i === props.slides.length - 1 ? "cta" : "content",
      title: s.title || `Executive Point ${i + 1}`,
      points: s.body ? s.body.split(". ").filter(Boolean) : ["Strategic insight", "Key data takeaway"],
      visualPrompt: s.visualPrompt || "",
      imageUrl: props.displayImageUrls[i] || s.imageUrl || "",
    }));

    return (
      <LinkedInDocumentEditor
        capability={capability}
        documentTitle={props.title || "2026 Strategic Playbook"}
        onDocumentTitleChange={props.onTitleChange}
        commentary={props.caption}
        onCommentaryChange={props.onCaptionChange}
        hashtags={props.hashtags}
        onHashtagsChange={props.onHashtagsChange}
        slides={docSlides}
        onSlidesChange={(slides) => {
          props.onSlidesChange(
            slides.map((s) => ({
              slideNumber: s.slideNumber,
              title: s.title,
              body: s.points.join(". "),
              visualPrompt: s.visualPrompt,
              imageUrl: s.imageUrl,
            }))
          );
        }}
        activeSlideIndex={props.activeSlideIndex}
        onActiveSlideChange={props.onActiveSlideChange}
        onGenerateDocumentAI={props.onGenerateFullCarouselAI}
        isGeneratingAI={props.isGeneratingFullCarousel}
        onRegenerateSlideAI={props.onRegenerateSlideAI}
        isRegeneratingSlide={props.isRegeneratingSlide}
        onExportPDF={props.onExportPDF}
        isExportingPDF={props.isExportingPDF}
      />
    );
  }

  // 5. MULTI-MEDIA / MULTIPLE PHOTOS (Facebook Multiple Photos, LinkedIn Multi-Image, Twitter Thread)
  if (
    (platform === "facebook" && (format === "Multiple Photos" || format === "Multiple Photos & Videos")) ||
    (platform === "linkedin" && format === "Multi-Image") ||
    (platform === "x" && format === "Thread") ||
    (platform === "tiktok" && format === "Photo")
  ) {
    return (
      <MultiMediaEditor
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
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
        onRenderSingleAI={props.onRenderAI}
        isRenderingSingleAI={props.isRenderingMedia}
        prompt={props.prompt}
        onPromptChange={props.onPromptChange}
        onEnhancePrompt={props.onEnhancePrompt}
        isEnhancingPrompt={props.isEnhancingPrompt}
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
        onRemoveVideo={props.onRemoveMedia}
        onOpenUpload={props.onOpenUpload}
        onOpenStock={props.onOpenStock}
        onRenderAIVideo={props.onRenderAI}
        isRenderingVideo={props.isRenderingMedia}
        onGenerateCopyAI={props.onGenerateCopyAI}
        isGeneratingCopy={props.isGeneratingCopy}
        prompt={props.prompt}
        onPromptChange={props.onPromptChange}
        onEnhancePrompt={props.onEnhancePrompt}
        isEnhancingPrompt={props.isEnhancingPrompt}
        onCaptionToPrompt={props.onCaptionToPrompt || (() => {})}
      />
    );
  }

  // 7. DEFAULT STANDARD SOCIAL EDITOR (Feed Single Image / Text Post)
  return (
    <StandardSocialEditor
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
      onRenderAI={props.onRenderAI}
      isRenderingMedia={props.isRenderingMedia}
      onGenerateCopyAI={props.onGenerateCopyAI}
      isGeneratingCopy={props.isGeneratingCopy}
      prompt={props.prompt}
      onPromptChange={props.onPromptChange}
      onEnhancePrompt={props.onEnhancePrompt}
      isEnhancingPrompt={props.isEnhancingPrompt}
    />
  );
}
