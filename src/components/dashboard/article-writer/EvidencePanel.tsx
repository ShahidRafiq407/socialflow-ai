"use client";

/**
 * THE EVIDENCE, AS A PERSON CAN CHECK IT
 *
 * Every factual sentence in a deep-mode article came from a claim that passed five
 * checks against a source that was fetched. This panel is where that stops being a
 * claim about the product and becomes something the reader of this screen can go
 * and confirm: the URL, the publisher, the date the page carries, the passage the
 * statement rests on, and — for the ones that did not pass — which of the five
 * checks failed and the gate's own sentence about it.
 *
 * Deliberate absences:
 *
 *   - The word "verified" is not used anywhere. A page was fetched and it said
 *     something, or it did not. "Verified" is a claim about truth that a fetch
 *     cannot support.
 *   - `status` is never read off the wire. The response goes back through
 *     `readEvidenceLedger`, which recomputes it from the five booleans, so a row
 *     written by an older build cannot show as allowed on a check it never passed.
 *   - Blocked claims are listed first. They are the ones that changed the article.
 *
 * The ledger is fetched when the card is opened, not on mount: it is two queries
 * for up to 120 sources and 200 claims, and it is read after a run rather than
 * during one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, ShieldAlert, ShieldCheck, TriangleAlert, X } from "lucide-react";
import type {
  EvidenceChecks,
  EvidenceClaimRecord,
  EvidenceLedger,
  ResearchSourceRecord,
} from "@/lib/article/artifacts";
import type { ArticleRunView } from "@/lib/article/types";
import { AnalysisCard, Block, OutLink, Stat, StageAbsence } from "./AnalysisShell";

export interface EvidencePanelProps {
  run: ArticleRunView;
  /** From `useArticleRun`. The one seam that talks to the route. */
  load: (runId: string) => Promise<EvidenceLedger>;
}

/** The five checks, in the order the gate applies them. */
const CHECKS: { key: keyof EvidenceChecks; label: string }[] = [
  { key: "sourceExists", label: "source named" },
  { key: "sourceReachable", label: "page answered" },
  { key: "sourceSupports", label: "page says this" },
  { key: "current", label: "current enough" },
  { key: "trustworthy", label: "source stands up" },
];

/** What kind of statement it is, in the user's words rather than the schema's. */
const KIND_LABEL: Record<string, string> = {
  statistic: "Statistic",
  fact: "Fact",
  quote: "Quote",
  recommendation: "Recommendation",
  business_fact: "Claim about your business",
};

/** How much the source can be leaned on, as the research stage classified it. */
const SOURCE_TYPE_LABEL: Record<string, string> = {
  primary: "Primary source",
  official: "Official",
  journalism: "Journalism",
  vendor: "Vendor",
  forum: "Forum or community",
  unknown: "Unclassified",
};

function dateOnly(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

/** One claim, its five checks, and the source it was checked against. */
function ClaimRow({
  claim,
  source,
}: {
  claim: EvidenceClaimRecord;
  source?: ResearchSourceRecord;
}) {
  const allowed = claim.status === "allowed";
  return (
    <li className="rounded-lg border border-border bg-background p-2">
      <div className="flex gap-1.5">
        {allowed ? (
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-foreground">{claim.claim}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {KIND_LABEL[claim.kind] || claim.kind}
            {claim.usedIn ? ` · used in “${claim.usedIn}”` : ""}
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {CHECKS.map(({ key, label }) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
              claim.checks[key]
                ? "border-primary/30 bg-primary/5 text-foreground"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            }`}
          >
            {claim.checks[key] ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
            {label}
          </span>
        ))}
      </div>
      {claim.reason && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{claim.reason}</p>
      )}
      {source && (
        <p className="mt-1 text-[10px] leading-snug">
          <OutLink href={source.url}>{source.title || source.publisher || source.url}</OutLink>
          {source.publisher && <span className="text-muted-foreground"> — {source.publisher}</span>}
          {dateOnly(source.publishedAt) && (
            <span className="text-muted-foreground"> · {dateOnly(source.publishedAt)}</span>
          )}
        </p>
      )}
    </li>
  );
}

/** One source: where it is, who published it, when it was read, and what it said. */
function SourceRow({ source }: { source: ResearchSourceRecord }) {
  return (
    <li className="rounded-lg border border-border bg-background p-2">
      <p className="text-[11px] leading-snug">
        <OutLink href={source.url}>{source.title || source.url}</OutLink>
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
        <span>{SOURCE_TYPE_LABEL[source.sourceType] || source.sourceType}</span>
        {source.publisher && <span>· {source.publisher}</span>}
        {dateOnly(source.publishedAt) && <span>· dated {dateOnly(source.publishedAt)}</span>}
        {dateOnly(source.fetchedAt) && <span>· read {dateOnly(source.fetchedAt)}</span>}
      </p>
      {!source.reachable && (
        <p className="mt-1 flex gap-1 text-[10px] leading-snug text-destructive">
          <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          {source.fetchError || "This page did not answer when the run tried to read it."}
        </p>
      )}
      {/* The passage, quoted. A claim's whole defence is that somebody can read
          the sentence it came from without leaving this screen. */}
      {source.excerpt && (
        <p className="mt-1 border-l-2 border-border pl-2 text-[10px] italic leading-snug text-muted-foreground">
          “{source.excerpt}”
        </p>
      )}
    </li>
  );
}

const CLAIM_LIMIT = 60;
const SOURCE_LIMIT = 40;

export default function EvidencePanel({ run, load }: EvidencePanelProps) {
  const [ledger, setLedger] = useState<EvidenceLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The run the held ledger belongs to, so a second run cannot show the first's. */
  const askedFor = useRef("");

  useEffect(() => {
    setLedger(null);
    setError(null);
    askedFor.current = "";
  }, [run.id]);

  const fetchLedger = useCallback(() => {
    if (askedFor.current === run.id) return;
    askedFor.current = run.id;
    setLoading(true);
    setError(null);
    void load(run.id)
      .then(setLedger)
      .catch((thrown: unknown) => {
        // Asked again next time it is opened: a request that failed is not a fact
        // about the run, and the server's own sentence is what gets shown.
        askedFor.current = "";
        setError(
          thrown instanceof Error && thrown.message.trim()
            ? thrown.message
            : "The evidence for this run could not be read."
        );
      })
      .finally(() => setLoading(false));
  }, [load, run.id]);

  const sourceById = new Map((ledger?.sources ?? []).map((source) => [source.id, source]));
  // Blocked first. They are the claims that changed the article — a statistic that
  // did not survive its checks is the reason a paragraph reads the way it does.
  const claims = [...(ledger?.claims ?? [])].sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "blocked" ? -1 : 1;
  });
  const usedInDraft = claims.filter((claim) => claim.usedIn).length;
  const reachable = (ledger?.sources ?? []).filter((source) => source.reachable).length;

  const counted = ledger
    ? [
        `${ledger.sources.length} source${ledger.sources.length === 1 ? "" : "s"} read`,
        `${ledger.claims.length} claim${ledger.claims.length === 1 ? "" : "s"} checked`,
        ledger.blocked ? `${ledger.blocked} kept out` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "Open to load the sources this run read and the claims it checked.";

  return (
    <AnalysisCard
      title="Evidence behind this article"
      icon={ShieldCheck}
      subtitle={counted}
      onOpen={fetchLedger}
      right={
        ledger && ledger.blocked > 0 ? (
          <span className="rounded-md border border-destructive/30 bg-destructive/5 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
            {ledger.blocked} blocked
          </span>
        ) : undefined
      }
    >
      {loading && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          Reading the sources and claims recorded for this run…
        </p>
      )}
      {error && !loading && (
        <p className="text-[11px] leading-snug text-destructive">{error}</p>
      )}

      {ledger && !loading && ledger.sources.length === 0 && ledger.claims.length === 0 && (
        <StageAbsence
          run={run}
          stage="research"
          unavailable="The quick pipeline does not research the topic, so this article cites nothing. It is written from your own site and the live results for the keyword, and the fact check panel is what it was held to. Deep mode fetches sources and checks every statistic against the page it came from."
          empty="Research ran and recorded no source it could fetch, so nothing in this article rests on an outside citation."
        />
      )}

      {ledger && !loading && (ledger.sources.length > 0 || ledger.claims.length > 0) && (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            <Stat value={ledger.sources.length} label="sources read" />
            <Stat value={reachable} label="pages that answered" />
            <Stat value={ledger.claims.length} label="claims checked" />
            <Stat value={ledger.allowed} label="cleared for use" />
            <Stat value={ledger.blocked} label="kept out of the article" />
            <Stat value={usedInDraft} label="used in the draft" />
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            A claim needs all five checks to be usable — there is no partial pass. The
            writer was handed the cleared ones and nothing else, so a blocked claim
            could not reach the page by sitting next to one that passed.
          </p>

          {claims.length > 0 && (
            <Block title="Claims and what each one was checked against">
              <ul className="space-y-1.5">
                {claims.slice(0, CLAIM_LIMIT).map((claim) => (
                  <ClaimRow
                    key={claim.id}
                    claim={claim}
                    source={claim.sourceId ? sourceById.get(claim.sourceId) : undefined}
                  />
                ))}
              </ul>
              {claims.length > CLAIM_LIMIT && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  +{claims.length - CLAIM_LIMIT} more checked and recorded with the run.
                </p>
              )}
            </Block>
          )}

          {ledger.sources.length > 0 && (
            <Block title="Every source this run read">
              <ul className="space-y-1.5">
                {ledger.sources.slice(0, SOURCE_LIMIT).map((source) => (
                  <SourceRow key={source.id} source={source} />
                ))}
              </ul>
              {ledger.sources.length > SOURCE_LIMIT && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  +{ledger.sources.length - SOURCE_LIMIT} more read and recorded with the run.
                </p>
              )}
            </Block>
          )}
        </>
      )}
    </AnalysisCard>
  );
}
