"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  Check,
  Download,
  Filter,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LeadChannel, LeadEventItem } from "@/lib/types/growth";
import type { AttributionRow } from "@/lib/growth/metrics";
import {
  listLeads,
  logLead,
  updateLead,
  deleteLead,
  exportLeadsCsv,
} from "@/actions/growthLeads";
import {
  Chip,
  ConfirmButton,
  EmptyState,
  SectionCard,
  StatTile,
  downloadCsv,
  fmtDateTime,
} from "./shared";
import type { GoalHQData } from "./types";

/**
 * Leads — the honest scoreboard.
 *
 * Clicks are measured from real redirects on tracked links. Leads only exist
 * because a human confirmed one or the website tag captured one, so the two are
 * labelled differently everywhere and never added together.
 */

const LEAD_STATUSES = ["NEW", "CONFIRMED", "QUALIFIED", "WON", "LOST"] as const;

const LEAD_TYPE_OPTIONS = [
  "QUALIFIED_LEADS",
  "LEADS",
  "WEBSITE_INQUIRIES",
  "CONTACT_FORM",
  "WHATSAPP",
  "BOOKINGS",
  "CUSTOM",
];

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "You confirmed it",
  WEBSITE_TAG: "Website tag",
  LINK_CLICK_CONFIRMED: "Confirmed from a click",
};

function humanise(value?: string | null): string {
  if (!value) return "";
  return value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function LeadsTab({
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
  const [leads, setLeads] = useState<LeadEventItem[]>(data.leads);
  const [channel, setChannel] = useState<LeadChannel | "ALL">("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [loading, startLoading] = useTransition();
  const [exporting, startExporting] = useTransition();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const metrics = data.metrics;

  const reload = (overrides?: { channel?: LeadChannel | "ALL"; status?: string }) => {
    startLoading(async () => {
      const next = await listLeads(data.workspaceId, {
        channel: overrides?.channel ?? channel,
        status: overrides?.status ?? status,
        limit: 100,
      });
      setLeads(next);
    });
  };

  const conversion =
    metrics.clicks > 0 ? `${((metrics.leads / metrics.clicks) * 100).toFixed(1)}%` : "—";

  const exportCsv = () => {
    startExporting(async () => {
      const res = await exportLeadsCsv(data.workspaceId);
      if (!res.success || !res.csv) {
        onToast("error", res.error || "Export failed.");
        return;
      }
      if (!res.rows) {
        onToast("info", "No leads to export yet.");
        return;
      }
      downloadCsv(res.csv, res.filename || "leads.csv");
      onToast("success", `${res.rows} lead${res.rows === 1 ? "" : "s"} exported.`);
    });
  };

  const addLead = async (input: Parameters<typeof logLead>[1]) => {
    const res = await logLead(data.workspaceId, input);
    if (!res.success || !res.lead) {
      onToast("error", res.error || "Could not save the lead.");
      return false;
    }
    setLeads((prev) => [res.lead!, ...prev]);
    onToast("success", "Lead added.");
    onRefresh();
    return true;
  };

  const changeStatus = async (lead: LeadEventItem, next: string) => {
    setBusyId(lead.id);
    const previous = lead.status;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: next } : l)));
    try {
      const res = await updateLead(data.workspaceId, lead.id, { status: next });
      if (!res.success) {
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: previous } : l)));
        onToast("error", res.error || "Could not change the status.");
        return;
      }
      onToast(
        "success",
        next === "LOST"
          ? "Marked as lost — it no longer counts towards your goal."
          : `Moved to ${humanise(next)}.`
      );
      onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (
    lead: LeadEventItem,
    patch: { contactName: string; contactInfo: string; value: string; note: string; leadType: string }
  ) => {
    setBusyId(lead.id);
    try {
      const res = await updateLead(data.workspaceId, lead.id, {
        contactName: patch.contactName,
        contactInfo: patch.contactInfo,
        note: patch.note,
        leadType: patch.leadType,
        value: patch.value.trim() === "" ? null : Number(patch.value),
      });
      if (!res.success) {
        onToast("error", res.error || "Could not save the changes.");
        return false;
      }
      setLeads((prev) =>
        prev.map((l) =>
          l.id === lead.id
            ? {
                ...l,
                contactName: patch.contactName || null,
                contactInfo: patch.contactInfo || null,
                note: patch.note || null,
                leadType: patch.leadType,
                value: patch.value.trim() === "" ? null : Number(patch.value),
              }
            : l
        )
      );
      onToast("success", "Lead updated.");
      onRefresh();
      return true;
    } finally {
      setBusyId(null);
    }
  };

  const removeLead = async (lead: LeadEventItem) => {
    setBusyId(lead.id);
    try {
      const res = await deleteLead(data.workspaceId, lead.id);
      if (!res.success) {
        onToast("error", res.error || "Could not delete the lead.");
        return;
      }
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      const snapshot = res.deleted;
      onToast(
        "info",
        lead.source === "MANUAL"
          ? "Lead deleted."
          : "Lead deleted. Undo restores it as a manually confirmed lead, since the original tag event is gone.",
        snapshot
          ? () => {
              void (async () => {
                const restored = await logLead(data.workspaceId, snapshot);
                if (restored.success && restored.lead) {
                  setLeads((prev) => [restored.lead!, ...prev]);
                  onRefresh();
                }
              })();
            }
          : undefined
      );
      onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const filtersActive = channel !== "ALL" || status !== "ALL";

  return (
    <div className="space-y-5">
      {/* ── Measured summary ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Clicks"
          value={metrics.clicks}
          hint={`${metrics.uniqueClicks} unique · counted from real redirects`}
          icon={<MousePointerClick className="w-3.5 h-3.5" />}
        />
        <StatTile
          label="Leads confirmed"
          value={metrics.leads}
          hint={`${metrics.socialLeads} from social · ${metrics.websiteLeads} from your site`}
          icon={<Users className="w-3.5 h-3.5" />}
          accent="secondary"
        />
        <StatTile
          label="Click → lead"
          value={conversion}
          hint={
            metrics.clicks > 0
              ? "Your own conversion rate, not a benchmark"
              : "Needs at least one click to compute"
          }
          icon={<BarChart3 className="w-3.5 h-3.5" />}
        />
        <StatTile
          label="Published"
          value={metrics.postsPublished + metrics.articlesPublished}
          hint={`${metrics.postsPublished} posts · ${metrics.articlesPublished} articles${
            metrics.publishFailures > 0 ? ` · ${metrics.publishFailures} failed` : ""
          }`}
          icon={<Check className="w-3.5 h-3.5" />}
          accent="secondary"
        />
      </div>

      {/* ── Add + filters ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">Your leads</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Website leads arrive on their own through your tag. Anything that came in by DM, call or
              WhatsApp, add it here so the goal reflects reality.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold ${
                adding
                  ? "border border-border text-foreground hover:bg-muted"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {adding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {adding ? "Close" : "Add a lead"}
            </button>
            <button
              type="button"
              onClick={() => reload()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export CSV
            </button>
          </div>
        </div>

        {adding && (
          <AddLeadForm
            platforms={data.connectedPlatforms}
            defaultLeadType={data.goal?.leadType || "QUALIFIED_LEADS"}
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              const ok = await addLead(input);
              if (ok) setAdding(false);
            }}
          />
        )}

        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Filter className="w-3 h-3" />
            Filter
          </span>
          <select
            value={channel}
            onChange={(e) => {
              const v = e.target.value as LeadChannel | "ALL";
              setChannel(v);
              reload({ channel: v });
            }}
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">All channels</option>
            <option value="SOCIAL">From social</option>
            <option value="WEBSITE">From the website</option>
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              reload({ status: e.target.value });
            }}
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">Every status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setChannel("ALL");
                setStatus("ALL");
                reload({ channel: "ALL", status: "ALL" });
              }}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Clear
            </button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            Only Confirmed, Qualified and Won count towards the goal.
          </span>
        </div>
      </section>

      {/* ── Lead list ── */}
      {leads.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="w-5 h-5" />}
          title={filtersActive ? "No leads match those filters" : "No leads recorded yet"}
          description={
            filtersActive
              ? "Change the filters to see the rest."
              : "As soon as a post starts pulling enquiries, mark them here — or install the website tag so they are captured automatically."
          }
          action={
            !filtersActive ? (
              <button
                type="button"
                onClick={() => onGoToTab("history")}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
              >
                Mark a lead from history
              </button>
            ) : undefined
          }
        />
      ) : (
        <SectionCard
          title={`${leads.length} lead${leads.length === 1 ? "" : "s"}`}
          subtitle="Newest first. Change the status as a lead progresses — the goal follows it."
          icon={<Users className="w-4 h-4" />}
        >
          <div className="space-y-3">
            {leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                busy={busyId === lead.id}
                onStatus={(next) => changeStatus(lead, next)}
                onSave={(patch) => saveEdit(lead, patch)}
                onDelete={() => removeLead(lead)}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Attribution ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <AttributionCard
          title="By platform"
          subtitle="Which platform is actually producing"
          rows={data.attribution.byPlatform}
        />
        <AttributionCard
          title="By content pillar"
          subtitle="Which theme converts best"
          rows={data.attribution.byPillar}
          accent="secondary"
        />
        <AttributionCard
          title="By channel"
          subtitle="Social posts vs. your website"
          rows={data.attribution.byChannel}
          accent="secondary"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Add form
// ============================================================================

function AddLeadForm({
  platforms,
  defaultLeadType,
  onSubmit,
  onCancel,
}: {
  platforms: string[];
  defaultLeadType: string;
  onSubmit: (input: Parameters<typeof logLead>[1]) => Promise<void>;
  onCancel: () => void;
}) {
  const [channel, setChannel] = useState<LeadChannel>("SOCIAL");
  const [platform, setPlatform] = useState(platforms[0] || "");
  const [leadType, setLeadType] = useState(defaultLeadType);
  const [status, setStatus] = useState("CONFIRMED");
  const [contactName, setContactName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        channel,
        platform: channel === "WEBSITE" ? "Website" : platform || null,
        leadType,
        status,
        contactName: contactName || null,
        contactInfo: contactInfo || null,
        value: value.trim() === "" ? null : Number(value),
        note: note || null,
        occurredAt: occurredAt || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-foreground">Came from</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as LeadChannel)}
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="SOCIAL">A social post</option>
            <option value="WEBSITE">My website</option>
          </select>
        </label>

        {channel === "SOCIAL" && (
          <label className="block">
            <span className="text-[11px] font-semibold text-foreground">Platform</span>
            {platforms.length > 0 ? (
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="e.g. WhatsApp"
                className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </label>
        )}

        <label className="block">
          <span className="text-[11px] font-semibold text-foreground">Kind of lead</span>
          <select
            value={leadType}
            onChange={(e) => setLeadType(e.target.value)}
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {LEAD_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-foreground">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-foreground">Name (optional)</span>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-foreground">Phone or email (optional)</span>
          <input
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-foreground">Deal value (optional)</span>
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-foreground">When (optional)</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="text-[11px] font-semibold text-foreground">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did they ask for?"
            className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save lead
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-muted"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Row
// ============================================================================

function LeadRow({
  lead,
  busy,
  onStatus,
  onSave,
  onDelete,
}: {
  lead: LeadEventItem;
  busy: boolean;
  onStatus: (next: string) => void;
  onSave: (patch: {
    contactName: string;
    contactInfo: string;
    value: string;
    note: string;
    leadType: string;
  }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [contactName, setContactName] = useState(lead.contactName || "");
  const [contactInfo, setContactInfo] = useState(lead.contactInfo || "");
  const [value, setValue] = useState(lead.value != null ? String(lead.value) : "");
  const [note, setNote] = useState(lead.note || "");
  const [leadType, setLeadType] = useState(lead.leadType);

  const reset = () => {
    setContactName(lead.contactName || "");
    setContactInfo(lead.contactInfo || "");
    setValue(lead.value != null ? String(lead.value) : "");
    setNote(lead.note || "");
    setLeadType(lead.leadType);
  };

  const counted = ["CONFIRMED", "QUALIFIED", "WON"].includes(lead.status);

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={lead.channel === "WEBSITE" ? "secondary" : "primary"}>
              {lead.channel === "WEBSITE" ? "Website" : lead.platform || "Social"}
            </Chip>
            <Chip tone="muted" title={SOURCE_LABEL[lead.source] || lead.source}>
              {SOURCE_LABEL[lead.source] || humanise(lead.source)}
            </Chip>
            <Chip tone={counted ? "primary" : "muted"} title={counted ? "Counts towards your goal." : "Not counted towards the goal."}>
              {humanise(lead.status)}
            </Chip>
            <span className="text-[11px] text-muted-foreground">{fmtDateTime(lead.occurredAt)}</span>
          </div>

          <p className="text-sm font-semibold text-foreground mt-1.5">
            {lead.contactName || humanise(lead.leadType)}
            {lead.value != null && (
              <span className="ml-2 text-xs font-medium text-primary">
                {lead.value.toLocaleString()}
              </span>
            )}
          </p>
          {lead.contactInfo && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{lead.contactInfo}</p>
          )}
          {lead.action && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Action on your site: {humanise(lead.action)}
            </p>
          )}
          {lead.note && <p className="text-xs text-foreground mt-1 leading-relaxed">{lead.note}</p>}
          {lead.attributedTo && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              <span className="font-semibold">Credited to:</span> {lead.attributedTo}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={lead.status}
            onChange={(e) => onStatus(e.target.value)}
            disabled={busy}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {editing && (
        <div className="grid gap-3 mt-3 pt-3 border-t border-border sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-foreground">Name</span>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-foreground">Phone or email</span>
            <input
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-foreground">Deal value</span>
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-foreground">Kind of lead</span>
            <select
              value={leadType}
              onChange={(e) => setLeadType(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LEAD_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {humanise(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-semibold text-foreground">Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {editing ? (
          <>
            <button
              type="button"
              onClick={async () => {
                const ok = await onSave({ contactName, contactInfo, value, note, leadType });
                if (ok) setEditing(false);
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Save changes
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setEditing(false);
              }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        )}

        <ConfirmButton
          onConfirm={onDelete}
          busy={busy}
          label="Delete"
          confirmLabel="Delete it"
          icon={<Trash2 className="w-3 h-3" />}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Attribution
// ============================================================================

function AttributionCard({
  title,
  subtitle,
  rows,
  accent = "primary",
}: {
  title: string;
  subtitle: string;
  rows: AttributionRow[];
  accent?: "primary" | "secondary";
}) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.leads - a.leads || b.clicks - a.clicks),
    [rows]
  );

  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      icon={<BarChart3 className="w-4 h-4" />}
      accent={accent}
    >
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Nothing measured yet. This fills in as tracked links get clicked.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-foreground truncate">
                {humanise(row.key) || "Unattributed"}
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {row.clicks} click{row.clicks === 1 ? "" : "s"} · {row.leads} lead
                {row.leads === 1 ? "" : "s"}
                {row.conversionRate != null && ` · ${(row.conversionRate * 100).toFixed(1)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
