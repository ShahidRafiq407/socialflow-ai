"use client";

// ============================================================================
// FEEDBACK QUEUE
//
// Each row is one vote with the answer's excerpt and the model that gave it.
// Triage is three buttons: reviewed, actioned, dismissed — with an optional
// note that stays on the row.
// ============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FeedbackQueue, FeedbackRow } from "@/lib/admin/feedback";
import { triageFeedbackAction } from "@/actions/admin";
import { Empty, Section, Stat, fmtDate, fmtInt } from "./primitives";

const FILTER_LABEL = { new: "New", down: "Thumbs down", all: "All" } as const;

function Row({ row }: { row: FeedbackRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [note, setNote] = useState(row.adminNote ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  const triage = async (status: "reviewed" | "actioned" | "dismissed" | null) => {
    setBusy(status ?? "reopen");
    await triageFeedbackAction({ id: row.id, status, adminNote: note || undefined });
    setBusy(null);
    startTransition(() => router.refresh());
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {row.rating > 0 ? <ThumbsUp className="h-4 w-4 text-emerald-500" /> : <ThumbsDown className="h-4 w-4 text-rose-500" />}
        <Link href={`/dashboard/admin/users/${row.userId}`} className="font-medium hover:underline">{row.userEmail}</Link>
        <span className="font-mono text-[10px] text-muted-foreground">{row.model || "model unknown"}</span>
        {row.status ? <Badge variant="outline" className="text-[10px]">{row.status}</Badge> : <Badge variant="secondary" className="bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">new</Badge>}
        <span className="ml-auto text-muted-foreground">{fmtDate(row.createdAt)}</span>
      </div>
      {row.comment && <p className="mt-1.5 text-sm">{row.comment}</p>}
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
        <span className="text-[10px] text-muted-foreground">session {row.sessionId.slice(0, 8)}…</span>
      </div>
    </li>
  );
}

export function FeedbackQueueView({ queue, filter }: { queue: FeedbackQueue; filter: keyof typeof FILTER_LABEL }) {
  const total30 = queue.summary.up30d + queue.summary.down30d;
  const satisfaction = total30 > 0 ? Math.round((queue.summary.up30d / total30) * 100) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="New" value={fmtInt(queue.summary.newCount)} tone={queue.summary.newCount > 0 ? "warn" : "default"} hint="awaiting triage" />
        <Stat label="Thumbs up (30d)" value={fmtInt(queue.summary.up30d)} tone="good" />
        <Stat label="Thumbs down (30d)" value={fmtInt(queue.summary.down30d)} tone={queue.summary.down30d > 0 ? "bad" : "default"} />
        <Stat label="Satisfaction" value={satisfaction === null ? "—" : `${satisfaction}%`} hint="up ÷ all votes, 30d" />
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
        title="Votes"
        action={
          <div className="flex gap-1">
            {(Object.keys(FILTER_LABEL) as Array<keyof typeof FILTER_LABEL>).map((f) => (
              <Link key={f} href={`/dashboard/admin/feedback?filter=${f}`} className={`rounded-md px-2 py-1 text-xs ${f === filter ? "bg-primary text-primary-foreground" : "border border-slate-200 dark:border-slate-800 hover:bg-muted"}`}>
                {FILTER_LABEL[f]}
              </Link>
            ))}
          </div>
        }
      >
        {queue.rows.length === 0 ? (
          <Empty>{filter === "new" ? "Nothing new to review." : "No votes match."}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {queue.rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
