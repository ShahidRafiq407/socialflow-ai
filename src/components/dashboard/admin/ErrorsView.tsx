"use client";

// ============================================================================
// ERRORS VIEW
//
// One row per fingerprint. The stack and context open on demand — the list
// is for scanning, the detail is for fixing.
// ============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Loader2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ErrorRow } from "@/lib/admin/errors";
import { resolveAllErrorsAction, resolveErrorAction } from "@/actions/admin";
import { Empty, Section, fmtAgo, fmtDate, fmtInt } from "./primitives";

function Row({ row, onError }: { row: ErrorRow; onError: (message: string) => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async (resolved: boolean) => {
    setBusy(true);
    // The action returns a Result, and its failure branch used to be discarded: a
    // refused resolve looked exactly like a successful one — spinner off, row
    // unchanged after the refresh — so the only way to notice was to reload and
    // find the error still open.
    const result = await resolveErrorAction({ id: row.id, resolved });
    setBusy(false);
    if (!result.success) {
      onError(result.error || "Could not update that error.");
      return;
    }
    startTransition(() => router.refresh());
  };

  return (
    <li className={`py-2.5 ${row.resolvedAt ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-0.5 text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono text-[10px]">{row.source}</Badge>
            {row.kind && <span className="text-[10px] text-muted-foreground">{row.kind}</span>}
            <span className="rounded-full bg-rose-500/10 px-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">×{fmtInt(row.count)}</span>
            <span className="ml-auto text-muted-foreground">last {fmtAgo(row.lastSeen)}</span>
          </div>
          <div className="mt-0.5 break-words font-mono text-xs">{row.message}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
            {row.path && <span>{row.method ? `${row.method} ` : ""}{row.path}</span>}
            {row.userEmail && <Link href={`/adminshahid/users/${row.userId}`} className="hover:underline">{row.userEmail}</Link>}
            <span>first {fmtDate(row.firstSeen)}</span>
            {row.resolvedAt && <span>resolved {fmtAgo(row.resolvedAt)}{row.resolvedBy ? ` by ${row.resolvedBy}` : ""}</span>}
          </div>
          {open && (
            <div className="mt-2 space-y-2">
              {row.stack && <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[10px] leading-relaxed text-slate-200">{row.stack}</pre>}
              {row.context ? <pre className="max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[10px]">{JSON.stringify(row.context, null, 2)}</pre> : null}
              <div className="text-[10px] text-muted-foreground">fingerprint {row.fingerprint}{row.workspaceId ? ` · workspace ${row.workspaceId}` : ""}</div>
            </div>
          )}
        </div>
        <Button size="xs" variant={row.resolvedAt ? "ghost" : "outline"} disabled={busy} onClick={() => toggle(!row.resolvedAt)}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : row.resolvedAt ? <Undo2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {row.resolvedAt ? "Reopen" : "Resolve"}
        </Button>
      </div>
    </li>
  );
}

export function ErrorsView({ errors, includeResolved }: { errors: ErrorRow[]; includeResolved: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = errors.filter((e) => !e.resolvedAt);

  return (
    <Section
      title={includeResolved ? "All errors" : `Open errors (${open.length})`}
      description="Caught by Next's server error hook and by explicit reports; grouped by source, message and path. Personal data is redacted before storage."
      action={
        <div className="flex items-center gap-2">
          <Link href={includeResolved ? "/adminshahid/errors" : "/adminshahid/errors?all=1"} className="text-xs text-primary hover:underline">
            {includeResolved ? "Open only" : "Include resolved"}
          </Link>
          {open.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await resolveAllErrorsAction();
                setBusy(false);
                if (!result.success) {
                  setError(result.error || "Could not resolve those errors.");
                  return;
                }
                startTransition(() => router.refresh());
              }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Resolve all
            </Button>
          )}
        </div>
      }
    >
      {error && (
        <p className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {errors.length === 0 ? (
        <Empty>{includeResolved ? "No errors recorded." : "No open errors."}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {errors.map((row) => (
            <Row key={row.id} row={row} onError={setError} />
          ))}
        </ul>
      )}
    </Section>
  );
}
