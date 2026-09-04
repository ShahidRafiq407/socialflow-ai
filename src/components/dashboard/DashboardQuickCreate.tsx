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
  ArrowRight,
  Check,
} from "lucide-react";

interface DashboardQuickCreateProps {
  workspaceIndustry?: string;
  brandTone?: string | null;
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#e1306c" },
  { id: "linkedin", label: "LinkedIn", color: "#0077b5" },
  { id: "facebook", label: "Facebook", color: "#1877f2" },
  { id: "x", label: "X (Twitter)", color: "#000000" },
  { id: "tiktok", label: "TikTok", color: "#fe2c55" },
  { id: "youtube", label: "YouTube", color: "#ff0000" },
  { id: "pinterest", label: "Pinterest", color: "#e60023" },
];

export function DashboardQuickCreate({
  workspaceIndustry,
  brandTone,
}: DashboardQuickCreateProps) {
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
    <div className="relative overflow-hidden rounded-xl border bg-gradient-to-b from-card via-card to-muted/20 p-4 sm:p-6 shadow-xs">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                AI Command Center
              </h2>
              {brandTone && (
                <span className="hidden sm:inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border">
                  Voice: {brandTone}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Draft or schedule a multi-agent campaign across your social networks with Gemini 3
            </p>
          </div>
        </div>

        {/* Instant Prompt Bar */}
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
              placeholder={`e.g. Announce 20% discount on summer collection for ${
                workspaceIndustry || "our customers"
              }...`}
              className="h-11 bg-background text-sm pl-3 pr-10 shadow-inner"
            />
            {topic && (
              <button
                type="button"
                onClick={() => setTopic("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
          <Button
            onClick={() => handleLaunchCampaign()}
            disabled={!topic.trim() || isSubmitting}
            className="h-11 gap-2 px-5 font-medium shadow-xs"
          >
            <Sparkles className="h-4 w-4" />
            Launch AI Campaign
          </Button>
        </div>

        {/* Platform Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">
            Target channels:
          </span>
          {PLATFORMS.map((plat) => {
            const isSelected = selectedPlatforms.includes(plat.id);
            return (
              <button
                key={plat.id}
                type="button"
                onClick={() => togglePlatform(plat.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted opacity-70"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: plat.color }}
                />
                {plat.label}
                {isSelected && <Check className="h-3 w-3 text-primary" />}
              </button>
            );
          })}
        </div>

        {/* 4 Quick Fast Action Tiles */}
        <div className="grid grid-cols-2 gap-2.5 pt-2 sm:grid-cols-4">
          {/* 7-Platform Blitz */}
          <button
            type="button"
            onClick={handleAllPlatformsBlitz}
            className="group flex flex-col rounded-lg border bg-card/60 p-3 text-left transition-all hover:bg-accent hover:border-primary/40 hover:shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Zap className="h-3.5 w-3.5" />
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-2 text-xs font-semibold text-foreground">
              7-Platform Blitz
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Generate for all channels at once
            </p>
          </button>

          {/* Trend Jacking */}
          <Link
            href="/dashboard/ai-studio"
            className="group flex flex-col rounded-lg border bg-card/60 p-3 text-left transition-all hover:bg-accent hover:border-primary/40 hover:shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/10 text-red-600 dark:text-red-400">
                <Flame className="h-3.5 w-3.5" />
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-2 text-xs font-semibold text-foreground">
              Trend Jacking
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Viral posts from breaking news
            </p>
          </Link>

          {/* Longform SEO Article */}
          <Link
            href="/dashboard/article-writer"
            className="group flex flex-col rounded-lg border bg-card/60 p-3 text-left transition-all hover:bg-accent hover:border-primary/40 hover:shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-2 text-xs font-semibold text-foreground">
              SEO Article Writer
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Deep research 2,000+ word blog
            </p>
          </Link>

          {/* AI Strategy Copilot */}
          <Link
            href="/dashboard/chat"
            className="group flex flex-col rounded-lg border bg-card/60 p-3 text-left transition-all hover:bg-accent hover:border-primary/40 hover:shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-2 text-xs font-semibold text-foreground">
              Strategy Copilot
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Chat about marketing tactics
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
