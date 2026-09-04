// ============================================================================
// ADMIN AUDIT LOG
//
// Every write an admin makes goes through here. Append-only, never blocks the
// action it records: a log write that fails is logged to the console and the
// admin's change still lands, because an unlogged fix beats an unfixed problem.
// Secrets are never written — callers pass masked values.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { AdminIdentity } from "./auth";

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

export async function recordAudit(admin: AdminIdentity, entry: AuditEntry): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.userId,
        adminEmail: admin.email,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[admin-audit] write failed:", entry.action, err);
  }
}

export interface AuditRow {
  id: string;
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: unknown;
  createdAt: string;
}

export async function listAudit(limit = 100, targetId?: string): Promise<AuditRow[]> {
  try {
    const rows = await prisma.adminAuditLog.findMany({
      where: targetId ? { targetId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      adminId: row.adminId,
      adminEmail: row.adminEmail,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
