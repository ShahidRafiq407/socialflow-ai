"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { DashboardPostItem, retryDashboardPost } from "@/actions/dashboard";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Edit2, X } from "lucide-react";

interface DashboardFailuresBannerProps {
  failedPosts: DashboardPostItem[];
  onDismiss?: () => void;
}

export function DashboardFailuresBanner({
  failedPosts,
  onDismiss,
}: DashboardFailuresBannerProps) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const activeFailures = failedPosts.filter((p) => !dismissedIds.includes(p.id));

  if (activeFailures.length === 0) {
    return null;
  }

  const handleRetry = (postId: string) => {
    setRetryingId(postId);
    startTransition(async () => {
      try {
        const res = await retryDashboardPost(postId);
        if (res.success) {
          setFeedback("Post successfully dispatched to platform!");
          setDismissedIds((prev) => [...prev, postId]);
        } else {
          setFeedback(res.error || "Retry failed. Check platform credentials.");
        }
      } catch {
        setFeedback("Failed to retry dispatch. Try reconnecting the channel.");
      } finally {
        setRetryingId(null);
        setTimeout(() => setFeedback(null), 5000);
      }
    });
  };

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/70 dark:border-red-950 dark:bg-red-950/30 p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-xs font-semibold text-red-900 dark:text-red-200">
              {activeFailures.length} Publishing Failure{activeFailures.length > 1 ? "s" : ""} Detected
            </h4>
            <p className="text-[11px] text-red-700 dark:text-red-400">
              Social platforms rejected the following post attempts. You can retry immediately.
            </p>
          </div>
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-600 hover:text-red-800 dark:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {feedback && (
        <div className="mt-2 text-xs font-medium text-red-800 dark:text-red-300">
          {feedback}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {activeFailures.map((post) => (
          <div
            key={post.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-background/80 p-2.5 border border-red-200/60 dark:border-red-900/40 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase text-[10px] tracking-wider text-red-700 dark:text-red-400">
                  {post.platform}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {post.format || "Post"}
                </span>
              </div>
              <p className="truncate font-medium text-foreground mt-0.5">
                {post.content ? post.content.slice(0, 80) : "Media post"}
              </p>
              {post.publishError && (
                <p className="line-clamp-1 text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                  Reason: {post.publishError}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="xs"
                variant="destructive"
                disabled={retryingId === post.id}
                onClick={() => handleRetry(post.id)}
                className="gap-1 h-7"
              >
                <RefreshCw
                  className={`h-3 w-3 ${retryingId === post.id ? "animate-spin" : ""}`}
                />
                Retry Now
              </Button>
              <Link href="/dashboard/content">
                <Button size="icon-xs" variant="outline" className="h-7 w-7">
                  <Edit2 className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
