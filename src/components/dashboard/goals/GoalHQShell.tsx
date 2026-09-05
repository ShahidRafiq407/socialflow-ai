"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Globe,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Send,
  Settings2,
  Share2,
  Target,
  UserPlus,
  Zap,
} from "lucide-react";
import { goalLeadNoun, type GoalStatus, type GrowthStrategy } from "@/lib/types/growth";
import { Chip, InfoDot, StatTile, ToastStack, useToasts } from "./shared";
import { SectionExplainer } from "@/components/dashboard/SectionExplainer";
import type { ChannelSection, GoalHQData, GoalTabKey } from "./types";
import { GoalWizardTab } from "./GoalWizardTab";
import { ChannelTab } from "./ChannelTab";
import { AutopilotTab } from "./AutopilotTab";

/**
 * Lead Goal HQ shell — header, measured stat tiles, tab rail, toasts.
 *
 * Four tabs, in the order the work actually happens: set the target, then the
 * two places a lead can come from, then the switch that runs it every day. Each
 * channel tab shows only its own plan, posts, history and leads, so nothing on
 * screen belongs to a channel the user did not choose.
 *
 * The server page resolves everything once and hands it down; `refresh()`
 * re-runs that server render instead of every tab keeping its own copy of the
 * truth. The only client-held state that outlives a refresh is the freshly
 * built strategy, because the Plan section streams it in before it is saved.
 */

const STATUS_LABEL: Record<GoalStatus, { text: string; tone: "primary" | "secondary" | "muted" | "danger" }> = {
  GOAL_ACHIEVED: { text: "Goal reached", tone: "primary" },
  ON_TRACK: { text: "On track", tone: "primary" },
  NEEDS_OPTIMIZATION: { text: "Needs a push", tone: "secondary" },
  BEHIND_TARGET: { text: "Behind target", tone: "danger" },
  INSUFFICIENT_DATA: { text: "Not enough data yet", tone: "muted" },
};

const TABS: { key: GoalTabKey; label: string; icon: React.ReactNode; info: string }[] = [
  {
    key: "goal",
    label: "Goal",
    icon: <Target className="w-3.5 h-3.5" />,
    info: "How many leads you want, by when, and which of the two channels should earn them. Everything else on this page is built from this one answer.",
  },
  {
    key: "social",
    label: "Social media",
    icon: <Share2 className="w-3.5 h-3.5" />,
    info: "Leads from social posts: the accounts the AI recommends, today's posts, what already went out with its live link, and the leads that came back.",
  },
  {
    key: "website",
    label: "Website",
    icon: <Globe className="w-3.5 h-3.5" />,
    info: "Leads from your own site: the SEO articles the AI writes and publishes for you, and the leads your website tag captures.",
  },
  {
    key: "autopilot",
    label: "Autopilot",
    icon: <Zap className="w-3.5 h-3.5" />,
    info: "The daily switch and its limits: how many posts a day are allowed, how long a post waits before going live, and which accounts are paused.",
  },
];

/**
 * Deep links from the chat controller and older bookmarks used one tab per
 * section (`?view=plan`, `?view=history` …). They now resolve to a channel tab
 * plus the section inside it, so no existing link breaks. The bare names stay
 * pointed at the social side for compatibility; the `website-*` keys exist so a
 * child standing on the Website tab can send the user to its own section
 * instead of bouncing them across channels.
 */
const VIEW_ALIASES: Record<string, { tab: GoalTabKey; section?: ChannelSection }> = {
  setup: { tab: "goal" },
  target: { tab: "goal" },
  plan: { tab: "social", section: "plan" },
  strategy: { tab: "social", section: "plan" },
  roadmap: { tab: "social", section: "plan" },
  today: { tab: "social", section: "today" },
  tasks: { tab: "social", section: "today" },
  queue: { tab: "social", section: "today" },
  history: { tab: "social", section: "published" },
  published: { tab: "social", section: "published" },
  leads: { tab: "social", section: "leads" },
  articles: { tab: "website", section: "today" },
  seo: { tab: "website", section: "plan" },
  "website-plan": { tab: "website", section: "plan" },
  "website-today": { tab: "website", section: "today" },
  "website-published": { tab: "website", section: "published" },
  "website-leads": { tab: "website", section: "leads" },
  automation: { tab: "autopilot" },
};

function resolveGoalView(raw: string | null): { tab: GoalTabKey; section?: ChannelSection } | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  const direct = TABS.find((t) => t.key === value);
  if (direct) return { tab: direct.key };
  return VIEW_ALIASES[value] || null;
}

export function GoalHQShell({ data }: { data: GoalHQData }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  const { goal, kpis, metrics } = data;
  const sources: string[] = Array.isArray(goal?.leadSources) ? goal.leadSources : ["SOCIAL"];
  const usesSocial = sources.includes("SOCIAL");
  const usesWebsite = sources.includes("WEBSITE");

  const [tab, setTab] = useState<GoalTabKey>(
    data.needsSetup ? "goal" : usesSocial ? "social" : "website"
  );
  const [section, setSection] = useState<ChannelSection>("today");
  const [strategy, setStrategy] = useState<GrowthStrategy | null>(data.strategy);
  const [refreshing, startRefresh] = useTransition();

  // A ?view= link opens straight on that tab (and section), then the param is
  // consumed so a later refresh does not drag the user back off the tab they
  // moved to themselves.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const target = resolveGoalView(params.get("view"));
    if (!target) return;

    setTab(target.tab);
    if (target.section) setSection(target.section);

    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState({}, "", url.pathname + (url.search || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    startRefresh(() => {
      router.refresh();
    });
  };

  /**
   * One navigation entry point for every child. Children still ask for "plan",
   * "today", "history" or "leads" by name; the alias table turns those into the
   * right tab plus section.
   */
  const goToTab = (next: string) => {
    const resolved = resolveGoalView(next);
    if (!resolved) return;
    setTab(resolved.tab);
    if (resolved.section) setSection(resolved.section);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const status = STATUS_LABEL[kpis.status] || STATUS_LABEL.INSUFFICIENT_DATA;
  const autopilotOn = Boolean(goal) && goal?.autopilotMode === "AUTOPILOT" && !goal?.isAutopilotPaused;
  const progress = Math.max(0, Math.min(100, Math.round(kpis.progressPercentage || 0)));
  const published = (kpis.postsPublished || 0) + (kpis.articlesPublished || 0);

  // The single most important thing left to do, in the order it must happen:
  // describe the brand, set the goal, connect each chosen channel, give posts a
  // link, build the plan, then switch Autopilot on. Only the first unmet step is
  // surfaced, so the user is handed the next move, never a checklist to triage.
  const nextStep = ((): {
    title: string;
    detail: string;
    cta: string;
    tone: "primary" | "secondary";
    href?: string;
    onClick?: () => void;
  } | null => {
    if (!data.hasBrandDNA)
      return {
        title: "Describe your brand first",
        detail: "The AI needs your business name, industry and audience before it writes anything about you.",
        cta: "Set up Brand DNA",
        href: "/dashboard/brand",
        tone: "secondary",
      };
    if (data.needsSetup || !goal)
      return {
        title: "Set your lead goal",
        detail: "How many leads you want, and by when. Everything on this page is built from that one answer.",
        cta: "Set the goal",
        onClick: () => goToTab("goal"),
        tone: "primary",
      };
    if (usesSocial && data.connectedPlatforms.length === 0)
      return {
        title: "Connect a social account",
        detail: "Autopilot can only post where you have a connected account — nothing is planned or counted until then.",
        cta: "Connect an account",
        href: "/dashboard/integrations",
        tone: "primary",
      };
    if (usesWebsite && !data.wordpress.connected)
      return {
        title: "Connect your website",
        detail: "The AI needs your site connected before it can publish an article to it.",
        cta: "Connect your site",
        href: "/dashboard/plugins?connector=wordpress",
        tone: "secondary",
      };
    if (usesWebsite && !data.tracking.installed)
      return {
        title: "Install your lead tag",
        detail: "Without the one-line tag, a form submit or WhatsApp tap on your site cannot be counted.",
        cta: "Install the tag",
        href: "/dashboard/plugins?connector=website-tag",
        tone: "secondary",
      };
    if (usesSocial && !goal?.ctaDestinations?.default && !data.website)
      return {
        title: "Add a link for your posts",
        detail: "A post needs a link before a click can become a lead you can trace.",
        cta: "Add the link",
        onClick: () => goToTab("goal"),
        tone: "primary",
      };
    if (!strategy)
      return {
        title: "Build your plan",
        detail: "Turn the goal into a daily posting plan the AI can run on its own.",
        cta: "Build the plan",
        onClick: () => goToTab(usesSocial ? "plan" : "seo"),
        tone: "primary",
      };
    if (!autopilotOn)
      return {
        title: "Turn on Autopilot",
        detail: "Let the plan publish every day by itself — you can pause any account any time.",
        cta: "Open Autopilot",
        onClick: () => goToTab("autopilot"),
        tone: "primary",
      };
    return null;
  })();

  // Counts on the rail are per channel, so "3" on Social media means three
  // social posts still to go out today — not three of something unspecified.
  const { pendingSocial, pendingWebsite } = useMemo(() => {
    const todayPlan: any[] = strategy?.todayPlan || [];
    const open = todayPlan.filter((t) => t.status !== "PUBLISHED");
    return {
      pendingSocial: open.filter((t) => t.channel !== "WEBSITE").length,
      pendingWebsite: open.filter((t) => t.channel === "WEBSITE").length,
    };
  }, [strategy]);

  const counts: Partial<Record<GoalTabKey, number>> = {
    social: pendingSocial || undefined,
    website: pendingWebsite || undefined,
  };

  const sourceSentence = usesWebsite && usesSocial
    ? "from social posts and your website"
    : usesWebsite
      ? "from your website"
      : "from social posts";

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SectionExplainer
                title="Lead Goal"
                explanation="Set your target lead numbers and timeframe. Postloom calculates the daily posting pace required, produces the creative, and measures verified clicks and confirmed leads."
                tip="Turn on Autopilot to automatically generate and publish posts adhering to your goal velocity."
                badge="Strategy HQ"
                headingClassName="text-xl font-bold text-foreground sm:text-2xl"
              />
              {goal && (
                <Chip tone={autopilotOn ? "primary" : "muted"}>
                  {autopilotOn ? "Autopilot on" : "Manual"}
                </Chip>
              )}
              {goal && <Chip tone={status.tone}>{status.text}</Chip>}
            </div>

            {goal ? (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">
                  {goal.leadTarget} {goalLeadNoun(goal.leadType, goal.customLeadTypeName, goal.leadTarget === 1 ? 1 : 2)}
                </span>{" "}
                in {goal.timeframeDays} day{goal.timeframeDays === 1 ? "" : "s"}
                {data.workspaceName ? ` for ${data.workspaceName}` : ""} — {sourceSentence}.
              </p>
            ) : (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                Set a target on the Goal tab. Nothing is written, posted or counted until you do.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              title="Re-read the numbers from the database"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
            {goal && (
              <button
                type="button"
                onClick={() => goToTab("goal")}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Edit goal
              </button>
            )}
          </div>
        </div>

        {goal && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                {kpis.achievedLeads} of {kpis.targetLeads} confirmed
                <InfoDot text="Only leads that exist as a record count here: one you confirmed on a published post, or one your website tag captured. Nothing is estimated into this number." />
              </span>
              <span className="text-muted-foreground">
                {kpis.daysLeft > 0 ? `${kpis.daysLeft} days left` : "Window closed"} · {progress}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            {kpis.statusReason && (
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{kpis.statusReason}</p>
            )}
          </div>
        )}
      </section>

      {/* ── Do this next: the one step that matters right now ── */}
      {nextStep && (
        <div
          className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 ${
            nextStep.tone === "primary"
              ? "border-primary/30 bg-primary/5"
              : "border-secondary/30 bg-secondary/5"
          }`}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                nextStep.tone === "primary"
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary/15 text-secondary"
              }`}
            >
              <ArrowRight className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Do this next
              </span>
              <p className="text-sm font-bold text-foreground">{nextStep.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{nextStep.detail}</p>
            </div>
          </div>
          {nextStep.href ? (
            <a
              href={nextStep.href}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ${
                nextStep.tone === "primary"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
              }`}
            >
              {nextStep.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          ) : (
            <button
              type="button"
              onClick={nextStep.onClick}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ${
                nextStep.tone === "primary"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
              }`}
            >
              {nextStep.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ── How this works — onboarding, shown only before a goal exists ── */}
      {data.needsSetup && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="text-[10px] font-bold uppercase tracking-wide text-foreground">How this works</span>
          <span className="font-semibold text-foreground">1. Set the target</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="font-semibold text-foreground">2. The AI picks the channels and writes the posts</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="font-semibold text-foreground">3. It publishes daily and counts the clicks and leads</span>
          <InfoDot
            align="right"
            text="You only fill in step 1. Step 2 happens on the Social media and Website tabs, where the AI proposes where to post and what to say. Step 3 runs by itself once Autopilot is on — every post keeps a tracked link, so the clicks and leads on this page are counted, not guessed."
          />
        </div>
      )}

      {/* ── Measured stat tiles ── */}
      {goal && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Leads confirmed"
            value={kpis.achievedLeads}
            hint={`${kpis.socialLeads || 0} from social · ${kpis.websiteLeads || 0} from your website`}
            icon={<UserPlus className="h-4 w-4" />}
            info="Every lead here is a saved record — one you confirmed yourself on a post, or one your website tag captured when somebody submitted a form or tapped WhatsApp. Click to open the list."
            onClick={() => goToTab(usesSocial ? "leads" : "website")}
          />
          <StatTile
            label="Clicks measured"
            value={metrics.clicks}
            hint={`${metrics.uniqueClicks} unique · counted from real redirects`}
            icon={<MousePointerClick className="h-4 w-4" />}
            accent="secondary"
            info="Every AI post carries a short link that passes through this app before reaching your page. That redirect is what gets counted, so this is a real number rather than a platform estimate."
            onClick={() => goToTab("published")}
          />
          <StatTile
            label="Published"
            value={published}
            hint={
              kpis.publishFailures
                ? `${kpis.publishFailures} failed — retry them under Published`
                : `${kpis.postsPublished || 0} posts · ${kpis.articlesPublished || 0} articles`
            }
            icon={<Send className="h-4 w-4" />}
            info="Posts and articles that reached the platform, each kept permanently with its live link so you can open the real post any time."
            onClick={() => goToTab("published")}
          />
          <StatTile
            label="Pace needed"
            value={`${(kpis.requiredPace || 0).toFixed(1)}/day`}
            hint={`You are at ${(kpis.currentPace || 0).toFixed(1)}/day · ${status.text.toLowerCase()}`}
            icon={<CalendarClock className="h-4 w-4" />}
            accent="secondary"
            info="Leads per day still needed to finish the goal inside the window, next to the rate you are actually running at. If the first number is far above the second, the target is too high for the time left."
          />
        </div>
      )}

      {/* ── Tab rail ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          // A channel the user did not pick still opens — it explains itself and
          // offers to switch on — but it is dimmed so the rail matches the goal.
          const muted =
            (t.key === "social" && !usesSocial) || (t.key === "website" && !usesWebsite);
          return (
            <span key={t.key} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : `border border-border hover:bg-muted hover:text-foreground ${
                        muted ? "text-muted-foreground/60" : "text-muted-foreground"
                      }`
                }`}
              >
                {t.icon}
                {t.label}
                {count !== undefined && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? "bg-black/15" : "bg-muted text-foreground"
                    }`}
                    title={`${count} still to publish today`}
                  >
                    {count}
                  </span>
                )}
                {t.key === "autopilot" && (
                  <span
                    className={`ml-0.5 h-1.5 w-1.5 rounded-full ${
                      autopilotOn ? (active ? "bg-primary-foreground" : "bg-primary") : "bg-muted-foreground/40"
                    }`}
                    title={autopilotOn ? "Autopilot is running" : "Autopilot is off"}
                  />
                )}
              </button>
              <InfoDot text={t.info} />
            </span>
          );
        })}
        {data.needsSetup && <Chip tone="secondary">Start on the Goal tab</Chip>}
      </div>

      {/* ── Panels ── */}
      {tab === "goal" && (
        <GoalWizardTab data={data} onSaved={refresh} onToast={push} onGoToTab={goToTab} />
      )}

      {(tab === "social" || tab === "website") &&
        (data.needsSetup ? (
          <NeedsGoal onGoToTab={goToTab} />
        ) : (
          <ChannelTab
            key={tab}
            channel={tab === "social" ? "SOCIAL" : "WEBSITE"}
            enabled={tab === "social" ? usesSocial : usesWebsite}
            data={data}
            strategy={strategy}
            onStrategy={setStrategy}
            section={section}
            onSection={setSection}
            onToast={push}
            onGoToTab={goToTab}
            onRefresh={refresh}
          />
        ))}

      {tab === "autopilot" &&
        (data.needsSetup ? (
          <NeedsGoal onGoToTab={goToTab} />
        ) : (
          <AutopilotTab data={data} onToast={push} onGoToTab={goToTab} onRefresh={refresh} />
        ))}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/** Shown on every tab but Goal while no target exists — there is nothing to run yet. */
function NeedsGoal({ onGoToTab }: { onGoToTab: (tab: string) => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Target className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-bold text-foreground">No goal saved yet</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
        Everything on this page is built from your target, so there is nothing to show until you set
        one. It takes two numbers: how many leads, and by when.
      </p>
      <button
        type="button"
        onClick={() => onGoToTab("goal")}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <Target className="h-4 w-4" />
        Set the goal
      </button>
    </div>
  );
}
