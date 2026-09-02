// ============================================================================
// FEATURE REQUESTS — the loop back to whoever builds this
//
// When the controller has to say "I can't do that yet", the ask is written down
// instead of evaporating into a chat log nobody reads. Stored as JSON in one
// Memory row per distinct request (category "feature_request"), exactly like
// billing history — no migration, and it works on a deploy that is already live.
//
// Two deliberate properties:
//   1. NO EMBEDDING is ever written for these rows, and the category is excluded
//      from memory recall, so a logged limitation can never come back as a
//      "fact you remember about this user".
//   2. The same ask twice is ONE row with a counter. A list of 40 near-identical
//      rows tells the developer nothing; "asked 12 times" tells them what to build.
// ============================================================================

import prisma from "@/lib/db";
import { ensureControllerSchema } from "./schema";
import {
  mergeRequestPayload,
  newRequestPayload,
  parseRequestRow,
  slugifyRequest,
  sortRequests,
  type FeatureRequest,
  type FeatureRequestInput,
  type FeatureRequestStatus,
} from "./requestShape";

export const FEATURE_REQUEST_CATEGORY = "feature_request";

/** Rows scanned when looking for an existing ask. Well past any real backlog. */
const MAX_SCAN = 300;

export interface RecordRequestResult {
  recorded: boolean;
  id: string | null;
  slug: string;
  timesAsked: number;
  firstTime: boolean;
}

/**
 * Writes down an ask this product cannot satisfy yet.
 *
 * Never throws. A logging failure must not turn an honest apology into an error
 * message — the user still gets told the truth, the developer just misses one row.
 *
 * The `prisma.memory.create` here is exactly the point where the embedding is NOT
 * written: `Memory.embedding` is a raw pgvector column that only the embedding
 * path in ../memory.ts ever fills, so a row created through Prisma is invisible
 * to semantic recall by construction.
 */
export async function recordFeatureRequest(
  workspaceId: string,
  input: FeatureRequestInput
): Promise<RecordRequestResult> {
  const slug = slugifyRequest(input.title || input.request);

  try {
    await ensureControllerSchema();

    const rows = await prisma.memory.findMany({
      where: { workspaceId, category: FEATURE_REQUEST_CATEGORY },
      orderBy: { updatedAt: "desc" },
      take: MAX_SCAN,
      select: { id: true, content: true },
    });

    for (const row of rows) {
      const parsed = parseRequestRow(row);
      if (!parsed || parsed.slug !== slug) continue;

      const merged = mergeRequestPayload(parsed, input);
      await prisma.memory.update({
        where: { id: row.id },
        data: { content: JSON.stringify(merged) },
      });

      return {
        recorded: true,
        id: row.id,
        slug: merged.slug,
        timesAsked: merged.timesAsked,
        firstTime: false,
      };
    }

    const payload = newRequestPayload(input);
    const created = await prisma.memory.create({
      data: {
        workspaceId,
        category: FEATURE_REQUEST_CATEGORY,
        content: JSON.stringify(payload),
        importance: 1,
        pinned: false,
        source: "auto",
        sessionId: payload.sessionId,
      },
      select: { id: true },
    });

    return { recorded: true, id: created.id, slug: payload.slug, timesAsked: 1, firstTime: true };
  } catch (err) {
    console.warn("[FeatureRequest] not recorded:", err instanceof Error ? err.message : err);
    return { recorded: false, id: null, slug, timesAsked: 0, firstTime: false };
  }
}

/** Everything asked for and not yet possible, in the order a developer should read it. */
export async function listFeatureRequests(
  workspaceId: string,
  options: { status?: FeatureRequestStatus | "all"; query?: string; limit?: number } = {}
): Promise<FeatureRequest[]> {
  try {
    await ensureControllerSchema();

    const rows = await prisma.memory.findMany({
      where: { workspaceId, category: FEATURE_REQUEST_CATEGORY },
      orderBy: { updatedAt: "desc" },
      take: MAX_SCAN,
      select: { id: true, content: true },
    });

    let requests = rows.map(parseRequestRow).filter((r): r is FeatureRequest => r !== null);

    if (options.status && options.status !== "all") {
      requests = requests.filter((r) => r.status === options.status);
    }

    const query = (options.query || "").trim().toLowerCase();
    if (query) {
      requests = requests.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.request.toLowerCase().includes(query) ||
          r.detail.toLowerCase().includes(query)
      );
    }

    const sorted = sortRequests(requests);
    return options.limit && options.limit > 0 ? sorted.slice(0, options.limit) : sorted;
  } catch (err) {
    console.warn("[FeatureRequest] list failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Moves an ask along ("planned", "shipped", "declined"). Scoped by workspaceId as
 * well as id, so one workspace can never touch another's backlog.
 */
export async function updateFeatureRequestStatus(
  workspaceId: string,
  id: string,
  status: FeatureRequestStatus
): Promise<boolean> {
  try {
    const row = await prisma.memory.findFirst({
      where: { id, workspaceId, category: FEATURE_REQUEST_CATEGORY },
      select: { id: true, content: true },
    });
    if (!row) return false;

    const parsed = parseRequestRow(row);
    if (!parsed) return false;

    const { id: _id, ...payload } = parsed;
    await prisma.memory.update({
      where: { id: row.id },
      data: { content: JSON.stringify({ ...payload, status }) },
    });
    return true;
  } catch (err) {
    console.warn("[FeatureRequest] status update failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Drops an ask for good. Same tenancy guard as the status update. */
export async function deleteFeatureRequest(workspaceId: string, id: string): Promise<boolean> {
  try {
    const result = await prisma.memory.deleteMany({
      where: { id, workspaceId, category: FEATURE_REQUEST_CATEGORY },
    });
    return result.count > 0;
  } catch (err) {
    console.warn("[FeatureRequest] delete failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
