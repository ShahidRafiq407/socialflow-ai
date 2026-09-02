import prisma from "@/lib/db";
import { embedText } from "./embeddings";
import { NOT_A_FACT_SQL } from "./controller/memory";

// ============================================================================
// PGVECTOR LONG-TERM MEMORY STORE
// The `embedding` column is managed via raw SQL (Prisma does not map `vector`).
// ============================================================================

let vectorSetupPromise: Promise<void> | null = null;

async function ensureVectorSetup(): Promise<void> {
  if (!vectorSetupPromise) {
    vectorSetupPromise = (async () => {
      try {
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS embedding vector(768);`
        );
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "Memory_embedding_idx" ON "Memory" USING hnsw (embedding vector_cosine_ops);`
        );
      } catch (err) {
        console.warn("[Memory] pgvector setup skipped/failed (non-fatal):", err);
      }
    })();
  }
  return vectorSetupPromise;
}

function toVectorString(vec: number[]): string {
  return `[${vec.map((n) => Number(n.toFixed(6))).join(",")}]`;
}

export interface MemoryFact {
  id: string;
  category: string;
  content: string;
  similarity: number;
}

/**
 * Persist a fact into long-term memory with a semantic embedding.
 * Best-effort — never throws on the hot path.
 */
export async function saveMemory(
  workspaceId: string,
  category: string,
  content: string
): Promise<void> {
  const trimmed = (content || "").trim();
  if (!trimmed || !workspaceId) return;
  try {
    const vec = await embedText(trimmed);
    if (vec.length === 0) return;
    await ensureVectorSetup();
    const row = await prisma.memory.create({
      data: { workspaceId, category, content: trimmed },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "Memory" SET embedding = $1::vector WHERE id = $2`,
      toVectorString(vec),
      row.id
    );
  } catch (err) {
    console.warn("[Memory] save failed (non-fatal):", err);
  }
}

/**
 * Semantic recall: returns the most relevant stored facts for a query.
 *
 * The Memory table doubles as a schema-free store for system rows (playbooks,
 * content outcomes, billing), so those categories are excluded here too — this
 * path feeds the `recall_memory` tool, and a stored recipe surfacing as a
 * remembered fact would be a lie about what the user told us.
 */
export async function recallMemories(
  workspaceId: string,
  query: string,
  limit = 6
): Promise<MemoryFact[]> {
  if (!workspaceId || !(query || "").trim()) return [];
  try {
    const vec = await embedText(query);
    if (vec.length === 0) return [];
    await ensureVectorSetup();
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, category, content, (1 - (embedding <=> $1::vector)) AS similarity
       FROM "Memory"
       WHERE "workspaceId" = $2 AND embedding IS NOT NULL AND ${NOT_A_FACT_SQL}
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      toVectorString(vec),
      workspaceId,
      limit
    );
    return (rows || []).map((r) => ({
      id: r.id,
      category: r.category,
      content: r.content,
      similarity: Number(r.similarity ?? 0),
    }));
  } catch (err) {
    console.warn("[Memory] recall failed (non-fatal):", err);
    return [];
  }
}
