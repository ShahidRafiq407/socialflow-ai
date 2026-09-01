"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Check,
  ExternalLink,
  FileText,
  Layers,
  Lightbulb,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import type { GrowthStrategy, GrowthPlanTask } from "@/lib/types/growth";
import { applyGrowthRecommendation, dismissGrowthRecommendation } from "@/actions/goals";
import { ActionButton, Chip, EmptyState, SectionCard } from "./shared";
import type { GoalHQData } from "./types";

/**
 * Plan tab — the maths and the calendar behind the goal.
 *
 * Build/Rebuild streams over SSE with a real Stop: the AbortController aborts
 * the request, which aborts the LLM calls server-side. Every rate on screen is
 * labelled either measured (from this workspace's tracked clicks and confirmed
 * leads) or a published benchmark.
 */
export function PlanTab({
  data,
  strategy,
  onStrategy,
  onToast,
  onGoToTab,
}: {
  data: GoalHQData;
  strategy: GrowthStrategy | null;
  onStrategy: (strategy: GrowthStrategy) => void;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onGoToTab: (tab: string) => void;
}) {
  const [building, setBuilding] = useState(false);
  const [log, setLog] = useState<{ step: string; status: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBuilding(false);
    onToast("info", "Plan build stopped. Nothing was saved.");
  };

  const build = async () => {
    if (!data.goal) {
      onToast("error", "Save your goal first — the plan is built from it.");
      onGoToTab("goal");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBuilding(true);
    setLog([]);

    try {
      const res = await fetch("/api/growth/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.workspaceId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        onToast("error", err.error || "Could not start the plan build.");
        setBuilding(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          let payload: any = {};
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event === "strategy_started") {
            setLog((prev) => [...prev, { step: payload.message, status: "info" }]);
          } else if (event === "agent_step") {
            setLog((prev) => {
              const i = prev.findIndex((l) => l.step === payload.step);
              if (i >= 0) {
                const next = [...prev];
                next[i] = { step: payload.step, status: payload.status };
                return next;
              }
              return [...prev, { step: payload.step, status: payload.status }];
            });
          } else if (event === "strategy_completed") {
            onStrategy(payload.strategy);
            onToast("success", "Plan is ready. Open Today to generate and schedule the posts.");
          } else if (event === "strategy_error") {
            onToast(payload.error === "Stopped by user." ? "info" : "error", payload.error);
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        onToast("error", err?.message || "Plan build failed.");
      }
    } finally {
      abortRef.current = null;
      setBuilding(false);
    }
  };

  if (!data.goal) {
    return (
      <EmptyState
        icon={<Target className="w-5 h-5" />}
        title="No goal saved yet"
        description="The plan is built entirely from your target, timeframe, lead sources and platforms. Set the goal first and nothing will be guessed."
        action={
          <button
            type="button"
            onClick={() => onGoToTab("goal")}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            <Target className="w-4 h-4" />
            Set the goal
          </button>
        }
      />
    );
  }

  const funnel = strategy?.funnel;
  const measured = Boolean(funnel?.isMeasured);

  return (
    <div className="space-y-5">
      {/* ── Build / Rebuild ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-secondary/10 text-secondary shrink-0">
              <BrainCircuit className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground">
                {strategy ? "Rebuild the plan" : "Build the plan"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                The AI researches live trends for your industry, works out how many posts per day the
                target needs, and writes the calendar. Steps run in parallel, so this takes seconds, not
                minutes.
              </p>
            </div>
          </div>

          <ActionButton
            running={building}
            onRun={build}
            onStop={stop}
            label={strategy ? "Rebuild plan" : "Build plan"}
            runningLabel="Stop building"
            icon={<Sparkles className="w-3.5 h-3.5" />}
            variant="secondary"
          />
        </div>

        {log.length > 0 && (
          <div
            ref={logRef}
            className="mt-4 max-h-44 overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 space-y-1.5"
          >
            {log.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                {l.status === "done" ? (
                  <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                ) : l.status === "running" ? (
                  <Loader2 className="w-3 h-3 text-secondary mt-0.5 shrink-0 animate-spin" />
                ) : (
                  <Activity className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                )}
                <span className={l.status === "done" ? "text-muted-foreground" : "text-foreground"}>
                  {l.step}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Blockers the user must fix ── */}
      {strategy?.needsBrandDNA && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">The AI has nothing to work from</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Your Brand DNA is empty, so this plan is only a skeleton. Fill in what your business does,
              who it serves and your tone, then rebuild — it will not invent a business for you.
            </p>
          </div>
          <a
            href="/dashboard/brand"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 shrink-0"
          >
            Set up Brand DNA
          </a>
        </div>
      )}

      {strategy?.warnings?.length ? (
        <div className="rounded-2xl border border-secondary/30 bg-secondary/5 p-4">
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
            <AlertTriangle className="w-4 h-4 text-secondary" />
            Worth knowing about this plan
          </p>
          <ul className="mt-2 space-y-1">
            {strategy.warnings.map((w, i) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {strategy?.needsDestinationFor?.length ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">No CTA link for some platforms</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {strategy.needsDestinationFor.join(", ")} have no destination, so their posts cannot carry a
              tracked link and no lead can be attributed to them.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onGoToTab("goal")}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 shrink-0"
          >
            Add links
          </button>
        </div>
      ) : null}

      {!strategy && !building && (
        <EmptyState
          icon={<Sparkles className="w-5 h-5" />}
          title="No plan built yet"
          description="Your goal is saved. Build the plan and the AI will work out the daily posting maths and the content calendar for it."
        />
      )}

      {/* ── Funnel maths ── */}
      {funnel && (
        <SectionCard
          title="How the target becomes a posting schedule"
          subtitle="Working backwards from the leads you asked for."
          icon={<BarChart3 className="w-4 h-4" />}
          actions={
            measured ? (
              <Chip tone="primary" title="Derived from your own tracked clicks and confirmed leads.">
                Measured from your data
              </Chip>
            ) : (
              <Chip
                tone="muted"
                title="You do not have enough tracked clicks, leads and published posts yet, so published organic benchmarks are used."
              >
                Benchmark estimate
              </Chip>
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FunnelStep label="Leads wanted" value={funnel.targetLeads} />
            <FunnelStep
              label="Conversions needed"
              value={funnel.requiredConversions}
              hint={`${Math.round(funnel.qualificationRate * 100)}% qualify`}
            />
            <FunnelStep
              label={measured ? "Clicks needed" : "Profile visits / clicks"}
              value={funnel.requiredProfileVisits}
              hint={
                measured && funnel.leadsPerClick
                  ? `${(funnel.leadsPerClick * 100).toFixed(1)}% of your clicks convert`
                  : `${(funnel.organicCVR * 100).toFixed(1)}% benchmark conversion`
              }
            />
            <FunnelStep
              label="Posts needed in total"
              value={funnel.requiredTotalPosts}
              hint={
                measured && funnel.clicksPerPost
                  ? `${funnel.clicksPerPost.toFixed(1)} clicks per post, measured`
                  : `${funnel.avgImpressionsPerPost.toLocaleString()} est. impressions per post`
              }
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Posts per day
              </p>
              <p className="text-2xl font-bold text-foreground leading-none mt-1">
                {funnel.requiredPostsPerDay ?? Math.ceil(funnel.requiredDailyPace)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Across {strategy?.targetPlatforms?.length || data.connectedPlatforms.length} platform
                {(strategy?.targetPlatforms?.length || data.connectedPlatforms.length) === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Posts per week
              </p>
              <p className="text-2xl font-bold text-foreground leading-none mt-1">
                {funnel.requiredPostsPerWeek}
              </p>
            </div>
            {funnel.requiredArticlesPerWeek ? (
              <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  SEO articles per week
                </p>
                <p className="text-2xl font-bold text-foreground leading-none mt-1">
                  {funnel.requiredArticlesPerWeek}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Published to your own site</p>
              </div>
            ) : null}
          </div>

          {funnel.assumptions?.length ? (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                What this assumes
              </p>
              <ul className="mt-1.5 space-y-1">
                {funnel.assumptions.map((a, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">
                    • {a}
                  </li>
                ))}
              </ul>
              {funnel.dataSourceSummary && (
                <p className="text-[11px] text-foreground/70 mt-2 leading-relaxed">
                  {funnel.dataSourceSummary}
                </p>
              )}
            </div>
          ) : null}
        </SectionCard>
      )}

      {/* ── Platform allocation ── */}
      {strategy?.platformStrategies?.length ? (
        <SectionCard
          title="What each platform is for"
          subtitle="Cadence per platform, with the reason the AI gave."
          icon={<TrendingUp className="w-4 h-4" />}
        >
          <div className="space-y-3">
            {strategy.platformStrategies.map((p) => (
              <div key={p.platform} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{p.platform}</span>
                  <Chip tone={p.leadPotential === "HIGH" ? "primary" : p.leadPotential === "MEDIUM" ? "secondary" : "muted"}>
                    {p.leadPotential} lead potential
                  </Chip>
                  {p.status === "PAUSED" && <Chip tone="muted">Paused</Chip>}
                  {p.status === "UNAVAILABLE" && <Chip tone="danger">Not connected</Chip>}
                  <span className="ml-auto text-xs font-semibold text-primary">
                    {p.postsPerWeek}× / week
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{p.reason}</p>
                {p.attributionData && (p.attributionData.clicks > 0 || p.attributionData.leads > 0) && (
                  <p className="text-[11px] text-foreground/70 mt-1.5">
                    So far: {p.attributionData.clicks} click
                    {p.attributionData.clicks === 1 ? "" : "s"} → {p.attributionData.leads} lead
                    {p.attributionData.leads === 1 ? "" : "s"} ({p.attributionData.conversionRate})
                  </p>
                )}
                {p.capabilityNotice && (
                  <p className="text-[11px] text-secondary mt-1.5 leading-relaxed">{p.capabilityNotice}</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {/* ── Content pillars ── */}
      {strategy?.contentPillars?.length ? (
        <SectionCard
          title="Content pillars"
          subtitle="The themes every post is drawn from, and the share of the calendar each one gets."
          icon={<Layers className="w-4 h-4" />}
          accent="secondary"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {strategy.contentPillars.map((pillar) => (
              <div key={pillar.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">{pillar.name}</span>
                  <span className="text-xs font-bold text-secondary shrink-0">
                    {pillar.allocationPercentage}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-secondary"
                    style={{ width: `${Math.min(100, pillar.allocationPercentage)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{pillar.purpose}</p>
                <p className="text-[11px] text-foreground/70 mt-1.5 leading-relaxed">
                  <span className="font-semibold">Lead role:</span> {pillar.leadGenerationRole}
                </p>
                {pillar.exampleHook && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 italic leading-relaxed">
                    &ldquo;{pillar.exampleHook}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {/* ── 7-day calendar ── */}
      {strategy?.weeklyPlan?.length ? (
        <SectionCard
          title="The next 7 days"
          subtitle="Today's row is what the Today tab runs. Autopilot works through the rest day by day."
          icon={<CalendarDays className="w-4 h-4" />}
          actions={
            <button
              type="button"
              onClick={() => onGoToTab("today")}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/10"
            >
              Open Today
              <ExternalLink className="w-3 h-3" />
            </button>
          }
        >
          <WeeklyCalendar tasks={strategy.weeklyPlan} />
        </SectionCard>
      ) : null}

      {/* ── Recommendations ── */}
      {strategy?.recommendations?.length ? (
        <RecommendationList
          workspaceId={data.workspaceId}
          recommendations={strategy.recommendations}
          onToast={onToast}
        />
      ) : null}

      {/* ── Research the plan was built on ── */}
      {strategy?.research?.trendSources?.length ? (
        <SectionCard
          title="Research this plan used"
          subtitle="Live sources the AI read before writing the calendar."
          icon={<FileText className="w-4 h-4" />}
          accent="secondary"
        >
          <ul className="space-y-1.5">
            {strategy.research.trendSources.slice(0, 8).map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 text-xs text-primary hover:underline leading-relaxed"
                >
                  <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

function FunnelStep({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground leading-none mt-1">
        {Number(value || 0).toLocaleString()}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function WeeklyCalendar({ tasks }: { tasks: GrowthPlanTask[] }) {
  const byDay = new Map<string, GrowthPlanTask[]>();
  for (const t of tasks) {
    const key = t.day || t.date || "Unscheduled";
    byDay.set(key, [...(byDay.get(key) || []), t]);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from(byDay.entries()).map(([day, dayTasks]) => (
        <div key={day} className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">{day}</span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {dayTasks.length} task{dayTasks.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {dayTasks.map((t) => (
              <div key={t.id} className="rounded-lg bg-muted/40 px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-primary">
                    {t.channel === "WEBSITE" ? "Website article" : t.platform}
                  </span>
                  <span className="text-[10px] text-muted-foreground">· {t.time}</span>
                </div>
                <p className="text-[11px] text-foreground mt-0.5 leading-snug line-clamp-2">
                  {t.channel === "WEBSITE" ? t.keyword || t.topic : t.topic}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationList({
  workspaceId,
  recommendations,
  onToast,
}: {
  workspaceId: string;
  recommendations: NonNullable<GrowthStrategy["recommendations"]>;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const open = recommendations.filter((r) => !r.applied && !hidden.includes(r.id));
  if (open.length === 0) return null;

  const apply = async (id: string) => {
    setBusy(id);
    try {
      const res = await applyGrowthRecommendation(workspaceId, id);
      if (!res.success) {
        onToast("error", res.error || "Could not apply that.");
        return;
      }
      setHidden((prev) => [...prev, id]);
      onToast("success", "Applied — it will be reflected the next time the plan runs.");
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (id: string) => {
    setBusy(id);
    try {
      const res = await dismissGrowthRecommendation(workspaceId, id);
      if (!res.success) {
        onToast("error", res.error || "Could not dismiss that.");
        return;
      }
      setHidden((prev) => [...prev, id]);
      onToast("info", "Dismissed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title="What the AI wants to change"
      subtitle="Each suggestion is based on what your own numbers are doing."
      icon={<Lightbulb className="w-4 h-4" />}
      accent="secondary"
    >
      <div className="space-y-3">
        {open.map((r) => (
          <div key={r.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>
                <p className="text-[11px] text-foreground/70 mt-1.5 leading-relaxed">
                  <span className="font-semibold">Why:</span> {r.why}
                </p>
                {r.data && <p className="text-[11px] text-muted-foreground mt-1">{r.data}</p>}
                <p className="text-[11px] text-primary mt-1.5">Expected: {r.expectedImpact}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => apply(r.id)}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === r.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(r.id)}
                  disabled={busy === r.id}
                  title="Dismiss"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
