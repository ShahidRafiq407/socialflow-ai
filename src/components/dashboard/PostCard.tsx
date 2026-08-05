"use client";

import { useTransition, useState } from "react";
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
  Send,
  Calendar,
  Sparkles,
  Layers,
  Globe,
  Camera,
  Briefcase,
  MessageSquare,
  Video,
} from "lucide-react";
import {
  approvePost,
  rejectPost,
  deletePost,
  editPost,
} from "@/actions/content";

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
}

export function PostCard({ post }: { post: PostProps }) {
  const [isPending, startTransition] = useTransition();
  const [loadingAction, setLoadingAction] = useState<
    "approve" | "reject" | "delete" | "edit" | null
  >(null);

  const [openEdit, setOpenEdit] = useState(false);
  const [editedPlatform, setEditedPlatform] = useState(post.platform || "LinkedIn");
  const [editedContent, setEditedContent] = useState(post.content);
  const [editedImagePrompt, setEditedImagePrompt] = useState(
    post.imagePrompt || "Professional high-contrast corporate infographic"
  );
  const [editedTime, setEditedTime] = useState("08:30 AM EST");

  // Determine Format Tag & Default Optimal Peak Time based on Platform
  const getPlatformMetadata = (platformName: string) => {
    const lower = platformName.toLowerCase();
    if (lower.includes("instagram") || lower.includes("reel")) {
      return {
        icon: Camera,
        formatTag: "9:16 Vertical Phone Reel",
        peakTime: "06:30 PM EST (Evening High-Engagement)",
        colorClass: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
      };
    }
    if (lower.includes("tiktok")) {
      return {
        icon: Video,
        formatTag: "9:16 Short Viral Video",
        peakTime: "07:15 PM EST (Prime Video Traffic)",
        colorClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
      };
    }
    if (lower.includes("x") || lower.includes("twitter")) {
      return {
        icon: MessageSquare,
        formatTag: "16:9 Infographic + 4-Tweet Thread",
        peakTime: "11:00 AM EST (Mid-day Tech Discussions)",
        colorClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
      };
    }
    return {
      icon: Briefcase,
      formatTag: "4:5 Carousel PDF Document",
      peakTime: "08:30 AM EST (Morning Executive Coffee)",
      colorClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    };
  };

  const meta = getPlatformMetadata(post.platform);
  const PlatformIcon = meta.icon;

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

  const handleReject = () => {
    setLoadingAction("reject");
    startTransition(async () => {
      try {
        await rejectPost(post.id);
      } catch (error) {
        console.error("Failed to reject post:", error);
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
        });
        setOpenEdit(false);
      } catch (error) {
        console.error("Failed to edit post:", error);
      } finally {
        setLoadingAction(null);
      }
    });
  };

  const renderStatusBadge = () => {
    if (post.status === "APPROVED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3" />
          Approved • Scheduled
        </span>
      );
    }
    if (post.status === "REJECTED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-500/30">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-500/30">
        <Clock className="h-3 w-3" />
        Pending Review
      </span>
    );
  };

  return (
    <Card className="flex flex-col justify-between shadow-sm border-slate-200 dark:border-slate-800 transition-all hover:shadow-md bg-white dark:bg-slate-900 overflow-hidden">
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

        {/* SCIENTIFIC PEAK POSTING TIME BANNER */}
        <div className="px-4 py-2 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>Optimal Peak Time:</span>
          </span>
          <span className="font-mono font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded text-[11px]">
            {meta.peakTime}
          </span>
        </div>

        {/* OPTIONAL IMAGE PREVIEW */}
        {post.imageUrl && (
          <div className="w-full overflow-hidden border-b bg-slate-900/10 relative">
            <img
              src={post.imageUrl}
              alt="AI Generated Asset"
              className="w-full aspect-video object-cover transition-transform hover:scale-105 duration-300"
            />
            <div className="absolute bottom-2 right-2">
              <Badge className="bg-slate-900/80 text-white text-[10px] backdrop-blur-xs">
                {meta.formatTag}
              </Badge>
            </div>
          </div>
        )}

        {/* POST CONTENT CAPTION */}
        <CardContent className="p-4 text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
          {post.content}

          {post.imagePrompt && (
            <div className="mt-4 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-[11px]">
              <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>AI Visual Prompt:</span>
              </span>
              <p className="text-slate-600 dark:text-slate-300 mt-1 italic">
                "{post.imagePrompt}"
              </p>
            </div>
          )}
        </CardContent>
      </div>

      {/* CARD FOOTER */}
      {post.status === "APPROVED" ? (
        <CardFooter className="border-t p-3 bg-slate-50/30 dark:bg-slate-900/30 flex justify-end">
          <Button
            size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto text-xs font-bold"
            onClick={() =>
              alert(
                `Publishing to ${post.platform} is scheduled for its designated Peak Hour!`
              )
            }
          >
            <Send className="h-3.5 w-3.5" />
            <span>Scheduled for Peak Release ({meta.peakTime})</span>
          </Button>
        </CardFooter>
      ) : (
        <CardFooter className="border-t p-3 bg-slate-50/30 dark:bg-slate-900/30 flex flex-wrap justify-end gap-2">
          {/* EDIT BUTTON THAT OPENS FULL MODAL TO EDIT EVERYTHING */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-slate-700 dark:text-slate-200 text-xs font-bold"
            onClick={() => {
              setEditedPlatform(post.platform || "LinkedIn");
              setEditedContent(post.content);
              setEditedImagePrompt(
                post.imagePrompt ||
                  "Professional high-contrast corporate infographic"
              );
              setOpenEdit(true);
            }}
            disabled={isPending}
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit Full Post</span>
          </Button>

          {/* EDIT FULL MODAL (PLATFORM, CONTENT, IMAGE PROMPT, SCHEDULING) */}
          <Dialog open={openEdit} onOpenChange={setOpenEdit}>
            <DialogContent className="sm:max-w-[580px]">
              <DialogHeader>
                <DialogTitle className="text-base font-extrabold flex items-center gap-2">
                  <Edit2 className="h-4 w-4 text-primary" />
                  <span>Edit Platform-Specific Campaign Post</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Modify the target social platform, caption copy, AI visual
                  prompt, or peak engagement timing.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4">
                {/* 1. SELECT PLATFORM */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Target Platform &amp; Format
                  </label>
                  <select
                    value={editedPlatform}
                    onChange={(e) => setEditedPlatform(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="LinkedIn">
                      LinkedIn Executive (4:5 Carousel Document)
                    </option>
                    <option value="Instagram">
                      Instagram Reels &amp; Story (9:16 Vertical Reel)
                    </option>
                    <option value="TikTok">
                      TikTok B2B Community (9:16 Short Video)
                    </option>
                    <option value="X">
                      X (Twitter) Timeline (16:9 Card + Thread)
                    </option>
                    <option value="YouTube">
                      YouTube Shorts (9:16 Widescreen Short)
                    </option>
                    <option value="Facebook">
                      Facebook Feed (1:1 Square Asset)
                    </option>
                  </select>
                </div>

                {/* 2. OPTIMAL PEAK TIME */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Peak Audience Publishing Time
                  </label>
                  <select
                    value={editedTime}
                    onChange={(e) => setEditedTime(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="08:30 AM EST">
                      08:30 AM EST — Morning Executive Coffee (LinkedIn)
                    </option>
                    <option value="11:00 AM EST">
                      11:00 AM EST — Mid-Day Tech Discussions (X / Twitter)
                    </option>
                    <option value="06:30 PM EST">
                      06:30 PM EST — Evening High-Engagement Window (Instagram Reel)
                    </option>
                    <option value="07:15 PM EST">
                      07:15 PM EST — Prime Night Video Traffic (TikTok)
                    </option>
                  </select>
                </div>

                {/* 3. POST CAPTION / HOOK / CONTENT */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Post Caption &amp; Brand Hook
                  </label>
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[140px] text-xs sm:text-sm leading-relaxed rounded-xl"
                    placeholder="Edit your platform-tailored caption or hook..."
                    disabled={isPending}
                  />
                </div>

                {/* 4. AI VISUAL / IMAGE PROMPT */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>AI Visual / Reel Generation Prompt</span>
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
                  <span>Save Full Post Changes</span>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* REJECT BUTTON */}
          <Button
            size="sm"
            variant="outline"
            className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/40 dark:hover:bg-rose-950/40 text-xs font-bold"
            onClick={handleReject}
            disabled={isPending}
          >
            {isPending && loadingAction === "reject" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <X className="h-3.5 w-3.5 mr-1" />
            )}
            <span>Reject</span>
          </Button>

          {/* APPROVE BUTTON */}
          <Button
            size="sm"
            className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
            onClick={handleApprove}
            disabled={isPending}
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
    </Card>
  );
}
