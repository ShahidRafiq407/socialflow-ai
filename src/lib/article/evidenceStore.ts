/**
 * PROVENANCE THAT OUTLIVES THE RUN
 *
 * The research stage and the evidence gate both produce an artifact, and both
 * artifacts are JSON on a stage row. That is fine for the next stage and useless
 * six months later, when the question is "where did this number come from" and
 * the only honest answer has to name a URL, a publisher and a date.
 *
 * So the two of them also write rows. This file is the only place that happens.
 *
 * Three properties it holds:
 *
 *   1. A retry replaces, never appends. Stages are retryable by design, and a
 *      second research pass that added a second set of sources would leave the
 *      panel showing two contradictory ledgers for one article.
 *   2. `status` is derived, never stored from a model. The column exists because
 *      it is queried, and `evidenceStatusFrom` recomputes it from the five
 *      booleans both on write and on read.
 *   3. Reads are scoped by workspace, in the query. A run id arrives in a request
 *      body, so ownership is part of the `where` rather than a check somebody can
 *      forget to make afterwards.
 *
 * Server-only — it imports Prisma.
 */

import prisma from "@/lib/db";
import {
  evidenceStatusFrom,
  readEvidenceLedger,
  type EvidenceDecision,
  type EvidenceLedger,
  type ResearchFinding,
} from "./artifacts";

/**
 * Unlike the run store next door, this file uses the generated client directly:
 * it already carries both models, so every column here is really typed and
 * there is nothing to cast around.
 */

/**
 * One row per distinct source URL.
 *
 * Several findings can rest on one page, and the table is shaped that way — a
 * source has many claims. Where two findings quote the same page, the longer
 * passage is the one stored, because it is the one more likely to contain both,
 * and the descriptive fields are filled from whichever finding carried them: a
 * title or a dateline recorded once is a fact about the page, not about the
 * finding that happened to mention it. Every passage stays in the stage's own
 * artifact regardless.
 */
function dedupeByUrl(findings: ResearchFinding[]): ResearchFinding[] {
  const byUrl = new Map<string, ResearchFinding>();
  for (const finding of findings) {
    const existing = byUrl.get(finding.sourceUrl);
    if (!existing) {
      byUrl.set(finding.sourceUrl, finding);
      continue;
    }
    byUrl.set(finding.sourceUrl, {
      ...existing,
      excerpt: finding.excerpt.length > existing.excerpt.length ? finding.excerpt : existing.excerpt,
      sourceTitle: existing.sourceTitle || finding.sourceTitle,
      publisher: existing.publisher || finding.publisher,
      publishedAt: existing.publishedAt || finding.publishedAt,
      // Reachability is the fetcher's verdict on the page, so one success is
      // enough: a second finding that failed to re-fetch it does not unmake it.
      reachable: existing.reachable || finding.reachable,
      fetchError: existing.reachable || finding.reachable ? undefined : existing.fetchError || finding.fetchError,
    });
  }
  return Array.from(byUrl.values());
}

/** A date column from a source's own dateline, or null when it published none. */
function asDate(value?: string): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The research stage's sources, as rows. Returns url → row id, which is what the
 * evidence gate joins its claims on.
 *
 * Replacing sources also clears the claims, because a claim's whole meaning is
 * "this was checked against that source": keeping the claims while replacing the
 * pages under them would leave verdicts attached to nothing.
 */
export async function saveResearchSources(
  runId: string,
  findings: ResearchFinding[]
): Promise<Record<string, string>> {
  const sources = dedupeByUrl(findings);

  await prisma.evidenceClaim.deleteMany({ where: { runId } });
  await prisma.researchSource.deleteMany({ where: { runId } });
  if (sources.length === 0) return {};

  await prisma.researchSource.createMany({
    data: sources.map((source) => ({
      runId,
      url: source.sourceUrl,
      title: source.sourceTitle.slice(0, 500) || null,
      publisher: source.publisher || null,
      publishedAt: asDate(source.publishedAt),
      excerpt: source.excerpt || null,
      sourceType: source.sourceType,
      reachable: source.reachable,
      fetchError: source.fetchError || null,
    })),
  });

  const written = await prisma.researchSource.findMany({
    where: { runId },
    select: { id: true, url: true },
  });
  const byUrl: Record<string, string> = {};
  for (const row of written) byUrl[row.url] = row.id;
  return byUrl;
}

/**
 * url → row id for the sources this run already stored.
 *
 * The evidence gate runs in its own request, so the map `saveResearchSources`
 * returned is long gone by the time the claims are written. It is read back here
 * rather than carried in the run's state: these are our own primary keys, and the
 * state blob is sent to the browser.
 */
export async function researchSourceIds(runId: string): Promise<Record<string, string>> {
  const rows = await prisma.researchSource.findMany({
    where: { runId },
    select: { id: true, url: true },
  });
  const byUrl: Record<string, string> = {};
  for (const row of rows) byUrl[row.url] = row.id;
  return byUrl;
}

/**
 * The gate's decisions, as rows, joined to the source each was checked against.
 *
 * A decision whose source URL has no row is still written — with `sourceId` null
 * and its own reason intact. That case is the one worth keeping: a claim the
 * model attributed to a page the research stage never fetched is exactly what
 * this table exists to make visible.
 */
export async function saveEvidenceClaims(
  runId: string,
  decisions: EvidenceDecision[],
  sourceIdByUrl: Record<string, string> = {}
): Promise<{ allowed: number; blocked: number }> {
  await prisma.evidenceClaim.deleteMany({ where: { runId } });
  if (decisions.length === 0) return { allowed: 0, blocked: 0 };

  const data = decisions.map((decision) => {
    const status = evidenceStatusFrom(decision.checks);
    return {
      runId,
      sourceId: decision.sourceUrl ? (sourceIdByUrl[decision.sourceUrl] ?? null) : null,
      claim: decision.claim,
      kind: decision.kind,
      sourceExists: decision.checks.sourceExists,
      sourceReachable: decision.checks.sourceReachable,
      sourceSupports: decision.checks.sourceSupports,
      current: decision.checks.current,
      trustworthy: decision.checks.trustworthy,
      status,
      reason: decision.reason || null,
    };
  });
  await prisma.evidenceClaim.createMany({ data });

  const allowed = data.filter((row) => row.status === "allowed").length;
  return { allowed, blocked: data.length - allowed };
}

/**
 * Where an allowed claim ended up, once the writer used it.
 *
 * Matched on the claim text because that is what the writer was handed — there is
 * no id in the prompt, and putting one there would invite the model to invent
 * them. A claim the draft never used keeps `usedIn` null, which is the useful
 * signal: it means the gate cleared a fact the page then did not need.
 */
export async function recordClaimsUsed(
  runId: string,
  entries: { claim: string; usedIn: string }[]
): Promise<number> {
  let updated = 0;
  for (const entry of entries) {
    const claim = entry.claim.trim();
    const usedIn = entry.usedIn.trim();
    if (!claim || !usedIn) continue;
    const result = await prisma.evidenceClaim.updateMany({
      where: { runId, claim, status: "allowed" },
      data: { usedIn },
    });
    updated += typeof result?.count === "number" ? result.count : 0;
  }
  return updated;
}

/**
 * The ledger for one run, only if this workspace owns it.
 *
 * Passed back through `readEvidenceLedger` rather than handed over as rows: the
 * panel reading this is a client component, the counts have to be derived from
 * the claims rather than trusted, and `status` is recomputed there from the five
 * booleans for rows written by any earlier build.
 */
export async function loadEvidenceLedger(
  workspaceId: string,
  runId: unknown
): Promise<EvidenceLedger> {
  const empty: EvidenceLedger = { sources: [], claims: [], allowed: 0, blocked: 0 };
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) return empty;

  const [sources, claims] = await Promise.all([
    prisma.researchSource.findMany({
      where: { runId: id, run: { workspaceId } },
      orderBy: { fetchedAt: "asc" },
      take: 120,
    }),
    prisma.evidenceClaim.findMany({
      where: { runId: id, run: { workspaceId } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 200,
    }),
  ]);

  return (
    readEvidenceLedger({
      sources: sources.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title ?? "",
        publisher: row.publisher ?? "",
        publishedAt: row.publishedAt?.toISOString(),
        fetchedAt: row.fetchedAt.toISOString(),
        excerpt: row.excerpt ?? "",
        sourceType: row.sourceType,
        reachable: row.reachable,
        fetchError: row.fetchError ?? undefined,
      })),
      claims: claims.map((row) => ({
        id: row.id,
        claim: row.claim,
        kind: row.kind,
        checks: {
          sourceExists: row.sourceExists,
          sourceReachable: row.sourceReachable,
          sourceSupports: row.sourceSupports,
          current: row.current,
          trustworthy: row.trustworthy,
        },
        reason: row.reason ?? "",
        usedIn: row.usedIn ?? undefined,
        sourceId: row.sourceId ?? undefined,
      })),
    }) ?? empty
  );
}
