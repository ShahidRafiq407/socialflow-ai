// ============================================================================
// ERROR EVENTS
//
// What went wrong, grouped. Two writers: Next's `onRequestError` hook (any
// unhandled failure in a route, action or page) and the metering layer (a model
// call that errored). Both land here as one row per fingerprint with a count,
// so an incident reads as one line — "quota on gemini-3.1-pro, 412 times since
// 14:02" — instead of a wall of identical stacks.
//
// Never throws and never blocks the request that failed: a logging failure is
// logged to the console and dropped. Secrets are stripped from the context
// before it is written.
// ============================================================================

import { createHash } from "crypto";
import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ensureAdminSchema } from "./schema";

export interface ErrorReport {
  source: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  kind?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  context?: Record<string, unknown> | null;
}

const SECRET_KEY = /(key|secret|token|password|authorization|cookie|credential)/i;

/** Drops anything that looks like a credential before it is stored. */
export function redactContext(input: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[redacted]";
    } else if (typeof value === "string") {
      out[key] = value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactContext(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Same source + same first line of the message → same row. */
export function errorFingerprint(source: string, message: string, path?: string | null): string {
  const head = message.split("\n")[0].replace(/\d+/g, "#").slice(0, 200);
  return createHash("sha256").update(`${source}|${path || ""}|${head}`).digest("hex").slice(0, 32);
}

/** Sanity ceiling so one runaway loop cannot fill the table with distinct rows. */
const MAX_MESSAGE = 4_000;

export async function recordError(report: ErrorReport): Promise<void> {
  const message = (report.message || "Unknown error").slice(0, MAX_MESSAGE);
  const fingerprint = errorFingerprint(report.source, message, report.path);
  const now = new Date();

  try {
    await ensureAdminSchema();
    // Two concurrent first-sightings of the same fingerprint race on the unique
    // index; the loser retries as an update.
    const updated = await prisma.errorEvent.updateMany({
      where: { fingerprint },
      data: {
        count: { increment: 1 },
        lastSeen: now,
        message,
        stack: report.stack?.slice(0, 12_000) ?? undefined,
        path: report.path?.slice(0, 512) ?? undefined,
        method: report.method ?? undefined,
        kind: report.kind ?? undefined,
        userId: report.userId ?? undefined,
        workspaceId: report.workspaceId ?? undefined,
        context: (redactContext(report.context) ?? undefined) as Prisma.InputJsonValue | undefined,
        // A recurrence of a resolved error reopens it.
        resolvedAt: null,
        resolvedBy: null,
      },
    });
    if (updated.count > 0) return;

    await prisma.errorEvent.create({
      data: {
        fingerprint,
        source: report.source,
        message,
        stack: report.stack?.slice(0, 12_000) ?? null,
        path: report.path?.slice(0, 512) ?? null,
        method: report.method ?? null,
        kind: report.kind ?? null,
        userId: report.userId ?? null,
        workspaceId: report.workspaceId ?? null,
        context: (redactContext(report.context) ?? undefined) as Prisma.InputJsonValue | undefined,
        firstSeen: now,
        lastSeen: now,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      await prisma.errorEvent
        .updateMany({ where: { fingerprint }, data: { count: { increment: 1 }, lastSeen: now } })
        .catch(() => undefined);
      return;
    }
    // A user whose row is gone still produced a real error; keep it, unattributed.
    if (code === "P2003" && report.userId) {
      await recordError({ ...report, userId: null }).catch(() => undefined);
      return;
    }
    console.error("[errors] record failed:", err instanceof Error ? err.message : err);
  }
}

/** Fire-and-forget form for hot paths. */
export function recordErrorAsync(report: ErrorReport): void {
  void recordError(report).catch(() => undefined);
}

export interface ErrorRow {
  id: string;
  fingerprint: string;
  source: string;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  kind: string | null;
  userId: string | null;
  userEmail: string | null;
  workspaceId: string | null;
  context: unknown;
  count: number;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export async function listErrors(options: { includeResolved?: boolean; limit?: number } = {}): Promise<ErrorRow[]> {
  try {
    await ensureAdminSchema();
    const rows = await prisma.errorEvent.findMany({
      where: options.includeResolved ? undefined : { resolvedAt: null },
      orderBy: { lastSeen: "desc" },
      take: options.limit ?? 200,
      include: { user: { select: { email: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      fingerprint: row.fingerprint,
      source: row.source,
      message: row.message,
      stack: row.stack,
      path: row.path,
      method: row.method,
      kind: row.kind,
      userId: row.userId,
      userEmail: row.user?.email ?? null,
      workspaceId: row.workspaceId,
      context: row.context,
      count: row.count,
      firstSeen: row.firstSeen.toISOString(),
      lastSeen: row.lastSeen.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.resolvedBy,
    }));
  } catch {
    return [];
  }
}

export async function countOpenErrors(since?: Date): Promise<number> {
  try {
    await ensureAdminSchema();
    return await prisma.errorEvent.count({
      where: { resolvedAt: null, ...(since ? { lastSeen: { gte: since } } : {}) },
    });
  } catch {
    return 0;
  }
}
