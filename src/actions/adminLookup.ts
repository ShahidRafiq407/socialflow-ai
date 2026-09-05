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
    // Dedupe case-insensitively, but keep the text as it was pasted. A Clerk id
    // is case-sensitive, so `id: { in: [...] }` over a lowercased list never
    // matched one — every pasted id came back as "not found" — and the entries
    // echoed in `missing` were a mangled version of what the operator typed.
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const entry of wanted) {
      const key = entry.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
    }
    if (unique.length === 0) return { success: true, ids: [], missing: [] };

    // Both spellings, so the email arm matches whether or not the connector
    // honours `mode: "insensitive"` for `in`.
    const emailCandidates = Array.from(new Set(unique.flatMap((e) => [e, e.toLowerCase()])));
    const rows = await prisma.user.findMany({
      where: { OR: [{ id: { in: unique } }, { email: { in: emailCandidates, mode: "insensitive" } }] },
      select: { id: true, email: true },
    });

    const ids = new Set<string>();
    const missing: string[] = [];
    for (const entry of unique) {
      const lower = entry.toLowerCase();
      const hit = rows.find((r) => r.id === entry || r.email.toLowerCase() === lower);
      if (hit) ids.add(hit.id);
      else missing.push(entry);
    }
    return { success: true, ids: [...ids], missing };
  } catch (err) {
    if (err instanceof AdminAccessError) return { success: false, error: err.message };
    return { success: false, error: "Lookup failed." };
  }
}
