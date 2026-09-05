"use client";

// ============================================================================
// PLANS EDITOR
//
// One card per tier. The form is seeded from the live values; saving writes
// only the fields that differ from the code default, so an override stays a
// small, readable diff. "Reset" deletes the override for that tier.
// ============================================================================

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FeatureKey, PlanOverride, PlanTier } from "@/lib/billing/plans";
import { savePlanOverrideAction } from "@/actions/admin";
import { PlanPill, Section } from "./primitives";

export interface PlanValues {
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  monthlyCredits: number;
  workspaces: number;
  socialAccountsPerWorkspace: number;
  storageMb: number;
  analyticsRetentionDays: number;
  seats: number;
  chatMaxToolLoops: number;
  imageQuality: "standard" | "premium";
  canBuyTopUps: boolean;
  features: string[];
  caps: Partial<Record<string, number>>;
}

export interface PlanSnapshot {
  tier: PlanTier;
  override: PlanOverride | null;
  live: PlanValues;
  base: PlanValues;
}

const NUMBER_FIELDS: Array<{ key: keyof PlanValues; label: string; hint?: string }> = [
  { key: "priceMonthly", label: "Price / month (USD)" },
  { key: "priceYearly", label: "Price / year (USD)" },
  { key: "monthlyCredits", label: "Monthly credits" },
  { key: "workspaces", label: "Workspaces", hint: "-1 = unlimited" },
  { key: "socialAccountsPerWorkspace", label: "Social accounts / workspace" },
  { key: "storageMb", label: "Storage (MB)" },
  { key: "analyticsRetentionDays", label: "Analytics retention (days)" },
  { key: "seats", label: "Seats" },
  { key: "chatMaxToolLoops", label: "Chat tool rounds / turn" },
];

function diff(values: PlanValues, base: PlanValues): PlanOverride {
  const out: PlanOverride = {};
  if (values.name.trim() && values.name !== base.name) out.name = values.name.trim();
  if (values.tagline.trim() && values.tagline !== base.tagline) out.tagline = values.tagline.trim();
  for (const f of NUMBER_FIELDS) {
    const key = f.key as keyof PlanOverride;
    if (values[f.key] !== base[f.key]) (out as Record<string, unknown>)[key] = values[f.key];
  }
  if (values.imageQuality !== base.imageQuality) out.imageQuality = values.imageQuality;
  if (values.canBuyTopUps !== base.canBuyTopUps) out.canBuyTopUps = values.canBuyTopUps;
  const sameFeatures = values.features.length === base.features.length && values.features.every((f) => base.features.includes(f));
  if (!sameFeatures) out.features = values.features as FeatureKey[];
  const capKeys = new Set([...Object.keys(values.caps), ...Object.keys(base.caps)]);
  const sameCaps = [...capKeys].every((k) => values.caps[k] === base.caps[k]);
  if (!sameCaps) out.caps = values.caps as PlanOverride["caps"];
  return out;
}

/**
 * A stamp of what the SERVER currently says this tier is.
 *
 * Used as the card's React key so the form re-seeds when the stored values change.
 * `PlanCard` copies `plan.live` into state once, and after a save the refreshed props
 * arrived while the state kept the numbers that had been typed — so a cap the save
 * had actually dropped stayed on screen, and re-saving from that stale form wrote it
 * back. Typing does not change this string, so an edit in progress is never lost;
 * only a real change on the server remounts the card.
 */
function liveSignature(plan: PlanSnapshot): string {
  return JSON.stringify([plan.live, plan.override]);
}

export function PlansEditor({
  plans,
  featureKeys,
  featureLabels,
}: {
  plans: PlanSnapshot[];
  featureKeys: string[];
  featureLabels: Record<string, string>;
}) {
  return (
    <Tabs defaultValue={plans.find((p) => p.tier === "GO")?.tier ?? plans[0].tier}>
      <TabsList className="mb-4 h-8">
        {plans.map((p) => (
          <TabsTrigger key={p.tier} value={p.tier} className="text-xs">
            {p.tier}
            {p.override && Object.keys(p.override).length > 0 && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />}
          </TabsTrigger>
        ))}
      </TabsList>
      {plans.map((p) => (
        <TabsContent key={p.tier} value={p.tier}>
          <PlanCard
            key={liveSignature(p)}
            plan={p}
            featureKeys={featureKeys}
            featureLabels={featureLabels}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PlanCard({ plan, featureKeys, featureLabels }: { plan: PlanSnapshot; featureKeys: string[]; featureLabels: Record<string, string> }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [values, setValues] = useState<PlanValues>(plan.live);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const pending = diff(values, plan.base);
  const overridden = plan.override && Object.keys(plan.override).length > 0;

  const set = <K extends keyof PlanValues>(key: K, v: PlanValues[K]) => setValues((cur) => ({ ...cur, [key]: v }));

  const submit = async (override: PlanOverride | null) => {
    setBusy(override === null ? "reset" : "save");
    setError(null);
    const result = await savePlanOverrideAction({ plan: plan.tier, override });
    setBusy(null);
    if (result.success) {
      setSaved(true);
      if (override === null) setValues(plan.base);
      setTimeout(() => setSaved(false), 1800);
      startTransition(() => router.refresh());
    } else setError(result.error || "Could not save.");
  };

  const changed = (key: keyof PlanValues) => JSON.stringify(values[key]) !== JSON.stringify(plan.base[key]);
  const mark = (key: keyof PlanValues): ReactNode =>
    changed(key) ? <span className="ml-1 text-[10px] text-primary">(default {typeof plan.base[key] === "object" ? "differs" : String(plan.base[key])})</span> : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PlanPill plan={plan.tier} />
        <span className="text-sm font-semibold">{values.name}</span>
        {overridden ? <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">overridden</Badge> : <Badge variant="outline" className="text-[10px]">code defaults</Badge>}
        <div className="ml-auto flex gap-2">
          {overridden && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => submit(null)}>
              {busy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reset to defaults
            </Button>
          )}
          <Button size="sm" disabled={busy !== null || Object.keys(pending).length === 0} onClick={() => submit(pending)}>
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
            Save {Object.keys(pending).length > 0 ? `${Object.keys(pending).length} change${Object.keys(pending).length === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </div>
      {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Pricing and limits">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-muted-foreground">Name{mark("name")}</span>
              <Input value={values.name} onChange={(e) => set("name", e.target.value)} className="h-8 text-xs" />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-muted-foreground">Tagline{mark("tagline")}</span>
              <Input value={values.tagline} onChange={(e) => set("tagline", e.target.value)} className="h-8 text-xs" />
            </label>
            {NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {f.label}
                  {mark(f.key)}
                </span>
                <Input type="number" value={values[f.key] as number} onChange={(e) => set(f.key, Number(e.target.value) as never)} className="h-8 text-xs" />
                {f.hint && <span className="block text-[10px] text-muted-foreground">{f.hint}</span>}
              </label>
            ))}
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Image quality{mark("imageQuality")}</span>
              <select value={values.imageQuality} onChange={(e) => set("imageQuality", e.target.value as PlanValues["imageQuality"])} className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30">
                <option value="standard">standard</option>
                <option value="premium">premium</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5 text-xs">
              <input type="checkbox" checked={values.canBuyTopUps} onChange={(e) => set("canBuyTopUps", e.target.checked)} /> Can buy top-ups{mark("canBuyTopUps")}
            </label>
          </div>
        </Section>

        <Section title="Features and caps" description="Tick a feature to include it. A cap is a hard per-period ceiling; blank = only limited by credits, -1 = unlimited.">
          <ul className="max-h-[560px] space-y-1 overflow-auto pr-1">
            {featureKeys.map((key) => {
              const on = values.features.includes(key);
              const baseOn = plan.base.features.includes(key);
              const cap = values.caps[key];
              return (
                <li key={key} className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs ${on !== baseOn ? "bg-primary/5" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const next = e.target.checked ? [...values.features, key] : values.features.filter((f) => f !== key);
                      set("features", next);
                      if (!e.target.checked) {
                        const caps = { ...values.caps };
                        delete caps[key];
                        set("caps", caps);
                      }
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate" title={key}>
                    {featureLabels[key] ?? key} <span className="font-mono text-[10px] text-muted-foreground">{key}</span>
                  </span>
                  <Input
                    type="number"
                    disabled={!on}
                    value={cap ?? ""}
                    placeholder="cap"
                    onChange={(e) => {
                      const caps = { ...values.caps };
                      if (e.target.value.trim() === "") delete caps[key];
                      else caps[key] = Number(e.target.value);
                      set("caps", caps);
                    }}
                    className={`h-7 w-20 text-xs ${cap !== plan.base.caps[key] ? "border-primary/50" : ""}`}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}
