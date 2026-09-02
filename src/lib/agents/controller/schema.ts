import prisma from "@/lib/db";

// ============================================================================
// CONTROLLER SCHEMA BOOTSTRAP
//
// The chat controller adds columns to ChatSession / Message / Memory and a new
// ChatSettings table. Vercel builds run `prisma generate`, not `migrate deploy`,
// so — exactly like `ensureVectorSetup()` in ../memory.ts — the DDL is applied
// idempotently at runtime the first time the controller touches the database.
//
// Every statement is `IF NOT EXISTS`, so this is safe to run on every cold
// start and safe to run concurrently from several serverless instances.
// ============================================================================

let bootstrapPromise: Promise<void> | null = null;

const STATEMENTS: string[] = [
  // --- ChatSession ---
  `ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "model" TEXT`,
  `ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "summary" TEXT`,
  `CREATE INDEX IF NOT EXISTS "ChatSession_workspaceId_archived_updatedAt_idx"
     ON "ChatSession" ("workspaceId", "archived", "updatedAt")`,

  // --- Message ---
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "reasoning" TEXT`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "attachments" JSONB`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "artifacts" JSONB`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "suggestions" JSONB`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "model" TEXT`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "finishReason" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Message_chatSessionId_createdAt_idx"
     ON "Message" ("chatSessionId", "createdAt")`,

  // --- Memory ---
  `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "importance" INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'auto'`,
  `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "sessionId" TEXT`,
  `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "hitCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3)`,
  `CREATE INDEX IF NOT EXISTS "Memory_workspaceId_pinned_idx"
     ON "Memory" ("workspaceId", "pinned")`,

  // --- ChatSettings ---
  `CREATE TABLE IF NOT EXISTS "ChatSettings" (
      "id"                 TEXT NOT NULL,
      "workspaceId"        TEXT NOT NULL,
      "model"              TEXT NOT NULL DEFAULT 'gemini-3.1-pro-preview',
      "temperature"        DOUBLE PRECISION NOT NULL DEFAULT 0.4,
      "maxToolLoops"       INTEGER NOT NULL DEFAULT 8,
      "thinkingLevel"      TEXT NOT NULL DEFAULT 'balanced',
      "thinkingDisplay"    TEXT NOT NULL DEFAULT 'live',
      "streamTokens"       BOOLEAN NOT NULL DEFAULT true,
      "replyLanguage"      TEXT NOT NULL DEFAULT 'auto',
      "replyStyle"         TEXT NOT NULL DEFAULT 'executive',
      "customInstructions" TEXT,
      "autonomy"           TEXT NOT NULL DEFAULT 'auto',
      "allowWebSearch"     BOOLEAN NOT NULL DEFAULT true,
      "allowMediaGen"      BOOLEAN NOT NULL DEFAULT true,
      "allowPublishing"    BOOLEAN NOT NULL DEFAULT true,
      "allowPlugins"       BOOLEAN NOT NULL DEFAULT true,
      "memoryEnabled"      BOOLEAN NOT NULL DEFAULT true,
      "memoryAutoSave"     BOOLEAN NOT NULL DEFAULT true,
      "memoryRecallTopK"   INTEGER NOT NULL DEFAULT 8,
      "toolVisibility"     TEXT NOT NULL DEFAULT 'all',
      "autoOpenLinks"      BOOLEAN NOT NULL DEFAULT false,
      "showSuggestions"    BOOLEAN NOT NULL DEFAULT true,
      "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChatSettings_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChatSettings_workspaceId_key"
     ON "ChatSettings" ("workspaceId")`,
];

/**
 * Applies the controller's additive DDL once per process. Failures are logged
 * and swallowed: a workspace whose database is already migrated (or whose role
 * lacks DDL rights) must still be able to chat, and every read path in the
 * controller tolerates a missing column by falling back to defaults.
 */
export async function ensureControllerSchema(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      for (const sql of STATEMENTS) {
        try {
          await prisma.$executeRawUnsafe(sql);
        } catch (err) {
          console.warn(
            "[ControllerSchema] statement skipped (non-fatal):",
            sql.slice(0, 72).replace(/\s+/g, " "),
            err instanceof Error ? err.message : err
          );
        }
      }
    })();
  }
  return bootstrapPromise;
}

/** Test hook: forget that the bootstrap already ran. */
export function resetControllerSchemaCacheForTests(): void {
  bootstrapPromise = null;
}
