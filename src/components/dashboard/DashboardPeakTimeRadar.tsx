"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { DashboardPeakTime } from "@/actions/dashboard";
import { useAIStudioSessionStore } from "@/lib/stores/aiStudioSession";
import { Button } from "@/components/ui/button";
import { Clock, Compass, Sparkles } from "lucide-react";

interface DashboardPeakTimeRadarProps {
  peakTimes: DashboardPeakTime[];
  connectedPlatforms: { platform: string; isConnected: boolean }[];
}

const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: "#e1306c",
  LINKEDIN: "#0077b5",
  FACEBOOK: "#1877f2",
  YOUTUBE: "#ff0000",
  TIKTOK: "#fe2c55",
  PINTEREST: "#e60023",
};

export function DashboardPeakTimeRadar({
  peakTimes,
  connectedPlatforms,
}: DashboardPeakTimeRadarProps) {
  const router = useRouter();
  const connectedSet = new Set(
    connectedPlatforms.filter((c) => c.isConnected).map((c) => c.platform.toUpperCase())
  );

  const handleScheduleForPlatform = (platformId: string) => {
    try {
      const store = useAIStudioSessionStore.getState();
      store.setSelectedPlatforms([platformId.toLowerCase()]);
      router.push("/dashboard/ai-studio");
    } catch {}
  };

  // Sort connected first
  const sorted = [...peakTimes].sort((a, b) => {
    const aConn = connectedSet.has(a.platform.toUpperCase()) ? 1 : 0;
    const bConn = connectedSet.has(b.platform.toUpperCase()) ? 1 : 0;
    return bConn - aConn;
  });

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between border-b pb-3 mb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Compass className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Audience Peak Time Radar
            </h3>
            <p className="text-[11px] text-muted-foreground">
              AI-calculated optimal posting windows for maximum organic reach
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {sorted.map((item) => {
          const isConnected = connectedSet.has(item.platform.toUpperCase());
          const color = PLATFORM_COLORS[item.platform.toUpperCase()] || "#64748b";

          return (
            <div
              key={item.platform}
              className={`flex flex-col justify-between rounded-lg border p-3 transition-colors ${
                isConnected ? "bg-muted/30 hover:bg-muted/50" : "bg-muted/10 opacity-75"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-semibold text-foreground">
                      {item.platform.charAt(0) + item.platform.slice(1).toLowerCase()}
                    </span>
                  </div>
                  {item.isPeakToday ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <Clock className="h-2.5 w-2.5" />
                      Peak Today
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Upcoming</span>
                  )}
                </div>

                <div className="mt-2">
                  <span className="text-base font-bold tracking-tight text-foreground">
                    {item.label}
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {item.reason}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {isConnected ? "Channel active" : "Not connected"}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleScheduleForPlatform(item.platform)}
                  className="h-6 gap-1 text-[11px] hover:text-primary p-1"
                >
                  <Sparkles className="h-3 w-3" />
                  Schedule
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
