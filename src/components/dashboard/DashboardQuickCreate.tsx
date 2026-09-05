"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAIStudioSessionStore } from "@/lib/stores/aiStudioSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";

interface DashboardQuickCreateProps {
  workspaceIndustry?: string;
}

export function DashboardQuickCreate({ workspaceIndustry }: DashboardQuickCreateProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLaunchCampaign = () => {
    const finalTopic = topic.trim();
    if (!finalTopic) return;

    setIsSubmitting(true);
    try {
      const store = useAIStudioSessionStore.getState();
      store.setCampaignTopic(finalTopic);
      router.push("/dashboard/ai-studio");
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-3.5 shadow-xs">
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
            placeholder={
              workspaceIndustry
                ? `Ask AI to draft a post for ${workspaceIndustry}...`
                : "Ask AI to draft a post, campaign, or update..."
            }
            title="Type a topic or campaign idea, then press Enter to generate with AI"
            className="h-10 bg-muted/40 text-sm pl-3 pr-8 focus:bg-background"
          />
          {topic && (
            <button
              type="button"
              onClick={() => setTopic("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Clear topic"
            >
              ✕
            </button>
          )}
        </div>

        <Button
          onClick={handleLaunchCampaign}
          disabled={!topic.trim() || isSubmitting}
          size="sm"
          title="Open AI Studio with this topic"
          className="h-10 gap-1.5 px-4 font-medium shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Create Post
        </Button>
      </div>
    </div>
  );
}
