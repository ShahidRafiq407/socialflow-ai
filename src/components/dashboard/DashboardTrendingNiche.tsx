"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDashboardTrends } from "@/actions/dashboard";
import { TrendItem } from "@/actions/trends";
import { useAIStudioSessionStore } from "@/lib/stores/aiStudioSession";
import { Button } from "@/components/ui/button";
import { Flame, Sparkles, ExternalLink, RefreshCw } from "lucide-react";

interface DashboardTrendingNicheProps {
  industry?: string;
}

export function DashboardTrendingNiche({ industry }: DashboardTrendingNicheProps) {
  const router = useRouter();
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrends = async () => {
    setLoading(true);
    try {
      const res = await fetchDashboardTrends(industry);
      if (res && res.trends) {
        setTrends(res.trends.slice(0, 4));
      }
    } catch {
      // Degrades gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrends();
  }, [industry]);

  const handleDraftFromTrend = (trendTitle: string) => {
    try {
      const store = useAIStudioSessionStore.getState();
      store.setCampaignTopic(trendTitle);
      router.push("/dashboard/ai-studio");
    } catch {}
  };

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between border-b pb-3 mb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <Flame className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Trending Topics
              </h3>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={loadTrends}
          disabled={loading}
          title="Refresh trends"
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 py-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : trends.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-xs text-muted-foreground">No breaking trends found right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trends.map((t) => (
            <div
              key={t.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-muted/30 p-2.5 transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{t.pubDate}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs font-medium text-foreground">
                  {t.title}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {t.link && t.link !== "https://news.google.com" && (
                  <a
                    href={t.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="View source article"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleDraftFromTrend(t.title)}
                  className="gap-1 shadow-2xs text-[11px] h-7"
                >
                  <Sparkles className="h-3 w-3 text-primary" />
                  Draft Post
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
