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
  ChevronDown,
  ChevronUp,
  CameraOff,
  Search,
  ArrowLeft,
  ArrowRight,
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

// Platform character limits
const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  x: 280,
  youtube: 5000, // Shorts description limit
  tiktok: 2200,
  pinterest: 500,
};

const getCharLimit = (platform: string): number => PLATFORM_CHAR_LIMITS[platform] || 2200;

interface GeneratedFormat {
  caption: string;
  imagePrompt: string;
  visualPrompts: string[];
  overlayText: { step: number; title: string; body: string; theme: string }[];
  hashtags: string[];
  bestTime: string;
}

// ============================================================================
// POLLINATIONS AI URL BUILDER (placeholder until NVIDIA Build migration)
// ============================================================================
const getPollinationsAIUrl = (prompt?: string, aspectRatio?: string, seed: number = 42, format?: string) => {
  let w = 1080, h = 1080;
  if (aspectRatio === "9:16") { w = 1080; h = 1920; }
  else if (aspectRatio === "16:9") { w = 1920; h = 1080; }
  else if (aspectRatio === "4:5") { w = 1080; h = 1350; }
  else if (aspectRatio === "2:3") { w = 1000; h = 1500; }
  let cleanText = (prompt || "modern digital marketing").replace(/[^a-zA-Z0-9 ,.-]/g, " ").trim();
  if (cleanText.length > 800) cleanText = cleanText.substring(0, 800);
  let styleSuffix = ", photorealistic 8k, vibrant colors, no watermark";
  const encoded = encodeURIComponent(cleanText + styleSuffix);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
};

const getAspectRatio = (format: string): "9:16" | "1:1" | "4:5" | "16:9" | "2:3" => {
  if (["Reel", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(format)) return "9:16";
  if (["Feed"].includes(format)) return "1:1";
  if (["Carousel"].includes(format)) return "4:5";
  if (["Pin"].includes(format)) return "2:3";
  return "16:9";
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

// ============================================================================
// TYPES
// ============================================================================
type Mode = "ai" | "manual";
type MediaSource = "ai" | "upload" | "pixabay" | "prompt";

export default function AIStudioPage() {
  // ===== Connected Platforms =====
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
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

  // ===== MODE: AI vs MANUAL =====
  const [mode, setMode] = useState<Mode>("ai");

  // ===== Platform & Content Type Selection =====
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedContentTypes, setSelectedContentTypes] = useState<Record<string, string[]>>({});
  const [platformsExpanded, setPlatformsExpanded] = useState(true);

  // Auto-select connected platforms on load
  useEffect(() => {
    if (connectedPlatforms.length > 0 && selectedPlatforms.length === 0) {
      const initialPlatforms = connectedPlatforms.filter(p => PLATFORMS.some(pl => pl.id === p));
      setSelectedPlatforms(initialPlatforms);
      const initialTypes: Record<string, string[]> = {};
      initialPlatforms.forEach(p => {
        const plat = PLATFORMS.find(pl => pl.id === p);
        if (plat) initialTypes[p] = [...plat.contentTypes];
      });
      setSelectedContentTypes(initialTypes);
    }
  }, [connectedPlatforms]);

  const togglePlatform = (platformId: string) => {
    if (!connectedPlatforms.includes(platformId)) return;
    setSelectedPlatforms(prev => {
      if (prev.includes(platformId)) {
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== platformId);
      }
      return [...prev, platformId];
    });
  };

  const toggleContentType = (platformId: string, type: string) => {
    if (!connectedPlatforms.includes(platformId)) return;
    if (!selectedPlatforms.includes(platformId)) {
      setSelectedPlatforms(prev => [...prev, platformId]);
    }
    setSelectedContentTypes(prev => {
      const current = prev[platformId] || [];
      if (current.includes(type)) {
        if (current.length === 1) return prev;
        return { ...prev, [platformId]: current.filter(t => t !== type) };
      }
      return { ...prev, [platformId]: [...current, type] };
    });
  };

  const selectAllConnected = () => {
    const all = connectedPlatforms.filter(p => PLATFORMS.some(pl => pl.id === p));
    setSelectedPlatforms(all);
    const types: Record<string, string[]> = {};
    all.forEach(p => {
      const plat = PLATFORMS.find(pl => pl.id === p);
      if (plat) types[p] = [...plat.contentTypes];
    });
    setSelectedContentTypes(types);
  };

  const totalSelectedFormats = selectedPlatforms.reduce(
    (acc, pId) => acc + (selectedContentTypes[pId]?.length || 0), 0
  );

  // ===== AI GENERATION STATE =====
  const [generationState, setGenerationState] = useState<"idle" | "running" | "completed">("idle");
  const [showProgressBox, setShowProgressBox] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [campaignTopic, setCampaignTopic] = useState("");
  const [campaignHook, setCampaignHook] = useState("");
  const [campaignTrendSource, setCampaignTrendSource] = useState("");
  const [generatedContents, setGeneratedContents] = useState<Record<string, Record<string, GeneratedFormat>>>({});

  // For manual mode: we use a flat state per active format
  const [manualContent, setManualContent] = useState<Record<string, {
    caption: string;
    mediaType: "image" | "video";
    mediaUrl: string | null;
  }>>({});

  // ===== Agent Logs =====
  type AgentLog = { node: string; payload?: any; timestamp: number; error?: boolean };
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [showAgentLogPanel, setShowAgentLogPanel] = useState(false);

  // ===== WORKSPACE STATE (Editor & Preview) =====
  const [activePlatformTab, setActivePlatformTab] = useState<string>("instagram");
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [activeFormatTab, setActiveFormatTab] = useState<Record<string, string>>({});

  // Ensure active platform is valid
  useEffect(() => {
    if (!selectedPlatforms.includes(activePlatformTab) && selectedPlatforms.length > 0) {
      setActivePlatformTab(selectedPlatforms[0]);
    }
  }, [selectedPlatforms, activePlatformTab]);

  const validFormats = selectedContentTypes[activePlatformTab] || [];
  const currentFormat = activeFormatTab[activePlatformTab] || validFormats[0] || "Feed";
  const charLimit = getCharLimit(activePlatformTab);

  // ===== Content retrieval based on mode =====
  const isManual = mode === "manual";

  const currentGenerated = !isManual ? (generatedContents[activePlatformTab]?.[currentFormat]) : undefined;
  const currentManual = isManual ? (manualContent[`${activePlatformTab}-${currentFormat}`]) : undefined;

  const currentCaption = isManual
    ? (currentManual?.caption || "")
    : (currentGenerated?.caption || "");
  const currentVisualPrompts = currentGenerated?.visualPrompts || [];
  const currentOverlayTexts = currentGenerated?.overlayText || [];
  const currentHashtags = currentGenerated?.hashtags || [];
  const currentBestTime = currentGenerated?.bestTime || "";
  const currentAspectRatio = getAspectRatio(currentFormat);

  const isMulti = currentFormat === "Carousel" || currentFormat === "Idea Pin" || currentFormat === "Story" || currentFormat === "Thread";
  const isHtmlSlide = currentFormat === "Carousel" || currentFormat === "Idea Pin";
  const displayPrompts = isMulti ? currentVisualPrompts : currentVisualPrompts.slice(0, 1);
  const displayOverlayTexts = isMulti ? currentOverlayTexts : currentOverlayTexts.slice(0, 1);
  const singleImagePrompt = currentGenerated?.imagePrompt || currentVisualPrompts[0] || campaignTopic || "modern digital marketing abstract";

  // ===== Media source management =====
  const [mediaSource, setMediaSource] = useState<MediaSource>("ai");
  const [customMediaDict, setCustomMediaDict] = useState<Record<string, { url: string; type: "image" | "video" }>>({});
  const [renderedImages, setRenderedImages] = useState<Record<string, string>>({});
  const [customPrompt, setCustomPrompt] = useState("");

  // HTML slides cache
  const [htmlSlidesDict, setHtmlSlidesDict] = useState<Record<string, string>>({});
  const [loadingHtmlSlides, setLoadingHtmlSlides] = useState<Record<string, boolean>>({});

  const currentMediaKey = `${activePlatformTab}-${currentFormat}-${activeSlideIdx}`;
  const currentMedia = customMediaDict[currentMediaKey] || null;

  const aiImageUrl = displayPrompts[activeSlideIdx]
    ? getPollinationsAIUrl(displayPrompts[activeSlideIdx], currentAspectRatio, 42 + activeSlideIdx)
    : getPollinationsAIUrl(singleImagePrompt, currentAspectRatio, 42);

  const displayImageUrl = mediaSource === "upload" && currentMedia
    ? currentMedia.url
    : mediaSource === "prompt" && renderedImages[currentMediaKey]
    ? renderedImages[currentMediaKey]
    : aiImageUrl;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== UI expand/collapse =====
  const hasAnyContent = (isManual && currentCaption.length > 0) || (generationState === "completed" && Object.keys(generatedContents[activePlatformTab] || {}).length > 0);

  // ============================================================
  // AI CONTENT GENERATION (REAL STREAM)
  // ============================================================
  const handleGenerateAI = async () => {
    if (mode !== "ai") return;
    setGenerationState("running");
    setShowProgressBox(true);
    setGenerationError(null);
    setPipelineStep(0);
    setAgentLogs([]);
    setPlatformsExpanded(false); // collapse selection

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

      if (!res.ok) {
        let errMsg = "Failed to connect to AI Studio";
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Stream not supported");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const trimmed = event.trim();
          if (!trimmed.startsWith("data: ")) continue;
          let data: any;
          try { data = JSON.parse(trimmed.slice(6)); } catch { continue; }

          if (data.type === "progress") {
            setAgentLogs(prev => {
              const last = prev[prev.length - 1];
              if (last && last.node === data.node && JSON.stringify(last.payload) === JSON.stringify(data.payload)) return prev;
              return [...prev, { node: data.node, payload: data.payload, timestamp: Date.now(), error: data.error || false }];
            });
            // Map node to pipeline step
            const stepMap: Record<string, number> = {
              brandAnalyst: 0,
              trendResearcher: 1,
              competitorAnalyst: 2,
              contentCreator: 3,
              visualizerCreator: 3,
              supervisor: 4,
            };
            setPipelineStep(stepMap[data.node] ?? 0);
          } else if (data.type === "complete") {
            const campaign = data.campaign;
            setCampaignTopic(campaign.topic || "");
            setCampaignHook(campaign.viralHook || "");
            setCampaignTrendSource(campaign.trendSource || "");
            const newContents: Record<string, Record<string, GeneratedFormat>> = {};
            if (campaign.platforms) {
              for (const [platformId, formats] of Object.entries(campaign.platforms)) {
                const normId = platformId.toLowerCase();
                newContents[normId] = {};
                const valid = selectedContentTypes[normId] || [];
                for (const [fmt, content] of Object.entries(formats as any)) {
                  const exact = valid.find(f => f.toLowerCase() === fmt.toLowerCase()) || fmt;
                  const promptsArr = Array.isArray(content.visualPrompts) ? content.visualPrompts : content.visualPrompt ? [content.visualPrompt] : [];
                  newContents[normId][exact] = {
                    caption: content.caption || "",
                    imagePrompt: content.imagePrompt || promptsArr[0] || "",
                    visualPrompts: promptsArr,
                    overlayText: Array.isArray(content.overlayText) ? content.overlayText : [],
                    hashtags: Array.isArray(content.hashtags) ? content.hashtags : [],
                    bestTime: content.bestTime || "9:00 AM",
                  };
                }
              }
            }
            setGeneratedContents(newContents);
            setGenerationState("completed");
            setTimeout(() => setShowProgressBox(false), 2000);
          } else if (data.type === "error") {
            throw new Error(data.error || "Generation failed");
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message);
      setGenerationState("idle");
      setTimeout(() => setShowProgressBox(false), 4000);
    }
  };

  // ===== AI Refinement =====
  const [isRefining, setIsRefining] = useState(false);
  const handleAIRefine = async (action: string) => {
    if (!currentCaption) return;
    setIsRefining(true);
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
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefining(false);
    }
  };

  const updateCaption = (newCaption: string) => {
    if (isManual) {
      setManualContent(prev => ({
        ...prev,
        [`${activePlatformTab}-${currentFormat}`]: {
          ...prev[`${activePlatformTab}-${currentFormat}`],
          caption: newCaption,
          mediaType: "image",
          mediaUrl: null,
        }
      }));
    } else {
      setGeneratedContents(prev => ({
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormat]: {
            ...(prev[activePlatformTab]?.[currentFormat] || {}),
            caption: newCaption,
          },
        },
      }));
    }
  };

  // ===== Media Upload =====
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomMediaDict(prev => ({ ...prev, [currentMediaKey]: { url, type: file.type.startsWith("video") ? "video" : "image" } }));
      setMediaSource("upload");
    }
  };

  // ===== Media Source Actions =====
  const handleAIregenerate = () => {
    setMediaSource("ai");
    // Regenerate with new seed
    const newSeed = Date.now() % 100000;
    const prompt = displayPrompts[activeSlideIdx] || singleImagePrompt;
    const url = getPollinationsAIUrl(prompt, currentAspectRatio, newSeed);
    setRenderedImages(prev => ({ ...prev, [currentMediaKey]: url }));
    // Also remove upload if any
    setCustomMediaDict(prev => { const n = {...prev}; delete n[currentMediaKey]; return n; });
  };

  const handlePixabaySearch = async (query: string) => {
    // Placeholder: Replace with Pixabay API call
    alert(`Pixabay search not implemented. Query: ${query}`);
    // After getting URL, set customMedia or renderedImages
  };

  const handleCustomPromptRender = () => {
    if (!customPrompt.trim()) return;
    setMediaSource("prompt");
    const url = getPollinationsAIUrl(customPrompt, currentAspectRatio, Date.now() % 100000);
    setRenderedImages(prev => ({ ...prev, [currentMediaKey]: url }));
    setCustomPrompt("");
  };

  // ===== Publish / Draft / Schedule Handlers =====
  const handleSaveDraft = () => {
    // TODO: call API POST /api/posts with status: "draft"
    alert("Draft saved (placeholder)");
  };

  const handleSchedule = () => {
    // Open date/time picker, then call API
    const scheduledDate = prompt("Enter schedule date/time (e.g., 2026-08-15T10:00)");
    if (scheduledDate) {
      // TODO: POST /api/posts with status: "scheduled" and scheduled_at
      alert(`Scheduled for ${scheduledDate} (placeholder)`);
    }
  };

  const handlePublishNow = () => {
    // TODO: POST /api/posts with status: "published", trigger OAuth publish
    alert("Publishing now... (placeholder)");
  };

  // ===== Reset =====
  const resetAll = () => {
    if (window.confirm("Reset all generated content?")) {
      setGenerationState("idle");
      setShowProgressBox(false);
      setPipelineStep(0);
      setGenerationError(null);
      setGeneratedContents({});
      setManualContent({});
      setCampaignTopic("");
      setCampaignHook("");
      setCampaignTrendSource("");
      setCustomMediaDict({});
      setRenderedImages({});
      setHtmlSlidesDict({});
      setPlatformsExpanded(true);
    }
  };

  // ===== Preview rendering helpers (same as before) =====
  const isVertical = ["Reel", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(currentFormat);
  const isSquare = currentFormat === "Feed";

  const renderMediaPreview = () => {
    if (isHtmlSlide) {
      const htmlKey = `${activePlatformTab}-${currentFormat}-${activeSlideIdx}`;
      const html = htmlSlidesDict[htmlKey];
      return (
        <div className={`rounded-xl overflow-hidden shadow-lg border border-slate-700 relative group ${currentFormat === "Idea Pin" ? "w-[220px] sm:w-[260px] aspect-[9/16]" : "w-[240px] sm:w-[280px] aspect-[4/5]"}`}>
          {html ? (
            <iframe srcDoc={html} className="w-full h-full border-0 pointer-events-none" title="slide" sandbox="allow-same-origin" />
          ) : (
            <div className="w-full h-full bg-slate-800 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          )}
        </div>
      );
    }
    if (displayImageUrl) {
      return (
        <div className={`rounded-xl overflow-hidden shadow-lg border border-slate-700 relative group ${
          isVertical ? "w-[180px] aspect-[9/16]" : isSquare ? "w-[240px] aspect-square" : "w-full max-w-[380px] aspect-video"
        }`}>
          {currentMedia?.type === "video" ? (
            <video src={displayImageUrl} controls className="w-full h-full object-cover" />
          ) : (
            <img src={displayImageUrl} alt="Visual" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          )}
          {getMediaType(currentFormat) === "video" && !currentMedia && (
            <div className="absolute inset-0 flex items-center justify-center"><Play className="h-12 w-12 text-white fill-white" /></div>
          )}
        </div>
      );
    }
    return <div className="py-12 text-center text-slate-400">No visual</div>;
  };

  return (
    <div className="flex flex-col min-h-screen pb-20 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs mb-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white shadow-md shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Content Studio</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Create posts with AI or manually</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button onClick={() => setMode("ai")} className={`px-4 py-1.5 rounded-md text-xs font-bold transition ${mode === "ai" ? "bg-primary text-white shadow" : "text-slate-600 dark:text-slate-300"}`}>AI Generate</button>
            <button onClick={() => setMode("manual")} className={`px-4 py-1.5 rounded-md text-xs font-bold transition ${mode === "manual" ? "bg-primary text-white shadow" : "text-slate-600 dark:text-slate-300"}`}>Manual Create</button>
          </div>
          <Button variant="ghost" size="sm" onClick={resetAll}><RotateCcw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Platform Selection Accordion (AI mode only) */}
      {mode === "ai" && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-6">
          <button
            onClick={() => setPlatformsExpanded(!platformsExpanded)}
            className="w-full p-4 flex items-center justify-between text-sm font-bold text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-t-lg"
          >
            <span>Platform & Format Selection ({totalSelectedFormats} formats)</span>
            {platformsExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {platformsExpanded && (
            <div className="p-4 pt-0 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={selectAllConnected}>Select All Connected</Button>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {PLATFORMS.map(platform => {
                  const Icon = platform.icon;
                  const isConnected = connectedPlatforms.includes(platform.id);
                  const isSelected = selectedPlatforms.includes(platform.id);
                  const activeFormats = selectedContentTypes[platform.id] || [];
                  return (
                    <div key={platform.id} className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-xl border ${!isConnected ? "opacity-50" : isSelected ? "border-primary/40 bg-primary/5" : "border-slate-200 dark:border-slate-800"}`}>
                      <button onClick={() => togglePlatform(platform.id)} disabled={!isConnected} className="flex items-center gap-2.5 font-bold text-xs">
                        <div className={`h-7 w-7 flex items-center justify-center rounded-lg ${!isConnected ? "bg-slate-200 text-slate-400" : isSelected ? "bg-primary text-white" : "bg-slate-200 text-slate-500"}`}>
                          {!isConnected ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <span className={`text-sm ${!isConnected ? "text-slate-400" : isSelected ? "text-slate-900 font-bold" : "text-slate-500 font-medium"}`}>{platform.label}</span>
                        {!isConnected && <span className="text-[10px] text-slate-400 ml-1">Not Connected</span>}
                      </button>
                      {isConnected && (
                        <div className="flex flex-wrap gap-1.5">
                          {platform.contentTypes.map(type => {
                            const checked = isSelected && activeFormats.includes(type);
                            return (
                              <button key={type} onClick={() => toggleContentType(platform.id, type)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${checked ? "bg-primary text-white" : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600"}`}>
                                {checked ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3 text-slate-400" />}
                                {type}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button onClick={handleGenerateAI} disabled={generationState === "running" || totalSelectedFormats === 0} size="lg" className="h-11 px-8 rounded-xl text-sm font-extrabold gap-2.5 bg-gradient-to-r from-primary via-indigo-600 to-purple-600 text-white shadow-md">
                  {generationState === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4 text-amber-300" />}
                  Generate AI Content
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Agent Progress Popup / Logs */}
      {showProgressBox && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111111] shadow-xs p-5 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-black flex items-center justify-center">
                {generationState === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : generationError ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </div>
              <div>
                <h3 className="font-bold">Multi-Agent Reasoning</h3>
                <p className="text-sm text-slate-500">{generationError ? generationError : generationState === "running" ? "Agents working..." : "Campaign ready"}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowProgressBox(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="bg-[#1e1e1e] rounded-xl p-4 font-mono text-[13px] leading-relaxed text-slate-300 max-h-72 overflow-y-auto space-y-3">
            {agentLogs.length === 0 && !generationError && <p className="animate-pulse text-slate-500">Initializing agents...</p>}
            {agentLogs.map((log, i) => (
              <div key={i} className={`${log.error ? "text-red-400" : "text-slate-300"}`}>
                <span className="font-semibold">[{log.node}]</span> {JSON.stringify(log.payload)}
              </div>
            ))}
          </div>
        </Card>
      )}
      {!showProgressBox && agentLogs.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" onClick={() => setShowProgressBox(true)}><Eye className="h-3.5 w-3.5 mr-1" /> Agent Log</Button>
        </div>
      )}

      {/* MAIN WORKSPACE: Editor + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        {/* Editor Column */}
        <Card className="lg:col-span-7 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider">Creative Editor</span>
              <div className="flex flex-wrap gap-1">
                {selectedPlatforms.map(pId => {
                  const plat = PLATFORMS.find(p => p.id === pId);
                  if (!plat) return null;
                  const Icon = plat.icon;
                  return (
                    <button key={pId} onClick={() => { setActivePlatformTab(pId); setActiveSlideIdx(0); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${activePlatformTab === pId ? "bg-primary text-white" : "bg-white dark:bg-slate-800 border border-slate-200"}`}>
                      <Icon className="h-3.5 w-3.5" /> {plat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-5 flex-1">
            {/* Format Pills */}
            <div className="flex flex-wrap gap-2">
              {validFormats.map(format => (
                <button key={format} onClick={() => setActiveFormatTab(prev => ({ ...prev, [activePlatformTab]: format }))}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold ${currentFormat === format ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {format}
                </button>
              ))}
            </div>

            {/* Media Area with Source Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Visual</label>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  {(["ai","upload","pixabay","prompt"] as MediaSource[]).map(src => (
                    <button key={src} onClick={() => setMediaSource(src)}
                      className={`px-2 py-1 rounded text-xs font-semibold capitalize ${mediaSource === src ? "bg-white dark:bg-slate-700 shadow text-slate-900" : "text-slate-500"}`}>
                      {src}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 flex items-center justify-center min-h-[200px]">
                {mediaSource === "upload" && (
                  <div className="text-center">
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" className="hidden" />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-2" /> Upload Media
                    </Button>
                    {currentMedia && <p className="text-xs text-slate-500 mt-2">Uploaded</p>}
                  </div>
                )}
                {mediaSource === "pixabay" && (
                  <div className="text-center space-y-2">
                    <input type="text" placeholder="Search Pixabay..." className="h-8 text-xs px-2 w-40 outline-none border rounded" onKeyDown={e => e.key==='Enter' && handlePixabaySearch((e.target as HTMLInputElement).value)} />
                    <Button size="sm" variant="outline" onClick={() => handlePixabaySearch("")}>Search</Button>
                    <p className="text-xs text-slate-400">Free images/videos</p>
                  </div>
                )}
                {mediaSource === "prompt" && (
                  <div className="flex items-center gap-2 w-full max-w-md">
                    <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="Enter custom prompt..." className="flex-1 h-8 text-xs px-2 border rounded" />
                    <Button size="sm" onClick={handleCustomPromptRender}>Generate</Button>
                  </div>
                )}
                {mediaSource === "ai" && renderMediaPreview()}
              </div>
            </div>

            {/* Caption Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Caption</label>
                <span className={`text-xs font-mono ${currentCaption.length > charLimit ? "text-red-500" : "text-slate-400"}`}>
                  {currentCaption.length}/{charLimit}
                </span>
              </div>
              <Textarea
                rows={7}
                value={currentCaption}
                onChange={e => updateCaption(e.target.value)}
                placeholder={isManual ? "Write your caption..." : "AI-generated caption..."}
                className="w-full text-xs sm:text-sm p-4 border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-900"
              />
              {currentCaption.length > charLimit && (
                <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Exceeds {PLATFORMS.find(p=>p.id===activePlatformTab)?.label} limit</p>
              )}
              {!isManual && currentHashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {currentHashtags.map((tag,i) => (
                    <span key={i} className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">#{tag}</span>
                  ))}
                </div>
              )}
              {!isManual && hasAnyContent && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {[{action:"regenerate",label:"Regenerate",icon:Wand2},{action:"boost-hook",label:"Boost Hook",icon:Sparkles},{action:"executive-tone",label:"Executive Tone",icon:RefreshCw},{action:"add-hashtags",label:"Add Hashtags",icon:Hash}].map(btn => (
                    <Button key={btn.action} variant="outline" size="sm" disabled={isRefining} onClick={() => handleAIRefine(btn.action)} className="h-8 text-xs font-semibold gap-1.5">
                      {isRefining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <btn.icon className="h-3.5 w-3.5" />}
                      {btn.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Preview Column */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50">
              <CardTitle className="text-xs font-bold uppercase flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-5 flex flex-col items-center bg-slate-100/60 dark:bg-slate-950/60 min-h-[400px] justify-center">
              {!hasAnyContent ? (
                <p className="text-sm text-slate-400">No content to preview</p>
              ) : (
                /* Existing platform preview mockups (Instagram, LinkedIn, etc.) largely unchanged; replace with the same JSX as before, but conditionally use currentCaption & displayImageUrl */
                <div>Preview (keep previous platform mockup code here, using currentCaption and displayImageUrl)</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      {hasAnyContent && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between z-50 shadow-lg">
          <div className="flex items-center gap-3">
            {!isManual && currentBestTime && (
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Clock className="h-4 w-4" />
                <span className="font-semibold">Best Time: {currentBestTime}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSaveDraft}><FileText className="h-4 w-4 mr-1" /> Save Draft</Button>
            <Button variant="outline" size="sm" onClick={handleSchedule}><Calendar className="h-4 w-4 mr-1" /> Schedule</Button>
            <Button size="sm" onClick={handlePublishNow} className="bg-primary text-white"><Send className="h-4 w-4 mr-1" /> Publish Now</Button>
          </div>
        </div>
      )}
    </div>
  );
}
