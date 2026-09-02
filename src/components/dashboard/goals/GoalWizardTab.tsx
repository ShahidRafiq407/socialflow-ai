"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Globe,
  Info,
  Loader2,
  Plug,
  Save,
  Share2,
  Sparkles,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import {
  goalLeadNoun,
  validateGoalFeasibility,
  type GoalFeasibilityResult,
  type LeadSource,
  type LeadType,
} from "@/lib/types/growth";
import {
  resetGrowthGoal,
  saveCtaDestination,
  saveGrowthGoal,
  validateGoalAction,
} from "@/actions/goals";
import { Chip, ConfirmButton, DestinationRow, InfoDot, SectionCard } from "./shared";
import { WebsiteStatusCards } from "./WebsiteChannelCards";
import type { GoalHQData } from "./types";

/**
 * Goal tab — three steps and nothing else: what you want, where it should come
 * from, and where the link should send people.
 *
 * Two things deliberately do not live here. Accounts and sites are connected in
 * Integrations and Plugins, so this tab only reports whether they are. And the
 * list of platforms is the AI's, not a checkbox list — ranked on your measured
 * results where they exist. Both are changed in the Social media tab, which is
 * where that decision belongs.
 */

/**
 * The only lead distinction that actually changes the forecast: whether you
 * count every enquiry, or just the sales-ready ones. Far fewer clicks turn into
 * a qualified lead, so that choice makes the plan ask for more posts. Everything
 * else people used to pick from — WhatsApp, form fills, phone taps — is simply
 * whatever the website tag happens to capture, not a separate target, so it is
 * no longer a button that pretends to change anything.
 */
const QUALITY: {
  value: "all" | "qualified";
  leadType: LeadType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "all",
    leadType: "LEADS",
    label: "Any enquiry",
    hint: "Every form fill, WhatsApp, email or phone tap your tag sees, plus any lead you confirm on a post.",
    icon: Users,
  },
  {
    value: "qualified",
    leadType: "QUALIFIED_LEADS",
    label: "Sales-qualified only",
    hint: "Only vetted, sales-ready enquiries. Fewer clicks become these, so the plan works harder.",
    icon: BadgeCheck,
  },
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
  // The lead "type" is now a single honest choice: count everything, or only
  // the sales-ready ones. An old goal saved with WhatsApp/Bookings/etc. all used
  // the same maths as "any enquiry", so it maps cleanly onto this bar.
  const [quality, setQuality] = useState<"all" | "qualified">(
    String(goal?.leadType) === "QUALIFIED_LEADS" ? "qualified" : "all"
  );
  const [customLeadTypeName, setCustomLeadTypeName] = useState<string>(goal?.customLeadTypeName || "");
  const leadType: LeadType = quality === "qualified" ? "QUALIFIED_LEADS" : "LEADS";
  const [leadSources, setLeadSources] = useState<LeadSource[]>(goal?.leadSources || ["SOCIAL"]);
  const [articlesPerWeek, setArticlesPerWeek] = useState<number>(goal?.articlesPerWeek ?? 2);
  const [destinations, setDestinations] = useState<Record<string, string>>(goal?.ctaDestinations || {});
  const [acceptAggressive, setAcceptAggressive] = useState(false);
  const [restartWindow, setRestartWindow] = useState(false);

  const [measured, setMeasured] = useState<
    (GoalFeasibilityResult & { isMeasured: boolean; measuredNote?: string }) | null
  >(null);
  const [checking, setChecking] = useState(false);
  const [saving, startSaving] = useTransition();
  const [resetting, startResetting] = useTransition();

  const useSocial = leadSources.includes("SOCIAL");
  const useWebsite = leadSources.includes("WEBSITE");

  // The line-up is the AI's, not a checkbox list. Anything already saved wins, so
  // a change made in the Social media tab is never silently undone by saving
  // here; otherwise the AI's shortlist of connected accounts is used.
  const aiPlatforms = useMemo<string[]>(() => {
    const saved = Array.isArray(goal?.targetPlatforms)
      ? goal.targetPlatforms.filter(Boolean).map(String)
      : [];
    if (saved.length) return saved;
    const picked = data.advice.suggestions
      .filter((s) => s.recommended && s.connected)
      .map((s) => s.label);
    return picked.length ? picked : data.connectedPlatforms;
  }, [goal?.targetPlatforms, data.advice.suggestions, data.connectedPlatforms]);

  // Instant, offline verdict — recomputed on every change.
  const local = useMemo(
    () =>
      validateGoalFeasibility({
        leadTarget,
        timeframeDays,
        leadType,
        channelCount: aiPlatforms.length || data.connectedPlatforms.length || 1,
        leadSources,
        articlesPerWeek: useWebsite ? articlesPerWeek : undefined,
      }),
    [
      leadTarget,
      timeframeDays,
      leadType,
      aiPlatforms.length,
      leadSources,
      articlesPerWeek,
      useWebsite,
      data.connectedPlatforms.length,
    ]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadTarget, timeframeDays, leadType, leadSources, articlesPerWeek, useWebsite, data.workspaceId, data.metrics.isMeasured]);

  useEffect(() => {
    setAcceptAggressive(false);
  }, [leadTarget, timeframeDays, leadSources]);

  const toggleSource = (src: LeadSource) => {
    setLeadSources((prev) => {
      const next = prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src];
      // One source has to stay on, otherwise the goal has nowhere to come from.
      return next.length ? next : [src];
    });
  };

  const save = () => {
    startSaving(async () => {
      const res = await saveGrowthGoal(data.workspaceId, {
        leadTarget,
        leadType,
        customLeadTypeName: customLeadTypeName.trim() || null,
        timeframeDays,
        targetPlatforms: useSocial ? aiPlatforms : [],
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

      onToast("success", "Goal saved. Next: build the plan so the AI knows what to post.");
      setRestartWindow(false);
      onSaved();
      onGoToTab(useSocial ? "plan" : "seo");
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
  // Website-only goals need no account, so an empty line-up only blocks a
  // social goal.
  const noPlatform = useSocial && !useWebsite && aiPlatforms.length === 0;

  return (
    <div className="space-y-5">
      {/* ───────────────────────── Step 1 · Target ───────────────────────── */}
      <SectionCard
        title="Step 1 — What do you want, and by when?"
        subtitle="Two numbers. Everything else on this page is worked out from them."
        icon={<Target className="w-4 h-4" />}
        info="The AI turns these two numbers into a posting plan: how many posts a week it takes, on which accounts, and what they should be about. Change them any time and the plan is rebuilt."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
              How many leads?
              <InfoDot text="A lead only counts once it is confirmed — by your website tag, or by you pressing 'Lead came in' on a post. Clicks are counted automatically and are shown separately, because a click is not a lead." />
            </span>
            <input
              type="number"
              min={1}
              value={leadTarget}
              onChange={(e) => setLeadTarget(Math.max(1, Math.round(Number(e.target.value) || 0)))}
              className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          <label className="block">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
              In how many days?
              <InfoDot text="The clock starts the day you save. Organic reach builds slowly, so a longer window needs fewer posts a day for the same result — the meter below shows exactly what each choice costs you." />
            </span>
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
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            What counts as a lead?
            <InfoDot text="This is the one thing that changes the forecast. 'Any enquiry' counts every form fill, WhatsApp, email or phone tap your website tag sees, plus any lead you confirm on a post. 'Sales-qualified only' counts just the vetted, sales-ready ones — far fewer clicks become those, so the plan asks for more posts to reach the same number." />
          </span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {QUALITY.map((q) => {
              const active = quality === q.value;
              const Icon = q.icon;
              return (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => setQuality(q.value)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    {q.label}
                    {active && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{q.hint}</p>
                </button>
              );
            })}
          </div>
          <label className="mt-3 block">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              Call it something specific? (optional)
              <InfoDot text="Only changes the wording shown on this page — e.g. 'demo requests' instead of 'leads'. It does not change what is counted or the forecast." />
            </span>
            <input
              value={customLeadTypeName}
              onChange={(e) => setCustomLeadTypeName(e.target.value)}
              placeholder="e.g. demo requests, quote requests"
              className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>
      </SectionCard>

      {/* ───────────────────── Is it achievable? ───────────────────── */}
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
                <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
                  {verdict.feasibilityLevel === "REALISTIC"
                    ? "Achievable"
                    : verdict.feasibilityLevel === "MODERATE"
                      ? "Ambitious but possible"
                      : "Not achievable organically"}
                  <InfoDot text="This is the honest answer, not encouragement. It is worked out from how many people click a post and how many of those clicks turn into your kind of lead. If the target cannot be reached without paid ads, it says so and offers a number that can." />
                </h3>
                {checking ? (
                  <Chip tone="muted" icon={<Loader2 className="w-3 h-3 animate-spin" />}>
                    Checking your data
                  </Chip>
                ) : verdict === measured ? (
                  <Chip
                    tone="primary"
                    title="Worked out from your own clicks and confirmed leads, not from a benchmark."
                  >
                    Measured from your data
                  </Chip>
                ) : (
                  <Chip
                    tone="muted"
                    title="You do not have enough tracked posts, clicks and leads yet, so this uses published organic benchmarks. It switches to your own numbers automatically."
                  >
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
            <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Expected range
              <InfoDot
                align="right"
                text="What this plan is likely to actually produce in your window. If your target sits above this range, the number to trust is this one."
              />
            </p>
            <p className="text-xl font-bold text-foreground leading-tight">
              {verdict.estimatedRealisticMin}–{verdict.estimatedRealisticMax}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {goalLeadNoun(leadType, customLeadTypeName)} in {timeframeDays} day{timeframeDays === 1 ? "" : "s"}
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
                <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  From website SEO
                  <InfoDot text="An article does not rank the day it is published. Only the days left after that delay can realistically bring leads, which is why this number is lower than the social one on short windows." />
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

      {/* ───────────────────── Step 2 · Where from ───────────────────── */}
      <SectionCard
        title="Step 2 — Where should the leads come from?"
        subtitle="There are two places, and you can use both. Pick one and only that channel is planned, posted and counted."
        icon={<Share2 className="w-4 h-4" />}
        accent="secondary"
        info="This choice decides which tabs above do anything. Social media means daily posts on your connected accounts. Website means SEO articles published to your own site. Turning one off stops it completely — nothing is posted there and nothing is counted from it."
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
              The AI picks trending keywords for your business and publishes SEO articles to your own
              site.
            </p>
          </button>
        </div>

        {/* What the AI will actually post to — not a checkbox list */}
        {useSocial && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
            <p className="inline-flex flex-wrap items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="w-3.5 h-3.5 text-secondary" />
              The AI will post to
              <InfoDot text="You do not have to guess at a checkbox list. Accounts are ranked by the clicks and leads they have actually produced for you, and where you have none, by your industry, your lead type and whether a link in the caption is clickable on that platform. Add or remove any of them in the Social media tab." />
            </p>
            {aiPlatforms.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {aiPlatforms.map((p) => (
                  <Chip key={p} tone="primary">
                    {p}
                  </Chip>
                ))}
                <button
                  type="button"
                  onClick={() => onGoToTab("social")}
                  className="ml-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  Change or remove
                </button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="inline-flex items-center gap-1.5 text-[11px] text-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  No social account is connected, so nothing can be posted yet.
                </p>
                <a
                  href="/dashboard/integrations"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90"
                >
                  <Plug className="w-3 h-3" />
                  Connect an account
                </a>
              </div>
            )}
          </div>
        )}

        {/* How many articles a week — only meaningful for the website channel */}
        {useWebsite && (
          <div className="mt-4 space-y-3">
            <label className="block max-w-xs">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                Articles per week
                <InfoDot text="How many SEO articles the AI writes and publishes to your site each week. More articles means more chances to rank, but each one still needs weeks before search traffic arrives — the range above already accounts for that delay." />
              </span>
              <input
                type="number"
                min={1}
                max={7}
                value={articlesPerWeek}
                onChange={(e) =>
                  setArticlesPerWeek(Math.max(1, Math.min(7, Math.round(Number(e.target.value) || 0))))
                }
                className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </label>
            <WebsiteStatusCards data={data} />
          </div>
        )}
      </SectionCard>

      {/* ───────────────────── Step 3 · Where the link goes ───────────────────── */}
      <SectionCard
        title="Step 3 — Where should the link send people?"
        subtitle="One link. Every post carries a tracked version of it, which is how a click becomes a countable lead."
        icon={<Sparkles className="w-4 h-4" />}
        info="A post without a link can be liked but cannot produce a lead you can trace. The AI never writes a raw URL into a caption — it wraps this address in a short tracked link, so the redirect is counted here and the visitor still lands on your page."
      >
        <DestinationRow
          label="Default link for every post"
          value={destinations.default || ""}
          placeholder={data.website || "https://your-site.com/contact"}
          info="Send people to the page where they can actually become a lead — a contact page, a booking page or a WhatsApp link. If you leave it empty, your website address is used when you have one."
          onSave={(value) => saveDestination("default", value)}
        />

        {!destinations.default && !data.website && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-[11px] text-foreground leading-relaxed">
              There is no link to send people to yet, so posts can be published but no click or lead
              can be attributed to them. Add one above before turning Autopilot on.
            </p>
          </div>
        )}

        {useSocial && (
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Want a different link on one platform?{" "}
            <button
              type="button"
              onClick={() => onGoToTab("social")}
              className="font-semibold text-primary hover:underline"
            >
              Set a per-account override in the Social media tab
            </button>
            .
          </p>
        )}
      </SectionCard>

      {/* ───────────────────── Save ↔ Reset ───────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || blocked || noPlatform}
          title={
            blocked
              ? "Tick the box above to keep this target, or use the recommended one."
              : noPlatform
                ? "Connect a social account, or add your website as a lead source."
                : "Save the goal"
          }
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {goal ? "Save changes" : "Save goal"}
        </button>

        {goal && (
          <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={restartWindow}
              onChange={(e) => setRestartWindow(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            Start the {timeframeDays}-day window again from today
            <InfoDot text="Leave this off and the clock keeps running from the day you first saved. Tick it and today becomes day one — your leads and posts are kept, only the deadline and the pace are recalculated." />
          </label>
        )}

        <span className="ml-auto inline-flex items-center gap-2">
          {goal && (
            <ConfirmButton
              onConfirm={reset}
              busy={resetting}
              label="Delete goal"
              confirmLabel="Delete it"
              icon={<Trash2 className="w-3 h-3" />}
            />
          )}
          <InfoDot
            align="right"
            text="Deleting the goal stops everything: no plan, no daily posts, no articles. Your published posts, their live links, your clicks and your leads are all kept — only the target and its plan are removed."
          />
        </span>
      </div>

      {(blocked || noPlatform) && (
        <p className="flex items-start gap-2 text-[11px] text-destructive leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {blocked
            ? "This target cannot be reached organically. Use the recommended number, give it more days, or tick the box to keep it anyway."
            : "Connect at least one social account in Integrations, or turn on your website as a lead source above."}
        </p>
      )}
    </div>
  );
}
