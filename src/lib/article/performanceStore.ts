/**
 * WHAT HAPPENED AFTER PUBLISH
 *
 * Everything before this file is about producing an article. This one is about the
 * weeks afterwards: which URL went live, what Google actually showed it for, and
 * the proposals that came out of the gap between the two.
 *
 * The same three properties as the evidence store, for the same reasons:
 *
 *   1. A re-sync replaces the window it covers, never appends. Search Console
 *      revises recent days — that is what `dataState: "all"` and
 *      `first_incomplete_date` are about — so a second sync of the same fortnight
 *      has to overwrite it or the chart double-counts Tuesday.
 *   2. Nothing derived is stored. Totals, averages and opportunity ranking are
 *      computed in `performance.ts`, which the browser can read too, so a number on
 *      the screen cannot disagree with the row it came from.
 *   3. Reads are scoped by workspace, in the query. A page URL arrives in a request
 *      body; ownership is part of the `where`, not a check made afterwards.
 *
 * Nothing here writes to a live page. An `OptimizationRun` is a row a person reads.
 *
 * Server-only — it imports Prisma.
 */

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import {
  OPTIMIZATION_STATUSES,
  optimizationStatus,
  readOpportunities,
  readOptimizationProposal,
  type OptimizationProposal,
  type OptimizationStatus,
  type OptimizationView,
  type PerformanceRow,
  type PublicationView,
  type QueryOpportunity,
} from "./performance";

/**
 * A `YYYY-MM-DD` day into the `@db.Date` column, and back.
 *
 * UTC on both sides, deliberately. The column holds a date with no time and no
 * zone; parsing "2026-09-01" as local time would store 2026-08-31 for anyone east
 * of Greenwich and shift every chart by a day for half the world.
 */
function dayToDate(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const at = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

function dateToDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Postgres takes large inserts, Neon's pooler is happier in bites. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// PUBLICATIONS
// ---------------------------------------------------------------------------

export interface PublicationInput {
  runId?: string | null;
  targetId?: string | null;
  providerKey?: string | null;
  /** Already normalised by the caller — this is the join key to Search Console. */
  url: string;
  remoteId?: string | null;
  title: string;
  keyword?: string | null;
  status?: string | null;
}

/**
 * One row per live URL.
 *
 * Keyed on the URL rather than the run, because the URL is what Search Console
 * reports and republishing the same page from a second run is an update to one
 * live thing, not two. The run id is overwritten on purpose: the newest run that
 * produced this page is the one whose ledger explains what is on it now.
 */
export async function recordPublication(
  workspaceId: string,
  input: PublicationInput
): Promise<{ id: string; url: string } | null> {
  const url = (input.url || "").trim();
  const title = (input.title || "").trim();
  if (!workspaceId || !url) return null;

  // A run id arrives from a request body like any other. Kept only when this
  // workspace really owns that run: the foreign key would accept somebody else's
  // and the row would then point a ledger link at a run this workspace cannot open.
  let runId: string | null = null;
  if (input.runId) {
    const owned = await prisma.articleRun.findFirst({
      where: { id: input.runId, workspaceId },
      select: { id: true },
    });
    runId = owned?.id ?? null;
  }

  const shared = {
    runId,
    targetId: input.targetId || null,
    providerKey: input.providerKey || null,
    remoteId: input.remoteId || null,
    title: title.slice(0, 500) || url,
    keyword: input.keyword?.trim() || null,
    status: (input.status || "publish").trim() || "publish",
  };

  const row = await prisma.publishResult.upsert({
    where: { workspaceId_url: { workspaceId, url: url.slice(0, 512) } },
    create: { workspaceId, url: url.slice(0, 512), ...shared },
    update: shared,
    select: { id: true, url: true },
  });
  return row;
}

/**
 * This workspace's live pages, newest first.
 *
 * The two aggregates are grouped queries rather than a column on the row: a
 * counter kept on `PublishResult` would be the third place the truth lives and the
 * first place it goes stale.
 */
export async function listPublications(
  workspaceId: string,
  limit = 50
): Promise<PublicationView[]> {
  if (!workspaceId) return [];
  const take = Math.min(Math.max(Math.round(limit) || 50, 1), 200);

  const rows = await prisma.publishResult.findMany({
    where: { workspaceId },
    orderBy: { publishedAt: "desc" },
    take,
  });
  if (rows.length === 0) return [];

  const urls = rows.map((row) => row.url);
  const [days, open] = await Promise.all([
    prisma.performanceData.groupBy({
      by: ["page"],
      where: { workspaceId, page: { in: urls } },
      _max: { date: true },
    }),
    prisma.optimizationRun.groupBy({
      by: ["publicationId"],
      where: { workspaceId, status: { in: ["proposed", "verified"] } },
      _count: { _all: true },
    }),
  ]);

  const lastDay = new Map<string, string>();
  for (const row of days) {
    if (row._max.date) lastDay.set(row.page, dateToDay(row._max.date));
  }
  const openCount = new Map<string, number>();
  for (const row of open) openCount.set(row.publicationId, row._count._all);

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    keyword: row.keyword ?? "",
    status: row.status,
    providerKey: row.providerKey ?? "",
    runId: row.runId ?? "",
    publishedAt: row.publishedAt.toISOString(),
    lastDataDay: lastDay.get(row.url) ?? "",
    openProposals: openCount.get(row.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// PERFORMANCE ROWS
// ---------------------------------------------------------------------------

/**
 * The rows for one page and one window, replacing whatever was there.
 *
 * The delete is bounded by the window rather than the page, so syncing the last
 * fortnight cannot silently erase the quarter before it. Inside the window it is a
 * true replace: Google revises the recent days, and its revision is the right
 * answer.
 */
export async function savePerformanceRows(
  workspaceId: string,
  input: { page: string; startDate: string; endDate: string; rows: PerformanceRow[] }
): Promise<{ written: number; from: string; to: string }> {
  const page = (input.page || "").trim().slice(0, 512);
  const from = dayToDate(input.startDate);
  const to = dayToDate(input.endDate);
  if (!workspaceId || !page || !from || !to) return { written: 0, from: "", to: "" };

  await prisma.performanceData.deleteMany({
    where: { workspaceId, page, date: { gte: from, lte: to } },
  });

  const data = (input.rows || [])
    .map((row) => {
      const date = dayToDate(row.date);
      if (!date || date < from || date > to) return null;
      return {
        workspaceId,
        page,
        query: row.query.slice(0, 300),
        date,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        position: row.position,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  for (const batch of chunk(data, 1000)) {
    await prisma.performanceData.createMany({ data: batch, skipDuplicates: true });
  }

  return { written: data.length, from: dateToDay(from), to: dateToDay(to) };
}

/**
 * The stored rows for one page, newest window first.
 *
 * Returned as `PerformanceRow[]` rather than totals: `summarizePerformance` does
 * the arithmetic, in a file the browser also imports, so the panel and the agent
 * are reading the same numbers from the same code.
 */
export async function readPerformance(
  workspaceId: string,
  page: string,
  days = 90
): Promise<PerformanceRow[]> {
  const target = (page || "").trim().slice(0, 512);
  if (!workspaceId || !target) return [];

  const span = Math.min(Math.max(Math.round(days) || 90, 1), 480);
  const since = new Date(Date.now() - span * 86_400_000);
  const from = dayToDate(since.toISOString().slice(0, 10));

  const rows = await prisma.performanceData.findMany({
    where: { workspaceId, page: target, ...(from ? { date: { gte: from } } : {}) },
    orderBy: [{ date: "asc" }, { impressions: "desc" }],
    take: 20_000,
  });

  return rows.map((row) => ({
    page: row.page,
    query: row.query,
    date: dateToDay(row.date),
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    position: row.position,
  }));
}

/** The page a publication points at, only if this workspace owns it. */
export async function findPublication(
  workspaceId: string,
  publicationId: string
): Promise<{
  id: string;
  url: string;
  title: string;
  keyword: string;
  runId: string;
  targetId: string;
} | null> {
  const id = (publicationId || "").trim();
  if (!workspaceId || !id) return null;
  const row = await prisma.publishResult.findFirst({
    where: { id, workspaceId },
    select: { id: true, url: true, title: true, keyword: true, runId: true, targetId: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    keyword: row.keyword ?? "",
    runId: row.runId ?? "",
    // Carried so an update run publishes back to the site it came from rather than
    // to whichever target happens to be first in the list.
    targetId: row.targetId ?? "",
  };
}

// ---------------------------------------------------------------------------
// PROPOSALS
// ---------------------------------------------------------------------------

/**
 * A JSON column takes JSON, and this is the round trip that proves it.
 *
 * Not a cast: `undefined` fields and anything else Postgres would refuse are
 * dropped here rather than at the driver, where the error names a column and not
 * the field that caused it. Typed as Prisma's own `InputJsonValue` so a column
 * that is not a JSON column still fails to compile.
 */
function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/**
 * A scan's result, as a row somebody has to approve.
 *
 * Re-scanning replaces an open `proposed` row for the same page — nothing has been
 * spent on it beyond the scan, and two proposals reacting to the same fortnight
 * would both be true and only one of them current. A `verified` row is left alone:
 * it has an article run behind it with research and an evidence gate, and throwing
 * that away because a nightly sync ran again would be throwing away real work.
 */
export async function saveOptimization(
  workspaceId: string,
  input: {
    publicationId: string;
    triggers: QueryOpportunity[];
    proposal?: OptimizationProposal | null;
    status?: string;
    note?: string;
  }
): Promise<string | null> {
  const publication = await findPublication(workspaceId, input.publicationId);
  if (!publication) return null;

  await prisma.optimizationRun.deleteMany({
    where: { workspaceId, publicationId: publication.id, status: "proposed" },
  });

  const row = await prisma.optimizationRun.create({
    data: {
      workspaceId,
      publicationId: publication.id,
      // Coerced rather than trimmed: a caller passing a word that is not one of
      // the five would otherwise write a state the panel cannot draw and
      // `updateOptimization` would refuse to move.
      status: optimizationStatus(input.status),
      triggers: asJson(input.triggers || []),
      proposal: input.proposal ? asJson(input.proposal) : undefined,
      note: input.note?.trim() || null,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * The proposals for this workspace, or for one page, newest first.
 *
 * `include` reaches for the publication so the card can name the page without a
 * second round trip, and the workspace is in the `where` of the outer query, which
 * is what makes the join safe to follow.
 */
export async function listOptimizations(
  workspaceId: string,
  options: { publicationId?: string; statuses?: string[]; limit?: number } = {}
): Promise<OptimizationView[]> {
  if (!workspaceId) return [];
  const take = Math.min(Math.max(Math.round(options.limit || 30), 1), 100);
  const publicationId = options.publicationId?.trim();

  const rows = await prisma.optimizationRun.findMany({
    where: {
      workspaceId,
      ...(publicationId ? { publicationId } : {}),
      ...(options.statuses?.length ? { status: { in: options.statuses } } : {}),
    },
    orderBy: { raisedAt: "desc" },
    take,
    include: { publication: { select: { url: true, title: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    publicationId: row.publicationId,
    page: row.publication?.url ?? "",
    title: row.publication?.title ?? "",
    // Coerced, not passed through: the column is a string, and a row written by
    // an older build must not reach the panel claiming a state it cannot draw.
    status: optimizationStatus(row.status),
    triggers: readOpportunities(row.triggers),
    proposal: readOptimizationProposal(row.proposal),
    verifyRunId: row.verifyRunId ?? "",
    note: row.note ?? "",
    raisedAt: row.raisedAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? "",
    appliedAt: row.appliedAt?.toISOString() ?? "",
  }));
}

/**
 * One proposal, only if this workspace owns it.
 *
 * The publication comes with it because every caller needs the page URL next, and
 * the workspace is in the `where` of the outer query, which is what makes following
 * that relation safe.
 */
export async function findOptimization(
  workspaceId: string,
  optimizationId: string
): Promise<{
  id: string;
  publicationId: string;
  status: OptimizationStatus;
  triggers: QueryOpportunity[];
  proposal: OptimizationProposal | null;
  verifyRunId: string;
  page: string;
  title: string;
  keyword: string;
  /** The publishing target the page came from, so an update goes back to it. */
  targetId: string;
} | null> {
  const id = (optimizationId || "").trim();
  if (!workspaceId || !id) return null;

  const row = await prisma.optimizationRun.findFirst({
    where: { id, workspaceId },
    include: { publication: { select: { url: true, title: true, keyword: true, targetId: true } } },
  });
  if (!row) return null;

  return {
    id: row.id,
    publicationId: row.publicationId,
    status: optimizationStatus(row.status),
    triggers: readOpportunities(row.triggers),
    proposal: readOptimizationProposal(row.proposal),
    verifyRunId: row.verifyRunId ?? "",
    page: row.publication?.url ?? "",
    title: row.publication?.title ?? "",
    keyword: row.publication?.keyword ?? "",
    targetId: row.publication?.targetId ?? "",
  };
}

/**
 * Proposals whose verification run has just been published, marked applied.
 *
 * This is the only place a proposal becomes `applied`, and it happens because a
 * person pressed Publish on the run that was verifying it — not because anything
 * here decided the page was ready. Nothing was inserted into the live page by this
 * app: the CMS published the draft the person was looking at.
 */
export async function applyOptimizationsForRun(
  workspaceId: string,
  verifyRunId: string
): Promise<number> {
  const runId = (verifyRunId || "").trim();
  if (!workspaceId || !runId) return 0;

  const result = await prisma.optimizationRun.updateMany({
    where: { workspaceId, verifyRunId: runId, status: { in: ["proposed", "verified"] } },
    data: { status: "applied", appliedAt: new Date() },
  });
  return result?.count ?? 0;
}

/**
 * Moves a proposal along, or refuses to.
 *
 * `updateMany` with the workspace in the `where`, not `update` by id: the id came
 * from a request body, and a scoped update that matches nothing is the correct
 * outcome for somebody else's row.
 *
 * The timestamps are set here rather than by the caller so that "verified" always
 * means "there is a `verifiedAt` and a run behind it" — a status set without its
 * evidence is the one thing this table must not be able to say.
 */
export async function updateOptimization(
  workspaceId: string,
  optimizationId: string,
  input: { status: string; note?: string; verifyRunId?: string; proposal?: OptimizationProposal }
): Promise<boolean> {
  const id = (optimizationId || "").trim();
  const status = (input.status || "").trim();
  if (!workspaceId || !id) return false;
  if (!(OPTIMIZATION_STATUSES as readonly string[]).includes(status)) return false;

  const result = await prisma.optimizationRun.updateMany({
    where: { id, workspaceId },
    data: {
      status,
      ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
      ...(input.verifyRunId ? { verifyRunId: input.verifyRunId } : {}),
      ...(input.proposal ? { proposal: asJson(input.proposal) } : {}),
      ...(status === "verified" ? { verifiedAt: new Date() } : {}),
      ...(status === "applied" ? { appliedAt: new Date() } : {}),
    },
  });
  return (result?.count ?? 0) > 0;
}
