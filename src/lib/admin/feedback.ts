// ============================================================================
// ADMIN — CHAT FEEDBACK QUEUE
//
// Every thumbs up or down a user left under an assistant answer, with the model
// that answered and an excerpt of what it said. The down-votes are the queue;
// the up-votes are the control group that says whether a model change helped.
// ============================================================================

import prisma from "@/lib/db";
import { ensureAdminSchema } from "./schema";

export interface FeedbackRow {
  id: string;
  rating: number;
  comment: string | null;
  model: string | null;
  messageExcerpt: string | null;
  status: string | null;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  userId: string;
  userEmail: string;
  sessionId: string;
  workspaceId: string;
}

export interface FeedbackQueue {
  rows: FeedbackRow[];
  summary: {
    up30d: number;
    down30d: number;
    newCount: number;
    byModel: Array<{ model: string; up: number; down: number }>;
  };
}

export async function getFeedbackQueue(options: { filter?: "new" | "down" | "all"; limit?: number } = {}): Promise<FeedbackQueue> {
  await ensureAdminSchema();
  const filter = options.filter ?? "new";
  const since = new Date(Date.now() - 30 * 86_400_000);

  const where =
    filter === "new" ? { status: null } : filter === "down" ? { rating: -1 } : undefined;

  const [rows, recent, newCount] = await Promise.all([
    prisma.chatFeedback
      .findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options.limit ?? 200,
        include: { user: { select: { email: true } } },
      })
      .catch(() => []),
    prisma.chatFeedback
      .findMany({ where: { createdAt: { gte: since } }, select: { rating: true, model: true } })
      .catch(() => []),
    prisma.chatFeedback.count({ where: { status: null } }).catch(() => 0),
  ]);

  const byModel = new Map<string, { up: number; down: number }>();
  let up30d = 0;
  let down30d = 0;
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

  return {
    rows: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      model: r.model,
      messageExcerpt: r.messageExcerpt,
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
    summary: {
      up30d,
      down30d,
      newCount,
      byModel: [...byModel.entries()]
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.down + b.up - (a.down + a.up)),
    },
  };
}
