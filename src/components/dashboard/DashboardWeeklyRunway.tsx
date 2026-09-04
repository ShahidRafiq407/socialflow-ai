"use client";

import React from "react";
import Link from "next/link";
import { WeeklyCalendarDay } from "@/actions/dashboard";
import { Calendar, Plus, Clock } from "lucide-react";

interface DashboardWeeklyRunwayProps {
  days: WeeklyCalendarDay[];
}

const PLATFORM_STYLES: Record<string, { dot: string; label: string }> = {
  INSTAGRAM: { dot: "bg-pink-500", label: "IG" },
  LINKEDIN: { dot: "bg-blue-600", label: "LI" },
  FACEBOOK: { dot: "bg-blue-500", label: "FB" },
  YOUTUBE: { dot: "bg-red-600", label: "YT" },
  TIKTOK: { dot: "bg-slate-800 dark:bg-slate-300", label: "TT" },
  PINTEREST: { dot: "bg-red-500", label: "PIN" },
};

function formatSlotTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function DashboardWeeklyRunway({ days }: DashboardWeeklyRunwayProps) {
  const totalScheduled = days.reduce((sum, d) => sum + d.posts.length, 0);

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3 mb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Calendar className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Weekly Runway
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground border">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold tabular-nums">{totalScheduled}</span> posts queued
          </span>
          <Link
            href="/dashboard/content"
            className="text-xs font-medium text-primary hover:underline ml-1"
          >
            Calendar view →
          </Link>
        </div>
      </div>

      {/* 7-Day Matrix Columns */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const hasPosts = day.posts.length > 0;
          return (
            <div
              key={day.date}
              className={`flex flex-col rounded-lg border p-2.5 transition-colors ${
                day.isToday
                  ? "border-primary/50 bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/30"
                  : "bg-muted/30 hover:bg-muted/50"
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between border-b pb-1.5 mb-2">
                <span
                  className={`text-xs font-semibold ${
                    day.isToday ? "text-primary" : "text-foreground"
                  }`}
                >
                  {day.isToday ? "Today" : day.dayName}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {day.dayNumber}
                </span>
              </div>

              {/* Scheduled Posts on this day */}
              <div className="flex-1 space-y-1.5 min-h-[70px]">
                {hasPosts ? (
                  day.posts.map((p) => {
                    const style =
                      PLATFORM_STYLES[p.platform.toUpperCase()] || {
                        dot: "bg-slate-400",
                        label: p.platform.slice(0, 2).toUpperCase(),
                      };
                    return (
                      <Link
                        key={p.id}
                        href="/dashboard/content"
                        title={`${p.platform} (${p.format || "Post"}): ${p.content || ""}`}
                        className="group flex items-center gap-1.5 rounded-md bg-background p-1.5 text-[11px] shadow-2xs border transition-transform hover:-translate-y-0.5 hover:border-primary/40"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                        <span className="font-semibold text-[10px] text-foreground shrink-0">
                          {style.label}
                        </span>
                        {p.scheduledFor && (
                          <span className="truncate text-[9px] tabular-nums text-muted-foreground ml-auto">
                            {formatSlotTime(p.scheduledFor)}
                          </span>
                        )}
                      </Link>
                    );
                  })
                ) : (
                  <div className="flex h-full flex-col items-center justify-center py-2 text-center">
                    <span className="text-[10px] text-muted-foreground/60">No queue</span>
                  </div>
                )}
              </div>

              {/* Add slot CTA */}
              <Link
                href="/dashboard/ai-studio"
                className="mt-2 flex items-center justify-center gap-1 rounded border border-dashed py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-background hover:text-foreground"
              >
                <Plus className="h-2.5 w-2.5" />
                <span>Slot</span>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
