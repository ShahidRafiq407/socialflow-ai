"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  History,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import type { GoalStatus, GrowthStrategy } from "@/lib/types/growth";
import { Chip, StatTile, ToastStack, useToasts } from "./shared";
import type { GoalHQData, GoalTabKey } from "./types";
import { GoalWizardTab } from "./GoalWizardTab";
import { PlanTab } from "./PlanTab";
import { TodayTab } from "./TodayTab";
import { HistoryTab } from "./HistoryTab";
import { LeadsTab } from "./LeadsTab";
import { AutopilotTab } from "./AutopilotTab";

/**
 * Lead Goal HQ shell — header, measured stat tiles, tab rail, toasts.
 *
 * The server page resolves everything once and hands it down; `onRefresh`
 * re-runs that server render instead of each tab keeping its own copy of the
 * truth. The only client-held state that outlives a refresh is the freshly
 * built strategy, because the Plan tab streams it in before it is persisted.
 */

const STATUS_LABEL: Record<GoalStatus, { text: string; tone: "primary" | "secondary" | "muted" | "danger" }> = {
  GOAL_ACHIEVED: { text: "Goal reached", tone: "primary" },
  ON_TRACK: { text: "On track", tone: "primary" },
  NEEDS_OPTIMIZATION: { text: "Needs a push", tone: "secondary" },
  BEHIND_TARGET: { text: "Behind target", tone: "danger" },
  INSUFFICIENT_DATA: { text: "Not enough data yet", tone: "muted" },
};

const TABS: { key: GoalTabKey; label: string; icon: React.ReactNode }[] = [
  { key: "goal", label: "Goal", icon: <Target className="w-3.5 h-3.5" /> },
  { key: "plan", label: "Plan", icon: <Sparkles className="w-3.5 h-3.5" /> },
  { key: "today", label: "Today", icon: <Send className="w-3.5 h-3.5" /> },
  { key: "history", label: "History", icon: <History className="w-3.5 h-3.5" /> },
  { key: "leads", label: "Leads", icon: <Users className="w-3.5 h-3.5" /> },
  { key: "autopilot", label: "Autopilot", icon: <Zap className="w-3.5 h-3.5" /> },
];

export function GoalHQShell({ data }: { data: GoalHQData }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  const [tab, setTab] = useState<GoalTabKey>(data.needsSetup ? "goal" : "today");
  const [strategy, setStrategy] = useState<GrowthStrategy | null>(data.strategy);
  const [refreshing, startRefresh] = useTransition();

  const refresh = () => {
    startRefresh(() => {
      router.refresh();
    });
  };

  const goToTab = (next: string) => {
    setTab(next as GoalTabKey);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const { goal, kpis, metrics } = data;
  const status = STATUS_LABEL[kpis.status] || STATUS_LABEL.INSUFFICIENT_DATA;

  const pendingToday = useMemo(
    () => (strategy?.todayPlan || []).filter((t) => t.status !== "PUBLISHED").length,
    [strategy]
  );

  const published = (kpis.postsPublished || 0) + (kpis.articlesPublished || 0);
  const autopilotOn = Boolean(goal) && goal?.autopilotMode === "AUTOPILOT" && !goal?.isAutopilotPaused;

  const counts: Partial<Record<GoalTabKey, React.ReactNode>> = {
    today: pendingToday > 0 ? pendingToday : undefined,
    history: data.history.length > 0 ? data.history.length : undefined,
    leads: data.leads.length > 0 ? data.leads.length : undefined,
  };

  const progress = Math.max(0, Math.min(100, Math.round(kpis.progressPercentage || 0)));

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <section className="rounded-2xl bg-gradient-to-r from-primary to-secondary p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold sm:text-2xl">Lead Goal HQ</h1>
              {goal && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                  {autopilotOn ? <Zap className="h-3 w-3" /> : null}
                  {autopilotOn ? "Autopilot on" : "Manual"}
                </span>
              )}
            </div>

            {goal ? (
              <p className="mt-1.5 max-w-2xl text-sm text-white/85 leading-relaxed">
                {goal.leadTarget} {String(goal.leadType || "leads").toLowerCase().replace(/_/g, " ")} in{" "}
                {goal.timeframeDays} days for {data.workspaceName}
                {(goal.leadSources || []).includes("WEBSITE") && (goal.leadSources || []).includes("SOCIAL")
                  ? " — from social posts and your website"
                  : (goal.leadSources || []).includes("WEBSITE")
                    ? " — from your website"
                    : " — from social posts"}
                .
              </p>
            ) : (
              <p className="mt-1.5 max-w-2xl text-sm text-white/85 leading-relaxed">
                Tell it how many leads you want and by when. It works out how many posts a day that takes,
                then does them for you — and every number you see afterwards is one it actually measured.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-semibold hover:bg-white/25 disabled:opacity-60"
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
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-primary hover:bg-white/90"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Edit goal
              </button>
            )}
          </div>
        </div>

        {goal && (
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold">
                {kpis.achievedLeads} of {kpis.targetLeads} confirmed
              </span>
              <span className="text-white/80">
                {kpis.daysLeft > 0 ? `${kpis.daysLeft} days left` : "Window closed"} · {progress}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-white/80 leading-relaxed">{kpis.statusReason}</p>
          </div>
        )}
      </section>

      {/* ── Brand DNA gate ── */}
      {!data.hasBrandDNA && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-secondary/30 bg-secondary/5 p-4">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Your brand is not described yet
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Without a brand name, industry and audience the AI would have to guess what your business
                sells — so it refuses to. Fill in Brand DNA and the plan becomes about your business.
              </p>
            </div>
          </div>
          <a
            href="/dashboard/brand"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/90"
          >
            Set up Brand DNA
          </a>
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
            onClick={() => goToTab("leads")}
          />
          <StatTile
            label="Clicks measured"
            value={metrics.clicks}
            hint={`${metrics.uniqueClicks} unique · counted from real redirects`}
            icon={<MousePointerClick className="h-4 w-4" />}
            accent="secondary"
            onClick={() => goToTab("history")}
          />
          <StatTile
            label="Published"
            value={published}
            hint={
              kpis.publishFailures
                ? `${kpis.publishFailures} failed — retry them in History`
                : `${kpis.postsPublished || 0} posts · ${kpis.articlesPublished || 0} articles`
            }
            icon={<Send className="h-4 w-4" />}
            onClick={() => goToTab("history")}
          />
          <StatTile
            label="Pace needed"
            value={`${(kpis.requiredPace || 0).toFixed(1)}/day`}
            hint={`You are at ${(kpis.currentPace || 0).toFixed(1)}/day · ${status.text.toLowerCase()}`}
            icon={<CalendarClock className="h-4 w-4" />}
            accent="secondary"
          />
        </div>
      )}

      {/* ── Tab rail ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
              {count !== undefined && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    active ? "bg-white/20" : "bg-muted text-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
              {t.key === "autopilot" && !active && (
                <span
                  className={`ml-0.5 h-1.5 w-1.5 rounded-full ${
                    autopilotOn ? "bg-primary" : "bg-muted-foreground/40"
                  }`}
                  title={autopilotOn ? "Autopilot is running" : "Autopilot is off"}
                />
              )}
            </button>
          );
        })}
        {data.needsSetup && (
          <Chip tone="secondary" title="No goal saved yet.">
            Start on the Goal tab
          </Chip>
        )}
      </div>

      {/* ── Panels ── */}
      {tab === "goal" && (
        <GoalWizardTab
          data={data}
          onSaved={() => {
            refresh();
            goToTab("plan");
          }}
          onToast={push}
          onGoToTab={goToTab}
        />
      )}

      {tab === "plan" && (
        <PlanTab
          data={data}
          strategy={strategy}
          onStrategy={(next) => setStrategy(next)}
          onToast={push}
          onGoToTab={goToTab}
        />
      )}

      {tab === "today" && (
        <TodayTab
          data={data}
          strategy={strategy}
          onToast={push}
          onGoToTab={goToTab}
          onRefresh={refresh}
        />
      )}

      {tab === "history" && (
        <HistoryTab data={data} onToast={push} onGoToTab={goToTab} onRefresh={refresh} />
      )}

      {tab === "leads" && (
        <LeadsTab data={data} onToast={push} onGoToTab={goToTab} onRefresh={refresh} />
      )}

      {tab === "autopilot" && (
        <AutopilotTab data={data} onToast={push} onGoToTab={goToTab} onRefresh={refresh} />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
