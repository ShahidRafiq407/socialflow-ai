"use client";

// ============================================================================
// ADMIN PRIMITIVES
//
// The small pieces every back-office screen is built from: a stat tile, a
// section card, a tiny bar chart with no chart library, and the formatters
// that keep money and dates consistent across pages. Client-safe on purpose so
// server pages and client tables can share them.
// ============================================================================

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";

export function fmtUsd(cents: number, opts: { compact?: boolean } = {}): string {
  const usd = cents / 100;
  if (opts.compact && Math.abs(usd) >= 1000) {
    return `$${(usd / 1000).toFixed(1)}k`;
  }
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMicros(micros: number): string {
  return fmtUsd(Math.round(micros / 10_000));
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDay(iso);
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Bars, no library. `format` turns a value into the hover title. */
export function Bars({
  points,
  format,
  color = "bg-primary/70",
  height = 72,
}: {
  points: Array<{ day: string; value: number }>;
  format: (v: number) => string;
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  if (points.length === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {points.map((p) => (
        <div
          key={p.day}
          title={`${p.day}: ${format(p.value)}`}
          className={`flex-1 rounded-t-sm ${p.value > 0 ? color : "bg-slate-200 dark:bg-slate-800"}`}
          style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-all">{children}</span>
    </div>
  );
}

export const PLAN_BADGE: Record<string, string> = {
  FREE: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  TRIAL: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  GO: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PRO: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  AGENCY: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export function PlanPill({ plan }: { plan: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${PLAN_BADGE[plan] ?? PLAN_BADGE.FREE}`}>
      {plan}
    </span>
  );
}
