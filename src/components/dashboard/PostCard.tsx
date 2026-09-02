"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Clock,
  Share2,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Edit2,
  Calendar,
  Sparkles,
  Globe,
  Camera,
  Briefcase,
  MessageSquare,
  Video,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  FileEdit,
  MessageCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  approvePost,
  rejectPost,
  deletePost,
  editPost,
  retryPost,
} from "@/actions/content";
import { isMediaVideoUrl } from "@/lib/media/urls";

export interface PostProps {
  id: string;
  workspaceId: string;
  platform: string;
  content: string;
  imageUrl?: string | null;
  imagePrompt?: string | null;
  status: string;
  scheduledFor?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  format?: string | null;
  mediaType?: string | null;
  hashtags?: string[];
  campaignTopic?: string | null;
  mediaHistory?: any;
  source?: string | null;
  publishError?: string | null;
  publishedAt?: Date | null;
  /** Set by the generators; `origin: "growth-autopilot"` marks a lead-goal post. */
  settings?: any;
}

const QUICK_REJECT_REASONS = [
  "Tone doesn't match our brand",
  "Hook is weak",
  "Caption too long",
  "Wrong platform or format",
  "Factual / claim issue",
  "Missing CTA",
];

function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PostCard({ post }: { post: PostProps }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Written by the lead-goal engine rather than by hand. Autopilot posts are
  // also kept 3 days instead of 1 hour after publishing.
  const isAutopilot =
    typeof post.settings === "object" &&
    post.settings !== null &&
    (post.settings as any).origin === "growth-autopilot";
  const [loadingAction, setLoadingAction] = useState<
    "approve" | "reject" | "delete" | "edit" | "retry" | null
  >(null);

  const [openEdit, setOpenEdit] = useState(false);
  const [openReject, setOpenReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDetail, setRejectDetail] = useState("");

  const [editedPlatform, setEditedPlatform] = useState(post.platform || "LinkedIn");
  const [editedContent, setEditedContent] = useState(post.content);
  const [editedImagePrompt, setEditedImagePrompt] = useState(post.imagePrompt || "");
  const [editedTime, setEditedTime] = useState(
    toLocalInputValue(post.scheduledFor)
  );

  // Determine Format Tag & Icon based on Platform, Format, and MediaType
  const getPlatformMetadata = (
    platformName: string,
    format?: string | null,
    mediaType?: string | null
  ) => {
    const lowerPlat = (platformName || "LinkedIn").toLowerCase();
    const lowerFmt = (format || "").toLowerCase();
    const isVideo =
      mediaType === "video" ||
      lowerFmt.includes("reel") ||
      lowerFmt.includes("video") ||
      lowerFmt.includes("short");

    if (lowerPlat.includes("instagram")) {
      return {
        icon: isVideo ? Video : Camera,
        formatTag: isVideo
          ? "9:16 Instagram Reel"
          : lowerFmt.includes("story")
          ? "9:16 Story"
          : lowerFmt.includes("carousel")
          ? "Instagram Carousel"
          : "Instagram Feed Image",
        colorClass: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
      };
    }
    if (lowerPlat.includes("tiktok")) {
      return {
        icon: Video,
        formatTag: "9:16 TikTok Video",
        colorClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
      };
    }
    if (lowerPlat.includes("x") || lowerPlat.includes("twitter")) {
      return {
        icon: isVideo ? Video : MessageSquare,
        formatTag: isVideo ? "16:9 X Video" : "X Post",
        colorClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
      };
    }
    if (lowerPlat.includes("pinterest")) {
      return {
        icon: isVideo ? Video : Globe,
        formatTag: isVideo ? "9:16 Video Pin" : "2:3 Pin",
        colorClass: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
      };
    }
    if (lowerPlat.includes("youtube")) {
      return {
        icon: Video,
        formatTag: isVideo ? "9:16 YouTube Short" : "YouTube Video",
        colorClass: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
      };
    }
    if (lowerPlat.includes("facebook")) {
      return {
        icon: isVideo ? Video : Share2,
        formatTag: isVideo ? "9:16 Facebook Reel" : "Facebook Feed",
        colorClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
      };
    }
    return {
      icon: isVideo ? Video : Briefcase,
      formatTag: isVideo
        ? "16:9 LinkedIn Video"
        : lowerFmt.includes("carousel") || lowerFmt.includes("doc")
        ? "4:5 Carousel Document"
        : "LinkedIn Feed Post",
      colorClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    };
  };

  const meta = getPlatformMetadata(post.platform, post.format, post.mediaType);
  const PlatformIcon = meta.icon;

  // Resolve preview media: imageUrl first, then mediaHistory fallback (some
  // publish paths persist media only in mediaHistory).
  const mediaHistoryUrls: string[] = Array.isArray(
    post.mediaHistory?.mediaUrls
  )
    ? post.mediaHistory.mediaUrls.filter(
        (u: unknown) => typeof u === "string" && (u as string).length > 0
      )
    : [];
  const displayMedia =
    post.imageUrl && /^(https?:|data:|\/)/i.test(post.imageUrl)
      ? post.imageUrl
      : mediaHistoryUrls[0] || null;
  const isVideo = isMediaVideoUrl(displayMedia, post.mediaType || undefined);

  const handleApprove = () => {
    setLoadingAction("approve");
    startTransition(async () => {
      try {
        await approvePost(post.id);
      } catch (error) {
        console.error("Failed to approve post:", error);
      } finally {
        setLoadingAction(null);
      }
    });
  };

  const handleRejectSubmit = () => {
    const reason = [rejectReason, rejectDetail.trim()].filter(Boolean).join(" — ");
    if (!reason.trim()) return;
    setLoadingAction("reject");
    startTransition(async () => {
      try {
        await rejectPost(post.id, reason);
        setOpenReject(false);
        setRejectReason("");
        setRejectDetail("");
      } catch (error) {
        console.error("Failed to reject post:", error);
      } finally {
        setLoadingAction(null);
      }
    });
  };

  const handleRetry = () => {
    setLoadingAction("retry");
    startTransition(async () => {
      try {
        await retryPost(post.id);
      } catch (error) {
        console.error("Failed to retry post:", error);
      } finally {
        setLoadingAction(null);
      }
    });
  };

  const handleDelete = () => {
    setLoadingAction("delete");
    startTransition(async () => {
      try {
        await deletePost(post.id);
      } catch (error) {
        console.error("Failed to delete post:", error);
      } finally {
        setLoadingAction(null);
      }
    });
  };

  const handleSaveEdit = () => {
    setLoadingAction("edit");
    startTransition(async () => {
      try {
        await editPost(post.id, {
          platform: editedPlatform,
          content: editedContent,
          imagePrompt: editedImagePrompt,
          scheduledFor: editedTime ? new Date(editedTime) : undefined,
        });
        setOpenEdit(false);
      } catch (error) {
        console.error("Failed to edit post:", error);
      } finally {
        setLoadingAction(null);
      }
    });
  };

  const openInStudio = () => {
    try {
      sessionStorage.setItem(
        "socialflow:openInStudio",
        JSON.stringify({
          id: post.id,
          platform: post.platform,
          format: post.format || post.platform,
          content: post.content,
          imageUrl: post.imageUrl,
          imagePrompt: post.imagePrompt,
          hashtags: post.hashtags,
          campaignTopic: post.campaignTopic,
          mediaHistory: post.mediaHistory,
        })
      );
    } catch {}
    router.push("/dashboard/ai-studio");
  };

  // ---- Status badge config (AI Studio status color system) ----
  const statusConfig: Record<
    string,
    { label: string; className: string; icon: LucideIcon }
  > = {
    DRAFT: {
      label: "Draft",
      className:
        "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-400/30",
      icon: FileEdit,
    },
    PENDING_APPROVAL: {
      label: "Needs Review",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-500/30",
      icon: Clock,
    },
    APPROVED: {
      label: "Needs Review",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-500/30",
      icon: Clock,
    },
    SCHEDULED: {
      label: "Scheduled",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-500/30",
      icon: Calendar,
    },
    PUBLISHED: {
      label: "Published",
      className:
        "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-500/30",
      icon: CheckCircle2,
    },
    FAILED: {
      label: "Failed",
      className:
        "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-500/30",
      icon: AlertTriangle,
    },
    REJECTED: {
      label: "Rejected",
      className:
        "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-500/30",
      icon: XCircle,
    },
  };

  const st = statusConfig[post.status] || statusConfig.DRAFT;
  const StatusIcon = st.icon;

  const renderStatusBadge = () => (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${st.className}`}
    >
      <StatusIcon className="h-3 w-3" />
      {st.label}
    </span>
  );

  const isReview = post.status === "PENDING_APPROVAL" || post.status === "APPROVED";
  const liveUrl =
    post.source && /^https?:\/\//.test(post.source) ? post.source : null;

  // ---- Status-specific banner (time / error / reason) ----
  const renderStatusBanner = () => {
    if (post.status === "SCHEDULED") {
      return (
        <div className="px-4 py-2 bg-blue-50/70 dark:bg-blue-950/30 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold">
            <Calendar className="h-3.5 w-3.5 text-blue-500" />
            <span>Auto-publishes:</span>
          </span>
          <span className="font-mono font-semibold px-2 py-0.5 rounded text-[11px] text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50">
            {formatDateTime(post.scheduledFor) || "Pending slot"}
          </span>
        </div>
      );
    }
    if (post.status === "PUBLISHED") {
      return (
        <div className="px-4 py-2 bg-violet-50/70 dark:bg-violet-950/30 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="h-3.5 w-3.5 text-violet-500" />
            <span>Published:</span>
          </span>
          <span className="font-mono font-semibold px-2 py-0.5 rounded text-[11px] text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/50">
            {formatDateTime(post.publishedAt) || formatDateTime(post.updatedAt) || "Live"}
          </span>
        </div>
      );
    }
    if (post.status === "FAILED" && post.publishError) {
      return (
        <div className="px-4 py-2 bg-red-50/70 dark:bg-red-950/30 border-b border-slate-200/60 dark:border-slate-800 flex items-start gap-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <span className="text-red-700 dark:text-red-300 font-medium line-clamp-2">
            {post.publishError}
          </span>
        </div>
      );
    }
    if (post.status === "REJECTED" && post.publishError) {
      return (
        <div className="px-4 py-2 bg-rose-50/70 dark:bg-rose-950/30 border-b border-slate-200/60 dark:border-slate-800 flex items-start gap-2 text-xs">
          <XCircle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" />
          <span className="text-rose-700 dark:text-rose-300 font-medium line-clamp-2">
            <span className="font-bold">Reject reason:</span> {post.publishError}
          </span>
        </div>
      );
    }
    if (post.scheduledFor) {
      return (
        <div className="px-4 py-2 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <span>Planned slot:</span>
          </span>
          <span className="font-mono font-semibold px-2 py-0.5 rounded text-[11px] text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40">
            {formatDateTime(post.scheduledFor)}
          </span>
        </div>
      );
    }
    return (
      <div className="px-4 py-2 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          <span>Saved:</span>
        </span>
        <span className="font-mono font-semibold px-2 py-0.5 rounded text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
          {formatDateTime(post.createdAt) || "Unscheduled Draft"}
        </span>
      </div>
    );
  };

  return (
    <Card className="flex flex-col justify-between shadow-xs border-slate-200 dark:border-slate-800 transition-all hover:shadow-md bg-white dark:bg-slate-900 overflow-hidden rounded-xl animate-in fade-in slide-in-from-bottom-1">
      <div>
        {/* CARD HEADER */}
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b bg-slate-50/70 dark:bg-slate-900/60 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PlatformIcon className="h-4 w-4" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 block">
                {post.platform}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {meta.formatTag}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAutopilot && (
              <Link
                href="/dashboard/goals"
                title="Created by your lead goal's autopilot. Open Lead Goal HQ."
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20"
              >
                <Zap className="h-2.5 w-2.5" />
                Autopilot
              </Link>
            )}
            {renderStatusBadge()}

            {/* DELETE BUTTON - ALWAYS REMAINS ON THE CARD */}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              onClick={handleDelete}
              disabled={isPending}
              title="Delete Post"
            >
              {isPending && loadingAction === "delete" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CardHeader>

        {/* STATUS-SPECIFIC BANNER */}
        {renderStatusBanner()}

        {/* MEDIA PREVIEW (image or video) */}
        {displayMedia && (
          <div className="w-full overflow-hidden border-b bg-slate-900/10 relative">
            {isVideo ? (
              <video
                src={displayMedia}
                controls
                playsInline
                preload="metadata"
                className="w-full aspect-video object-cover bg-slate-900"
              />
            ) : (
              <img
                src={displayMedia}
                alt="AI Generated Asset"
                className="w-full aspect-video object-cover transition-transform hover:scale-105 duration-300"
              />
            )}
            <div className="absolute bottom-2 right-2">
              <Badge className="bg-slate-900/80 text-white text-[10px] backdrop-blur-xs">
                {meta.formatTag}
              </Badge>
            </div>
          </div>
        )}

        {/* POST CONTENT CAPTION */}
        <CardContent className="p-4 text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
          <div className="line-clamp-8">{post.content}</div>

          {post.imagePrompt && (
            <div className="mt-4 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-[11px]">
              <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>AI Visual Prompt:</span>
              </span>
              <p className="text-slate-600 dark:text-slate-300 mt-1 italic">
                {`"${post.imagePrompt}"`}
              </p>
            </div>
          )}
        </CardContent>
      </div>

      {/* CARD FOOTER — actions vary by status */}
      {post.status === "PUBLISHED" ? (
        <CardFooter className="border-t p-3 bg-slate-50/30 dark:bg-slate-900/30 gap-2">
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <span>View Live Post</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="flex-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Published
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-bold"
            onClick={openInStudio}
            disabled={isPending}
            title="Load this post into AI Studio to repurpose it"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Repurpose</span>
          </Button>
        </CardFooter>
      ) : post.status === "FAILED" ? (
        <CardFooter className="border-t p-3 bg-slate-50/30 dark:bg-slate-900/30 gap-2">
          <Button
            size="sm"
            className="gap-1.5 flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
            onClick={handleRetry}
            disabled={isPending}
          >
            {isPending && loadingAction === "retry" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            <span>Retry Publish</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-bold"
            onClick={openInStudio}
            disabled={isPending}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Open in Studio</span>
          </Button>
        </CardFooter>
      ) : post.status === "REJECTED" ? (
        <CardFooter className="border-t p-3 bg-slate-50/30 dark:bg-slate-900/30 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1 flex-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-bold"
            onClick={openInStudio}
            disabled={isPending}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Revise in Studio</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-slate-700 dark:text-slate-200 text-xs font-bold"
            onClick={() => router.push("/dashboard/chat")}
            title="The reject reason was sent to the CEO chat — continue the conversation there"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Discuss with CEO</span>
          </Button>
        </CardFooter>
      ) : post.status === "SCHEDULED" ? (
        <CardFooter className="border-t p-3 bg-slate-50/30 dark:bg-slate-900/30 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1 flex-1 text-slate-700 dark:text-slate-200 text-xs font-bold"
            onClick={() => {
              setEditedPlatform(post.platform || "LinkedIn");
              setEditedContent(post.content);
              setEditedImagePrompt(post.imagePrompt || "");
              setEditedTime(toLocalInputValue(post.scheduledFor));
              setOpenEdit(true);
            }}
            disabled={isPending}
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit / Reschedule</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-bold"
            onClick={openInStudio}
            disabled={isPending}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Open in Studio</span>
          </Button>
        </CardFooter>
      ) : (
        /* DRAFT + NEEDS REVIEW posts */
        <CardFooter className="border-t p-3 bg-slate-50/30 dark:bg-slate-900/30 flex flex-wrap justify-end gap-2">
          {/* OPEN IN STUDIO: loads this saved post back into the AI Studio editor */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-bold"
            onClick={openInStudio}
            disabled={isPending}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Open in Studio</span>
          </Button>

          {/* EDIT BUTTON THAT OPENS FULL MODAL TO EDIT EVERYTHING */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-slate-700 dark:text-slate-200 text-xs font-bold"
            onClick={() => {
              setEditedPlatform(post.platform || "LinkedIn");
              setEditedContent(post.content);
              setEditedImagePrompt(post.imagePrompt || "");
              setEditedTime(toLocalInputValue(post.scheduledFor));
              setOpenEdit(true);
            }}
            disabled={isPending}
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </Button>

          {/* REJECT (with required reason) — only meaningful for review posts */}
          {isReview && (
            <Button
              size="sm"
              variant="outline"
              className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/40 dark:hover:bg-rose-950/40 text-xs font-bold"
              onClick={() => {
                setRejectReason("");
                setRejectDetail("");
                setOpenReject(true);
              }}
              disabled={isPending}
            >
              <X className="h-3.5 w-3.5" />
              <span>Reject</span>
            </Button>
          )}

          {/* APPROVE & SCHEDULE: places the post at its audience-peak slot */}
          <Button
            size="sm"
            className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
            onClick={handleApprove}
            disabled={isPending}
            title="Approves and schedules at the platform's next peak engagement time"
          >
            {isPending && loadingAction === "approve" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>Approve &amp; Schedule</span>
          </Button>
        </CardFooter>
      )}

      {/* EDIT FULL MODAL (PLATFORM, CONTENT, IMAGE PROMPT, SCHEDULE) */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="sm:max-w-[580px]">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-primary" />
              <span>Edit Post</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update the platform, caption, AI visual prompt, or the publish
              slot. Leave the time empty to keep it unscheduled.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* 1. SELECT PLATFORM */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                Target Platform
              </label>
              <select
                value={editedPlatform}
                onChange={(e) => setEditedPlatform(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-primary"
              >
                <option value="LinkedIn">LinkedIn</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="X">X (Twitter)</option>
                <option value="YouTube">YouTube</option>
                <option value="Facebook">Facebook</option>
                <option value="Pinterest">Pinterest</option>
              </select>
            </div>

            {/* 2. PUBLISH TIME */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                Publish Time (optional)
              </label>
              <Input
                type="datetime-local"
                value={editedTime}
                onChange={(e) => setEditedTime(e.target.value)}
                className="h-9 text-xs font-semibold shadow-2xs"
                disabled={isPending}
              />
            </div>

            {/* 3. POST CAPTION / CONTENT */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                Caption
              </label>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[140px] text-xs sm:text-sm leading-relaxed rounded-xl"
                placeholder="Edit your platform-tailored caption or hook..."
                disabled={isPending}
              />
            </div>

            {/* 4. AI VISUAL PROMPT */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>AI Visual / Video Prompt</span>
              </label>
              <Textarea
                value={editedImagePrompt}
                onChange={(e) => setEditedImagePrompt(e.target.value)}
                className="min-h-[70px] text-xs leading-relaxed rounded-xl font-mono text-slate-600 dark:text-slate-300"
                placeholder="Enter the AI visual or video prompt..."
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenEdit(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isPending || !editedContent.trim()}
              className="font-bold bg-primary text-white"
            >
              {isPending && loadingAction === "edit" && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              <span>Save Changes</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECT-WITH-REASON MODAL */}
      <Dialog open={openReject} onOpenChange={setOpenReject}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-500" />
              <span>Reject this post</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              The reason is required — it is sent to your AI CEO chat so the
              content can be revised properly.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* QUICK-PICK REASON CHIPS */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                Pick a reason
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REJECT_REASONS.map((r) => {
                  const active = rejectReason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setRejectReason(active ? "" : r)
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        active
                          ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-rose-400"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FREE-TEXT DETAIL */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                More detail (optional)
              </label>
              <Textarea
                value={rejectDetail}
                onChange={(e) => setRejectDetail(e.target.value)}
                className="min-h-[80px] text-xs sm:text-sm leading-relaxed rounded-xl"
                placeholder="Tell the AI CEO exactly what to change..."
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenReject(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectSubmit}
              disabled={isPending || (!rejectReason && !rejectDetail.trim())}
              className="font-bold bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isPending && loadingAction === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <X className="h-4 w-4 mr-1" />
              )}
              <span>Reject &amp; Send Feedback</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
