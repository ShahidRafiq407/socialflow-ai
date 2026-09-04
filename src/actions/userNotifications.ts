// ============================================================================
// USER NOTIFICATIONS — SERVER ACTIONS (the user's side)
//
// Messages addressed to one person by an admin, or by the system on their
// behalf (a plan change, a credit adjustment). Read state is a column, unlike
// the workspace feed and the system broadcasts, because the sender wants to
// know whether it was seen.
// ============================================================================

"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { ensureAdminSchema } from "@/lib/admin/schema";
import type { NotificationTone } from "@/actions/notifications";

export interface UserNotificationItem {
  id: string;
  tone: NotificationTone;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
  at: string;
  read: boolean;
}

const TONES: NotificationTone[] = ["error", "warning", "success", "info"];

export async function getUserNotifications(limit = 30): Promise<UserNotificationItem[]> {
  const { userId } = await auth();
  if (!userId) return [];
  try {
    await ensureAdminSchema();
    const rows = await prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      tone: TONES.includes(row.tone as NotificationTone) ? (row.tone as NotificationTone) : "info",
      title: row.title,
      body: row.body || "",
      href: row.href || "",
      linkLabel: row.linkLabel || "",
      at: row.createdAt.toISOString(),
      read: row.readAt !== null,
    }));
  } catch {
    return [];
  }
}

export async function markUserNotificationsRead(ids?: string[]): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) return { success: false };
  try {
    await ensureAdminSchema();
    await prisma.userNotification.updateMany({
      where: { userId, readAt: null, ...(ids && ids.length > 0 ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}
