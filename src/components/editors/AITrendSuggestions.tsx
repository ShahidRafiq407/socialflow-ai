"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Sparkles,
  RefreshCw,
  Loader2,
  ExternalLink,
  ArrowRight,
  Zap,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface TrendSuggestionItem {
  id: string;
  topic: string;
  whyItFits: string;
  suggestedHook: string;
  contentAngle: string;
  recommendedFormat: string;
  source: string;
}

interface AITrendSuggestionsProps {
  platform: string;
  format: string;
  onSelectTrend: (trend: TrendSuggestionItem) => void;
  isApplyingTrend?: boolean;
}

export default function AITrendSuggestions({
  platform,
  format,
  onSelectTrend,
  isApplyingTrend = false,
}: AITrendSuggestionsProps) {
  const [trends, setTrends] = useState<TrendSuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedTrendId, setSelectedTrendId] = useState<string | null>(null);

  const fetchTrends = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-trend-suggestions",
          platform,
          format,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.trends)) {
        setTrends(data.trends);
      }
    } catch (e) {
      console.error("Failed to load trend suggestions:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [platform, format]);

  return (
    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-900 dark:to-indigo-950/20 space-y-3 text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Trending for {platform.charAt(0).toUpperCase() + platform.slice(1)} ({format})
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Live Google Search Grounding filtered by your Brand DNA
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={fetchTrends}
          className="h-7 text-xs font-bold gap-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span>Refresh Trends</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="py-6 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Searching live trends & matching Brand DNA...</span>
        </div>
      ) : trends.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {trends.map((t, idx) => (
            <div
              key={t.id || idx}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-primary/50 transition-all flex flex-col justify-between space-y-2.5 shadow-2xs group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Trend Angle #{idx + 1}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={t.source}>
                    {t.source || "Google Grounding"}
                  </span>
                </div>

                <h5 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1">
                  {t.topic}
                </h5>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    Viral Hook
                  </span>
                  <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 italic line-clamp-2">
                    "{t.suggestedHook}"
                  </p>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {t.whyItFits}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                disabled={isApplyingTrend && selectedTrendId === t.id}
                onClick={() => {
                  setSelectedTrendId(t.id);
                  onSelectTrend(t);
                }}
                className="w-full h-7 text-xs font-bold gap-1 bg-gradient-to-r from-primary to-indigo-600 text-white shadow-2xs hover:opacity-90 mt-1"
              >
                {isApplyingTrend && selectedTrendId === t.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3 text-amber-300" />
                )}
                <span>Use This Trend</span>
                <ArrowRight className="h-3 w-3 ml-auto" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-slate-400">
          No trend suggestions available. Click Refresh to query live trends.
        </div>
      )}
    </div>
  );
}
