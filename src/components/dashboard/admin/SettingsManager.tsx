"use client";

// ============================================================================
// SETTINGS MANAGER
//
// Two forms and a raw table. The flags are product switches with a fixed
// shape; the affiliate terms are the four numbers the program quotes. The raw
// table at the bottom is every setting row as stored, secrets masked, so an
// operator can see the whole state in one place.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AffiliateTerms, FeatureFlags, SettingValue } from "@/lib/admin/runtimeConfig";
import { saveAffiliateTermsAction, saveFlagsAction } from "@/actions/admin";
import { Section, fmtAgo } from "./primitives";

const FLAG_COPY: Array<{ key: keyof FeatureFlags; label: string; hint: string }> = [
  { key: "maintenanceEnabled", label: "Maintenance banner", hint: "Shows a banner to every signed-in user. Nothing is blocked." },
  { key: "affiliateEnabled", label: "Affiliate program", hint: "Hides the Affiliate tab and stops attributing new referrals." },
  { key: "trialEnabled", label: "Trial offer", hint: "Hides the trial button even when its Lemon Squeezy variant is configured." },
  { key: "topUpsEnabled", label: "Credit top-ups", hint: "Hides top-up packs even when their variants are configured." },
  { key: "chatModelPickerEnabled", label: "Chat model picker", hint: "Off pins every chat to the default brain." },
  { key: "chatFeedbackEnabled", label: "Chat feedback", hint: "Shows thumbs up / down under assistant answers." },
];

function useSave<T>(action: (v: T) => Promise<{ success: boolean; error?: string }>) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (value: T) => {
    setBusy(true);
    setError(null);
    const result = await action(value);
    setBusy(false);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      startTransition(() => router.refresh());
    } else setError(result.error || "Could not save.");
  };
  return { busy, saved, error, save };
}

export function SettingsManager({
  flags: initialFlags,
  terms: initialTerms,
  rows,
}: {
  flags: FeatureFlags;
  terms: AffiliateTerms;
  rows: Array<{ key: string; value: SettingValue; secret: boolean; updatedAt: string; updatedBy: string | null }>;
}) {
  const [flags, setFlags] = useState(initialFlags);
  const [terms, setTerms] = useState(initialTerms);
  const flagSave = useSave(saveFlagsAction);
  const termSave = useSave(saveAffiliateTermsAction);

  const flagsDirty = JSON.stringify(flags) !== JSON.stringify(initialFlags);
  const termsDirty = JSON.stringify(terms) !== JSON.stringify(initialTerms);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Feature flags"
          description="Product switches. Applied within ten seconds on every instance."
          action={
            <Button size="sm" disabled={flagSave.busy || !flagsDirty} onClick={() => flagSave.save(flags)}>
              {flagSave.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : flagSave.saved ? <Check className="h-3.5 w-3.5" /> : null} Save
            </Button>
          }
        >
          {flagSave.error && <div className="mb-2 text-xs text-rose-600 dark:text-rose-400">{flagSave.error}</div>}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {FLAG_COPY.map((f) => (
              <li key={f.key} className="flex items-start gap-3 py-2.5">
                <input
                  id={`flag-${f.key}`}
                  type="checkbox"
                  className="mt-0.5"
                  checked={flags[f.key] as boolean}
                  onChange={(e) => setFlags((cur) => ({ ...cur, [f.key]: e.target.checked }))}
                />
                <label htmlFor={`flag-${f.key}`} className="min-w-0 flex-1 cursor-pointer">
                  <div className="text-xs font-medium">{f.label}</div>
                  <div className="text-[11px] text-muted-foreground">{f.hint}</div>
                </label>
              </li>
            ))}
          </ul>
          {flags.maintenanceEnabled && (
            <label className="mt-2 block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Maintenance message</span>
              <Textarea
                value={flags.maintenanceMessage}
                onChange={(e) => setFlags((cur) => ({ ...cur, maintenanceMessage: e.target.value }))}
                placeholder="We're upgrading the publishing pipeline tonight between 02:00 and 03:00 UTC."
                className="min-h-[60px] text-xs"
                maxLength={500}
              />
            </label>
          )}
        </Section>

        <Section
          title="Affiliate terms"
          description="What a referral earns and when it can be withdrawn. Existing commissions keep the terms they were created under."
          action={
            <Button size="sm" disabled={termSave.busy || !termsDirty} onClick={() => termSave.save(terms)}>
              {termSave.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : termSave.saved ? <Check className="h-3.5 w-3.5" /> : null} Save
            </Button>
          }
        >
          {termSave.error && <div className="mb-2 text-xs text-rose-600 dark:text-rose-400">{termSave.error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Commission %</span>
              <Input type="number" min={0} max={100} value={terms.commissionPercent} onChange={(e) => setTerms((t) => ({ ...t, commissionPercent: Number(e.target.value) }))} className="h-8 text-xs" />
              <span className="block text-[10px] text-muted-foreground">Share of the referred user&apos;s first payment.</span>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Flat floor (USD)</span>
              <Input type="number" min={0} step="0.01" value={terms.flatCommissionCents / 100} onChange={(e) => setTerms((t) => ({ ...t, flatCommissionCents: Math.round(Number(e.target.value) * 100) }))} className="h-8 text-xs" />
              <span className="block text-[10px] text-muted-foreground">The larger of this and the percentage is paid.</span>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Minimum payout (USD)</span>
              <Input type="number" min={0} step="0.01" value={terms.minPayoutCents / 100} onChange={(e) => setTerms((t) => ({ ...t, minPayoutCents: Math.round(Number(e.target.value) * 100) }))} className="h-8 text-xs" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Lock period (days)</span>
              <Input type="number" min={0} max={365} value={terms.lockDays} onChange={(e) => setTerms((t) => ({ ...t, lockDays: Number(e.target.value) }))} className="h-8 text-xs" />
              <span className="block text-[10px] text-muted-foreground">Refund window before a commission becomes withdrawable.</span>
            </label>
          </div>
        </Section>
      </div>

      <Section title="All stored settings" description="Every row in AppSetting as the product reads it. Secrets are masked.">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nothing stored yet — the product is running on its code defaults.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">Key</th>
                  <th className="py-1 pr-2 font-medium">Value</th>
                  <th className="py-1 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-1.5 pr-2 font-mono">{r.key}</td>
                    <td className="max-w-[480px] py-1.5 pr-2">
                      <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
                        {r.secret ? String(r.value) : JSON.stringify(r.value, null, 1)}
                      </pre>
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-muted-foreground">
                      {fmtAgo(r.updatedAt)}
                      {r.updatedBy ? ` · ${r.updatedBy}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
