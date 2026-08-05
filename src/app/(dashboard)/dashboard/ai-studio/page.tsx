"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  Clock,
  Camera,
  Briefcase,
  Globe,
  MessageSquare,
  PlayCircle,
  Video,
  Wand2,
  RefreshCw,
  FileText,
  Send,
  Heart,
  MessageCircle,
  Play,
  Upload,
  MoreHorizontal,
  Music,
  Hash,
  Image as ImageIcon,
  RotateCcw,
  Check,
  Rocket,
  CheckSquare,
  Square,
  X,
  Layers,
  Eye,
  Share2,
  Film,
  Bookmark,
  Repeat2,
  ThumbsUp,
  Lock,
  AlertCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { getConnectedPlatformIds } from "@/actions/integrations";
import { useUser } from "@clerk/nextjs";

// ============================================================================
// PLATFORM & TYPE DEFINITIONS
// ============================================================================
interface PlatformDef {
  id: string;
  label: string;
  icon: React.ElementType;
  contentTypes: string[];
}

const PLATFORMS: PlatformDef[] = [
  { id: "instagram", label: "Instagram", icon: Camera, contentTypes: ["Feed", "Reel", "Story", "Carousel"] },
  { id: "facebook", label: "Facebook", icon: Globe, contentTypes: ["Feed", "Story", "Reel"] },
  { id: "linkedin", label: "LinkedIn", icon: Briefcase, contentTypes: ["Post", "Carousel", "Short Video"] },
  { id: "x", label: "X", icon: MessageSquare, contentTypes: ["Post", "Thread"] },
  { id: "youtube", label: "YouTube", icon: PlayCircle, contentTypes: ["Shorts"] },
  { id: "tiktok", label: "TikTok", icon: Video, contentTypes: ["Video"] },
  { id: "pinterest", label: "Pinterest", icon: Bookmark, contentTypes: ["Pin", "Idea Pin"] },
];

// AI-generated content per format
interface GeneratedFormat {
  caption: string;
  imagePrompt: string;
  visualPrompts: string[];
  overlayText: { step: number; title: string; body: string; theme: string }[];
  hashtags: string[];
  bestTime: string;
}

// ============================================================================
// POLLINATIONS AI URL BUILDER
// ============================================================================
const getPollinationsAIUrl = (prompt?: string, aspectRatio?: string, seed: number = 42, format?: string) => {
  let w = 1080, h = 1080;
  if (aspectRatio === "9:16") { w = 1080; h = 1920; }
  else if (aspectRatio === "16:9") { w = 1920; h = 1080; }
  else if (aspectRatio === "4:5") { w = 1080; h = 1350; }
  else if (aspectRatio === "2:3") { w = 1000; h = 1500; }
  let cleanText = (prompt || "modern digital marketing").replace(/[^a-zA-Z0-9 ,.-]/g, " ").trim();
  // Truncate to prevent 414 URI Too Long errors
  if (cleanText.length > 800) cleanText = cleanText.substring(0, 800);
  
  let styleSuffix = ", photorealistic 8k, vibrant colors, no watermark";

  const encoded = encodeURIComponent(cleanText + styleSuffix);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
};

// Determine aspect ratio for a format
const getAspectRatio = (format: string): "9:16" | "1:1" | "4:5" | "16:9" | "2:3" => {
  if (["Reel", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(format)) return "9:16";
  if (["Feed"].includes(format)) return "1:1";
  if (["Carousel"].includes(format)) return "4:5";
  if (["Pin"].includes(format)) return "2:3";
  return "16:9"; // Post, Thread
};

const getMediaType = (format: string): "video" | "image" | "carousel" => {
  if (["Reel", "Shorts", "Video", "Short Video"].includes(format)) return "video";
  if (["Carousel", "Thread", "Idea Pin"].includes(format)) return "carousel";
  return "image";
};

// ============================================================================
// PIPELINE NODES
// ============================================================================
const PIPELINE_NODES = [
  { id: "brand_dna", label: "Brand DNA" },
  { id: "trending_research", label: "Trending Topic Research" },
  { id: "competitor_research", label: "Competitor Research" },
  { id: "generating_content", label: "Generating Posts & Videos" },
  { id: "publish_ready", label: "Ready to Publish" },
];

export default function AIStudioPage() {
  // ============================================================================
  // STATE: CONNECTED PLATFORMS (from Integrations DB)
  // ============================================================================
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // User Profile from Clerk for Realistic Previews
  const { user } = useUser();
  const userName = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "SMB Robotics";
  const userHandle = userName.toLowerCase().replace(/\s/g, "");
  const userImage = user?.imageUrl || null;

  useEffect(() => {
    (async () => {
      try {
        const connected = await getConnectedPlatformIds();
        setConnectedPlatforms(connected);
      } catch (e) {
        console.warn("Could not fetch connected platforms:", e);
      } finally {
        setLoadingConnections(false);
      }
    })();
  }, []);

  // ============================================================================
  // STATE: PLATFORM & CONTENT TYPE SELECTION
  // ============================================================================
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedContentTypes, setSelectedContentTypes] = useState<Record<string, string[]>>({
    instagram: ["Feed", "Reel"],
    facebook: ["Feed", "Reel"],
    linkedin: ["Post", "Carousel"],
    x: ["Post"],
    youtube: ["Shorts"],
    tiktok: ["Video"],
  });

  // Auto-select connected platforms on load
  useEffect(() => {
    if (connectedPlatforms.length > 0 && selectedPlatforms.length === 0) {
      setSelectedPlatforms(connectedPlatforms.filter(p => PLATFORMS.some(pl => pl.id === p)));
    }
  }, [connectedPlatforms]);

  const togglePlatform = (platformId: string) => {
    if (!connectedPlatforms.includes(platformId)) return; // locked
    setSelectedPlatforms((prev) => {
      if (prev.includes(platformId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== platformId);
      }
      return [...prev, platformId];
    });
  };

  const toggleContentType = (platformId: string, type: string) => {
    if (!connectedPlatforms.includes(platformId)) return;
    if (!selectedPlatforms.includes(platformId)) {
      setSelectedPlatforms((prev) => [...prev, platformId]);
    }
    setSelectedContentTypes((prev) => {
      const currentList = prev[platformId] || [];
      if (currentList.includes(type)) {
        if (currentList.length === 1) return prev;
        return { ...prev, [platformId]: currentList.filter((item) => item !== type) };
      }
      return { ...prev, [platformId]: [...currentList, type] };
    });
  };

  const totalSelectedFormats = selectedPlatforms.reduce(
    (acc, pId) => acc + (selectedContentTypes[pId]?.length || 0), 0
  );

  // ============================================================================
  // STATE: GENERATION PIPELINE (REAL AI)
  // ============================================================================
  const [generationState, setGenerationState] = useState<"idle" | "running" | "completed">("idle");
  const [showProgressBox, setShowProgressBox] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // AI-generated campaign data
  const [campaignTopic, setCampaignTopic] = useState("");
  const [campaignHook, setCampaignHook] = useState("");
  const [campaignTrendSource, setCampaignTrendSource] = useState("");
  const [generatedContents, setGeneratedContents] = useState<Record<string, Record<string, GeneratedFormat>>>({});
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);

  // HTML Slides cache: key = "platform-format-slideIdx"
  const [htmlSlidesDict, setHtmlSlidesDict] = useState<Record<string, string>>({});
  const [loadingHtmlSlides, setLoadingHtmlSlides] = useState<Record<string, boolean>>({});
  
  // Real-time Reasoning Logs
  type AgentLog = { node: string; payload?: any; timestamp: number };
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);

  // ============================================================================
  // REAL AI CAMPAIGN GENERATION
  // ============================================================================
  const handleGenerateAIContent = async () => {
    setGenerationState("running");
    setShowProgressBox(true);
    setGenerationError(null);
    setPipelineStep(0);
    setAgentLogs([]);

    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-campaign",
          platforms: selectedPlatforms,
          contentTypes: Object.fromEntries(
            selectedPlatforms.map(p => [p, selectedContentTypes[p] || []])
          ),
        }),
      });

      // If the response is not OK, try to read the error as JSON
      if (!res.ok) {
        let errMsg = "Failed to connect to AI Studio";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Stream not supported by browser");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // SSE events are separated by double newlines
        const events = buffer.split("\n\n");
        // Keep the last (potentially incomplete) chunk in the buffer
        buffer = events.pop() || "";

        for (const event of events) {
          const trimmedEvent = event.trim();
          if (!trimmedEvent.startsWith("data: ")) continue;
          
          const jsonStr = trimmedEvent.slice(6);
          
          let data: any;
          try {
            data = JSON.parse(jsonStr);
          } catch {
            // Incomplete JSON chunk — skip this one (it'll be completed in next read)
            console.warn("[SSE] Skipping unparseable chunk:", jsonStr.substring(0, 80));
            continue;
          }

          if (data.type === "progress") {
            setAgentLogs(prev => {
              // Prevent exact duplicate logs if the node fires multiple times in a row without payload change
              const last = prev[prev.length - 1];
              if (last && last.node === data.node && JSON.stringify(last.payload) === JSON.stringify(data.payload)) {
                return prev;
              }
              return [...prev, { node: data.node, payload: data.payload, timestamp: Date.now() }];
            });

            if (data.node === "brandAnalyst") setPipelineStep(0);
            else if (data.node === "trendResearcher") setPipelineStep(1);
            else if (data.node === "competitorAnalyst") setPipelineStep(2);
            else if (data.node === "contentCreator" || data.node === "visualizerCreator") setPipelineStep(3);
            else if (data.node === "supervisor") setPipelineStep(4);
          } 
          else if (data.type === "complete") {
            const campaign = data.campaign;
            setCampaignTopic(campaign.topic || "");
            setCampaignHook(campaign.viralHook || "");
            setCampaignTrendSource(campaign.trendSource || "");

            // Map AI output to our content structure
            const newContents: Record<string, Record<string, GeneratedFormat>> = {};
            if (campaign.platforms) {
              for (const [platformId, formats] of Object.entries(campaign.platforms)) {
                const normalizedPlatformId = platformId.toLowerCase();
                newContents[normalizedPlatformId] = {};
                const validFormats = selectedContentTypes[normalizedPlatformId] || [];
                for (const [formatName, content] of Object.entries(formats as Record<string, any>)) {
                  const exactFormatName = validFormats.find(f => f.toLowerCase() === formatName.toLowerCase()) || formatName;

                  const promptsArray = Array.isArray(content.visualPrompts)
                    ? content.visualPrompts
                    : content.visualPrompt
                    ? [content.visualPrompt]
                    : [];
                    
                  newContents[normalizedPlatformId][exactFormatName] = {
                    caption: content.caption || "",
                    imagePrompt: content.imagePrompt || promptsArray[0] || "",
                    visualPrompts: promptsArray,
                    overlayText: Array.isArray(content.overlayText) ? content.overlayText : [],
                    hashtags: Array.isArray(content.hashtags) ? content.hashtags : [],
                    bestTime: content.bestTime || "9:00 AM",
                  };
                }
              }
            }

            console.log("[AI Studio] Mapped content to UI:", Object.keys(newContents).map(p => `${p}: [${Object.keys(newContents[p]).join(", ")}]`));
            
            setGeneratedContents(newContents);
            if (data.savedPostIds) {
              setSavedPostIds(data.savedPostIds);
            }

            setPipelineStep(4);
            setGenerationState("completed");
            setTimeout(() => setShowProgressBox(false), 3000);
          }
          else if (data.type === "error") {
            throw new Error(data.error || "AI generation failed");
          }
        }
      }

    } catch (err: any) {
      console.error("Campaign generation error:", err);
      setGenerationError(err.message || "Failed to generate campaign");
      setGenerationState("idle");
      setTimeout(() => setShowProgressBox(false), 5000);
    }
  };

  // ============================================================================
  // STATE: WORKSPACE (EDITOR & PREVIEW)
  // ============================================================================
  const [activePlatformTab, setActivePlatformTab] = useState<string>("instagram");
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [activeFormatTab, setActiveFormatTab] = useState<Record<string, string>>({
    instagram: "Reel", linkedin: "Post", facebook: "Feed", x: "Post", youtube: "Shorts", tiktok: "Video", pinterest: "Pin"
  });

  useEffect(() => {
    if (!selectedPlatforms.includes(activePlatformTab) && selectedPlatforms.length > 0) {
      setActivePlatformTab(selectedPlatforms[0]);
    }
  }, [selectedPlatforms, activePlatformTab]);

  const validSelectedFormats = selectedContentTypes[activePlatformTab] || [];
  let currentFormatName = activeFormatTab[activePlatformTab];
  if (!currentFormatName || !validSelectedFormats.includes(currentFormatName)) {
    currentFormatName = validSelectedFormats[0] || "Feed";
  }

  // Get current content (AI-generated or empty)
  const currentGenerated = generatedContents[activePlatformTab]?.[currentFormatName];
  const currentCaption = currentGenerated?.caption || "";
  const currentVisualPrompts = currentGenerated?.visualPrompts || [];
  const currentOverlayTexts = currentGenerated?.overlayText || [];
  const currentHashtags = currentGenerated?.hashtags || [];
  const currentBestTime = currentGenerated?.bestTime || "";
  const currentAspectRatio = getAspectRatio(currentFormatName);

  // Force single image for non-carousel formats even if AI returns multiple
  const isMultiFormat = currentFormatName === "Carousel" || currentFormatName === "Idea Pin" || currentFormatName === "Story" || currentFormatName === "Thread";
  const isHtmlSlideFormat = currentFormatName === "Carousel" || currentFormatName === "Idea Pin";
  const displayPrompts = isMultiFormat ? currentVisualPrompts : currentVisualPrompts.slice(0, 1);
  const displayOverlayTexts = isMultiFormat ? currentOverlayTexts : currentOverlayTexts.slice(0, 1);
  // For single-image formats use imagePrompt; for multi use visualPrompts
  const singleImagePrompt = currentGenerated?.imagePrompt || currentVisualPrompts[0] || campaignTopic || "modern digital marketing abstract";
  const displayImageUrls = isHtmlSlideFormat
    ? (displayOverlayTexts.length > 0
        ? displayOverlayTexts.map((_, i) => getPollinationsAIUrl(displayPrompts[i] || singleImagePrompt || `${campaignTopic} visual slide ${i + 1}`, currentAspectRatio, 42 + i, currentFormatName))
        : displayPrompts.map((p, i) => getPollinationsAIUrl(p || singleImagePrompt, currentAspectRatio, 42 + i, currentFormatName)))
    : [getPollinationsAIUrl(singleImagePrompt, currentAspectRatio, 42, currentFormatName)];
  const currentMediaType = getMediaType(currentFormatName);

  // HTML Slide helpers
  const getHtmlSlideKey = (slideIdx: number) => `${activePlatformTab}-${currentFormatName}-${slideIdx}`;

  const fetchHtmlSlide = async (slideIdx: number, customPrompt?: string) => {
    const overlay = displayOverlayTexts[slideIdx];
    if (!overlay && !customPrompt) return;
    const key = getHtmlSlideKey(slideIdx);
    setLoadingHtmlSlides(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/ai-studio/slide-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: overlay?.title || "Slide",
          body: overlay?.body || "",
          step: (overlay?.step || slideIdx + 1),
          total: displayOverlayTexts.length || displayPrompts.length,
          theme: overlay?.theme || "gradient-purple",
          brandName: userName,
          aspectRatio: currentAspectRatio,
          customPrompt: customPrompt || undefined,
          imageUrl: displayImageUrls[slideIdx],
        }),
      });
      const data = await res.json();
      if (data.success && data.html) {
        setHtmlSlidesDict(prev => ({ ...prev, [key]: data.html }));
      }
    } catch (e) {
      console.error("[HTML Slide] Error:", e);
    } finally {
      setLoadingHtmlSlides(prev => ({ ...prev, [key]: false }));
    }
  };

  // Auto-fetch HTML slides when content is generated
  useEffect(() => {
    if (!isHtmlSlideFormat || displayOverlayTexts.length === 0) return;
    displayOverlayTexts.forEach((_, i) => {
      const key = getHtmlSlideKey(i);
      if (!htmlSlidesDict[key]) fetchHtmlSlide(i);
    });
  }, [activePlatformTab, currentFormatName, generatedContents]);

  const handleFormatChange = (formatVal: string) => {
    setActiveFormatTab((prev) => ({ ...prev, [activePlatformTab]: formatVal }));
    setActiveSlideIdx(0);
  };

  // Update caption in generated contents
  const updateCaption = (newCaption: string) => {
    setGeneratedContents(prev => ({
      ...prev,
      [activePlatformTab]: {
        ...prev[activePlatformTab],
        [currentFormatName]: {
          ...(prev[activePlatformTab]?.[currentFormatName] || { caption: "", visualPrompts: [], hashtags: [], bestTime: "" }),
          caption: newCaption,
        },
      },
    }));
  };

  // ============================================================================
  // REAL AI CAPTION REFINEMENT
  // ============================================================================
  const [isRefining, setIsRefining] = useState(false);
  const [refiningAction, setRefiningAction] = useState<string | null>(null);

  const handleAIRefine = async (action: string) => {
    if (!currentCaption) return;
    setIsRefining(true);
    setRefiningAction(action);

    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "refine-caption",
          caption: currentCaption,
          action,
          platform: activePlatformTab,
          topic: campaignTopic,
          brandTone: "Professional and engaging",
        }),
      });

      const data = await res.json();
      if (data.success && data.caption) {
        updateCaption(data.caption);
      }
    } catch (error) {
      console.error("Refine error:", error);
    } finally {
      setIsRefining(false);
      setRefiningAction(null);
    }
  };

  // ============================================================================
  // MEDIA UPLOAD / REGENERATE
  // ============================================================================
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customMediaDict, setCustomMediaDict] = useState<Record<string, { url: string; type: "image" | "video" }>>({});

  const currentMediaKey = `${activePlatformTab}-${currentFormatName}-${activeSlideIdx}`;
  const customMedia = customMediaDict[currentMediaKey] || null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomMediaDict(prev => ({ ...prev, [currentMediaKey]: { url, type: file.type.startsWith("video") ? "video" : "image" } }));
      setRenderedImageUrlsDict(prev => {
        const next = { ...prev };
        delete next[currentMediaKey];
        return next;
      });
    }
  };

  const [isRenderingMedia, setIsRenderingMedia] = useState(false);
  const [renderedImageUrlsDict, setRenderedImageUrlsDict] = useState<Record<string, string>>({});
  const [customPrompt, setCustomPrompt] = useState("");

  const renderedImageUrl = renderedImageUrlsDict[currentMediaKey] || null;

  const handleRenderMedia = async () => {
    // For HTML slide formats: regenerate via Groq API
    if (isHtmlSlideFormat) {
      const prompt = customPrompt || displayOverlayTexts[activeSlideIdx]?.title || campaignTopic;
      await fetchHtmlSlide(activeSlideIdx, customPrompt || undefined);
      setCustomPrompt("");
      return;
    }
    // For regular image formats: regenerate via Pollinations
    const activePrompt = customPrompt || singleImagePrompt || campaignTopic;
    if (!activePrompt) return;
    setIsRenderingMedia(true);
    const cacheBuster = ` ${Date.now() % 100000}`;
    const url = getPollinationsAIUrl(activePrompt + cacheBuster, currentAspectRatio, Date.now() % 100000, currentFormatName);
    setRenderedImageUrlsDict(prev => ({ ...prev, [currentMediaKey]: url }));
    setCustomMediaDict(prev => {
      const next = { ...prev };
      delete next[currentMediaKey];
      return next;
    });
    setTimeout(() => setIsRenderingMedia(false), 800);
  };

  const aiImageUrl = displayImageUrls[activeSlideIdx] || displayImageUrls[0] || "";
  const displayImageUrl = customMedia?.url || renderedImageUrl || aiImageUrl;

  // Current HTML slide for the active slide
  const currentHtmlSlide = htmlSlidesDict[getHtmlSlideKey(activeSlideIdx)] || null;
  const isCurrentSlideLoading = loadingHtmlSlides[getHtmlSlideKey(activeSlideIdx)] || false;

  const resetAll = () => {
    setGenerationState("idle");
    setShowProgressBox(false);
    setPipelineStep(0);
    setGenerationError(null);
    setGeneratedContents({});
    setCampaignTopic("");
    setCampaignHook("");
    setCampaignTrendSource("");
    setCustomMediaDict({});
    setRenderedImageUrlsDict({});
    setHtmlSlidesDict({});
    setSavedPostIds([]);
  };

  // Format helpers
  const isVertical = ["Reel", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(currentFormatName);
  const isSquare = currentFormatName === "Feed";
  const isCarousel = currentFormatName === "Carousel" || currentFormatName === "Thread";
  const isWidescreen = currentFormatName === "Post";
  const isPin = currentFormatName === "Pin";

  // Check if ANY format on the active platform has content to keep the UI stable
  const hasAnyPlatformContent = generationState === "completed" && Object.keys(generatedContents[activePlatformTab] || {}).length > 0;
  const hasContent = hasAnyPlatformContent && !!currentCaption;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] space-y-6 pb-16 font-sans">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white shadow-md shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Content Studio
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Select platforms and generate viral campaigns powered by real AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {generationState !== "idle" && (
            <Button variant="ghost" size="sm" onClick={resetAll} className="h-9 text-xs font-semibold gap-1 text-slate-500">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>

      {/* PLATFORM SELECTION CARD */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <CardHeader className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              Select Target Platforms
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {connectedPlatforms.length === 0 && !loadingConnections
                ? "Connect your accounts in Settings → Integrations first"
                : "Choose platforms and formats for your campaign"}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs font-semibold px-3 py-1 shrink-0">
            {selectedPlatforms.length} Platforms • {totalSelectedFormats} Formats
          </Badge>
        </CardHeader>

        <CardContent className="p-5 space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              const isConnected = connectedPlatforms.includes(platform.id);
              const isSelected = selectedPlatforms.includes(platform.id);
              const activeFormats = selectedContentTypes[platform.id] || [];

              return (
                <div
                  key={platform.id}
                  className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 px-4 rounded-xl border transition-all duration-150 ${
                    !isConnected
                      ? "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 opacity-50"
                      : isSelected
                      ? "border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-2xs"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:opacity-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    disabled={!isConnected}
                    className="flex items-center gap-2.5 font-bold text-xs shrink-0 text-left focus:outline-none disabled:cursor-not-allowed"
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      !isConnected ? "bg-slate-200 dark:bg-slate-800 text-slate-400"
                      : isSelected ? "bg-primary text-white shadow-2xs"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                    }`}>
                      {!isConnected ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-sm ${
                      !isConnected ? "text-slate-400 dark:text-slate-600"
                      : isSelected ? "text-slate-900 dark:text-slate-100 font-bold"
                      : "text-slate-500 dark:text-slate-400 font-medium"
                    }`}>
                      {platform.label}
                    </span>
                    {!isConnected && (
                      <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        Not Connected
                      </span>
                    )}
                    {isConnected && isSelected && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </button>

                  {isConnected && (
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap justify-start sm:justify-end w-full sm:w-auto">
                      {platform.contentTypes.map((type) => {
                        const isChecked = isSelected && activeFormats.includes(type);
                        return (
                          <button
                            key={type} type="button"
                            onClick={() => toggleContentType(platform.id, type)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                              isChecked
                                ? "bg-primary text-white shadow-2xs"
                                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {isChecked ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3 text-slate-400" />}
                            <span>{type}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {connectedPlatforms.length === 0 && !loadingConnections
                ? "⚠️ No platforms connected. Go to Settings → Integrations to connect your social accounts."
                : `✨ AI will generate tailored content for all ${totalSelectedFormats} selected formats.`}
            </p>
            <Button
              type="button" size="lg"
              disabled={generationState === "running" || selectedPlatforms.length === 0}
              onClick={handleGenerateAIContent}
              className="h-11 px-8 rounded-xl text-sm font-extrabold gap-2.5 bg-gradient-to-r from-primary via-indigo-600 to-purple-600 hover:opacity-95 text-white shadow-md hover:shadow-lg transition-all shrink-0 transform hover:-translate-y-0.5"
            >
              {generationState === "running" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating with AI...</>
              ) : (
                <><Rocket className="h-4 w-4 text-amber-300 animate-bounce" /> Generate AI Content</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PIPELINE PROGRESS (CLAUDE-STYLE TERMINAL REASONING) */}
      {showProgressBox && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111111] shadow-xs p-5 sm:p-6 transition-all duration-300 animate-in fade-in slide-in-from-top-2 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-4">
            <div className="flex items-start gap-3 w-full">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-black mt-0.5 shrink-0">
                {generationState === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : generationError ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Multi-Agent Reasoning Process
                  {generationState === "running" && <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                </span>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {generationError 
                    ? `❌ ${generationError}` 
                    : generationState === "running" 
                    ? "Agents are currently researching and drafting..." 
                    : "Campaign successfully generated."}
                </p>
              </div>
              <button type="button" onClick={() => setShowProgressBox(false)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="bg-[#1e1e1e] rounded-xl p-4 sm:p-5 font-mono text-[13px] leading-relaxed text-slate-300 max-h-[400px] overflow-y-auto space-y-4 shadow-inner border border-slate-800">
            {agentLogs.length === 0 && !generationError && (
              <div className="text-slate-500 flex items-center gap-2 animate-pulse">
                <span>[System] Initializing agent environment...</span>
              </div>
            )}
            
            {agentLogs.map((log, idx) => {
              let header = "";
              let body: React.ReactNode = null;
              
              if (log.node === "brandAnalyst") {
                header = "[Brand Analyst] Analyzing brand DNA and target audience...";
                if (log.payload?.brandDNA) {
                  body = <div className="text-emerald-400/90 mt-1 pl-4 border-l-2 border-slate-700">Found Brand Focus: {log.payload.brandDNA.coreMessage || "General"}</div>;
                }
              } else if (log.node === "trendResearcher") {
                header = "[Trend Researcher] Fetching live Google News and extracting highly viral signals...";
                if (log.payload?.trendData) {
                  body = <div className="text-blue-400/90 mt-1 pl-4 border-l-2 border-slate-700 whitespace-pre-wrap">{log.payload.trendData}</div>;
                }
              } else if (log.node === "competitorAnalyst") {
                header = "[Competitor Analyst] Cross-referencing trends with unique competitor angle...";
                if (log.payload?.competitorData) {
                  body = <div className="text-purple-400/90 mt-1 pl-4 border-l-2 border-slate-700">{log.payload.competitorData}</div>;
                }
              } else if (log.node === "contentCreator") {
                header = "[Content Creator] Synthesizing data into viral posts & visual prompts for selected platforms...";
                if (log.payload?.campaignPayload) {
                  body = <div className="text-amber-400/90 mt-1 pl-4 border-l-2 border-slate-700">Generated payloads for: {Object.keys(log.payload.campaignPayload.platforms || {}).join(", ")}</div>;
                }
              } else if (log.node === "visualizerCreator") {
                header = "[Visualizer Creator] Translating prompts into rich media parameters...";
              } else if (log.node === "supervisor") {
                header = "[CEO Agent] Reviewing generated campaign against brand guidelines...";
                if (log.payload?.ceoVerdict) {
                  body = <div className="text-pink-400/90 mt-1 pl-4 border-l-2 border-slate-700">Verdict: {log.payload.ceoVerdict}</div>;
                }
              }

              return (
                <div key={idx} className="animate-in fade-in slide-in-from-left-2 duration-300">
                  <span className="text-slate-100 font-semibold">{header}</span>
                  {body}
                </div>
              );
            })}
            
            {generationState === "running" && agentLogs.length > 0 && (
              <div className="flex items-center gap-2 mt-4 text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="animate-pulse">Thinking...</span>
              </div>
            )}
            {generationState === "completed" && (
              <div className="mt-4 text-emerald-500 font-semibold">
                [System] Workflow complete. All agents finished successfully.
              </div>
            )}
          </div>
        </Card>
      )}

      {/* CAMPAIGN TOPIC BANNER (shown after generation) */}
      {campaignTopic && generationState === "completed" && (
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-primary/5 to-indigo-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{campaignTopic}</p>
              {campaignHook && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Hook: {campaignHook}</p>}
              {campaignTrendSource && <p className="text-[11px] text-slate-400 mt-1">Source: {campaignTrendSource}</p>}
            </div>
          </div>
          {savedPostIds.length > 0 && (
            <Link href="/dashboard/posts">
              <Button className="h-10 px-5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shrink-0">
                <Briefcase className="h-4 w-4 mr-2" /> Review {savedPostIds.length} Saved Posts
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* MAIN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: CREATIVE EDITOR */}
        <Card className="lg:col-span-7 border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Creative Editor
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedPlatforms.map((pId) => {
                  const pDef = PLATFORMS.find((p) => p.id === pId);
                  if (!pDef) return null;
                  const Icon = pDef.icon;
                  return (
                    <button key={pId} type="button"
                      onClick={() => { setActivePlatformTab(pId); setActiveSlideIdx(0); }}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        activePlatformTab === pId
                          ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30 font-bold"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" /><span>{pDef.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            {/* FORMAT SELECTOR */}
            <div className="flex flex-wrap items-center gap-2">
              {(selectedContentTypes[activePlatformTab] || []).map((option) => (
                <button key={option} type="button" onClick={() => handleFormatChange(option)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    currentFormatName === option
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm font-bold scale-105"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                  }`}
                >{option}</button>
              ))}
            </div>

            {/* GENERATED IMAGE PREVIEW */}
            {hasAnyPlatformContent && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Visual {(!hasContent) && <span className="text-red-500 font-normal ml-2">(Not generated for this format)</span>}
                  </label>
                  <div className="flex items-center gap-2">
                    {customMedia && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => {
                        setCustomMediaDict(prev => { const next = { ...prev }; delete next[currentMediaKey]; return next; });
                      }} className="h-7 text-xs gap-1 px-2.5 text-red-500">
                        <Trash2 className="h-3 w-3" /> Remove
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-7 text-xs gap-1 px-2.5">
                      <Upload className="h-3 w-3" /> Upload
                    </Button>
                    <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden bg-white dark:bg-slate-900">
                      <input 
                        type="text" 
                        value={customPrompt} 
                        onChange={(e) => setCustomPrompt(e.target.value)} 
                        placeholder="Custom prompt..." 
                        className="h-7 text-xs px-2 w-32 md:w-48 outline-none bg-transparent text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                        onKeyDown={(e) => { if(e.key === 'Enter') handleRenderMedia(); }}
                      />
                      <Button type="button" size="sm" disabled={isRenderingMedia} onClick={handleRenderMedia}
                        className="h-7 text-xs gap-1 px-3 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-none border-l border-slate-200 dark:border-slate-700"
                      >
                        {isRenderingMedia ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Regenerate
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 flex items-center justify-center">
                  {isHtmlSlideFormat ? (
                    // HTML/CSS Slide Renderer for Carousel & Idea Pin
                    <div className={`rounded-xl overflow-hidden shadow-lg border border-slate-700 relative group ${
                      currentFormatName === "Idea Pin" ? "w-[220px] sm:w-[260px] aspect-[9/16]" : "w-[240px] sm:w-[280px] aspect-[4/5]"
                    }`}>
                      {isCurrentSlideLoading ? (
                        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        </div>
                      ) : currentHtmlSlide ? (
                        <iframe
                          srcDoc={currentHtmlSlide}
                          className="w-full h-full border-0 pointer-events-none"
                          title={`Slide ${activeSlideIdx + 1}`}
                          sandbox="allow-same-origin"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                          <div className="text-center text-slate-400 text-xs px-4">
                            <Sparkles className="h-6 w-6 mx-auto mb-2 text-primary" />
                            Generating slide design...
                          </div>
                        </div>
                      )}
                      {/* Slide nav dots */}
                      {displayOverlayTexts.length > 1 && (
                        <>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                            {displayOverlayTexts.map((_, i) => (
                              <div key={i} className={`h-1.5 rounded-full transition-all cursor-pointer ${i === activeSlideIdx ? "w-3 bg-white" : "w-1.5 bg-white/40"}`}
                                onClick={() => setActiveSlideIdx(i)} />
                            ))}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setActiveSlideIdx(p => Math.max(0, p - 1)); }} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"><ChevronLeft className="h-4 w-4" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setActiveSlideIdx(p => Math.min(displayOverlayTexts.length - 1, p + 1)); }} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"><ChevronRight className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  ) : displayImageUrl ? (
                    <div className={`rounded-xl overflow-hidden shadow-lg border border-slate-700 relative group ${
                      isVertical ? "w-[180px] aspect-[9/16]"
                      : isSquare ? "w-[240px] aspect-square"
                      : isPin ? "w-[200px] aspect-[2/3]"
                      : "w-full max-w-[380px] aspect-video"
                    }`}>
                      {customMedia?.type === "video" ? (
                        <video src={customMedia.url} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={displayImageUrl} alt={`Visual`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      )}
                      {currentMediaType === "video" && !customMedia && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white">
                            <Play className="h-5 w-5 fill-current ml-0.5" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      No visual content generated for {currentFormatName}.<br/>Select this format in campaign settings and generate.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CAPTION EDITOR */}
            {hasAnyPlatformContent && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Caption {(!hasContent) && <span className="text-red-500 font-normal ml-2">(Not generated for this format)</span>}
                  </label>
                {currentCaption && (
                  <span className="text-xs text-slate-400 font-mono">{currentCaption.length} chars</span>
                )}
              </div>
              <Textarea
                rows={7}
                value={currentCaption}
                onChange={(e) => updateCaption(e.target.value)}
                placeholder={hasContent ? "Your AI-generated caption..." : "Generate a campaign first to get AI-written captions..."}
                className="w-full text-xs sm:text-sm leading-relaxed p-4 border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-900"
              />

              {/* HASHTAGS */}
              {currentHashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {currentHashtags.map((tag, i) => (
                    <span key={i} className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {tag.startsWith("#") ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>
              )}

              {/* AI REFINEMENT BUTTONS */}
              {hasContent && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {[
                    { action: "regenerate", label: "Regenerate", icon: Wand2, color: "text-primary" },
                    { action: "boost-hook", label: "Boost Hook", icon: Sparkles, color: "text-amber-500" },
                    { action: "executive-tone", label: "Executive Tone", icon: RefreshCw, color: "text-indigo-500" },
                    { action: "add-hashtags", label: "Add Hashtags", icon: Hash, color: "text-emerald-500" },
                  ].map(({ action, label, icon: BtnIcon, color }) => (
                    <Button key={action} type="button" variant="outline" size="sm"
                      disabled={isRefining}
                      onClick={() => handleAIRefine(action)}
                      className="h-8 text-xs font-semibold gap-1.5 bg-white dark:bg-slate-800 hover:border-primary/50 shadow-2xs"
                    >
                      {isRefining && refiningAction === action
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <BtnIcon className={`h-3.5 w-3.5 ${color}`} />
                      }
                      <span>{label}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: LIVE SOCIAL PREVIEW */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" /> Live Preview
                  </CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(selectedContentTypes[activePlatformTab] || []).map((option) => (
                    <button key={option} type="button" onClick={() => handleFormatChange(option)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        currentFormatName === option
                          ? "bg-primary text-white shadow-xs font-bold"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {["Reel", "Shorts", "Video"].includes(option) ? <Film className="h-3 w-3" />
                       : option === "Carousel" || option === "Thread" ? <Layers className="h-3 w-3" />
                       : <ImageIcon className="h-3 w-3" />}
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 flex flex-col items-center justify-center bg-slate-100/60 dark:bg-slate-950/60">
              {!hasContent ? (
                <div className="py-20 text-center">
                  <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">No content generated for {currentFormatName}.<br/>Generate a new campaign with this format selected.</p>
                </div>
              ) : (
                (() => {
                  switch (activePlatformTab) {
                    case "instagram":
                      if (currentFormatName === "Story" || currentFormatName === "Reel") {
                        return (
                          <div className="relative border-[8px] border-slate-900 dark:border-slate-800 rounded-[38px] bg-slate-950 text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/18]">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-28 bg-slate-900 rounded-b-xl z-30" />
                            <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-20">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
                                  <div className="bg-slate-900 h-full w-full rounded-full border border-slate-900"></div>
                                </div>
                                <p className="text-xs font-bold text-white shadow-sm">smbrobotics</p>
                              </div>
                              <MoreHorizontal className="h-4 w-4 text-white drop-shadow-md" />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              {displayImageUrl && <img src={displayImageUrl} alt="Reel" className="w-full h-full object-cover" />}
                            </div>
                            <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 z-20">
                              <div className="flex flex-col items-center gap-1"><Heart className="h-6 w-6 text-white drop-shadow-md" /><span className="text-[10px] font-semibold">12k</span></div>
                              <div className="flex flex-col items-center gap-1"><MessageCircle className="h-6 w-6 text-white drop-shadow-md" /><span className="text-[10px] font-semibold">456</span></div>
                              <div className="flex flex-col items-center gap-1"><Send className="h-5 w-5 text-white drop-shadow-md" /><span className="text-[10px] font-semibold">Share</span></div>
                              <MoreHorizontal className="h-5 w-5 text-white drop-shadow-md mt-2" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-12 z-20">
                              <p className="text-xs font-semibold text-white mb-1">smbrobotics</p>
                              <p className="text-[11px] leading-snug line-clamp-2 text-white">{currentCaption}</p>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="w-full max-w-[340px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-md">
                          <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
                                <div className="bg-white dark:bg-slate-900 h-full w-full rounded-full border border-white dark:border-slate-900 overflow-hidden">
                                  {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
                                </div>
                              </div>
                              <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{userHandle}</p>
                            </div>
                            <MoreHorizontal className="h-4 w-4 text-slate-900 dark:text-white" />
                          </div>
                          <div className={`w-full relative overflow-hidden bg-slate-100 dark:bg-slate-900 ${currentFormatName === 'Idea Pin' || currentFormatName === 'Carousel' ? 'aspect-[9/16]' : 'aspect-[2/3]'}`}>
                            {displayImageUrl && <img src={displayImageUrl} alt="Feed" className="w-full h-full object-cover" />}
                            
                            {/* HTML Overlay for Text-Rich Graphics (e.g. Idea Pins, Carousel) */}
                            {displayOverlayTexts[activeSlideIdx] && (
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-5 z-10">
                                <div className="bg-primary/90 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm w-max mb-2 backdrop-blur-sm shadow-sm border border-white/20">
                                  Step {activeSlideIdx + 1}
                                </div>
                                <h3 className="text-white font-extrabold text-lg sm:text-xl leading-tight mb-1.5 drop-shadow-md">
                                  {displayOverlayTexts[activeSlideIdx].title}
                                </h3>
                                <p className="text-slate-200 text-xs sm:text-sm font-medium leading-snug drop-shadow-sm max-w-[95%]">
                                  {displayOverlayTexts[activeSlideIdx].body}
                                </p>
                              </div>
                            )}

                            {displayImageUrls.length > 1 && (
                              <div className="absolute top-3 right-3 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-white font-semibold tracking-wide z-20">
                                {activeSlideIdx + 1}/{displayImageUrls.length}
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-4 text-slate-900 dark:text-white">
                                <Heart className="h-6 w-6" /><MessageCircle className="h-6 w-6" /><Send className="h-[22px] w-[22px]" />
                              </div>
                              <Bookmark className="h-6 w-6 text-slate-900 dark:text-white" />
                            </div>
                            <p className="text-[13px] font-semibold text-slate-900 dark:text-white mb-1">1,234 likes</p>
                            <p className="text-[13px] text-slate-900 dark:text-white leading-snug line-clamp-3">
                              <span className="font-semibold mr-1.5">{userHandle}</span>
                              {currentCaption}
                            </p>
                          </div>
                        </div>
                      );

                    case "linkedin":
                      return (
                        <div className="w-full max-w-[400px] rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b1f23] shadow-sm">
                          <div className="flex items-start gap-3 p-4 pb-2">
                            <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden">
                              {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
                            </div>
                            <div className="flex-1">
                              <p className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight">{userName}</p>
                              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Automating the Future of B2B SaaS</p>
                              <p className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">1h • <Globe className="h-3 w-3" /></p>
                            </div>
                            <MoreHorizontal className="h-5 w-5 text-slate-500" />
                          </div>
                          <div className="px-4 pb-3">
                            <p className="text-[14px] text-slate-900 dark:text-slate-200 leading-relaxed whitespace-pre-wrap line-clamp-5">{currentCaption}</p>
                          </div>
                          {displayImageUrl && (
                            <div className={`w-full bg-slate-100 dark:bg-slate-900 ${currentFormatName === 'Carousel' ? 'aspect-[4/5]' : 'aspect-video'}`}>
                              <img src={displayImageUrl} alt="LinkedIn Post" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-1 text-[11px] text-slate-500"><ThumbsUp className="h-3 w-3 text-blue-500" /> <Heart className="h-3 w-3 text-red-500" /> 432</div>
                            <div className="text-[11px] text-slate-500">12 comments • 5 reposts</div>
                          </div>
                          <div className="flex items-center justify-between px-4 py-1">
                            {['Like', 'Comment', 'Repost', 'Send'].map(btn => (
                              <button key={btn} className="flex items-center gap-1.5 px-2 py-3 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-[13px] font-semibold text-slate-600 dark:text-slate-400">
                                {btn === 'Like' ? <ThumbsUp className="h-4 w-4" /> : btn === 'Comment' ? <MessageCircle className="h-4 w-4" /> : btn === 'Repost' ? <Repeat2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                                <span className="hidden sm:inline">{btn}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );

                    case "x":
                      return (
                        <div className="w-full max-w-[420px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
                          <div className="flex gap-3">
                            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0 overflow-hidden">
                              <img src={userImage} alt={userName} className="h-full w-full object-cover" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[15px] font-bold text-slate-900 dark:text-white">{userName}</span>
                                  <Check className="h-4 w-4 text-blue-400 bg-white dark:bg-black rounded-full" />
                                  <span className="text-[15px] text-slate-500">@{userHandle}</span>
                                  <span className="text-[15px] text-slate-500">· 2h</span>
                                </div>
                                <MoreHorizontal className="h-4 w-4 text-slate-500" />
                              </div>
                              <p className="text-[15px] text-slate-900 dark:text-white mt-1 mb-3 leading-snug whitespace-pre-wrap">{currentCaption}</p>
                              {displayImageUrl && (
                                <div className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 mt-3 aspect-video">
                                  <img src={displayImageUrl} alt="Tweet" className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-3 max-w-md text-slate-500">
                                <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><MessageCircle className="h-4 w-4" /> 12</button>
                                <button className="flex items-center gap-2 text-[13px] hover:text-emerald-500"><Repeat2 className="h-4 w-4" /> 45</button>
                                <button className="flex items-center gap-2 text-[13px] hover:text-pink-500"><Heart className="h-4 w-4" /> 392</button>
                                <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><Bookmark className="h-4 w-4" /></button>
                                <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><Share2 className="h-4 w-4" /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );

                    case "tiktok":
                      return (
                        <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-black text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16]">
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                            {displayImageUrl && <img src={displayImageUrl} alt="TikTok" className="w-full h-full object-cover opacity-90" />}
                          </div>
                          <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 z-20">
                            <div className="h-10 w-10 rounded-full border-2 border-white bg-slate-800 overflow-hidden">
                              {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
                            </div>
                            <div className="flex flex-col items-center gap-1"><Heart className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">45.2K</span></div>
                            <div className="flex flex-col items-center gap-1"><MessageCircle className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">128</span></div>
                            <div className="flex flex-col items-center gap-1"><Bookmark className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">1.2K</span></div>
                            <div className="flex flex-col items-center gap-1"><Share2 className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">44</span></div>
                          </div>
                          <div className="absolute bottom-0 left-0 right-16 p-3 z-20 bg-gradient-to-t from-black/80 to-transparent">
                            <p className="text-[14px] font-bold text-white mb-1">@{userHandle}</p>
                            <p className="text-[13px] leading-snug line-clamp-3 text-white">{currentCaption}</p>
                            <div className="flex items-center gap-1 mt-2 text-[12px] font-semibold text-white">
                              <Music className="h-3 w-3" /> <span>Original sound - {userName}</span>
                            </div>
                          </div>
                        </div>
                      );

                    case "youtube":
                      return (
                        <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-[#0f0f0f] text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16]">
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                            {displayImageUrl && <img src={displayImageUrl} alt="Shorts" className="w-full h-full object-cover" />}
                          </div>
                          <div className="absolute right-2 bottom-16 flex flex-col items-center gap-5 z-20">
                            <div className="flex flex-col items-center gap-1"><ThumbsUp className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">12K</span></div>
                            <div className="flex flex-col items-center gap-1"><ThumbsUp className="h-6 w-6 text-white rotate-180" /><span className="text-[11px] font-bold text-white">Dislike</span></div>
                            <div className="flex flex-col items-center gap-1"><MessageCircle className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">45</span></div>
                            <div className="flex flex-col items-center gap-1"><Share2 className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">Share</span></div>
                            <div className="flex flex-col items-center gap-1"><RotateCcw className="h-6 w-6 text-white" /><span className="text-[11px] font-bold text-white">Remix</span></div>
                          </div>
                          <div className="absolute bottom-0 left-0 right-14 p-3 pb-4 z-20 bg-gradient-to-t from-black/90 to-transparent">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-8 w-8 rounded-full bg-slate-700 overflow-hidden">
                                {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
                              </div>
                              <p className="text-[13px] font-bold text-white">{userName}</p>
                              <button className="bg-white text-black text-[11px] font-bold px-2.5 py-1 rounded-full">Subscribe</button>
                            </div>
                            <p className="text-[13px] leading-snug line-clamp-2 text-white">{currentCaption}</p>
                          </div>
                        </div>
                      );

                    case "facebook":
                      return (
                        <div className="w-full max-w-[400px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#242526] shadow-md">
                          <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-2">
                              <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
                              </div>
                              <div>
                                <p className="text-[14px] font-bold text-slate-900 dark:text-[#e4e6eb] leading-tight flex items-center gap-1">{userName} <Check className="h-3 w-3 bg-blue-500 text-white rounded-full p-[1px]" /></p>
                                <p className="text-[12px] text-slate-500 dark:text-[#b0b3b8] flex items-center gap-1 mt-0.5">2h • <Globe className="h-3 w-3" /></p>
                              </div>
                            </div>
                            <div className="flex gap-2 text-slate-500"><MoreHorizontal className="h-5 w-5" /><X className="h-5 w-5" /></div>
                          </div>
                          <div className="px-3 pb-2 text-[14px] text-slate-900 dark:text-[#e4e6eb] whitespace-pre-wrap line-clamp-4">{currentCaption}</div>
                          {displayImageUrl && (
                            <div className={`w-full bg-slate-100 dark:bg-[#18191a] ${isVertical ? 'aspect-[4/5]' : 'aspect-square'}`}>
                              <img src={displayImageUrl} alt="FB Post" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="px-4 py-2 border-b border-slate-200 dark:border-[#3e4042]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1"><div className="bg-blue-500 rounded-full p-1"><ThumbsUp className="h-3 w-3 text-white fill-white" /></div><span className="text-[13px] text-slate-500 dark:text-[#b0b3b8]">1.2K</span></div>
                              <div className="text-[13px] text-slate-500 dark:text-[#b0b3b8] flex gap-2"><span>120 comments</span><span>15 shares</span></div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between px-2 py-1">
                            {['Like', 'Comment', 'Share'].map(btn => (
                              <button key={btn} className="flex-1 flex items-center justify-center gap-2 py-2 text-[14px] font-semibold text-slate-600 dark:text-[#b0b3b8] hover:bg-slate-100 dark:hover:bg-[#3a3b3c] rounded-md transition-colors">
                                {btn === 'Like' ? <ThumbsUp className="h-5 w-5" /> : btn === 'Comment' ? <MessageCircle className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
                                {btn}
                              </button>
                            ))}
                          </div>
                        </div>
                      );

                    case "pinterest":
                      return (
                        <div className="w-full max-w-[250px] flex flex-col gap-2.5 mx-auto">
                          <div className={`relative rounded-[24px] overflow-hidden bg-slate-100 dark:bg-slate-800/50 group ${currentFormatName === 'Pin' ? 'aspect-[2/3]' : 'aspect-[9/16]'}`}>
                            {isHtmlSlideFormat ? (
                              isCurrentSlideLoading ? (
                                <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse flex items-center justify-center"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>
                              ) : currentHtmlSlide ? (
                                <iframe srcDoc={currentHtmlSlide} className="w-full h-full border-0 pointer-events-none" title="Idea Pin" sandbox="allow-same-origin" />
                              ) : (
                                <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center"><Sparkles className="h-5 w-5 text-slate-400" /></div>
                              )
                            ) : displayImageUrl ? (
                              <img src={displayImageUrl} alt="Pin" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                              <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse"></div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4 cursor-pointer">
                              <div className="flex justify-end w-full">
                                <button className="bg-[#e60023] hover:bg-[#ad081b] text-white font-bold text-[15px] px-4 py-3 rounded-full leading-none transition-colors">Save</button>
                              </div>
                              <div className="flex justify-end gap-2.5">
                                <button className="h-9 w-9 bg-white/90 hover:bg-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors"><Share2 className="h-[18px] w-[18px] text-slate-900" /></button>
                                <button className="h-9 w-9 bg-white/90 hover:bg-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors"><MoreHorizontal className="h-[18px] w-[18px] text-slate-900" /></button>
                              </div>
                            </div>
                            {displayImageUrls.length > 1 && (
                              <div className="absolute top-4 left-4 bg-black/60 rounded-full p-2 backdrop-blur-sm">
                                <Layers className="h-4 w-4 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 px-1">
                            <h3 className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 pl-0.5">{campaignTopic || "Aesthetics Inspiration"}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden">
                                {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
                              </div>
                              <span className="text-[13px] text-slate-700 dark:text-slate-300 line-clamp-1">{userName}</span>
                            </div>
                          </div>
                        </div>
                      );

                    default:
                      return null;
                  }
                })()
              )}
            </CardContent>
          </Card>

          {/* BEST TIME & PUBLISH CARD */}
          {hasContent && (
            <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-5 space-y-4">
              {currentBestTime && (
                <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Best Time: {currentBestTime}
                      </p>
                      <p className="text-xs text-slate-500">
                        Optimal for {PLATFORMS.find(p => p.id === activePlatformTab)?.label}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Button variant="outline" size="sm" className="h-10 text-xs font-semibold gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-500" /> Save Draft
                </Button>
                <Button variant="outline" size="sm" className="h-10 text-xs font-semibold gap-1.5 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
                  <Calendar className="h-3.5 w-3.5" /> Schedule
                </Button>
                <Button size="sm" className="h-10 text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-white shadow-md sm:col-span-1 col-span-2">
                  <Send className="h-3.5 w-3.5" /> Publish Now
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
