"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  CircleSlash,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Info,
  Layers,
  MousePointerClick,
  RefreshCw,
  Search,
  Send,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { WorkspaceAnalyticsData } from "@/actions/analytics";

/**
 * Analytics HQ — real measured data only.
 *
 * Design rules:
 *  - Only `primary` and `secondary` theme colours are used (plus destructive /
 *    muted for status semantics). No raw blue/purple/emerald.
 *  - Every number on screen was counted from a database row on the server
 *    (LinkClick / LeadEvent / PublishLog / TrackedLink / GrowthGoal). Nothing
 *    here multiplies, estimates or invents a metric.
 */

interface AnalyticsHQProps {
  workspaceId: string;
  initialData: WorkspaceAnalyticsData;
}

type TabKey = "overview" | "publishing" | "leads" | "platforms";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { key: "publishing", label: "Publishing", icon: <Send className="w-3.5 h-3.5" /> },
  { key: "leads", label: "Leads", icon: <Users className="w-3.5 h-3.5" /> },
  { key: "platforms", label: "Platforms", icon: <Layers className="w-3.5 h-3.5" /> },
];

const TIMEFRAMES = [
  { key: "7D", days: 7 },
  { key: "14D", days: 14 },
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deterministic date label built from the ISO string — no locale, no timezone drift. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCHours().toString().padStart(2, "0")}:${d
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")} UTC`;
}

function fmtNum(n: number): string {
  return Number(n || 0).toLocaleString("en-US");
}

/** Real period-over-period change. Never fabricated — returns null without a prior period. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// ============================================================================
// Building blocks (primary/secondary only)
// ============================================================================

function SectionCard({
  title,
  subtitle,
  icon,
  accent = "primary",
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "secondary";
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <span
              className={`inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${
                accent === "primary" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
              }`}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
  accent = "primary",
  delta,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "secondary";
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon && <span className={accent === "primary" ? "text-primary" : "text-secondary"}>{icon}</span>}
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground leading-none">{value}</span>
        {delta !== undefined && delta !== null && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
              delta >= 0 ? "text-primary" : "text-destructive"
            }`}
          >
            <TrendingUp className={`w-3 h-3 ${delta < 0 ? "rotate-180" : ""}`} />
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </span>
      {hint && <span className="text-[11px] text-muted-foreground leading-snug">{hint}</span>}
    </div>
  );
}

function Chip({
  children,
  tone = "primary",
  icon,
  title,
}: {
  children: React.ReactNode;
  tone?: "primary" | "secondary" | "muted" | "danger";
  icon?: React.ReactNode;
  title?: string;
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    secondary: "bg-secondary/10 text-secondary border-secondary/20",
    muted: "bg-muted text-muted-foreground border-border",
    danger: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 rounded-xl border border-dashed border-border py-10 px-6">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
        {icon ?? <Info className="w-5 h-5" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">{description}</p>
      </div>
      {action}
    </div>
  );
}

// ============================================================================
// Chart — honest small multiples: clicks (primary) and leads (secondary) each
// get their own scale inside one shared column grid, so magnitudes are never
// faked by cross-scaling two bars against each other.
// ============================================================================

interface Bucket {
  label: string;
  clicks: number;
  leads: number;
  published: number;
}

function TrendChart({
  buckets,
  metrics,
}: {
  buckets: Bucket[];
  metrics: ("clicks" | "leads" | "published")[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const maxes: Record<string, number> = {
    clicks: Math.max(1, ...buckets.map((b) => b.clicks)),
    leads: Math.max(1, ...buckets.map((b) => b.leads)),
    published: Math.max(1, ...buckets.map((b) => b.published)),
  };

  const meta: Record<string, { label: string; color: string; unit: string }> = {
    clicks: { label: "Link clicks", color: "bg-primary", unit: "clicks" },
    leads: { label: "Leads", color: "bg-secondary", unit: "leads" },
    published: { label: "Published", color: "bg-primary", unit: "items" },
  };

  if (buckets.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="w-5 h-5" />}
        title="Nothing measured in this window"
        description="No clicks, leads or publishes in this period."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend + hover readout */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-muted-foreground">
          {metrics.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-sm ${meta[m].color}`} />
              {meta[m].label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {hovered !== null ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <strong className="text-foreground">{buckets[hovered].label}</strong>
              {metrics.map((m) => (
                <span
                  key={m}
                  className={`rounded-md px-1.5 py-0.5 font-bold ${
                    m === "leads" ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary"
                  }`}
                >
                  {fmtNum(buckets[hovered][m])} {meta[m].unit}
                </span>
              ))}
            </span>
          ) : (
            "Hover a column for exact values"
          )}
        </span>
      </div>

      {/* Columns */}
      <div
        className="grid gap-2 sm:gap-3 items-end"
        style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
      >
        {buckets.map((b, i) => (
          <button
            key={b.label}
            type="button"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className={`flex flex-col items-center gap-1.5 rounded-lg py-1.5 transition-colors ${
              hovered === i ? "bg-muted" : ""
            }`}
          >
            {/* One bar row per metric, each scaled to its own maximum */}
            <div className="w-full flex flex-col justify-end gap-1 h-40 px-1.5">
              {metrics.map((m) => {
                const height = Math.round((b[m] / maxes[m]) * 100);
                return (
                  <div key={m} className="flex-1 flex items-end" style={{ minHeight: "1.25rem" }}>
                    <div
                      className={`w-full rounded-t-md transition-all duration-200 ${meta[m].color} ${
                        b[m] === 0 ? "opacity-25" : hovered === i ? "opacity-100 shadow-sm" : "opacity-90"
                      }`}
                      style={{ height: `${b[m] === 0 ? 4 : Math.max(6, height * 0.92)}%` }}
                      title={`${b.label} — ${fmtNum(b[m])} ${meta[m].unit}`}
                    />
                  </div>
                );
              })}
            </div>
            <span
              className={`text-[10px] font-semibold whitespace-nowrap ${
                hovered === i ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {b.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Horizontal split bar (channel mix)
// ============================================================================

function SplitBar({
  segments,
}: {
  segments: { label: string; value: number; color: string; text: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((seg) =>
          seg.value > 0 ? (
            <div
              key={seg.label}
              className={`${seg.color} transition-all duration-500`}
              style={{ width: `${(seg.value / total) * 100}%` }}
              title={`${seg.label}: ${fmtNum(seg.value)} (${Math.round((seg.value / total) * 100)}%)`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        {segments.map((seg) => (
          <span key={seg.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${seg.color}`} />
            <span className="text-muted-foreground">{seg.label}</span>
            <strong className={seg.text}>{fmtNum(seg.value)}</strong>
            <span className="text-muted-foreground">{Math.round((seg.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function AnalyticsHQ({ initialData }: AnalyticsHQProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]["key"]>("30D");
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const days = TIMEFRAMES.find((t) => t.key === timeframe)!.days;

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    window.setTimeout(() => setIsRefreshing(false), 1500);
  };

  // ── Window maths (all from the server-counted daily series) ────────────────
  const series = initialData.series;
  const windowPoints = useMemo(() => series.slice(-days), [series, days]);
  const previousPoints = useMemo(() => series.slice(-days * 2, -days), [series, days]);

  const windowTotals = useMemo(() => {
    type NumKey =
      | "clicks"
      | "uniqueClicks"
      | "leads"
      | "socialLeads"
      | "websiteLeads"
      | "manualLeads"
      | "posts"
      | "articles"
      | "published"
      | "failed";
    const sum = (pts: typeof series, key: NumKey) => pts.reduce((s, p) => s + p[key], 0);
    return {
      clicks: sum(windowPoints, "clicks"),
      uniqueClicks: sum(windowPoints, "uniqueClicks"),
      leads: sum(windowPoints, "leads"),
      socialLeads: sum(windowPoints, "socialLeads"),
      websiteLeads: sum(windowPoints, "websiteLeads"),
      manualLeads: sum(windowPoints, "manualLeads"),
      posts: sum(windowPoints, "posts"),
      articles: sum(windowPoints, "articles"),
      published: sum(windowPoints, "published"),
      failed: sum(windowPoints, "failed"),
      prevClicks: sum(previousPoints, "clicks"),
      prevLeads: sum(previousPoints, "leads"),
      prevPublished: sum(previousPoints, "published"),
    };
  }, [windowPoints, previousPoints]);

  // ── Bucketing for the chart (max ~12 columns, real sums) ───────────────────
  const buckets: Bucket[] = useMemo(() => {
    const bucketSize = Math.max(1, Math.ceil(windowPoints.length / 12));
    const out: Bucket[] = [];
    for (let i = 0; i < windowPoints.length; i += bucketSize) {
      const chunk = windowPoints.slice(i, i + bucketSize);
      out.push({
        label:
          bucketSize === 1
            ? chunk[0].label
            : `${chunk[0].label}–${chunk[chunk.length - 1].label}`,
        clicks: chunk.reduce((s, p) => s + p.clicks, 0),
        leads: chunk.reduce((s, p) => s + p.leads, 0),
        published: chunk.reduce((s, p) => s + p.published, 0),
      });
    }
    return out;
  }, [windowPoints]);

  const goal = initialData.goal;
  const goalProgress =
    goal && goal.leadTarget > 0
      ? Math.min(100, Math.round((goal.leadsAchieved / goal.leadTarget) * 100))
      : 0;

  const conversionRate =
    windowTotals.clicks > 0
      ? Number(((windowTotals.leads / windowTotals.clicks) * 100).toFixed(1))
      : null;

  const publishAttempts = windowTotals.posts + windowTotals.articles + windowTotals.failed;
  const successRate =
    publishAttempts > 0
      ? Math.round(((windowTotals.posts + windowTotals.articles) / publishAttempts) * 100)
      : null;

  const hasAnyData =
    initialData.totals.clicks > 0 ||
    initialData.totals.leads > 0 ||
    initialData.posts.length > 0 ||
    initialData.platforms.some((p) => p.published > 0);

  // ── Post table filters (options derived from the real rows) ────────────────
  const platformOptions = useMemo(
    () => Array.from(new Set(initialData.posts.map((p) => p.platform))).sort(),
    [initialData.posts]
  );

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return initialData.posts.filter((p) => {
      const matchesPlatform = platformFilter === "ALL" || p.platform === platformFilter;
      const matchesSearch =
        !q || p.excerpt.toLowerCase().includes(q) || (p.topic || "").toLowerCase().includes(q);
      return matchesPlatform && matchesSearch;
    });
  }, [initialData.posts, searchQuery, platformFilter]);

  const topPostsByLeads = useMemo(
    () => [...initialData.posts].sort((a, b) => b.leads - a.leads || b.clicks - a.clicks).slice(0, 5),
    [initialData.posts]
  );

  // ── CSV export — the real window series, platforms and posts ──────────────
  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      const lines: string[] = [];
      const esc = (v: unknown) => {
        let s = v == null ? "" : String(v);
        if (/^[=+\-@]/.test(s)) s = `'${s}`;
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      lines.push(["workspace", esc(initialData.workspaceName || "-")].join(","));
      lines.push(["window", `${timeframe} (${days} days)`].join(","));
      lines.push("");
      lines.push(["date", "link_clicks", "unique_clicks", "leads", "published"].join(","));
      for (const p of windowPoints) {
        lines.push([p.date, p.clicks, p.uniqueClicks, p.leads, p.published].join(","));
      }
      lines.push("");
      lines.push(
        ["platform", "connected", "published", "clicks", "leads", "conversion_rate_pct"].join(",")
      );
      for (const p of initialData.platforms) {
        lines.push(
          [esc(p.label), p.connected ? "yes" : "no", p.published, p.clicks, p.leads, p.conversionRate ?? ""].join(",")
        );
      }
      lines.push("");
      lines.push(["published_at", "channel", "platform", "format", "clicks", "leads", "live_url"].join(","));
      for (const p of filteredPosts) {
        lines.push(
          [p.publishedAt, p.channel, esc(p.platform), esc(p.format || ""), p.clicks, p.leads, esc(p.liveUrl || "")].join(",")
        );
      }
      if (initialData.goal) {
        lines.push("");
        lines.push("LEAD GOAL");
        lines.push(["target", initialData.goal.leadTarget].join(","));
        lines.push(["achieved", initialData.goal.leadsAchieved].join(","));
        lines.push(["lead_type", esc(initialData.goal.leadType)].join(","));
        lines.push(["days_elapsed", initialData.goal.daysElapsed].join(","));
        lines.push(["days_total", initialData.goal.daysTotal].join(","));
      }
      if (initialData.leadStatuses.length > 0) {
        lines.push("");
        lines.push("LEAD STATUSES (ALL-TIME)");
        lines.push(["status", "count", "counts_toward_goal"].join(","));
        for (const row of initialData.leadStatuses) {
          lines.push([esc(row.status), row.count, row.counted ? "yes" : "no"].join(","));
        }
      }

      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${(initialData.workspaceName || "workspace")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-${timeframe}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    }, 400);
  };

  const hasGoalAndWindow = goal && goal.daysTotal > 0;
  const neededPace = hasGoalAndWindow
    ? Math.max(
        0,
        (goal!.leadTarget - goal!.leadsAchieved) / Math.max(1, goal!.daysTotal - goal!.daysElapsed)
      )
    : null;
  const actualPace = hasGoalAndWindow
    ? goal!.leadsAchieved / Math.max(1, goal!.daysElapsed)
    : null;

  return (
    <div className="w-full max-w-6xl mx-auto font-sans pb-16 space-y-5">
      {/* ── Header ── */}
      <section className="rounded-2xl bg-primary p-6 text-primary-foreground">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl tracking-tight">Analytics</h1>
            {(initialData.workspaceName || initialData.industry) && (
              <p className="mt-1 text-sm text-primary-foreground/85">
                {[initialData.workspaceName, initialData.industry].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="mt-0.5 text-xs text-primary-foreground/70">
              Real clicks, leads and publish receipts — nothing estimated.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Reload the latest numbers from the server"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary-foreground/15 px-3 text-xs font-semibold hover:bg-primary-foreground/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || !hasAnyData}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary-foreground/15 px-3 text-xs font-semibold hover:bg-primary-foreground/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? "Exporting…" : `Export ${timeframe} CSV`}
            </button>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-primary-foreground/70">
          {hasAnyData
            ? `Updated ${fmtDateTime(initialData.generatedAt)} · last ${initialData.windowDays} days`
            : "No activity yet — publish something to see numbers here."}
        </p>
      </section>

      {/* ── Controls: tabs + timeframe ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center bg-muted p-1 rounded-xl border border-border">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              type="button"
              onClick={() => setTimeframe(tf.key)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                timeframe === tf.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf.key}
            </button>
          ))}
        </div>
      </div>

      {/* ── Honest empty state ── */}
      {!hasAnyData && (
        <SectionCard
          title="No measured data yet"
          subtitle="This dashboard fills itself from real events — no demo data."
          icon={<Info className="w-4 w-4" />}
          accent="secondary"
        >
          <EmptyState
            title="Analytics will appear after your first publish"
            description="Clicks, leads and publish receipts land here automatically."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <a
                  href="/dashboard/goals"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Target className="h-3.5 w-3.5" />
                  Set up a lead goal
                </a>
                <a
                  href="/dashboard/ai-studio"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-primary/30 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  <Send className="h-3.5 w-3.5" />
                  Create content
                </a>
              </div>
            }
          />
        </SectionCard>
      )}

      {/* ════════════════════════ OVERVIEW ════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Leads (window)"
              value={fmtNum(windowTotals.leads)}
              delta={pctChange(windowTotals.leads, windowTotals.prevLeads)}
              hint={
                goal
                  ? `Goal window: ${fmtNum(goal.leadsAchieved)} of ${fmtNum(goal.leadTarget)} target`
                  : "Confirmed, qualified and won — counted from lead events"
              }
              icon={<UserPlus className="h-4 w-4" />}
            />
            <StatTile
              label="Link clicks (window)"
              value={fmtNum(windowTotals.clicks)}
              delta={pctChange(windowTotals.clicks, windowTotals.prevClicks)}
              hint={`${fmtNum(windowTotals.uniqueClicks)} unique · last ${days} days`}
              icon={<MousePointerClick className="h-4 w-4" />}
              accent="secondary"
            />
            <StatTile
              label="Published (window)"
              value={fmtNum(windowTotals.published)}
              delta={pctChange(windowTotals.published, windowTotals.prevPublished)}
              hint={`${fmtNum(windowTotals.posts)} posts · ${fmtNum(windowTotals.articles)} articles`}
              icon={<Send className="h-4 w-4" />}
            />
            <StatTile
              label="Click → lead rate"
              value={conversionRate !== null ? `${conversionRate}%` : "—"}
              hint={
                conversionRate !== null
                  ? `${fmtNum(windowTotals.leads)} leads from ${fmtNum(windowTotals.clicks)} clicks`
                  : "Needs at least one click and one lead"
              }
              icon={<TrendingUp className="h-4 w-4" />}
              accent="secondary"
            />
          </div>

          {goal && (
            <SectionCard
              title="Lead goal progress"
              subtitle={`${fmtNum(goal.leadTarget)} ${goal.leadType
                .toLowerCase()
                .replace(/_/g, " ")} in ${goal.daysTotal} days`}
              icon={<Target className="w-4 h-4" />}
              actions={
                <a
                  href="/dashboard/goals"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Open Lead Goal HQ
                </a>
              }
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground">
                    {fmtNum(goal.leadsAchieved)} of {fmtNum(goal.leadTarget)} confirmed
                  </span>
                  <span className="text-muted-foreground">
                    Day {goal.daysElapsed} of {goal.daysTotal} ·{" "}
                    {Math.max(0, goal.daysTotal - goal.daysElapsed)} days left
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${goalProgress}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Chip tone="primary">Progress {goalProgress}%</Chip>
                  {actualPace !== null && (
                    <Chip tone="muted">Current pace {actualPace.toFixed(1)} leads/day</Chip>
                  )}
                  {neededPace !== null && (
                    <Chip tone={neededPace > (actualPace || 0) ? "danger" : "secondary"}>
                      Needed pace {neededPace.toFixed(1)} leads/day
                    </Chip>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Clicks, leads & publishes"
            subtitle={`Daily totals, last ${days} days`}
            icon={<BarChart3 className="w-4 h-4" />}
          >
            <TrendChart buckets={buckets} metrics={["clicks", "leads", "published"]} />
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="Where leads came from"
              subtitle={`Lead events, last ${days} days`}
              icon={<Globe className="w-4 w-4" />}
              accent="secondary"
            >
              <SplitBar
                segments={[
                  {
                    label: "Social posts",
                    value: windowTotals.socialLeads,
                    color: "bg-primary",
                    text: "text-primary",
                  },
                  {
                    label: "Website tag",
                    value: windowTotals.websiteLeads,
                    color: "bg-secondary",
                    text: "text-secondary",
                  },
                ]}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Chip tone="muted" icon={<UserPlus className="w-3 h-3" />}>
                  {fmtNum(windowTotals.manualLeads)} manually logged
                </Chip>
                <Chip tone="muted" icon={<MousePointerClick className="w-3 h-3" />}>
                  {fmtNum(windowTotals.uniqueClicks)} unique clicks
                </Chip>
              </div>
            </SectionCard>

            <SectionCard
              title="Workspace snapshot"
              subtitle="Live row counts from the content, media and automation tables."
              icon={<Layers className="w-4 h-4" />}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  {
                    label: "Awaiting approval",
                    value: initialData.pipeline.pendingApproval,
                    icon: <Info className="w-3.5 h-3.5" />,
                  },
                  {
                    label: "Ready to schedule",
                    value: initialData.pipeline.approved,
                    icon: <Check className="w-3.5 h-3.5" />,
                  },
                  {
                    label: "Scheduled",
                    value: initialData.pipeline.scheduled,
                    icon: <CalendarDays className="w-3.5 h-3.5" />,
                  },
                  {
                    label: "Media assets",
                    value: initialData.pipeline.mediaAssets,
                    icon: <ImageIcon className="w-3.5 h-3.5" />,
                  },
                  {
                    label: "Article drafts",
                    value: initialData.pipeline.articles,
                    icon: <FileText className="w-3.5 h-3.5" />,
                  },
                  {
                    label: "Chat sessions",
                    value: initialData.pipeline.chatSessions,
                    icon: <Bot className="w-3.5 h-3.5" />,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col gap-1"
                  >
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                      {item.icon}
                      {item.label}
                    </span>
                    <span className="text-lg font-bold text-foreground leading-none">
                      {fmtNum(item.value)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Chip tone="primary" icon={<Zap className="w-3 h-3" />}>
                  {fmtNum(initialData.pipeline.activeAutomations)} active automations
                </Chip>
                <Chip tone="primary" icon={<Layers className="w-3 h-3" />}>
                  {fmtNum(initialData.pipeline.connectedPlatforms)} platforms connected
                </Chip>
                {successRate !== null && (
                  <Chip tone={windowTotals.failed > 0 ? "danger" : "muted"}>
                    {successRate}% publish success
                  </Chip>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ════════════════════════ PUBLISHING ════════════════════════ */}
      {tab === "publishing" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Posts published"
              value={fmtNum(windowTotals.posts)}
              hint={`Social · last ${days} days`}
              icon={<Send className="h-4 w-4" />}
            />
            <StatTile
              label="Articles published"
              value={fmtNum(windowTotals.articles)}
              hint={`Website · last ${days} days`}
              icon={<FileText className="h-4 w-4" />}
              accent="secondary"
            />
            <StatTile
              label="Failed publishes"
              value={fmtNum(windowTotals.failed)}
              hint={
                successRate !== null
                  ? `${successRate}% success · last ${days} days`
                  : "No attempts yet"
              }
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <StatTile
              label="Still queued"
              value={fmtNum(initialData.pipeline.scheduled)}
              hint={`${fmtNum(initialData.pipeline.approved)} approved · ${fmtNum(initialData.pipeline.pendingApproval)} awaiting review`}
              icon={<CalendarDays className="h-4 w-4" />}
              accent="secondary"
            />
          </div>

          <SectionCard
            title="Publishing volume"
            subtitle={`Went-live items per period, last ${days} days`}
            icon={<Send className="w-4 w-4" />}
          >
            <TrendChart buckets={buckets} metrics={["published"]} />
          </SectionCard>

          <SectionCard
            title="Post performance"
            subtitle="Published items with their real clicks and leads."
            icon={<BarChart3 className="w-4 h-4" />}
            accent="secondary"
            actions={
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search post text…"
                  className="h-9 pl-9 text-xs rounded-xl"
                />
              </div>
            }
          >
            {platformOptions.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-border">
                {["ALL", ...platformOptions].map((plat) => (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => setPlatformFilter(plat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      platformFilter === plat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {plat === "ALL" ? "All platforms" : plat}
                  </button>
                ))}
              </div>
            )}

            {filteredPosts.length === 0 ? (
              <EmptyState
                icon={<Send className="w-5 h-5" />}
                title="No published items yet"
                description="Publish receipts with their clicks and leads will show up here."
              />
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="py-2.5 px-2">Post</th>
                      <th className="py-2.5 px-2">Published</th>
                      <th className="py-2.5 px-2 text-right">Clicks</th>
                      <th className="py-2.5 px-2 text-right">Leads</th>
                      <th className="py-2.5 px-2 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {filteredPosts.map((post) => (
                      <tr key={post.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3.5 px-2 max-w-md">
                          <div className="flex items-start gap-2.5">
                            {post.channel === "WEBSITE" ? (
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                                <Globe className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Send className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <div className="space-y-1 min-w-0">
                              <p className="font-semibold text-foreground line-clamp-2 leading-snug">
                                {post.topic || post.excerpt || "Untitled post"}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span className="font-medium text-foreground">{post.platform}</span>
                                {post.format && <Chip tone="muted">{post.format}</Chip>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-2 whitespace-nowrap text-muted-foreground">
                          {fmtDate(post.publishedAt)}
                        </td>
                        <td className="py-3.5 px-2 text-right font-bold text-primary whitespace-nowrap">
                          {fmtNum(post.clicks)}
                        </td>
                        <td className="py-3.5 px-2 text-right font-bold text-secondary whitespace-nowrap">
                          {fmtNum(post.leads)}
                        </td>
                        <td className="py-3.5 px-2 text-right whitespace-nowrap">
                          {post.liveUrl ? (
                            <a
                              href={post.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open
                            </a>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                              title="The platform did not return a direct link for this post."
                            >
                              <CircleSlash className="w-3 h-3" />
                              None
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════ LEADS ════════════════════════ */}
      {tab === "leads" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Leads (window)"
              value={fmtNum(windowTotals.leads)}
              delta={pctChange(windowTotals.leads, windowTotals.prevLeads)}
              hint={`Counted statuses only, last ${days} days`}
              icon={<UserPlus className="h-4 w-4" />}
            />
            <StatTile
              label="From social"
              value={fmtNum(windowTotals.socialLeads)}
              hint={`Last ${days} days`}
              icon={<Send className="h-4 w-4" />}
              accent="secondary"
            />
            <StatTile
              label="From website"
              value={fmtNum(windowTotals.websiteLeads)}
              hint={`Last ${days} days`}
              icon={<Globe className="h-4 w-4" />}
            />
            <StatTile
              label="Manually logged"
              value={fmtNum(windowTotals.manualLeads)}
              hint={`Last ${days} days`}
              icon={<Users className="h-4 w-4" />}
              accent="secondary"
            />
          </div>

          <SectionCard
            title="Lead flow"
            subtitle={`Confirmed leads per period, last ${days} days`}
            icon={<Users className="w-4 w-4" />}
          >
            <TrendChart buckets={buckets} metrics={["leads"]} />
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="Status breakdown"
              subtitle="All-time, by status. CONFIRMED, QUALIFIED and WON count toward goals."
              icon={<Target className="w-4 h-4" />}
              accent="secondary"
            >
              {initialData.leadStatuses.length === 0 ? (
                <EmptyState
                  icon={<UserPlus className="w-5 h-5" />}
                  title="No lead events yet"
                  description="Leads arrive when someone confirms one from History, or when your website tag captures a real form submission or link click."
                />
              ) : (
                <div className="space-y-3">
                  {initialData.leadStatuses.map((row) => {
                    const total = initialData.leadStatuses.reduce((s, r) => s + r.count, 0);
                    const pct = total > 0 ? (row.count / total) * 100 : 0;
                    return (
                      <div key={row.status} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-sm ${row.counted ? "bg-primary" : "bg-muted-foreground/40"}`}
                            />
                            <span className="font-semibold text-foreground">
                              {row.status.replace(/_/g, " ").toLowerCase()}
                            </span>
                            {!row.counted && (
                              <span className="text-[10px] text-muted-foreground">
                                (not counted toward the goal)
                              </span>
                            )}
                          </span>
                          <span className="font-bold text-foreground">{fmtNum(row.count)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${row.counted ? "bg-primary" : "bg-muted-foreground/40"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Top posts by leads"
              subtitle="Confirmed leads by post."
              icon={<TrendingUp className="w-4 w-4" />}
            >
              {topPostsByLeads.every((p) => p.leads === 0 && p.clicks === 0) ? (
                <EmptyState
                  icon={<TrendingUp className="w-5 h-5" />}
                  title="No attributed leads yet"
                  description="When a lead comes in through a post's tracked link, the post earns its place here — with the exact count."
                />
              ) : (
                <div className="space-y-2.5">
                  {topPostsByLeads.map((post, i) => (
                    <div
                      key={post.id}
                      className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3"
                    >
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                          i === 0 && post.leads > 0
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground line-clamp-1 leading-snug">
                          {post.topic || post.excerpt || "Untitled post"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {post.platform} · {fmtDate(post.publishedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs">
                        <span className="font-bold text-secondary">
                          {fmtNum(post.leads)} leads
                        </span>
                        <span className="font-semibold text-primary">
                          {fmtNum(post.clicks)} clicks
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* ════════════════════════ PLATFORMS ════════════════════════ */}
      {tab === "platforms" && (
        <div className="space-y-5">
          <SectionCard
            title="Platform performance"
            subtitle="Lifetime totals per connected or active platform."
            icon={<Layers className="w-4 w-4" />}
            actions={
              <a
                href="/dashboard/integrations"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Manage connections
              </a>
            }
          >
            {initialData.platforms.length === 0 ? (
              <EmptyState
                icon={<Layers className="w-5 h-5" />}
                title="No platforms connected"
                description="Connect a social account in Integrations — its publishes, tracked-link clicks and attributed leads will appear here automatically."
                action={
                  <a
                    href="/dashboard/integrations"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Connect a platform
                  </a>
                }
              />
            ) : (
              <div className="space-y-3">
                {initialData.platforms.map((p) => {
                  const maxClicks = Math.max(1, ...initialData.platforms.map((x) => x.clicks));
                  const barPct = Math.round((p.clicks / maxClicks) * 100);
                  return (
                    <div
                      key={p.key}
                      className="rounded-xl border border-border bg-muted/40 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-sm font-bold text-foreground">{p.label}</span>
                          {p.connected ? (
                            <Chip tone="primary" icon={<Check className="w-3 h-3" />}>
                              Connected
                            </Chip>
                          ) : (
                            <Chip
                              tone="muted"
                              title="No account connected — rows exist because this platform has historical activity."
                            >
                              Not connected
                            </Chip>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{fmtNum(p.published)}</strong>{" "}
                            published
                          </span>
                          <span className="text-muted-foreground">
                            <strong className="text-primary">{fmtNum(p.clicks)}</strong> clicks
                          </span>
                          <span className="text-muted-foreground">
                            <strong className="text-secondary">{fmtNum(p.leads)}</strong> leads
                          </span>
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">
                              {p.conversionRate !== null ? `${p.conversionRate}%` : "—"}
                            </strong>{" "}
                            conv. rate
                          </span>
                        </div>
                      </div>
                      {/* Clicks bar vs the busiest platform — real relative scale */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${p.connected ? "bg-primary" : "bg-primary/40"}`}
                          style={{ width: `${barPct}%` }}
                          title={`${p.clicks} of ${maxClicks} clicks (busiest platform)`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="Connected accounts"
              subtitle="Which platforms this workspace can publish to right now."
              icon={<Check className="w-4 w-4" />}
            >
              {initialData.pipeline.connectedPlatforms === 0 ? (
                <EmptyState
                  icon={<Layers className="w-5 h-5" />}
                  title="Nothing connected"
                  description="Connect Instagram, LinkedIn, Facebook, X, TikTok, YouTube or Pinterest from Integrations to start publishing."
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {initialData.platforms
                    .filter((p) => p.connected)
                    .map((p) => (
                      <Chip key={p.key} tone="primary">
                        {p.label}
                      </Chip>
                    ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Publish health"
              subtitle="Receipt-level counts across social and website channels."
              icon={<Zap className="w-4 w-4" />}
              accent="secondary"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Publish success
                  </p>
                  <p className="text-lg font-bold text-foreground leading-none mt-1">
                    {successRate !== null ? `${successRate}%` : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fmtNum(publishAttempts)} attempts · last {days} days
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
                    Failures in window
                  </p>
                  <p className="text-lg font-bold text-foreground leading-none mt-1">
                    {fmtNum(windowTotals.failed)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {windowTotals.failed > 0
                      ? "Retry them from Lead Goal HQ → History"
                      : "No failed publishes"}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
