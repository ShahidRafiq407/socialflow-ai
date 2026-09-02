"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Gauge,
  Globe,
  Loader2,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import type { AutopilotMode } from "@/lib/types/growth";
import { saveGrowthGoal, toggleAutopilot } from "@/actions/goals";
import {
  Chip,
  ConfirmButton,
  EmptyState,
  InfoDot,
  SectionCard,
  fmtDateTime,
} from "./shared";
import type { GoalHQData } from "./types";

/**
 * Autopilot — the switch that makes it post by itself.
 *
 * Only the two modes that actually behave differently are offered: AUTOPILOT
 * (the daily engine runs) and MANUAL (nothing runs on its own). Every guardrail
 * shown here is one the engine really reads, so nothing on this screen is a
 * decorative toggle.
 */

const GRACE_PRESETS = [0, 15, 30, 60, 180];

function sameLocalDay(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function AutopilotTab({
  data,
  onToast,
  onGoToTab,
  onRefresh,
}: {
  data: GoalHQData;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onGoToTab: (tab: string) => void;
  onRefresh: () => void;
}) {
  const goal = data.goal;

  const [mode, setMode] = useState<AutopilotMode>(goal?.autopilotMode || "AUTOPILOT");
  const [paused, setPaused] = useState<boolean>(Boolean(goal?.isAutopilotPaused));
  const [publishPaused, setPublishPaused] = useState<boolean>(Boolean(goal?.isPublishingPaused));
  const [pausedPlatforms, setPausedPlatforms] = useState<string[]>(goal?.pausedPlatforms || []);
  const [dailyCap, setDailyCap] = useState<number>(goal?.dailyPostCap ?? 3);
  const [articlesPerWeek, setArticlesPerWeek] = useState<number>(goal?.articlesPerWeek ?? 2);
  const [graceMinutes, setGraceMinutes] = useState<number>(goal?.graceMinutes ?? 15);
  const [visuals, setVisuals] = useState<boolean>(goal?.autopilotPermissions?.generateVisuals !== false);

  const [savingGuardrails, startSavingGuardrails] = useTransition();
  const [switching, startSwitching] = useTransition();
  const [platformBusy, setPlatformBusy] = useState<string | null>(null);

  if (!goal) {
    return (
      <EmptyState
        icon={<Zap className="w-5 h-5" />}
        title="No goal to run"
        description="Autopilot needs a target before it can decide what to post. Set the goal first, then come back and switch it on."
        action={
          <button
            type="button"
            onClick={() => onGoToTab("goal")}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            Set the goal
          </button>
        }
      />
    );
  }

  const usesWebsite = (goal.leadSources || []).includes("WEBSITE");
  const connectedLower = useMemo(
    () => new Set(data.connectedPlatforms.map((p) => p.toLowerCase())),
    [data.connectedPlatforms]
  );

  const platforms: string[] = goal.targetPlatforms || [];
  const ranToday = sameLocalDay(goal.lastPlanRunAt);
  const running = mode === "AUTOPILOT" && !paused;

  const dirty =
    dailyCap !== (goal.dailyPostCap ?? 3) ||
    graceMinutes !== (goal.graceMinutes ?? 15) ||
    (usesWebsite && articlesPerWeek !== (goal.articlesPerWeek ?? 2)) ||
    visuals !== (goal.autopilotPermissions?.generateVisuals !== false);

  const resetGuardrails = () => {
    setDailyCap(goal.dailyPostCap ?? 3);
    setGraceMinutes(goal.graceMinutes ?? 15);
    setArticlesPerWeek(goal.articlesPerWeek ?? 2);
    setVisuals(goal.autopilotPermissions?.generateVisuals !== false);
  };

  const saveGuardrails = () => {
    startSavingGuardrails(async () => {
      const res = await toggleAutopilot(data.workspaceId, {
        dailyPostCap: dailyCap,
        graceMinutes,
        ...(usesWebsite ? { articlesPerWeek } : {}),
        permissions: {
          createContent: true,
          generateVisuals: visuals,
          schedule: true,
          autoPublish: mode === "AUTOPILOT",
          autoModifyStrategy: false,
        },
      });
      if (!res.success) {
        onToast("error", res.error || "Could not save the guardrails.");
        return;
      }
      onToast("success", "Guardrails saved. The next run uses them.");
      onRefresh();
    });
  };

  const switchMode = (next: AutopilotMode) => {
    startSwitching(async () => {
      const res = await toggleAutopilot(data.workspaceId, { mode: next, isAutopilotPaused: false });
      if (!res.success) {
        onToast("error", res.error || "Could not change the mode.");
        return;
      }
      setMode(next);
      setPaused(false);
      onToast(
        "success",
        next === "AUTOPILOT"
          ? "Autopilot is on. From the next daily run it posts by itself, without asking you."
          : "Switched to manual. Nothing will be posted unless you run it from the Today tab."
      );
      onRefresh();
    });
  };

  const togglePauseAll = () => {
    startSwitching(async () => {
      const next = !paused;
      const res = await toggleAutopilot(data.workspaceId, { isAutopilotPaused: next });
      if (!res.success) {
        onToast("error", res.error || "Could not change that.");
        return;
      }
      setPaused(next);
      onToast(next ? "info" : "success", next ? "Everything paused." : "Autopilot resumed.");
      onRefresh();
    });
  };

  const togglePublishing = () => {
    startSwitching(async () => {
      const next = !publishPaused;
      const res = await toggleAutopilot(data.workspaceId, { isPublishingPaused: next });
      if (!res.success) {
        onToast("error", res.error || "Could not change that.");
        return;
      }
      setPublishPaused(next);
      onToast(
        next ? "info" : "success",
        next
          ? "Publishing held. Posts will still be written and scheduled, but nothing goes live."
          : "Publishing resumed."
      );
      onRefresh();
    });
  };

  const togglePlatform = (platform: string) => {
    const key = platform.toLowerCase();
    const isPaused = pausedPlatforms.some((p) => p.toLowerCase() === key);
    const next = isPaused
      ? pausedPlatforms.filter((p) => p.toLowerCase() !== key)
      : [...pausedPlatforms, platform];

    setPlatformBusy(platform);
    startSwitching(async () => {
      const res = await toggleAutopilot(data.workspaceId, { pausedPlatforms: next });
      setPlatformBusy(null);
      if (!res.success) {
        onToast("error", res.error || "Could not change that platform.");
        return;
      }
      setPausedPlatforms(next);
      onToast(
        isPaused ? "success" : "info",
        isPaused ? `${platform} is back in the rotation.` : `${platform} paused — nothing will be posted there.`
      );
      onRefresh();
    });
  };

  // Takes a platform off the goal entirely — the same field the Social tab and
  // the engine read. Used for a platform that is no longer connected (so pausing
  // it is meaningless) or one you simply don't want any more.
  const removePlatform = (platform: string) => {
    const nextLabels = platforms.filter((p) => p.toLowerCase() !== platform.toLowerCase());
    setPlatformBusy(platform);
    startSwitching(async () => {
      const res = await saveGrowthGoal(data.workspaceId, {
        leadTarget: goal.leadTarget,
        leadType: goal.leadType,
        customLeadTypeName: goal.customLeadTypeName || null,
        timeframeDays: goal.timeframeDays,
        targetPlatforms: nextLabels,
        leadSources: goal.leadSources,
        ctaDestinations: goal.ctaDestinations || {},
        dailyPostCap: goal.dailyPostCap ?? null,
        articlesPerWeek: goal.articlesPerWeek ?? null,
        graceMinutes: goal.graceMinutes ?? null,
        // The target was already accepted when the goal was saved; this only
        // changes which accounts it runs on.
        acceptAggressive: true,
      });
      setPlatformBusy(null);
      if (!res.success) {
        onToast("error", res.error || "Could not remove that platform.");
        return;
      }
      onToast("success", `${platform} removed from the goal. Autopilot will not post there any more.`);
      onRefresh();
    });
  };

  return (
    <div className="space-y-5">
      {/* ── Master state ── */}
      <section
        className={`rounded-2xl border p-5 ${
          running ? "border-primary/40 bg-primary/5" : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
                <Zap className={`w-4 h-4 ${running ? "text-primary" : "text-muted-foreground"}`} />
                {running ? "Autopilot is running" : paused ? "Everything is paused" : "Manual mode"}
              </span>
              {publishPaused && <Chip tone="danger">Publishing held</Chip>}
              <InfoDot
                text={
                  running
                    ? "Autopilot is on: once a day the engine builds the plan, writes the posts and schedules each at its best time. You do nothing unless you want to step in."
                    : paused
                      ? "Everything is paused. The engine will not build a plan, write or publish anything until you resume."
                      : "Manual mode: nothing runs on its own. You generate and publish today's work yourself from the Today tab."
                }
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-2xl">
              {running
                ? `Once a day it builds today's plan, writes the posts, and schedules each one at its best time — never sooner than ${graceMinutes} minute${
                    graceMinutes === 1 ? "" : "s"
                  } from now, so you always have a window to delete something. A day missed while the app was closed is caught up on the next run.`
                : paused
                  ? "Nothing is being created or published. Resume when you want it to take over again."
                  : "Nothing runs on its own. You generate and publish today's work yourself from the Today tab."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {mode === "AUTOPILOT" ? (
              <button
                type="button"
                onClick={togglePauseAll}
                disabled={switching}
                className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                  paused
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-destructive/40 text-destructive hover:bg-destructive/10"
                }`}
              >
                {switching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : paused ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                {paused ? "Resume autopilot" : "Pause everything"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("AUTOPILOT")}
                disabled={switching}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Turn autopilot on
              </button>
            )}

            {mode === "AUTOPILOT" && (
              <button
                type="button"
                onClick={() => switchMode("MANUAL")}
                disabled={switching}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Switch to manual
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 mt-4 pt-4 border-t border-border sm:grid-cols-3">
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Last run
              <InfoDot
                className="normal-case"
                text="When the engine last built and scheduled a plan for you. 'Not yet' means it has never run — turn autopilot on or run today's work from the Today tab."
              />
            </span>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {goal.lastPlanRunAt ? fmtDateTime(goal.lastPlanRunAt) : "Not yet"}
            </p>
          </div>
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Today
              <InfoDot
                className="normal-case"
                text="Whether today's plan has already run. If a day was missed while the app was closed, the next run catches it up — nothing is silently skipped."
              />
            </span>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {ranToday ? "Already run" : running ? "Will run on the next tick" : "Not scheduled"}
            </p>
          </div>
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Daily cap
              <InfoDot
                className="normal-case"
                text="The most posts autopilot will publish in one day. Anything the plan asks for beyond this is held back so your accounts are never flooded. Change it under Guardrails."
              />
            </span>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {dailyCap} post{dailyCap === 1 ? "" : "s"}
              {usesWebsite && ` · ${articlesPerWeek} article${articlesPerWeek === 1 ? "" : "s"}/week`}
            </p>
          </div>
        </div>

        {goal.lastPlanError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">The last run reported a problem</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                {goal.lastPlanError}
              </p>
            </div>
          </div>
        )}

        {running && !ranToday && goal.lastPlanRunAt && (
          <p className="inline-flex items-start gap-1.5 text-[11px] text-secondary mt-3 leading-relaxed">
            <Clock className="w-3 h-3 mt-0.5 shrink-0" />
            Today has not run yet. If a day was missed, the next run does both — nothing is silently
            skipped.
          </p>
        )}

        {running && (
          <button
            type="button"
            onClick={() => onGoToTab("today")}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline mt-3"
          >
            <Sparkles className="w-3 h-3" />
            Don&rsquo;t want to wait? Run today&rsquo;s work now
          </button>
        )}
      </section>

      {/* ── Guardrails ── */}
      <SectionCard
        title="Guardrails"
        subtitle="These are the limits autopilot works inside. Every one of them is read by the engine."
        icon={<ShieldCheck className="w-4 h-4" />}
        info="Nothing here is decorative — each limit is read by the engine on every run. Change one and the very next run obeys it."
        actions={
          dirty ? (
            <>
              <button
                type="button"
                onClick={saveGuardrails}
                disabled={savingGuardrails}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {savingGuardrails ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save
              </button>
              <button
                type="button"
                onClick={resetGuardrails}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-muted"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </>
          ) : (
            <Chip tone="muted">Saved</Chip>
          )
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-primary" />
              Most posts per day
              <InfoDot text="The hard ceiling on posts published in a single day, across every platform combined. Set it to the pace your funnel actually needs — more is not better if it floods your accounts." />
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={1}
                max={12}
                value={dailyCap}
                onChange={(e) => setDailyCap(Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]"
              />
              <span className="text-sm font-bold text-primary w-8 text-right">{dailyCap}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              Anything the plan asks for beyond this is held back rather than flooding your accounts.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Wait before anything goes live
              <InfoDot text="A safety window between the moment a post is written and the moment it publishes. During it, the post sits on the Today tab where you can delete it. 'No wait' means a post can go live before you ever see it." />
            </label>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {GRACE_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGraceMinutes(m)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    graceMinutes === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {m === 0 ? "No wait" : `${m} min`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              {graceMinutes === 0
                ? "With no wait, an autopilot post can go live before you ever see it."
                : `You get ${graceMinutes} minutes to delete a post from the Today tab before it publishes.`}
            </p>
          </div>

          {usesWebsite && (
            <div>
              <label className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-secondary" />
                Articles per week
                <InfoDot text="How many SEO articles autopilot writes and publishes to your website each week. The AI picks the keywords from your goal. Set it to 0 to stop writing articles — website leads would then only come from links you share yourself." />
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min={0}
                  max={7}
                  value={articlesPerWeek}
                  onChange={(e) => setArticlesPerWeek(Number(e.target.value))}
                  className="flex-1 accent-[var(--color-secondary)]"
                />
                <span className="text-sm font-bold text-secondary w-8 text-right">{articlesPerWeek}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                {articlesPerWeek === 0
                  ? "No articles will be written, so website leads will only come from links you share yourself."
                  : "The AI picks the keywords and publishes straight to your site."}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
              Visuals
              <InfoDot text="When on, every autopilot post gets a generated image. Turn it off for text-only posts — faster and cheaper, but reach is usually lower." />
            </label>
            <label className="flex items-start gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visuals}
                onChange={(e) => setVisuals(e.target.checked)}
                className="mt-0.5 accent-[var(--color-primary)]"
              />
              <span className="text-xs text-foreground leading-relaxed">
                Generate an image for every autopilot post.
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Turn this off to post text only — faster and cheaper, but reach is usually lower.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                Hold publishing
                <InfoDot text="A pause on going live only. The engine keeps writing and scheduling posts as normal, but nothing actually publishes until you resume. Useful over a holiday or while you review the first few days of output." />
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed max-w-lg">
                Keeps writing and scheduling, but stops anything from actually going live. Useful during a
                holiday or while you review the first few days of output.
              </p>
            </div>
            <button
              type="button"
              onClick={togglePublishing}
              disabled={switching}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-50 ${
                publishPaused
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border text-foreground hover:bg-muted"
              }`}
            >
              {publishPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {publishPaused ? "Resume publishing" : "Hold publishing"}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Platforms ── */}
      <SectionCard
        title="Platforms in the rotation"
        subtitle="Pause one and autopilot stops posting there. Remove one and it comes off the goal entirely."
        icon={<Plug className="w-4 h-4" />}
        info="This lists the platforms on your goal. A connected one can be paused (kept on the goal, but no new posts) or removed (taken off the goal). A platform that is not connected cannot post at all, so autopilot skips it — connect it in Integrations or remove it here."
      >
        {platforms.length === 0 ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            This goal has no platforms yet. Add them in the Goal tab, or run on the website channel only.
          </p>
        ) : (
          <div className="space-y-2">
            {platforms.map((platform) => {
              const key = platform.toLowerCase();
              const isPaused = pausedPlatforms.some((p) => p.toLowerCase() === key);
              const isConnected = connectedLower.has(key);
              const busy = switching && platformBusy === platform;
              return (
                <div
                  key={platform}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-foreground">{platform}</span>
                    {!isConnected ? (
                      <Chip tone="danger" title="No account is connected, so autopilot skips it.">
                        Not connected
                      </Chip>
                    ) : isPaused ? (
                      <Chip tone="muted">Paused</Chip>
                    ) : (
                      <Chip tone="primary" icon={<Check className="w-3 h-3" />}>
                        Active
                      </Chip>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isConnected ? (
                      // Connected → pausing is meaningful, so offer it.
                      <button
                        type="button"
                        onClick={() => togglePlatform(platform)}
                        disabled={busy}
                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                          isPaused
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "border border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isPaused ? (
                          <Play className="w-3 h-3" />
                        ) : (
                          <Pause className="w-3 h-3" />
                        )}
                        {isPaused ? "Resume" : "Pause"}
                      </button>
                    ) : (
                      // Not connected → it can't post, so there is nothing to
                      // pause. Point to where it gets connected instead.
                      <a
                        href={`/dashboard/integrations?platform=${encodeURIComponent(key)}`}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <Plug className="w-3.5 h-3.5" />
                        Connect
                      </a>
                    )}
                    <ConfirmButton
                      label="Remove"
                      confirmLabel="Remove"
                      icon={<Trash2 className="w-3 h-3" />}
                      busy={busy}
                      onConfirm={() => removePlatform(platform)}
                    />
                    <InfoDot
                      align="right"
                      text={
                        isConnected
                          ? "Pause keeps this platform on the goal but stops autopilot posting there until you resume. Remove takes it off the goal entirely — you can add it back any time from the Social tab."
                          : "This platform has no connected account, so autopilot can't post there and there is nothing to pause. Connect it in Integrations, or remove it from the goal so it stops showing here."
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
