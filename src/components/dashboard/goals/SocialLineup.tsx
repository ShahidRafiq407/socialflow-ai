"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  Link2,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { saveCtaDestination, saveGrowthGoal } from "@/actions/goals";
import { getChannelAdvice } from "@/actions/growthAdvisor";
import type { ChannelAdvice, ChannelSuggestion } from "@/lib/growth/channelAdvisor";
import { Chip, ConnectionStrip, DestinationRow, InfoDot, SectionCard } from "./shared";
import type { GoalHQData } from "./types";

/**
 * The social channel's setup strip: who is connected, where the AI says to
 * post, and where those posts should send people.
 *
 * Connecting an account is not possible from here on purpose — that lives in
 * Integrations, so there is exactly one place in the app where an account is
 * linked and exactly one truth about whether it is. This card reports that
 * truth and links to it.
 */

const BASIS: Record<
  ChannelAdvice["basis"],
  { text: string; tone: "primary" | "secondary" | "muted"; info: string }
> = {
  MEASURED: {
    text: "Ranked on your own results",
    tone: "primary",
    info: "These platforms are ordered by the clicks and confirmed leads they have actually produced for you. Nothing here is a benchmark.",
  },
  AI: {
    text: "AI shortlist",
    tone: "secondary",
    info: "You have no measured results on these platforms yet, so the AI ranked them from your industry, your lead type and one hard fact: whether a link in the caption is clickable there. It cannot invent numbers for a platform with no data.",
  },
  RULES: {
    text: "Starting shortlist",
    tone: "muted",
    info: "A first shortlist based on your lead type and whether a link in the caption is clickable on each platform. It gets replaced by your own measured results as soon as you have clicks and leads.",
  },
};

export function SocialLineup({
  data,
  onToast,
  onSaved,
  onGoToTab,
}: {
  data: GoalHQData;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onSaved: () => void;
  onGoToTab: (tab: string) => void;
}) {
  const goal = data.goal;
  const [advice, setAdvice] = useState<ChannelAdvice>(data.advice);
  const [asking, setAsking] = useState(false);
  const [saving, startSaving] = useTransition();
  const [destinations, setDestinations] = useState<Record<string, string>>(goal?.ctaDestinations || {});

  useEffect(() => {
    setAdvice(data.advice);
  }, [data.advice]);

  useEffect(() => {
    setDestinations(goal?.ctaDestinations || {});
  }, [goal?.ctaDestinations]);

  const lineup: string[] = useMemo(
    () => (Array.isArray(goal?.targetPlatforms) ? goal.targetPlatforms : []),
    [goal?.targetPlatforms]
  );
  const inLineup = useMemo(() => new Set(lineup.map((p) => String(p).toLowerCase())), [lineup]);

  // Recommended first, then anything else that is connected, then the rest —
  // so the order on screen is the order worth acting on.
  const rows = useMemo(() => {
    const score = (s: ChannelSuggestion) =>
      (s.recommended ? 0 : 2) + (s.connected ? 0 : 1) + (s.measured ? -0.5 : 0);
    return [...advice.suggestions].sort((a, b) => score(a) - score(b));
  }, [advice.suggestions]);

  const basis = BASIS[advice.basis] || BASIS.RULES;
  const recommended = rows.filter((s) => s.recommended).map((s) => s.label);
  const connectedCount = rows.filter((s) => s.connected).length;

  const askAI = async () => {
    setAsking(true);
    try {
      const next = await getChannelAdvice(data.workspaceId, {
        leadSources: goal?.leadSources,
        leadTarget: goal?.leadTarget,
        timeframeDays: goal?.timeframeDays,
        leadType: goal?.leadType,
      });
      if (!next?.suggestions?.length) {
        onToast("error", "Could not work out a shortlist just now. Your current one is unchanged.");
        return;
      }
      setAdvice(next);
      onToast("success", "Shortlist refreshed, with the reasons written for your business.");
    } catch {
      onToast("error", "Could not reach the advisor. Your current shortlist is unchanged.");
    } finally {
      setAsking(false);
    }
  };

  /** Writes the line-up back to the goal — the same field Autopilot reads. */
  const writeLineup = (nextLabels: string[], done?: string) => {
    if (!goal) return;
    startSaving(async () => {
      const res = await saveGrowthGoal(data.workspaceId, {
        leadTarget: goal.leadTarget,
        leadType: goal.leadType,
        customLeadTypeName: goal.customLeadTypeName || null,
        timeframeDays: goal.timeframeDays,
        targetPlatforms: nextLabels,
        leadSources: goal.leadSources,
        ctaDestinations: destinations,
        dailyPostCap: goal.dailyPostCap ?? null,
        articlesPerWeek: goal.articlesPerWeek ?? null,
        graceMinutes: goal.graceMinutes ?? null,
        // The target itself was already accepted when the goal was saved; this
        // only changes which accounts it runs on.
        acceptAggressive: true,
      });
      if (!res.success) {
        onToast("error", res.error || "Could not update the line-up.");
        return;
      }
      onToast("success", done || "Line-up updated.");
      onSaved();
    });
  };

  const saveDestination = async (key: string, value: string) => {
    const res = await saveCtaDestination(data.workspaceId, key, value);
    if (!res.success) {
      onToast("error", res.error || "Could not save that link.");
      return;
    }
    setDestinations(res.ctaDestinations || {});
    onToast("success", value.trim() ? "Link saved — new posts will use it." : "Link removed.");
  };

  return (
    <div className="space-y-4">
      <ConnectionStrip
        connected={connectedCount > 0}
        label="Social accounts"
        connectedNote={`${connectedCount} account${connectedCount === 1 ? "" : "s"} connected: ${data.connectedPlatforms.join(", ")}.`}
        warning="No social account is connected, so nothing can be published here yet. Connect one in Integrations and this page starts working on its own."
        href="/dashboard/integrations"
        hrefLabel={connectedCount > 0 ? "Manage connections" : "Connect an account"}
        info="Accounts are connected once, in Integrations, and every part of the app reads that one connection. This strip only reports it — it cannot connect or disconnect anything, so there is no second place for it to go wrong."
        extra={
          lineup.length > 0 ? (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Posting to
              </span>
              {lineup.map((p) => (
                <Chip key={p} tone="primary">
                  {p}
                </Chip>
              ))}
            </>
          ) : undefined
        }
      />

      <SectionCard
        title="Where the AI says to post"
        subtitle="You do not have to guess at a checkbox list. This is ranked for your business, and only a connected account can be in the line-up."
        icon={<Sparkles className="w-4 h-4" />}
        accent="secondary"
        info="The order comes from your own measured clicks and leads where you have them. Where you do not, it comes from your industry, your lead type and whether a link in the caption is clickable on that platform. A platform with no data never gets a made-up number."
        actions={
          <>
            <Chip tone={basis.tone} title={basis.info}>
              {basis.text}
            </Chip>
            <InfoDot text={basis.info} align="right" />
            <button
              type="button"
              onClick={askAI}
              disabled={asking}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {asking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {asking ? "Asking the AI" : "Ask the AI again"}
            </button>
          </>
        }
      >
        {recommended.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary/30 bg-secondary/5 px-3 py-2.5">
            <p className="min-w-0 text-[11px] text-foreground leading-relaxed">
              <span className="font-bold">Recommended line-up:</span> {recommended.join(", ")}
              <span className="text-muted-foreground">
                {" "}
                — {recommended.length} account{recommended.length === 1 ? "" : "s"} is the most this
                target is worth spreading across.
              </span>
            </p>
            <button
              type="button"
              onClick={() => writeLineup(recommended, "Using the AI's line-up.")}
              disabled={saving || recommended.join("|") === lineup.join("|")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/90 disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Use this line-up
            </button>
          </div>
        )}

        <div className="space-y-2">
          {rows.map((s) => (
            <SuggestionRow
              key={s.platform}
              suggestion={s}
              chosen={inLineup.has(s.platform) || inLineup.has(s.label.toLowerCase())}
              busy={saving}
              onAdd={() => writeLineup([...lineup, s.label], `${s.label} added to the line-up.`)}
              onRemove={() =>
                writeLineup(
                  lineup.filter((p) => String(p).toLowerCase() !== s.label.toLowerCase()),
                  `${s.label} removed. Nothing new will be posted there.`
                )
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Where these posts send people"
        subtitle="Every post carries a tracked short link. Without one, a click cannot be counted and a lead cannot be traced back to the post that earned it."
        icon={<Link2 className="w-4 h-4" />}
        info="The link in a post points at this app first, which counts the click and then forwards the visitor to your page instantly. That redirect is the only reason the click numbers on this page are real."
        actions={
          <button
            type="button"
            onClick={() => onGoToTab("goal")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Edit the default link
          </button>
        }
      >
        <p className="mb-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
          {destinations.default || data.website ? (
            <>
              Unless you override it below, every post sends people to{" "}
              <span className="font-semibold text-foreground">
                {destinations.default || data.website}
              </span>
              .
            </>
          ) : (
            <span className="text-destructive">
              No default link is set and your workspace has no website saved, so posts will go out
              without a CTA link and no lead can be attributed to them. Set one on the Goal tab.
            </span>
          )}
        </p>

        {lineup.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add an account above and its own link override appears here.
          </p>
        ) : (
          lineup.map((p) => (
            <DestinationRow
              key={p}
              label={`${p} only`}
              value={destinations[String(p).toLowerCase()] || ""}
              placeholder="Leave empty to use the default link"
              info={`Set this only if ${p} should send people somewhere else — a platform-specific landing page, for example. Remove it and ${p} goes back to the default link.`}
              onSave={(v) => saveDestination(p, v)}
            />
          ))
        )}
      </SectionCard>
    </div>
  );
}

/** One platform in the shortlist, with Add ↔ Remove and its honest reason. */
function SuggestionRow({
  suggestion,
  chosen,
  busy,
  onAdd,
  onRemove,
}: {
  suggestion: ChannelSuggestion;
  chosen: boolean;
  busy: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const s = suggestion;
  return (
    <div
      className={`rounded-xl border p-3 ${
        chosen ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-foreground">
            {s.label}
            {chosen && <Chip tone="primary">In the line-up</Chip>}
            {!s.connected && <Chip tone="danger">Not connected</Chip>}
            {s.measured && (
              <Chip tone="secondary" icon={<TrendingUp className="w-3 h-3" />}>
                {s.measured.clicks} clicks · {s.measured.leads} leads
              </Chip>
            )}
            {s.recommended && !chosen && <Chip tone="secondary">AI pick</Chip>}
          </p>
          <p className="mt-1 max-w-2xl text-[11px] text-muted-foreground leading-relaxed">{s.reason}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!s.connected ? (
            <a
              href={`/dashboard/integrations?platform=${encodeURIComponent(s.platform)}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <Plug className="w-3.5 h-3.5" />
              Connect
            </a>
          ) : chosen ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              title={`Stop posting to ${s.label}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
