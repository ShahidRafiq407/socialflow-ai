"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { create } from "zustand";
import { saveDraft as apiSaveDraft, schedulePost as apiSchedulePost, publishNow as apiPublishNow } from "@/actions/publish";
import PlatformPreviewWrapper from "@/components/previews/PlatformPreviewWrapper";
import VideoStudioModal from "@/components/video-studio/VideoStudioModal";
import StockMediaModal from "@/components/stock-media/StockMediaModal";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";
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
import { getBestTimeSpec, getNextBestTime, getNextBestTimeFromSpec } from "@/lib/bestPublishTime";
import { analyzeBestTimes } from "@/actions/bestTime";
import { normalizeHashtags, formatHashtagInputTokens } from "@/lib/hashtags";

// ============================================================================
// ZUSTAND GLOBAL STORE — shared between AI Studio, Auto-Pilot, Calendar
// ============================================================================
export type PostStatus = "draft" | "in_review" | "approved" | "scheduled" | "published" | "archived" | "failed";
export type PostSource = "ai_campaign" | "manual" | "autopilot";
export type PostMediaType = "image" | "video" | "carousel" | "none";

export const isVideoUrl = (url: string | null) => {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.endsWith('.mp4') ||
    lowerUrl.endsWith('.webm') ||
    lowerUrl.includes('.mp4?') ||
    lowerUrl.includes('pixabay.com/video/') ||
    lowerUrl.startsWith('data:video/')
  );
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

import PlatformEditorRouter from "@/components/editors/PlatformEditorRouter";
import AITrendSuggestions, { TrendSuggestionItem } from "@/components/editors/AITrendSuggestions";
import { CarouselSlideItem } from "@/components/editors/InstagramCarouselEditor";
import { MultiMediaItem } from "@/components/editors/MultiMediaEditor";
import { getPlatformCapability, PlatformCapability } from "@/lib/capabilities/platformCapabilities";

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
  { id: "instagram", label: "Instagram", icon: Camera, contentTypes: ["Feed", "Carousel", "Reel", "Story"], captionLimit: 2200, firstCommentLimit: 1000, hashtagLimit: 30, color: "from-pink-500 to-purple-600" },
  { id: "pinterest", label: "Pinterest", icon: Bookmark, contentTypes: ["Pin", "Video Pin", "Idea Pin", "Carousel"], captionLimit: 500, firstCommentLimit: 0, hashtagLimit: 20, color: "from-red-500 to-red-600" },
  { id: "linkedin", label: "LinkedIn", icon: Briefcase, contentTypes: ["Post", "Multi-Image", "Document", "Video"], captionLimit: 3000, firstCommentLimit: 1250, hashtagLimit: 10, color: "from-blue-600 to-blue-800" },
  { id: "facebook", label: "Facebook", icon: Globe, contentTypes: ["Feed", "Multiple Photos", "Reel", "Story"], captionLimit: 63206, firstCommentLimit: 8000, hashtagLimit: 30, color: "from-blue-500 to-blue-700" },
  { id: "tiktok", label: "TikTok", icon: Video, contentTypes: ["Video", "Photo"], captionLimit: 2200, firstCommentLimit: 0, hashtagLimit: 10, color: "from-slate-900 to-pink-600" },
  { id: "youtube", label: "YouTube", icon: PlayCircle, contentTypes: ["Shorts", "Video"], captionLimit: 5000, firstCommentLimit: 5000, hashtagLimit: 15, color: "from-red-500 to-red-700" },
  { id: "x", label: "X", icon: MessageSquare, contentTypes: ["Post", "Thread"], captionLimit: 280, firstCommentLimit: 280, hashtagLimit: 5, color: "from-slate-800 to-black" },
];

const getPlatformDef = (id: string) => PLATFORMS.find((p) => p.id === id)!;

// AI-generated content per format
interface GeneratedFormat {
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

// Derives per-slide Title & Key Insight overlays for multi-image formats (Idea Pin,
// Carousel, Document) when the AI payload didn't include slideTexts — so the
// storyboard fields are never left empty after campaign generation.
function deriveSlideOverlayFallback(content: any, slideCount: number) {
  const caption = (content.caption || "").replace(/\s+/g, " ").trim();
  const hook = (content.hook || content.title || "").toString().trim();
  const sentences = caption
    .split(/(?<=[.!?])\s+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 3);

  const overlays: { step: number; title: string; body: string; theme: string }[] = [];
  for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0;
    const isLast = i === slideCount - 1;
    const sentence = sentences[Math.min(i, sentences.length - 1)] || "";
    overlays.push({
      step: i + 1,
      title: isFirst && hook
        ? hook.slice(0, 60)
        : isLast
          ? "Save This & Follow"
          : `Key Insight ${i}`,
      body: sentence || (isLast ? "Follow for more actionable growth strategies." : caption.slice(0, 120)),
      theme: i % 2 === 0 ? "gradient-purple" : "gradient-blue",
    });
  }
  return overlays;
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
// ASPECT RATIO & FORMAT HELPERS
// ============================================================================

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

const getFormatFamily = (platform: string, format: string): "vertical_video" | "story" | "carousel" | "single_image" => {
  const norm = (format || "").toLowerCase().trim();
  if (norm.includes("reel") || norm.includes("short") || norm === "video" || norm === "short video") {
    return "vertical_video";
  }
  if (norm.includes("story")) {
    return "story";
  }
  if (norm.includes("carousel") || norm.includes("idea_pin") || norm.includes("document")) {
    return "carousel";
  }
  return "single_image";
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
  const defaultUserName = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : (user?.fullName || "Your Brand");
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
  const [selectedAiImageModel, setSelectedAiImageModel] = useState<string>("gemini-3-pro-image");
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
    linkedin: ["Post", "Document"],
    x: ["Post"],
    youtube: ["Shorts"],
    tiktok: ["Video"],
    pinterest: ["Pin", "Idea Pin"],
  });

  useEffect(() => {
    if (connectedPlatforms.length > 0 && selectedPlatforms.length === 0) {
      const valid = connectedPlatforms.filter(p => PLATFORMS.some(pl => pl.id === p));
      setSelectedPlatforms(valid);
      setSelectedContentTypes((prev) => {
        const next = { ...prev };
        valid.forEach((pId) => {
          if (!next[pId] || next[pId].length === 0) {
            const pDef = getPlatformDef(pId);
            if (pDef) next[pId] = pDef.contentTypes.slice(0, 2);
          }
        });
        return next;
      });
    }
  }, [connectedPlatforms]);

  const togglePlatform = (platformId: string) => {
    if (!connectedPlatforms.includes(platformId)) return;
    setSelectedPlatforms((prev) => {
      if (prev.includes(platformId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== platformId);
      }
      // Ensure platform has default content types selected
      const pDef = getPlatformDef(platformId);
      if (pDef) {
        setSelectedContentTypes((ct) => {
          if (!ct[platformId] || ct[platformId].length === 0) {
            return { ...ct, [platformId]: pDef.contentTypes.slice(0, 2) };
          }
          return ct;
        });
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
      const pDef = getPlatformDef(platformId);
      const currentList = prev[platformId] || pDef?.contentTypes.slice(0, 2) || ["Feed"];
      if (currentList.includes(type)) {
        if (currentList.length === 1) return prev; // Keep at least 1 format active
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

    setGeneratedContents((prev) => {
      const updated = { ...prev };
      for (const [plt, formats] of Object.entries(
        campaignPayload.platforms as Record<string, Record<string, any>>
      )) {
        const normalizedPlt = plt.toLowerCase();
        updated[normalizedPlt] = updated[normalizedPlt] || {};

        const pltDef = PLATFORMS.find((p) => p.id.toLowerCase() === normalizedPlt);
        const validFmts = pltDef?.contentTypes || [];

        for (const [fmt, rawContent] of Object.entries(formats)) {
          const content = rawContent || {};
          const caption = content.caption || "";
          // Full hashtag sanitization — bare sentences / spaced tags become valid #PascalCase
          const hashtags = normalizeHashtags(content.hashtags);
          const visualPrompts =
            Array.isArray(content.visualPrompts) && content.visualPrompts.length > 0
              ? content.visualPrompts
              : content.imagePrompt || content.visualPrompt
              ? [content.imagePrompt || content.visualPrompt]
              : [];

          const imageUrl = content.imageUrl || null;
          const videoUrl = content.videoUrl || null;
          const slideUrls = Array.isArray(content.slideUrls)
            ? content.slideUrls
            : imageUrl
            ? [imageUrl]
            : [];

          const formatData: GeneratedFormat = {
            title: content.title || "",
            caption,
            imagePrompt: content.imagePrompt || content.visualPrompt || "",
            hashtags,
            visualPrompts,
            bestTime: content.bestTime || "Best engagement window",
            overlayText:
              Array.isArray(content.overlayText) && content.overlayText.length > 0
                ? content.overlayText
                : deriveSlideOverlayFallback(
                    content,
                    Math.max(visualPrompts.length, slideUrls.length, 3)
                  ),
            imageUrl,
            videoUrl,
            imageUrls: slideUrls,
          };

          // Store under raw format key
          updated[normalizedPlt][fmt] = formatData;
          // Store under lowercase format key
          updated[normalizedPlt][fmt.toLowerCase()] = formatData;

          // Also match TitleCase from platform content types (e.g. "reel" -> "Reel", "feed" -> "Feed")
          const matchedTitleCase = validFmts.find(
            (vf) => vf.toLowerCase() === fmt.toLowerCase()
          );
          if (matchedTitleCase) {
            updated[normalizedPlt][matchedTitleCase] = formatData;
          }
        }
      }
      return updated;
    });

    const firstPlatform = selectedPlatforms[0] || Object.keys(campaignPayload.platforms)[0];
    if (firstPlatform) {
      const normFirst = firstPlatform.toLowerCase();
      setActivePlatformTab(normFirst);
      const pltDef = PLATFORMS.find((p) => p.id.toLowerCase() === normFirst);
      const availableFmts = Object.keys(
        campaignPayload.platforms[firstPlatform] ||
          campaignPayload.platforms[normFirst] ||
          {}
      );
      if (availableFmts.length > 0) {
        const rawFmt = availableFmts[0];
        const matchedTitleCase =
          (pltDef?.contentTypes || []).find(
            (vf) => vf.toLowerCase() === rawFmt.toLowerCase()
          ) || rawFmt;
        setActiveFormatTab((prev) => ({ ...prev, [normFirst]: matchedTitleCase }));
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
                    hashtags: normalizeHashtags(content.hashtags),
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

  // ── CONTENT LIBRARY ROUND-TRIP ──
  // A post opened via "Open in Studio" (Content board) hydrates back into the
  // editor so the user can edit & re-post it anytime.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("socialflow:openInStudio");
    if (!raw) return;
    sessionStorage.removeItem("socialflow:openInStudio");
    try {
      const post = JSON.parse(raw);
      const basePlatform = (post.platform || "").split(/[\s_-]+/)[0].toLowerCase();
      if (!basePlatform) return;
      const pltDef = PLATFORMS.find((p) => p.id.toLowerCase() === basePlatform);
      const fmtRaw = (post.format || "").toLowerCase();
      const fmt =
        (pltDef?.contentTypes || []).find((f) => f.toLowerCase() === fmtRaw) ||
        pltDef?.contentTypes?.[0] ||
        "Feed";

      const mediaHistory = post.mediaHistory || {};
      const mediaUrls: string[] = Array.isArray(mediaHistory.mediaUrls)
        ? mediaHistory.mediaUrls.filter(Boolean)
        : post.imageUrl
          ? [post.imageUrl]
          : [];
      const overlayText =
        Array.isArray(mediaHistory.overlayTexts) && mediaHistory.overlayTexts.length > 0
          ? mediaHistory.overlayTexts
          : deriveSlideOverlayFallback(post, Math.max(mediaUrls.length, 3));
      const visualPrompts: string[] =
        Array.isArray(mediaHistory.visualPrompts) && mediaHistory.visualPrompts.length > 0
          ? mediaHistory.visualPrompts
          : post.imagePrompt
            ? [post.imagePrompt]
            : [];

      setGeneratedContents((prev) => ({
        ...prev,
        [basePlatform]: {
          ...(prev[basePlatform] || {}),
          [fmt]: {
            caption: post.content || "",
            hashtags: normalizeHashtags(post.hashtags),
            visualPrompts,
            overlayText,
            imageUrls: mediaUrls,
            imageUrl: mediaUrls[0] || null,
            bestTime: "",
          },
        },
      }));
      setActivePlatformTab(basePlatform);
      setActiveFormatTab((prev) => ({ ...prev, [basePlatform]: fmt }));
      if (post.campaignTopic) setCampaignTopic(post.campaignTopic);
      setPublishResult({
        success: true,
        message: "Draft loaded from Content Library — edit & post it whenever you're ready",
      });
      setTimeout(() => setPublishResult(null), 4000);
    } catch (e) {
      console.error("Failed to load post from Content Library:", e);
    }
  }, []);

  const platformDef = getPlatformDef(activePlatformTab);
  const validSelectedFormats = (selectedContentTypes[activePlatformTab] && selectedContentTypes[activePlatformTab].length > 0)
    ? selectedContentTypes[activePlatformTab]
    : (platformDef?.contentTypes || []);

  let currentFormatName = activeFormatTab[activePlatformTab];
  if (!currentFormatName || !validSelectedFormats.includes(currentFormatName)) {
    currentFormatName = validSelectedFormats[0] || platformDef?.contentTypes[0] || "Feed";
  }

  const currentGenerated =
    generatedContents[activePlatformTab]?.[currentFormatName] ||
    generatedContents[activePlatformTab]?.[currentFormatName.toLowerCase()] ||
    Object.values(generatedContents[activePlatformTab] || {})[0];
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
  const isHtmlSlideFormat = false;
  const displayPrompts = isMultiFormat ? currentVisualPrompts : currentVisualPrompts.slice(0, 1);
  const displayOverlayTexts = isMultiFormat ? currentOverlayTexts : currentOverlayTexts.slice(0, 1);
  const singleImagePrompt = currentGenerated?.imagePrompt || currentVisualPrompts[0] || "";
  const aiGeneratedImageUrls = currentGenerated?.imageUrls && currentGenerated.imageUrls.length > 0 ? currentGenerated.imageUrls : null;

  const totalCarouselSlides = isMultiFormat
    ? Math.max(displayPrompts.length, displayOverlayTexts.length, aiGeneratedImageUrls?.length || 0, 3)
    : 1;

  const currentMediaType = getMediaType(currentFormatName);

  const handleFormatChange = (formatVal: string) => {
    setActiveFormatTab((prev) => ({ ...prev, [activePlatformTab]: formatVal }));
    setActiveSlideIdx(0);
  };

  // ============================================================================
  // PLATFORM-NATIVE FIELD DICTIONARIES
  // ============================================================================
  const currentFormatKey = `${activePlatformTab}-${currentFormatName}`;
  const [titleDict, setTitleDict] = useState<Record<string, string>>({});
  const [descriptionDict, setDescriptionDict] = useState<Record<string, string>>({});
  const [destinationUrlDict, setDestinationUrlDict] = useState<Record<string, string>>({});
  const [boardDict, setBoardDict] = useState<Record<string, string>>({});
  const [taggedTopicsDict, setTaggedTopicsDict] = useState<Record<string, string[]>>({});
  const [altTextDict, setAltTextDict] = useState<Record<string, string>>({});
  const [mediaItemsDict, setMediaItemsDict] = useState<Record<string, MultiMediaItem[]>>({});
  const [activeMediaIndexDict, setActiveMediaIndexDict] = useState<Record<string, number>>({});
  // Platform-native publishing settings — ONLY settings the real publishers apply.
  // Keyed per formatKey so switching platform/format never leaks stale settings.
  const [publishSettingsDict, setPublishSettingsDict] = useState<Record<string, Record<string, any>>>({});
  const [isApplyingTrend, setIsApplyingTrend] = useState(false);

  // Format-Scoped Parallel Generation States
  const [generatingCopyKeys, setGeneratingCopyKeys] = useState<Record<string, boolean>>({});
  const [enhancingPromptKeys, setEnhancingPromptKeys] = useState<Record<string, boolean>>({});
  const [scriptPromptKeys, setScriptPromptKeys] = useState<Record<string, boolean>>({});

  const currentTitle = titleDict[currentFormatKey] || currentGenerated?.title || "";
  const currentDescription = descriptionDict[currentFormatKey] || "";
  const currentDestinationUrl = destinationUrlDict[currentFormatKey] || "";
  const currentBoard = boardDict[currentFormatKey] || "Smart Robotics & AI";
  const currentTaggedTopics = taggedTopicsDict[currentFormatKey] || [];
  const currentAltText = altTextDict[currentFormatKey] || "";
  // NOTE: currentMediaItems (with per-asset media resolution) is derived further below,
  // after the per-index media dictionaries (customMediaDict / renderedImageUrlsDict /
  // clearedMediaKeys) are declared.
  const currentActiveMediaIdx = activeMediaIndexDict[currentFormatKey] || 0;
  const currentPublishSettings = publishSettingsDict[currentFormatKey] || {};
  const updatePublishSetting = (key: string, value: any) => {
    setPublishSettingsDict(prev => ({
      ...prev,
      [currentFormatKey]: { ...(prev[currentFormatKey] || {}), [key]: value },
    }));
  };

  // ============================================================================
  // REAL MULTI-AGENT PLATFORM COPY GENERATOR (PARALLEL & TAB-ISOLATED)
  // ============================================================================
  const handleGeneratePlatformCopyAI = async () => {
    const targetPlatform = activePlatformTab;
    const targetFormat = currentFormatName;
    const targetKey = `${targetPlatform}-${targetFormat}`;
    const targetPrompt = customPromptDict[targetKey] || "";
    const targetTopic = campaignTopic || targetPrompt || currentTitle || currentCaption || "Exciting new innovations and strategic insights";

    setGeneratingCopyKeys(prev => ({ ...prev, [targetKey]: true }));
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-platform-copy",
          platform: targetPlatform,
          format: targetFormat,
          topic: targetTopic,
          customPrompt: targetPrompt,
          duration: videoDurationSec,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const item = data.data;
        const currentFamily = getFormatFamily(targetPlatform, targetFormat);
        const generatedPrompt = item.videoPrompt || item.prompt || item.mediaGenerationPrompt || item.imagePrompt || "";
        const platformsToUpdate = Array.from(new Set([targetPlatform, ...selectedPlatforms]));

        setGeneratedContents(prev => {
          const updated = { ...prev };
          platformsToUpdate.forEach(pId => {
            const availableFormats = selectedContentTypes[pId] && selectedContentTypes[pId].length > 0
              ? selectedContentTypes[pId]
              : (getPlatformDef(pId)?.contentTypes || [currentFormatName]);

            availableFormats.forEach(otherFmt => {
              if (getFormatFamily(pId, otherFmt) === currentFamily) {
                const currentPlat = updated[pId] || {};
                const currentFmt = currentPlat[otherFmt] || {};
                updated[pId] = {
                  ...currentPlat,
                  [otherFmt]: {
                    ...currentFmt,
                    caption: item.caption || currentFmt.caption,
                    hashtags: item.hashtags ? normalizeHashtags(item.hashtags) : currentFmt.hashtags,
                    imagePrompt: generatedPrompt || currentFmt.imagePrompt,
                    visualPrompts: item.slides && Array.isArray(item.slides)
                      ? item.slides.map((s: any) => s.visualPrompt || "")
                      : (item.visualPrompts || currentFmt.visualPrompts),
                    overlayText: item.slides && Array.isArray(item.slides)
                      ? item.slides.map((s: any, idx: number) => ({
                          step: s.step || idx + 1,
                          title: s.title || `Slide ${idx + 1}`,
                          body: s.body || "",
                          theme: s.theme || (idx === 0 ? "hook" : idx === item.slides.length - 1 ? "cta" : "content"),
                          type: s.type || (idx === 0 ? "hook" : idx === item.slides.length - 1 ? "cta" : "content"),
                        }))
                      : currentFmt.overlayText,
                  }
                };
              }
            });
          });
          return updated;
        });

        // Sync auxiliary dictionaries (title, description, taggedTopics, altText, customPrompt) for matching family
        platformsToUpdate.forEach(pId => {
          const availableFormats = selectedContentTypes[pId] && selectedContentTypes[pId].length > 0
            ? selectedContentTypes[pId]
            : (getPlatformDef(pId)?.contentTypes || [currentFormatName]);

          availableFormats.forEach(otherFmt => {
            if (getFormatFamily(pId, otherFmt) === currentFamily) {
              const otherKey = `${pId}-${otherFmt}`;
              if (item.title) setTitleDict(prev => ({ ...prev, [otherKey]: item.title }));
              if (item.description) setDescriptionDict(prev => ({ ...prev, [otherKey]: item.description }));
              if (item.taggedTopics) setTaggedTopicsDict(prev => ({ ...prev, [otherKey]: item.taggedTopics }));
              if (item.altText) setAltTextDict(prev => ({ ...prev, [otherKey]: item.altText }));
              if (generatedPrompt) setCustomPromptDict(prev => ({ ...prev, [otherKey]: generatedPrompt }));
            }
          });
        });
      }
    } catch (e) {
      console.error("Platform copy AI generation error:", e);
    } finally {
      setGeneratingCopyKeys(prev => {
        const next = { ...prev };
        delete next[targetKey];
        return next;
      });
    }
  };

  const handleRegenerateSlideAI = async (slideIdx: number, customSlidePrompt?: string) => {
    const targetPlatform = activePlatformTab;
    const targetFormat = currentFormatName;
    const targetFormatKey = `${targetPlatform}-${targetFormat}`;

    setRenderingMediaKeys(prev => ({ ...prev, [targetFormatKey]: true }));
    try {
      if (targetPlatform === "linkedin" && (targetFormat === "Document" || targetFormat === "Carousel")) {
        const currentSlides = displayOverlayTexts;
        const activeSlideObj = currentSlides[slideIdx] || {};
        const res = await fetch("/api/ai-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "regenerate-slide",
            platform: targetPlatform,
            format: targetFormat,
            slideIndex: slideIdx,
            slideType: (activeSlideObj as any)?.type || (slideIdx === 0 ? "hook" : "content"),
            prompt: customSlidePrompt || "",
            topic: campaignTopic || currentTitle || currentCaption,
            currentSlide: activeSlideObj,
            commentary: currentCaption,
          }),
        });
        const data = await res.json();
        if (data.success && data.slide) {
          setGeneratedContents(prev => {
            const currentPlat = prev[targetPlatform] || {};
            const currentFmt = currentPlat[targetFormat] || {};
            const existingOverlay = [...(currentFmt.overlayText || [])];

            while (existingOverlay.length <= slideIdx) {
              existingOverlay.push({ step: existingOverlay.length + 1, title: "", body: "", theme: "content" });
            }

            existingOverlay[slideIdx] = {
              ...existingOverlay[slideIdx],
              step: slideIdx + 1,
              title: data.slide.title || existingOverlay[slideIdx]?.title || `Slide ${slideIdx + 1}`,
              body: Array.isArray(data.slide.points) ? data.slide.points.join("\n") : (data.slide.body || ""),
            };

            return {
              ...prev,
              [targetPlatform]: {
                ...currentPlat,
                [targetFormat]: {
                  ...currentFmt,
                  overlayText: existingOverlay,
                },
              },
            };
          });
        }
      } else {
        setActiveSlideIdx(slideIdx);
        await handleRenderMedia();
      }
    } catch (err) {
      console.error("Slide regeneration error:", err);
    } finally {
      setRenderingMediaKeys(prev => {
        const next = { ...prev };
        delete next[targetFormatKey];
        return next;
      });
    }
  };

  const handleEnhancePromptAI = async () => {
    const targetPlatform = activePlatformTab;
    const targetFormat = currentFormatName;
    const targetKey = `${targetPlatform}-${targetFormat}`;
    const targetPrompt = customPromptDict[targetKey] !== undefined && customPromptDict[targetKey] !== ""
      ? customPromptDict[targetKey]
      : (displayPrompts[activeSlideIdx] || singleImagePrompt || "");

    setEnhancingPromptKeys(prev => ({ ...prev, [targetKey]: true }));
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "enhance-prompt",
          prompt: targetPrompt,
          platform: targetPlatform,
          format: targetFormat,
          topic: campaignTopic,
        }),
      });
      const data = await res.json();
      if (data.success && data.enhancedPrompt) {
        // Keep the user's FIRST original prompt recoverable — enhancement never
        // permanently overwrites their own words.
        setOriginalPromptDict(prev => ({
          ...prev,
          [targetKey]: prev[targetKey] !== undefined ? prev[targetKey] : targetPrompt,
        }));
        setCustomPromptDict(prev => ({ ...prev, [targetKey]: data.enhancedPrompt }));
      }
    } catch (e) {
      console.error("Enhance prompt error:", e);
    } finally {
      setEnhancingPromptKeys(prev => {
        const next = { ...prev };
        delete next[targetKey];
        return next;
      });
    }
  };

  // ============================================================================
  // FIELD-LEVEL AI GENERATION (Title / Description / Hashtags / Alt Text only —
  // the backend generates exactly ONE field per call, never a generic blob)
  // ============================================================================
  const [generatingFieldKeys, setGeneratingFieldKeys] = useState<Record<string, boolean>>({});

  const handleGenerateFieldAI = async (field: "title" | "description" | "hashtags" | "altText") => {
    const targetKey = `${activePlatformTab}-${currentFormatName}`;
    const fieldKey = `${targetKey}:${field}`;
    const context = field === "hashtags" || field === "altText" ? currentCaption || "" : "";

    setGeneratingFieldKeys(prev => ({ ...prev, [fieldKey]: true }));
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-field",
          platform: activePlatformTab,
          format: currentFormatName,
          field,
          topic: campaignTopic,
          context,
        }),
      });
      const data = await res.json();
      if (data.success && data.value !== undefined) {
        if (field === "title") {
          setTitleDict(prev => ({ ...prev, [targetKey]: data.value }));
        } else if (field === "description") {
          setDescriptionDict(prev => ({ ...prev, [targetKey]: data.value }));
        } else if (field === "altText") {
          setAltTextDict(prev => ({ ...prev, [targetKey]: data.value }));
        } else if (field === "hashtags") {
          setGeneratedContents(prev => ({
            ...prev,
            [activePlatformTab]: {
              ...prev[activePlatformTab],
              [currentFormatName]: {
                ...(prev[activePlatformTab]?.[currentFormatName] || {}),
                hashtags: normalizeHashtags(data.value),
              },
            },
          }));
        }
      }
    } catch (e) {
      console.error(`Field generation (${field}) error:`, e);
    } finally {
      setGeneratingFieldKeys(prev => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  };

  const currentGeneratingField = (() => {
    const active = Object.keys(generatingFieldKeys).find(k => k.startsWith(`${currentFormatKey}:`));
    return active ? active.split(":").slice(1).join(":") : null;
  })();

  const handleCaptionToPrompt = async () => {
    const targetPlatform = activePlatformTab;
    const targetFormat = currentFormatName;
    const targetKey = `${targetPlatform}-${targetFormat}`;
    const targetCaption = generatedContents[targetPlatform]?.[targetFormat]?.caption || currentCaption;

    if (!targetCaption || !targetCaption.trim()) {
      return;
    }

    setScriptPromptKeys(prev => ({ ...prev, [targetKey]: true }));
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "auto-prompt-from-script",
          caption: targetCaption,
          platform: targetPlatform,
          format: targetFormat,
          topic: campaignTopic,
          duration: videoDurationSec,
        }),
      });
      const data = await res.json();
      if (data.success && data.prompt) {
        setCustomPromptDict(prev => ({ ...prev, [targetKey]: data.prompt }));
      }
    } catch (err) {
      console.error("Auto prompt from script failed:", err);
    } finally {
      setScriptPromptKeys(prev => {
        const next = { ...prev };
        delete next[targetKey];
        return next;
      });
    }
  };

  const handleApplyTrend = async (trend: TrendSuggestionItem) => {
    setCampaignTopic(trend.topic);
    setIsApplyingTrend(true);
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-platform-copy",
          platform: activePlatformTab,
          format: currentFormatName,
          topic: `${trend.topic} (Hook: ${trend.suggestedHook})`,
          duration: videoDurationSec,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const item = data.data;
        if (item.caption) updateCaption(item.caption);
        if (item.title) {
          setTitleDict(prev => ({ ...prev, [currentFormatKey]: item.title }));
        }
        if (item.description) {
          setDescriptionDict(prev => ({ ...prev, [currentFormatKey]: item.description }));
        }
        if (item.taggedTopics) {
          setTaggedTopicsDict(prev => ({ ...prev, [currentFormatKey]: item.taggedTopics }));
        }
        if (item.altText) {
          setAltTextDict(prev => ({ ...prev, [currentFormatKey]: item.altText }));
        }
        const generatedPrompt = item.videoPrompt || item.prompt || item.mediaGenerationPrompt || item.imagePrompt || "";
        if (generatedPrompt) {
          setCustomPrompt(generatedPrompt);
        }
        setGeneratedContents(prev => {
          const currentFmt = prev[activePlatformTab]?.[currentFormatName] || {};
          return {
            ...prev,
            [activePlatformTab]: {
              ...prev[activePlatformTab],
              [currentFormatName]: {
                ...currentFmt,
                hashtags: item.hashtags ? normalizeHashtags(item.hashtags) : currentFmt.hashtags,
                caption: item.caption || currentCaption || currentFmt.caption,
                imagePrompt: generatedPrompt || currentFmt.imagePrompt,
                visualPrompts: item.slides && Array.isArray(item.slides)
                  ? item.slides.map((s: any) => s.visualPrompt || "")
                  : (item.visualPrompts || currentFmt.visualPrompts),
                overlayText: item.slides && Array.isArray(item.slides)
                  ? item.slides.map((s: any, idx: number) => ({
                      step: s.step || idx + 1,
                      title: s.title || `Slide ${idx + 1}`,
                      body: s.body || "",
                      theme: "gradient-purple",
                    }))
                  : currentFmt.overlayText,
              }
            }
          };
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsApplyingTrend(false);
    }
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
  // MEDIA UPLOAD & MULTI-SLIDE RESOLUTION (with memory leak fix)
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

  const [clearedMediaKeys, setClearedMediaKeys] = useState<Record<string, boolean>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setClearedMediaKeys(prev => ({ ...prev, [currentMediaKey]: false }));
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

  const [renderingMediaKeys, setRenderingMediaKeys] = useState<Record<string, boolean>>({});
  const [renderingAllSlidesKeys, setRenderingAllSlidesKeys] = useState<Record<string, boolean>>({});
  const [renderedImageUrlsDict, setRenderedImageUrlsDict] = useState<Record<string, string>>({});
  const [customPromptDict, setCustomPromptDict] = useState<Record<string, string>>({});
  // Original (pre-enhancement) prompts so "Enhance Prompt" never destroys user wording
  const [originalPromptDict, setOriginalPromptDict] = useState<Record<string, string>>({});
  const customPrompt = customPromptDict[currentFormatKey] !== undefined
    ? customPromptDict[currentFormatKey]
    : (displayPrompts[activeSlideIdx] || singleImagePrompt || "");

  const setCustomPrompt = (val: string) => {
    setCustomPromptDict(prev => ({ ...prev, [currentFormatKey]: val }));
  };

  // Restore the saved original prompt after an enhancement
  const handleRestoreOriginalPrompt = () => {
    const original = originalPromptDict[currentFormatKey];
    if (original === undefined) return;
    setCustomPromptDict(prev => ({ ...prev, [currentFormatKey]: original }));
    setOriginalPromptDict(prev => {
      const next = { ...prev };
      delete next[currentFormatKey];
      return next;
    });
  };
  const currentOriginalPrompt = originalPromptDict[currentFormatKey] ?? null;

  const renderedImageUrl = renderedImageUrlsDict[currentMediaKey] || null;

  // ============================================================================
  // MULTI-ASSET ITEM RESOLVER (X Thread, FB Multiple Photos, LinkedIn Multi-Image,
  // TikTok Photo)
  // The MultiMediaEditor reads per-asset media from these items, so EVERY media
  // source — per-asset AI generation, upload, stock, campaign results — is resolved
  // into the correct asset slot. A generated image lands in the exact thread post /
  // asset card where "Generate" was clicked.
  // ============================================================================
  const currentMediaItems: MultiMediaItem[] = (() => {
    const stored = mediaItemsDict[currentFormatKey];
    const campaignUrls = currentGenerated?.imageUrls;
    // Once the user has managed assets (stored exists), respect its structure;
    // otherwise seed slots from campaign results (or a single empty slot).
    const sourceCount = stored
      ? Math.max(stored.length, 1)
      : Math.max(campaignUrls?.length || 0, 1);

    const items: MultiMediaItem[] = [];
    for (let i = 0; i < sourceCount; i++) {
      const campaignOverlay = displayOverlayTexts[i];
      const campaignPostText = campaignOverlay
        ? [campaignOverlay.title, campaignOverlay.body].filter(Boolean).join(". ")
        : "";
      const base = (stored && stored[i]) || {
        id: `item_${i + 1}`,
        url: "",
        type: "image" as const,
        prompt: `Visual asset ${i + 1}`,
        // Seed thread post text from the campaign's per-slide storyboard when present
        caption: campaignPostText || undefined,
      };
      const assetKey = `${activePlatformTab}-${currentFormatName}-${i}`;
      if (clearedMediaKeys[assetKey]) {
        items.push(base.url ? { ...base, url: "" } : base);
        continue;
      }
      const custom = customMediaDict[assetKey];
      const rendered = renderedImageUrlsDict[assetKey];
      const campaign = campaignUrls?.[i] || "";
      const url = custom?.url || rendered || campaign || base.url;
      if (!url) {
        items.push(base);
        continue;
      }
      items.push({
        ...base,
        url,
        type: custom?.type || (isVideoUrl(url) ? "video" : "image"),
      });
    }
    return items;
  })();

  // X Thread preview data: every connected post with its own text + media
  const threadPosts = activePlatformTab === "x" && currentFormatName === "Thread"
    ? currentMediaItems.map((item, idx) => ({
        text: item.caption || (idx === 0 ? currentCaption : ""),
        mediaUrl: item.url || null,
      }))
    : [];

  // Shared per-index media remapper: rewrites customMediaDict / renderedImageUrlsDict /
  // clearedMediaKeys keys for the current format according to a remap function
  // (null = drop the entry, e.g. it was deleted with its card).
  const remapFormatMediaIndexes = (remap: (idx: number) => number | null) => {
    const mediaPrefix = `${activePlatformTab}-${currentFormatName}-`;
    const remapDict = (dict: Record<string, any>) => {
      const next: Record<string, any> = {};
      Object.entries(dict).forEach(([k, v]) => {
        if (!k.startsWith(mediaPrefix)) {
          next[k] = v;
          return;
        }
        const idx = Number(k.slice(mediaPrefix.length));
        if (Number.isNaN(idx)) {
          next[k] = v;
          return;
        }
        const target = remap(idx);
        if (target === null) return;
        next[`${mediaPrefix}${target}`] = v;
      });
      return next;
    };
    setCustomMediaDict(remapDict);
    setRenderedImageUrlsDict(remapDict);
    setClearedMediaKeys(remapDict);
  };

  // When an asset card is deleted, shift the per-index media dictionaries down so
  // media never leaks onto the wrong thread post / asset slot.
  const reindexFormatMediaAfterRemoval = (removedIdx: number) => {
    remapFormatMediaIndexes((idx) =>
      idx === removedIdx ? null : idx > removedIdx ? idx - 1 : idx
    );
    setActiveMediaIndexDict(prev => {
      const cur = prev[currentFormatKey] || 0;
      if (cur > removedIdx) return { ...prev, [currentFormatKey]: cur - 1 };
      if (cur === removedIdx) return { ...prev, [currentFormatKey]: Math.max(0, cur - 1) };
      return prev;
    });
  };

  // Reorder a slide/post card (from → to): moves the per-index media with it and
  // reorders the storyboard text arrays (overlayText / visualPrompts) the same way.
  const handleReorderFormatCards = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const moveInArray = <T,>(arr: T[]): T[] => {
      const next = [...arr];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    };
    const remap = (idx: number): number | null => {
      if (idx === fromIdx) return toIdx;
      if (fromIdx < toIdx) return idx > fromIdx && idx <= toIdx ? idx - 1 : idx;
      return idx >= toIdx && idx < fromIdx ? idx + 1 : idx;
    };

    // Move per-index media sources
    remapFormatMediaIndexes(remap);

    // Move storyboard text (slides-based editors keep text in generatedContents)
    const currentFmt = generatedContents[activePlatformTab]?.[currentFormatName];
    if (currentFmt?.overlayText?.length || currentFmt?.visualPrompts?.length) {
      setGeneratedContents(prev => ({
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormatName]: {
            ...currentFmt,
            overlayText: currentFmt.overlayText?.length ? moveInArray(currentFmt.overlayText) : currentFmt.overlayText,
            visualPrompts: currentFmt.visualPrompts?.length ? moveInArray(currentFmt.visualPrompts) : currentFmt.visualPrompts,
          },
        },
      }));
    }

    // Move the stored multi-media items (Thread / multi-photo editors)
    const storedItems = mediaItemsDict[currentFormatKey];
    if (storedItems && storedItems.length > Math.max(fromIdx, toIdx)) {
      setMediaItemsDict(prev => ({
        ...prev,
        [currentFormatKey]: moveInArray(prev[currentFormatKey] || []),
      }));
    }

    // Active selection follows the moved card
    if (activeSlideIdx === fromIdx) setActiveSlideIdx(toIdx);
    else {
      const mapped = remap(activeSlideIdx);
      if (mapped !== null && mapped !== activeSlideIdx) setActiveSlideIdx(mapped);
    }
    const curMediaIdx = activeMediaIndexDict[currentFormatKey] || 0;
    if (curMediaIdx === fromIdx) {
      setActiveMediaIndexDict(prev => ({ ...prev, [currentFormatKey]: toIdx }));
    } else {
      const mappedMedia = remap(curMediaIdx);
      if (mappedMedia !== null && mappedMedia !== curMediaIdx) {
        setActiveMediaIndexDict(prev => ({ ...prev, [currentFormatKey]: mappedMedia }));
      }
    }
  };


  const [videoDurationSec, setVideoDurationSec] = useState<number>(5);
  const [videoStatusDict, setVideoStatusDict] = useState<Record<string, "idle" | "queued" | "processing" | "completed" | "failed">>({});
  const [videoErrorDict, setVideoErrorDict] = useState<Record<string, string | null>>({});
  const [renderErrorDict, setRenderErrorDict] = useState<Record<string, string | null>>({});
  // Last aspect ratio actually used for a generation per format (drives preview frame)
  const [videoAspectDict, setVideoAspectDict] = useState<Record<string, string>>({});
  const [generationProgressDict, setGenerationProgressDict] = useState<Record<string, number>>({});
  const [generationStageDict, setGenerationStageDict] = useState<Record<string, string>>({});

  const videoStatus = videoStatusDict[currentFormatKey] || "idle";
  const videoError = videoErrorDict[currentFormatKey] || null;
  const renderError = renderErrorDict[currentFormatKey] || null;
  const generationProgress = generationProgressDict[currentFormatKey] || 0;
  const generationStage = generationStageDict[currentFormatKey] || "";
  const isRenderingMedia = Boolean(renderingMediaKeys[currentFormatKey]);

  const isCurrentVideoFormat = getPlatformCapability(activePlatformTab, currentFormatName).mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(currentFormatName);

  const handleRenderMedia = async (options?: {
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
  }) => {
    const targetPlatform = activePlatformTab;
    const targetFormat = currentFormatName;
    const targetFormatKey = `${targetPlatform}-${targetFormat}`;
    const targetSlideIdx = activeSlideIdx;
    const targetMediaKey = `${targetPlatform}-${targetFormat}-${targetSlideIdx}`;
    
    const capability = getPlatformCapability(targetPlatform, targetFormat);
    const isVideo = options?.mediaType
      ? options.mediaType === "video"
      : capability.mediaType === "video" || ["Reel", "Shorts", "Video", "Short Video"].includes(targetFormat);

    const targetPrompt = options?.prompt || (
      customPromptDict[targetFormatKey] !== undefined && customPromptDict[targetFormatKey] !== ""
        ? customPromptDict[targetFormatKey]
        : (displayPrompts[targetSlideIdx] || singleImagePrompt || campaignTopic || `Professional ${targetPlatform} ${targetFormat} visual design`)
    );
    const duration = options?.duration || videoDurationSec || 5;
    const targetAspect = options?.aspectRatio || currentAspectRatio;

    setRenderingMediaKeys(prev => ({ ...prev, [targetFormatKey]: true }));
    setClearedMediaKeys(prev => ({ ...prev, [targetMediaKey]: false }));
    setVideoErrorDict(prev => ({ ...prev, [targetFormatKey]: null }));
    setRenderErrorDict(prev => ({ ...prev, [targetFormatKey]: null }));
    // Remember the aspect actually used so the LIVE PREVIEW frame matches the
    // selected ratio (e.g. LinkedIn Video 16:9 default → user picks 9:16 →
    // preview switches to the vertical layout).
    if (options?.aspectRatio) {
      setVideoAspectDict(prev => ({ ...prev, [targetFormatKey]: options.aspectRatio as string }));
    }

    if (isVideo) {
      setVideoStatusDict(prev => ({ ...prev, [targetFormatKey]: "processing" }));
      setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
      setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: `Synthesizing ${duration}s cinematic video stream...` }));

      try {
        const res = await fetch("/api/ai-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "generate-media",
            platform: targetPlatform,
            format: targetFormat,
            mediaType: "video",
            prompt: targetPrompt,
            duration: duration,
            aspectRatio: targetAspect,
            topic: campaignTopic,
            videoTask: options?.videoTask,
            sourceImage: options?.sourceImage,
            sourceVideo: options?.sourceVideo,
          }),
        });
        const data = await res.json();

        if (data.success && data.asset?.url) {
          const isVid = isVideoUrl(data.asset.url) || data.asset.mediaType === "video" || data.asset.type === "video";
          if (!isVid) {
            setVideoStatusDict(prev => ({ ...prev, [targetFormatKey]: "failed" }));
            setVideoErrorDict(prev => ({ ...prev, [targetFormatKey]: "Video generation returned an invalid media format." }));
            setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Video generation failed." }));
            setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
            return;
          }

          setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 100 }));
          setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Video synthesis complete!" }));

          // ── CROSS-PLATFORM SAME-FORMAT MEDIA SYNC (SAVES CREDITS) ──
          const currentFamily = getFormatFamily(targetPlatform, targetFormat);
          const syncMediaUpdates: Record<string, string> = { [targetMediaKey]: data.asset.url };
          const syncCustomUpdates: Record<string, { url: string; type: "image" | "video"; name: string }> = {
            [targetMediaKey]: {
              url: data.asset.url,
              type: "video",
              name: `${targetPlatform}-${targetFormat}.mp4`,
            },
          };

          selectedPlatforms.forEach((pId) => {
            const availableFormats = selectedContentTypes[pId] && selectedContentTypes[pId].length > 0
              ? selectedContentTypes[pId]
              : (getPlatformDef(pId)?.contentTypes || []);
            
            availableFormats.forEach((otherFmt) => {
              if (getFormatFamily(pId, otherFmt) === currentFamily) {
                const otherKey = `${pId}-${otherFmt}-${targetSlideIdx}`;
                syncMediaUpdates[otherKey] = data.asset.url;
                syncCustomUpdates[otherKey] = {
                  url: data.asset.url,
                  type: "video",
                  name: `${pId}-${otherFmt}.mp4`,
                };
                const otherFormatKey = `${pId}-${otherFmt}`;
                setVideoStatusDict(prev => ({ ...prev, [otherFormatKey]: "completed" }));
              }
            });
          });

          setRenderedImageUrlsDict(prev => ({ ...prev, ...syncMediaUpdates }));
          setCustomMediaDict(prev => ({ ...prev, ...syncCustomUpdates }));
          setVideoStatusDict(prev => ({ ...prev, [targetFormatKey]: "completed" }));
        } else {
          setVideoStatusDict(prev => ({ ...prev, [targetFormatKey]: "failed" }));
          setVideoErrorDict(prev => ({ ...prev, [targetFormatKey]: data.error || "Video synthesis failed on backend provider." }));
          setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Video generation failed." }));
          setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
        }
      } catch (err: any) {
        setVideoStatusDict(prev => ({ ...prev, [targetFormatKey]: "failed" }));
        setVideoErrorDict(prev => ({ ...prev, [targetFormatKey]: err.message || "Video synthesis request failed." }));
        setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Video generation failed." }));
        setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
      } finally {
        setRenderingMediaKeys(prev => {
          const next = { ...prev };
          delete next[targetFormatKey];
          return next;
        });
      }
      return;
    }

    // Real Image Rendering via Backend AI Visualizer (Vertex AI / Nano Banana Pro)
    setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
    setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Synthesizing visual canvas with Nano Banana Pro..." }));

    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-media",
          platform: targetPlatform,
          format: targetFormat,
          mediaType: "image",
          prompt: targetPrompt,
          aspectRatio: targetAspect,
          topic: campaignTopic,
          style: options?.style,
          quality: options?.quality,
          imageModel: options?.imageModel,
        }),
      });
      const data = await res.json();

      if (data.success && data.asset?.url) {
        // MEDIA TYPE VALIDATION — an image request must return a real image asset
        // (a video URL here would render as a broken image / fake play button).
        const returnedIsVideo = isVideoUrl(data.asset.url) || data.asset.mediaType === "video" || data.asset.type === "video";
        if (returnedIsVideo) {
          setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Image generation failed." }));
          setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
          setRenderErrorDict(prev => ({ ...prev, [targetFormatKey]: "Image generation returned an invalid media format." }));
          return;
        }

        setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 100 }));
        setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Image ready!" }));

        // ── CROSS-PLATFORM SAME-FORMAT MEDIA SYNC (SAVES CREDITS) ──
        const currentFamily = getFormatFamily(targetPlatform, targetFormat);
        const syncMediaUpdates: Record<string, string> = { [targetMediaKey]: data.asset.url };
        const syncCustomUpdates: Record<string, { url: string; type: "image" | "video"; name: string }> = {
          [targetMediaKey]: {
            url: data.asset.url,
            type: "image",
            name: `${targetPlatform}-${targetFormat}.png`,
          },
        };

        selectedPlatforms.forEach((pId) => {
          const availableFormats = selectedContentTypes[pId] && selectedContentTypes[pId].length > 0
            ? selectedContentTypes[pId]
            : (getPlatformDef(pId)?.contentTypes || []);
          
          availableFormats.forEach((otherFmt) => {
            if (getFormatFamily(pId, otherFmt) === currentFamily) {
              const otherKey = `${pId}-${otherFmt}-${targetSlideIdx}`;
              syncMediaUpdates[otherKey] = data.asset.url;
              syncCustomUpdates[otherKey] = {
                url: data.asset.url,
                type: "image",
                name: `${pId}-${otherFmt}.png`,
              };
            }
          });
        });

        setRenderedImageUrlsDict(prev => ({ ...prev, ...syncMediaUpdates }));
        setCustomMediaDict(prev => ({
          ...prev,
          ...syncCustomUpdates,
        }));
      } else {
        setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Image generation failed." }));
        setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
        setRenderErrorDict(prev => ({ ...prev, [targetFormatKey]: data.error || "Image generation failed on the AI provider." }));
      }
    } catch (err: any) {
      console.error("Image generation request failed:", err);
      setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Image generation failed." }));
      setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
      setRenderErrorDict(prev => ({ ...prev, [targetFormatKey]: err.message || "Image generation request failed." }));
    } finally {
      setRenderingMediaKeys(prev => {
        const next = { ...prev };
        delete next[targetFormatKey];
        return next;
      });
    }
  };

  const handleRenderAllSlides = async () => {
    const targetPlatform = activePlatformTab;
    const targetFormat = currentFormatName;
    const targetFormatKey = `${targetPlatform}-${targetFormat}`;

    setRenderingAllSlidesKeys(prev => ({ ...prev, [targetFormatKey]: true }));
    setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 0 }));
    setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "Initializing storyboard slide batch generation..." }));

    const slideCount = isMultiFormat ? Math.max(displayOverlayTexts.length, displayPrompts.length, 3) : 1;
    const newRendered: Record<string, string> = { ...renderedImageUrlsDict };

    try {
      for (let i = 0; i < slideCount; i++) {
        const slideKey = `${targetPlatform}-${targetFormat}-${i}`;
        const p = displayPrompts[i] || customPrompt || singleImagePrompt || `${campaignTopic} Slide ${i + 1}`;
        setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: `Generating visual for Slide ${i + 1} of ${slideCount}...` }));
        setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: Math.round(((i) / slideCount) * 100) }));

        try {
          const res = await fetch("/api/ai-studio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              step: "generate-media",
              platform: targetPlatform,
              format: targetFormat,
              mediaType: "image",
              prompt: p,
              aspectRatio: currentAspectRatio,
              topic: campaignTopic,
            }),
          });
          const data = await res.json();
          if (data.success && data.asset?.url) {
            newRendered[slideKey] = data.asset.url;
            setRenderedImageUrlsDict({ ...newRendered });
          }
        } catch (err) {
          console.error(`Failed to generate slide ${i + 1}:`, err);
        }
      }

      setGenerationProgressDict(prev => ({ ...prev, [targetFormatKey]: 100 }));
      setGenerationStageDict(prev => ({ ...prev, [targetFormatKey]: "All slides generated!" }));
    } finally {
      setRenderingAllSlidesKeys(prev => {
        const next = { ...prev };
        delete next[targetFormatKey];
        return next;
      });
    }
  };

  // MULTI-SLIDE MEDIA URL RESOLVER
  const displayImageUrls = useMemo(() => {
    const count = isMultiFormat ? totalCarouselSlides : 1;
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const slideKey = `${activePlatformTab}-${currentFormatName}-${i}`;
      if (clearedMediaKeys[slideKey]) {
        urls.push("");
      } else if (customMediaDict[slideKey]?.url) {
        urls.push(customMediaDict[slideKey].url);
      } else if (renderedImageUrlsDict[slideKey]) {
        urls.push(renderedImageUrlsDict[slideKey]);
      } else if (aiGeneratedImageUrls && aiGeneratedImageUrls[i]) {
        urls.push(aiGeneratedImageUrls[i]);
      } else {
        urls.push("");
      }
    }
    return urls;
  }, [
    isMultiFormat,
    totalCarouselSlides,
    aiGeneratedImageUrls,
    activePlatformTab,
    currentFormatName,
    clearedMediaKeys,
    customMediaDict,
    renderedImageUrlsDict,
  ]);

  const aiMediaUrl = currentGenerated?.videoUrl || currentGenerated?.imageUrl || (aiGeneratedImageUrls ? (displayImageUrls[activeSlideIdx] || displayImageUrls[0]) : "");
  const rawDisplayUrl = customMedia?.url || renderedImageUrl || (isMultiFormat ? (displayImageUrls[activeSlideIdx] || null) : (aiMediaUrl || null));
  const displayImageUrl = clearedMediaKeys[currentMediaKey] ? null : (rawDisplayUrl || null);

  const currentHtmlSlide = null;
  const isCurrentSlideLoading = false;

  // MULTI-SLIDE OVERLAY & PROMPT MUTATORS
  const updateActiveSlideOverlay = (field: "title" | "body", value: string) => {
    setGeneratedContents((prev) => {
      const currentFmt = prev[activePlatformTab]?.[currentFormatName] || {
        caption: currentCaption,
        imagePrompt: singleImagePrompt,
        visualPrompts: [...currentVisualPrompts],
        overlayText: [...currentOverlayTexts],
        hashtags: currentHashtags,
        bestTime: currentBestTime,
      };

      const nextOverlays = [...(currentFmt.overlayText || [])];
      while (nextOverlays.length <= activeSlideIdx) {
        nextOverlays.push({
          step: nextOverlays.length + 1,
          title: `Slide ${nextOverlays.length + 1}`,
          body: "",
          theme: "gradient-purple",
        });
      }

      nextOverlays[activeSlideIdx] = {
        ...nextOverlays[activeSlideIdx],
        [field]: value,
        step: activeSlideIdx + 1,
      };

      return {
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormatName]: {
            ...currentFmt,
            overlayText: nextOverlays,
          },
        },
      };
    });
  };

  const updateActiveSlidePrompt = (value: string) => {
    setGeneratedContents((prev) => {
      const currentFmt = prev[activePlatformTab]?.[currentFormatName] || {
        caption: currentCaption,
        imagePrompt: singleImagePrompt,
        visualPrompts: [...currentVisualPrompts],
        overlayText: [...currentOverlayTexts],
        hashtags: currentHashtags,
        bestTime: currentBestTime,
      };

      const nextPrompts = [...(currentFmt.visualPrompts || [])];
      while (nextPrompts.length <= activeSlideIdx) {
        nextPrompts.push("");
      }
      nextPrompts[activeSlideIdx] = value;

      return {
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormatName]: {
            ...currentFmt,
            visualPrompts: nextPrompts,
          },
        },
      };
    });
  };

  const handleAddSlide = () => {
    const currentCount = totalCarouselSlides;
    if (currentCount >= 10) return;
    setGeneratedContents((prev) => {
      const currentFmt = prev[activePlatformTab]?.[currentFormatName] || {
        caption: currentCaption,
        imagePrompt: singleImagePrompt,
        visualPrompts: [...currentVisualPrompts],
        overlayText: [...currentOverlayTexts],
        hashtags: currentHashtags,
        bestTime: currentBestTime,
      };

      const nextOverlays = [...(currentFmt.overlayText || [])];
      while (nextOverlays.length < currentCount) {
        nextOverlays.push({
          step: nextOverlays.length + 1,
          title: `Slide ${nextOverlays.length + 1}`,
          body: "Key insight or strategy.",
          theme: "gradient-blue",
        });
      }
      nextOverlays.push({
        step: nextOverlays.length + 1,
        title: `Slide ${nextOverlays.length + 1} Strategy`,
        body: "Actionable takeaway for your audience.",
        theme: "gradient-emerald",
      });

      const nextPrompts = [...(currentFmt.visualPrompts || [])];
      while (nextPrompts.length < currentCount) {
        nextPrompts.push(`Visual for slide ${nextPrompts.length + 1}`);
      }
      nextPrompts.push(`Visual design aesthetic for slide ${nextPrompts.length + 1} ${campaignTopic || activePlatformTab}`);

      return {
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormatName]: {
            ...currentFmt,
            overlayText: nextOverlays,
            visualPrompts: nextPrompts,
          },
        },
      };
    });
    setActiveSlideIdx(currentCount);
  };

  const handleRemoveSlide = (idxToRemove: number) => {
    if (totalCarouselSlides <= 2) return;
    setGeneratedContents((prev) => {
      const currentFmt = prev[activePlatformTab]?.[currentFormatName] || {
        caption: currentCaption,
        imagePrompt: singleImagePrompt,
        visualPrompts: [...currentVisualPrompts],
        overlayText: [...currentOverlayTexts],
        hashtags: currentHashtags,
        bestTime: currentBestTime,
      };

      const nextOverlays = (currentFmt.overlayText || [])
        .filter((_, i) => i !== idxToRemove)
        .map((item, i) => ({ ...item, step: i + 1 }));
      const nextPrompts = (currentFmt.visualPrompts || []).filter((_, i) => i !== idxToRemove);

      return {
        ...prev,
        [activePlatformTab]: {
          ...prev[activePlatformTab],
          [currentFormatName]: {
            ...currentFmt,
            overlayText: nextOverlays,
            visualPrompts: nextPrompts,
          },
        },
      };
    });
    setActiveSlideIdx((prev) => Math.max(0, Math.min(prev, totalCarouselSlides - 2)));
  };

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

  const isVertical = ["Reel", "Reels", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(currentFormatName);
  // Preview frame orientation: follow the aspect ACTUALLY used for generation when
  // known (e.g. LinkedIn Video 9:16 selected → vertical preview), else format default.
  const previewIsVertical = (() => {
    const usedAspect = videoAspectDict[currentFormatKey];
    if (usedAspect) return usedAspect === "9:16";
    return isVertical && getPlatformCapability(activePlatformTab, currentFormatName).defaultAspectRatio === "9:16";
  })();
  // Explicit media type for previews — URL extensions can lie (Supabase URLs),
  // so trust the stored type from the generation/upload pipeline.
  const displayMediaIsVideo = customMediaDict[currentMediaKey]?.type === "video" || isVideoUrl(displayImageUrl);
  const isSquare = currentFormatName === "Feed";
  const isCarousel = currentFormatName === "Carousel" || currentFormatName === "Thread" || currentFormatName === "Idea Pin";

  // REAL content check — whether from multi-agent campaign OR manual editor typing / single media generation / upload
  const hasManualContent =
    (currentCaption || "").trim().length > 0 ||
    Boolean(displayImageUrl) ||
    (displayImageUrls || []).some(Boolean) ||
    Object.values(customMediaDict).some((m) => Boolean(m?.url)) ||
    Object.values(renderedImageUrlsDict).some(Boolean);

  const hasCampaignContent = Object.values(generatedContents).some((fmts) =>
    Object.values(fmts).some(
      (f) =>
        (f.caption || "").trim().length > 0 ||
        (f.imageUrls || []).some(Boolean) ||
        Boolean(f.imageUrl) ||
        Boolean(f.videoUrl)
    )
  );

  const hasContent = hasManualContent || hasCampaignContent;
  const isWidescreen = currentFormatName === "Post";
  const isPin = currentFormatName === "Pin";

  const hasAnyPlatformContent = Object.keys(generatedContents[activePlatformTab] || {}).length > 0;

  // ============================================================================
  // PUBLISH / SCHEDULE / SAVE DRAFT — WIRED
  // ============================================================================
  const [publishModal, setPublishModal] = useState<{ type: "draft" | "schedule" | "publish" | "send_review" | null; post?: Post }>({ type: null });
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [schedulePlan, setSchedulePlan] = useState<
    { platform: string; platformLabel: string; format: string; time: Date; label: string; reason: string; source: string }[]
  >([]);
  const [isAnalyzingTimes, setIsAnalyzingTimes] = useState(false);
  const [selectedHashtagGroup, setSelectedHashtagGroup] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; name: string; price?: string }[]>([]);
  const [hashtagDropdownOpen, setHashtagDropdownOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);

  const buildCurrentPost = (status: PostStatus = "draft"): Post | null => {
    if (!hasContent && viewMode === "ai") return null;
    const mediaUrl = displayImageUrl || "";
    const mediaType: PostMediaType = customMedia?.type === "video" ? "video" : currentMediaType === "video" ? "video" : (isCarousel || isMultiFormat) ? "carousel" : "image";
    return {
      id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      platform: activePlatformTab,
      format: currentFormatName,
      caption: currentCaption,
      firstComment: currentFirstComment,
      hashtags: currentHashtags,
      mediaUrls: (isCarousel || isMultiFormat) ? displayImageUrls.filter(Boolean) : (mediaUrl ? [mediaUrl] : []),
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
        imageUrl: post.mediaUrls[0] || "",
        format: post.format,
        hashtags: post.hashtags,
        mediaType: post.mediaType,
        source: post.source,
        campaignTopic,
        campaignHook,
        mediaHistory: {
          mediaUrls: post.mediaUrls,
          overlayTexts: post.overlayTexts,
          visualPrompts: currentVisualPrompts,
        },
      });
      post.id = res.id;
      store.addPost(post);
      setPublishResult({ success: true, message: "✓ Saved to Content Library — open the Content board anytime to reuse & post it" });
    } catch (e: any) {
      console.error(e);
      setPublishResult({ success: false, message: e.message || "Failed to save draft" });
    } finally {
      setPublishLoading(false);
      setTimeout(() => setPublishResult(null), 4000);
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

  // All generated campaign posts that actually have content (caption or media).
  // Handles the duplicate keys stored by handleMultiAgentPayload (raw/lowercase/TitleCase).
  const collectCampaignPosts = () => {
    const entries: { platform: string; format: string; data: GeneratedFormat }[] = [];
    for (const [plt, formats] of Object.entries(generatedContents)) {
      for (const [fmt, data] of Object.entries(formats)) {
        if (fmt !== fmt.toLowerCase() && formats[fmt.toLowerCase()] === data) continue; // TitleCase alias
        const hasMedia =
          (data.imageUrls || []).some(Boolean) || Boolean(data.imageUrl) || Boolean(data.videoUrl);
        if ((data.caption || "").trim() || hasMedia) {
          entries.push({ platform: plt, format: fmt, data });
        }
      }
    }
    return entries;
  };

  const openScheduleModal = async () => {
    const posts = collectCampaignPosts();
    if (posts.length === 0) {
      setPublishResult({ success: false, message: "Nothing to schedule — generate or write content first." });
      setTimeout(() => setPublishResult(null), 3000);
      return;
    }
    // Open immediately, then run the AI best-time analysis (Redis-cached per industry)
    setSchedulePlan([]);
    setPublishModal({ type: "schedule" });
    setIsAnalyzingTimes(true);
    try {
      const uniquePlatforms = Array.from(new Set(posts.map((p) => p.platform)));
      const analysis = await analyzeBestTimes(uniquePlatforms);
      const plan = posts.map(({ platform, format }) => {
        const entry =
          analysis.times[platform.toLowerCase()] ||
          analysis.times[platform] || { spec: getBestTimeSpec(platform), source: "industry_standard" };
        return {
          platform,
          platformLabel: getPlatformDef(platform)?.label || platform,
          format,
          time: getNextBestTimeFromSpec(entry.spec),
          label: entry.spec.label,
          reason: entry.spec.reason,
          source: entry.source as string,
        };
      });
      setSchedulePlan(plan);
    } catch (e: any) {
      console.warn("AI best-time analysis failed, using industry standard:", e);
      const plan = posts.map(({ platform, format }) => {
        const spec = getBestTimeSpec(platform);
        return {
          platform,
          platformLabel: getPlatformDef(platform)?.label || platform,
          format,
          time: getNextBestTime(platform),
          label: spec.label,
          reason: spec.reason,
          source: "industry_standard",
        };
      });
      setSchedulePlan(plan);
    } finally {
      setIsAnalyzingTimes(false);
    }
  };

  const schedulePost = async () => {
    const posts = collectCampaignPosts();
    if (posts.length === 0) {
      setPublishResult({ success: false, message: "Nothing to schedule — generate or write content first." });
      setTimeout(() => setPublishResult(null), 3000);
      return;
    }
    setPublishLoading(true);
    const scheduled: string[] = [];
    try {
      for (const { platform, format, data } of posts) {
        // Use the exact time the AI plan showed in the modal (fallback: static best time)
        const planned = schedulePlan.find((e) => e.platform === platform && e.format === format);
        const bestAt = planned ? planned.time : getNextBestTime(platform);
        const mediaUrls = (data.imageUrls || []).filter(Boolean);
        const mediaUrl = data.videoUrl || data.imageUrl || mediaUrls[0] || "";
        const draftRes = await apiSaveDraft({
          platform,
          content: data.caption || "",
          imageUrl: mediaUrl,
          format,
          hashtags: normalizeHashtags(data.hashtags),
          settings: {
            ...(publishSettingsDict[`${platform}-${format}`] || {}),
            // Carry the editor's native title/description fields into the publish payload
            contentTitle: titleDict[`${platform}-${format}`] || undefined,
            contentDescription: descriptionDict[`${platform}-${format}`] || undefined,
          },
          mediaType: data.videoUrl ? "video" : mediaUrls.length > 1 ? "carousel" : mediaUrl ? "image" : "none",
          source: "ai_campaign",
          campaignTopic,
          campaignHook,
          mediaHistory: {
            mediaUrls: data.videoUrl ? [data.videoUrl] : mediaUrls,
            overlayTexts: data.overlayText || [],
            visualPrompts: data.visualPrompts || [],
          },
        });
        await apiSchedulePost(draftRes.id, bestAt);
        scheduled.push(`${getPlatformDef(platform)?.label || platform} → ${bestAt.toLocaleString()}`);
      }
      setPublishModal({ type: null });
      setPublishResult({
        success: true,
        message: `AI scheduled ${scheduled.length} post${scheduled.length > 1 ? "s" : ""} at peak audience times: ${scheduled.join(" • ")}`,
      });
    } catch (e: any) {
      console.error(e);
      setPublishResult({ success: false, message: e.message || "Failed to schedule posts" });
    } finally {
      setPublishLoading(false);
      setTimeout(() => setPublishResult(null), 8000);
    }
  };

  const publishNow = async () => {
    const posts = collectCampaignPosts();
    if (posts.length === 0) {
      setPublishResult({ success: false, message: "Nothing to publish — generate or write content first." });
      setTimeout(() => setPublishResult(null), 3000);
      return;
    }
    setPublishLoading(true);
    const published: string[] = [];
    const failed: string[] = [];
    try {
      for (const { platform, format, data } of posts) {
        const label = getPlatformDef(platform)?.label || platform;
        try {
          const mediaUrls = (data.imageUrls || []).filter(Boolean);
          const mediaUrl = data.videoUrl || data.imageUrl || mediaUrls[0] || "";
          const draftRes = await apiSaveDraft({
            platform,
            content: data.caption || "",
            imageUrl: mediaUrl,
            format,
            hashtags: normalizeHashtags(data.hashtags),
            settings: {
              ...(publishSettingsDict[`${platform}-${format}`] || {}),
              contentTitle: titleDict[`${platform}-${format}`] || undefined,
              contentDescription: descriptionDict[`${platform}-${format}`] || undefined,
            },
            mediaType: data.videoUrl ? "video" : mediaUrls.length > 1 ? "carousel" : mediaUrl ? "image" : "none",
            source: "ai_campaign",
            campaignTopic,
            campaignHook,
            mediaHistory: {
              mediaUrls: data.videoUrl ? [data.videoUrl] : mediaUrls,
              overlayTexts: data.overlayText || [],
              visualPrompts: data.visualPrompts || [],
            },
          });
          await apiPublishNow(draftRes.id);
          published.push(label);
        } catch (e: any) {
          console.error(`Publish failed for ${platform}:`, e);
          failed.push(`${label}: ${e.message || "failed"}`);
        }
      }
      if (published.length > 0 && failed.length === 0) {
        setPublishResult({ success: true, message: `Published to ${published.join(", ")} ✓` });
      } else if (published.length > 0) {
        setPublishResult({ success: true, message: `Published to ${published.join(", ")} ✓ — failed: ${failed.join("; ")}` });
      } else {
        setPublishResult({ success: false, message: `Publish failed — ${failed.join("; ")}` });
      }
    } finally {
      setPublishLoading(false);
      setTimeout(() => setPublishResult(null), 8000);
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
          hashtags: normalizeHashtags(manualPost.hashtags),
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
    const merged = normalizeHashtags([...currentHashtags, ...group.tags]);
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
    <div className="flex flex-col min-h-[calc(100vh-4rem)] space-y-4 pb-8 font-sans">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs shrink-0 border border-slate-800 dark:border-slate-200">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Generate with AI or Add Your Own Content
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
              {/* GENERATE BUTTON — INSIDE CARD (CENTERED) */}
              <div className="pt-2.5 flex items-center justify-center">
                <Button
                  onClick={() => setIsMultiAgentModalOpen(true)}
                  disabled={selectedPlatforms.length === 0}
                  className="w-full sm:w-auto px-4 py-1.5 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white font-semibold text-xs shadow-sm gap-1.5 transition-all"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate Content with AI for All Selected Platforms ({selectedPlatforms.length})</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* MAIN WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
            {/* LEFT: CREATIVE EDITOR */}
            <Card className="lg:col-span-8 border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 !overflow-visible relative z-20 flex flex-col">
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
                      {validSelectedFormats.map((option) => {
                        const optCap = getPlatformCapability(activePlatformTab, option);
                        return (
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
                          {option} <span className="opacity-60 font-mono ml-0.5">{optCap.defaultAspectRatio}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

              <CardContent className="p-3.5 sm:p-4 space-y-4 !overflow-visible">
                {/* ---------------------------------------------------------------------------- */}
                {/* PLATFORM-AWARE NATIVE STUDIO ROUTER */}
                {/* ---------------------------------------------------------------------------- */}
                <PlatformEditorRouter
                  platform={activePlatformTab}
                  format={currentFormatName}
                  title={currentTitle}
                  onTitleChange={(val) => {
                    setTitleDict((prev) => ({ ...prev, [currentFormatKey]: val }));
                  }}
                  caption={currentCaption}
                  onCaptionChange={updateCaption}
                  description={currentDescription}
                  onDescriptionChange={(val) => {
                    setDescriptionDict((prev) => ({ ...prev, [currentFormatKey]: val }));
                  }}
                  destinationUrl={currentDestinationUrl}
                  onDestinationUrlChange={(val) => {
                    setDestinationUrlDict((prev) => ({ ...prev, [currentFormatKey]: val }));
                  }}
                  board={currentBoard}
                  onBoardChange={(val) => {
                    setBoardDict((prev) => ({ ...prev, [currentFormatKey]: val }));
                  }}
                  taggedTopics={currentTaggedTopics}
                  onTaggedTopicsChange={(val) => {
                    setTaggedTopicsDict((prev) => ({ ...prev, [currentFormatKey]: val }));
                  }}
                  altText={currentAltText}
                  onAltTextChange={(val) => {
                    setAltTextDict((prev) => ({ ...prev, [currentFormatKey]: val }));
                  }}
                  hashtags={currentHashtags}
                  onHashtagsChange={(val) => {
                    // Guarantee every space-separated token the user types becomes a real "#Tag"
                    const formatted = formatHashtagInputTokens(val);
                    setGeneratedContents((prev) => ({
                      ...prev,
                      [activePlatformTab]: {
                        ...prev[activePlatformTab],
                        [currentFormatName]: {
                          ...(prev[activePlatformTab]?.[currentFormatName] || {}),
                          hashtags: formatted,
                        },
                      },
                    }));
                  }}
                  firstComment={currentFirstComment}
                  onFirstCommentChange={setCurrentFirstComment}
                  displayImageUrl={displayImageUrl}
                  displayImageUrls={displayImageUrls}
                  onRemoveMedia={() => {
                    setClearedMediaKeys((prev) => ({ ...prev, [currentMediaKey]: true }));
                    setCustomMediaDict((prev) => {
                      const next = { ...prev };
                      delete next[currentMediaKey];
                      return next;
                    });
                    setRenderedImageUrlsDict((prev) => {
                      const next = { ...prev };
                      delete next[currentMediaKey];
                      return next;
                    });
                  }}
                  onOpenUpload={() => fileInputRef.current?.click()}
                  onOpenStock={() => setActiveMediaModal("stock")}
                  onRenderAI={(opts) => handleRenderMedia(opts)}
                  isRenderingMedia={Boolean(renderingMediaKeys[currentFormatKey])}
                  slides={(() => {
                    const slideCount = isMultiFormat ? Math.max(displayOverlayTexts.length, displayPrompts.length, 3) : 1;
                    const items = [];
                    for (let idx = 0; idx < slideCount; idx++) {
                      items.push({
                        slideNumber: idx + 1,
                        title: displayOverlayTexts[idx]?.title ?? "",
                        body: displayOverlayTexts[idx]?.body ?? "",
                        visualPrompt: displayPrompts[idx] ?? "",
                        imageUrl: displayImageUrls[idx] || "",
                        type: (displayOverlayTexts[idx] as any)?.type || (displayOverlayTexts[idx] as any)?.theme || (idx === 0 ? "hook" : idx === slideCount - 1 ? "cta" : "content"),
                        theme: (displayOverlayTexts[idx] as any)?.theme,
                      });
                    }
                    return items;
                  })()}
                  onSlidesChange={(newSlides) => {
                    setGeneratedContents((prev) => ({
                      ...prev,
                      [activePlatformTab]: {
                        ...prev[activePlatformTab],
                        [currentFormatName]: {
                          ...(prev[activePlatformTab]?.[currentFormatName] || {}),
                          visualPrompts: newSlides.map((s) => s.visualPrompt),
                          overlayText: newSlides.map((s, i) => ({
                            step: s.slideNumber || i + 1,
                            title: s.title,
                            body: s.body,
                            theme: s.type || s.theme || "content",
                            type: s.type || "content",
                          })),
                        },
                      },
                    }));
                    if (activeSlideIdx >= newSlides.length) {
                      setActiveSlideIdx(Math.max(0, newSlides.length - 1));
                    }
                  }}
                  activeSlideIndex={activeSlideIdx}
                  onActiveSlideChange={setActiveSlideIdx}
                  mediaItems={currentMediaItems}
                  onMediaItemsChange={(items) => {
                    // Detect asset-card deletion (length shrink) and shift per-index
                    // media so generated/uploaded media follows its card, not its index.
                    const oldItems = currentMediaItems;
                    if (items.length === oldItems.length - 1) {
                      let removedIdx = items.findIndex((it, i) => it.id !== oldItems[i]?.id);
                      if (removedIdx === -1) removedIdx = oldItems.length - 1;
                      reindexFormatMediaAfterRemoval(removedIdx);
                    }
                    setMediaItemsDict((prev) => ({ ...prev, [currentFormatKey]: items }));
                  }}
                  activeMediaIndex={currentActiveMediaIdx}
                  onActiveMediaChange={(idx) => {
                    setActiveMediaIndexDict((prev) => ({ ...prev, [currentFormatKey]: idx }));
                    setActiveSlideIdx(idx);
                  }}
                  prompt={customPrompt || displayPrompts[activeSlideIdx] || singleImagePrompt}
                  onPromptChange={setCustomPrompt}
                  onEnhancePrompt={handleEnhancePromptAI}
                  isEnhancingPrompt={Boolean(enhancingPromptKeys[currentFormatKey])}
                  onCaptionToPrompt={handleCaptionToPrompt}
                  isGeneratingPromptFromScript={Boolean(scriptPromptKeys[currentFormatKey])}
                  videoStatus={videoStatusDict[currentFormatKey] || "idle"}
                  videoError={videoErrorDict[currentFormatKey] || null}
                  durationSec={videoDurationSec}
                  onDurationChange={setVideoDurationSec}
                  onGenerateCopyAI={handleGeneratePlatformCopyAI}
                  isGeneratingCopy={Boolean(generatingCopyKeys[currentFormatKey])}
                  onRegenerateSlideAI={handleRegenerateSlideAI}
                  isRegeneratingSlide={Boolean(renderingMediaKeys[currentFormatKey])}
                  onGenerateFullCarouselAI={async () => {
                    await handleGeneratePlatformCopyAI();
                    if (currentMediaType === "image" && activePlatformTab !== "linkedin") {
                      await handleRenderAllSlides();
                    }
                  }}
                  isGeneratingFullCarousel={Boolean(generatingCopyKeys[currentFormatKey]) || Boolean(renderingAllSlidesKeys[currentFormatKey])}
                  onExportPDF={() => {
                    window.print();
                  }}
                  onUploadPDF={(file) => {
                    console.log("[AI Studio] Uploaded PDF file:", file.name);
                  }}
                  generationProgress={generationProgressDict[currentFormatKey] || 0}
                  generationStage={generationStageDict[currentFormatKey] || ""}
                  renderError={renderErrorDict[currentFormatKey] || null}
                  onReorderCards={handleReorderFormatCards}
                  originalPrompt={currentOriginalPrompt}
                  onRestoreOriginalPrompt={handleRestoreOriginalPrompt}
                  onGenerateField={handleGenerateFieldAI}
                  generatingField={currentGeneratingField}
                />

                {/* ---------------------------------------------------------------------------- */}
                {/* AI TREND SUGGESTIONS (GOOGLE SEARCH GROUNDING + BRAND DNA) */}
                {/* ---------------------------------------------------------------------------- */}
                <AITrendSuggestions
                  platform={activePlatformTab}
                  format={currentFormatName}
                  onSelectTrend={handleApplyTrend}
                  isApplyingTrend={isApplyingTrend}
                />
              </CardContent>
            </Card>

            {/* RIGHT COLUMN (40%): LIVE PREVIEW & PLATFORM SETTINGS */}
            <div className="lg:col-span-4 space-y-4">
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

                <CardContent className="p-3 bg-slate-50/50 dark:bg-slate-950/40 min-h-[300px] flex flex-col justify-center items-center">
                  {rightPanelTab === "preview" ? (
                    /* TAB 1: LIVE PREVIEW */
                    <div className="w-full flex flex-col items-center">
                      <div className={`transition-all duration-300 w-full flex justify-center ${
                        devicePreviewMode === "mobile" ? "max-w-[340px]" : "max-w-[500px]"
                      }`}>
                        <PlatformPreviewWrapper
                          platformKey={activePlatformTab}
                          currentFormatName={currentFormatName}
                          displayImageUrl={displayImageUrl}
                          displayImageUrls={displayImageUrls}
                          displayOverlayTexts={displayOverlayTexts}
                          activeSlideIdx={activeSlideIdx}
                          onSlideChange={(idx) => setActiveSlideIdx(idx)}
                          currentCaption={currentCaption}
                          threadPosts={threadPosts}
                          isVertical={previewIsVertical}
                          displayMediaIsVideo={displayMediaIsVideo}
                          isHtmlSlideFormat={isHtmlSlideFormat}
                          isCurrentSlideLoading={isCurrentSlideLoading}
                          currentHtmlSlide={currentHtmlSlide}
                          campaignTopic={campaignTopic}
                        />
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
                          {currentBestTime
                            ? `AI copy suggestion for ${PLATFORMS.find(p => p.id === activePlatformTab)?.label}: ${currentBestTime}`
                            : "Use the Schedule button — it runs a real AI audience-activity analysis to pick peak times per platform."}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5 text-primary" />
                            {PLATFORMS.find(p => p.id === activePlatformTab)?.label} Publishing Settings
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{currentFormatName}</span>
                        </div>

                        {/* INSTAGRAM — only settings the Graph API publisher actually applies */}
                        {activePlatformTab === "instagram" && currentFormatName !== "Story" && (
                          <div className="space-y-2 text-xs">
                            <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                              <span>Hide Like & View Counts</span>
                              <input
                                type="checkbox"
                                checked={currentPublishSettings.igHideLikeViews === true}
                                onChange={(e) => updatePublishSetting("igHideLikeViews", e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                            </label>
                            <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                              <span>Turn Off Commenting</span>
                              <input
                                type="checkbox"
                                checked={currentPublishSettings.igDisableComments === true}
                                onChange={(e) => updatePublishSetting("igDisableComments", e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                            </label>
                            <p className="text-[10px] text-slate-400 pt-1">Applied right after publishing via the Instagram Graph API.</p>
                          </div>
                        )}

                        {/* LINKEDIN — real visibility control (publisher sends it) */}
                        {activePlatformTab === "linkedin" && (
                          <div className="space-y-1 text-xs">
                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">Post Visibility</label>
                            <select
                              value={currentPublishSettings.linkedinVisibility || "public"}
                              onChange={(e) => updatePublishSetting("linkedinVisibility", e.target.value)}
                              className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none"
                            >
                              <option value="public">Anyone (Public)</option>
                              <option value="connections">Connections Only</option>
                            </select>
                          </div>
                        )}

                        {/* X — real reply + sensitive controls (publisher sends them) */}
                        {activePlatformTab === "x" && (
                          <div className="space-y-2 text-xs">
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">Who Can Reply?</label>
                              <select
                                value={currentPublishSettings.xReplySetting || "everyone"}
                                onChange={(e) => updatePublishSetting("xReplySetting", e.target.value)}
                                className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none"
                              >
                                <option value="everyone">Everyone</option>
                                <option value="following">Accounts you follow</option>
                                <option value="mentioned">Only accounts you mention</option>
                              </select>
                            </div>
                            <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                              <span>Mark as Sensitive Content</span>
                              <input
                                type="checkbox"
                                checked={currentPublishSettings.xMarkSensitive === true}
                                onChange={(e) => updatePublishSetting("xMarkSensitive", e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                            </label>
                          </div>
                        )}

                        {/* FACEBOOK — page posts via API are public; no fake privacy/location controls */}
                        {activePlatformTab === "facebook" && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Page posts are published publicly through the Facebook Graph API. Audience restrictions, location tags and Instagram cross-posting are managed in Meta's publishing tools.
                          </p>
                        )}

                        {/* TIKTOK — real Content Posting API settings (publisher applies them) */}
                        {activePlatformTab === "tiktok" && (
                          <div className="space-y-2 text-xs">
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">Who Can View</label>
                              <select
                                value={currentPublishSettings.tiktokPrivacy || "everyone"}
                                onChange={(e) => updatePublishSetting("tiktokPrivacy", e.target.value)}
                                className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none"
                              >
                                <option value="everyone">Everyone</option>
                                <option value="friends">Friends</option>
                                <option value="private">Only Me</option>
                              </select>
                            </div>
                            <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                              <span>Allow Comments</span>
                              <input
                                type="checkbox"
                                checked={currentPublishSettings.tiktokDisableComments !== true}
                                onChange={(e) => updatePublishSetting("tiktokDisableComments", !e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                            </label>
                            <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                              <span>Allow Duet</span>
                              <input
                                type="checkbox"
                                checked={currentPublishSettings.tiktokDisableDuet !== true}
                                onChange={(e) => updatePublishSetting("tiktokDisableDuet", !e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                            </label>
                            <label className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                              <span>Allow Stitch</span>
                              <input
                                type="checkbox"
                                checked={currentPublishSettings.tiktokDisableStitch !== true}
                                onChange={(e) => updatePublishSetting("tiktokDisableStitch", !e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                            </label>
                            <p className="text-[10px] text-slate-400 pt-1">Sent to TikTok&apos;s Content Posting API with the video. Unaudited apps post as private drafts until TikTok approves the app.</p>
                          </div>
                        )}

                        {/* YOUTUBE — real Data API v3 settings (publisher applies them) */}
                        {activePlatformTab === "youtube" && (
                          <div className="space-y-2 text-xs">
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">Visibility</label>
                              <select
                                value={currentPublishSettings.youtubePrivacy || "public"}
                                onChange={(e) => updatePublishSetting("youtubePrivacy", e.target.value)}
                                className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none"
                              >
                                <option value="public">Public</option>
                                <option value="unlisted">Unlisted</option>
                                <option value="private">Private</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">Audience</label>
                              <select
                                value={currentPublishSettings.youtubeMadeForKids === true ? "kids" : "not_kids"}
                                onChange={(e) => updatePublishSetting("youtubeMadeForKids", e.target.value === "kids")}
                                className="w-full h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 outline-none"
                              >
                                <option value="not_kids">No, it&apos;s not made for kids</option>
                                <option value="kids">Yes, it&apos;s made for kids</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">Video Tags</label>
                              <Input
                                value={currentPublishSettings.youtubeTags || ""}
                                onChange={(e) => updatePublishSetting("youtubeTags", e.target.value)}
                                placeholder="tech, ai, tutorial"
                                className="h-7 text-xs bg-slate-50 dark:bg-slate-800"
                              />
                            </div>
                            <p className="text-[10px] text-slate-400 pt-1">The video title & description from the editor are uploaded with the video.</p>
                          </div>
                        )}

                        {/* PINTEREST — manual export workflow; real fields live in the editor */}
                        {activePlatformTab === "pinterest" && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Pins use the manual export workflow — set the board, destination link, tagged topics and alt text directly in the Pin fields of the editor. They are saved with the post.
                          </p>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <Button variant="outline" size="sm" onClick={saveAsDraft} disabled={publishLoading} className="h-9 px-2 text-[11px] font-extrabold gap-1 bg-white dark:bg-slate-800">
                    <Save className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">Save Draft</span>
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
              <PlatformPreviewWrapper
                platformKey={manualPost.platform}
                currentFormatName={manualPost.format}
                displayImageUrl={manualMedia?.url || null}
                displayImageUrls={manualMedia?.url ? [manualMedia.url] : []}
                displayOverlayTexts={[]}
                activeSlideIdx={0}
                currentCaption={manualPost.caption}
                isVertical={["Reel", "Reels", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(manualPost.format)}
                campaignTopic="Manual Post"
              />
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
      {/* SCHEDULE MODAL — AI PEAK-TIME PLAN PER PLATFORM */}
      {/* ============================================================================ */}
      {publishModal.type === "schedule" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-500" /> AI Peak-Time Schedule
              </h3>
              <button onClick={() => setPublishModal({ type: null })} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              The AI Scheduler analyzed audience activity for every selected platform. Each post is
              queued at its platform&apos;s peak engagement window and publishes automatically:
            </p>
            {isAnalyzingTimes && schedulePlan.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  AI is analyzing audience activity per platform for maximum reach...
                </p>
                <p className="text-[11px] text-slate-400">
                  Industry-level results are cached in Redis, so repeat scheduling is instant
                </p>
              </div>
            ) : (
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {schedulePlan.map((entry, idx) => (
                <div key={`${entry.platform}-${entry.format}-${idx}`} className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                      {entry.platformLabel} <span className="font-semibold text-slate-400">({entry.format})</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{entry.reason}</p>
                    <span className={`inline-block mt-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                      entry.source === "ai_fresh"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                        : entry.source === "ai_cached"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400"
                          : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}>
                      {entry.source === "ai_fresh" ? "AI Analysis" : entry.source === "ai_cached" ? "AI • Redis Cached" : "Industry Standard"}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                      {entry.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {entry.time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            )}
            <div className="flex gap-2 mt-5">
              <Button variant="outline" onClick={() => setPublishModal({ type: null })} className="flex-1">Cancel</Button>
              <Button onClick={schedulePost} disabled={publishLoading || isAnalyzingTimes || schedulePlan.length === 0} className="flex-1">
                {publishLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calendar className="h-4 w-4 mr-1" />}
                Schedule {schedulePlan.length > 0 ? `${schedulePlan.length} Post${schedulePlan.length > 1 ? "s" : ""}` : ""}
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
                    placeholder="e.g. Create 5 slides showing step-by-step how our product solves common customer challenges..."
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
                        placeholder="e.g. Automate your social channels with AI-powered marketing"
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
                    <option value="gemini-3-pro-image">🍌 Nano Banana Pro (gemini-3-pro-image)</option>
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
                className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white font-bold gap-1.5"
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
                    placeholder="e.g. Create 5 slides showing step-by-step how our product solves common customer challenges..."
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
                        placeholder="e.g. Automate your social channels with AI-powered marketing"
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
                    <option value="gemini-3-pro-image">🍌 Nano Banana Pro (gemini-3-pro-image)</option>
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
                className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white font-bold gap-1.5"
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
                  handleRenderMedia();
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
