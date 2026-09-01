/**
 * AI Studio Session Store — Zustand with sessionStorage persistence
 *
 * Holds ALL critical working state that must survive:
 *   - Tab switches (navigating to Chat, Content Library, etc.)
 *   - Page refreshes
 *   - Format / platform switches (already keyed by platform-format)
 *
 * Does NOT persist:
 *   - Loading/spinner states (reset to false on hydration)
 *   - Blob URLs (filtered out — they break on refresh)
 *   - Modal open states
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MultiMediaItem } from "@/components/editors/MultiMediaEditor";

// ============================================================================
// GENERATED FORMAT (matches page.tsx GeneratedFormat)
// ============================================================================
export interface GeneratedFormat {
  title?: string;
  caption: string;
  description?: string;
  destinationUrl?: string;
  board?: string;
  taggedTopics?: string[];
  altText?: string;
  imagePrompt: string;
  visualPrompts: string[];
  overlayText: { step: number; title: string; body: string; theme: string }[];
  hashtags: string[];
  bestTime: string;
  imageUrls?: string[];
  imageUrl?: string;
  videoUrl?: string;
}

export type SetStateArg<T> = T | ((prev: T) => T);

function resolveArg<T>(arg: SetStateArg<T>, prev: T): T {
  return typeof arg === "function" ? (arg as (p: T) => T)(prev) : arg;
}

// ============================================================================
// STORE STATE INTERFACE
// ============================================================================
interface AIStudioSessionState {
  // Generation state
  generatedContents: Record<string, Record<string, GeneratedFormat>>;
  campaignTopic: string;
  campaignHook: string;
  campaignTrendSource: string;
  aiCampaignId: string | null;
  generationState: "idle" | "running" | "completed";
  brandTone: string;

  // Platform / format tabs
  activePlatformTab: string;
  activeFormatTab: Record<string, string>;
  selectedPlatforms: string[];
  selectedContentTypes: Record<string, string[]>;

  // Editor field dictionaries (keyed by `${platform}-${format}`)
  titleDict: Record<string, string>;
  descriptionDict: Record<string, string>;
  destinationUrlDict: Record<string, string>;
  boardDict: Record<string, string>;
  taggedTopicsDict: Record<string, string[]>;
  altTextDict: Record<string, string>;
  mediaItemsDict: Record<string, MultiMediaItem[]>;
  activeMediaIndexDict: Record<string, number>;
  publishSettingsDict: Record<string, Record<string, any>>;
  customPromptDict: Record<string, string>;
  originalPromptDict: Record<string, string>;

  // Caption history
  captionHistory: Record<string, string[]>;
  captionHistoryIdx: Record<string, number>;

  // Media dictionaries (keyed by `${platform}-${format}-${slideIdx}`)
  renderedImageUrlsDict: Record<string, string>;
  customMediaDict: Record<string, { url: string; type: "image" | "video"; name?: string; source?: "upload" | "stock" | "ai" }>;
  clearedMediaKeys: Record<string, boolean>;
  videoAspectDict: Record<string, string>;

  // Generation & rendering progress/status (survives tab transitions)
  renderingMediaKeys: Record<string, boolean>;
  renderingAllSlidesKeys: Record<string, boolean>;
  generatingCopyKeys: Record<string, boolean>;
  videoStatusDict: Record<string, "idle" | "queued" | "processing" | "completed" | "failed">;
  videoErrorDict: Record<string, string | null>;
  renderErrorDict: Record<string, string | null>;
  generationProgressDict: Record<string, number>;
  generationStageDict: Record<string, string>;

  // HTML slides (LinkedIn Document)
  htmlSlidesDict: Record<string, string>;

  // Timestamp to track freshness
  _lastUpdated: number;

  // Actions
  setGeneratedContents: (arg: SetStateArg<Record<string, Record<string, GeneratedFormat>>>) => void;
  setCampaignTopic: (arg: SetStateArg<string>) => void;
  setCampaignHook: (arg: SetStateArg<string>) => void;
  setCampaignTrendSource: (arg: SetStateArg<string>) => void;
  setAiCampaignId: (arg: SetStateArg<string | null>) => void;
  setGenerationState: (arg: SetStateArg<"idle" | "running" | "completed">) => void;
  setBrandTone: (arg: SetStateArg<string>) => void;
  setActivePlatformTab: (arg: SetStateArg<string>) => void;
  setActiveFormatTab: (arg: SetStateArg<Record<string, string>>) => void;
  setSelectedPlatforms: (arg: SetStateArg<string[]>) => void;
  setSelectedContentTypes: (arg: SetStateArg<Record<string, string[]>>) => void;
  setTitleDict: (arg: SetStateArg<Record<string, string>>) => void;
  setDescriptionDict: (arg: SetStateArg<Record<string, string>>) => void;
  setDestinationUrlDict: (arg: SetStateArg<Record<string, string>>) => void;
  setBoardDict: (arg: SetStateArg<Record<string, string>>) => void;
  setTaggedTopicsDict: (arg: SetStateArg<Record<string, string[]>>) => void;
  setAltTextDict: (arg: SetStateArg<Record<string, string>>) => void;
  setMediaItemsDict: (arg: SetStateArg<Record<string, MultiMediaItem[]>>) => void;
  setActiveMediaIndexDict: (arg: SetStateArg<Record<string, number>>) => void;
  setPublishSettingsDict: (arg: SetStateArg<Record<string, Record<string, any>>>) => void;
  setCustomPromptDict: (arg: SetStateArg<Record<string, string>>) => void;
  setOriginalPromptDict: (arg: SetStateArg<Record<string, string>>) => void;
  setCaptionHistory: (arg: SetStateArg<Record<string, string[]>>) => void;
  setCaptionHistoryIdx: (arg: SetStateArg<Record<string, number>>) => void;
  setRenderedImageUrlsDict: (arg: SetStateArg<Record<string, string>>) => void;
  setCustomMediaDict: (arg: SetStateArg<Record<string, { url: string; type: "image" | "video" }>>) => void;
  setClearedMediaKeys: (arg: SetStateArg<Record<string, boolean>>) => void;
  setVideoAspectDict: (arg: SetStateArg<Record<string, string>>) => void;
  setRenderingMediaKeys: (arg: SetStateArg<Record<string, boolean>>) => void;
  setRenderingAllSlidesKeys: (arg: SetStateArg<Record<string, boolean>>) => void;
  setGeneratingCopyKeys: (arg: SetStateArg<Record<string, boolean>>) => void;
  setVideoStatusDict: (arg: SetStateArg<Record<string, "idle" | "queued" | "processing" | "completed" | "failed">>) => void;
  setVideoErrorDict: (arg: SetStateArg<Record<string, string | null>>) => void;
  setRenderErrorDict: (arg: SetStateArg<Record<string, string | null>>) => void;
  setGenerationProgressDict: (arg: SetStateArg<Record<string, number>>) => void;
  setGenerationStageDict: (arg: SetStateArg<Record<string, string>>) => void;
  setHtmlSlidesDict: (arg: SetStateArg<Record<string, string>>) => void;

  // Bulk reset
  resetSession: () => void;
}

// ============================================================================
// INITIAL DEFAULTS
// ============================================================================
const DEFAULT_FORMAT_TABS: Record<string, string> = {
  instagram: "Reel", linkedin: "Post", facebook: "Feed",
  x: "Post", youtube: "Shorts", tiktok: "Video", pinterest: "Pin",
};

const DEFAULT_CONTENT_TYPES: Record<string, string[]> = {
  instagram: ["Feed", "Reel"],
  facebook: ["Feed", "Reel"],
  linkedin: ["Post", "Document"],
  x: ["Post"],
  youtube: ["Shorts"],
  tiktok: ["Video"],
  pinterest: ["Pin", "Idea Pin"],
};

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================
/**
 * Filter out blob: and data: URLs from all media fields before serializing,
 * and cap entries to prevent sessionStorage overflow (~5MB limit).
 *
 * data: URLs (base64-encoded images/videos) can be 1-40MB each. Even ONE
 * leftover data: URL in generatedContents or renderedImageUrlsDict will
 * overflow sessionStorage, silently dropping the ENTIRE session state —
 * making captions and media disappear on refresh or tab switch.
 */
function sanitizeForStorage(state: any): any {
  const sanitized = { ...state };

  // Helper: returns true if URL is too large for sessionStorage
  const isBloatedUrl = (url: unknown): boolean => {
    if (typeof url !== "string") return false;
    return url.startsWith("blob:") || (url.startsWith("data:") && url.length > 500);
  };

  // 1. Strip data:/blob: from generatedContents imageUrl/videoUrl/imageUrls
  if (sanitized.generatedContents) {
    const cleanedContents: Record<string, Record<string, any>> = {};
    for (const [platform, formats] of Object.entries(sanitized.generatedContents)) {
      cleanedContents[platform] = {};
      for (const [format, data] of Object.entries(formats as Record<string, any>)) {
        const cleanData = { ...data };
        if (isBloatedUrl(cleanData.imageUrl)) cleanData.imageUrl = "";
        if (isBloatedUrl(cleanData.videoUrl)) cleanData.videoUrl = "";
        if (Array.isArray(cleanData.imageUrls)) {
          cleanData.imageUrls = cleanData.imageUrls.map((u: string) => isBloatedUrl(u) ? "" : u);
        }
        cleanedContents[platform][format] = cleanData;
      }
    }
    sanitized.generatedContents = cleanedContents;
  }

  // 2. Remove blob/data URLs from customMediaDict
  if (sanitized.customMediaDict) {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(sanitized.customMediaDict)) {
      const media = val as { url: string; type: string };
      if (media?.url && !isBloatedUrl(media.url)) {
        cleaned[key] = media;
      }
    }
    sanitized.customMediaDict = cleaned;
  }

  // 3. Remove data/blob from renderedImageUrlsDict
  if (sanitized.renderedImageUrlsDict) {
    const cleaned: Record<string, string> = {};
    for (const [key, url] of Object.entries(sanitized.renderedImageUrlsDict)) {
      if (!isBloatedUrl(url)) {
        cleaned[key] = url as string;
      }
    }
    // Cap to 30 most recent entries
    const entries = Object.entries(cleaned);
    sanitized.renderedImageUrlsDict = entries.length > 30
      ? Object.fromEntries(entries.slice(-30))
      : cleaned;
  }

  // 4. Strip bloated URLs from mediaItemsDict
  if (sanitized.mediaItemsDict) {
    const cleaned: Record<string, any[]> = {};
    for (const [key, items] of Object.entries(sanitized.mediaItemsDict)) {
      if (Array.isArray(items)) {
        cleaned[key] = (items as any[]).map((item) => {
          if (item?.url && isBloatedUrl(item.url)) {
            return { ...item, url: "" };
          }
          return item;
        });
      }
    }
    sanitized.mediaItemsDict = cleaned;
  }

  return sanitized;
}

// ============================================================================
// STORE
// ============================================================================
export const useAIStudioSessionStore = create<AIStudioSessionState>()(
  persist(
    (set) => ({
      // State defaults
      generatedContents: {},
      campaignTopic: "",
      campaignHook: "",
      campaignTrendSource: "",
      aiCampaignId: null,
      generationState: "idle",
      brandTone: "Professional and engaging",
      activePlatformTab: "instagram",
      activeFormatTab: { ...DEFAULT_FORMAT_TABS },
      selectedPlatforms: [],
      selectedContentTypes: { ...DEFAULT_CONTENT_TYPES },
      titleDict: {},
      descriptionDict: {},
      destinationUrlDict: {},
      boardDict: {},
      taggedTopicsDict: {},
      altTextDict: {},
      mediaItemsDict: {},
      activeMediaIndexDict: {},
      publishSettingsDict: {},
      customPromptDict: {},
      originalPromptDict: {},
      captionHistory: {},
      captionHistoryIdx: {},
      renderedImageUrlsDict: {},
      customMediaDict: {},
      clearedMediaKeys: {},
      videoAspectDict: {},
      renderingMediaKeys: {},
      renderingAllSlidesKeys: {},
      generatingCopyKeys: {},
      videoStatusDict: {},
      videoErrorDict: {},
      renderErrorDict: {},
      generationProgressDict: {},
      generationStageDict: {},
      htmlSlidesDict: {},
      _lastUpdated: 0,

      // Setters (support both direct values and functional updater callbacks)
      setGeneratedContents: (arg) => set((s) => ({ generatedContents: resolveArg(arg, s.generatedContents), _lastUpdated: Date.now() })),
      setCampaignTopic: (arg) => set((s) => ({ campaignTopic: resolveArg(arg, s.campaignTopic), _lastUpdated: Date.now() })),
      setCampaignHook: (arg) => set((s) => ({ campaignHook: resolveArg(arg, s.campaignHook), _lastUpdated: Date.now() })),
      setCampaignTrendSource: (arg) => set((s) => ({ campaignTrendSource: resolveArg(arg, s.campaignTrendSource), _lastUpdated: Date.now() })),
      setAiCampaignId: (arg) => set((s) => ({ aiCampaignId: resolveArg(arg, s.aiCampaignId), _lastUpdated: Date.now() })),
      setGenerationState: (arg) => set((s) => ({ generationState: resolveArg(arg, s.generationState), _lastUpdated: Date.now() })),
      setBrandTone: (arg) => set((s) => ({ brandTone: resolveArg(arg, s.brandTone), _lastUpdated: Date.now() })),
      setActivePlatformTab: (arg) => set((s) => ({ activePlatformTab: resolveArg(arg, s.activePlatformTab), _lastUpdated: Date.now() })),
      setActiveFormatTab: (arg) => set((s) => ({ activeFormatTab: resolveArg(arg, s.activeFormatTab), _lastUpdated: Date.now() })),
      setSelectedPlatforms: (arg) => set((s) => ({ selectedPlatforms: resolveArg(arg, s.selectedPlatforms), _lastUpdated: Date.now() })),
      setSelectedContentTypes: (arg) => set((s) => ({ selectedContentTypes: resolveArg(arg, s.selectedContentTypes), _lastUpdated: Date.now() })),
      setTitleDict: (arg) => set((s) => ({ titleDict: resolveArg(arg, s.titleDict), _lastUpdated: Date.now() })),
      setDescriptionDict: (arg) => set((s) => ({ descriptionDict: resolveArg(arg, s.descriptionDict), _lastUpdated: Date.now() })),
      setDestinationUrlDict: (arg) => set((s) => ({ destinationUrlDict: resolveArg(arg, s.destinationUrlDict), _lastUpdated: Date.now() })),
      setBoardDict: (arg) => set((s) => ({ boardDict: resolveArg(arg, s.boardDict), _lastUpdated: Date.now() })),
      setTaggedTopicsDict: (arg) => set((s) => ({ taggedTopicsDict: resolveArg(arg, s.taggedTopicsDict), _lastUpdated: Date.now() })),
      setAltTextDict: (arg) => set((s) => ({ altTextDict: resolveArg(arg, s.altTextDict), _lastUpdated: Date.now() })),
      setMediaItemsDict: (arg) => set((s) => ({ mediaItemsDict: resolveArg(arg, s.mediaItemsDict), _lastUpdated: Date.now() })),
      setActiveMediaIndexDict: (arg) => set((s) => ({ activeMediaIndexDict: resolveArg(arg, s.activeMediaIndexDict), _lastUpdated: Date.now() })),
      setPublishSettingsDict: (arg) => set((s) => ({ publishSettingsDict: resolveArg(arg, s.publishSettingsDict), _lastUpdated: Date.now() })),
      setCustomPromptDict: (arg) => set((s) => ({ customPromptDict: resolveArg(arg, s.customPromptDict), _lastUpdated: Date.now() })),
      setOriginalPromptDict: (arg) => set((s) => ({ originalPromptDict: resolveArg(arg, s.originalPromptDict), _lastUpdated: Date.now() })),
      setCaptionHistory: (arg) => set((s) => ({ captionHistory: resolveArg(arg, s.captionHistory), _lastUpdated: Date.now() })),
      setCaptionHistoryIdx: (arg) => set((s) => ({ captionHistoryIdx: resolveArg(arg, s.captionHistoryIdx), _lastUpdated: Date.now() })),
      setRenderedImageUrlsDict: (arg) => set((s) => ({ renderedImageUrlsDict: resolveArg(arg, s.renderedImageUrlsDict), _lastUpdated: Date.now() })),
      setCustomMediaDict: (arg) => set((s) => ({ customMediaDict: resolveArg(arg, s.customMediaDict), _lastUpdated: Date.now() })),
      setClearedMediaKeys: (arg) => set((s) => ({ clearedMediaKeys: resolveArg(arg, s.clearedMediaKeys), _lastUpdated: Date.now() })),
      setVideoAspectDict: (arg) => set((s) => ({ videoAspectDict: resolveArg(arg, s.videoAspectDict), _lastUpdated: Date.now() })),
      setRenderingMediaKeys: (arg) => set((s) => ({ renderingMediaKeys: resolveArg(arg, s.renderingMediaKeys), _lastUpdated: Date.now() })),
      setRenderingAllSlidesKeys: (arg) => set((s) => ({ renderingAllSlidesKeys: resolveArg(arg, s.renderingAllSlidesKeys), _lastUpdated: Date.now() })),
      setGeneratingCopyKeys: (arg) => set((s) => ({ generatingCopyKeys: resolveArg(arg, s.generatingCopyKeys), _lastUpdated: Date.now() })),
      setVideoStatusDict: (arg) => set((s) => ({ videoStatusDict: resolveArg(arg, s.videoStatusDict), _lastUpdated: Date.now() })),
      setVideoErrorDict: (arg) => set((s) => ({ videoErrorDict: resolveArg(arg, s.videoErrorDict), _lastUpdated: Date.now() })),
      setRenderErrorDict: (arg) => set((s) => ({ renderErrorDict: resolveArg(arg, s.renderErrorDict), _lastUpdated: Date.now() })),
      setGenerationProgressDict: (arg) => set((s) => ({ generationProgressDict: resolveArg(arg, s.generationProgressDict), _lastUpdated: Date.now() })),
      setGenerationStageDict: (arg) => set((s) => ({ generationStageDict: resolveArg(arg, s.generationStageDict), _lastUpdated: Date.now() })),
      setHtmlSlidesDict: (arg) => set((s) => ({ htmlSlidesDict: resolveArg(arg, s.htmlSlidesDict), _lastUpdated: Date.now() })),

      resetSession: () => set({
        generatedContents: {},
        campaignTopic: "",
        campaignHook: "",
        campaignTrendSource: "",
        aiCampaignId: null,
        generationState: "idle",
        brandTone: "Professional and engaging",
        activePlatformTab: "instagram",
        activeFormatTab: { ...DEFAULT_FORMAT_TABS },
        selectedPlatforms: [],
        selectedContentTypes: { ...DEFAULT_CONTENT_TYPES },
        titleDict: {},
        descriptionDict: {},
        destinationUrlDict: {},
        boardDict: {},
        taggedTopicsDict: {},
        altTextDict: {},
        mediaItemsDict: {},
        activeMediaIndexDict: {},
        publishSettingsDict: {},
        customPromptDict: {},
        originalPromptDict: {},
        captionHistory: {},
        captionHistoryIdx: {},
        renderedImageUrlsDict: {},
        customMediaDict: {},
        clearedMediaKeys: {},
        videoAspectDict: {},
        renderingMediaKeys: {},
        renderingAllSlidesKeys: {},
        generatingCopyKeys: {},
        videoStatusDict: {},
        videoErrorDict: {},
        renderErrorDict: {},
        generationProgressDict: {},
        generationStageDict: {},
        htmlSlidesDict: {},
        _lastUpdated: Date.now(),
      }),
    }),
    {
      name: "socialflow:ai-studio-session",
      storage: createJSONStorage(() => {
        // SSR-safe: sessionStorage only exists in the browser
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return sessionStorage;
      }),
      // Only persist the data fields, not actions
      partialize: (state) => sanitizeForStorage({
        generatedContents: state.generatedContents,
        campaignTopic: state.campaignTopic,
        campaignHook: state.campaignHook,
        campaignTrendSource: state.campaignTrendSource,
        aiCampaignId: state.aiCampaignId,
        generationState: state.generationState === "running" ? "idle" : state.generationState,
        brandTone: state.brandTone,
        activePlatformTab: state.activePlatformTab,
        activeFormatTab: state.activeFormatTab,
        selectedPlatforms: state.selectedPlatforms,
        selectedContentTypes: state.selectedContentTypes,
        titleDict: state.titleDict,
        descriptionDict: state.descriptionDict,
        destinationUrlDict: state.destinationUrlDict,
        boardDict: state.boardDict,
        taggedTopicsDict: state.taggedTopicsDict,
        altTextDict: state.altTextDict,
        mediaItemsDict: state.mediaItemsDict,
        activeMediaIndexDict: state.activeMediaIndexDict,
        publishSettingsDict: state.publishSettingsDict,
        customPromptDict: state.customPromptDict,
        originalPromptDict: state.originalPromptDict,
        captionHistory: state.captionHistory,
        captionHistoryIdx: state.captionHistoryIdx,
        renderedImageUrlsDict: state.renderedImageUrlsDict,
        customMediaDict: state.customMediaDict,
        clearedMediaKeys: state.clearedMediaKeys,
        videoAspectDict: state.videoAspectDict,
        htmlSlidesDict: state.htmlSlidesDict,
        _lastUpdated: state._lastUpdated,
      }),
    }
  )
);
