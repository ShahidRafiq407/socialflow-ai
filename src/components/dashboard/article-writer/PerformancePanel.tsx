"use client";

/**
 * WHAT HAPPENED TO THE PAGES THIS WORKSPACE PUBLISHED
 *
 * Every other panel on this screen is about one run. This one is about the weeks
 * afterwards: the URL that went live, what Search Console says it is being found
 * for, and what came out of the gap between those two.
 *
 * Three things it will not do:
 *
 *   1. It never writes to a live page, and it has no control that could. Approving
 *      a proposal starts an article run; the update reaches the page when somebody
 *      presses Publish on the draft that run produces, in the Publish card, like
 *      every other article.
 *   2. It keeps candidates and verdicts apart. The query list is a mechanical
 *      match — impressions, minus the words the page does not contain. The proposal
 *      is what a model concluded after reading the page. They are drawn and
 *      labelled differently, because only one of them has read anything.
 *   3. It never types a status. "Verified" is derived server-side from the
 *      verification run's own evidence gate. The one status a person sets by hand
 *      is "dismissed".
 *
 * Everything off the wire goes back through the guards in `performance.ts` — the
 * same file the server totalled the numbers with, so a figure drawn here cannot
 * disagree with the row it came from.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Gauge,
  Loader2,
  RefreshCw,
  ScanSearch,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  optimizationStatus,
  readOpportunities,
  readOptimizations,
  readOptimizationProposal,
  readPerformanceSummary,
  readPublications,
  type OptimizationProposal,
  type OptimizationView,
  type PerformanceSummary,
  type PublicationView,
  type QueryOpportunity,
} from "@/lib/article/performance";
import { AnalysisCard, Block, OutLink, Stat } from "./AnalysisShell";

/** Why a query is on the candidate list, in the words `performance.ts` measured it by. */
const KIND_LABEL: Record<string, string> = {
  absent: "nowhere on the page",
  unheaded: "in the text, not in a heading",
  underperforming: "covered, and still not chosen",
};

/** What a proposal's state means to the person reading the card. */
const STATUS_LABEL: Record<string, string> = {
  proposed: "waiting on you",
  verified: "passed the evidence gate",
  applied: "published",
  dismissed: "dismissed",
  failed: "the evidence gate refused it",
};

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** One request shape. A non-2xx answer throws the server's own sentence. */
async function post(
  workspaceId: string,
  step: string,
  payload: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/article-writer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, workspaceId, ...payload }),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const stated = data && typeof data.error === "string" ? data.error.trim() : "";
    throw new Error(stated || `The request failed (HTTP ${res.status}).`);
  }
  return data ?? {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** What one scan concluded, held apart from the proposal row it may have written. */
interface ScanConclusion {
  summary: string;
  actionable: boolean;
  note: string;
  modelCalls: number;
}

/** One published page in the list. The badge counts proposal rows, not opinions. */
function PageRow({
  page,
  active,
  onSelect,
}: {
  page: PublicationView;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active}
        className={`w-full rounded-lg border px-2 py-1.5 text-left ${
          active
            ? "border-primary/40 bg-primary/5"
            : "border-border bg-background hover:bg-muted/40"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
            {page.title || page.url}
          </span>
          {page.openProposals > 0 && (
            <span className="shrink-0 rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {page.openProposals} open
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{page.url}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {page.lastDataDay
            ? `Data stored up to ${page.lastDataDay}`
            : "No Search Console rows stored yet"}
          {page.keyword ? ` · written for “${page.keyword}”` : ""}
        </span>
      </button>
    </li>
  );
}

/**
 * The queries this page is found for.
 *
 * `ctr` and `position` per query are impression-weighted totals for the window,
 * which is how Search Console averages them itself. Nothing here is a target.
 */
function QueryTable({ summary, limit = 12 }: { summary: PerformanceSummary; limit?: number }) {
  const shown = summary.queries.slice(0, limit);
  const head = "py-1 pr-2 font-bold uppercase tracking-wide";
  const cell = "py-1 pr-2 text-right text-muted-foreground";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[10px]">
        <thead className="text-muted-foreground">
          <tr>
            <th className={head}>Query</th>
            <th className={`${head} text-right`}>Impressions</th>
            <th className={`${head} text-right`}>Clicks</th>
            <th className={`${head} text-right`}>CTR</th>
            <th className={`${head} text-right`}>Position</th>
            <th className={`${head} text-right`}>Days</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.query} className="border-t border-border">
              <td className="py-1 pr-2 text-foreground">{row.query}</td>
              <td className={cell}>{row.impressions.toLocaleString()}</td>
              <td className={cell}>{row.clicks.toLocaleString()}</td>
              <td className={cell}>{percent(row.ctr)}</td>
              <td className={cell}>{row.position.toFixed(1)}</td>
              <td className={cell}>{row.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.queries.length > shown.length && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          +{summary.queries.length - shown.length} more queries stored for this page.
        </p>
      )}
    </div>
  );
}

/**
 * The mechanical candidates.
 *
 * Drawn plainly on purpose — no card, no accent, no verb. Each row is
 * "this query has impressions and these words are not on the page", which is a
 * measurement, not a recommendation. Whether the page *answers* the question is a
 * judgement, and it lives in the proposal below with a different border around it.
 */
function CandidateList({ rows, limit = 8 }: { rows: QueryOpportunity[]; limit?: number }) {
  const shown = rows.slice(0, limit);
  return (
    <>
      <ul className="space-y-1.5">
        {shown.map((row) => (
          <li key={`${row.kind}-${row.query}`} className="rounded-lg border border-border bg-background px-2 py-1.5">
            <p className="flex items-start gap-1.5">
              <span className="min-w-0 flex-1 text-[11px] font-semibold text-foreground">
                {row.query}
              </span>
              <span className="shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {KIND_LABEL[row.kind] || row.kind}
              </span>
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{row.reason}</p>
            {row.missingTerms.length > 0 && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Words not found: {row.missingTerms.join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          +{rows.length - shown.length} more candidate queries were measured.
        </p>
      )}
    </>
  );
}

/** The words the proposal is written in. A section is an outline, never prose. */
function ProposalBody({ proposal }: { proposal: OptimizationProposal }) {
  return (
    <>
      <p className="text-[11px] leading-relaxed text-foreground">{proposal.summary}</p>

      {proposal.sections.length > 0 && (
        <Block title={`Sections to add (${proposal.sections.length})`}>
          <ul className="space-y-1.5">
            {proposal.sections.map((section, index) => (
              <li
                key={`${section.heading}-${index}`}
                className="rounded-lg border border-border bg-background px-2 py-1.5"
              >
                <p className="text-[11px] font-semibold text-foreground">{section.heading}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {section.placeAfter
                    ? `Goes after the existing “${section.placeAfter}”`
                    : "Goes at the end of the article"}
                  {section.queries.length ? ` · answers: ${section.queries.join(", ")}` : ""}
                </p>
                {section.covers.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {section.covers.map((point, at) => (
                      <li key={at} className="text-[10px] leading-snug text-muted-foreground">
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
                {section.needsResearch.length > 0 && (
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Needs establishing first: {section.needsResearch.join("; ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}
      {/* PROPOSAL_BODY_TAIL */}
      {proposal.edits.length > 0 && (
        <Block title={`Passages to change (${proposal.edits.length})`}>
          <ul className="space-y-1.5">
            {proposal.edits.map((edit, index) => (
              <li
                key={`${edit.target}-${index}`}
                className="rounded-lg border border-border bg-background px-2 py-1.5"
              >
                <p className="text-[11px] font-semibold text-foreground">{edit.target}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {edit.change}
                </p>
                {edit.queries.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    For: {edit.queries.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {proposal.answered.length > 0 && (
        <Block title="Already answered by the page">
          <ul className="space-y-0.5">
            {proposal.answered.map((row, index) => (
              <li key={`${row.query}-${index}`} className="text-[10px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{row.query}</span> — {row.where}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {proposal.declined.length > 0 && (
        <Block title="Not acted on, and why">
          <ul className="space-y-0.5">
            {proposal.declined.map((row, index) => (
              <li key={`${row.query}-${index}`} className="text-[10px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{row.query}</span> — {row.reason}
              </li>
            ))}
          </ul>
        </Block>
      )}
    </>
  );
}

/** The border a state is drawn in. Only a refusal gets the destructive tone. */
function tone(status: string): string {
  if (status === "failed") return "border-destructive/30 bg-destructive/5";
  if (status === "applied" || status === "dismissed") return "border-border bg-muted/30";
  return "border-primary/40 bg-primary/5";
}

/**
 * One proposal, and the three things a person can do about it.
 *
 * None of them writes to the page. Approving creates an `ArticleRun` that goes
 * through all 23 stages — research, the evidence gate, the fact check — and the
 * draft it produces is published by hand from the Publish card, like every other
 * article. "Dismiss" is the only status set by a person; "verified" is derived
 * server-side from that run's own evidence gate.
 */
function ProposalCard({
  row,
  busy,
  onApprove,
  onStatus,
  onDismiss,
}: {
  row: OptimizationView;
  busy: string;
  onApprove: () => void;
  onStatus: () => void;
  onDismiss: () => void;
}) {
  const proposal = row.proposal;
  const hasWork = !!proposal && (proposal.sections.length > 0 || proposal.edits.length > 0);
  const open = row.status === "proposed" || row.status === "verified";
  const button =
    "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold disabled:opacity-50";
  return (
    <li className={`rounded-xl border px-2.5 py-2 ${tone(row.status)}`}>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-foreground">
            {row.title || row.page}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            <OutLink href={row.page}>{row.page}</OutLink>
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
          {STATUS_LABEL[row.status] || row.status}
        </span>
      </div>

      {row.note && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{row.note}</p>
      )}

      {proposal ? (
        <div className="mt-2">
          <ProposalBody proposal={proposal} />
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          This row has no readable proposal on it — the scan wrote nothing a person could
          approve. Re-scan the page.
        </p>
      )}

      {row.triggers.length > 0 && (
        <Block title={`What raised it (${row.triggers.length} measured)`}>
          <CandidateList rows={row.triggers} limit={3} />
        </Block>
      )}
      {/* PROPOSAL_ACTIONS */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {open && (
          <button
            type="button"
            onClick={onApprove}
            disabled={!hasWork || busy === `verify:${row.id}`}
            title={
              hasWork
                ? undefined
                : "There is no section and no edit to verify. Re-scan the page instead."
            }
            className={`${button} border-primary/40 bg-primary/10 text-primary hover:bg-primary/20`}
          >
            {busy === `verify:${row.id}` ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {row.verifyRunId ? "Open the verification run" : "Approve — start a verification run"}
          </button>
        )}
        {row.verifyRunId && (
          <button
            type="button"
            onClick={onStatus}
            disabled={busy === `status:${row.id}`}
            className={`${button} border-border bg-background text-foreground hover:bg-muted/40`}
          >
            {busy === `status:${row.id}` ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Where has it got to?
          </button>
        )}
        {(open || row.status === "failed") && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy === `dismiss:${row.id}`}
            className={`${button} border-border bg-background text-muted-foreground hover:bg-muted/40`}
          >
            <X className="h-3 w-3" />
            Dismiss
          </button>
        )}
      </div>
      {/* PROPOSAL_FOOTNOTE */}
      {open && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Approving does not change the live page. It starts a full article run against{" "}
          {row.page ? "this URL" : "the page"} — research, the evidence gate, the fact check — and
          the update reaches the site when you press Publish on the draft that run produces.
        </p>
      )}
      {row.appliedAt && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Published from the verification run on {row.appliedAt.slice(0, 10)}.
        </p>
      )}
    </li>
  );
}

export interface PerformancePanelProps {
  workspaceId: string;
  /** A verification run exists — the HQ walks it like any other run. */
  onVerifyRun: (runId: string) => void;
  onNotice?: (kind: "info" | "error", message: string) => void;
  /** Changes after a publish, so the list reloads and the new page appears. */
  reloadKey?: string;
}

/**
 * The panel.
 *
 * Nothing is fetched until somebody opens the card: a workspace's publications,
 * their stored rows and their proposals are three queries, and a card nobody looked
 * at has no business making them.
 */
export default function PerformancePanel({
  workspaceId,
  onVerifyRun,
  onNotice,
  reloadKey,
}: PerformancePanelProps) {
  const [publications, setPublications] = useState<PublicationView[]>([]);
  const [selected, setSelected] = useState<PublicationView | null>(null);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [optimizations, setOptimizations] = useState<OptimizationView[]>([]);
  const [opportunities, setOpportunities] = useState<QueryOpportunity[]>([]);
  const [scan, setScan] = useState<ScanConclusion | null>(null);
  /** The first day Search Console is still counting. Labelled, never hidden. */
  const [incompleteFrom, setIncompleteFrom] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  /** One automatic load per mount. Everything after it is a button somebody pressed. */
  const askedRef = useRef(false);

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      const message = err instanceof Error && err.message ? err.message : fallback;
      setError(message);
      onNotice?.("error", message);
    },
    [onNotice]
  );
  /* PANEL_ACTIONS */
  /** This workspace's live pages, plus the proposals still waiting on somebody. */
  const loadList = useCallback(async () => {
    setBusy("list");
    setError("");
    try {
      const data = await post(workspaceId, "publications", { limit: 50 });
      const rows = readPublications(data.publications);
      setPublications(rows);
      setOptimizations(readOptimizations(data.optimizations));
      if (rows.length === 0) setSelected(null);
    } catch (err) {
      fail(err, "The published pages could not be loaded.");
    } finally {
      setBusy("");
    }
  }, [workspaceId, fail]);

  /**
   * One page's stored rows and its proposals.
   *
   * Reads what is already in the database. It never calls Google — a workspace
   * whose plan has lapsed can still see how the articles it paid for are doing.
   */
  const openPage = useCallback(
    async (page: PublicationView) => {
      setSelected(page);
      setSummary(null);
      setOpportunities([]);
      setScan(null);
      setIncompleteFrom("");
      setBusy("read");
      setError("");
      try {
        const data = await post(workspaceId, "performance-read", {
          publicationId: page.id,
          days: 90,
        });
        setSummary(readPerformanceSummary(data.summary));
        setOptimizations(readOptimizations(data.optimizations));
      } catch (err) {
        fail(err, "That page's stored performance could not be read.");
      } finally {
        setBusy("");
      }
    },
    [workspaceId, fail]
  );
  /* PANEL_SYNC */
  /**
   * Buy the last four weeks from Search Console.
   *
   * 28 days rather than 90: the API is quota'd per property, the window is a true
   * replace on the server, and four weeks is enough for a query to appear. The
   * summary that comes back covers everything stored, not just what this call wrote.
   */
  const sync = useCallback(async () => {
    if (!selected) return;
    const page = selected;
    setBusy("sync");
    setError("");
    try {
      const data = await post(workspaceId, "performance-sync", {
        publicationId: page.id,
        days: 28,
      });
      const next = readPerformanceSummary(data.summary);
      setSummary(next);
      setIncompleteFrom(text(data.incompleteFrom));

      // The list's "data stored up to" line comes from the same summary, so the row
      // and the panel cannot disagree about which day is the last one on file.
      const patch = (row: PublicationView): PublicationView =>
        row.id === page.id ? { ...row, lastDataDay: next.to || row.lastDataDay } : row;
      setPublications((rows) => rows.map(patch));
      setSelected((row) => (row ? patch(row) : row));

      const written = Math.max(0, Math.round(Number(data.written) || 0));
      const property = text(data.property);
      onNotice?.(
        "info",
        written > 0
          ? `Stored ${written} row${written === 1 ? "" : "s"} from ${
              property || "Search Console"
            } for ${next.from || "the window"} to ${next.to || "today"}.`
          : `${
              property || "Search Console"
            } returned no rows for this page in the last 28 days. That is an answer, not a failure — a page can be indexed and not yet shown.`
      );
    } catch (err) {
      fail(err, "Search Console could not be read for this page.");
    } finally {
      setBusy("");
    }
  }, [workspaceId, selected, onNotice, fail]);
  /* PANEL_SCAN */
  /**
   * Read the live page and let a model decide which candidates are real.
   *
   * The only paid button on this card. When the scan concluded there was something
   * to do, the proposal is read back off the server rather than drawn from this
   * response: what a person approves has to be the row that was saved, under the id
   * it was saved with, or Approve would post an id that does not exist.
   */
  const runScan = useCallback(async () => {
    if (!selected) return;
    const page = selected;
    setBusy("scan");
    setError("");
    try {
      const data = await post(workspaceId, "optimize-scan", { publicationId: page.id, days: 90 });
      setOpportunities(readOpportunities(data.opportunities));
      const proposal = readOptimizationProposal(data.proposal);
      const actionable = data.actionable === true;
      setScan({
        summary: proposal?.summary || "",
        actionable,
        note: text(data.note),
        modelCalls: Math.max(0, Math.round(Number(data.modelCalls) || 0)),
      });

      if (actionable) {
        const read = await post(workspaceId, "performance-read", {
          publicationId: page.id,
          days: 90,
        });
        setSummary(readPerformanceSummary(read.summary));
        const rows = readOptimizations(read.optimizations);
        setOptimizations(rows);
        // Counted off the rows just read rather than incremented: a re-scan replaces
        // this page's open proposal, so "+1" would be wrong the second time.
        const openNow = rows.filter(
          (row) => row.status === "proposed" || row.status === "verified"
        ).length;
        setPublications((list) =>
          list.map((row) => (row.id === page.id ? { ...row, openProposals: openNow } : row))
        );
      }

      onNotice?.(
        "info",
        actionable
          ? "The scan wrote a proposal. Read it, then approve it to start a verification run — nothing has touched the live page."
          : "The scan read the live page and found nothing worth changing, so no proposal was written."
      );
    } catch (err) {
      fail(err, "The scan could not be completed.");
    } finally {
      setBusy("");
    }
  }, [workspaceId, selected, onNotice, fail]);
  /* PANEL_VERIFY */
  /**
   * Approve — which means start a run, not change a page.
   *
   * The run id goes straight up to the HQ, which resumes it with the same code that
   * walks a first draft. Called twice, the server hands back the run it already
   * started, and the notice says so rather than pretending a second one was bought.
   */
  const verify = useCallback(
    async (row: OptimizationView) => {
      setBusy(`verify:${row.id}`);
      setError("");
      try {
        const data = await post(workspaceId, "optimize-verify", { optimizationId: row.id });
        const run = data.run && typeof data.run === "object" ? (data.run as Record<string, unknown>) : null;
        const runId = text(run?.id);
        if (!runId) {
          throw new Error("The verification run came back without an id, so there is nothing to open.");
        }
        setOptimizations((rows) =>
          rows.map((entry) => (entry.id === row.id ? { ...entry, verifyRunId: runId } : entry))
        );
        const stages = Math.max(0, Math.round(Number(data.stages) || 0));
        onNotice?.(
          "info",
          data.alreadyStarted === true
            ? "This proposal already had a verification run. Opening that one — nothing new was started."
            : `A ${
                stages || 23
              }-stage verification run was started. It researches and fact-checks the update; the live page is unchanged until you publish the draft.`
        );
        onVerifyRun(runId);
      } catch (err) {
        fail(err, "The verification run could not be started.");
      } finally {
        setBusy("");
      }
    },
    [workspaceId, onNotice, onVerifyRun, fail]
  );
  /* PANEL_STATUS */
  /**
   * Ask the server where the verification run got to.
   *
   * The status that comes back was derived from that run's own evidence-gate row.
   * This function sends no status and cannot: the only thing in the request is an id.
   */
  const refreshStatus = useCallback(
    async (row: OptimizationView) => {
      setBusy(`status:${row.id}`);
      setError("");
      try {
        const data = await post(workspaceId, "optimization-status", { optimizationId: row.id });
        const status = optimizationStatus(data.status);
        const reason = text(data.reason);
        setOptimizations((rows) =>
          rows.map((entry) =>
            entry.id === row.id ? { ...entry, status, note: reason || entry.note } : entry
          )
        );
        onNotice?.(
          status === "failed" ? "error" : "info",
          reason || `That proposal is ${STATUS_LABEL[status] || status}.`
        );
      } catch (err) {
        fail(err, "That proposal's state could not be read.");
      } finally {
        setBusy("");
      }
    },
    [workspaceId, onNotice, fail]
  );

  /** The one status a person sets. The row stays on file with its numbers. */
  const dismiss = useCallback(
    async (row: OptimizationView) => {
      setBusy(`dismiss:${row.id}`);
      setError("");
      try {
        await post(workspaceId, "optimization-dismiss", { optimizationId: row.id });
        setOptimizations((rows) =>
          rows.map((entry) =>
            entry.id === row.id ? { ...entry, status: "dismissed" as const } : entry
          )
        );
        setPublications((rows) =>
          rows.map((entry) =>
            entry.id === row.publicationId
              ? { ...entry, openProposals: Math.max(0, entry.openProposals - 1) }
              : entry
          )
        );
        onNotice?.("info", "Dismissed. It stays on file with what raised it, so a later scan can be read against it.");
      } catch (err) {
        fail(err, "That proposal could not be dismissed.");
      } finally {
        setBusy("");
      }
    },
    [workspaceId, onNotice, fail]
  );
  /* PANEL_EFFECTS */
  /** Fetched once per mount, on the first open. Refresh is a button after that. */
  const onOpen = useCallback(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    void loadList();
  }, [loadList]);

  /**
   * A publish happened. Reload only if this card was ever opened — a page that has
   * just gone live is worth showing, but not worth two queries nobody asked for.
   */
  useEffect(() => {
    if (!reloadKey || !askedRef.current) return;
    void loadList();
  }, [reloadKey, loadList]);

  const openProposals = optimizations.filter(
    (row) => row.status === "proposed" || row.status === "verified"
  ).length;
  const scoped = selected
    ? optimizations.filter((row) => row.publicationId === selected.id)
    : optimizations;

  const subtitle = publications.length
    ? `${publications.length} published page${publications.length === 1 ? "" : "s"} on file${
        openProposals ? ` · ${openProposals} proposal${openProposals === 1 ? "" : "s"} waiting on you` : ""
      }`
    : "What Search Console says the articles you published are being found for.";
  /* PANEL_RENDER */
  return (
    <AnalysisCard
      title="Published pages and what they are found for"
      icon={Gauge}
      subtitle={subtitle}
      right={
        openProposals > 0 ? (
          <span className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {openProposals} open
          </span>
        ) : undefined
      }
      onOpen={onOpen}
    >
      <div className="space-y-3">
        {error && (
          <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[10px] leading-snug text-destructive">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Nothing on this card changes a live page. Approving a proposal starts an article
            run; the update reaches your site when you publish the draft it produces.
          </p>
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={busy === "list"}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted/40 disabled:opacity-50"
          >
            {busy === "list" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </button>
        </div>
        {/* PANEL_BODY */}
        {publications.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {busy === "list"
              ? "Reading this workspace's published pages…"
              : "Nothing from this workspace has been published yet. Publish an article and it will appear here, with whatever Search Console starts reporting for it."}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <ul className="space-y-1.5">
              {publications.map((page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  active={selected?.id === page.id}
                  onSelect={() => void openPage(page)}
                />
              ))}
            </ul>
            <div className="min-w-0">
              {selected ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void sync()}
                      disabled={busy === "sync"}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted/40 disabled:opacity-50"
                    >
                      {busy === "sync" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Sync the last 28 days
                    </button>
                    <button
                      type="button"
                      onClick={() => void runScan()}
                      disabled={busy === "scan" || !summary || summary.days === 0}
                      title={
                        summary && summary.days > 0
                          ? undefined
                          : "Sync this page first. A scan with nothing measured behind it would be guesswork."
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      {busy === "scan" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ScanSearch className="h-3 w-3" />
                      )}
                      Scan for what it does not answer
                    </button>
                  </div>
                  {/* PANEL_NUMBERS */}
                  {busy === "read" && !summary && (
                    <p className="text-[10px] text-muted-foreground">
                      Reading the rows stored for this page…
                    </p>
                  )}

                  {summary && summary.days === 0 && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      No Search Console rows are stored for this page yet. Sync it — and if it
                      went live recently, expect a few days of nothing: a page has to be shown
                      before there is anything to report.
                    </p>
                  )}

                  {summary && summary.days > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        <Stat value={summary.impressions.toLocaleString()} label="impressions" />
                        <Stat value={summary.clicks.toLocaleString()} label="clicks" />
                        <Stat value={percent(summary.ctr)} label="click-through rate" />
                        <Stat value={summary.position.toFixed(1)} label="average position" />
                        <Stat value={summary.queries.length} label="queries stored" />
                        <Stat value={summary.days} label="days with data" />
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        {summary.from && summary.to
                          ? `Stored rows cover ${summary.from} to ${summary.to}. `
                          : ""}
                        Position and click-through rate are impression-weighted across the window,
                        the way Search Console averages them.
                        {incompleteFrom
                          ? ` Google is still counting from ${incompleteFrom} onwards, so the last days will move.`
                          : ""}
                      </p>
                      <QueryTable summary={summary} />
                    </>
                  )}
                  {/* PANEL_SCAN_RESULT */}
                  {opportunities.length > 0 && (
                    <Block title={`Candidate queries (${opportunities.length} measured)`}>
                      <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
                        A mechanical match: the query has impressions, and these words are not on
                        the page. Nothing here has read the page — that is the proposal below.
                      </p>
                      <CandidateList rows={opportunities} />
                    </Block>
                  )}

                  {scan && (
                    <Block title="What the scan concluded">
                      <p className="text-[11px] leading-relaxed text-foreground">
                        {scan.actionable
                          ? scan.summary ||
                            "The scan wrote a proposal for this page. It is in the list below."
                          : "The scan read the live page and concluded there was nothing worth changing, so no proposal was saved."}
                      </p>
                      {scan.note && (
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                          {scan.note}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {scan.modelCalls} model call{scan.modelCalls === 1 ? "" : "s"} on this scan.
                      </p>
                    </Block>
                  )}
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Pick a page to see what it is being found for, sync the last four weeks from
                  Search Console, or scan it for queries it does not answer.
                </p>
              )}
            </div>
          </div>
        )}
        {/* PANEL_PROPOSALS */}
        {scoped.length > 0 && (
          <Block
            title={
              selected
                ? `Proposals for this page (${scoped.length})`
                : `Proposals waiting on you (${scoped.length})`
            }
          >
            <ul className="space-y-2">
              {scoped.map((row) => (
                <ProposalCard
                  key={row.id}
                  row={row}
                  busy={busy}
                  onApprove={() => void verify(row)}
                  onStatus={() => void refreshStatus(row)}
                  onDismiss={() => void dismiss(row)}
                />
              ))}
            </ul>
          </Block>
        )}

        {selected && scoped.length === 0 && summary && summary.days > 0 && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            No proposal has been raised against this page. A scan writes one only when it found
            something a person could approve.
          </p>
        )}
      </div>
    </AnalysisCard>
  );
}

