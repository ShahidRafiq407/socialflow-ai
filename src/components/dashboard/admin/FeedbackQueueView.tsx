"use client";

// ============================================================================
// FEEDBACK QUEUE
//
// Two kinds of row in one list. A chat vote carries a thumb, the model that
// answered and an excerpt of that answer. A written message from the dashboard
// feedback box carries the bucket the user picked and the screen they were on,
// and has no session behind it — so nothing here may assume one.
//
// Triage is three buttons: reviewed, actioned, dismissed — with an optional
// note that stays on the row. The row's kind decides which table is written.
// ============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquare, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FeedbackFilter, FeedbackQueue, FeedbackRow } from "@/lib/admin/feedback";
import { triageFeedbackAction } from "@/actions/admin";
import { Empty, Section, Stat, fmtDate, fmtInt } from "./primitives";

const FILTER_LABEL: Record<FeedbackFilter, string> = {
  new: "New",
  down: "Thumbs down",
  general: "Written",
  all: "All",
};

/** The dialog's five buckets in words. An unknown value is shown as it came. */
const CATEGORY_LABEL: Record<string, string> = {
  bug: "Something broken",
  idea: "Idea",
  praise: "Praise",
  billing: "Billing or plan",
  other: "Other",
};

/**
 * A written message that picked a neutral bucket was never asked to rate
 * anything, so it gets neither thumb — a red one would read as a complaint.
 */
function RatingIcon({ rating }: { rating: number | null }) {
  if (rating !== null && rating > 0) return <ThumbsUp className="h-4 w-4 text-emerald-500" />;
  if (rating !== null && rating < 0) return <ThumbsDown className="h-4 w-4 text-rose-500" />;
  return <MessageSquare className="h-4 w-4 text-slate-400" />;
}

function Row({ row }: { row: FeedbackRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [note, setNote] = useState(row.adminNote ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triage = async (status: "reviewed" | "actioned" | "dismissed" | null) => {
    setBusy(status ?? "reopen");
    setError(null);
    // A discarded Result made a refused triage indistinguishable from a successful
    // one: the spinner stopped, the refresh ran, and the row came back exactly as it
    // was — so the note the admin had just typed looked saved when it was not.
    const result = await triageFeedbackAction({
      id: row.id,
      kind: row.kind,
      status,
      adminNote: note || undefined,
    });
    setBusy(null);
    if (!result.success) {
      setError(result.error || "Could not save that triage.");
      return;
    }
    startTransition(() => router.refresh());
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <RatingIcon rating={row.rating} />
        <Link href={`/adminshahid/users/${row.userId}`} className="font-medium hover:underline">{row.userEmail}</Link>
        {row.kind === "chat" ? (
          <span className="font-mono text-[10px] text-muted-foreground">{row.model || "model unknown"}</span>
        ) : (
          <Badge variant="secondary" className="bg-sky-500/15 text-[10px] text-sky-700 dark:text-sky-300">
            {CATEGORY_LABEL[row.category ?? ""] || row.category || "Written"}
          </Badge>
        )}
        {row.status ? <Badge variant="outline" className="text-[10px]">{row.status}</Badge> : <Badge variant="secondary" className="bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">new</Badge>}
        <span className="ml-auto text-muted-foreground">{fmtDate(row.createdAt)}</span>
      </div>
      {row.comment && <p className="mt-1.5 text-sm whitespace-pre-wrap">{row.comment}</p>}
      {row.messageExcerpt && (
        <blockquote className="mt-1.5 border-l-2 border-slate-200 dark:border-slate-700 pl-3 text-xs text-muted-foreground line-clamp-4">
          {row.messageExcerpt}
        </blockquote>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin note (optional)" className="h-7 max-w-xs text-xs" maxLength={1000} />
        {row.status === null ? (
          <>
            <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => triage("reviewed")}>
              {busy === "reviewed" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Reviewed
            </Button>
            <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => triage("actioned")}>
              {busy === "actioned" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Actioned
            </Button>
            <Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => triage("dismissed")}>
              {busy === "dismissed" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Dismiss
            </Button>
          </>
        ) : (
          <Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => triage(null)}>
            {busy === "reopen" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Reopen
          </Button>
        )}
        {/* A written message has no session, so this used to read a null and take
            the whole page down with it. Its screen is the useful context instead. */}
        {row.sessionId ? (
          <span className="text-[10px] text-muted-foreground">session {row.sessionId.slice(0, 8)}…</span>
        ) : row.path ? (
          <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[220px]">{row.path}</span>
        ) : null}
      </div>
      {error && (
        <p className="mt-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

export function FeedbackQueueView({ queue, filter }: { queue: FeedbackQueue; filter: FeedbackFilter }) {
  // Answer votes only, matching how the figure is counted — a written message was
  // never a vote, so counting it here would move a number the team reads weekly.
  const total30 = queue.summary.up30d + queue.summary.down30d;
  const satisfaction = total30 > 0 ? Math.round((queue.summary.up30d / total30) * 100) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="New" value={fmtInt(queue.summary.newCount)} tone={queue.summary.newCount > 0 ? "warn" : "default"} hint="votes and messages awaiting triage" />
        <Stat label="Thumbs up (30d)" value={fmtInt(queue.summary.up30d)} tone="good" hint="on assistant answers" />
        <Stat label="Thumbs down (30d)" value={fmtInt(queue.summary.down30d)} tone={queue.summary.down30d > 0 ? "bad" : "default"} hint="on assistant answers" />
        <Stat label="Satisfaction" value={satisfaction === null ? "—" : `${satisfaction}%`} hint="up ÷ all answer votes, 30d" />
        <Stat label="Written (30d)" value={fmtInt(queue.summary.general30d)} hint="from the dashboard feedback box" />
        <Stat label="Written, new" value={fmtInt(queue.summary.generalNew)} tone={queue.summary.generalNew > 0 ? "warn" : "default"} hint="nobody has read these yet" />
      </div>

      {queue.summary.byModel.length > 0 && (
        <Section title="By model (30d)">
          <div className="flex flex-wrap gap-2">
            {queue.summary.byModel.map((m) => (
              <div key={m.model} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs">
                <span className="font-mono">{m.model}</span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ThumbsUp className="h-3 w-3" />{m.up}</span>
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><ThumbsDown className="h-3 w-3" />{m.down}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Feedback"
        description="Assistant votes and written messages, newest first."
        action={
          <div className="flex gap-1">
            {(Object.keys(FILTER_LABEL) as FeedbackFilter[]).map((f) => (
              <Link key={f} href={`/adminshahid/feedback?filter=${f}`} className={`rounded-md px-2 py-1 text-xs ${f === filter ? "bg-primary text-primary-foreground" : "border border-slate-200 dark:border-slate-800 hover:bg-muted"}`}>
                {FILTER_LABEL[f]}
              </Link>
            ))}
          </div>
        }
      >
        {queue.rows.length === 0 ? (
          <Empty>
            {filter === "new"
              ? "Nothing new to review."
              : filter === "general"
                ? "Nobody has written in yet."
                : "Nothing matches that filter."}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {queue.rows.map((row) => (
              // The two tables have their own id sequences, so the kind keeps the
              // key unique even in the astronomically unlikely case they collide.
              <Row key={`${row.kind}-${row.id}`} row={row} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
