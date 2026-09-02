"use client";

import React, { useMemo } from "react";
import { CalendarRange, FileText, Globe, Send, Share2, Sparkles, Users } from "lucide-react";
import type { GrowthStrategy, LeadChannel } from "@/lib/types/growth";
import { SubRail } from "./shared";
import type { ChannelSection, GoalHQData } from "./types";
import { PlanTab } from "./PlanTab";
import { TodayTab } from "./TodayTab";
import { HistoryTab } from "./HistoryTab";
import { LeadsTab } from "./LeadsTab";
import { SocialLineup } from "./SocialLineup";
import { WebsiteStatusCards } from "./WebsiteChannelCards";

/**
 * One of the two places a lead can come from: social posts, or the user's own
 * website. Both tabs have the same four sections in the same order — what the
 * plan is, what goes out today, what already went out, and what came back — so
 * learning one tab teaches the other.
 *
 * Everything below the rail is filtered to this channel. A number on the
 * Website tab is never a social number, which is the whole point of splitting
 * the page this way.
 */
export function ChannelTab({
  channel,
  enabled,
  data,
  strategy,
  onStrategy,
  section,
  onSection,
  onToast,
  onGoToTab,
  onRefresh,
}: {
  channel: LeadChannel;
  /** False when the user did not pick this channel as a lead source. */
  enabled: boolean;
  data: GoalHQData;
  strategy: GrowthStrategy | null;
  onStrategy: (next: GrowthStrategy | null) => void;
  section: ChannelSection;
  onSection: (next: ChannelSection) => void;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onGoToTab: (tab: string) => void;
  onRefresh: () => void;
}) {
  const isSocial = channel === "SOCIAL";

  const counts = useMemo(() => {
    const open = (strategy?.todayPlan || []).filter((t: any) => t.status !== "PUBLISHED");
    return {
      today: open.filter((t: any) => (t.channel === "WEBSITE") === !isSocial).length,
      published: data.history.filter((h) => h.channel === channel).length,
      leads: data.leads.filter((l) => l.channel === channel).length,
    };
  }, [strategy, data.history, data.leads, channel, isSocial]);

  const sections: {
    key: ChannelSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
    info: string;
  }[] = [
    {
      key: "plan",
      label: "Plan",
      icon: <CalendarRange className="w-3.5 h-3.5" />,
      info: isSocial
        ? "The maths behind the goal: how many posts a week it takes, how they are split across your accounts, and the topics they cover. Build it once and Autopilot follows it."
        : "The maths behind the article side: how many articles a week it takes, and which keywords the AI chose for your business.",
    },
    {
      key: "today",
      label: isSocial ? "Today" : "Articles",
      icon: isSocial ? <Send className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />,
      count: counts.today,
      info: isSocial
        ? "Today's posts. You can generate, edit, replace the image or publish any of them by hand — Autopilot does exactly the same thing on its own if you leave it alone."
        : "Today's articles. Each one is written with schema, meta title and description, then published straight to your site.",
    },
    {
      key: "published",
      label: "Published",
      icon: <Sparkles className="w-3.5 h-3.5" />,
      count: counts.published,
      info: "Everything that actually went out, kept permanently with its real live link and its click count. If a platform returned no link, it says so rather than sending you to a feed.",
    },
    {
      key: "leads",
      label: "Leads",
      icon: <Users className="w-3.5 h-3.5" />,
      count: counts.leads,
      info: isSocial
        ? "Leads credited to a social post. Clicks are counted automatically; a lead exists only once you or your website tag confirms it."
        : "Leads your website tag captured — a form submit, a WhatsApp tap, a mailto or a phone tap — each traced back to the article or post that sent the visitor.",
    },
  ];

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          {isSocial ? <Share2 className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
        </span>
        <p className="mt-3 text-sm font-bold text-foreground">
          {isSocial ? "Social media is not one of your lead sources" : "Your website is not one of your lead sources"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
          {isSocial
            ? "Nothing is planned, posted or counted here until you add social media on the Goal tab."
            : "Add your website on the Goal tab and the AI will pick trending keywords for your business and publish SEO articles to your own site as well."}
        </p>
        <button
          type="button"
          onClick={() => onGoToTab("goal")}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Choose lead sources
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isSocial ? (
        <SocialLineup data={data} onToast={onToast} onSaved={onRefresh} onGoToTab={onGoToTab} />
      ) : (
        <WebsiteStatusCards data={data} />
      )}

      <SubRail tabs={sections} active={section} onChange={onSection} />

      {section === "plan" && (
        <PlanTab
          channel={channel}
          data={data}
          strategy={strategy}
          onStrategy={onStrategy}
          onToast={onToast}
          onGoToTab={onGoToTab}
        />
      )}

      {section === "today" && (
        <TodayTab
          channel={channel}
          data={data}
          strategy={strategy}
          onToast={onToast}
          onGoToTab={onGoToTab}
          onRefresh={onRefresh}
        />
      )}

      {section === "published" && (
        <HistoryTab
          lockChannel={channel}
          data={data}
          onToast={onToast}
          onGoToTab={onGoToTab}
          onRefresh={onRefresh}
        />
      )}

      {section === "leads" && (
        <LeadsTab
          lockChannel={channel}
          data={data}
          onToast={onToast}
          onGoToTab={onGoToTab}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
