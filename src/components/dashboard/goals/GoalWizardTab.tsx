"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Globe,
  Info,
  Link2,
  Loader2,
  Plug,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { validateGoalFeasibility, LeadSource, LeadType, GoalFeasibilityResult } from "@/lib/types/growth";
import { saveGrowthGoal, resetGrowthGoal, validateGoalAction, saveCtaDestination } from "@/actions/goals";
import { Chip, ConfirmButton, SectionCard } from "./shared";
import { WebsiteChannelCards } from "./WebsiteChannelCards";
import type { GoalHQData } from "./types";

/**
 * Goal tab — the only place a target is created.
 *
 * The feasibility meter runs the pure `validateGoalFeasibility` on every
 * keystroke (no LLM, no network) and is then overwritten by the server's
 * measured verdict when this workspace has enough tracked data. A
 * HIGHLY_AGGRESSIVE target cannot be saved until the user has seen the real
 * range and explicitly accepted it.
 */

const LEAD_TYPES: { value: LeadType; label: string; hint: string }[] = [
  { value: "QUALIFIED_LEADS", label: "Qualified leads", hint: "Vetted, sales-ready enquiries" },
  { value: "LEADS", label: "Leads", hint: "Any enquiry, unqualified" },
  { value: "WEBSITE_INQUIRIES", label: "Website enquiries", hint: "Contact requests from your site" },
  { value: "CONTACT_FORM", label: "Contact form fills", hint: "Form submissions" },
  { value: "WHATSAPP", label: "WhatsApp chats", hint: "Chats started from your links" },
  { value: "BOOKINGS", label: "Bookings / calls", hint: "Booked meetings or calls" },
  { value: "CUSTOM", label: "Something else", hint: "Name it yourself" },
];

export function GoalWizardTab({
  data,
  onSaved,
  onToast,
  onGoToTab,
}: {
  data: GoalHQData;
  onSaved: () => void;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onGoToTab: (tab: string) => void;
}) {
  const goal = data.goal;

  const [leadTarget, setLeadTarget] = useState<number>(goal?.leadTarget ?? 12);
  const [timeframeDays, setTimeframeDays] = useState<number>(goal?.timeframeDays ?? 30);
  const [leadType, setLeadType] = useState<LeadType>((goal?.leadType as LeadType) || "QUALIFIED_LEADS");
  const [customLeadTypeName, setCustomLeadTypeName] = useState<string>(goal?.customLeadTypeName || "");
  const [leadSources, setLeadSources] = useState<LeadSource[]>(goal?.leadSources || ["SOCIAL"]);
  const [platforms, setPlatforms] = useState<string[]>(goal?.targetPlatforms || data.connectedPlatforms);
  const [articlesPerWeek, setArticlesPerWeek] = useState<number>(goal?.articlesPerWeek ?? 2);
  const [destinations, setDestinations] = useState<Record<string, string>>(goal?.ctaDestinations || {});
  const [acceptAggressive, setAcceptAggressive] = useState(false);
  const [restartWindow, setRestartWindow] = useState(false);

  const [measured, setMeasured] = useState<(GoalFeasibilityResult & { isMeasured: boolean; measuredNote?: string }) | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, startSaving] = useTransition();
  const [resetting, startResetting] = useTransition();

  const useSocial = leadSources.includes("SOCIAL");
  const useWebsite = leadSources.includes("WEBSITE");

  // Instant, offline verdict — recomputed on every change.
  const local = useMemo(
    () =>
      validateGoalFeasibility({
        leadTarget,
        timeframeDays,
        leadType,
        channelCount: platforms.length || data.connectedPlatforms.length || 1,
        leadSources,
        articlesPerWeek: useWebsite ? articlesPerWeek : undefined,
      }),
    [leadTarget, timeframeDays, leadType, platforms.length, leadSources, articlesPerWeek, useWebsite, data.connectedPlatforms.length]
  );

  const verdict = measured ?? local;

  // The server verdict replaces the benchmark one once real data exists.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setMeasured(null);
    if (!data.metrics.isMeasured) return;
    if (debounce.current) clearTimeout(debounce.current);
    setChecking(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await validateGoalAction(
          data.workspaceId,
          leadTarget,
          timeframeDays,
          leadType,
          leadSources,
          useWebsite ? articlesPerWeek : undefined
        );
        if (res?.isMeasured) setMeasured(res);
      } catch {
        /* the local verdict already covers the user */
      } finally {
        setChecking(false);
      }
    }, 500);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [leadTarget, timeframeDays, leadType, leadSources, articlesPerWeek, useWebsite, data.workspaceId, data.metrics.isMeasured]);

  useEffect(() => {
    setAcceptAggressive(false);
  }, [leadTarget, timeframeDays, leadSources]);

  const toggleSource = (src: LeadSource) => {
    setLeadSources((prev) => {
      const next = prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src];
      return next.length ? next : [src];
    });
  };

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const save = () => {
    startSaving(async () => {
      const res = await saveGrowthGoal(data.workspaceId, {
        leadTarget,
        leadType,
        customLeadTypeName: leadType === "CUSTOM" ? customLeadTypeName : null,
        timeframeDays,
        targetPlatforms: useSocial ? platforms : [],
        leadSources,
        ctaDestinations: destinations,
        articlesPerWeek: useWebsite ? articlesPerWeek : null,
        acceptAggressive,
        restartWindow,
      });

      if (!res.success) {
        onToast("error", res.error || "Could not save the goal.");
        if (res.feasibility) setMeasured({ ...res.feasibility, isMeasured: false });
        return;
      }

      onToast("success", "Goal saved. Build the plan next so the AI knows what to post.");
      setRestartWindow(false);
      onSaved();
      onGoToTab("plan");
    });
  };

  const reset = () => {
    startResetting(async () => {
      const res = await resetGrowthGoal(data.workspaceId);
      if (!res.success) {
        onToast("error", res.error || "Could not reset the goal.");
        return;
      }
      onToast("info", "Goal cleared. Nothing will be posted until you save a new one.");
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

  const levelTone =
    verdict.feasibilityLevel === "REALISTIC"
      ? "primary"
      : verdict.feasibilityLevel === "MODERATE"
        ? "secondary"
        : "danger";

  const blocked = verdict.feasibilityLevel === "HIGHLY_AGGRESSIVE" && !acceptAggressive;
  const noPlatform = useSocial && platforms.length === 0;

  return (
    <div className="space-y-5">
      {/* ───────────────────────── Target ───────────────────────── */}
      <SectionCard
        title="What do you want, and by when?"
        subtitle="The AI builds the whole posting plan from these two numbers. Be specific — the meter below tells you straight away whether it is achievable organically."
        icon={<Target className="w-4 h-4" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-foreground">How many leads?</span>
            <input
              type="number"
              min={1}
              value={leadTarget}
              onChange={(e) => setLeadTarget(Math.max(1, Math.round(Number(e.target.value) || 0)))}
              className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-foreground">In how many days?</span>
            <input
              type="number"
              min={1}
              max={365}
              value={timeframeDays}
              onChange={(e) =>
                setTimeframeDays(Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 0))))
              }
              className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="text-xs font-semibold text-foreground">What counts as a lead for you?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {LEAD_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setLeadType(t.value)}
                title={t.hint}
                className={`px-3 h-9 rounded-xl text-xs font-semibold border transition-colors ${
                  leadType === t.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {leadType === "CUSTOM" && (
            <input
              value={customLeadTypeName}
              onChange={(e) => setCustomLeadTypeName(e.target.value)}
              placeholder="Name it — e.g. demo requests, quote requests"
              className="mt-2 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </div>
      </SectionCard>

      {/* ───────────────────────── Feasibility ───────────────────────── */}
      <section
        className={`rounded-2xl border p-5 ${
          levelTone === "primary"
            ? "border-primary/30 bg-primary/5"
            : levelTone === "secondary"
              ? "border-secondary/30 bg-secondary/5"
              : "border-destructive/30 bg-destructive/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {levelTone === "danger" ? (
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            ) : levelTone === "secondary" ? (
              <Info className="w-5 h-5 text-secondary mt-0.5 shrink-0" />
            ) : (
              <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  {verdict.feasibilityLevel === "REALISTIC"
                    ? "Achievable"
                    : verdict.feasibilityLevel === "MODERATE"
                      ? "Ambitious but possible"
                      : "Not achievable organically"}
                </h3>
                {checking ? (
                  <Chip tone="muted" icon={<Loader2 className="w-3 h-3 animate-spin" />}>
                    Checking your data
                  </Chip>
                ) : verdict === measured ? (
                  <Chip tone="primary">Measured from your data</Chip>
                ) : (
                  <Chip tone="muted" title="You do not have enough tracked posts, clicks and leads yet, so this uses published organic benchmarks.">
                    Benchmark estimate
                  </Chip>
                )}
              </div>
              <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed">{verdict.explanation}</p>
              {(verdict as any).measuredNote && (
                <p className="text-[11px] text-muted-foreground mt-1">{(verdict as any).measuredNote}</p>
              )}
              {verdict.notes?.map((n, i) => (
                <p key={i} className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  • {n}
                </p>
              ))}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Expected range
            </p>
            <p className="text-xl font-bold text-foreground leading-tight">
              {verdict.estimatedRealisticMin}–{verdict.estimatedRealisticMax}
            </p>
            <p className="text-[11px] text-muted-foreground">
              in {timeframeDays} day{timeframeDays === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {verdict.sourceBreakdown && (useSocial || useWebsite) && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {useSocial && (
              <div className="rounded-xl border border-border bg-card px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  From social
                </p>
                <p className="text-sm font-bold text-foreground">
                  {verdict.sourceBreakdown.socialMin}–{verdict.sourceBreakdown.socialMax} leads
                </p>
              </div>
            )}
            {useWebsite && (
              <div className="rounded-xl border border-border bg-card px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  From website SEO
                </p>
                <p className="text-sm font-bold text-foreground">
                  {verdict.sourceBreakdown.websiteMin}–{verdict.sourceBreakdown.websiteMax} leads
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {verdict.sourceBreakdown.websiteEffectiveDays} of {timeframeDays} days can rank
                </p>
              </div>
            )}
          </div>
        )}

        {verdict.feasibilityLevel !== "REALISTIC" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLeadTarget(verdict.recommendedTarget);
                setAcceptAggressive(false);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Use {verdict.recommendedTarget} instead
            </button>
            <button
              type="button"
              onClick={() => setTimeframeDays(Math.min(365, timeframeDays * 2))}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/10"
            >
              Or give it {Math.min(365, timeframeDays * 2)} days
            </button>
            {verdict.feasibilityLevel === "HIGHLY_AGGRESSIVE" && (
              <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptAggressive}
                  onChange={(e) => setAcceptAggressive(e.target.checked)}
                  className="accent-[var(--color-primary)]"
                />
                I have seen the range and want to keep {leadTarget} anyway
              </label>
            )}
          </div>
        )}
      </section>

      {/* ───────────────────────── Sources ───────────────────────── */}
      <SectionCard
        title="Where should the leads come from?"
        subtitle="Pick one or both. Website adds AI-written SEO articles published straight to your own site."
        icon={<Share2 className="w-4 h-4" />}
        accent="secondary"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => toggleSource("SOCIAL")}
            className={`text-left rounded-xl border p-4 transition-colors ${
              useSocial ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Share2 className={`w-4 h-4 ${useSocial ? "text-primary" : "text-muted-foreground"}`} />
              Social media
              {useSocial && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
            </span>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Daily posts on your connected accounts, each carrying a tracked link so clicks and leads
              are counted for real.
            </p>
          </button>

          <button
            type="button"
            onClick={() => toggleSource("WEBSITE")}
            className={`text-left rounded-xl border p-4 transition-colors ${
              useWebsite ? "border-secondary bg-secondary/5" : "border-border hover:border-secondary/40"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Globe className={`w-4 h-4 ${useWebsite ? "text-secondary" : "text-muted-foreground"}`} />
              My website
              {useWebsite && <Check className="w-3.5 h-3.5 text-secondary ml-auto" />}
            </span>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              The AI picks trending keywords for your business and publishes schema-rich SEO articles to
              your site. Needs a WordPress connection and a small tag on your site.
            </p>
          </button>
        </div>

        {useWebsite && (
          <label className="block mt-4 max-w-xs">
            <span className="text-xs font-semibold text-foreground">Articles per week</span>
            <input
              type="number"
              min={1}
              max={7}
              value={articlesPerWeek}
              onChange={(e) =>
                setArticlesPerWeek(Math.max(1, Math.min(7, Math.round(Number(e.target.value) || 1))))
              }
              className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
            />
            <span className="text-[11px] text-muted-foreground">
              Each article is written, given JSON-LD schema and published without review.
            </span>
          </label>
        )}
      </SectionCard>

      {/* ───────────────────────── Platforms ───────────────────────── */}
      {useSocial && (
        <SectionCard
          title="Which accounts should it post to?"
          subtitle="Only connected accounts can be posted to — nothing is assumed."
          icon={<Plug className="w-4 h-4" />}
          actions={
            <a
              href="/dashboard/integrations"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Manage connections
            </a>
          }
        >
          {data.connectedPlatforms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-semibold text-foreground">No social account is connected.</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Autopilot cannot post anywhere until you connect at least one account. Connect one, or
                switch the lead source to Website only.
              </p>
              <a
                href="/dashboard/integrations"
                className="inline-flex items-center gap-1.5 h-9 px-3 mt-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
              >
                <Plug className="w-3.5 h-3.5" />
                Connect an account
              </a>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.connectedPlatforms.map((p) => {
                const on = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {on && <Check className="w-3 h-3" />}
                    {p}
                  </button>
                );
              })}
            </div>
          )}
          {noPlatform && data.connectedPlatforms.length > 0 && (
            <p className="text-[11px] text-destructive mt-3">
              Select at least one account, or remove Social as a lead source.
            </p>
          )}
        </SectionCard>
      )}

      {/* ───────────────────────── CTA links ───────────────────────── */}
      <SectionCard
        title="Where should the CTA send people?"
        subtitle="Every generated post gets a tracked short link pointing here. Without a link, a post cannot produce a countable lead."
        icon={<Link2 className="w-4 h-4" />}
        accent="secondary"
      >
        <DestinationRow
          label="Default link (used by every platform unless overridden)"
          value={destinations.default || ""}
          placeholder={data.website || "https://your-site.com/contact"}
          onSave={(v) => saveDestination("default", v)}
        />
        {useSocial &&
          platforms.map((p) => (
            <DestinationRow
              key={p}
              label={`${p} only (optional)`}
              value={destinations[p.toLowerCase()] || ""}
              placeholder="Leave empty to use the default link"
              onSave={(v) => saveDestination(p, v)}
            />
          ))}

        {!destinations.default && !data.website && (
          <p className="text-[11px] text-destructive mt-3 leading-relaxed">
            No default link is set and your workspace has no website saved, so generated posts will have
            no CTA link and no lead can be attributed to them.
          </p>
        )}
      </SectionCard>

      {/* ───────────────────────── Website channel setup ───────────────────────── */}
      {useWebsite && <WebsiteChannelCards data={data} onToast={onToast} onChanged={onSaved} />}

      {/* ───────────────────────── Save / Reset ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {goal ? "Update this goal" : "Save the goal"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {goal
              ? "Saving keeps your measured history. Tick restart if you want the counters to start again from today."
              : "Nothing is posted until you save the goal and build the plan."}
          </p>
          {goal && (
            <label className="inline-flex items-center gap-2 mt-2 text-[11px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={restartWindow}
                onChange={(e) => setRestartWindow(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              Restart the measurement window from today
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {goal && (
            <ConfirmButton
              onConfirm={reset}
              busy={resetting}
              label="Reset goal"
              confirmLabel="Delete it"
              icon={<Trash2 className="w-3 h-3" />}
              size="default"
            />
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || blocked || noPlatform}
            title={
              blocked
                ? "Tick the confirmation above, or lower the target."
                : noPlatform
                  ? "Select at least one account."
                  : "Save the goal"
            }
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {goal ? "Save changes" : "Save goal"}
          </button>
        </div>
      </div>

      {!data.hasBrandDNA && (
        <div className="rounded-2xl border border-secondary/30 bg-secondary/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Brand DNA is empty</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              The AI will not guess what your business does. Fill in your audience, tone and offer so the
              plan and captions are about your actual business.
            </p>
          </div>
          <a
            href="/dashboard/brand"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/90 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Set up Brand DNA
          </a>
        </div>
      )}
    </div>
  );
}

/** One CTA destination with Save ↔ Remove. */
function DestinationRow({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (value: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const dirty = draft.trim() !== value.trim();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const run = async (next: string) => {
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 last:mb-0">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-[14rem] h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => run(draft)}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              void run("");
            }}
            disabled={busy}
            title="Remove this link"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
