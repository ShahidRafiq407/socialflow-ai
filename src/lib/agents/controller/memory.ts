// ============================================================================
// CONTROLLER MEMORY — the "never forgets" layer
//
// Built on the same pgvector Memory table as ../memory.ts, with three additions
// the controller needs:
//
//   1. PINNED + HIGH-IMPORTANCE facts load on EVERY turn regardless of semantic
//      similarity, so identity-level facts ("my brand voice is X", "never post
//      on Sundays") can never be missed by a bad embedding match.
//   2. Recency backfill: when a topic has no semantic match, the newest facts
//      still load, so nothing silently disappears from the model's view.
//   3. Recall is written back (hitCount / lastUsedAt), so facts the user leans
//      on rank above facts they don't.
//
// Every function is best-effort: chat must work even if memory is unavailable.
// ============================================================================

import prisma from "@/lib/db";
import { embedText } from "../embeddings";
import { ensureControllerSchema } from "./schema";
import { rankFacts } from "./memoryRank";
import { PLAYBOOK_CATEGORY, buildPlaybookContent } from "./playbooks";
import { OUTCOME_CATEGORY } from "./outcomes";

export interface ControllerMemoryFact {
  id: string;
  category: string;
  content: string;
  importance: number;
  pinned: boolean;
  source: string;
  similarity: number;
  createdAt: Date | null;
  hitCount: number;
  lastUsedAt: Date | null;
}

const ALWAYS_LOAD_IMPORTANCE = 5;
const MAX_ALWAYS_LOAD = 40;
const MAX_CONTENT_CHARS = 1200;

// ---------------------------------------------------------------------------
// Not-a-fact categories
//
// The Memory table is also used as a schema-free store for system JSON: billing
// history, the active plan, checkout intents, captured feature requests, and
// playbooks (procedural recipes recalled through their own path, loadPlaybooks)
// — plus content-outcome events (publish/discard tallies aggregated by
// outcomeStore). None of those are things the user "told us to remember", so
// none of them may ever be injected into the prompt as a remembered fact or
// shown in the memory browser. Every fact-recall path filters these out;
// loadPlaybooks / loadOutcomeEvents query their own category explicitly instead.
// ---------------------------------------------------------------------------
export const NON_FACT_CATEGORIES = [
  "billing_event",
  "subscription_plan",
  "checkout_intent",
  "feature_request",
  PLAYBOOK_CATEGORY,
  OUTCOME_CATEGORY,
] as const;

/** Prisma `where` fragment excluding system rows from a fact query. */
const NOT_A_FACT = { category: { notIn: NON_FACT_CATEGORIES as unknown as string[] } };

/** SQL fragment (raw pgvector queries can't use the Prisma filter). */
export const NOT_A_FACT_SQL = `"category" NOT IN (${NON_FACT_CATEGORIES.map((c) => `'${c}'`).join(", ")})`;

let vectorReady: Promise<void> | null = null;

async function ensureMemoryVector(): Promise<void> {
  if (!vectorReady) {
    vectorReady = (async () => {
      try {
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS embedding vector(768);`);
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "Memory_embedding_idx" ON "Memory" USING hnsw (embedding vector_cosine_ops);`
        );
      } catch (err) {
        console.warn("[ControllerMemory] pgvector setup skipped (non-fatal):", err);
      }
    })();
  }
  return vectorReady;
}

function toVectorString(vec: number[]): string {
  return `[${vec.map((n) => Number(n.toFixed(6))).join(",")}]`;
}

function normalizeRow(row: any, similarity = 0): ControllerMemoryFact {
  return {
    id: String(row.id),
    category: String(row.category || "general"),
    content: String(row.content || "").slice(0, MAX_CONTENT_CHARS),
    importance: Number(row.importance ?? 3),
    pinned: Boolean(row.pinned),
    source: String(row.source || "auto"),
    similarity: Number(similarity ?? 0),
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    hitCount: Number(row.hitCount ?? 0),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
  };
}

/**
 * Stores one fact. Near-duplicates are merged instead of appended (the same fact
 * restated should raise its importance, not clutter recall).
 */
export async function rememberFact(params: {
  workspaceId: string;
  content: string;
  category?: string;
  importance?: number;
  pinned?: boolean;
  source?: "auto" | "user";
  sessionId?: string | null;
}): Promise<{ saved: boolean; id?: string; merged?: boolean }> {
  const content = (params.content || "").trim();
  if (!content || !params.workspaceId) return { saved: false };

  const category = (params.category || "general").trim().slice(0, 60) || "general";
  const importance = Math.min(5, Math.max(1, Math.round(params.importance ?? 3)));
  const pinned = Boolean(params.pinned) || importance >= ALWAYS_LOAD_IMPORTANCE;
  const source = params.source === "user" ? "user" : "auto";

  try {
    await ensureControllerSchema();

    // Exact-duplicate guard first (cheap), then semantic near-duplicate.
    const existing = await prisma.memory.findFirst({
      where: { workspaceId: params.workspaceId, content },
      select: { id: true },
    });
    if (existing) {
      await (prisma as any).memory.update({
        where: { id: existing.id },
        data: { importance, pinned, source, sessionId: params.sessionId ?? undefined },
      });
      return { saved: true, id: existing.id, merged: true };
    }

    const vec = await embedText(content);
    await ensureMemoryVector();

    if (vec.length > 0) {
      const near = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, (1 - (embedding <=> $1::vector)) AS similarity
           FROM "Memory"
          WHERE "workspaceId" = $2 AND embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT 1`,
        toVectorString(vec),
        params.workspaceId
      );
      const top = near?.[0];
      if (top && Number(top.similarity) >= 0.96) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Memory"
              SET content = $1,
                  importance = GREATEST("importance", $2),
                  pinned = ("pinned" OR $3),
                  "updatedAt" = NOW()
            WHERE id = $4`,
          content,
          importance,
          pinned,
          String(top.id)
        );
        return { saved: true, id: String(top.id), merged: true };
      }
    }

    const row = await (prisma as any).memory.create({
      data: {
        workspaceId: params.workspaceId,
        category,
        content,
        importance,
        pinned,
        source,
        sessionId: params.sessionId ?? null,
      },
    });

    if (vec.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Memory" SET embedding = $1::vector WHERE id = $2`,
        toVectorString(vec),
        row.id
      );
    }

    return { saved: true, id: row.id };
  } catch (err) {
    console.warn("[ControllerMemory] remember failed (non-fatal):", err instanceof Error ? err.message : err);
    return { saved: false };
  }
}

/**
 * Loads the context for one turn: every pinned/critical fact, plus the closest
 * semantic matches for what the user just said, plus a recency backfill.
 */
export async function loadMemoryContext(
  workspaceId: string,
  query: string,
  topK = 8
): Promise<ControllerMemoryFact[]> {
  if (!workspaceId) return [];

  const byId = new Map<string, ControllerMemoryFact>();

  try {
    await ensureControllerSchema();

    // 1. Always-load: pinned or importance 5.
    const always = await (prisma as any).memory.findMany({
      where: {
        workspaceId,
        ...NOT_A_FACT,
        OR: [{ pinned: true }, { importance: { gte: ALWAYS_LOAD_IMPORTANCE } }],
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: MAX_ALWAYS_LOAD,
    });
    for (const row of always || []) byId.set(String(row.id), normalizeRow(row, 1));
  } catch (err) {
    console.warn("[ControllerMemory] always-load failed:", err instanceof Error ? err.message : err);
  }

  // 2. Semantic recall for this turn.
  if (topK > 0 && (query || "").trim()) {
    try {
      const vec = await embedText(query);
      if (vec.length > 0) {
        await ensureMemoryVector();
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, category, content, importance, pinned, source, "createdAt", "hitCount", "lastUsedAt",
                  (1 - (embedding <=> $1::vector)) AS similarity
             FROM "Memory"
            WHERE "workspaceId" = $2 AND embedding IS NOT NULL AND ${NOT_A_FACT_SQL}
            ORDER BY embedding <=> $1::vector
            LIMIT $3`,
          toVectorString(vec),
          workspaceId,
          topK
        );
        for (const row of rows || []) {
          if (!byId.has(String(row.id))) byId.set(String(row.id), normalizeRow(row, row.similarity));
        }
      }
    } catch (err) {
      console.warn("[ControllerMemory] semantic recall failed:", err instanceof Error ? err.message : err);
    }
  }

  // 3. Recency backfill so a cold embedding never means "no memory at all".
  if (byId.size < Math.max(4, Math.min(topK, 6))) {
    try {
      const recent = await (prisma as any).memory.findMany({
        where: { workspaceId, ...NOT_A_FACT },
        orderBy: { updatedAt: "desc" },
        take: Math.max(4, topK),
      });
      for (const row of recent || []) {
        if (!byId.has(String(row.id))) byId.set(String(row.id), normalizeRow(row, 0));
      }
    } catch {
      /* non-fatal */
    }
  }

  // Hard tiers (pinned, importance) first; within a tier, semantic similarity
  // plus the reinforcement nudge from hitCount / lastUsedAt (see memoryRank).
  const facts = rankFacts(Array.from(byId.values()), Date.now());

  // Fire-and-forget usage stats so hot facts rank higher next time.
  if (facts.length > 0) {
    void (async () => {
      try {
        await (prisma as any).memory.updateMany({
          where: { id: { in: facts.map((f) => f.id) } },
          data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
        });
      } catch {
        /* non-fatal */
      }
    })();
  }

  return facts;
}

/** Importance playbooks are stored at — modest, and never auto-pinned. */
const PLAYBOOK_IMPORTANCE = 2;
/** A stored recipe this close to a new one is refreshed, not duplicated. */
const PLAYBOOK_NEAR_DUP = 0.94;
/** A playbook must match the current task at least this well to be injected. */
export const PLAYBOOK_MIN_SIMILARITY = 0.5;

/**
 * Stores one playbook: the tool sequence that just completed a task, keyed to
 * the task it carried out. Deduplication is scoped to the playbook category so
 * a recipe can never merge into (or overwrite) a user fact, and a near-identical
 * recipe is refreshed to the newest working sequence rather than piled up.
 */
export async function savePlaybook(params: {
  workspaceId: string;
  task: string;
  sequence: string[];
  sessionId?: string | null;
}): Promise<{ saved: boolean; id?: string; merged?: boolean }> {
  const content = buildPlaybookContent(params.task, params.sequence);
  if (!content || !params.workspaceId) return { saved: false };

  try {
    await ensureControllerSchema();

    // Exact-duplicate guard, scoped to playbooks.
    const existing = await prisma.memory.findFirst({
      where: { workspaceId: params.workspaceId, category: PLAYBOOK_CATEGORY, content },
      select: { id: true },
    });
    if (existing) {
      await (prisma as any).memory.update({
        where: { id: existing.id },
        data: { updatedAt: new Date(), sessionId: params.sessionId ?? undefined },
      });
      return { saved: true, id: existing.id, merged: true };
    }

    const vec = await embedText(content);
    await ensureMemoryVector();

    if (vec.length > 0) {
      const near = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, (1 - (embedding <=> $1::vector)) AS similarity
           FROM "Memory"
          WHERE "workspaceId" = $2 AND "category" = '${PLAYBOOK_CATEGORY}' AND embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT 1`,
        toVectorString(vec),
        params.workspaceId
      );
      const top = near?.[0];
      if (top && Number(top.similarity) >= PLAYBOOK_NEAR_DUP) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Memory" SET content = $1, "updatedAt" = NOW() WHERE id = $2`,
          content,
          String(top.id)
        );
        return { saved: true, id: String(top.id), merged: true };
      }
    }

    const row = await (prisma as any).memory.create({
      data: {
        workspaceId: params.workspaceId,
        category: PLAYBOOK_CATEGORY,
        content,
        importance: PLAYBOOK_IMPORTANCE,
        pinned: false,
        source: "auto",
        sessionId: params.sessionId ?? null,
      },
    });

    if (vec.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Memory" SET embedding = $1::vector WHERE id = $2`,
        toVectorString(vec),
        row.id
      );
    }

    return { saved: true, id: row.id };
  } catch (err) {
    console.warn("[ControllerMemory] savePlaybook failed (non-fatal):", err instanceof Error ? err.message : err);
    return { saved: false };
  }
}

/**
 * Loads the best-matching playbooks for the current task. Unlike fact recall
 * there is no always-load and no recency backfill: an unrelated recipe is worse
 * than none, so only matches above PLAYBOOK_MIN_SIMILARITY survive, ranked with
 * the same similarity-plus-reinforcement ordering facts use (so a recipe the
 * user leans on rises). Recall is written back to reinforce popular playbooks.
 */
export async function loadPlaybooks(
  workspaceId: string,
  query: string,
  topK = 2,
  minSimilarity = PLAYBOOK_MIN_SIMILARITY
): Promise<ControllerMemoryFact[]> {
  if (!workspaceId || !(query || "").trim() || topK <= 0) return [];

  try {
    await ensureControllerSchema();
    const vec = await embedText(query);
    if (vec.length === 0) return [];
    await ensureMemoryVector();

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, category, content, importance, pinned, source, "createdAt", "hitCount", "lastUsedAt",
              (1 - (embedding <=> $1::vector)) AS similarity
         FROM "Memory"
        WHERE "workspaceId" = $2 AND "category" = '${PLAYBOOK_CATEGORY}' AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      toVectorString(vec),
      workspaceId,
      Math.max(1, topK) * 3
    );

    const matched = (rows || [])
      .map((row) => normalizeRow(row, row.similarity))
      .filter((f) => f.similarity >= minSimilarity);

    const ranked = rankFacts(matched, Date.now()).slice(0, Math.max(1, topK));

    if (ranked.length > 0) {
      void (async () => {
        try {
          await (prisma as any).memory.updateMany({
            where: { id: { in: ranked.map((f) => f.id) } },
            data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
          });
        } catch {
          /* non-fatal */
        }
      })();
    }

    return ranked;
  } catch (err) {
    console.warn("[ControllerMemory] loadPlaybooks failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Free-text / category search for the memory browser in chat settings. */
export async function searchMemories(
  workspaceId: string,
  options: { query?: string; category?: string; limit?: number } = {}
): Promise<ControllerMemoryFact[]> {
  const limit = Math.min(200, Math.max(1, options.limit ?? 100));
  try {
    await ensureControllerSchema();
    const rows = await (prisma as any).memory.findMany({
      where: {
        workspaceId,
        // An explicit category is honoured as-is; otherwise the system rows
        // (billing, plan, feature requests) are never shown as "memory".
        ...(options.category ? { category: options.category } : NOT_A_FACT),
        ...(options.query ? { content: { contains: options.query, mode: "insensitive" } } : {}),
      },
      orderBy: [{ pinned: "desc" }, { importance: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });
    return (rows || []).map((r: any) => normalizeRow(r, 0));
  } catch (err) {
    console.warn("[ControllerMemory] search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function updateMemory(
  workspaceId: string,
  id: string,
  patch: { content?: string; category?: string; importance?: number; pinned?: boolean }
): Promise<boolean> {
  try {
    await ensureControllerSchema();
    const data: Record<string, unknown> = {};
    if (typeof patch.content === "string" && patch.content.trim()) data.content = patch.content.trim();
    if (typeof patch.category === "string" && patch.category.trim()) data.category = patch.category.trim().slice(0, 60);
    if (typeof patch.importance === "number") data.importance = Math.min(5, Math.max(1, Math.round(patch.importance)));
    if (typeof patch.pinned === "boolean") data.pinned = patch.pinned;
    if (Object.keys(data).length === 0) return false;

    const res = await (prisma as any).memory.updateMany({ where: { id, workspaceId }, data });
    if (res.count > 0 && typeof data.content === "string") {
      const vec = await embedText(String(data.content));
      if (vec.length > 0) {
        await ensureMemoryVector();
        await prisma.$executeRawUnsafe(
          `UPDATE "Memory" SET embedding = $1::vector WHERE id = $2`,
          toVectorString(vec),
          id
        );
      }
    }
    return res.count > 0;
  } catch (err) {
    console.warn("[ControllerMemory] update failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Deletes a fact. Only the owning workspace can delete its own memory. */
export async function forgetMemory(workspaceId: string, id: string): Promise<boolean> {
  try {
    const res = await prisma.memory.deleteMany({ where: { id, workspaceId } });
    return res.count > 0;
  } catch (err) {
    console.warn("[ControllerMemory] forget failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Renders memory for the system prompt. */
export function formatMemoryForPrompt(facts: ControllerMemoryFact[]): string {
  if (facts.length === 0) return "No stored memory yet for this workspace.";
  return facts
    .map((f) => {
      const flags = [f.pinned ? "PINNED" : null, f.importance >= 4 ? `importance ${f.importance}` : null]
        .filter(Boolean)
        .join(", ");
      return `- [${f.category}${flags ? `; ${flags}` : ""}] ${f.content}`;
    })
    .join("\n");
}
