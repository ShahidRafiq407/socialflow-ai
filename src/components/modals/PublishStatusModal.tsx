"use client";

import React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Calendar,
  X,
  Share2,
  Layers,
  ArrowRight,
  RefreshCw,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface PublishItemResult {
  platform: string;
  format: string;
  status: "PUBLISHED" | "SCHEDULED" | "DRAFT" | "FAILED";
  liveUrl?: string;
  scheduledFor?: string | Date;
  error?: string;
  thumbnailUrl?: string;
  title?: string;
}

interface PublishStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionType: "publish" | "schedule" | "draft";
  items: PublishItemResult[];
  campaignTopic?: string;
}

export default function PublishStatusModal({
  isOpen,
  onClose,
  actionType,
  items,
  campaignTopic,
}: PublishStatusModalProps) {
  if (!isOpen) return null;

  const totalPublished = items.filter((i) => i.status === "PUBLISHED").length;
  const totalScheduled = items.filter((i) => i.status === "SCHEDULED").length;
  const totalDraft = items.filter((i) => i.status === "DRAFT").length;
  const totalFailed = items.filter((i) => i.status === "FAILED").length;

  const isAllSuccess = totalFailed === 0;
  const hasSuccess = totalPublished > 0 || totalScheduled > 0 || totalDraft > 0;

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes("instagram")) return "📸";
    if (p.includes("facebook")) return "📘";
    if (p.includes("linkedin")) return "💼";
    if (p.includes("youtube")) return "▶️";
    if (p.includes("tiktok")) return "🎵";
    if (p.includes("pinterest")) return "📌";
    return "📱";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-2xl flex items-center justify-center shadow-xs ${
                isAllSuccess
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : hasSuccess
                  ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                  : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
              }`}
            >
              {actionType === "publish" ? (
                isAllSuccess ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <Share2 className="h-6 w-6" />
                )
              ) : actionType === "schedule" ? (
                <Clock className="h-6 w-6" />
              ) : (
                <FileText className="h-6 w-6" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                {actionType === "publish" && (isAllSuccess ? "Published Successfully!" : "Publishing Completed with Notices")}
                {actionType === "schedule" && "Posts Scheduled for Auto-Publishing!"}
                {actionType === "draft" && "Drafts Saved to Content Library!"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {campaignTopic ? `Campaign: “${campaignTopic}”` : "Real social media post dispatch summary"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* SUMMARY STATS BAR */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 text-xs font-bold">
          {totalPublished > 0 && (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {totalPublished} Published Live
            </span>
          )}
          {totalScheduled > 0 && (
            <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {totalScheduled} Scheduled
            </span>
          )}
          {totalDraft > 0 && (
            <span className="inline-flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              {totalDraft} Saved to Library
            </span>
          )}
          {totalFailed > 0 && (
            <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {totalFailed} Failed
            </span>
          )}
        </div>

        {/* ITEMS LIST */}
        <div className="p-6 space-y-3.5 overflow-y-auto flex-1">
          {items.map((item, idx) => {
            const platformIcon = getPlatformIcon(item.platform);

            return (
              <div
                key={idx}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
              >
                {/* LEFT INFO */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="text-2xl shrink-0 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    {platformIcon}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white capitalize">
                        {item.platform}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 h-5">
                        {item.format}
                      </Badge>
                      {item.status === "PUBLISHED" && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold py-0 h-5">
                          ✓ Live on Platform
                        </Badge>
                      )}
                      {item.status === "SCHEDULED" && (
                        <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 text-[10px] font-bold py-0 h-5">
                          🕒 Scheduled
                        </Badge>
                      )}
                      {item.status === "DRAFT" && (
                        <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 text-[10px] font-bold py-0 h-5">
                          💾 Draft Saved
                        </Badge>
                      )}
                      {item.status === "FAILED" && (
                        <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 text-[10px] font-bold py-0 h-5">
                          ✕ Failed
                        </Badge>
                      )}
                    </div>

                    {item.title && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-sm">
                        {item.title}
                      </p>
                    )}

                    {item.status === "SCHEDULED" && item.scheduledFor && (
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 font-semibold">
                        <Clock className="h-3 w-3" />
                        {new Date(item.scheduledFor).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    )}

                    {item.status === "FAILED" && item.error && (
                      <p className="text-[11px] text-red-500 dark:text-red-400 flex items-center gap-1 font-medium break-all">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {item.error}
                      </p>
                    )}
                  </div>
                </div>

                {/* RIGHT ACTION BUTTONS */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {item.status === "PUBLISHED" && item.liveUrl && (
                    <div className="flex flex-col items-end gap-1">
                      <a
                        href={item.liveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                      >
                        <span>View Live Post</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {/* Stories are ephemeral (24h) and only viewable in the
                          story tray — the permalink mostly works on mobile/app. */}
                      {item.format.toLowerCase().includes("story") && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium max-w-[180px] text-right leading-tight">
                          Stories are visible for 24h in the story tray (best viewed in the mobile app)
                        </span>
                      )}
                    </div>
                  )}

                  {item.status === "SCHEDULED" && (
                    <Link
                      href="/dashboard/content"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <span>View Schedule</span>
                    </Link>
                  )}

                  {item.status === "DRAFT" && (
                    <Link
                      href="/dashboard/content"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold shadow-xs transition-colors"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>Content Library</span>
                    </Link>
                  )}

                  {item.status === "FAILED" && (
                    <Link
                      href="/dashboard/integrations"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-bold transition-colors"
                    >
                      <span>Check Connection</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/content"
              className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors"
            >
              <span>Go to Content Library</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="h-9 px-5 text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white rounded-xl shadow-xs"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
