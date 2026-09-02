"use client";

import React, { useMemo } from "react";
import { ArrowRight, CalendarRange, Check, FileText, Globe, Send, Share2, Sparkles, Users } from "lucide-react";
import type { GrowthStrategy, LeadChannel } from "@/lib/types/growth";
import { InfoDot, SubRail } from "./shared";
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

  // A channel the user chose still cannot do anything until its must-haves
  // exist: a connected account for social, or a connected site plus the lead tag
  // for website. Until then the Plan/Today/Published/Leads sections stay hidden
  // behind a short checklist, so there is never a button that leads nowhere.
  const ready = isSocial
    ? data.connectedPlatforms.length > 0
    : data.wordpress.connected && data.tracking.installed;

  if (!ready) {
    const items = isSocial
      ? [
          {
            label: "Connect at least one social account",
            done: data.connectedPlatforms.length > 0,
            why: "Autopilot can only post where you have a connected account, so nothing can be planned or counted yet.",
            href: "/dashboard/integrations",
            cta: "Connect an account",
            info: "Accounts are linked once in Integrations. This tab reads that connection — it never asks for a password itself.",
          },
        ]
      : [
          {
            label: "Connect your website",
            done: data.wordpress.connected,
            why: "The AI needs your site connected before it can publish an article to it.",
            href: "/dashboard/plugins?connector=wordpress",
            cta: "Connect site",
            info: "Your site is linked once in Plugins. Articles are then published straight to it with schema and meta tags.",
          },
          {
            label: "Install your lead tag",
            done: data.tracking.installed,
            why: "Without the one-line tag, a form submit or WhatsApp tap on your site cannot be counted, so website leads stay at zero.",
            href: "/dashboard/plugins?connector=website-tag",
            cta: "Install the tag",
            info: "One line of JavaScript from Plugins. It fires only on a real lead action and credits it to the post that sent the visitor.",
          },
        ];
    return <ChannelSetupGate channel={channel} items={items} />;
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

/**
 * The hard gate for a chosen-but-not-ready channel. It lists the must-haves as a
 * short numbered checklist — the ones already done tick green, the rest link
 * straight to the one place they are set — and shows nothing else until every
 * item is met. This is what keeps a half-set-up channel from showing plans and
 * numbers that could never be real.
 */
function ChannelSetupGate({
  channel,
  items,
}: {
  channel: LeadChannel;
  items: { label: string; done: boolean; why: string; href: string; cta: string; info: string }[];
}) {
  const isSocial = channel === "SOCIAL";
  const doneCount = items.filter((i) => i.done).length;
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {isSocial ? <Share2 className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
            Finish setup to unlock {isSocial ? "social media" : "your website"}
            <InfoDot
              align="left"
              text={
                isSocial
                  ? "Everything on this tab — the plan, today's posts, the history and the leads — runs on a connected account. Connect one and it all switches on."
                  : "The AI publishes SEO articles to your own site and counts the leads your tag captures. Both are connected once, in Plugins, then this tab runs itself."
              }
            />
          </h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {isSocial
              ? "Autopilot can only post where you have a connected account. Do the step below and this tab builds the plan and starts publishing on its own."
              : "This channel writes SEO articles to your own site and counts the leads it captures. Finish the steps below and it starts working on its own."}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {doneCount}/{items.length} done
        </span>
      </div>

      <ol className="mt-4 space-y-2">
        {items.map((it, i) => (
          <li
            key={it.label}
            className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
              it.done ? "border-primary/30 bg-primary/5" : "border-border bg-background"
            }`}
          >
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                it.done ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              {it.done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {it.label}
                <InfoDot text={it.info} />
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {it.done ? "Done." : it.why}
              </p>
            </div>
            {it.done ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary">
                <Check className="h-3.5 w-3.5" /> Ready
              </span>
            ) : (
              <a
                href={it.href}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {it.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
