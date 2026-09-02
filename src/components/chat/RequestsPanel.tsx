"use client";

// ============================================================================
// REQUESTS PANEL
//
// The other end of "sorry, I can't do that yet". Every time the controller hits
// a wall — a switched-off setting, an unconnected integration, a feature that
// isn't built — it writes the ask down here. This panel is where whoever builds
// the product reads what users actually keep asking for, ranked by how loud the
// demand is, and moves each one along: open → planned → shipped → declined.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Inbox, Loader2, Search, Trash2, X } from "lucide-react";

type RequestStatus = "open" | "planned" | "shipped" | "declined";

interface FeatureRequest {
  id: string;
  slug: string;
  title: string;
  request: string;
  examples: string[];
  reason: string;
  detail: string;
  nearest: string | null;
  status: RequestStatus;
  timesAsked: number;
  firstAskedAt: string;
  lastAskedAt: string;
}

interface RequestsPanelProps {
  workspaceId: string;
  onClose: () => void;
}

const STATUS_FILTERS: { key: RequestStatus | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "planned", label: "Planned" },
  { key: "shipped", label: "Shipped" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

const NEXT_STATUS: Record<RequestStatus, RequestStatus> = {
  open: "planned",
  planned: "shipped",
  shipped: "open",
  declined: "open",
};

const REASON_LABEL: Record<string, string> = {
  setting_off: "switched off",
  not_connected: "not connected",
  plan_locked: "plan-locked",
  not_built: "not built yet",
  out_of_scope: "out of scope",
};

const STATUS_STYLE: Record<RequestStatus, string> = {
  open: "border-amber-500/40 text-amber-400",
  planned: "border-sky-500/40 text-sky-400",
  shipped: "border-emerald-500/40 text-emerald-400",
  declined: "mkt-border mkt-faint",
};

export function RequestsPanel({ workspaceId, onClose }: RequestsPanelProps) {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RequestStatus | "all">("open");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (search?: string, status?: RequestStatus | "all") => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ workspaceId, limit: "120" });
        if (search?.trim()) params.set("query", search.trim());
        const s = status ?? filter;
        if (s && s !== "all") params.set("status", s);
        const res = await fetch(`/api/chat/requests?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not load requests");
        setRequests(Array.isArray(data.requests) ? data.requests : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load requests");
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, filter]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const changeFilter = (next: RequestStatus | "all") => {
    setFilter(next);
    void load(query, next);
  };

  const advance = async (req: FeatureRequest) => {
    const next = NEXT_STATUS[req.status];
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: next } : r)));
    await fetch("/api/chat/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, id: req.id, status: next }),
    }).catch(() => undefined);
    // A status change can move a row out of the current filter — refresh.
    if (filter !== "all") void load(query, filter);
  };

  const decline = async (req: FeatureRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: "declined" } : r)));
    await fetch("/api/chat/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, id: req.id, status: "declined" }),
    }).catch(() => undefined);
    if (filter !== "all") void load(query, filter);
  };

  const remove = async (id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/chat/requests?workspaceId=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b mkt-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-3.5 w-3.5 mkt-accent-text" />
          <h2 className="text-[13px] font-semibold mkt-text">Requests</h2>
          <span className="text-[11px] mkt-faint">{requests.length}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg mkt-faint transition-colors hover:mkt-bg2 hover:mkt-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 space-y-2 border-b mkt-border px-3 py-3">
        <p className="text-[11px] leading-relaxed mkt-faint">
          What people asked for and the chat couldn&apos;t do yet. Ranked by how often it&apos;s been asked.
        </p>

        <div className="flex items-center gap-2 rounded-xl border mkt-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 mkt-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load(query)}
            placeholder="Search requests"
            className="w-full bg-transparent text-[12.5px] mkt-text outline-none placeholder:mkt-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                void load("", filter);
              }}
              className="shrink-0 mkt-faint hover:mkt-text"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => changeFilter(f.key)}
              className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                filter === f.key
                  ? "border-[color:var(--mkt-accent)]/60 mkt-accent-text"
                  : "mkt-border mkt-faint hover:mkt-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error && <p className="mb-2 text-[12px] text-red-400">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] mkt-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading
          </div>
        ) : requests.length === 0 ? (
          <p className="py-8 text-center text-[12px] leading-relaxed mkt-faint">
            Nothing here. When the chat has to turn something down, it lands here so you can decide whether to build it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {requests.map((req) => (
              <li key={req.id} className="group rounded-xl border mkt-border px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="block text-[12.5px] font-medium leading-snug mkt-text">{req.title}</span>
                      {req.timesAsked > 1 && (
                        <span className="shrink-0 rounded-full border border-[color:var(--mkt-accent)]/40 px-1.5 text-[10px] mkt-accent-text">
                          ×{req.timesAsked}
                        </span>
                      )}
                    </span>
                    {req.request && req.request !== req.title && (
                      <span className="mt-0.5 block text-[11.5px] leading-[1.6] mkt-muted">
                        &ldquo;{req.request}&rdquo;
                      </span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] mkt-faint">
                      <span
                        className={`rounded border px-1 py-px uppercase tracking-wide ${STATUS_STYLE[req.status]}`}
                      >
                        {req.status}
                      </span>
                      <span className="rounded border mkt-border px-1 py-px">
                        {REASON_LABEL[req.reason] || req.reason}
                      </span>
                      {req.examples.length > 1 && <span>{req.examples.length} phrasings</span>}
                    </span>
                    {req.detail && (
                      <span className="mt-1 block text-[10.5px] leading-relaxed mkt-faint">{req.detail}</span>
                    )}
                  </span>

                  <span className="flex shrink-0 flex-col items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      title={`Mark ${NEXT_STATUS[req.status]}`}
                      onClick={() => void advance(req)}
                      className="flex h-6 w-6 items-center justify-center rounded mkt-faint hover:mkt-accent-text"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </button>
                    {req.status !== "declined" && (
                      <button
                        type="button"
                        title="Decline"
                        onClick={() => void decline(req)}
                        className="flex h-6 w-6 items-center justify-center rounded mkt-faint hover:mkt-text"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete this request"
                      onClick={() => void remove(req.id)}
                      className="flex h-6 w-6 items-center justify-center rounded mkt-faint hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
