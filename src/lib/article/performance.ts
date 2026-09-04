/**
 * WHAT A LIVE PAGE IS FOUND FOR, AND WHAT IT DOES NOT ANSWER
 *
 * Search Console rows arrive as one line per query per day. This file turns them
 * into the two things the optimisation loop needs and nothing else:
 *
 *   `summarizePerformance` — the window totalled up, per query. Per-row `ctr` and
 *   `position` are stored exactly as Google reported them; the totals here are
 *   impression-weighted, which is how Search Console aggregates them itself. Any
 *   other weighting makes a page look better or worse than the console does, and
 *   then nobody believes the screen.
 *
 *   `rankOpportunities` — queries the page earns impressions for while having no
 *   heading about them. This is deliberately a *candidate* list with a stated
 *   reason, not a verdict: a heading is not the only way a page can answer
 *   something, so a model reads the page and decides, and the UI has to keep the
 *   two apart. A candidate is "worth looking at", never "the page is missing this".
 *
 * Nothing here proposes a change to a page. `readOptimizationProposal` guards what
 * the model came back with so the browser can render a proposal a person approves.
 *
 * Client-safe: no imports.
 */

// ---------------------------------------------------------------------------
// COERCIONS — the same narrow set as artifacts.ts, kept local so this file has
// no imports and can be read by a client component.
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown, limit = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter(Boolean).slice(0, limit);
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function rows(value: unknown, limit = 200): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .slice(0, limit);
}

/** `YYYY-MM-DD` only. A date this app cannot compare is not a date it will store. */
function isoDate(value: unknown): string {
  const text = str(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

// ---------------------------------------------------------------------------
// THE STORED ROW
// ---------------------------------------------------------------------------

/** One query, one page, one day — the grain Search Console reports and we keep. */
export interface PerformanceRow {
  page: string;
  query: string;
  /** `YYYY-MM-DD`, Pacific Time, because that is the day Google counted it under. */
  date: string;
  impressions: number;
  clicks: number;
  /** 0..1, as reported. */
  ctr: number;
  position: number;
}

/**
 * Search Console rows into storable rows.
 *
 * `keys` is positional — `dimensions: ["query", "date"]` means `keys[0]` is the
 * query and `keys[1]` the day, and getting that backwards would store dates as
 * queries without erroring, so the order is named here once and asserted in the
 * tests rather than trusted at each call site.
 */
export function toPerformanceRows(
  page: string,
  apiRows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>
): PerformanceRow[] {
  const out: PerformanceRow[] = [];
  for (const row of apiRows || []) {
    const query = str(row?.keys?.[0]).toLowerCase();
    const date = isoDate(row?.keys?.[1]);
    if (!query || !date) continue;
    out.push({
      page,
      query: query.slice(0, 300),
      date,
      impressions: Math.max(0, Math.round(finite(row.impressions))),
      clicks: Math.max(0, Math.round(finite(row.clicks))),
      ctr: Math.min(1, Math.max(0, finite(row.ctr))),
      position: Math.max(0, finite(row.position)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE WINDOW, TOTALLED
// ---------------------------------------------------------------------------

/** One query across the whole window. Every figure here is computed, not reported. */
export interface QueryTotals {
  query: string;
  impressions: number;
  clicks: number;
  /** clicks ÷ impressions for the window, 0..1. */
  ctr: number;
  /** Impression-weighted mean position — how Search Console averages it too. */
  position: number;
  /** Days in the window it appeared on at all. A one-day spike is not a trend. */
  days: number;
  firstSeen: string;
  lastSeen: string;
}

export interface PerformanceSummary {
  page: string;
  /** The first and last day that actually has rows, not the window asked for. */
  from: string;
  to: string;
  days: number;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  /** Highest impressions first: the queries a person should read top-down. */
  queries: QueryTotals[];
}

const EMPTY_SUMMARY: Omit<PerformanceSummary, "page"> = {
  from: "",
  to: "",
  days: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  position: 0,
  queries: [],
};

/**
 * The rows for one page, totalled per query and overall.
 *
 * Position is weighted by impressions rather than averaged flat: a query that got
 * 400 impressions at position 8 and 2 at position 60 is a position-8 query, and a
 * flat mean would call it 34 and invent a problem that is not there.
 */
export function summarizePerformance(input: PerformanceRow[], page = ""): PerformanceSummary {
  const rowsIn = (input || []).filter((row) => row && row.query && row.date);
  if (rowsIn.length === 0) return { page, ...EMPTY_SUMMARY };

  const byQuery = new Map<
    string,
    { impressions: number; clicks: number; weighted: number; days: Set<string> }
  >();
  const allDays = new Set<string>();
  let impressions = 0;
  let clicks = 0;
  let weighted = 0;

  for (const row of rowsIn) {
    impressions += row.impressions;
    clicks += row.clicks;
    weighted += row.position * row.impressions;
    allDays.add(row.date);

    const found =
      byQuery.get(row.query) ?? { impressions: 0, clicks: 0, weighted: 0, days: new Set<string>() };
    found.impressions += row.impressions;
    found.clicks += row.clicks;
    found.weighted += row.position * row.impressions;
    found.days.add(row.date);
    byQuery.set(row.query, found);
  }

  const days = Array.from(allDays).sort();
  const queries: QueryTotals[] = Array.from(byQuery.entries())
    .map(([query, totals]) => {
      const seen = Array.from(totals.days).sort();
      return {
        query,
        impressions: totals.impressions,
        clicks: totals.clicks,
        ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
        position: totals.impressions > 0 ? totals.weighted / totals.impressions : 0,
        days: seen.length,
        firstSeen: seen[0] || "",
        lastSeen: seen[seen.length - 1] || "",
      };
    })
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);

  return {
    page: page || rowsIn[0].page || "",
    from: days[0] || "",
    to: days[days.length - 1] || "",
    days: days.length,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weighted / impressions : 0,
    queries,
  };
}

// ---------------------------------------------------------------------------
// CANDIDATES, NOT VERDICTS
// ---------------------------------------------------------------------------

/**
 * Words that carry no topic. Kept short on purpose: a long stopword list starts
 * removing words that matter ("how" and "why" are the whole point of a question,
 * so they stay), and every word dropped here is a word this file will not notice
 * is missing from the page.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "that", "this",
  "from", "have", "has", "had", "was", "were", "will", "can", "its", "it's", "into",
  "than", "then", "they", "them", "their", "there", "here", "about", "any", "all",
  "our", "out", "get", "got", "does", "did", "doing", "done", "very", "just",
  "more", "most", "some", "such", "only", "own", "same", "too", "also", "been",
  "being", "over", "under", "again", "once", "each", "few", "other", "off",
]);

/** Lowercased words worth matching on: no punctuation, no stopwords, 3+ letters. */
export function contentTokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Is this word on the page at all?
 *
 * A bare plural counts as the singular and back again, because "filters" and
 * "filter" are the same subject and calling one of them missing would propose a
 * section the page already has. Nothing more clever than that: real stemming
 * would start matching "cooling" to "cool", and those are different questions.
 */
function hasTerm(present: Set<string>, token: string): boolean {
  if (present.has(token)) return true;
  if (present.has(`${token}s`)) return true;
  return token.endsWith("s") && token.length > 3 && present.has(token.slice(0, -1));
}

/** Why a query is on the list. The UI shows this wording; the model is given it too. */
export type OpportunityKind = "absent" | "unheaded" | "underperforming";

export interface QueryOpportunity {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  days: number;
  kind: OpportunityKind;
  /** The words of the query the page has nothing about. Empty for underperforming. */
  missingTerms: string[];
  /** One sentence saying what was measured — never "the page is missing this". */
  reason: string;
  /** Ordering only. Not shown as a score, because it is not one. */
  weight: number;
}

/** The thresholds, named so a caller can loosen them and the tests can pin them. */
export interface OpportunityOptions {
  /** Below this, one person searched once and the page happened to appear. */
  minImpressions?: number;
  /** A query already in the top few with clicks is being answered. */
  minPosition?: number;
  limit?: number;
}

/**
 * Queries worth a second look, with what was measured about each.
 *
 * The rule is deliberately mechanical — the query has impressions, and words in it
 * are not on the page — because a mechanical rule can be explained in one sentence
 * to the person approving the change. Whether the page *answers* the question is a
 * judgement, and it is made later, by a model that has read the page, against this
 * list. Nothing in here is evidence that the page is wrong.
 */
export function rankOpportunities(
  summary: PerformanceSummary,
  page: { title?: string; headings?: string[]; body?: string },
  options: OpportunityOptions = {}
): QueryOpportunity[] {
  const minImpressions = Math.max(1, Math.round(options.minImpressions ?? 15));
  const minPosition = options.minPosition ?? 8;
  const limit = Math.min(Math.max(Math.round(options.limit ?? 12), 1), 50);

  const headingWords = new Set(
    contentTokens([page.title || "", ...(page.headings || [])].join(" "))
  );
  const bodyWords = new Set(contentTokens(page.body || ""));
  // The title and headings are part of the page's text, so a word in a heading is
  // on the page even when the body string handed in was only the prose.
  for (const word of Array.from(headingWords)) bodyWords.add(word);

  const found: QueryOpportunity[] = [];
  for (const totals of summary.queries) {
    if (totals.impressions < minImpressions) continue;
    const tokens = contentTokens(totals.query);
    if (tokens.length === 0) continue;

    const missingFromBody = tokens.filter((token) => !hasTerm(bodyWords, token));
    const missingFromHeadings = tokens.filter((token) => !hasTerm(headingWords, token));

    let kind: OpportunityKind;
    let missingTerms: string[];
    if (missingFromBody.length > 0) {
      kind = "absent";
      missingTerms = missingFromBody;
    } else if (missingFromHeadings.length > 0) {
      kind = "unheaded";
      missingTerms = missingFromHeadings;
    } else if (totals.position > minPosition) {
      kind = "underperforming";
      missingTerms = [];
    } else {
      // On the page, in a heading, and ranking. There is nothing to propose.
      continue;
    }

    const words = missingTerms.map((term) => `“${term}”`).join(", ");
    const reason =
      kind === "absent"
        ? `${totals.impressions} impressions over ${totals.days} day${totals.days === 1 ? "" : "s"}, and ${words} appears nowhere on the page.`
        : kind === "unheaded"
          ? `${totals.impressions} impressions, and ${words} is in the text but not in any heading.`
          : `${totals.impressions} impressions at average position ${totals.position.toFixed(1)} for ${totals.clicks} click${totals.clicks === 1 ? "" : "s"} — covered, and still not chosen.`;

    const kindFactor = kind === "absent" ? 1 : kind === "unheaded" ? 0.6 : 0.3;
    const striking = totals.position >= 4 && totals.position <= 25 ? 1.25 : 1;

    found.push({
      query: totals.query,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.ctr,
      position: totals.position,
      days: totals.days,
      kind,
      missingTerms,
      reason,
      weight: Math.round(totals.impressions * kindFactor * striking * 10) / 10,
    });
  }
  return found.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/**
 * Stored triggers, read back.
 *
 * A proposal keeps the numbers that raised it, so a card opened a month later says
 * what it was reacting to rather than what the page is doing now. That means these
 * rows are read back from the database, and read back means guarded.
 */
export function readOpportunities(value: unknown): QueryOpportunity[] {
  const kinds: OpportunityKind[] = ["absent", "unheaded", "underperforming"];
  return rows(value, 50)
    .map((row) => {
      const query = str(row.query).toLowerCase();
      if (!query) return null;
      const kind = kinds.includes(row.kind as OpportunityKind)
        ? (row.kind as OpportunityKind)
        : "absent";
      return {
        query,
        impressions: Math.max(0, Math.round(finite(row.impressions))),
        clicks: Math.max(0, Math.round(finite(row.clicks))),
        ctr: Math.min(1, Math.max(0, finite(row.ctr))),
        position: Math.max(0, finite(row.position)),
        days: Math.max(0, Math.round(finite(row.days))),
        kind,
        missingTerms: strList(row.missingTerms, 12),
        reason: str(row.reason),
        weight: finite(row.weight),
      } satisfies QueryOpportunity;
    })
    .filter((row): row is QueryOpportunity => !!row);
}

// ---------------------------------------------------------------------------
// THE PROPOSAL
// ---------------------------------------------------------------------------

/** A section the page does not have, and what it would have to cover. */
export interface ProposedSection {
  heading: string;
  /** Which of the trigger queries this section answers. */
  queries: string[];
  /** The points it must make. An outline, deliberately — not the prose. */
  covers: string[];
  /** The existing heading it belongs after, or "" for the end of the article. */
  placeAfter: string;
  /**
   * Facts it needs that nobody has established yet. Every one of these goes
   * through research and the evidence gate before a word of it is written, which
   * is the whole reason the field exists.
   */
  needsResearch: string[];
}

/** An existing passage that should change, named by the heading above it. */
export interface ProposedEdit {
  target: string;
  change: string;
  queries: string[];
}

export interface OptimizationProposal {
  /** One sentence for the card. Required: a proposal that cannot be summarised is not one. */
  summary: string;
  /** Queries the model found the page already answers, and where. Not a change. */
  answered: Array<{ query: string; where: string }>;
  sections: ProposedSection[];
  edits: ProposedEdit[];
  /** Queries it will not act on, in its own words. A refusal is a result. */
  declined: Array<{ query: string; reason: string }>;
}

/** The five states a proposal can be in. Nothing else is a status. */
export const OPTIMIZATION_STATUSES = [
  "proposed",
  "verified",
  "applied",
  "dismissed",
  "failed",
] as const;

export type OptimizationStatus = (typeof OPTIMIZATION_STATUSES)[number];

/**
 * A status this app defined, or `proposed`.
 *
 * Used on both sides: the store coerces what came out of the column, and the
 * browser coerces what came over HTTP. A row that claimed some other word would
 * render as a state with no meaning, and "verified" is the one word on this screen
 * that has to be earned.
 */
export function optimizationStatus(value: unknown): OptimizationStatus {
  const text = str(value);
  return (OPTIMIZATION_STATUSES as readonly string[]).includes(text)
    ? (text as OptimizationStatus)
    : "proposed";
}

/**
 * The model's proposal, admitted or refused.
 *
 * A section with no heading and no coverage is dropped rather than repaired: an
 * empty proposal rendered as a card is worse than a card that says the scan found
 * nothing, because somebody would click Approve on it.
 */
export function readOptimizationProposal(value: unknown): OptimizationProposal | null {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
  if (!raw) return null;
  const summary = str(raw.summary);
  if (!summary) return null;

  const sections = rows(raw.sections, 8)
    .map((row) => {
      const heading = str(row.heading);
      const covers = strList(row.covers, 10);
      if (!heading || covers.length === 0) return null;
      return {
        heading,
        queries: strList(row.queries, 12).map((query) => query.toLowerCase()),
        covers,
        placeAfter: str(row.placeAfter),
        needsResearch: strList(row.needsResearch, 10),
      } satisfies ProposedSection;
    })
    .filter((row): row is ProposedSection => !!row);

  const edits = rows(raw.edits, 12)
    .map((row) => {
      const target = str(row.target);
      const change = str(row.change);
      if (!target || !change) return null;
      return {
        target,
        change,
        queries: strList(row.queries, 12).map((query) => query.toLowerCase()),
      } satisfies ProposedEdit;
    })
    .filter((row): row is ProposedEdit => !!row);

  const answered = rows(raw.answered, 20)
    .map((row) => ({ query: str(row.query).toLowerCase(), where: str(row.where) }))
    .filter((row) => !!row.query);

  const declined = rows(raw.declined, 20)
    .map((row) => ({ query: str(row.query).toLowerCase(), reason: str(row.reason) }))
    .filter((row) => !!row.query && !!row.reason);

  return { summary, answered, sections, edits, declined };
}

// ---------------------------------------------------------------------------
// WHAT CROSSES HTTP
//
// The two rows the performance panel draws. They are declared here rather than
// beside their queries because the browser reads them, and `performanceStore.ts`
// imports Prisma — so the shapes live in the file both sides can see, and the
// store returns exactly these.
//
// Guarded on the way in for the same reason the artifacts are: a row that crossed
// HTTP is no more trustworthy than one that came out of a model, and the panel
// formats these numbers rather than checking them.
// ---------------------------------------------------------------------------

/** A published page as the panel lists it. Every count comes from a query, not a cache. */
export interface PublicationView {
  id: string;
  url: string;
  title: string;
  keyword: string;
  status: string;
  providerKey: string;
  runId: string;
  publishedAt: string;
  /** The latest day this page has stored Search Console data for, or "". */
  lastDataDay: string;
  /** Proposals still waiting on a person: proposed or verified, not applied. */
  openProposals: number;
}

/** A proposal as the panel reads it. `triggers` and `proposal` are guarded either way. */
export interface OptimizationView {
  id: string;
  publicationId: string;
  page: string;
  title: string;
  status: OptimizationStatus;
  /** The numbers that raised it, kept as they were measured. */
  triggers: QueryOpportunity[];
  proposal: OptimizationProposal | null;
  /** The article run carrying research and the evidence gate for this proposal. */
  verifyRunId: string;
  note: string;
  raisedAt: string;
  verifiedAt: string;
  appliedAt: string;
}

export function readPublications(value: unknown): PublicationView[] {
  return rows(value, 200)
    .map((row) => ({
      id: str(row.id),
      url: str(row.url),
      title: str(row.title),
      keyword: str(row.keyword),
      status: str(row.status),
      providerKey: str(row.providerKey),
      runId: str(row.runId),
      publishedAt: str(row.publishedAt),
      lastDataDay: isoDate(row.lastDataDay),
      openProposals: Math.max(0, Math.round(finite(row.openProposals))),
    }))
    .filter((row) => !!row.id && !!row.url);
}

export function readOptimizations(value: unknown): OptimizationView[] {
  return rows(value, 100)
    .map((row) => ({
      id: str(row.id),
      publicationId: str(row.publicationId),
      page: str(row.page),
      title: str(row.title),
      status: optimizationStatus(row.status),
      triggers: readOpportunities(row.triggers),
      proposal: readOptimizationProposal(row.proposal),
      verifyRunId: str(row.verifyRunId),
      note: str(row.note),
      raisedAt: str(row.raisedAt),
      verifiedAt: str(row.verifiedAt),
      appliedAt: str(row.appliedAt),
    }))
    .filter((row) => !!row.id);
}

/**
 * A summary off the wire.
 *
 * Deliberately not recomputed: the server totalled it with `summarizePerformance`
 * above, and a second arithmetic here would either agree or mean the rows were
 * never sent. What this does is make the shape safe to format — a `position` that
 * arrived as null must not reach `.toFixed`.
 */
export function readPerformanceSummary(value: unknown): PerformanceSummary {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!raw) return { page: "", ...EMPTY_SUMMARY };

  const queries: QueryTotals[] = rows(raw.queries, 200)
    .map((row) => {
      const query = str(row.query).toLowerCase();
      if (!query) return null;
      return {
        query,
        impressions: Math.max(0, Math.round(finite(row.impressions))),
        clicks: Math.max(0, Math.round(finite(row.clicks))),
        ctr: Math.min(1, Math.max(0, finite(row.ctr))),
        position: Math.max(0, finite(row.position)),
        days: Math.max(0, Math.round(finite(row.days))),
        firstSeen: isoDate(row.firstSeen),
        lastSeen: isoDate(row.lastSeen),
      } satisfies QueryTotals;
    })
    .filter((row): row is QueryTotals => !!row);

  return {
    page: str(raw.page),
    from: isoDate(raw.from),
    to: isoDate(raw.to),
    days: Math.max(0, Math.round(finite(raw.days))),
    impressions: Math.max(0, Math.round(finite(raw.impressions))),
    clicks: Math.max(0, Math.round(finite(raw.clicks))),
    ctr: Math.min(1, Math.max(0, finite(raw.ctr))),
    position: Math.max(0, finite(raw.position)),
    queries,
  };
}
