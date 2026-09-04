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
// Three tabs, and the third is a different kind of thing:
//
//   Alerts  — this workspace, needs a decision or a fix
//   Updates — this workspace, worth knowing
//   System  — the product itself talking to everyone, no workspace involved
//
// "Read" is a timestamp in localStorage — per workspace for the first two, and one
// account-wide key for System, because a system message is the same message in
// every workspace and reading it twice is not reading it twice.
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
  Megaphone,
  RefreshCw,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  getNotifications,
  type NotificationItem,
  type NotificationTone,
} from "@/actions/notifications";
import {
  getSystemNotices,
  retractSystemNotice,
  type SystemNoticeItem,
} from "@/actions/systemNotices";
import { SystemNoticeComposer } from "@/components/dashboard/SystemNoticeComposer";

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

/** System messages are account-wide, so their read mark is too. */
const SYSTEM_SEEN_KEY = "postloom-system-notices-seen";

function readStamp(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStamp(key: string, stamp: string): void {
  try {
    window.localStorage.setItem(key, stamp);
  } catch {
    // Blocked storage just means the dot comes back next load — harmless.
  }
}

/** The newest timestamp in a list, which is what "mark all read" marks up to. */
function newestAt(items: { at?: string | null }[]): string | null {
  return items.reduce<string | null>(
    (latest, item) => (item.at && (!latest || item.at > latest) ? item.at : latest),
    null
  );
}

function countUnread(items: { at?: string | null }[], seenAt: string | null): number {
  return items.filter((item) => item.at && (!seenAt || item.at > seenAt)).length;
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
  const [notices, setNotices] = useState<SystemNoticeItem[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [systemSeenAt, setSystemSeenAt] = useState<string | null>(null);
  const [tab, setTab] = useState<"alerts" | "updates" | "system">("alerts");

  // Both feeds in one round trip. The workspace feed is scoped by the cookie the
  // server already resolved; the system feed is not scoped at all, which is the
  // whole point of it.
  const load = useCallback(async () => {
    setLoading(true);
    const [feed, system] = await Promise.all([
      getNotifications().catch(() => ({ items: [] as NotificationItem[] })),
      getSystemNotices().catch(() => ({ items: [] as SystemNoticeItem[], canPublish: false })),
    ]);
    setItems(feed.items);
    setNotices(system.items);
    setCanPublish(system.canPublish);
    setLoading(false);
    setLoaded(true);
  }, []);

  // The dot has to be right before the panel is ever opened, so the first fetch
  // happens on mount — and again whenever the workspace changes underneath us.
  useEffect(() => {
    setSeenAt(readStamp(seenKey(activeWorkspaceId)));
    setSystemSeenAt(readStamp(SYSTEM_SEEN_KEY));
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
  const workspaceUnread = useMemo(() => countUnread(items, seenAt), [items, seenAt]);
  const systemUnread = useMemo(() => countUnread(notices, systemSeenAt), [notices, systemSeenAt]);
  const unread = workspaceUnread + systemUnread;

  /**
   * Marks both feeds up to their own newest item. One button, because "mark all
   * read" that leaves the badge lit on another tab is not what it says.
   */
  function markAllRead() {
    const now = new Date().toISOString();

    if (workspaceUnread > 0) {
      const stamp = newestAt(items) || now;
      setSeenAt(stamp);
      writeStamp(seenKey(activeWorkspaceId), stamp);
    }

    if (systemUnread > 0) {
      const stamp = newestAt(notices) || now;
      setSystemSeenAt(stamp);
      writeStamp(SYSTEM_SEEN_KEY, stamp);
    }
  }

  async function retract(id: string) {
    const result = await retractSystemNotice(id).catch(() => ({ success: false as const }));
    if (result.success) setNotices((current) => current.filter((notice) => notice.id !== id));
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

  /**
   * A system notice is a message, not a task: the row is text, and the link is a
   * link inside it rather than the whole row being clickable. That difference is
   * deliberate — clicking an announcement should not navigate you somewhere.
   */
  function renderSystemNotice(notice: SystemNoticeItem) {
    const Icon = TONE_ICONS[notice.tone];
    const isNew = Boolean(notice.at && (!systemSeenAt || notice.at > systemSeenAt));
    const external = /^https?:\/\//i.test(notice.href);
    const label = notice.linkLabel || (external ? "Open link" : "Read more");

    return (
      <div
        key={notice.id}
        className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${TONE_CLASSES[notice.tone]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 text-xs font-medium text-slate-800 dark:text-slate-100">
              {notice.title}
            </span>
            {isNew && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          </div>
          {notice.body && (
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {notice.body}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            {notice.at && <span className="text-[10px] text-slate-400">{relativeTime(notice.at)}</span>}
            {notice.href &&
              (external ? (
                <a
                  href={notice.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                >
                  {label}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <Link
                  href={notice.href}
                  onClick={() => setOpen(false)}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  {label}
                </Link>
              ))}
            {canPublish && (
              <button
                type="button"
                onClick={() => void retract(notice.id)}
                className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-destructive transition-colors"
              >
                <Undo2 className="h-2.5 w-2.5" />
                Retract
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const visible = tab === "alerts" ? alerts : tab === "updates" ? updates : [];

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
          {(["alerts", "updates", "system"] as const).map((key) => {
            const count =
              key === "alerts" ? alerts.length : key === "updates" ? updates.length : notices.length;
            const isActive = tab === key;
            const hasUnread = key === "system" ? systemUnread > 0 : false;
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
                {hasUnread && !isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {!loaded && loading && (
            <p className="flex items-center gap-2 px-2 py-6 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {tab === "system" ? "Checking for announcements…" : "Checking this workspace…"}
            </p>
          )}

          {tab === "system" ? (
            <>
              {canPublish && <SystemNoticeComposer onPublished={() => void load()} />}

              {loaded && notices.length === 0 && (
                <p className="flex flex-col items-center gap-1.5 px-2 py-6 text-center text-xs text-slate-400">
                  <Megaphone className="h-4 w-4 text-slate-300" />
                  No announcements right now.
                </p>
              )}

              {notices.map(renderSystemNotice)}
            </>
          ) : (
            <>
              {loaded && visible.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-slate-400">
                  {tab === "alerts"
                    ? "Nothing needs your attention in this workspace."
                    : "No recent activity in this workspace yet."}
                </p>
              )}

              {visible.map(renderItem)}
            </>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 text-[10px] text-slate-400">
          {tab === "system"
            ? "System messages come from PostLoom and reach every workspace."
            : "Alerts are per workspace — switch workspaces to see another brand's."}
        </div>

      </PopoverContent>
    </Popover>
  );
}



