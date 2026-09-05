import prisma from "@/lib/db";

// ============================================================================
// ADMIN SCHEMA BOOTSTRAP
//
// The back office adds a role and a block flag to User and six new tables.
// Vercel builds run `prisma generate`, not `migrate deploy`, so — exactly like
// `ensureControllerSchema()` — the DDL is applied idempotently at runtime the
// first time an admin path touches the database. Every statement is
// `IF NOT EXISTS`, so it is safe on every cold start and from several
// serverless instances at once.
// ============================================================================

let bootstrapPromise: Promise<void> | null = null;

/**
 * Bumped whenever STATEMENTS changes. A database that reports this version has
 * the whole list applied, so a cold instance can skip 25 sequential DDL round
 * trips and answer with one SELECT.
 */
const SCHEMA_VERSION = "2026-09-05.productFeedback";

const STATEMENTS: string[] = [
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
       CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
     END IF;
   END $$`,

  // "AiModel"."minPlan" is this enum. On a database where the billing migration
  // never ran, a missing type made the whole CREATE TABLE below fail — and the
  // model catalogue then looked simply empty.
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanTier') THEN
       CREATE TYPE "PlanTier" AS ENUM ('FREE', 'TRIAL', 'GO', 'PRO', 'AGENCY');
     END IF;
   END $$`,

  // --- User ---
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER'`,
  // Where an ADMIN role came from, so one synced from ADMIN_USERS can be taken
  // away again when the address leaves the allowlist.
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleSource" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedBy" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3)`,

  // --- AppSetting ---
  `CREATE TABLE IF NOT EXISTS "AppSetting" (
      "key"       TEXT NOT NULL,
      "value"     JSONB NOT NULL,
      "secret"    BOOLEAN NOT NULL DEFAULT false,
      "updatedBy" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
   )`,

  // --- AiModel ---
  `CREATE TABLE IF NOT EXISTS "AiModel" (
      "id"               TEXT NOT NULL,
      "label"            TEXT NOT NULL,
      "blurb"            TEXT,
      "provider"         TEXT NOT NULL DEFAULT 'vertex',
      "baseUrl"          VARCHAR(512),
      "apiKeyRef"        VARCHAR(80),
      "contextWindow"    INTEGER,
      "maxOutputTokens"  INTEGER,
      "kind"             TEXT NOT NULL DEFAULT 'text',
      "inputPerMTok"     DOUBLE PRECISION NOT NULL DEFAULT 0,
      "outputPerMTok"    DOUBLE PRECISION NOT NULL DEFAULT 0,
      "cachedPerMTok"    DOUBLE PRECISION,
      "perImage"         DOUBLE PRECISION,
      "perVideoSecond"   DOUBLE PRECISION,
      "supportsThinking" BOOLEAN NOT NULL DEFAULT true,
      "supportsTools"    BOOLEAN NOT NULL DEFAULT true,
      "supportsVision"   BOOLEAN NOT NULL DEFAULT true,
      "tier"             TEXT NOT NULL DEFAULT 'frontier',
      "enabledForChat"   BOOLEAN NOT NULL DEFAULT false,
      "chatCredits"      INTEGER,
      "minPlan"          "PlanTier",
      "isDefaultChat"    BOOLEAN NOT NULL DEFAULT false,
      "sortOrder"        INTEGER NOT NULL DEFAULT 100,
      "archived"         BOOLEAN NOT NULL DEFAULT false,
      "createdBy"        TEXT,
      "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "AiModel_enabledForChat_archived_idx" ON "AiModel" ("enabledForChat", "archived")`,
  // Multi-provider columns, added after the table shipped. A deployment whose
  // "AiModel" predates them needs these; a fresh one already has them from the
  // CREATE above, and IF NOT EXISTS makes both paths the same statement.
  `ALTER TABLE "AiModel" ADD COLUMN IF NOT EXISTS "baseUrl" VARCHAR(512)`,
  `ALTER TABLE "AiModel" ADD COLUMN IF NOT EXISTS "apiKeyRef" VARCHAR(80)`,
  `ALTER TABLE "AiModel" ADD COLUMN IF NOT EXISTS "contextWindow" INTEGER`,
  `ALTER TABLE "AiModel" ADD COLUMN IF NOT EXISTS "maxOutputTokens" INTEGER`,

  // --- UserNotification ---
  `CREATE TABLE IF NOT EXISTS "UserNotification" (
      "id"        TEXT NOT NULL,
      "userId"    TEXT NOT NULL,
      "tone"      TEXT NOT NULL DEFAULT 'info',
      "title"     VARCHAR(200) NOT NULL,
      "body"      TEXT,
      "href"      VARCHAR(512),
      "linkLabel" VARCHAR(80),
      "sentBy"    TEXT,
      "readAt"    TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS "UserNotification_userId_readAt_createdAt_idx" ON "UserNotification" ("userId", "readAt", "createdAt")`,
  // The bell reads by user; the admin send history reads by time across all users.
  `CREATE INDEX IF NOT EXISTS "UserNotification_createdAt_idx" ON "UserNotification" ("createdAt")`,

  // --- ChatFeedback ---
  `CREATE TABLE IF NOT EXISTS "ChatFeedback" (
      "id"             TEXT NOT NULL,
      "messageId"      TEXT NOT NULL,
      "sessionId"      TEXT NOT NULL,
      "workspaceId"    TEXT NOT NULL,
      "userId"         TEXT NOT NULL,
      "rating"         INTEGER NOT NULL,
      "comment"        TEXT,
      "model"          TEXT,
      "messageExcerpt" VARCHAR(600),
      "status"         TEXT,
      "adminNote"      TEXT,
      "reviewedBy"     TEXT,
      "reviewedAt"     TIMESTAMP(3),
      "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChatFeedback_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ChatFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChatFeedback_messageId_userId_key" ON "ChatFeedback" ("messageId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ChatFeedback_rating_createdAt_idx" ON "ChatFeedback" ("rating", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ChatFeedback_status_createdAt_idx" ON "ChatFeedback" ("status", "createdAt")`,

  // --- ProductFeedback ---
  // Free-form feedback from anywhere in the user dashboard. Deliberately a
  // separate table from "ChatFeedback": a chat vote provably has a message, a
  // session, a workspace and a ±1, and relaxing those four columns would make
  // the up/down satisfaction number untrustworthy. Product feedback has none of
  // them guaranteed — the shell legitimately runs with no active workspace — and
  // is repeatable, so it carries no unique constraint.
  `CREATE TABLE IF NOT EXISTS "ProductFeedback" (
      "id"          TEXT NOT NULL,
      "userId"      TEXT NOT NULL,
      "workspaceId" TEXT,
      "category"    TEXT NOT NULL DEFAULT 'other',
      "sentiment"   INTEGER,
      "message"     TEXT NOT NULL,
      "path"        VARCHAR(512),
      "userAgent"   VARCHAR(400),
      "status"      TEXT,
      "adminNote"   TEXT,
      "reviewedBy"  TEXT,
      "reviewedAt"  TIMESTAMP(3),
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProductFeedback_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ProductFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS "ProductFeedback_status_createdAt_idx" ON "ProductFeedback" ("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ProductFeedback_createdAt_idx" ON "ProductFeedback" ("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ProductFeedback_userId_createdAt_idx" ON "ProductFeedback" ("userId", "createdAt")`,

  // --- ErrorEvent ---
  `CREATE TABLE IF NOT EXISTS "ErrorEvent" (
      "id"          TEXT NOT NULL,
      "fingerprint" TEXT NOT NULL,
      "source"      TEXT NOT NULL DEFAULT 'server',
      "message"     TEXT NOT NULL,
      "stack"       TEXT,
      "path"        VARCHAR(512),
      "method"      TEXT,
      "kind"        TEXT,
      "userId"      TEXT,
      "workspaceId" TEXT,
      "context"     JSONB,
      "count"       INTEGER NOT NULL DEFAULT 1,
      "firstSeen"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeen"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolvedAt"  TIMESTAMP(3),
      "resolvedBy"  TEXT,
      CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ErrorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ErrorEvent_fingerprint_key" ON "ErrorEvent" ("fingerprint")`,
  `CREATE INDEX IF NOT EXISTS "ErrorEvent_resolvedAt_lastSeen_idx" ON "ErrorEvent" ("resolvedAt", "lastSeen")`,
  `CREATE INDEX IF NOT EXISTS "ErrorEvent_source_lastSeen_idx" ON "ErrorEvent" ("source", "lastSeen")`,

  // --- AdminAuditLog ---
  `CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
      "id"         TEXT NOT NULL,
      "adminId"    TEXT NOT NULL,
      "adminEmail" TEXT,
      "action"     TEXT NOT NULL,
      "targetType" TEXT,
      "targetId"   TEXT,
      "details"    JSONB,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog" ("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog" ("targetType", "targetId")`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog" ("adminId", "createdAt")`,
];

/**
 * Applies the admin DDL once per process, and at most once per database per
 * schema version. Failures are logged and swallowed: a database that is already
 * migrated, or a role without DDL rights, must not take the dashboard down, and
 * every admin read path tolerates a missing table by returning empty. A failure
 * also leaves the version sentinel unwritten, so the next cold start retries.
 */
export async function ensureAdminSchema(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      // Every statement is a separate round trip, and a cold serverless instance
      // pays all of them before it can render anything. Once a database says it
      // is at this version, one SELECT replaces the lot.
      try {
        const done = await prisma.$queryRaw<Array<{ ok: number }>>`
          SELECT 1 AS ok FROM "AppSetting"
          WHERE "key" = 'schema.admin.version' AND "value" = to_jsonb(${SCHEMA_VERSION}::text)
        `;
        if (done.length > 0) return;
      } catch {
        // No AppSetting table yet (first ever run), or no read rights. Either way
        // the DDL below is what decides.
      }

      let failed = 0;
      for (const sql of STATEMENTS) {
        try {
          await prisma.$executeRawUnsafe(sql);
        } catch (err) {
          failed += 1;
          // Error level, with the whole message: a silently skipped statement is
          // how a column goes missing and a feature looks broken instead.
          console.error(
            "[AdminSchema] statement failed:",
            sql.slice(0, 120).replace(/\s+/g, " "),
            "→",
            err instanceof Error ? err.message : err
          );
        }
      }

      if (failed === 0) {
        try {
          await prisma.$executeRaw`
            INSERT INTO "AppSetting" ("key", "value", "updatedAt", "createdAt")
            VALUES ('schema.admin.version', to_jsonb(${SCHEMA_VERSION}::text), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP
          `;
        } catch (err) {
          // Not fatal — it only means the next cold start repeats the DDL.
          console.warn(
            "[AdminSchema] could not record the schema version:",
            err instanceof Error ? err.message : err
          );
        }
      }
    })();
  }
  return bootstrapPromise;
}
