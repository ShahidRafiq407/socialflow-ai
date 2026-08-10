"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { create } from "zustand";
import { saveDraft as apiSaveDraft, schedulePost as apiSchedulePost, publishNow as apiPublishNow } from "@/actions/publish";
import InstagramPreview from "@/components/previews/InstagramPreview";
import LinkedInPreview from "@/components/previews/LinkedInPreview";
import XPreview from "@/components/previews/XPreview";
import TikTokPreview from "@/components/previews/TikTokPreview";
import YoutubePreview from "@/components/previews/YoutubePreview";
import FacebookPreview from "@/components/previews/FacebookPreview";
import PinterestPreview from "@/components/previews/PinterestPreview";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  Undo2,
  Redo2,
  Plus,
  Zap,
  Archive,
  Users,
  Package,
  Download,
  Inbox,
  Building2,
  BarChart3,
  Tag,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  Save,
  Eye as EyeIcon,
  CheckCheck,
  Hourglass,
  CalendarClock,
  Mail,
  MessageSquareText,
  Bell,
  Copy,
  Edit3,
  Filter,
  Search,
  Grid,
  List,
  LayoutGrid,
} from "lucide-react";
import { getConnectedPlatformIds } from "@/actions/integrations";
import { useUser } from "@clerk/nextjs";
import { DndContext, useDroppable, useDraggable, DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { schedulePost as serverSchedulePost } from "@/actions/publish";
import { getHashtagGroups, createHashtagGroup, deleteHashtagGroup } from "@/actions/hashtags";
import { searchStockMedia } from "@/actions/stock-media";

// ============================================================================
// ZUSTAND GLOBAL STORE — shared between AI Studio, Auto-Pilot, Calendar
// ============================================================================
export type PostStatus = "draft" | "in_review" | "approved" | "scheduled" | "published" | "archived" | "failed";
export type PostSource = "ai_campaign" | "manual" | "autopilot";
export type PostMediaType = "image" | "video" | "carousel" | "none";

export interface Post {
  id: string;
  platform: string;
  format: string;
  caption: string;
  firstComment: string;
  hashtags: string[];
  mediaUrls: string[];
  mediaType: PostMediaType;
  overlayTexts?: any[];
  productTags: { id: string; name: string; price?: string }[];
  status: PostStatus;
  source: PostSource;
  aiCampaignId?: string;
  scheduledAt?: number;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
  analytics: {
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    impressions: number;
  };
}

interface ContentStudioStore {
  posts: Post[];
  addPost: (post: Post) => void;
  updatePost: (id: string, patch: Partial<Post>) => void;
  removePost: (id: string) => void;
  archivePost: (id: string) => void;
  approvePost: (id: string) => void;
}

export const useContentStudioStore = create<ContentStudioStore>((set) => ({
  posts: [],
  addPost: (post) => set((s) => ({ posts: [post, ...s.posts] })),
  updatePost: (id, patch) =>
    set((s) => ({
      posts: s.posts.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    })),
  removePost: (id) => set((s) => ({ posts: s.posts.filter((p) => p.id !== id) })),
  archivePost: (id) =>
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === id ? { ...p, status: "archived" as PostStatus, updatedAt: Date.now() } : p
      ),
    })),
  approvePost: (id) =>
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === id ? { ...p, status: "approved" as PostStatus, updatedAt: Date.now() } : p
      ),
    })),
}));

// ============================================================================
// PLATFORM CONSTANTS & CHARACTER LIMITS
// ============================================================================
interface PlatformDef {
  id: string;
  label: string;
  icon: React.ElementType;
  contentTypes: string[];
  captionLimit: number;
  firstCommentLimit: number;
  hashtagLimit: number;
  color: string;
}

const PLATFORMS: PlatformDef[] = [
  { id: "instagram", label: "Instagram", icon: Camera, contentTypes: ["Feed", "Reel", "Story", "Carousel"], captionLimit: 2200, firstCommentLimit: 1000, hashtagLimit: 30, color: "from-pink-500 to-purple-600" },
  { id: "facebook", label: "Facebook", icon: Globe, contentTypes: ["Feed", "Story", "Reel"], captionLimit: 63206, firstCommentLimit: 8000, hashtagLimit: 30, color: "from-blue-500 to-blue-700" },
  { id: "linkedin", label: "LinkedIn", icon: Briefcase, contentTypes: ["Post", "Carousel", "Short Video"], captionLimit: 3000, firstCommentLimit: 1250, hashtagLimit: 30, color: "from-blue-600 to-blue-800" },
  { id: "x", label: "X", icon: MessageSquare, contentTypes: ["Post", "Thread"], captionLimit: 280, firstCommentLimit: 280, hashtagLimit: 5, color: "from-slate-800 to-black" },
  { id: "youtube", label: "YouTube", icon: PlayCircle, contentTypes: ["Shorts"], captionLimit: 5000, firstCommentLimit: 5000, hashtagLimit: 15, color: "from-red-500 to-red-700" },
  { id: "tiktok", label: "TikTok", icon: Video, contentTypes: ["Video"], captionLimit: 2200, firstCommentLimit: 0, hashtagLimit: 5, color: "from-slate-900 to-pink-600" },
  { id: "pinterest", label: "Pinterest", icon: Bookmark, contentTypes: ["Pin", "Idea Pin"], captionLimit: 500, firstCommentLimit: 0, hashtagLimit: 20, color: "from-red-500 to-red-600" },
];

const getPlatformDef = (id: string) => PLATFORMS.find((p) => p.id === id)!;

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
// HASHTAG GROUPS (saved sets per brand)
// ============================================================================
const DEFAULT_HASHTAG_GROUPS = [
  { id: "g1", name: "E-commerce Essentials", tags: ["shopify", "ecommerce", "onlineshopping", "smallbusiness", "d2c"] },
  { id: "g2", name: "SaaS / B2B", tags: ["saas", "b2b", "startup", "automation", "ai"] },
  { id: "g3", name: "Lifestyle / Fashion", tags: ["fashion", "style", "ootd", "instafashion", "lookbook"] },
  { id: "g4", name: "Fitness / Wellness", tags: ["fitness", "wellness", "health", "workout", "selfcare"] },
];

// ============================================================================
// PRODUCT CATALOG (WooCommerce/Shopify stub)
// ============================================================================
const MOCK_PRODUCTS = [
  { id: "p1", name: "Smart Robot Arm Kit", price: "$299" },
  { id: "p2", name: "AI Vision Sensor", price: "$149" },
  { id: "p3", name: "Industrial Servo Pack", price: "$450" },
  { id: "p4", name: "STEM Learning Bundle", price: "$199" },
];

// ============================================================================
// POLLINATIONS AI URL BUILDER (fallback)
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

const PIPELINE_NODES = [
  { id: "brand_dna", label: "Brand DNA" },
  { id: "trending_research", label: "Trending Topic Research" },
  { id: "competitor_research", label: "Competitor Research" },
  { id: "generating_content", label: "Generating Posts & Videos" },
  { id: "publish_ready", label: "Ready to Publish" },
];

// ============================================================================
// UTILITY — character counter with color
// ============================================================================
const CharacterCounter = ({ current, max, label }: { current: number; max: number; label?: string }) => {
  const ratio = max > 0 ? current / max : 0;
  const pct = Math.min(100, ratio * 100);
  const over = current > max;
  const nearLimit = ratio >= 0.8 && !over;
  const color = over ? "text-red-500" : nearLimit ? "text-amber-500" : "text-slate-500";
  const barColor = over ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-2 text-xs">
      {label && <span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span>}
      <div className="flex items-center gap-2 flex-1">
        <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden max-w-[100px]">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className={`${color} font-mono font-semibold whitespace-nowrap`}>
          {current} / {max}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// STATUS BADGE
// ============================================================================
const StatusBadge = ({ status }: { status: PostStatus }) => {
  const map: Record<PostStatus, { label: string; color: string; icon: React.ElementType }> = {
    draft: { label: "Draft", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", icon: FileText },
    in_review: { label: "In Review", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: Hourglass },
    approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
    scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: CalendarClock },
    published: { label: "Published", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", icon: CheckCheck },
    archived: { label: "Archived", color: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500", icon: Archive },
    failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertTriangle },
  };
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[10px] font-bold gap-1 px-2 py-0.5 border-0 ${cfg.color}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
};

// ============================================================================
// DND CALENDAR COMPONENTS
// ============================================================================
function DraggablePost({ post }: { post: Post }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id, data: { post } });
  const pDef = PLATFORMS.find(pl => pl.id === post.platform);
  const Icon = pDef?.icon || Globe;
  const style = transform ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 } : undefined;
  
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-semibold truncate cursor-grab active:cursor-grabbing ${
        post.status === "published" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
        post.status === "scheduled" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
        post.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
        post.status === "in_review" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{post.caption.slice(0, 15) || "(no caption)"}</span>
    </div>
  );
}

function DroppableDay({ day, calendarMonth, isToday }: { day: { date: Date, posts: Post[] }, calendarMonth: Date, isToday: boolean }) {
  const dateStr = day.date.toISOString().split("T")[0]; // YYYY-MM-DD
  const { setNodeRef, isOver } = useDroppable({ id: dateStr, data: { date: day.date } });
  const isCurrentMonth = day.date.getMonth() === calendarMonth.getMonth();
  
  return (
    <div
      ref={setNodeRef}
      className={`aspect-square p-1 rounded-lg border text-xs transition-colors ${
        isCurrentMonth ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" : "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 text-slate-400"
      } ${isToday ? "ring-2 ring-primary" : ""} ${isOver ? "bg-primary/5 border-primary" : ""}`}
    >
      <div className="font-bold text-[11px] mb-1">{day.date.getDate()}</div>
      <div className="space-y-0.5 overflow-y-auto max-h-[80%]">
        {day.posts.slice(0, 3).map(p => (
          <DraggablePost key={p.id} post={p} />
        ))}
        {day.posts.length > 3 && (
          <div className="text-[10px] text-slate-500 text-center">+{day.posts.length - 3} more</div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AIStudioPage() {
  // ============================================================================
  // MODE: AI | MANUAL | CALENDAR | INBOX | CATALOG
  // ============================================================================
  type ViewMode = "ai" | "manual" | "calendar" | "inbox" | "catalog" | "analytics";
  const [viewMode, setViewMode] = useState<ViewMode>("ai");

  // ============================================================================
  // STORE + PLATFORM CONNECTIONS
  // ============================================================================
  const store = useContentStudioStore();
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

  // ============================================================================
  // HASHTAG GROUPS DYNAMIC STATE
  // ============================================================================
  const [hashtagGroups, setHashtagGroups] = useState<{ id: string; name: string; tags: string[] }[]>([
    { id: "g1", name: "E-commerce Essentials", tags: ["shopify", "ecommerce", "onlineshopping", "d2c"] },
    { id: "g2", name: "SaaS / B2B", tags: ["saas", "b2b", "startup", "automation", "ai"] },
    { id: "g3", name: "Tech & Robotics", tags: ["robotics", "automation", "iot", "engineering", "ai"] },
  ]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTags, setNewGroupTags] = useState("");
  const [isCreatingHashtagGroup, setIsCreatingHashtagGroup] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getHashtagGroups();
        if (res.success && res.data && res.data.length > 0) {
          setHashtagGroups(res.data);
        }
      } catch (e) {
        console.warn("Could not fetch DB hashtag groups:", e);
      }
    })();
  }, []);

  const handleCreateHashtagGroup = async () => {
    if (!newGroupName.trim() || !newGroupTags.trim()) return;
    const tagsArray = newGroupTags.split(/[\s,]+/).map(t => t.replace(/^#/, "")).filter(Boolean);
    try {
      const res = await createHashtagGroup(newGroupName, tagsArray);
      if (res.success && res.data) {
        setHashtagGroups(prev => [res.data, ...prev]);
        setNewGroupName("");
        setNewGroupTags("");
        setIsCreatingHashtagGroup(false);
      }
    } catch (e) {
      console.error("Failed to create hashtag group:", e);
    }
  };

  const handleDeleteHashtagGroup = async (groupId: string) => {
    try {
      await deleteHashtagGroup(groupId);
      setHashtagGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (e) {
      console.error("Failed to delete hashtag group:", e);
    }
  };

  // ============================================================================
  // STOCK MEDIA SEARCH & CUSTOM REGEN MODALS
  // ============================================================================
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [stockMediaType, setStockMediaType] = useState<"image" | "video">("image");
  const [stockResults, setStockResults] = useState<any[]>([]);
  const [searchingStock, setSearchingStock] = useState(false);
  const [stockTargetSlideIdx, setStockTargetSlideIdx] = useState<number>(0);

  const handleSearchStock = async (query: string, type: "image" | "video") => {
    setSearchingStock(true);
    try {
      const res = await searchStockMedia(query, type);
      if (res.success && res.hits) {
        setStockResults(res.hits);
      }
    } catch (e) {
      console.error("Stock search error:", e);
    } finally {
      setSearchingStock(false);
    }
  };

  const [customPromptModalOpen, setCustomPromptModalOpen] = useState(false);
  const [customPromptText, setCustomPromptText] = useState("");
  const [customPromptSlideIdx, setCustomPromptSlideIdx] = useState<number>(0);

  // ============================================================================
  // PLATFORM & CONTENT TYPE SELECTION
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

  useEffect(() => {
    if (connectedPlatforms.length > 0 && selectedPlatforms.length === 0) {
      setSelectedPlatforms(connectedPlatforms.filter(p => PLATFORMS.some(pl => pl.id === p)));
    }
  }, [connectedPlatforms]);

  const togglePlatform = (platformId: string) => {
    if (!connectedPlatforms.includes(platformId)) return;
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
  // GENERATION PIPELINE
  // ============================================================================
  const [generationState, setGenerationState] = useState<"idle" | "running" | "completed">("idle");
  const [showProgressBox, setShowProgressBox] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [campaignTopic, setCampaignTopic] = useState("");
  const [campaignHook, setCampaignHook] = useState("");
  const [campaignTrendSource, setCampaignTrendSource] = useState("");
  const [generatedContents, setGeneratedContents] = useState<Record<string, Record<string, GeneratedFormat>>>({});
  const [aiCampaignId, setAiCampaignId] = useState<string | null>(null);

  const [htmlSlidesDict, setHtmlSlidesDict] = useState<Record<string, string>>({});
  const [loadingHtmlSlides, setLoadingHtmlSlides] = useState<Record<string, boolean>>({});

  type AgentLog = { node: string; payload?: any; timestamp: number };
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);

  // Brand tone (dynamically loaded from Brand Analyst in future)
  const [brandTone, setBrandTone] = useState("Professional and engaging");

  // ============================================================================
  // AI CAMPAIGN GENERATION
  // ============================================================================
  const handleGenerateAIContent = async () => {
    setGenerationState("running");
    setShowProgressBox(true);
    setGenerationError(null);
    setPipelineStep(0);
    setAgentLogs([]);
    const newCampaignId = `camp_${Date.now()}`;
    setAiCampaignId(newCampaignId);

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
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const trimmedEvent = event.trim();
          if (!trimmedEvent.startsWith("data: ")) continue;
          const jsonStr = trimmedEvent.slice(6);
          let data: any;
          try {
            data = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (data.type === "progress") {
            setAgentLogs(prev => {
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
          } else if (data.type === "complete") {
            const campaign = data.campaign;
            setCampaignTopic(campaign.topic || "");
            setCampaignHook(campaign.viralHook || "");
            setCampaignTrendSource(campaign.trendSource || "");

            const newContents: Record<string, Record<string, GeneratedFormat>> = {};
            if (campaign.platforms) {
              for (const [platformId, formats] of Object.entries(campaign.platforms)) {
                const normalizedPlatformId = platformId.toLowerCase();
                newContents[normalizedPlatformId] = {};
                const validFormats = selectedContentTypes[normalizedPlatformId] || [];
                for (const [formatName, rawContent] of Object.entries(formats as Record<string, any>)) {
                  const content = rawContent as any;
                  const exactFormatName = validFormats.find(f => f.toLowerCase() === formatName.toLowerCase()) || formatName;
                  const promptsArray = Array.isArray(content.visualPrompts)
                    ? content.visualPrompts
                    : content.visualPrompt ? [content.visualPrompt] : [];
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
            setGeneratedContents(newContents);
            setPipelineStep(4);
            setGenerationState("completed");
            setTimeout(() => setShowProgressBox(false), 3000);
          } else if (data.type === "error") {
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
  // WORKSPACE STATE
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

  const currentGenerated = generatedContents[activePlatformTab]?.[currentFormatName];
  const currentCaption = currentGenerated?.caption || "";
  const [currentFirstComment, setCurrentFirstComment] = useState("");
  const currentVisualPrompts = currentGenerated?.visualPrompts || [];
  const currentOverlayTexts = currentGenerated?.overlayText || [];
  const currentHashtags = currentGenerated?.hashtags || [];
  const currentBestTime = currentGenerated?.bestTime || "";
  const currentAspectRatio = getAspectRatio(currentFormatName);

  // Caption undo/redo history per format
  const [captionHistory, setCaptionHistory] = useState<Record<string, string[]>>({});
  const [captionHistoryIdx, setCaptionHistoryIdx] = useState<Record<string, number>>({});

  const historyKey = `${activePlatformTab}-${currentFormatName}`;

  const updateCaption = useCallback((newCaption: string) => {
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
    // push to history
    setCaptionHistory(prev => {
      const hist = prev[historyKey] || [];
      const idx = captionHistoryIdx[historyKey] ?? hist.length - 1;
      const trimmed = hist.slice(0, idx + 1);
      const next = [...trimmed, newCaption];
      return { ...prev, [historyKey]: next };
    });
    setCaptionHistoryIdx(prev => {
      const idx = prev[historyKey] ?? -1;
      return { ...prev, [historyKey]: idx + 1 };
    });
  }, [activePlatformTab, currentFormatName, historyKey, captionHistoryIdx]);

  const handleUndo = () => {
    const hist = captionHistory[historyKey] || [];
    const idx = captionHistoryIdx[historyKey] ?? hist.length - 1;
    if (idx > 0) {
      const prevCaption = hist[idx - 1];
      setCaptionHistoryIdx(prev => ({ ...prev, [historyKey]: idx - 1 }));
      setGeneratedContents(prev => ({
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormatName]: {
            ...(prev[activePlatformTab]?.[currentFormatName] || {}),
            caption: prevCaption,
          },
        },
      }));
    }
  };

  const handleRedo = () => {
    const hist = captionHistory[historyKey] || [];
    const idx = captionHistoryIdx[historyKey] ?? hist.length - 1;
    if (idx < hist.length - 1) {
      const nextCaption = hist[idx + 1];
      setCaptionHistoryIdx(prev => ({ ...prev, [historyKey]: idx + 1 }));
      setGeneratedContents(prev => ({
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormatName]: {
            ...(prev[activePlatformTab]?.[currentFormatName] || {}),
            caption: nextCaption,
          },
        },
      }));
    }
  };

  // Reset caption history when format/platform changes
  useEffect(() => {
    setActiveSlideIdx(0);
  }, [activePlatformTab, currentFormatName]);

  const isMultiFormat = currentFormatName === "Carousel" || currentFormatName === "Idea Pin" || currentFormatName === "Story" || currentFormatName === "Thread";
  const isHtmlSlideFormat = currentFormatName === "Carousel" || currentFormatName === "Idea Pin";
  const displayPrompts = isMultiFormat ? currentVisualPrompts : currentVisualPrompts.slice(0, 1);
  const displayOverlayTexts = isMultiFormat ? currentOverlayTexts : currentOverlayTexts.slice(0, 1);
  const singleImagePrompt = currentGenerated?.imagePrompt || currentVisualPrompts[0] || campaignTopic || "modern digital marketing abstract";
  const displayImageUrls = isHtmlSlideFormat
    ? (displayOverlayTexts.length > 0
        ? displayOverlayTexts.map((_, i) => getPollinationsAIUrl(displayPrompts[i] || singleImagePrompt || `${campaignTopic} visual slide ${i + 1}`, currentAspectRatio, 42 + i, currentFormatName))
        : displayPrompts.map((p, i) => getPollinationsAIUrl(p || singleImagePrompt, currentAspectRatio, 42 + i, currentFormatName)))
    : [getPollinationsAIUrl(singleImagePrompt, currentAspectRatio, 42, currentFormatName)];
  const currentMediaType = getMediaType(currentFormatName);

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

  // ============================================================================
  // CAPTION REFINEMENT
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
          brandTone,
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
  // MEDIA UPLOAD (with memory leak fix)
  // ============================================================================
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customMediaDict, setCustomMediaDict] = useState<Record<string, { url: string; type: "image" | "video" }>>({});

  // MEMORY LEAK FIX: revoke URLs when removed or component unmounts
  const revokeMediaUrl = (key: string) => {
    const media = customMediaDict[key];
    if (media?.url.startsWith("blob:")) {
      try { URL.revokeObjectURL(media.url); } catch {}
    }
  };

  useEffect(() => {
    return () => {
      Object.entries(customMediaDict).forEach(([key, media]) => {
        if (media.url.startsWith("blob:")) {
          try { URL.revokeObjectURL(media.url); } catch {}
        }
      });
    };
  }, []);

  const currentMediaKey = `${activePlatformTab}-${currentFormatName}-${activeSlideIdx}`;
  const customMedia = customMediaDict[currentMediaKey] || null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomMediaDict(prev => {
        // revoke previous blob url if any
        const old = prev[currentMediaKey];
        if (old?.url.startsWith("blob:")) {
          try { URL.revokeObjectURL(old.url); } catch {}
        }
        return { ...prev, [currentMediaKey]: { url, type: file.type.startsWith("video") ? "video" : "image" } };
      });
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
    if (isHtmlSlideFormat) {
      const prompt = customPrompt || displayOverlayTexts[activeSlideIdx]?.title || campaignTopic;
      await fetchHtmlSlide(activeSlideIdx, customPrompt || undefined);
      setCustomPrompt("");
      return;
    }
    const activePrompt = customPrompt || singleImagePrompt || campaignTopic;
    if (!activePrompt) return;
    setIsRenderingMedia(true);
    const cacheBuster = ` ${Date.now() % 100000}`;
    const url = getPollinationsAIUrl(activePrompt + cacheBuster, currentAspectRatio, Date.now() % 100000, currentFormatName);
    setRenderedImageUrlsDict(prev => ({ ...prev, [currentMediaKey]: url }));
    setCustomMediaDict(prev => {
      const next = { ...prev };
      if (next[currentMediaKey]?.url.startsWith("blob:")) {
        try { URL.revokeObjectURL(next[currentMediaKey].url); } catch {}
      }
      delete next[currentMediaKey];
      return next;
    });
    setTimeout(() => setIsRenderingMedia(false), 800);
  };

  const aiImageUrl = displayImageUrls[activeSlideIdx] || displayImageUrls[0] || "";
  const displayImageUrl = customMedia?.url || renderedImageUrl || aiImageUrl;

  const currentHtmlSlide = htmlSlidesDict[getHtmlSlideKey(activeSlideIdx)] || null;
  const isCurrentSlideLoading = loadingHtmlSlides[getHtmlSlideKey(activeSlideIdx)] || false;

  // RESET WITH CONFIRMATION
  const resetAll = () => {
    if (!window.confirm("Are you sure you want to reset? All generated content in this session will be lost.")) return;
    setGenerationState("idle");
    setShowProgressBox(false);
    setPipelineStep(0);
    setGenerationError(null);
    setGeneratedContents({});
    setCampaignTopic("");
    setCampaignHook("");
    setCampaignTrendSource("");
    // Revoke all blob URLs before clearing
    Object.entries(customMediaDict).forEach(([key, media]) => {
      if (media.url.startsWith("blob:")) {
        try { URL.revokeObjectURL(media.url); } catch {}
      }
    });
    setCustomMediaDict({});
    setRenderedImageUrlsDict({});
    setHtmlSlidesDict({});
    setCaptionHistory({});
    setCaptionHistoryIdx({});
    setCurrentFirstComment("");
    setAiCampaignId(null);
  };

  const isVertical = ["Reel", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(currentFormatName);
  const isSquare = currentFormatName === "Feed";
  const isCarousel = currentFormatName === "Carousel" || currentFormatName === "Thread";
  const isWidescreen = currentFormatName === "Post";
  const isPin = currentFormatName === "Pin";

  const hasAnyPlatformContent = generationState === "completed" && Object.keys(generatedContents[activePlatformTab] || {}).length > 0;
  const hasContent = hasAnyPlatformContent && !!currentCaption;

  // ============================================================================
  // PUBLISH / SCHEDULE / SAVE DRAFT — WIRED
  // ============================================================================
  const [publishModal, setPublishModal] = useState<{ type: "draft" | "schedule" | "publish" | "send_review" | null; post?: Post }>({ type: null });
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [selectedHashtagGroup, setSelectedHashtagGroup] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; name: string; price?: string }[]>([]);
  const [hashtagDropdownOpen, setHashtagDropdownOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);

  const buildCurrentPost = (status: PostStatus = "draft"): Post | null => {
    if (!hasContent && viewMode === "ai") return null;
    const mediaUrl = displayImageUrl || "";
    const mediaType: PostMediaType = customMedia?.type === "video" ? "video" : currentMediaType === "video" ? "video" : currentMediaType === "carousel" ? "carousel" : "image";
    return {
      id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      platform: activePlatformTab,
      format: currentFormatName,
      caption: currentCaption,
      firstComment: currentFirstComment,
      hashtags: currentHashtags,
      mediaUrls: mediaUrl ? [mediaUrl] : [],
      mediaType,
      overlayTexts: displayOverlayTexts,
      productTags: selectedProducts,
      status,
      source: "ai_campaign",
      aiCampaignId: aiCampaignId || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      analytics: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 },
    };
  };

  const saveAsDraft = async () => {
    const post = buildCurrentPost("draft");
    if (!post) return;
    setPublishLoading(true);
    try {
      const res = await apiSaveDraft({
        platform: post.platform,
        content: post.caption,
        imageUrl: post.mediaUrls[0],
        format: post.format,
        hashtags: post.hashtags,
        mediaType: post.mediaType,
        source: post.source,
      });
      post.id = res.id;
      store.addPost(post);
      setPublishResult({ success: true, message: "Draft saved successfully" });
    } catch (e: any) {
      console.error(e);
      setPublishResult({ success: false, message: e.message || "Failed to save draft" });
    } finally {
      setPublishLoading(false);
      setTimeout(() => setPublishResult(null), 2500);
    }
  };

  const sendForReview = async () => {
    const post = buildCurrentPost("in_review");
    if (!post) return;
    setPublishLoading(true);
    await new Promise(r => setTimeout(r, 500));
    store.addPost(post);
    setPublishResult({ success: true, message: "Sent for review" });
    setPublishLoading(false);
    setTimeout(() => setPublishResult(null), 2500);
  };

  const approvePost = async (post: Post) => {
    setPublishLoading(true);
    await new Promise(r => setTimeout(r, 400));
    store.approvePost(post.id);
    setPublishResult({ success: true, message: "Post approved" });
    setPublishLoading(false);
    setTimeout(() => setPublishResult(null), 2500);
  };

  const openScheduleModal = () => {
    // default: tomorrow at best time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setScheduledAt(tomorrow.toISOString().slice(0, 16));
    setPublishModal({ type: "schedule" });
  };

  const schedulePost = async () => {
    const post = buildCurrentPost("scheduled");
    if (!post) return;
    if (!scheduledAt) {
      setPublishResult({ success: false, message: "Please select a date & time" });
      setTimeout(() => setPublishResult(null), 2500);
      return;
    }
    const schedDate = new Date(scheduledAt);
    post.scheduledAt = schedDate.getTime();
    setPublishLoading(true);
    try {
      const draftRes = await apiSaveDraft({
        platform: post.platform,
        content: post.caption,
        imageUrl: post.mediaUrls[0],
        format: post.format,
        hashtags: post.hashtags,
        mediaType: post.mediaType,
        source: post.source,
      });
      post.id = draftRes.id;
      await apiSchedulePost(post.id, schedDate);
      store.addPost(post);
      setPublishResult({ success: true, message: `Scheduled for ${schedDate.toLocaleString()}` });
      setPublishModal({ type: null });
    } catch (e: any) {
      console.error(e);
      setPublishResult({ success: false, message: e.message || "Failed to schedule post" });
    } finally {
      setPublishLoading(false);
      setTimeout(() => setPublishResult(null), 3000);
    }
  };

  const publishNow = async () => {
    const post = buildCurrentPost("published");
    if (!post) return;
    post.publishedAt = Date.now();
    // Mock analytics seed
    post.analytics = {
      likes: Math.floor(Math.random() * 500) + 50,
      comments: Math.floor(Math.random() * 40) + 5,
      shares: Math.floor(Math.random() * 20) + 2,
      reach: Math.floor(Math.random() * 10000) + 1000,
      impressions: Math.floor(Math.random() * 15000) + 1500,
    };
    setPublishLoading(true);
    try {
      const draftRes = await apiSaveDraft({
        platform: post.platform,
        content: post.caption,
        imageUrl: post.mediaUrls[0],
        format: post.format,
        hashtags: post.hashtags,
        mediaType: post.mediaType,
        source: post.source,
      });
      post.id = draftRes.id;
      await apiPublishNow(post.id);
      store.addPost(post);
      setPublishResult({ success: true, message: `Published to ${getPlatformDef(activePlatformTab).label} ✓` });
    } catch (e: any) {
      console.error(e);
      setPublishResult({ success: false, message: e.message || "Failed to publish post" });
    } finally {
      setPublishLoading(false);
      setTimeout(() => setPublishResult(null), 3000);
    }
  };

  // ============================================================================
  // MANUAL POST CREATION
  // ============================================================================
  const [manualPost, setManualPost] = useState({
    platform: "instagram",
    format: "Feed",
    caption: "",
    firstComment: "",
    hashtags: [] as string[],
    scheduledAt: "",
    status: "draft" as PostStatus,
  });
  const [manualMedia, setManualMedia] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const manualFileRef = useRef<HTMLInputElement>(null);

  const handleManualFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (manualMedia?.url.startsWith("blob:")) {
        try { URL.revokeObjectURL(manualMedia.url); } catch {}
      }
      setManualMedia({ url: URL.createObjectURL(file), type: file.type.startsWith("video") ? "video" : "image" });
    }
  };

  const createManualPost = async (status: PostStatus = "draft") => {
    if (!manualPost.caption.trim() && !manualMedia) {
      setPublishResult({ success: false, message: "Please add caption or media" });
      setTimeout(() => setPublishResult(null), 2500);
      return;
    }
    const mediaType: PostMediaType = manualMedia?.type === "video" ? "video" : manualMedia ? "image" : "none";
    const post: Post = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      platform: manualPost.platform,
      format: manualPost.format,
      caption: manualPost.caption,
      firstComment: manualPost.firstComment,
      hashtags: manualPost.hashtags,
      mediaUrls: manualMedia ? [manualMedia.url] : [],
      mediaType,
      productTags: [],
      status,
      source: "manual",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      analytics: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 },
    };
    if (status === "scheduled" && manualPost.scheduledAt) {
      post.scheduledAt = new Date(manualPost.scheduledAt).getTime();
    }
    if (status === "published") {
      post.publishedAt = Date.now();
    }
    
    setPublishLoading(true);
    try {
      const draftRes = await apiSaveDraft({
        platform: post.platform,
        content: post.caption,
        imageUrl: post.mediaUrls[0],
        format: post.format,
        hashtags: post.hashtags,
        mediaType: post.mediaType,
        source: post.source,
      });
      post.id = draftRes.id;
      
      if (status === "scheduled" && manualPost.scheduledAt) {
        await apiSchedulePost(post.id, new Date(manualPost.scheduledAt));
      } else if (status === "published") {
        await apiPublishNow(post.id);
      }
      
      store.addPost(post);
      setPublishResult({ success: true, message: `Manual post ${status === "scheduled" ? "scheduled" : status === "published" ? "published" : "saved"}` });
      setManualPost({
        platform: "instagram",
        format: "Feed",
        caption: "",
        firstComment: "",
        hashtags: [],
        scheduledAt: "",
        status: "draft",
      });
      if (manualMedia?.url.startsWith("blob:")) {
        try { URL.revokeObjectURL(manualMedia.url); } catch {}
      }
      setManualMedia(null);
    } catch (e: any) {
      console.error(e);
      setPublishResult({ success: false, message: e.message || "Failed to create manual post" });
    } finally {
      setPublishLoading(false);
      setTimeout(() => setPublishResult(null), 2500);
    }
  };

  // ============================================================================
  // HASHTAG GROUP INSERTION
  // ============================================================================
  const insertHashtagGroup = (groupId: string) => {
    const group = hashtagGroups.find(g => g.id === groupId);
    if (!group) return;
    const merged = Array.from(new Set([...currentHashtags, ...group.tags]));
    setGeneratedContents(prev => ({
      ...prev,
      [activePlatformTab]: {
        ...prev[activePlatformTab],
        [currentFormatName]: {
          ...(prev[activePlatformTab]?.[currentFormatName] || {}),
          hashtags: merged,
        },
      },
    }));
    setHashtagDropdownOpen(false);
  };

  // ============================================================================
  // CALENDAR VIEW
  // ============================================================================
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const calendarPosts = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const days: { date: Date; posts: Post[] }[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // pad start
    const startPad = firstDay.getDay();
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      days.push({ date: d, posts: [] });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const postsForDay = store.posts.filter(p => {
        const target = p.scheduledAt || p.publishedAt || p.createdAt;
        const pd = new Date(target);
        return pd.getFullYear() === year && pd.getMonth() === month && pd.getDate() === d;
      });
      days.push({ date, posts: postsForDay });
    }
    return days;
  }, [calendarMonth, store.posts]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const postId = active.id as string;
    const dateStr = over.id as string;
    
    const post = store.posts.find(p => p.id === postId);
    if (!post) return;
    
    const targetDate = new Date(dateStr);
    const oldDate = new Date(post.scheduledAt || post.createdAt);
    targetDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    const newScheduledAt = targetDate.getTime();
    
    store.updatePost(postId, { scheduledAt: newScheduledAt, status: "scheduled" });
    
    setPublishResult({ success: true, message: "Post rescheduled" });
    setTimeout(() => setPublishResult(null), 2500);

    try {
      await serverSchedulePost(postId, targetDate);
    } catch (e) {
      console.error("Failed to schedule on server", e);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
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
              AI-powered campaign creation, manual posts, scheduling & calendar
            </p>
          </div>
        </div>

        {/* MODE TABS */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0 overflow-x-auto">
          {[
            { id: "ai", label: "AI Studio", icon: Sparkles },
            { id: "manual", label: "Manual Post", icon: Plus },
            { id: "calendar", label: "Calendar", icon: Calendar, count: store.posts.filter(p => p.status === "scheduled").length },
            { id: "inbox", label: "Inbox", icon: Inbox, count: 3 },
            { id: "catalog", label: "Products", icon: ShoppingBag },
            { id: "analytics", label: "Analytics", icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  active
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="bg-primary/15 text-primary text-[10px] font-bold px-1.5 rounded-full">{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {generationState !== "idle" && viewMode === "ai" && (
            <Button variant="ghost" size="sm" onClick={resetAll} className="h-9 text-xs font-semibold gap-1 text-slate-500">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>

      {/* TOAST */}
      {publishResult && (
        <div className={`fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm animate-in slide-in-from-right-2 ${
          publishResult.success
            ? "bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
            : "bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
        }`}>
          {publishResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span className="text-xs font-semibold">{publishResult.message}</span>
        </div>
      )}

      {/* ============================================================================ */}
      {/* VIEW: AI STUDIO */}
      {/* ============================================================================ */}
      {viewMode === "ai" && (
        <>
          {/* PLATFORM SELECTION */}
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
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={autoPilotEnabled} onChange={(e) => setAutoPilotEnabled(e.target.checked)} className="rounded" />
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Send to Auto-Pilot Queue
                </label>
                <Badge variant="secondary" className="text-xs font-semibold px-3 py-1 shrink-0">
                  {selectedPlatforms.length} Platforms • {totalSelectedFormats} Formats
                </Badge>
              </div>
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
                      className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 px-4 rounded-xl border transition-all ${
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
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          !isConnected ? "bg-slate-200 dark:bg-slate-800 text-slate-400"
                          : isSelected ? "bg-primary text-white shadow-2xs"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                        }`}>
                          {!isConnected ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <span className={`text-sm ${
                          !isConnected ? "text-slate-400" : isSelected ? "text-slate-900 dark:text-slate-100 font-bold" : "text-slate-500 dark:text-slate-400 font-medium"
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
                  className="h-11 px-8 rounded-xl text-sm font-extrabold gap-2.5 bg-gradient-to-r from-primary via-indigo-600 to-purple-600 hover:opacity-95 text-white shadow-md hover:shadow-lg transition-all shrink-0"
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

          {/* PIPELINE PROGRESS */}
          {showProgressBox && (
            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111111] shadow-xs p-5 sm:p-6 transition-all animate-in fade-in slide-in-from-top-2 overflow-hidden">
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
                      {generationError ? `❌ ${generationError}` : generationState === "running" ? "Agents are currently researching and drafting..." : "Campaign successfully generated."}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowProgressBox(false)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
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
                    body = (
                      <div className="space-y-1.5 mt-1 pl-4 border-l-2 border-slate-700">
                        {log.payload?.trendData && <div className="text-blue-400/90 whitespace-pre-wrap">{log.payload.trendData}</div>}
                        {log.payload?.trendSources && log.payload.trendSources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {log.payload.trendSources.slice(0, 4).map((s: any, i: number) => (
                              <a key={i} href={s.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-blue-950 text-blue-300 hover:bg-blue-900 px-2 py-0.5 rounded text-[11px] font-sans border border-blue-800/80 transition-colors">
                                <Globe className="h-3 w-3 text-blue-400" />
                                <span className="truncate max-w-[160px]">{s.title || s.source}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  } else if (log.node === "competitorAnalyst") {
                    header = "[Competitor Analyst] Cross-referencing trends with unique competitor angle...";
                    if (log.payload?.competitorData) body = <div className="text-purple-400/90 mt-1 pl-4 border-l-2 border-slate-700">{log.payload.competitorData}</div>;
                  } else if (log.node === "contentCreator") {
                    header = "[Content Creator] Synthesizing data into viral posts & visual prompts...";
                  } else if (log.node === "visualizerCreator") {
                    header = "[Visualizer Creator] Translating prompts into rich media parameters...";
                  } else if (log.node === "supervisor") {
                    header = "[CEO Agent] Reviewing generated campaign against brand guidelines...";
                    if (log.payload?.ceoVerdict) body = <div className="text-pink-400/90 mt-1 pl-4 border-l-2 border-slate-700">Verdict: {log.payload.ceoVerdict}</div>;
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

          {/* CAMPAIGN TOPIC BANNER */}
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
              <Link href="/dashboard/posts">
                <Button className="h-10 px-5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shrink-0">
                  <Briefcase className="h-4 w-4 mr-2" /> Review {store.posts.length} Saved Posts
                </Button>
              </Link>
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

                {/* VISUAL */}
                {hasAnyPlatformContent && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Visual {(!hasContent) && <span className="text-red-500 font-normal ml-2">(Not generated for this format)</span>}
                        {currentMediaType === "video" && !customMedia && (
                          <Badge variant="outline" className="ml-2 text-[10px] border-amber-300 text-amber-600 dark:text-amber-400">
                            <Video className="h-2.5 w-2.5 mr-1" /> Video placeholder — real gen coming soon
                          </Badge>
                        )}
                      </label>
                      <div className="flex items-center gap-2">
                        {customMedia && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => {
                            revokeMediaUrl(currentMediaKey);
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
                            Regen
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 flex items-center justify-center">
                      {isHtmlSlideFormat ? (
                        <div className={`rounded-xl overflow-hidden shadow-lg border border-slate-700 relative group ${
                          currentFormatName === "Idea Pin" ? "w-[220px] sm:w-[260px] aspect-[9/16]" : "w-[240px] sm:w-[280px] aspect-[4/5]"
                        }`}>
                          {isCurrentSlideLoading ? (
                            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                              <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            </div>
                          ) : currentHtmlSlide ? (
                            <iframe srcDoc={currentHtmlSlide} className="w-full h-full border-0 pointer-events-none" title={`Slide ${activeSlideIdx + 1}`} sandbox="allow-same-origin" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                              <div className="text-center text-slate-400 text-xs px-4">
                                <Sparkles className="h-6 w-6 mx-auto mb-2 text-primary" />
                                Generating slide design...
                              </div>
                            </div>
                          )}
                          {displayOverlayTexts.length > 1 && (
                            <>
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                                {displayOverlayTexts.map((_, i) => (
                                  <div key={i} className={`h-1.5 rounded-full transition-all cursor-pointer ${i === activeSlideIdx ? "w-3 bg-white" : "w-1.5 bg-white/40"}`}
                                    onClick={() => setActiveSlideIdx(i)} />
                                ))}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setActiveSlideIdx(p => Math.max(0, p - 1)); }} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 z-20"><ChevronLeft className="h-4 w-4" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setActiveSlideIdx(p => Math.min(displayOverlayTexts.length - 1, p + 1)); }} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 z-20"><ChevronRight className="h-4 w-4" /></button>
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
                          No visual content generated for {currentFormatName}.<br/>Select this format and generate.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CAPTION EDITOR */}
                {hasAnyPlatformContent && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          Caption
                        </label>
                        <div className="flex gap-1">
                          <button onClick={handleUndo} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" title="Undo">
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={handleRedo} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" title="Redo">
                            <Redo2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <CharacterCounter current={currentCaption.length} max={getPlatformDef(activePlatformTab).captionLimit} />
                    </div>
                    <Textarea
                      rows={7}
                      value={currentCaption}
                      onChange={(e) => updateCaption(e.target.value)}
                      placeholder={hasContent ? "Your AI-generated caption..." : "Generate a campaign first to get AI-written captions..."}
                      className="w-full text-xs sm:text-sm leading-relaxed p-4 border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-900"
                    />

                    {/* FIRST COMMENT / HIDDEN HASHTAGS */}
                    {getPlatformDef(activePlatformTab).firstCommentLimit > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <MessageSquareText className="h-3 w-3" />
                            First Comment (hidden hashtags / call-to-action)
                          </label>
                          <CharacterCounter current={currentFirstComment.length} max={getPlatformDef(activePlatformTab).firstCommentLimit} />
                        </div>
                        <Textarea
                          rows={3}
                          value={currentFirstComment}
                          onChange={(e) => setCurrentFirstComment(e.target.value)}
                          placeholder="Add hashtags or CTA that posts as the first comment..."
                          className="w-full text-xs sm:text-sm leading-relaxed p-3 border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-900"
                        />
                      </div>
                    )}

                    {/* HASHTAGS + PRODUCT TAGS */}
                    <div className="flex flex-col gap-2">
                      {(currentHashtags.length > 0 || true) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Hashtags:</span>
                          <div className="relative">
                            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setHashtagDropdownOpen(!hashtagDropdownOpen)}>
                              <Tag className="h-3 w-3" /> Add group <ChevronDown className="h-3 w-3" />
                            </Button>
                            {hashtagDropdownOpen && (
                              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-2 space-y-2">
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1 flex justify-between items-center">
                                  <span>Hashtag Groups</span>
                                  <button onClick={() => setIsCreatingHashtagGroup(!isCreatingHashtagGroup)} className="text-primary hover:underline text-[10px] font-semibold flex items-center gap-0.5">
                                    <Plus className="h-3 w-3" /> New
                                  </button>
                                </div>
                                {isCreatingHashtagGroup && (
                                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-1.5 border border-slate-200 dark:border-slate-700">
                                    <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group Name (e.g. B2B SaaS)" className="h-7 text-xs" />
                                    <Input value={newGroupTags} onChange={e => setNewGroupTags(e.target.value)} placeholder="Tags (#saas #ai #marketing)" className="h-7 text-xs" />
                                    <div className="flex gap-1 justify-end">
                                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setIsCreatingHashtagGroup(false)}>Cancel</Button>
                                      <Button size="sm" className="h-6 text-[10px]" onClick={handleCreateHashtagGroup}>Save Group</Button>
                                    </div>
                                  </div>
                                )}
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {hashtagGroups.map(g => (
                                    <div key={g.id} className="group/item flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                                      <button onClick={() => insertHashtagGroup(g.id)} className="flex-1 text-left truncate pr-2">
                                        <div className="font-semibold text-slate-800 dark:text-slate-200">{g.name}</div>
                                        <div className="text-[10px] text-slate-500 truncate">{g.tags.map(t => (t.startsWith("#") ? t : `#${t}`)).join(" ")}</div>
                                      </button>
                                      <Trash2 className="h-3 w-3 text-slate-400 hover:text-red-500 cursor-pointer opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0" onClick={() => handleDeleteHashtagGroup(g.id)} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 flex-1">
                            {currentHashtags.map((tag, i) => (
                              <span key={i} className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                {tag.startsWith("#") ? tag : `#${tag}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PRODUCT TAGS */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <ShoppingBag className="h-3 w-3" /> Products:
                        </span>
                        <div className="relative">
                          <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setProductDropdownOpen(!productDropdownOpen)}>
                            <Plus className="h-3 w-3" /> Tag product
                          </Button>
                          {productDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 p-1 max-h-48 overflow-y-auto">
                              {MOCK_PRODUCTS.map(p => (
                                <button key={p.id}
                                  onClick={() => {
                                    if (!selectedProducts.find(sp => sp.id === p.id)) {
                                      setSelectedProducts([...selectedProducts, p]);
                                    }
                                    setProductDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 rounded flex justify-between">
                                  <span>{p.name}</span>
                                  <span className="text-slate-500 font-mono">{p.price}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedProducts.map(p => (
                          <Badge key={p.id} variant="secondary" className="text-[10px] gap-1">
                            {p.name} <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSelectedProducts(selectedProducts.filter(sp => sp.id !== p.id))} />
                          </Badge>
                        ))}
                      </div>
                    </div>

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

            {/* RIGHT: LIVE PREVIEW + PUBLISH */}
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
                          return <InstagramPreview currentFormatName={currentFormatName} displayImageUrl={displayImageUrl} displayImageUrls={displayImageUrls} displayOverlayTexts={displayOverlayTexts} activeSlideIdx={activeSlideIdx} userName={userName} userImage={userImage} userHandle={userHandle} currentCaption={currentCaption} />;
                        case "linkedin":
                          return <LinkedInPreview currentFormatName={currentFormatName} displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} currentCaption={currentCaption} />;
                        case "x":
                          return <XPreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} userHandle={userHandle} currentCaption={currentCaption} />;
                        case "tiktok":
                          return <TikTokPreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} userHandle={userHandle} currentCaption={currentCaption} />;
                        case "youtube":
                          return <YoutubePreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} currentCaption={currentCaption} />;
                        case "facebook":
                          return <FacebookPreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} currentCaption={currentCaption} isVertical={isVertical} />;
                        case "pinterest":
                          return <PinterestPreview currentFormatName={currentFormatName} isHtmlSlideFormat={isHtmlSlideFormat} isCurrentSlideLoading={isCurrentSlideLoading} currentHtmlSlide={currentHtmlSlide} displayImageUrl={displayImageUrl} campaignTopic={campaignTopic} userName={userName} userImage={userImage} />;
                        default:
                          return null;
                      }
                    })()
                  )}
                </CardContent>
                {hasContent && (
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex items-center justify-between gap-2 flex-wrap text-xs">
                    <span className="font-bold text-slate-500 flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5" /> Media Options:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1 font-semibold"
                        onClick={() => {
                          setCustomPromptSlideIdx(activeSlideIdx);
                          setCustomPromptModalOpen(true);
                        }}
                      >
                        <Wand2 className="h-3 w-3 text-indigo-500" /> Custom Prompt AI
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1 font-semibold"
                        onClick={() => {
                          setStockTargetSlideIdx(activeSlideIdx);
                          setStockModalOpen(true);
                        }}
                      >
                        <ImageIcon className="h-3 w-3 text-pink-500" /> Pixabay Stock
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1 font-semibold"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3 w-3 text-emerald-500" /> Upload from PC
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* PUBLISH CARD */}
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Button variant="outline" size="sm" onClick={saveAsDraft} disabled={publishLoading} className="h-10 text-xs font-semibold gap-1.5">
                      <Save className="h-3.5 w-3.5" /> Draft
                    </Button>
                    <Button variant="outline" size="sm" onClick={sendForReview} disabled={publishLoading} className="h-10 text-xs font-semibold gap-1.5 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400">
                      <Eye className="h-3.5 w-3.5" /> Review
                    </Button>
                    <Button variant="outline" size="sm" onClick={openScheduleModal} disabled={publishLoading} className="h-10 text-xs font-semibold gap-1.5 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20">
                      <Calendar className="h-3.5 w-3.5" /> Schedule
                    </Button>
                    <Button size="sm" onClick={publishNow} disabled={publishLoading} className="h-10 text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-white shadow-md">
                      <Send className="h-3.5 w-3.5" /> Publish
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* ============================================================================ */}
      {/* VIEW: MANUAL POST */}
      {/* ============================================================================ */}
      {viewMode === "manual" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Create Manual Post</h2>
            </div>
            <p className="text-xs text-slate-500">No AI needed — write your caption, upload media, pick platform & publish.</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Platform</label>
                <select value={manualPost.platform} onChange={(e) => setManualPost({ ...manualPost, platform: e.target.value })}
                  className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-1">
                  {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Format</label>
                <select value={manualPost.format} onChange={(e) => setManualPost({ ...manualPost, format: e.target.value })}
                  className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-1">
                  {getPlatformDef(manualPost.platform).contentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Caption</label>
                <CharacterCounter current={manualPost.caption.length} max={getPlatformDef(manualPost.platform).captionLimit} />
              </div>
              <Textarea rows={6} value={manualPost.caption}
                onChange={(e) => setManualPost({ ...manualPost, caption: e.target.value })}
                placeholder="Write your caption..."
                className="w-full mt-1" />
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">First Comment (hidden hashtags)</label>
                <CharacterCounter current={manualPost.firstComment.length} max={getPlatformDef(manualPost.platform).firstCommentLimit} />
              </div>
              <Textarea rows={2} value={manualPost.firstComment}
                onChange={(e) => setManualPost({ ...manualPost, firstComment: e.target.value })}
                placeholder="#hashtag1 #hashtag2 ..."
                className="w-full mt-1" />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Media</label>
              <input type="file" ref={manualFileRef} onChange={handleManualFileChange} accept="image/*,video/*" className="hidden" />
              <Button variant="outline" className="w-full mt-1" onClick={() => manualFileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> {manualMedia ? "Replace" : "Upload"} Image/Video
              </Button>
              {manualMedia && (
                <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 relative">
                  {manualMedia.type === "video" ? (
                    <video src={manualMedia.url} controls className="w-full max-h-64" />
                  ) : (
                    <img src={manualMedia.url} alt="preview" className="w-full max-h-64 object-cover" />
                  )}
                  <button onClick={() => {
                    if (manualMedia.url.startsWith("blob:")) URL.revokeObjectURL(manualMedia.url);
                    setManualMedia(null);
                  }} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <Button variant="outline" onClick={() => createManualPost("draft")}>
                <Save className="h-3.5 w-3.5 mr-1" /> Draft
              </Button>
              <Button variant="outline" onClick={() => {
                const t = new Date(); t.setDate(t.getDate() + 1);
                setManualPost({ ...manualPost, scheduledAt: t.toISOString().slice(0, 16) });
              }}>
                <Calendar className="h-3.5 w-3.5 mr-1" /> Schedule
              </Button>
              <Button onClick={() => createManualPost("published")}>
                <Send className="h-3.5 w-3.5 mr-1" /> Publish
              </Button>
            </div>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Preview</h3>
            <div className="bg-slate-50 dark:bg-slate-950/50 rounded-lg p-4 min-h-[300px] flex items-center justify-center">
              {manualPost.caption || manualMedia ? (
                <div className="text-center">
                  {manualMedia && (
                    <div className="mb-3 rounded-lg overflow-hidden max-h-48 mx-auto w-fit">
                      {manualMedia.type === "video" ? (
                        <video src={manualMedia.url} className="max-h-48" />
                      ) : (
                        <img src={manualMedia.url} alt="" className="max-h-48" />
                      )}
                    </div>
                  )}
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-w-md">{manualPost.caption || "(no caption)"}</p>
                  <p className="text-xs text-slate-500 mt-2">on <b>{getPlatformDef(manualPost.platform).label}</b> • {manualPost.format}</p>
                </div>
              ) : (
                <div className="text-center text-slate-400 text-sm">
                  <Plus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Start writing to see preview
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================================ */}
      {/* VIEW: CALENDAR */}
      {/* ============================================================================ */}
      {viewMode === "calendar" && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {calendarMonth.toLocaleString("default", { month: "long", year: "numeric" })}
              </h2>
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-3.5 w-3.5 mr-1" /> Filter
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-slate-500 py-2">{d}</div>
            ))}
          </div>
          <DndContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-7 gap-1">
              {calendarPosts.map((day, i) => {
                const isToday = new Date().toDateString() === day.date.toDateString();
                return (
                  <DroppableDay key={i} day={day} calendarMonth={calendarMonth} isToday={isToday} />
                );
              })}
            </div>
          </DndContext>
        </Card>
      )}

      {/* ============================================================================ */}
      {/* VIEW: INBOX (stub) */}
      {/* ============================================================================ */}
      {viewMode === "inbox" && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
          <div className="text-center py-16">
            <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">Unified Social Inbox</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">All comments, DMs, and mentions across your connected platforms in one place.</p>
            <Badge variant="outline" className="mt-4 text-amber-600 border-amber-300">Coming Soon — Phase 5</Badge>
            <div className="mt-6 max-w-md mx-auto text-left space-y-2">
              {[
                { platform: "Instagram", count: 23, icon: Camera },
                { platform: "X", count: 12, icon: MessageSquare },
                { platform: "LinkedIn", count: 5, icon: Briefcase },
              ].map(i => {
                const Icon = i.icon;
                return (
                  <div key={i.platform} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{i.platform}</span>
                    </div>
                    <Badge variant="secondary">{i.count} unread</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* ============================================================================ */}
      {/* VIEW: CATALOG */}
      {/* ============================================================================ */}
      {viewMode === "catalog" && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" /> Product Catalog
            </h2>
            <Button variant="outline" size="sm">
              <Package className="h-3.5 w-3.5 mr-1" /> Sync from Shopify
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MOCK_PRODUCTS.map(p => (
              <div key={p.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:border-primary/50 cursor-pointer">
                <div className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg mb-2 flex items-center justify-center">
                  <Package className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{p.name}</p>
                <p className="text-xs font-mono text-slate-500">{p.price}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ============================================================================ */}
      {/* VIEW: ANALYTICS */}
      {/* ============================================================================ */}
      {viewMode === "analytics" && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Performance Analytics
          </h2>
          {store.posts.filter(p => p.status === "published").length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Publish some posts to see analytics here</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Reach", value: store.posts.reduce((s, p) => s + p.analytics.reach, 0).toLocaleString(), icon: EyeIcon, color: "text-blue-500" },
                  { label: "Engagements", value: store.posts.reduce((s, p) => s + p.analytics.likes + p.analytics.comments, 0).toLocaleString(), icon: Heart, color: "text-pink-500" },
                  { label: "Shares", value: store.posts.reduce((s, p) => s + p.analytics.shares, 0).toLocaleString(), icon: Share2, color: "text-emerald-500" },
                  { label: "Published", value: store.posts.filter(p => p.status === "published").length, icon: CheckCheck, color: "text-violet-500" },
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <Icon className={`h-4 w-4 ${stat.color} mb-1`} />
                      <p className="text-[11px] text-slate-500 font-semibold">{stat.label}</p>
                      <p className="text-lg font-extrabold text-slate-900 dark:text-white">{stat.value}</p>
                    </div>
                  );
                })}
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr className="text-left text-slate-500">
                      <th className="p-2">Platform</th>
                      <th className="p-2">Caption</th>
                      <th className="p-2">Likes</th>
                      <th className="p-2">Comments</th>
                      <th className="p-2">Reach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.posts.filter(p => p.status === "published").slice(0, 10).map(p => {
                      const pDef = PLATFORMS.find(pl => pl.id === p.platform);
                      const Icon = pDef?.icon || Globe;
                      return (
                        <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="p-2"><Icon className="h-3.5 w-3.5 inline mr-1" /> {pDef?.label}</td>
                          <td className="p-2 truncate max-w-[200px]">{p.caption.slice(0, 40)}</td>
                          <td className="p-2 font-mono">{p.analytics.likes}</td>
                          <td className="p-2 font-mono">{p.analytics.comments}</td>
                          <td className="p-2 font-mono">{p.analytics.reach.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ============================================================================ */}
      {/* SCHEDULE MODAL */}
      {/* ============================================================================ */}
      {publishModal.type === "schedule" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-500" /> Schedule Post
              </h3>
              <button onClick={() => setPublishModal({ type: null })} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Schedule for</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-1 text-sm" />
            <p className="text-xs text-slate-500 mt-2">
              Recommended: {currentBestTime || "9:00 AM"} based on platform engagement patterns
            </p>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" onClick={() => setPublishModal({ type: null })} className="flex-1">Cancel</Button>
              <Button onClick={schedulePost} disabled={publishLoading} className="flex-1">
                {publishLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calendar className="h-4 w-4 mr-1" />}
                Confirm Schedule
              </Button>
            </div>
          </div>
        </div>
      {/* ============================================================================ */}
      {/* STOCK MEDIA SEARCH MODAL (Pixabay Integration) */}
      {/* ============================================================================ */}
      {stockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-pink-500" /> Pixabay Stock Media Library
              </h3>
              <button onClick={() => setStockModalOpen(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                value={stockQuery}
                onChange={e => setStockQuery(e.target.value)}
                placeholder="Search stock images & videos (e.g. robotics, marketing)..."
                onKeyDown={e => e.key === "Enter" && handleSearchStock(stockQuery, stockMediaType)}
                className="flex-1"
              />
              <select
                value={stockMediaType}
                onChange={e => setStockMediaType(e.target.value as any)}
                className="px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold bg-white dark:bg-slate-900"
              >
                <option value="image">Images</option>
                <option value="video">Videos</option>
              </select>
              <Button onClick={() => handleSearchStock(stockQuery, stockMediaType)} disabled={searchingStock}>
                {searchingStock ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />} Search
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-[250px] max-h-[400px]">
              {searchingStock ? (
                <div className="flex items-center justify-center h-48 text-slate-400 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" /> Searching Pixabay...
                </div>
              ) : stockResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                  <ImageIcon className="h-8 w-8 text-slate-300" />
                  <p className="text-xs">Type a keyword and hit Search to browse HD royalty-free media</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {stockResults.map(item => (
                    <div
                      key={item.id}
                      onClick={() => {
                        // Apply selected stock media to current format/slide
                        const key = `${activePlatformTab}-${currentFormatName}`;
                        setCustomMediaDict(prev => ({
                          ...prev,
                          [key]: { url: item.url, type: item.type }
                        }));
                        setStockModalOpen(false);
                      }}
                      className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-800 hover:ring-2 hover:ring-primary transition-all"
                    >
                      {item.type === "video" ? (
                        <video src={item.url} className="w-full h-full object-cover" muted loop autoPlay />
                      ) : (
                        <img src={item.previewUrl} alt={item.tags} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Badge className="text-[10px] gap-1"><Plus className="h-3 w-3" /> Select</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* CUSTOM PROMPT REGENERATION MODAL */}
      {/* ============================================================================ */}
      {customPromptModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-indigo-500" /> Custom Prompt Media AI
              </h3>
              <button onClick={() => setCustomPromptModalOpen(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Describe the exact visual or graphic design you want for slide/media #{customPromptSlideIdx + 1}:
            </p>
            <Textarea
              rows={3}
              value={customPromptText}
              onChange={e => setCustomPromptText(e.target.value)}
              placeholder="e.g. Modern dark theme tech layout with glowing blue neon text 'Top 5 AI Tools' and futuristic robot arm..."
              className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCustomPromptModalOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  fetchHtmlSlide(customPromptSlideIdx, customPromptText);
                  setCustomPromptModalOpen(false);
                }}
              >
                <Sparkles className="h-4 w-4 mr-1" /> Generate Custom Visual
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
