// ============================================================================
// OUTCOME STORE — the DB read/write behind the content-outcome ledger
//
// Kept deliberately separate from ./memory (which pulls in the embeddings/vertex
// graph): outcome events are never embedded and never recalled semantically, so
// the publish and delete hot paths that record them should not drag that graph
// in. Every event is one append-only Memory row under OUTCOME_CATEGORY — no
// read-modify-write, so concurrent publishes can never clobber each other's
// counts. Aggregation happens at read time in the pure ./outcomes module.
//
// Both functions are best-effort and never throw: recording an outcome must not
// be able to fail a real publish or delete, and a cold ledger must not break a
// chat turn.
// ============================================================================

import prisma from "@/lib/db";
import { ensureControllerSchema } from "./schema";
import { getChatSettings } from "./settings";
import {
  OUTCOME_CATEGORY,
  buildOutcomeContent,
  parseOutcomeEvent,
  type OutcomeEvent,
} from "./outcomes";

/** The most recent events aggregated per turn — a generous window, bounded so a
 *  long-lived workspace's read stays cheap. Older events age out of the sample,
 *  which is the honest behaviour: recent taste beats ancient taste. */
export const MAX_OUTCOME_EVENTS = 500;

/**
 * Appends one terminal outcome (a publish kept, a draft discarded). No-ops when
 * the event carries nothing learnable, or when the workspace has memory turned
 * off — a user who disabled memory expects nothing to be stored, and this ledger
 * is part of that layer. Detached and swallowed: never delays or fails the
 * caller's real write.
 */
export async function recordOutcome(params: {
  workspaceId: string;
  event: OutcomeEvent;
  sessionId?: string | null;
}): Promise<{ saved: boolean }> {
  const content = buildOutcomeContent(params.event);
  if (!content || !params.workspaceId) return { saved: false };

  try {
    const settings = await getChatSettings(params.workspaceId);
    if (!settings.memoryEnabled) return { saved: false };

    await ensureControllerSchema();
    await (prisma as any).memory.create({
      data: {
        workspaceId: params.workspaceId,
        category: OUTCOME_CATEGORY,
        content,
        importance: 1,
        pinned: false,
        source: "auto",
        sessionId: params.sessionId ?? null,
      },
    });
    return { saved: true };
  } catch (err) {
    console.warn("[OutcomeStore] recordOutcome failed (non-fatal):", err instanceof Error ? err.message : err);
    return { saved: false };
  }
}

/**
 * Reads the recent outcome events for a workspace, newest first, parsed back
 * into structured events. Aggregation into a keep/discard track record is the
 * pure module's job (summarizeOutcomes / formatOutcomesForPrompt).
 */
export async function loadOutcomeEvents(
  workspaceId: string,
  max: number = MAX_OUTCOME_EVENTS
): Promise<OutcomeEvent[]> {
  if (!workspaceId) return [];
  try {
    await ensureControllerSchema();
    const rows = await (prisma as any).memory.findMany({
      where: { workspaceId, category: OUTCOME_CATEGORY },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, max),
      select: { content: true },
    });
    const events: OutcomeEvent[] = [];
    for (const row of rows || []) {
      const event = parseOutcomeEvent(String(row?.content || ""));
      if (event) events.push(event);
    }
    return events;
  } catch (err) {
    console.warn("[OutcomeStore] loadOutcomeEvents failed (non-fatal):", err instanceof Error ? err.message : err);
    return [];
  }
}
