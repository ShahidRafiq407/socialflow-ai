"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Download,
  Filter,
  History,
  Loader2,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  UserPlus,
  Zap,
} from "lucide-react";
import type { LeadChannel, PublishHistoryItem } from "@/lib/types/growth";
import {
  listPublishHistory,
  deletePublishHistoryRow,
  retryPublishHistoryRow,
  exportPublishHistoryCsv,
  logLead,
  deleteLead,
} from "@/actions/growthLeads";
import {
  Chip,
  ChannelIcon,
  ConfirmButton,
  CopyButton,
  EmptyState,
  LiveLink,
  MediaPreview,
  SectionCard,
  StatusChip,
  dayBucket,
  downloadCsv,
} from "./shared";
import type { GoalHQData } from "./types";

/**
 * History — "aaj maine ye post is platform par ki".
 *
 * Rows come from `PublishLog`, which is never purged, so the record and its live
 * link survive long after the heavy `Post` row is cleaned up. A row only links
 * out when the platform actually returned a URL; otherwise it says so rather
 * than sending the user to a generic feed.
 */

type ChannelFilter = LeadChannel | "ALL";
type StatusFilter = "PUBLISHED" | "FAILED" | "ALL";

export function HistoryTab({
  data,
  onToast,
  onGoToTab,
  onRefresh,
}: {
  data: GoalHQData;
  onToast: (tone: "success" | "error" | "info", text: string, undo?: () => void) => void;
  onGoToTab: (tab: string) => void;
  onRefresh: () => void;
}) {
  const [rows, setRows] = useState<PublishHistoryItem[]>(data.history);
  const [channel, setChannel] = useState<ChannelFilter>("ALL");
  const [platform, setPlatform] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, startLoading] = useTransition();
  const [exporting, startExporting] = useTransition();
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const filters = { channel, platform, status, from: from || null, to: to || null, limit: 200 };

  const platformOptions = useMemo(() => {
    const set = new Set<string>();
    data.history.forEach((r) => r.platform && set.add(r.platform));
    rows.forEach((r) => r.platform && set.add(r.platform));
    data.connectedPlatforms.forEach((p) => set.add(p));
    return Array.from(set).sort();
  }, [data.history, data.connectedPlatforms, rows]);

  const reload = (overrides?: Partial<typeof filters>) => {
    startLoading(async () => {
      const next = await listPublishHistory(data.workspaceId, { ...filters, ...overrides } as any);
      setRows(next);
    });
  };

  const clearFilters = () => {
    setChannel("ALL");
    setPlatform("ALL");
    setStatus("ALL");
    setFrom("");
    setTo("");
    startLoading(async () => {
      const next = await listPublishHistory(data.workspaceId, { limit: 200 });
      setRows(next);
    });
  };

  const exportCsv = () => {
    startExporting(async () => {
      const res = await exportPublishHistoryCsv(data.workspaceId, {
        channel,
        platform,
        status,
        from: from || null,
        to: to || null,
      });
      if (!res.success || !res.csv) {
        onToast("error", res.error || "Export failed.");
        return;
      }
      if (!res.rows) {
        onToast("info", "Nothing to export with these filters.");
        return;
      }
      downloadCsv(res.csv, res.filename || "publish-history.csv");
      onToast("success", `${res.rows} row${res.rows === 1 ? "" : "s"} exported.`);
    });
  };

  const markLead = async (row: PublishHistoryItem) => {
    setBusyRow(row.id);
    try {
      const res = await logLead(data.workspaceId, {
        publishLogId: row.id,
        postId: row.postId || null,
        platform: row.platform,
        channel: row.channel,
        leadType: data.goal?.leadType || "QUALIFIED_LEADS",
        status: "CONFIRMED",
      });
      if (!res.success || !res.lead) {
        onToast("error", res.error || "Could not record the lead.");
        return;
      }
      const leadId = res.lead.id;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, leads: r.leads + 1 } : r)));
      onToast("success", `Lead recorded against this ${row.channel === "WEBSITE" ? "article" : "post"}.`, () => {
        void (async () => {
          const undo = await deleteLead(data.workspaceId, leadId);
          if (undo.success) {
            setRows((prev) =>
              prev.map((r) => (r.id === row.id ? { ...r, leads: Math.max(0, r.leads - 1) } : r))
            );
            onRefresh();
          }
        })();
      });
      onRefresh();
    } finally {
      setBusyRow(null);
    }
  };

  const retry = async (row: PublishHistoryItem) => {
    setBusyRow(row.id);
    try {
      const res = await retryPublishHistoryRow(data.workspaceId, row.id);
      if (!res.success) {
        onToast("error", res.error || "Retry failed.");
        return;
      }
      onToast("success", res.liveUrl ? "Published. The live link is on the row now." : "Published.");
      reload();
      onRefresh();
    } finally {
      setBusyRow(null);
    }
  };

  const removeRow = async (row: PublishHistoryItem) => {
    setBusyRow(row.id);
    try {
      const res = await deletePublishHistoryRow(data.workspaceId, row.id);
      if (!res.success) {
        onToast("error", res.error || "Could not delete the row.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      onToast("info", "Row removed from your history. The post itself is untouched.");
      onRefresh();
    } finally {
      setBusyRow(null);
    }
  };

  const grouped = useMemo(() => {
    const buckets: { label: string; items: PublishHistoryItem[] }[] = [];
    for (const row of rows) {
      const label = dayBucket(row.publishedAt);
      const last = buckets[buckets.length - 1];
      if (last && last.label === label) last.items.push(row);
      else buckets.push({ label, items: [row] });
    }
    return buckets;
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        published: acc.published + (r.status === "PUBLISHED" ? 1 : 0),
        failed: acc.failed + (r.status === "FAILED" ? 1 : 0),
        clicks: acc.clicks + r.clicks,
        leads: acc.leads + r.leads,
      }),
      { published: 0, failed: 0, clicks: 0, leads: 0 }
    );
  }, [rows]);

  const filtersActive =
    channel !== "ALL" || platform !== "ALL" || status !== "ALL" || Boolean(from) || Boolean(to);

  return (
    <div className="space-y-5">
      {/* ── Filters ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
            <Filter className="w-4 h-4 text-primary" />
            Filter your history
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => reload()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Channel
            </span>
            <select
              value={channel}
              onChange={(e) => {
                const v = e.target.value as ChannelFilter;
                setChannel(v);
                reload({ channel: v });
              }}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">Everything</option>
              <option value="SOCIAL">Social posts</option>
              <option value="WEBSITE">Website articles</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Platform
            </span>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                reload({ platform: e.target.value });
              }}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All platforms</option>
              {platformOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Result
            </span>
            <select
              value={status}
              onChange={(e) => {
                const v = e.target.value as StatusFilter;
                setStatus(v);
                reload({ status: v });
              }}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">Published & failed</option>
              <option value="PUBLISHED">Published only</option>
              <option value="FAILED">Failed only</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              From
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                reload({ from: e.target.value || null });
              }}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              To
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                reload({ to: e.target.value || null });
              }}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>

        {rows.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
            {totals.published} published
            {totals.failed > 0 && `, ${totals.failed} failed`} · {totals.clicks} click
            {totals.clicks === 1 ? "" : "s"} measured · {totals.leads} lead
            {totals.leads === 1 ? "" : "s"} confirmed. Clicks are counted from real redirects; leads are
            only ever confirmed by you or captured by your website tag.
          </p>
        )}
      </section>

      {/* ── Rows ── */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<History className="w-5 h-5" />}
          title={filtersActive ? "Nothing matches those filters" : "Nothing published yet"}
          description={
            filtersActive
              ? "Widen the date range or clear the filters to see the rest of your history."
              : "Once a post or article goes out, it is recorded here permanently with its live link, clicks and leads — even after the draft itself is cleaned up."
          }
          action={
            filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted"
              >
                <RotateCcw className="w-4 h-4" />
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onGoToTab("today")}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
              >
                <Sparkles className="w-4 h-4" />
                Go to today&rsquo;s work
              </button>
            )
          }
        />
      ) : (
        grouped.map((bucket) => (
          <SectionCard
            key={bucket.label}
            title={bucket.label}
            subtitle={`${bucket.items.length} item${bucket.items.length === 1 ? "" : "s"}`}
            icon={<CalendarDays className="w-4 h-4" />}
          >
            <div className="space-y-3">
              {bucket.items.map((row) => (
                <HistoryRow
                  key={row.id}
                  row={row}
                  busy={busyRow === row.id}
                  onMarkLead={() => markLead(row)}
                  onRetry={() => retry(row)}
                  onDelete={() => removeRow(row)}
                />
              ))}
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}

function HistoryRow({
  row,
  busy,
  onMarkLead,
  onRetry,
  onDelete,
}: {
  row: PublishHistoryItem;
  busy: boolean;
  onMarkLead: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const time = new Date(row.publishedAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3 sm:flex-nowrap">
      <MediaPreview url={row.mediaUrl} mediaType={row.mediaType} className="w-16 h-16 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ChannelIcon channel={row.channel} className="w-3.5 h-3.5" />
          <span className="text-sm font-bold text-foreground">{row.platform}</span>
          {row.format && <Chip tone="muted">{row.format}</Chip>}
          <StatusChip status={row.status} />
          {row.isAutopilot && (
            <Chip tone="secondary" icon={<Zap className="w-3 h-3" />} title="Posted by autopilot, without review.">
              Autopilot
            </Chip>
          )}
          <span className="text-[11px] text-muted-foreground">{time}</span>
        </div>

        <p className="text-xs text-foreground mt-1.5 leading-relaxed line-clamp-2">{row.excerpt}</p>

        {row.keyword && (
          <p className="text-[11px] text-muted-foreground mt-1">
            <span className="font-semibold">Keyword:</span> {row.keyword}
          </p>
        )}

        {row.error && row.status === "FAILED" && (
          <p className="inline-flex items-start gap-1.5 text-[11px] text-destructive mt-1.5 leading-relaxed">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            {row.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
            title="Real clicks on this item's tracked link."
          >
            <MousePointerClick className="w-3 h-3" />
            {row.clicks} click{row.clicks === 1 ? "" : "s"}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary"
            title="Leads you confirmed, or that your website tag captured, from this item."
          >
            <UserPlus className="w-3 h-3" />
            {row.leads} lead{row.leads === 1 ? "" : "s"}
          </span>
          {row.status === "PUBLISHED" && <LiveLink url={row.liveUrl} />}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            type="button"
            onClick={onMarkLead}
            disabled={busy}
            title="Record a lead that came from this item."
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
            Lead aaya
          </button>

          {row.status === "FAILED" && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Retry
            </button>
          )}

          {row.liveUrl && <CopyButton value={row.liveUrl} label="Copy live link" />}
          {row.shortUrl && <CopyButton value={row.shortUrl} label="Copy tracked link" />}

          <ConfirmButton
            onConfirm={onDelete}
            busy={busy}
            label="Delete row"
            confirmLabel="Delete it"
            icon={<Trash2 className="w-3 h-3" />}
          />
        </div>
      </div>
    </div>
  );
}
