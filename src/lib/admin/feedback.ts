// ============================================================================
// ADMIN — FEEDBACK QUEUE
//
// Two things the same person can send, in one list.
//
//   chat    — a thumbs up or down under an assistant answer, with the model that
//             gave it and an excerpt of what it said.
//   general — anything typed into the feedback box in the dashboard header: a
//             bug, an idea, a billing question, a compliment.
//
// They stay in separate tables and are merged here. A chat vote provably has a
// message, a session, a workspace and a ±1; general feedback has none of those
// guaranteed. The satisfaction figure is built on the chat votes only, for that
// reason — mixing in rows that were never asked to rate anything would make the
// one number the admin trusts mean nothing.
// ============================================================================

import prisma from "@/lib/db";
import { ensureAdminSchema } from "./schema";

export type FeedbackKind = "chat" | "general";
export type FeedbackFilter = "new" | "down" | "all" | "general";

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  /** 1, -1, or null when nobody was asked to rate anything. */
  rating: number | null;
  /** What the user actually wrote. The whole row, for a general one. */
  comment: string | null;
  /** Chat rows only. */
  model: string | null;
  messageExcerpt: string | null;
  /** General rows only: which bucket they picked, and the screen they were on. */
  category: string | null;
  path: string | null;
  status: string | null;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  userId: string;
  userEmail: string;
  /** Null on a general row — there is no chat session behind it. */
  sessionId: string | null;
  workspaceId: string | null;
}

export interface FeedbackQueue {
  rows: FeedbackRow[];
  summary: {
    /** Assistant votes, 30 days. */
    up30d: number;
    down30d: number;
    /** Written feedback, 30 days, and how much of it nobody has triaged. */
    general30d: number;
    generalNew: number;
    /** Everything awaiting triage, both kinds — the number on the sidebar badge. */
    newCount: number;
    byModel: Array<{ model: string; up: number; down: number }>;
  };
}

/** Rows awaiting triage across both tables. The sidebar badge reads this too. */
export async function countNewFeedback(): Promise<number> {
  const [chat, general] = await Promise.all([
    prisma.chatFeedback.count({ where: { status: null } }).catch(() => 0),
    prisma.productFeedback.count({ where: { status: null } }).catch(() => 0),
  ]);
  return chat + general;
}

export async function getFeedbackQueue(
  options: { filter?: FeedbackFilter; limit?: number } = {}
): Promise<FeedbackQueue> {
  await ensureAdminSchema();
  const filter = options.filter ?? "new";
  const limit = options.limit ?? 200;
  const since = new Date(Date.now() - 30 * 86_400_000);

  // "Thumbs down" is a question about the assistant, so it excludes written
  // feedback; "general" is the mirror of it. Both other filters show both kinds.
  const wantsChat = filter !== "general";
  const wantsGeneral = filter !== "down";

  const chatWhere = filter === "new" ? { status: null } : filter === "down" ? { rating: -1 } : undefined;
  const generalWhere = filter === "new" ? { status: null } : undefined;

  const [chatRows, generalRows, recent, generalRecent, chatNew, generalNew] = await Promise.all([
    wantsChat
      ? prisma.chatFeedback
          .findMany({
            where: chatWhere,
            orderBy: { createdAt: "desc" },
            take: limit,
            include: { user: { select: { email: true } } },
          })
          .catch(() => [])
      : Promise.resolve([]),
    wantsGeneral
      ? prisma.productFeedback
          .findMany({
            where: generalWhere,
            orderBy: { createdAt: "desc" },
            take: limit,
            include: { user: { select: { email: true } } },
          })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.chatFeedback
      .findMany({ where: { createdAt: { gte: since } }, select: { rating: true, model: true } })
      .catch(() => []),
    prisma.productFeedback.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
    prisma.chatFeedback.count({ where: { status: null } }).catch(() => 0),
    prisma.productFeedback.count({ where: { status: null } }).catch(() => 0),
  ]);

  const byModel = new Map<string, { up: number; down: number }>();
  let up30d = 0;
  let down30d = 0;
  // Chat votes only, deliberately: this loop's `else` counts anything that is not
  // positive as a down-vote, which is true of a ±1 and false of everything else.
  for (const r of recent) {
    const key = r.model || "unknown";
    const bucket = byModel.get(key) ?? { up: 0, down: 0 };
    if (r.rating > 0) {
      bucket.up += 1;
      up30d += 1;
    } else {
      bucket.down += 1;
      down30d += 1;
    }
    byModel.set(key, bucket);
  }

  const rows: FeedbackRow[] = [
    ...chatRows.map((r) => ({
      id: r.id,
      kind: "chat" as const,
      rating: r.rating,
      comment: r.comment,
      model: r.model,
      messageExcerpt: r.messageExcerpt,
      category: null,
      path: null,
      status: r.status,
      adminNote: r.adminNote,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      userId: r.userId,
      userEmail: r.user.email,
      sessionId: r.sessionId,
      workspaceId: r.workspaceId,
    })),
    ...generalRows.map((r) => ({
      id: r.id,
      kind: "general" as const,
      rating: r.sentiment ?? null,
      comment: r.message,
      model: null,
      messageExcerpt: null,
      category: r.category,
      path: r.path,
      status: r.status,
      adminNote: r.adminNote,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      userId: r.userId,
      userEmail: r.user.email,
      sessionId: null,
      workspaceId: r.workspaceId,
    })),
  ]
    // Both queries took `limit` of their own, so the merged list is sorted and cut
    // again — otherwise a busy day of chat votes could hide every written message.
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);

  return {
    rows,
    summary: {
      up30d,
      down30d,
      general30d: generalRecent,
      generalNew,
      newCount: chatNew + generalNew,
      byModel: [...byModel.entries()]
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.down + b.up - (a.down + a.up)),
    },
  };
}
