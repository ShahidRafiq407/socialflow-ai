"use client";

// ============================================================================
// NOTIFICATIONS BELL
//
// The old bell was decoration: one hardcoded "All Systems Operational" row and a
// red dot that was always on, so it could never mean anything. This one reads the
// active workspace's real events (failed publishes, blocked article runs, expiring
// tokens, approvals, receipts, setup gaps) and the dot only lights up when
// something newer than your last visit is in the list.
//
// "Read" is a timestamp in localStorage, per workspace — no extra table, and
// another brand's alerts can never be marked read by looking at this one.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  getNotifications,
  type NotificationItem,
  type NotificationTone,
} from "@/actions/notifications";

const TONE_ICONS: Record<NotificationTone, LucideIcon> = {
  error: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
};

const TONE_CLASSES: Record<NotificationTone, string> = {
  error: "text-rose-500",
  warning: "text-amber-500",
  success: "text-emerald-500",
  info: "text-sky-500",
};

/** Anything needing a decision or a fix lives in Alerts; the rest is Updates. */
function isAlert(item: NotificationItem): boolean {
  return item.tone === "error" || item.tone === "warning";
}

function seenKey(workspaceId: string | null): string {
  return `postloom-notifications-seen:${workspaceId || "none"}`;
}

function readSeen(workspaceId: string | null): string | null {
  try {
    return window.localStorage.getItem(seenKey(workspaceId));
  } catch {
    return null;
  }
}

/** Short relative time — the rows are one line, so "2h ago" not a full date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const future = diff < 0;
  const mins = Math.round(Math.abs(diff) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface NotificationsBellProps {
  activeWorkspaceId: string | null;
}

export function NotificationsBell({ activeWorkspaceId }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [tab, setTab] = useState<"alerts" | "updates">("alerts");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const feed = await getNotifications();
      setItems(feed.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // The dot has to be right before the panel is ever opened, so the first fetch
  // happens on mount — and again whenever the workspace changes underneath us.
  useEffect(() => {
    setSeenAt(readSeen(activeWorkspaceId));
    setItems([]);
    setLoaded(false);
    void load();
  }, [activeWorkspaceId, load]);

  // Coming back to the tab is exactly when a publish that ran while you were away
  // should surface, so refetch on focus and on open.
  useEffect(() => {
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const alerts = useMemo(() => items.filter(isAlert), [items]);
  const updates = useMemo(() => items.filter((item) => !isAlert(item)), [items]);

  // Only timestamped items can be new; standing setup advice has no `at`, so it
  // never inflates the count.
  const unread = useMemo(
    () => items.filter((item) => item.at && (!seenAt || item.at > seenAt)).length,
    [items, seenAt]
  );

  const latestAt = useMemo(
    () =>
      items.reduce<string | null>(
        (latest, item) => (item.at && (!latest || item.at > latest) ? item.at : latest),
        null
      ),
    [items]
  );

  function markAllRead() {
    const stamp = latestAt || new Date().toISOString();
    setSeenAt(stamp);
    try {
      window.localStorage.setItem(seenKey(activeWorkspaceId), stamp);
    } catch {
      // Blocked storage just means the dot comes back next load — harmless.
    }
  }

  function renderItem(item: NotificationItem) {
    const Icon = TONE_ICONS[item.tone];
    const isNew = Boolean(item.at && (!seenAt || item.at > seenAt));
    const external = /^https?:\/\//i.test(item.href);

    const body = (
      <>
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${TONE_CLASSES[item.tone]}`} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 text-xs font-medium text-slate-800 dark:text-slate-100">
              {item.title}
            </span>
            {isNew && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          </span>
          {item.body && (
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {item.body}
            </span>
          )}
          {item.at && (
            <span className="mt-0.5 block text-[10px] text-slate-400">{relativeTime(item.at)}</span>
          )}
        </span>
        {external && <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-slate-300" />}
      </>
    );

    const className =
      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors";

    if (external) {
      return (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpen(false)}
          className={className}
        >
          {body}
        </a>
      );
    }

    return (
      <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className={className}>
        {body}
      </Link>
    );
  }

  const visible = tab === "alerts" ? alerts : updates;

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(Boolean(next))}>
      <PopoverTrigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(92vw,22rem)] gap-0 p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Notifications
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh notifications"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </button>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          </span>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 px-2 py-1.5">
          {(["alerts", "updates"] as const).map((key) => {
            const count = key === "alerts" ? alerts.length : updates.length;
            const isActive = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] capitalize transition-colors ${
                  isActive
                    ? "bg-slate-100 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
                    : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                {key}
                <span className="text-slate-400">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {!loaded && loading && (
            <p className="flex items-center gap-2 px-2 py-6 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking this workspace…
            </p>
          )}

          {loaded && visible.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-slate-400">
              {tab === "alerts"
                ? "Nothing needs your attention in this workspace."
                : "No recent activity in this workspace yet."}
            </p>
          )}

          {visible.map(renderItem)}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 text-[10px] text-slate-400">
          Alerts are per workspace — switch workspaces to see another brand&apos;s.
        </div>

      </PopoverContent>
    </Popover>
  );
}



