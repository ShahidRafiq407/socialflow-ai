"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { PostPerformanceRow } from "@/actions/analytics";
import { useAIStudioSessionStore } from "@/lib/stores/aiStudioSession";
import { Button } from "@/components/ui/button";
import { Trophy, Repeat2, MousePointerClick, Target, ArrowUpRight } from "lucide-react";

interface DashboardTopPerformerProps {
  post: PostPerformanceRow | null;
}

export function DashboardTopPerformer({ post }: DashboardTopPerformerProps) {
  const router = useRouter();

  if (!post || (post.clicks === 0 && post.leads === 0 && !post.excerpt)) {
    return null;
  }

  const handleRepurpose = () => {
    try {
      const store = useAIStudioSessionStore.getState();
      store.setCampaignTopic(`Repurpose winning post: ${post.excerpt.slice(0, 100)}`);
      router.push("/dashboard/ai-studio");
    } catch {}
  };

  return (
    <div className="rounded-xl border bg-gradient-to-br from-amber-500/5 via-card to-card p-4 sm:p-5 shadow-xs border-amber-500/20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3 mb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Trophy className="h-4 w-4" />
          </span>
          <div>
            <h3
              className="text-sm font-semibold tracking-tight text-foreground cursor-help"
              title="Your highest-converting published post based on tracked clicks and confirmed leads"
            >
              Top Performing Post
            </h3>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleRepurpose}
          className="gap-1.5 text-xs shadow-2xs h-8 border-amber-500/30 hover:bg-amber-500/10"
        >
          <Repeat2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          Repurpose with AI
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg bg-muted/40 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
            <span className="font-semibold uppercase tracking-wider text-foreground">
              {post.platform}
            </span>
            <span>·</span>
            <span>{post.format || "Post"}</span>
            {post.topic && (
              <>
                <span>·</span>
                <span className="truncate">Topic: {post.topic}</span>
              </>
            )}
          </div>
          <p className="line-clamp-2 text-xs font-medium text-foreground">
            &ldquo;{post.excerpt}&rdquo;
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 pt-2 sm:pt-0 border-t sm:border-t-0">
          <div className="text-left sm:text-right">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MousePointerClick className="h-3 w-3 text-blue-500" /> Clicks
            </span>
            <span className="text-sm font-bold tabular-nums text-foreground">
              {post.clicks.toLocaleString()}
            </span>
          </div>
          <div className="text-left sm:text-right">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Target className="h-3 w-3 text-emerald-500" /> Leads
            </span>
            <span className="text-sm font-bold tabular-nums text-foreground">
              {post.leads.toLocaleString()}
            </span>
          </div>
          {post.liveUrl && (
            <a
              href={post.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:text-foreground"
              title="View live post"
            >
              <ArrowUpRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
