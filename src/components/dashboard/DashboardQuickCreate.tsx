"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAIStudioSessionStore } from "@/lib/stores/aiStudioSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Zap,
  Flame,
  FileText,
  Bot,
  Check,
} from "lucide-react";

interface DashboardQuickCreateProps {
  workspaceIndustry?: string;
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#e1306c" },
  { id: "linkedin", label: "LinkedIn", color: "#0077b5" },
  { id: "facebook", label: "Facebook", color: "#1877f2" },
  { id: "tiktok", label: "TikTok", color: "#fe2c55" },
  { id: "youtube", label: "YouTube", color: "#ff0000" },
  { id: "pinterest", label: "Pinterest", color: "#e60023" },
];

export function DashboardQuickCreate({ workspaceIndustry }: DashboardQuickCreateProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "instagram",
    "linkedin",
    "facebook",
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((p) => p !== id)
          : prev
        : [...prev, id]
    );
  };

  const handleLaunchCampaign = (customTopic?: string) => {
    const finalTopic = (customTopic || topic).trim();
    if (!finalTopic) return;

    setIsSubmitting(true);
    try {
      const store = useAIStudioSessionStore.getState();
      store.setCampaignTopic(finalTopic);
      if (selectedPlatforms.length > 0) {
        store.setSelectedPlatforms(selectedPlatforms);
      }
      router.push("/dashboard/ai-studio");
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleAllPlatformsBlitz = () => {
    try {
      const store = useAIStudioSessionStore.getState();
      store.setSelectedPlatforms(PLATFORMS.map((p) => p.id));
      if (topic.trim()) {
        store.setCampaignTopic(topic.trim());
      }
      router.push("/dashboard/ai-studio");
    } catch {}
  };

  return (
    <div className="rounded-xl border bg-card p-3.5 sm:p-4 shadow-xs">
      <div className="flex flex-col gap-3">
        {/* Input & Action */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && topic.trim()) {
                  e.preventDefault();
                  handleLaunchCampaign();
                }
              }}
              placeholder={`What do you want to publish? e.g. Special announcement for ${
                workspaceIndustry || "our audience"
              }...`}
              className="h-10 bg-muted/40 text-sm pl-3 pr-8 focus:bg-background"
            />
            {topic && (
              <button
                type="button"
                onClick={() => setTopic("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          <Button
            onClick={() => handleLaunchCampaign()}
            disabled={!topic.trim() || isSubmitting}
            size="sm"
            className="h-10 gap-1.5 px-4 font-medium shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Create Post
          </Button>
        </div>

        {/* 6 Platform Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground mr-1">Channels:</span>
          {PLATFORMS.map((plat) => {
            const isSelected = selectedPlatforms.includes(plat.id);
            return (
              <button
                key={plat.id}
                type="button"
                onClick={() => togglePlatform(plat.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-primary/10 text-foreground ring-1 ring-primary/25"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted opacity-75"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: plat.color }}
                />
                {plat.label}
                {isSelected && <Check className="h-2.5 w-2.5 text-primary" />}
              </button>
            );
          })}
        </div>

        {/* 4 Compact Shortcuts */}
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <button
            type="button"
            onClick={handleAllPlatformsBlitz}
            className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">6-Channel Blitz</p>
            </div>
          </button>

          <Link
            href="/dashboard/ai-studio"
            className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">Trend Jacking</p>
            </div>
          </Link>

          <Link
            href="/dashboard/article-writer"
            className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">SEO Article</p>
            </div>
          </Link>

          <Link
            href="/dashboard/chat"
            className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <Bot className="h-3.5 w-3.5 text-purple-500 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">Marketing Copilot</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
