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
import VideoStudioModal from "@/components/video-studio/VideoStudioModal";
import StockMediaModal from "@/components/stock-media/StockMediaModal";
import MultiAgentStreamModal from "@/components/ai-studio/MultiAgentStreamModal";
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
  Monitor,
  Smartphone,
  Settings,
  Sliders,
} from "lucide-react";
import { getConnectedPlatformIds, getWorkspaceIntegrations } from "@/actions/integrations";
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

export const isVideoUrl = (url: string | null) => {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') || lowerUrl.includes('.mp4?') || lowerUrl.includes('pixabay.com/video/');
};

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
  const [integrationsList, setIntegrationsList] = useState<any[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [openPlatformDropdown, setOpenPlatformDropdown] = useState<string | null>(null);
  const [openEditorPlatformDropdown, setOpenEditorPlatformDropdown] = useState<boolean>(false);

  const { user } = useUser();
  const defaultUserName = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "SMB Robotics";
  const defaultUserHandle = defaultUserName.toLowerCase().replace(/\s/g, "");
  const defaultUserImage = user?.imageUrl || null;

  useEffect(() => {
    (async () => {
      try {
        const connected = await getConnectedPlatformIds();
        setConnectedPlatforms(connected);
        const integrations = await getWorkspaceIntegrations();
        setIntegrationsList(integrations);
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

  const [customPromptModalOpen, setCustomPromptModalOpen] = useState(false);
  const [customPromptText, setCustomPromptText] = useState("");
  const [customPromptSlideIdx, setCustomPromptSlideIdx] = useState<number>(0);

  const [rightPanelTab, setRightPanelTab] = useState<"preview" | "settings">("preview");
  const [devicePreviewMode, setDevicePreviewMode] = useState<"desktop" | "mobile">("mobile");

  const [editorMediaTab, setEditorMediaTab] = useState<"upload" | "stock" | "ai">("ai");
  const [activeMediaModal, setActiveMediaModal] = useState<"upload" | "stock" | "ai" | null>(null);
  const [selectedStockCategory, setSelectedStockCategory] = useState<string>("Business");
  const [carouselSlideCount, setCarouselSlideCount] = useState<number>(5);
  const [carouselCustomPrompt, setCarouselCustomPrompt] = useState<string>("");
  const [selectedAiImageModel, setSelectedAiImageModel] = useState<string>("pollinations");
  const [selectedAiVideoModel, setSelectedAiVideoModel] = useState<string>("template");
  const [videoPromptText, setVideoPromptText] = useState<string>("");
  const [aiGeneratingCaption, setAiGeneratingCaption] = useState<boolean>(false);

  // Specialized AI Video Model Controls
  const [heygenAvatar, setHeygenAvatar] = useState<string>("sarah");
  const [heygenVoice, setHeygenVoice] = useState<string>("en-US-female");
  const [heygenBg, setHeygenBg] = useState<string>("office");

  const [templateCategory, setTemplateCategory] = useState<string>("product");
  const [templateHeadline, setTemplateHeadline] = useState<string>("");
  const [templateSubheadline, setTemplateSubheadline] = useState<string>("");
  const [templateAnimation, setTemplateAnimation] = useState<string>("zoom");

  const [cameraMotion, setCameraMotion] = useState<string>("pan");

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
  const [isMultiAgentModalOpen, setIsMultiAgentModalOpen] = useState(false);

  const handleMultiAgentPayload = (campaignPayload: any) => {
    if (!campaignPayload || !campaignPayload.platforms) return;
    
    const firstPlatform = selectedPlatforms[0] || Object.keys(campaignPayload.platforms)[0];

    setGeneratedContents(prev => {
      const updated = { ...prev };
      for (const [plt, formats] of Object.entries(campaignPayload.platforms as Record<string, Record<string, any>>)) {
        const normalizedPlt = plt.toLowerCase();
        updated[normalizedPlt] = updated[normalizedPlt] || {};
        for (const [fmt, content] of Object.entries(formats)) {
          const caption = content.caption || "";
          const hashtags = Array.isArray(content.hashtags) 
            ? content.hashtags.map((h: string) => h.startsWith("#") ? h : `#${h}`) 
            : [];
          const visualPrompts = Array.isArray(content.visualPrompts) && content.visualPrompts.length > 0 
            ? content.visualPrompts 
            : (content.imagePrompt ? [content.imagePrompt] : []);
          
          updated[normalizedPlt][fmt] = {
            caption,
            imagePrompt: content.imagePrompt || content.visualPrompt || "",
            hashtags,
            visualPrompts,
            bestTime: content.bestTime || "Best engagement window",
            overlayText: Array.isArray(content.overlayText) ? content.overlayText : [],
          };
        }
      }
      return updated;
    });

    if (firstPlatform) {
      const normFirst = firstPlatform.toLowerCase();
      setActivePlatformTab(normFirst);
      const availableFmts = Object.keys(campaignPayload.platforms[firstPlatform] || campaignPayload.platforms[normFirst] || {});
      if (availableFmts.length > 0) {
        setActiveFormatTab(prev => ({ ...prev, [normFirst]: availableFmts[0] }));
      }
    }

    setPublishResult({
      success: true,
      message: "AI Multi-Agent Content generated & loaded into Content Editor!",
    });
    setTimeout(() => setPublishResult(null), 3500);
  };
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

  const platformDef = getPlatformDef(activePlatformTab);
  const validSelectedFormats = (selectedContentTypes[activePlatformTab] && selectedContentTypes[activePlatformTab].length > 0)
    ? selectedContentTypes[activePlatformTab]
    : (platformDef?.contentTypes || []);

  let currentFormatName = activeFormatTab[activePlatformTab];
  if (!currentFormatName || !validSelectedFormats.includes(currentFormatName)) {
    currentFormatName = validSelectedFormats[0] || platformDef?.contentTypes[0] || "Feed";
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
          brandName: defaultUserName,
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
      const prompt = customPrompt || carouselCustomPrompt || displayOverlayTexts[activeSlideIdx]?.title || campaignTopic;
      await fetchHtmlSlide(activeSlideIdx, prompt || undefined);
      setCustomPrompt("");
      setCarouselCustomPrompt("");
      return;
    }
    const activePrompt = customPrompt || singleImagePrompt || campaignTopic || `Professional ${activePlatformTab} ${currentFormatName} visual design`;
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

  const hasAnyPlatformContent = Object.keys(generatedContents[activePlatformTab] || {}).length > 0;
  const hasContent = true;

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
    platforms: ["instagram"] as string[],
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
    const selectedPlats = manualPost.platforms && manualPost.platforms.length > 0 ? manualPost.platforms : [manualPost.platform];
    const mediaType: PostMediaType = manualMedia?.type === "video" ? "video" : manualMedia ? "image" : "none";
    setPublishLoading(true);

    try {
      for (const pId of selectedPlats) {
        const post: Post = {
          id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          platform: pId,
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
      }

      setPublishResult({ success: true, message: `Manual post ${status === "scheduled" ? "scheduled" : status === "published" ? "published" : "saved"} for ${selectedPlats.length} platforms` });
      setManualPost({
        platform: "instagram",
        platforms: ["instagram"],
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
      setTimeout(() => setPublishResult(null), 3000);
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm shrink-0 border border-slate-800 dark:border-slate-200">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Generate with AI or Add Your Own Content
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Select target platforms & formats below, then generate with AI or write custom posts.
            </p>
          </div>
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

          {/* FULL WIDTH TARGET PLATFORMS & FORMATS SELECTION CARD */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs !overflow-visible relative z-30">
            <CardContent className="pt-1.5 pb-2 px-3.5 space-y-0.5 !overflow-visible">
              {/* TARGET PLATFORMS & FORMAT DROPDOWNS ROW */}
              <div className="space-y-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block -mt-0.5">
                  Target Platforms & Formats Selection:
                </span>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {PLATFORMS.map((platform) => {
                    const Icon = platform.icon;
                    const isConnected = connectedPlatforms.includes(platform.id);
                    const isSelected = selectedPlatforms.includes(platform.id);
                    const isDropdownOpen = openPlatformDropdown === platform.id;
                    const activeFormats = selectedContentTypes[platform.id] || [];

                    return (
                      <div
                        key={platform.id}
                        onMouseLeave={() => setOpenPlatformDropdown(null)}
                        className={`relative flex items-center gap-1 p-0.5 px-2 rounded-lg border transition-all ${
                          !isConnected
                            ? "border-slate-200 dark:border-slate-800 opacity-40 bg-slate-50"
                            : isSelected
                            ? "border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-300"
                        } ${isDropdownOpen ? "z-50 ring-2 ring-primary/40" : "z-10"}`}
                      >
                        {/* CUSTOM SLEEK CHECKBOX FOR PLATFORM MULTI-SELECT */}
                        <button
                          type="button"
                          disabled={!isConnected}
                          onClick={() => togglePlatform(platform.id)}
                          className={`h-3.5 w-3.5 rounded flex items-center justify-center transition-colors shrink-0 ${
                            isSelected
                              ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                              : "border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                          }`}
                          title={`Select/Deselect ${platform.label}`}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                        </button>

                        {/* BUTTON WITH FORMAT DROPDOWN */}
                        <div className="relative">
                          <button
                            type="button"
                            disabled={!isConnected}
                            onClick={() => setOpenPlatformDropdown(isDropdownOpen ? null : platform.id)}
                            onMouseEnter={() => {
                              if (isConnected) setOpenPlatformDropdown(platform.id);
                            }}
                            className={`flex items-center gap-1 py-0.5 px-1 rounded text-[11px] font-bold transition-all ${
                              !isConnected
                                ? "text-slate-400 opacity-50 cursor-not-allowed"
                                : isSelected
                                ? "text-white dark:text-slate-900 font-extrabold"
                                : "text-slate-700 dark:text-slate-300 hover:text-slate-900"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{platform.label}</span>
                            <ChevronDown className="h-3 w-3 opacity-70 ml-0.5" />
                          </button>

                          {/* FORMAT SELECTION DROPDOWN (EXACT ALIGNMENT & TICK BOXES) */}
                          {isDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in slide-in-from-top-1">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <span>Select Formats</span>
                              </div>
                              {platform.contentTypes.map((type) => {
                                const isChecked = isSelected && activeFormats.includes(type);
                                return (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => {
                                      if (!isSelected) togglePlatform(platform.id);
                                      toggleContentType(platform.id, type);
                                    }}
                                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left transition-colors"
                                  >
                                    <span className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {}}
                                        className="rounded border-slate-300 text-primary h-3.5 w-3.5 pointer-events-none"
                                      />
                                      <span>{type}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GENERATE CONTENT WITH AI FOR ALL SELECTED PLATFORMS BUTTON */}
          <div className="mt-2.5 mb-4 flex items-center justify-center">
            <Button
              onClick={() => setIsMultiAgentModalOpen(true)}
              disabled={selectedPlatforms.length === 0}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-95 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-purple-500/20 gap-2.5 transition-all hover:scale-[1.01]"
            >
              <Sparkles className="h-4 w-4" />
              <span>Generate Content with AI for All Selected Platforms ({selectedPlatforms.length})</span>
            </Button>
          </div>

          {/* MAIN WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: CREATIVE EDITOR */}
            <Card className="lg:col-span-7 border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 !overflow-visible relative z-20 flex flex-col">
              {/* SINGLE SLEEK 1-LINE TOOLBAR (ULTRA THIN HEADER) */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-2 py-1 bg-slate-50/50 dark:bg-slate-800/20 rounded-t-xl">
                  <div className="flex items-center gap-2.5">
                    {/* HEADING WITHOUT EMOJI/LOGO */}
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 shrink-0 ml-1">
                      Content Editor
                    </span>

                    <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

                    {/* SINGLE PLATFORM DROPDOWN SELECTOR WITH HOVER BRIDGE */}
                    <div
                      className="relative"
                      onMouseLeave={() => setOpenEditorPlatformDropdown(false)}
                      onMouseEnter={() => setOpenEditorPlatformDropdown(true)}
                    >
                      {(() => {
                        const activeDef = PLATFORMS.find((p) => p.id === activePlatformTab) || PLATFORMS[0];
                        const Icon = activeDef.icon;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => setOpenEditorPlatformDropdown(!openEditorPlatformDropdown)}
                              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs transition-all hover:bg-slate-800"
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{activeDef.label}</span>
                              <ChevronDown className="h-3 w-3 opacity-70 ml-0.5" />
                            </button>

                            {openEditorPlatformDropdown && (
                              <div className="absolute top-full left-0 pt-1 w-44 z-50 animate-in fade-in slide-in-from-top-1">
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-0.5">
                                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5 border-b border-slate-100 dark:border-slate-800">
                                    Switch Platform
                                  </div>
                                  {PLATFORMS.map((pDef) => {
                                    const pId = pDef.id;
                                    const PIcon = pDef.icon;
                                    const isCurrent = activePlatformTab === pId;
                                    const isPlatformSelected = selectedPlatforms.includes(pId);
                                    
                                    return (
                                      <button
                                        key={pId}
                                        type="button"
                                        disabled={!isPlatformSelected}
                                        onClick={() => {
                                          if (!isPlatformSelected) return;
                                          setActivePlatformTab(pId);
                                          setActiveSlideIdx(0);
                                          setOpenEditorPlatformDropdown(false);
                                        }}
                                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                          !isPlatformSelected
                                            ? "text-slate-400 opacity-50 cursor-not-allowed"
                                            : isCurrent
                                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold"
                                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        }`}
                                      >
                                        <PIcon className="h-3.5 w-3.5" />
                                        <span>{pDef.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* FORMAT PILLS (INLINE IN THE EXACT SAME 1 LINE) */}
                    <div className="flex items-center gap-1">
                      {validSelectedFormats.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setActiveFormatTab((prev) => ({ ...prev, [activePlatformTab]: option }));
                            setActiveSlideIdx(0);
                          }}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all ${
                            currentFormatName === option
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200/60"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              <CardContent className="p-3 sm:p-4 space-y-4 !overflow-visible">
                {/* ---------------------------------------------------------------------------- */}
                {/* SECTION 1: DYNAMIC CAPTION / TITLE EDITOR & AI GENERATOR */}
                {/* ---------------------------------------------------------------------------- */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Edit3 className="h-3.5 w-3.5 text-primary" />
                        {activePlatformTab === "youtube"
                          ? "Video Title & Description"
                          : activePlatformTab === "pinterest"
                          ? "Pin Title & Description"
                          : "Caption / Post Content"}
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
                    rows={4}
                    value={currentCaption}
                    onChange={(e) => updateCaption(e.target.value)}
                    placeholder={`Type or paste your ${activePlatformTab === "youtube" ? "video description" : "post caption"} here, or generate one with AI...`}
                    className="w-full text-xs sm:text-sm leading-relaxed p-3 border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-900 shadow-2xs"
                  />

                  {/* AI CAPTION GENERATE / REGENERATE BUTTON */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <Button
                      type="button"
                      size="sm"
                      disabled={aiGeneratingCaption}
                      onClick={async () => {
                        setAiGeneratingCaption(true);
                        const topic = campaignTopic || "Exciting new product launch and special offer for our community";
                        setTimeout(() => {
                          const generated = activePlatformTab === "pinterest"
                            ? `📍 ${topic.toUpperCase()} - Complete Guide & Creative Ideas\n\nLooking to elevate your ${topic}? Here are the top proven strategies, tips, and visual inspiration to get maximum results.\n\nSave this Pin for later and click the link to read full article!`
                            : activePlatformTab === "youtube"
                            ? `🎥 ${topic} (Complete 2026 Overview)\n\nWelcome back to our channel! In this video, we cover everything about ${topic}. Timestamps & links below:\n\n0:00 - Introduction\n1:30 - Key Strategies\n3:45 - Live Demo\n\n👍 Like, Subscribe & Hit the Bell Icon!`
                            : `🚀 Exciting news! We're thrilled to introduce our latest breakthrough in ${topic}.\n\n✨ Key Highlights:\n- Premium quality & unmatched performance\n- Designed for maximum efficiency\n- Special early-bird access available now!\n\n👇 Drop a comment below or click the link in bio to learn more!\n#marketing #innovation #b2b #tech #growth`;
                          updateCaption(generated);
                          setAiGeneratingCaption(false);
                        }, 1000);
                      }}
                      className="h-7 text-xs font-semibold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 text-white shadow-xs hover:opacity-90"
                    >
                      {aiGeneratingCaption ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      <span>
                        {currentCaption
                          ? `Regenerate ${activePlatformTab === "youtube" ? "Title & Description" : activePlatformTab === "pinterest" ? "Pin Title & Description" : "Caption"} with AI`
                          : `Generate ${activePlatformTab === "youtube" ? "Title & Description" : activePlatformTab === "pinterest" ? "Pin Title & Description" : "Caption"} with AI`}
                      </span>
                    </Button>

                    <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                      Auto-tailored for {PLATFORMS.find(p => p.id === activePlatformTab)?.label}
                    </span>
                  </div>
                </div>

                {/* ---------------------------------------------------------------------------- */}
                {/* SECTION 2: FORMAT-AWARE MEDIA CREATION STUDIO (3 MODAL TRIGGERS) */}
                {/* ---------------------------------------------------------------------------- */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 space-y-0">
                  {/* MEDIA STUDIO HEADER & 3 MODAL BUTTONS */}
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        {currentMediaType === "video" ? "Video Studio" : isCarousel ? "Carousel Studio" : "Image Studio"}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold border-slate-300 dark:border-slate-700">
                        {currentFormatName}
                      </Badge>
                    </div>

                    {/* 3 POPUP MODAL BUTTONS */}
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveMediaModal("upload")}
                        className="h-7 text-xs font-bold gap-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-2xs hover:bg-slate-100"
                      >
                        <Upload className="h-3 w-3 text-emerald-500" />
                        <span>Upload PC</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setActiveMediaModal("stock");
                        }}
                        className="h-7 text-xs font-bold gap-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-2xs hover:bg-slate-100"
                      >
                        <ImageIcon className="h-3 w-3 text-pink-500" />
                        <span>Stock</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setActiveMediaModal("ai")}
                        className="h-7 text-xs font-bold gap-1 bg-gradient-to-r from-primary to-indigo-600 text-white shadow-2xs hover:opacity-90"
                      >
                        <Sparkles className="h-3 w-3 text-white" />
                        <span>AI Gen</span>
                      </Button>
                    </div>
                  </div>

                  {/* MEDIA STUDIO WORKSPACE CONTAINER */}
                  <div className="p-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 flex flex-col items-center justify-center min-h-[160px]">
                      {displayImageUrl ? (
                        <div className="relative group max-h-[220px] overflow-hidden rounded-lg">
                          {isVideoUrl(displayImageUrl) ? (
                            <video src={displayImageUrl} autoPlay loop muted playsInline className="max-h-[220px] w-full object-cover rounded-lg shadow-sm" />
                          ) : (
                            <img src={displayImageUrl} alt="Preview" className="max-h-[220px] object-cover rounded-lg shadow-sm" />
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              revokeMediaUrl(currentMediaKey);
                              setCustomMediaDict(prev => { const next = { ...prev }; delete next[currentMediaKey]; return next; });
                              setRenderedImageUrlsDict(prev => { const next = { ...prev }; delete next[currentMediaKey]; return next; });
                            }}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-slate-400 text-xs">
                          <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-50" />
                          No media attached yet. Click Upload PC, Stock, or AI Gen above to add media.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ---------------------------------------------------------------------------- */}
                {/* SECTION 3: HASHTAGS, FIRST COMMENT, PRODUCTS & AI REFINEMENT */}
                {/* ---------------------------------------------------------------------------- */}
                <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {/* FIRST COMMENT */}
                  {getPlatformDef(activePlatformTab).firstCommentLimit > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <MessageSquareText className="h-3 w-3" />
                          First Comment (Auto-Posted)
                        </label>
                        <CharacterCounter current={currentFirstComment.length} max={getPlatformDef(activePlatformTab).firstCommentLimit} />
                      </div>
                      <Textarea
                        rows={2}
                        value={currentFirstComment}
                        onChange={(e) => setCurrentFirstComment(e.target.value)}
                        placeholder="Add hashtags or call-to-action that posts automatically as first comment..."
                        className="w-full text-xs p-2 border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900"
                      />
                    </div>
                  )}

                  {/* HASHTAG GROUPS */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Hashtags:</span>
                      <div className="relative">
                        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setHashtagDropdownOpen(!hashtagDropdownOpen)}>
                          <Tag className="h-3 w-3" /> Insert Group <ChevronDown className="h-3 w-3" />
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
                                <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group Name" className="h-7 text-xs" />
                                <Input value={newGroupTags} onChange={e => setNewGroupTags(e.target.value)} placeholder="#saas #ai #marketing" className="h-7 text-xs" />
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
                        className="h-7 text-xs font-semibold gap-1.5 bg-white dark:bg-slate-800 hover:border-primary/50 shadow-2xs"
                      >
                        {isRefining && refiningAction === action
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <BtnIcon className={`h-3.5 w-3.5 ${color}`} />
                        }
                        <span>{label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RIGHT COLUMN (40%): LIVE PREVIEW & PLATFORM SETTINGS */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 overflow-hidden">
                {/* TABS HEADER: PREVIEW VS SETTINGS */}
                <CardHeader className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setRightPanelTab("preview")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                          rightPanelTab === "preview"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5 text-primary" />
                        <span>Live Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRightPanelTab("settings")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                          rightPanelTab === "settings"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        <Settings className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Settings</span>
                      </button>
                    </div>

                    {/* IF PREVIEW TAB ACTIVE: DESKTOP VS MOBILE DEVICE TOGGLE */}
                    {rightPanelTab === "preview" && (
                      <div className="flex items-center gap-0.5 bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setDevicePreviewMode("mobile")}
                          title="Mobile View"
                          className={`p-1 rounded-md text-xs transition-all ${
                            devicePreviewMode === "mobile"
                              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDevicePreviewMode("desktop")}
                          title="Desktop View"
                          className={`p-1 rounded-md text-xs transition-all ${
                            devicePreviewMode === "desktop"
                              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Monitor className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-4 bg-slate-50/50 dark:bg-slate-950/40 min-h-[380px] flex flex-col justify-center items-center">
                  {rightPanelTab === "preview" ? (
                    /* TAB 1: LIVE PREVIEW */
                    <div className="w-full flex flex-col items-center">
                      <div className={`transition-all duration-300 w-full flex justify-center ${
                        devicePreviewMode === "mobile" ? "max-w-[340px]" : "max-w-[500px]"
                      }`}>
                        {!hasContent ? (
                          <div className="py-16 text-center">
                            <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                            <p className="text-sm text-slate-400 font-medium">
                              No preview content yet.<br/>Type in editor or generate campaign to view live mockup.
                            </p>
                          </div>
                        ) : (
                          (() => {
                            const activeIntegration = integrationsList.find(i => i.platformKey === activePlatformTab);
                            const activeName = activeIntegration?.pageName || activeIntegration?.handle || defaultUserName;
                            const activeHandle = activeIntegration?.handle ? (activeIntegration.handle.startsWith("@") ? activeIntegration.handle : `@${activeIntegration.handle}`) : `@${defaultUserHandle}`;
                            const activeImage = defaultUserImage;

                            switch (activePlatformTab) {
                              case "instagram":
                                return <InstagramPreview currentFormatName={currentFormatName} displayImageUrl={displayImageUrl} displayImageUrls={displayImageUrls} displayOverlayTexts={displayOverlayTexts} activeSlideIdx={activeSlideIdx} userName={activeName} userImage={activeImage} userHandle={activeHandle} currentCaption={currentCaption} />;
                              case "linkedin":
                                return <LinkedInPreview currentFormatName={currentFormatName} displayImageUrl={displayImageUrl} userName={activeName} userImage={activeImage} currentCaption={currentCaption} />;
                              case "x":
                                return <XPreview displayImageUrl={displayImageUrl} userName={activeName} userImage={activeImage} userHandle={activeHandle} currentCaption={currentCaption} />;
                              case "tiktok":
                                return <TikTokPreview displayImageUrl={displayImageUrl} userName={activeName} userImage={activeImage} userHandle={activeHandle} currentCaption={currentCaption} />;
                              case "youtube":
                                return <YoutubePreview displayImageUrl={displayImageUrl} userName={activeName} userImage={activeImage} currentCaption={currentCaption} />;
                              case "facebook":
                                return <FacebookPreview displayImageUrl={displayImageUrl} userName={activeName} userImage={activeImage} currentCaption={currentCaption} isVertical={isVertical} />;
                              case "pinterest":
                                return <PinterestPreview currentFormatName={currentFormatName} isHtmlSlideFormat={isHtmlSlideFormat} isCurrentSlideLoading={isCurrentSlideLoading} currentHtmlSlide={currentHtmlSlide} displayImageUrl={displayImageUrl} campaignTopic={campaignTopic} userName={activeName} userImage={activeImage} />;
                              default:
                                return null;
                            }
                          })()
                        )}
                      </div>
                    </div>
                  ) : (
                    /* TAB 2: PLATFORM SETTINGS */
                    <div className="w-full space-y-4 text-left">
                      <div className="p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-1">
                        <div className="flex items-center gap-2 font-bold text-xs text-indigo-900 dark:text-indigo-300">
                          <Clock className="h-4 w-4 text-indigo-600" />
                          <span>Optimal Posting Time</span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {currentBestTime ? `Recommended: ${currentBestTime}` : "Best time calculated automatically based on audience engagement data."}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5 text-primary" />
                            {PLATFORMS.find(p => p.id === activePlatformTab)?.label} API Publishing Settings
                          </div>
                        </div>

                        {/* INSTAGRAM REAL SETTINGS */}
                        {activePlatformTab === "instagram" && (
                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Tag Location</label>
                              <Input placeholder="e.g. San Francisco, CA" className="h-7 text-xs bg-slate-50 dark:bg-slate-800" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Alt Text (Accessibility)</label>
                              <Textarea rows={2} placeholder="Describe image for visually impaired users..." className="text-xs p-2 bg-slate-50 dark:bg-slate-800" />
                            </div>
                            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Share to Facebook Feed</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Hide Like & View Counts</span>
                                <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Turn Off Commenting</span>
                                <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* LINKEDIN REAL SETTINGS */}
                        {activePlatformTab === "linkedin" && (
                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Post Visibility</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="public">Anyone (Public)</option>
                                <option value="connections">Connections Only</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Target Audience</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="all">All Followers</option>
                                <option value="targeted">Targeted Industry / Seniority</option>
                              </select>
                            </div>
                            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Notify Employees of New Post</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* YOUTUBE REAL SETTINGS */}
                        {activePlatformTab === "youtube" && (
                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Video Title</label>
                              <Input placeholder="Enter catchy title..." className="h-7 text-xs bg-slate-50 dark:bg-slate-800" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Visibility</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="public">Public</option>
                                <option value="unlisted">Unlisted</option>
                                <option value="private">Private</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Audience</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="not_kids">No, it's not made for kids</option>
                                <option value="kids">Yes, it's made for kids</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Video Tags</label>
                              <Input placeholder="tech, ai, tutorial..." className="h-7 text-xs bg-slate-50 dark:bg-slate-800" />
                            </div>
                          </div>
                        )}

                        {/* TIKTOK REAL SETTINGS */}
                        {activePlatformTab === "tiktok" && (
                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Who Can View</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="everyone">Everyone</option>
                                <option value="friends">Friends</option>
                                <option value="private">Only Me</option>
                              </select>
                            </div>
                            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Allow Comments</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Allow Duet</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Allow Stitch</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Allow High-Quality Upload</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* X / TWITTER REAL SETTINGS */}
                        {activePlatformTab === "x" && (
                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Who Can Reply?</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="everyone">Everyone</option>
                                <option value="followed">Accounts you follow</option>
                                <option value="mentioned">Only accounts you mention</option>
                              </select>
                            </div>
                            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Auto-Split Long Tweets into Thread</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Mark as Sensitive Content</span>
                                <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* FACEBOOK REAL SETTINGS */}
                        {activePlatformTab === "facebook" && (
                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Audience</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="public">Public</option>
                                <option value="friends">Friends</option>
                                <option value="only_me">Only Me</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Tag Location</label>
                              <Input placeholder="Location name..." className="h-7 text-xs bg-slate-50 dark:bg-slate-800" />
                            </div>
                            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                                <span>Cross-post to Instagram Feed</span>
                                <input type="checkbox" defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* PINTEREST REAL SETTINGS */}
                        {activePlatformTab === "pinterest" && (
                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Destination Board</label>
                              <select className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none">
                                <option value="b1">Tech & Automation Ideas</option>
                                <option value="b2">Marketing Tips 2026</option>
                                <option value="b3">AI Tools & Workflows</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Destination Link / Website URL</label>
                              <Input placeholder="https://yourwebsite.com/article" className="h-7 text-xs bg-slate-50 dark:bg-slate-800" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Alt Text</label>
                              <Input placeholder="Pin visual description..." className="h-7 text-xs bg-slate-50 dark:bg-slate-800" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* PUBLISH CARD (ALWAYS VISIBLE & ACCESSIBLE) */}
              <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-4 space-y-3">
                {currentBestTime && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Best Time to Post: {currentBestTime}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Optimal engagement window for {PLATFORMS.find(p => p.id === activePlatformTab)?.label}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
                  <Button variant="outline" size="sm" onClick={saveAsDraft} disabled={publishLoading} className="h-9 px-2 text-[11px] font-extrabold gap-1 bg-white dark:bg-slate-800">
                    <Save className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">Save Draft</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={sendForReview} disabled={publishLoading} className="h-9 px-2 text-[11px] font-extrabold gap-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Review</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={openScheduleModal} disabled={publishLoading} className="h-9 px-2 text-[11px] font-extrabold gap-1 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Schedule</span>
                  </Button>
                  <Button size="sm" onClick={publishNow} disabled={publishLoading} className="h-9 px-2 text-[11px] font-extrabold gap-1 bg-primary hover:bg-primary/90 text-white shadow-md">
                    {publishLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Send className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">Publish Now</span>
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ============================================================================ */}
      {/* VIEW: MANUAL POST */}
      {/* ============================================================================ */}
      {viewMode === "manual" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Create Manual Post</h2>
            </div>
            <p className="text-xs text-slate-500">Select one or multiple platforms, write your caption, attach media, and publish/schedule instantly.</p>

            {/* MULTI-PLATFORM SELECTOR FOR MANUAL POST */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Select Platforms (Multi-Select)</label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map(p => {
                  const Icon = p.icon;
                  const selected = (manualPost.platforms || [manualPost.platform]).includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const current = manualPost.platforms || [manualPost.platform];
                        const next = selected ? (current.length > 1 ? current.filter(id => id !== p.id) : current) : [...current, p.id];
                        setManualPost({ ...manualPost, platforms: next, platform: next[0] });
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selected
                          ? "bg-primary text-white shadow-xs"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{p.label}</span>
                      {selected && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Format</label>
              <select value={manualPost.format} onChange={(e) => setManualPost({ ...manualPost, format: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-1">
                {getPlatformDef(manualPost.platform).contentTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Caption</label>
                <CharacterCounter current={manualPost.caption.length} max={getPlatformDef(manualPost.platform).captionLimit} />
              </div>
              <Textarea rows={6} value={manualPost.caption}
                onChange={(e) => setManualPost({ ...manualPost, caption: e.target.value })}
                placeholder="Write your caption..."
                className="w-full mt-1 text-xs sm:text-sm" />
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">First Comment (hidden hashtags)</label>
                <CharacterCounter current={manualPost.firstComment.length} max={getPlatformDef(manualPost.platform).firstCommentLimit} />
              </div>
              <Textarea rows={2} value={manualPost.firstComment}
                onChange={(e) => setManualPost({ ...manualPost, firstComment: e.target.value })}
                placeholder="#hashtag1 #hashtag2 ..."
                className="w-full mt-1 text-xs sm:text-sm" />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Media</label>
              <input type="file" ref={manualFileRef} onChange={handleManualFileChange} accept="image/*,video/*" className="hidden" />
              <Button variant="outline" className="w-full mt-1 text-xs font-semibold gap-2" onClick={() => manualFileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {manualMedia ? "Replace Media" : "Upload Image/Video"}
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
                  }} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <Button variant="outline" onClick={() => createManualPost("draft")} className="text-xs font-semibold">
                <Save className="h-3.5 w-3.5 mr-1" /> Save Drafts
              </Button>
              <Button variant="outline" onClick={() => {
                const t = new Date(); t.setDate(t.getDate() + 1);
                setManualPost({ ...manualPost, scheduledAt: t.toISOString().slice(0, 16) });
                setPublishModal({ type: "schedule" });
              }} className="text-xs font-semibold">
                <Calendar className="h-3.5 w-3.5 mr-1" /> Schedule
              </Button>
              <Button onClick={() => createManualPost("published")} className="text-xs font-bold bg-primary text-white">
                <Send className="h-3.5 w-3.5 mr-1" /> Publish All
              </Button>
            </div>
          </Card>

          {/* REAL PLATFORM PREVIEW FOR MANUAL POST */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col items-center justify-center">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-4 uppercase tracking-wider text-center w-full border-b pb-2 border-slate-100 dark:border-slate-800">
              Live Mockup Preview ({getPlatformDef(manualPost.platform).label})
            </h3>
            <div className="bg-slate-100/60 dark:bg-slate-950/60 rounded-xl p-4 w-full flex items-center justify-center min-h-[400px]">
              {(() => {
                const manualIntegration = integrationsList.find(i => i.platformKey === manualPost.platform);
                const mName = manualIntegration?.pageName || manualIntegration?.handle || defaultUserName;
                const mHandle = manualIntegration?.handle ? (manualIntegration.handle.startsWith("@") ? manualIntegration.handle : `@${manualIntegration.handle}`) : `@${defaultUserHandle}`;
                const mImage = defaultUserImage;

                if (manualPost.platform === "instagram") {
                  return <InstagramPreview currentFormatName={manualPost.format} displayImageUrl={manualMedia?.url || null} displayImageUrls={manualMedia?.url ? [manualMedia.url] : []} displayOverlayTexts={[]} activeSlideIdx={0} userName={mName} userImage={mImage} userHandle={mHandle} currentCaption={manualPost.caption} />;
                } else if (manualPost.platform === "linkedin") {
                  return <LinkedInPreview currentFormatName={manualPost.format} displayImageUrl={manualMedia?.url || null} userName={mName} userImage={mImage} currentCaption={manualPost.caption} />;
                } else if (manualPost.platform === "x") {
                  return <XPreview displayImageUrl={manualMedia?.url || null} userName={mName} userImage={mImage} userHandle={mHandle} currentCaption={manualPost.caption} />;
                } else if (manualPost.platform === "tiktok") {
                  return <TikTokPreview displayImageUrl={manualMedia?.url || null} userName={mName} userImage={mImage} userHandle={mHandle} currentCaption={manualPost.caption} />;
                } else if (manualPost.platform === "youtube") {
                  return <YoutubePreview displayImageUrl={manualMedia?.url || null} userName={mName} userImage={mImage} currentCaption={manualPost.caption} />;
                } else if (manualPost.platform === "facebook") {
                  return <FacebookPreview displayImageUrl={manualMedia?.url || null} userName={mName} userImage={mImage} currentCaption={manualPost.caption} isVertical={false} />;
                } else {
                  return <PinterestPreview currentFormatName={manualPost.format} isHtmlSlideFormat={false} isCurrentSlideLoading={false} currentHtmlSlide="" displayImageUrl={manualMedia?.url || null} campaignTopic="Manual Post" userName={mName} userImage={mImage} />;
                }
              })()}
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
      )}
      {/* ============================================================================ */}
      {/* AI GEN MODAL */}
      {/* ============================================================================ */}
      {activeMediaModal === "ai" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {isCarousel ? "AI Graphic Carousel Studio" : currentMediaType === "video" ? "AI Video Generator Studio" : "AI Image Generation Studio"}
                  </h3>
                  <p className="text-xs text-slate-500">Format: {currentFormatName} ({activePlatformTab.toUpperCase()})</p>
                </div>
              </div>
              <button onClick={() => setActiveMediaModal(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* MODAL CONTROLS BASED ON FORMAT */}
            {isCarousel ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Number of Carousel Slides
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 5, 7, 10].map(count => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setCarouselSlideCount(count)}
                        className={`py-2 rounded-xl text-xs font-extrabold border transition-all ${
                          carouselSlideCount === count
                            ? "bg-primary text-white border-primary shadow-xs"
                            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary/50"
                        }`}
                      >
                        {count} Slides
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Custom Carousel Instructions / Topic (Optional)
                  </label>
                  <Textarea
                    rows={3}
                    value={carouselCustomPrompt}
                    onChange={e => setCarouselCustomPrompt(e.target.value)}
                    placeholder="e.g. Create 5 slides showing step-by-step how SMB Robotics builds IoT automation systems..."
                    className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">If left blank, AI will automatically generate slides based on your campaign topic.</p>
                </div>
              </div>
            ) : currentMediaType === "video" ? (
              /* RICH SPECIALIZED AI VIDEO GENERATION STUDIO */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Select AI Video Engine
                  </label>
                  <select
                    value={selectedAiVideoModel}
                    onChange={e => setSelectedAiVideoModel(e.target.value)}
                    className="w-full h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 font-extrabold text-slate-900 dark:text-white"
                  >
                    <option value="template">🎨 Canva-Style Motion Template Studio</option>
                    <option value="heygen">🗣️ HeyGen AI Digital Avatar Presenter</option>
                    <option value="veo3">📹 Google Veo 3 AI Video (4K Cinematic)</option>
                    <option value="runway">🎬 Runway Gen-3 Alpha Cinematic</option>
                    <option value="luma">✨ Luma Dream Machine Photorealistic</option>
                  </select>
                </div>

                {/* ENGINE 1: HEYGEN DIGITAL AVATAR PRESENTING STUDIO */}
                {selectedAiVideoModel === "heygen" && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                      <span className="text-xs font-extrabold text-primary uppercase tracking-wider">HeyGen Digital Twin & Avatar Studio</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Presenter Avatar</label>
                        <select
                          value={heygenAvatar}
                          onChange={e => setHeygenAvatar(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="sarah">Sarah (Professional Tech Lead)</option>
                          <option value="alex">Alex (B2B Executive Host)</option>
                          <option value="elena">Elena (Creative Marketing Lead)</option>
                          <option value="david">David (Corporate Director)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">AI Voice & Accent</label>
                        <select
                          value={heygenVoice}
                          onChange={e => setHeygenVoice(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="en-US-female">US English - Professional Female</option>
                          <option value="en-US-male">US English - Energetic Male</option>
                          <option value="en-UK-executive">UK English - Executive Formal</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Studio Background</label>
                      <select
                        value={heygenBg}
                        onChange={e => setHeygenBg(e.target.value)}
                        className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                      >
                        <option value="office">Modern Office Tech Studio</option>
                        <option value="cyberpunk">Cyberpunk Neon Workspace</option>
                        <option value="gradient">Minimal Studio Gradient</option>
                        <option value="greenscreen">Green Screen Transparent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Avatar Spoken Script</label>
                      <Textarea
                        rows={3}
                        value={videoPromptText}
                        onChange={e => setVideoPromptText(e.target.value)}
                        placeholder="Type the exact text script for HeyGen avatar to speak in video..."
                        className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Est. Duration: {Math.max(5, Math.round((videoPromptText || "").split(" ").length / 2.5))} seconds</p>
                    </div>
                  </div>
                )}

                {/* ENGINE 2: CANVA-STYLE MOTION TEMPLATE STUDIO */}
                {selectedAiVideoModel === "template" && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                      <span className="text-xs font-extrabold text-indigo-500 uppercase tracking-wider">Canva Motion Template Editor</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Template Preset</label>
                        <select
                          value={templateCategory}
                          onChange={e => setTemplateCategory(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="product">Product Launch Showcase</option>
                          <option value="saas">SaaS Feature Spotlight</option>
                          <option value="announcement">Tech Announcement</option>
                          <option value="quote">Minimal Quote Reel</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Motion FX</label>
                        <select
                          value={templateAnimation}
                          onChange={e => setTemplateAnimation(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="zoom">Smooth Zoom & Slide</option>
                          <option value="bounce">Pop & Bounce Text</option>
                          <option value="lift">Fade & Lift Motion</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Headline Overlay Text</label>
                      <Input
                        value={templateHeadline}
                        onChange={e => setTemplateHeadline(e.target.value)}
                        placeholder="e.g. Next-Gen AI Marketing Platform"
                        className="h-8 text-xs bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Sub-Headline / Call to Action</label>
                      <Input
                        value={templateSubheadline}
                        onChange={e => setTemplateSubheadline(e.target.value)}
                        placeholder="e.g. Automate your social channels with SMB Robotics AI"
                        className="h-8 text-xs bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* ENGINE 3: CINEMATIC AI VIDEO GENERATORS (VEO3 / RUNWAY / LUMA) */}
                {(selectedAiVideoModel === "veo3" || selectedAiVideoModel === "runway" || selectedAiVideoModel === "luma") && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Camera Motion & Angles</label>
                      <select
                        value={cameraMotion}
                        onChange={e => setCameraMotion(e.target.value)}
                        className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                      >
                        <option value="pan">Pan Left to Right</option>
                        <option value="zoom">Dynamic Cinematic Zoom In</option>
                        <option value="orbit">Orbit 360 Degree View</option>
                        <option value="drone">Drone Flyover Shot</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Cinematic Video Prompt</label>
                      <Textarea
                        rows={3}
                        value={videoPromptText}
                        onChange={e => setVideoPromptText(e.target.value)}
                        placeholder="e.g. High-tech automated robotic warehouse with sleek lighting and smooth camera motion..."
                        className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* AI IMAGE CONTROLS */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Select AI Generator Engine</label>
                  <select
                    value={selectedAiImageModel}
                    onChange={e => setSelectedAiImageModel(e.target.value)}
                    className="w-full h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <option value="pollinations">Pollinations AI (Fast High-Res - Free)</option>
                    <option value="flux">Flux.1 / Imagen 3 Photorealistic</option>
                    <option value="midjourney">Midjourney v6 Artistic Style</option>
                    <option value="dalle">DALL-E 3 / ChatGPT Image Model</option>
                    <option value="banana">Banana SDXL Ultra Speed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Visual Prompt (Optional)</label>
                  <Textarea
                    rows={3}
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="e.g. Sleek modern marketing poster with vibrant purple lighting and futuristic digital interface..."
                    className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setActiveMediaModal(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={isRenderingMedia}
                onClick={async () => {
                  await handleRenderMedia();
                  setActiveMediaModal(null);
                }}
                className="bg-gradient-to-r from-primary to-indigo-600 text-white font-bold gap-1.5"
              >
                {isRenderingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{isCarousel ? "Generate Graphic Carousel" : currentMediaType === "video" ? "Generate AI Video" : "Generate AI Image"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* 1. UPLOAD PC MEDIA MODAL */}
      {/* ============================================================================ */}
      {activeMediaModal === "upload" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {isCarousel
                      ? "Upload Carousel Media Slides"
                      : currentMediaType === "video"
                      ? "Upload Reel / Video File"
                      : "Upload Image File"}
                  </h3>
                  <p className="text-xs text-slate-500">From your computer for {activePlatformTab.toUpperCase()} ({currentFormatName})</p>
                </div>
              </div>
              <button onClick={() => setActiveMediaModal(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3 bg-slate-50/50 dark:bg-slate-950/50 hover:border-emerald-500/50 transition-colors">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {isCarousel
                    ? "Select Image or Video Files for Carousel Slides"
                    : currentMediaType === "video"
                    ? "Select Video File (MP4, MOV, WEBM)"
                    : "Select Image File (JPG, PNG, WEBP)"}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Supports files up to 50MB</p>
              </div>
              <label className="inline-flex cursor-pointer">
                <input
                  type="file"
                  accept={currentMediaType === "video" ? "video/*" : "image/*,video/*"}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setCustomMediaDict(prev => ({
                        ...prev,
                        [currentMediaKey]: { url, type: file.type.startsWith("video") ? "video" : "image" }
                      }));
                      setActiveMediaModal(null);
                    }
                  }}
                />
                <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 pointer-events-none">
                  <Upload className="h-4 w-4" /> Choose File from Computer
                </Button>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setActiveMediaModal(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* 2. HD STOCK MEDIA MODAL WITH BUSINESS CATEGORIES */}
      {/* ============================================================================ */}
      <StockMediaModal
        isOpen={activeMediaModal === "stock"}
        allowedType={currentMediaType === "video" ? "video" : currentMediaType === "image" ? "image" : undefined}
        onClose={() => setActiveMediaModal(null)}
        onSelect={(item) => {
          setCustomMediaDict(prev => ({
            ...prev,
            [currentMediaKey]: { url: item.url, type: item.type }
          }));
          setActiveMediaModal(null);
        }}
      />

      {/* ============================================================================ */}
      {/* 1. UPLOAD PC MEDIA MODAL */}
      {/* ============================================================================ */}
      {activeMediaModal === "upload" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {isCarousel
                      ? "Upload Carousel Media Slides"
                      : currentMediaType === "video"
                      ? "Upload Reel / Video File"
                      : "Upload Image File"}
                  </h3>
                  <p className="text-xs text-slate-500">From your computer for {activePlatformTab.toUpperCase()} ({currentFormatName})</p>
                </div>
              </div>
              <button onClick={() => setActiveMediaModal(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3 bg-slate-50/50 dark:bg-slate-950/50 hover:border-emerald-500/50 transition-colors">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {isCarousel
                    ? "Select Image or Video Files for Carousel Slides"
                    : currentMediaType === "video"
                    ? "Select Video File (MP4, MOV, WEBM)"
                    : "Select Image File (JPG, PNG, WEBP)"}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Supports files up to 50MB</p>
              </div>
              <label className="inline-flex cursor-pointer">
                <input
                  type="file"
                  accept={currentMediaType === "video" ? "video/*" : "image/*,video/*"}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setCustomMediaDict(prev => ({
                        ...prev,
                        [currentMediaKey]: { url, type: file.type.startsWith("video") ? "video" : "image" }
                      }));
                      setActiveMediaModal(null);
                    }
                  }}
                />
                <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 pointer-events-none">
                  <Upload className="h-4 w-4" /> Choose File from Computer
                </Button>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setActiveMediaModal(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}


      {/* ============================================================================ */}
      {/* 3. AI MEDIA & CAROUSEL GENERATION MODAL */}
      {/* ============================================================================ */}
      {activeMediaModal === "ai" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {isCarousel ? "AI Graphic Carousel Studio" : currentMediaType === "video" ? "AI Video Generator Studio" : "AI Image Generation Studio"}
                  </h3>
                  <p className="text-xs text-slate-500">Format: {currentFormatName} ({activePlatformTab.toUpperCase()})</p>
                </div>
              </div>
              <button onClick={() => setActiveMediaModal(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* MODAL CONTROLS BASED ON FORMAT */}
            {isCarousel ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Number of Carousel Slides
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 5, 7, 10].map(count => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setCarouselSlideCount(count)}
                        className={`py-2 rounded-xl text-xs font-extrabold border transition-all ${
                          carouselSlideCount === count
                            ? "bg-primary text-white border-primary shadow-xs"
                            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary/50"
                        }`}
                      >
                        {count} Slides
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Custom Carousel Instructions / Topic (Optional)
                  </label>
                  <Textarea
                    rows={3}
                    value={carouselCustomPrompt}
                    onChange={e => setCarouselCustomPrompt(e.target.value)}
                    placeholder="e.g. Create 5 slides showing step-by-step how SMB Robotics builds IoT automation systems..."
                    className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">If left blank, AI will automatically generate slides based on your campaign topic.</p>
                </div>
              </div>
            ) : currentMediaType === "video" ? (
              /* RICH SPECIALIZED AI VIDEO GENERATION STUDIO */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Select AI Video Engine
                  </label>
                  <select
                    value={selectedAiVideoModel}
                    onChange={e => setSelectedAiVideoModel(e.target.value)}
                    className="w-full h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 font-extrabold text-slate-900 dark:text-white"
                  >
                    <option value="template">🎨 Canva-Style Motion Template Studio</option>
                    <option value="heygen">🗣️ HeyGen AI Digital Avatar Presenter</option>
                    <option value="veo3">📹 Google Veo 3 AI Video (4K Cinematic)</option>
                    <option value="runway">🎬 Runway Gen-3 Alpha Cinematic</option>
                    <option value="luma">✨ Luma Dream Machine Photorealistic</option>
                  </select>
                </div>

                {/* ENGINE 1: HEYGEN DIGITAL AVATAR PRESENTING STUDIO */}
                {selectedAiVideoModel === "heygen" && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                      <span className="text-xs font-extrabold text-primary uppercase tracking-wider">HeyGen Digital Twin & Avatar Studio</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Presenter Avatar</label>
                        <select
                          value={heygenAvatar}
                          onChange={e => setHeygenAvatar(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="sarah">Sarah (Professional Tech Lead)</option>
                          <option value="alex">Alex (B2B Executive Host)</option>
                          <option value="elena">Elena (Creative Marketing Lead)</option>
                          <option value="david">David (Corporate Director)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">AI Voice & Accent</label>
                        <select
                          value={heygenVoice}
                          onChange={e => setHeygenVoice(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="en-US-female">US English - Professional Female</option>
                          <option value="en-US-male">US English - Energetic Male</option>
                          <option value="en-UK-executive">UK English - Executive Formal</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Studio Background</label>
                      <select
                        value={heygenBg}
                        onChange={e => setHeygenBg(e.target.value)}
                        className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                      >
                        <option value="office">Modern Office Tech Studio</option>
                        <option value="cyberpunk">Cyberpunk Neon Workspace</option>
                        <option value="gradient">Minimal Studio Gradient</option>
                        <option value="greenscreen">Green Screen Transparent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Avatar Spoken Script</label>
                      <Textarea
                        rows={3}
                        value={videoPromptText}
                        onChange={e => setVideoPromptText(e.target.value)}
                        placeholder="Type the exact text script for HeyGen avatar to speak in video..."
                        className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Est. Duration: {Math.max(5, Math.round((videoPromptText || "").split(" ").length / 2.5))} seconds</p>
                    </div>
                  </div>
                )}

                {/* ENGINE 2: CANVA-STYLE MOTION TEMPLATE STUDIO */}
                {selectedAiVideoModel === "template" && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                      <span className="text-xs font-extrabold text-indigo-500 uppercase tracking-wider">Canva Motion Template Editor</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Template Preset</label>
                        <select
                          value={templateCategory}
                          onChange={e => setTemplateCategory(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="product">Product Launch Showcase</option>
                          <option value="saas">SaaS Feature Spotlight</option>
                          <option value="announcement">Tech Announcement</option>
                          <option value="quote">Minimal Quote Reel</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Motion FX</label>
                        <select
                          value={templateAnimation}
                          onChange={e => setTemplateAnimation(e.target.value)}
                          className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                        >
                          <option value="zoom">Smooth Zoom & Slide</option>
                          <option value="bounce">Pop & Bounce Text</option>
                          <option value="lift">Fade & Lift Motion</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Headline Overlay Text</label>
                      <Input
                        value={templateHeadline}
                        onChange={e => setTemplateHeadline(e.target.value)}
                        placeholder="e.g. Next-Gen AI Marketing Platform"
                        className="h-8 text-xs bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Sub-Headline / Call to Action</label>
                      <Input
                        value={templateSubheadline}
                        onChange={e => setTemplateSubheadline(e.target.value)}
                        placeholder="e.g. Automate your social channels with SMB Robotics AI"
                        className="h-8 text-xs bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* ENGINE 3: CINEMATIC AI VIDEO GENERATORS (VEO3 / RUNWAY / LUMA) */}
                {(selectedAiVideoModel === "veo3" || selectedAiVideoModel === "runway" || selectedAiVideoModel === "luma") && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Camera Motion & Angles</label>
                      <select
                        value={cameraMotion}
                        onChange={e => setCameraMotion(e.target.value)}
                        className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-semibold"
                      >
                        <option value="pan">Pan Left to Right</option>
                        <option value="zoom">Dynamic Cinematic Zoom In</option>
                        <option value="orbit">Orbit 360 Degree View</option>
                        <option value="drone">Drone Flyover Shot</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Cinematic Video Prompt</label>
                      <Textarea
                        rows={3}
                        value={videoPromptText}
                        onChange={e => setVideoPromptText(e.target.value)}
                        placeholder="e.g. High-tech automated robotic warehouse with sleek lighting and smooth camera motion..."
                        className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* AI IMAGE CONTROLS */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Select AI Generator Engine</label>
                  <select
                    value={selectedAiImageModel}
                    onChange={e => setSelectedAiImageModel(e.target.value)}
                    className="w-full h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <option value="pollinations">Pollinations AI (Fast High-Res - Free)</option>
                    <option value="flux">Flux.1 / Imagen 3 Photorealistic</option>
                    <option value="midjourney">Midjourney v6 Artistic Style</option>
                    <option value="dalle">DALL-E 3 / ChatGPT Image Model</option>
                    <option value="banana">Banana SDXL Ultra Speed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Visual Prompt (Optional)</label>
                  <Textarea
                    rows={3}
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="e.g. Sleek modern marketing poster with vibrant purple lighting and futuristic digital interface..."
                    className="text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setActiveMediaModal(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={isRenderingMedia}
                onClick={async () => {
                  await handleRenderMedia();
                  setActiveMediaModal(null);
                }}
                className="bg-gradient-to-r from-primary to-indigo-600 text-white font-bold gap-1.5"
              >
                {isRenderingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{isCarousel ? "Generate Graphic Carousel" : currentMediaType === "video" ? "Generate AI Video" : "Generate AI Image"}</span>
              </Button>
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

      {/* ============================================================================ */}
      {/* 4. FULL-FEATURED AI MEDIA STUDIO MODAL */}
      {/* ============================================================================ */}
      <VideoStudioModal
        isOpen={activeMediaModal === "ai"}
        onClose={() => setActiveMediaModal(null)}
        onSelectMedia={(urls) => {
          setCustomMediaDict(prev => {
            const next = { ...prev };
            urls.forEach((url, idx) => {
              const key = `${activePlatformTab}-${currentFormatName}-${idx}`;
              const isVideo = currentFormatName.toLowerCase().includes('video') || 
                              currentFormatName.toLowerCase().includes('reel') || 
                              url.toLowerCase().endsWith('.mp4');
              next[key] = { url, type: isVideo ? "video" : "image" };
            });
            return next;
          });
        }}
        platform={activePlatformTab}
        formatName={currentFormatName}
        defaultTopic={campaignTopic || "Cinematic digital marketing content"}
      />

      {/* ============================================================================ */}
      {/* 5. AUTONOMOUS MULTI-AGENT STREAMING MODAL */}
      {/* ============================================================================ */}
      <MultiAgentStreamModal
        isOpen={isMultiAgentModalOpen}
        onClose={() => setIsMultiAgentModalOpen(false)}
        platforms={selectedPlatforms}
        contentTypes={selectedContentTypes}
        onCompletePayload={handleMultiAgentPayload}
      />
    </div>
  );
}
