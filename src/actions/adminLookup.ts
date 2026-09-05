// ============================================================================
// ADMIN — LOOKUPS
//
// Read-only helpers the back-office forms call while the operator types: turn a
// pasted list of emails and ids into user ids, and search accounts for a
// picker. Admin-only, like every other admin action, but nothing here writes.
// ============================================================================

"use server";

import { z } from "zod";
import prisma from "@/lib/db";
import { requireAdmin, AdminAccessError } from "@/lib/admin/auth";

export async function resolveUserIdsAction(
  entries: string[]
): Promise<{ success: true; ids: string[]; missing: string[] } | { success: false; error: string }> {
  try {
    await requireAdmin();
    const wanted = z.array(z.string().trim().min(1).max(200)).max(500).parse(entries);
    const unique = Array.from(new Set(wanted.map((e) => e.toLowerCase())));
    if (unique.length === 0) return { success: true, ids: [], missing: [] };

    const rows = await prisma.user.findMany({
      where: { OR: [{ id: { in: unique } }, { email: { in: unique, mode: "insensitive" } }] },
      select: { id: true, email: true },
    });

    const ids = new Set<string>();
    const missing: string[] = [];
    for (const entry of unique) {
      const hit = rows.find((r) => r.id.toLowerCase() === entry || r.email.toLowerCase() === entry);
      if (hit) ids.add(hit.id);
      else missing.push(entry);
    }
    return { success: true, ids: [...ids], missing };
  } catch (err) {
    if (err instanceof AdminAccessError) return { success: false, error: err.message };
    return { success: false, error: "Lookup failed." };
  }
}
