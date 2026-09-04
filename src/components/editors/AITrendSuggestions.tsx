"use client";

import React, { useState, useEffect, useRef } from "react";
import { TrendingUp, RefreshCw, Loader2, Zap, Info, X } from "lucide-react";
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
  /**
   * A press already running for this format that did NOT start here — the format's own
   * primary AI button. Locks the cards too: both paths write the same format key, so
   * two in flight means the loser's copy and paid render overwrite the winner's.
   */
  isBusyElsewhere?: boolean;
}

export default function AITrendSuggestions({
  platform,
  format,
  onSelectTrend,
  isApplyingTrend = false,
  isBusyElsewhere = false,
}: AITrendSuggestionsProps) {
  const [trends, setTrends] = useState<TrendSuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTrendId, setSelectedTrendId] = useState<string | null>(null);
  const [detailModalTrend, setDetailModalTrend] = useState<TrendSuggestionItem | null>(null);
  /** Only the newest request may write state — see the guard in `fetchTrends`. */
  const requestIdRef = useRef(0);

  const fetchTrends = async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError(null);
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
      // This panel re-queries on every platform/format switch. Without this guard a slow
      // reply for the format the user has already left lands on top of the one on screen,
      // and applying that card would generate a post for the wrong format.
      if (requestId !== requestIdRef.current) return;
      if (data.success && Array.isArray(data.trends) && data.trends.length > 0) {
        setTrends(data.trends);
      } else {
        setTrends([]);
        setLoadError(data.error || `No live trends came back for ${platform} ${format}.`);
      }
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to load trend suggestions:", e);
      setLoadError("Could not reach the trend researcher. Try Refresh.");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [platform, format]);

  /** Any press that would collide with this one — whichever button started it. */
  const isLocked = isApplyingTrend || isBusyElsewhere;

  /** The research names a format; the press always builds the one on screen. Say so. */
  // Singular/plural and spacing only: the researcher writes "Reels" where the tab says
  // "Reel", and flagging that as a mismatch would be noise on every card. The -ies rule
  // is what makes "Stories" reach "Story" — without it the plural strip leaves "storie"
  // and the banner cries mismatch on the one format most likely to be named in plural.
  // No two real format names collide under this: Feed, Carousel, Reel, Story, Pin, Video
  // Pin, Idea Pin, Post, Multi-Image, Document, Video, Multiple Photos, Photo, Shorts,
  // Thread all stay distinct.
  const normalize = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .replace(/ies$/, "y")
      .replace(/s$/, "");
  const differentFormat = (recommended: string) =>
    Boolean(recommended?.trim()) && normalize(recommended) !== normalize(format);

  return (
    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-3 text-left">
      {/* COMPACT HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Trending Now
            </h4>
            <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 h-4 border-slate-300 dark:border-slate-700">
              {platform} {format}
            </Badge>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading || isLocked}
          onClick={fetchTrends}
          className="h-6 px-2 text-xs font-semibold gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span>Refresh</span>
        </Button>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
        Picking one writes the copy <span className="font-semibold">and</span> renders this format's media in the
        same press — every slide for a deck, the video for a Reel, the still for a post.
      </p>

      {isLoading ? (
        <div className="py-6 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          <span className="text-[11px]">Searching live trends for {platform} {format}...</span>
        </div>
      ) : trends.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-0.5">
          {trends.map((t, idx) => {
            const isThisOneRunning = isApplyingTrend && selectedTrendId === t.id;
            return (
            <div
              key={t.id || idx}
              className={`p-3 rounded-xl border bg-white dark:bg-slate-900 transition-all flex flex-col justify-between space-y-2.5 shadow-2xs group ${
                isThisOneRunning
                  ? "border-indigo-500 ring-1 ring-indigo-500/30"
                  : "border-slate-200 dark:border-slate-800 hover:border-indigo-500/50"
              } ${isLocked && !isThisOneRunning ? "opacity-60" : ""}`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <Badge variant="secondary" className="text-[9px] font-extrabold uppercase tracking-wide py-0 h-4 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    Trend #{idx + 1}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setDetailModalTrend(t)}
                    className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-0.5 font-medium"
                    title="View Full Research"
                  >
                    <Info className="h-3 w-3" />
                    <span>Details</span>
                  </button>
                </div>

                <h5 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                  {t.topic}
                </h5>

                {/* The researcher's own format call. Shown only when it disagrees with the
                    tab you are on, because the press builds THIS tab's format either way —
                    silently ignoring it made the research look wrong. */}
                {differentFormat(t.recommendedFormat) && (
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    Best as {t.recommendedFormat} — this press builds {format}
                  </p>
                )}

                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {t.whyItFits}
                </p>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  type="button"
                  size="sm"
                  /* EVERY card locks while one is being applied. Disabling only the card
                     that was clicked let a second click start a parallel generation that
                     overwrote the first one's copy and paid for a second render. */
                  disabled={isLocked}
                  onClick={() => {
                    setSelectedTrendId(t.id);
                    onSelectTrend(t);
                  }}
                  className="flex-1 h-7 text-xs font-bold gap-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs disabled:opacity-100"
                >
                  {isThisOneRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="h-3 w-3 text-amber-300" />
                  )}
                  <span>{isThisOneRunning ? "Generating..." : "Use Trend"}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailModalTrend(t)}
                  className="h-7 px-2 text-[11px] font-semibold border-slate-200 dark:border-slate-800"
                >
                  Details
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-slate-400">
          {loadError || "No live trend recommendations available. Click Refresh to query trends."}
        </div>
      )}

      {/* TREND DETAILS MODAL */}
      {detailModalTrend && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <Badge className="bg-indigo-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 mb-1.5">
                  {platform} • {format}
                </Badge>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                  {detailModalTrend.topic}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalTrend(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Suggested Hook
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 italic leading-relaxed">
                  "{detailModalTrend.suggestedHook}"
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Content Execution Angle
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {detailModalTrend.contentAngle}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Why This Audience Cares
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {detailModalTrend.whyItFits}
                </p>
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>Source: {detailModalTrend.source}</span>
                {detailModalTrend.recommendedFormat?.trim() && (
                  <span className="font-semibold text-slate-500 dark:text-slate-300 text-right">
                    Researcher's pick: {detailModalTrend.recommendedFormat}
                    {differentFormat(detailModalTrend.recommendedFormat) && (
                      <span className="block text-amber-600 dark:text-amber-400">
                        Generating for {format}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDetailModalTrend(null)}
                className="h-8 text-xs font-semibold"
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isLocked}
                onClick={() => {
                  const t = detailModalTrend;
                  setDetailModalTrend(null);
                  setSelectedTrendId(t.id);
                  onSelectTrend(t);
                }}
                className="h-8 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                {isApplyingTrend ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-amber-300" />
                )}
                <span>Use This Trend</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
