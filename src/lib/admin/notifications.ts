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

/** Recipient chips shown under a send. The counts beside them are exact regardless. */
const SAMPLES_PER_GROUP = 5;

/** What Postgres hands back for one send. */
interface RawGroup {
  /** `2026-09-05T14:31` — the minute bucket, as text so the two queries join exactly. */
  bucketKey: string;
  bucketAt: Date;
  sentBy: string | null;
  title: string;
  body: string | null;
  tone: string;
  href: string | null;
  recipients: number;
  read: number;
  sentAt: Date;
}

interface RawSample {
  bucketKey: string;
  sentBy: string | null;
  title: string;
  body: string | null;
  tone: string;
  href: string | null;
  userId: string;
  email: string;
  read: boolean;
}

type GroupIdentity = Pick<RawGroup, "bucketKey" | "sentBy" | "title" | "body" | "tone" | "href">;

/**
 * The identity of a send, stable across both queries.
 *
 * JSON rather than a `|`-joined string: a title or body containing the separator
 * would otherwise let two different sends collide into one row.
 */
function groupKey(r: GroupIdentity): string {
  return JSON.stringify([r.bucketKey, r.sentBy ?? "", r.tone, r.title, r.body ?? "", r.href ?? ""]);
}

/**
 * The send history, grouped in Postgres.
 *
 * `limit` counts SENDS, not recipient rows — which is the whole point. This used to
 * take the newest 500 `UserNotification` rows and group them in JavaScript, and a
 * broadcast writes one row per recipient: a single "Everyone" send to 5,000 accounts
 * filled the entire window, so the page showed that one send as having 500 recipients
 * (wrong by an order of magnitude, and the read ratio with it) and every send before it
 * vanished from the history altogether. The bigger the audience, the less of the truth
 * the screen could show.
 *
 * So the aggregation happens where the rows are. Grouping on the minute bucket plus
 * title, body, tone, href and sender matches what one call to the composer writes;
 * `tone` and `href` join the key because they are per-send too, and taking them from
 * whichever row happened to be first meant two sends that differed only by link were
 * merged and shown with one of the two links.
 *
 * The recipient chips come back in a second pass bounded to the minutes the first pass
 * returned. They are decoration — `recipients` and `read` are exact counts over every
 * row, so a group whose chips were not fetched still reports its true size.
 */
export async function listSentNotifications(limit = 200): Promise<SentNotificationGroup[]> {
  await ensureAdminSchema();

  const groups = await prisma
    .$queryRaw<RawGroup[]>`
      WITH sends AS (
        SELECT date_trunc('minute', "createdAt") AS "bucketAt",
               "sentBy", "title", "body", "tone", "href",
               COUNT(*)::int        AS "recipients",
               COUNT("readAt")::int AS "read",
               MAX("createdAt")     AS "sentAt"
          FROM "UserNotification"
         GROUP BY date_trunc('minute', "createdAt"), "sentBy", "title", "body", "tone", "href"
      )
      SELECT to_char("bucketAt", 'YYYY-MM-DD"T"HH24:MI') AS "bucketKey",
             "bucketAt", "sentBy", "title", "body", "tone", "href",
             "recipients", "read", "sentAt"
        FROM sends
       ORDER BY "bucketAt" DESC, "sentAt" DESC
       LIMIT ${limit}
    `
    .catch(() => [] as RawGroup[]);

  if (groups.length === 0) return [];

  // The oldest minute the page will show, so the sample pass reads a range of the
  // createdAt index instead of every notification ever sent.
  const since = groups.reduce<Date>((min, g) => (g.bucketAt < min ? g.bucketAt : min), groups[0].bucketAt);

  const samples = await prisma
    .$queryRaw<RawSample[]>`
      WITH ranked AS (
        SELECT to_char(date_trunc('minute', n."createdAt"), 'YYYY-MM-DD"T"HH24:MI') AS "bucketKey",
               n."sentBy", n."title", n."body", n."tone", n."href",
               n."userId", u."email", (n."readAt" IS NOT NULL) AS "read",
               ROW_NUMBER() OVER (
                 PARTITION BY date_trunc('minute', n."createdAt"),
                              n."sentBy", n."title", n."body", n."tone", n."href"
                 ORDER BY n."createdAt" ASC, n."id" ASC
               ) AS rn
          FROM "UserNotification" n
          JOIN "User" u ON u."id" = n."userId"
         WHERE n."createdAt" >= ${since}
      )
      SELECT "bucketKey", "sentBy", "title", "body", "tone", "href", "userId", "email", "read"
        FROM ranked
       WHERE rn <= ${SAMPLES_PER_GROUP}
    `
    .catch(() => [] as RawSample[]);

  const byKey = new Map<string, SentNotificationGroup["sample"]>();
  for (const row of samples) {
    const key = groupKey(row);
    const list = byKey.get(key) ?? [];
    list.push({ userId: row.userId, email: row.email, read: row.read });
    byKey.set(key, list);
  }

  return groups.map((g) => {
    const key = groupKey(g);
    return {
      key,
      title: g.title,
      body: g.body,
      tone: g.tone,
      href: g.href,
      sentBy: g.sentBy,
      sentAt: g.sentAt.toISOString(),
      recipients: g.recipients,
      read: g.read,
      sample: byKey.get(key) ?? [],
    };
  });
}
