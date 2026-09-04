// ============================================================================
// SYSTEM NOTICES — SERVER ACTIONS
//
// Every other feed in this app is scoped to a workspace. This one is not: it is
// what the people running the product say to everyone, and it has to reach a
// user who has just created their first workspace as surely as one who has ten.
//
// Three jobs:
//
//   getSystemNotices    — what is live right now, plus whether you may publish
//   publishSystemNotice — an administrator broadcasting a message
//   retractSystemNotice — unpublishing one, which is how it is taken back
//
// Who counts as an administrator is an env allowlist, not a database column: the
// answer belongs to whoever controls the deployment, not to a row that anybody
// with write access could add themselves to. With the allowlist unset, nobody
// can publish and the tab is simply always empty — inert, not open.
//
// Reads are guarded the same way the workspace notification feed is. A notice is
// the least important thing on the screen, so a database it cannot reach costs
// an empty tab and nothing more.
// ============================================================================

"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import prisma from "@/lib/db";
import type { NotificationTone } from "@/actions/notifications";

export interface SystemNoticeItem {
  id: string;
  tone: NotificationTone;
  title: string;
  body: string;
  /** Empty when the notice is text only. */
  href: string;
  linkLabel: string;
  /** ISO — the moment it went live, which is what "2h ago" is measured from. */
  at: string;
}

export interface SystemNoticeFeed {
  items: SystemNoticeItem[];
  /** True only for an allowlisted user; the composer renders on this alone. */
  canPublish: boolean;
}

/** Enough to scroll, few enough that the panel stays a panel. */
const MAX_ITEMS = 20;

const TONES: NotificationTone[] = ["error", "warning", "success", "info"];

/** The column is a string, so a hand-written row cannot break the icon lookup. */
function toTone(raw: string | null | undefined): NotificationTone {
  const value = (raw || "").toLowerCase() as NotificationTone;
  return TONES.includes(value) ? value : "info";
}

/**
 * Who may broadcast, from the environment:
 *
 *   SYSTEM_NOTICE_ADMINS="user_2abc…,ops@example.com"
 *
 * Clerk user ids and email addresses both work, so an operator can be added
 * without looking up an id first.
 */
function allowlist(): string[] {
  return (process.env.SYSTEM_NOTICE_ADMINS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

async function isBroadcastAdmin(userId: string): Promise<boolean> {
  const allowed = allowlist();
  if (allowed.length === 0) return false;
  if (allowed.includes(userId.toLowerCase())) return true;

  // Only reached when the allowlist holds emails rather than ids, so the Clerk
  // round trip is not on the path of a normal user's bell.
  const user = await currentUser().catch(() => null);
  return (user?.emailAddresses || []).some((entry) => {
    const email = (entry?.emailAddress || "").toLowerCase();
    return Boolean(email) && allowed.includes(email);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getSystemNotices(): Promise<SystemNoticeFeed> {
  const { userId } = await auth();
  if (!userId) return { items: [], canPublish: false };

  const now = new Date();

  // The catch is what keeps the bell working before this table has been pushed:
  // an unknown relation is an error, and an error here must not take the
  // Alerts and Updates tabs down with it.
  const rows = await prisma.systemNotice
    .findMany({
      where: {
        published: true,
        audience: "ALL",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { startsAt: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        tone: true,
        title: true,
        body: true,
        href: true,
        linkLabel: true,
        startsAt: true,
      },
    })
    .catch(() => []);

  const canPublish = await isBroadcastAdmin(userId).catch(() => false);

  return {
    items: rows.map((row) => ({
      id: row.id,
      tone: toTone(row.tone),
      title: row.title,
      body: row.body || "",
      href: row.href || "",
      linkLabel: row.linkLabel || "",
      at: row.startsAt.toISOString(),
    })),
    canPublish,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

const publishSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give the message a title of at least 3 characters.")
    .max(200, "Title is too long (max 200 characters)."),
  body: z.string().trim().max(2000, "Message is too long (max 2000 characters).").optional(),
  tone: z.enum(["info", "success", "warning", "error"]).optional(),
  href: z.string().trim().max(512, "Link is too long.").optional(),
  linkLabel: z.string().trim().max(80, "Link label is too long.").optional(),
  /** 0 or absent means it stays until it is retracted. */
  expiresInDays: z.number().int().min(0).max(365).optional(),
});

/**
 * A notice may point at a page in the app or at an absolute URL, and nothing
 * else — no `javascript:`, no protocol-relative host that reads like a path.
 */
function normalizeHref(raw: string): { ok: true; href: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: true, href: "" };
  if (value.startsWith("//")) {
    return { ok: false, error: "Use a full https:// URL or a path starting with /." };
  }
  if (value.startsWith("/")) return { ok: true, href: value };
  if (/^https?:\/\//i.test(value) && z.string().url().safeParse(value).success) {
    return { ok: true, href: value };
  }
  return { ok: false, error: "That link is not a valid URL or /path." };
}

export async function publishSystemNotice(input: {
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "error";
  href?: string;
  linkLabel?: string;
  expiresInDays?: number;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  if (!(await isBroadcastAdmin(userId).catch(() => false))) {
    return { success: false, error: "Only an administrator can broadcast a system message." };
  }

  const parsed = publishSchema.safeParse({
    title: input?.title ?? "",
    body: input?.body ?? "",
    tone: input?.tone ?? "info",
    href: input?.href ?? "",
    linkLabel: input?.linkLabel ?? "",
    expiresInDays: input?.expiresInDays ?? 0,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid values." };
  }

  const link = normalizeHref(parsed.data.href || "");
  if (!link.ok) return { success: false, error: link.error };

  const days = parsed.data.expiresInDays || 0;
  const endsAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  try {
    const notice = await prisma.systemNotice.create({
      data: {
        tone: parsed.data.tone || "info",
        title: parsed.data.title,
        body: parsed.data.body || null,
        href: link.href || null,
        linkLabel: link.href ? parsed.data.linkLabel || null : null,
        audience: "ALL",
        // Published straight away: the composer is behind the allowlist, and a
        // draft nobody can see is a second screen for no gain.
        published: true,
        startsAt: new Date(),
        endsAt,
        createdBy: userId,
      },
      select: { id: true },
    });
    return { success: true, id: notice.id };
  } catch (err) {
    console.error("[publishSystemNotice]", err);
    return {
      success: false,
      error: "The message could not be published. The system_notice table may not exist yet.",
    };
  }
}

/**
 * Takes a notice back. Unpublishing rather than deleting, so the record of what
 * was said to everyone survives being wrong.
 */
export async function retractSystemNotice(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  if (!(await isBroadcastAdmin(userId).catch(() => false))) {
    return { success: false, error: "Only an administrator can retract a system message." };
  }

  const noticeId = typeof id === "string" ? id.trim() : "";
  if (!noticeId) return { success: false, error: "No message selected." };

  try {
    await prisma.systemNotice.update({
      where: { id: noticeId },
      data: { published: false },
    });
    return { success: true };
  } catch {
    return { success: false, error: "That message could not be retracted." };
  }
}
