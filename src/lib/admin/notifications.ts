// ============================================================================
// ADMIN — NOTIFICATIONS SENT
//
// The history behind the composer: what was sent, to whom, and whether it was
// read. Rows the system wrote on an admin's behalf (a block, a plan change, a
// credit adjustment) sit in the same list, because the customer sees them in
// the same bell.
// ============================================================================

import prisma from "@/lib/db";
import { ensureAdminSchema } from "./schema";

export interface SentNotificationRow {
  id: string;
  userId: string;
  userEmail: string;
  tone: string;
  title: string;
  body: string | null;
  href: string | null;
  sentBy: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface SentNotificationGroup {
  /** title + body + minute bucket, so a segment send shows as one row. */
  key: string;
  title: string;
  body: string | null;
  tone: string;
  href: string | null;
  sentBy: string | null;
  sentAt: string;
  recipients: number;
  read: number;
  sample: Array<{ userId: string; email: string; read: boolean }>;
}

export async function listSentNotifications(limit = 500): Promise<SentNotificationGroup[]> {
  await ensureAdminSchema();
  const rows = await prisma.userNotification
    .findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { email: true } } },
    })
    .catch(() => []);

  const groups = new Map<string, SentNotificationGroup>();
  for (const row of rows) {
    const minute = row.createdAt.toISOString().slice(0, 16);
    const key = `${minute}|${row.sentBy ?? "system"}|${row.title}|${row.body ?? ""}`;
    const group = groups.get(key) ?? {
      key,
      title: row.title,
      body: row.body,
      tone: row.tone,
      href: row.href,
      sentBy: row.sentBy,
      sentAt: row.createdAt.toISOString(),
      recipients: 0,
      read: 0,
      sample: [],
    };
    group.recipients += 1;
    if (row.readAt) group.read += 1;
    if (group.sample.length < 5) group.sample.push({ userId: row.userId, email: row.user.email, read: row.readAt !== null });
    groups.set(key, group);
  }
  return [...groups.values()];
}
