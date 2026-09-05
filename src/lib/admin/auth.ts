// ============================================================================
// WHO IS AN ADMIN
//
// Two sources, either is enough:
//
//   ADMIN_USERS   — an env allowlist of Clerk user ids or emails. This is the
//                   bootstrap: with a fresh database nobody has a role yet, and
//                   the person who controls the deployment has to be able to
//                   open the door. SYSTEM_NOTICE_ADMINS and AFFILIATE_ADMINS are
//                   honoured too, so the two older allowlists keep working.
//   User.role     — ADMIN rows granted from the dashboard by an existing admin.
//
// The answer is cached per request (React `cache`), because the layout, the
// sidebar and the page all ask, and one Clerk round trip per page is enough.
// ============================================================================

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { ensureAdminSchema } from "./schema";

function envAllowlist(): string[] {
  const raw = [
    process.env.ADMIN_USERS,
    process.env.SYSTEM_NOTICE_ADMINS,
    process.env.AFFILIATE_ADMINS,
  ]
    .filter(Boolean)
    .join(",");
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

async function currentEmails(): Promise<string[]> {
  const user = await currentUser().catch(() => null);
  return (user?.emailAddresses || [])
    .map((entry) => (entry?.emailAddress || "").toLowerCase())
    .filter(Boolean);
}

/**
 * True when `userId` (the signed-in user) may open the back office. Never
 * throws: a database that cannot be read simply answers "no" unless the env
 * allowlist says otherwise.
 */
export const isAdminUser = cache(async function isAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false;

  const allowed = envAllowlist();
  if (allowed.includes(userId.toLowerCase())) return true;

  try {
    await ensureAdminSchema();
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
    if (row?.role === "ADMIN") return true;
    if (row?.email && allowed.includes(row.email.toLowerCase())) {
      await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } }).catch(() => {});
      return true;
    }
  } catch {
    // Fall through to the email check.
  }

  if (allowed.length === 0) return false;
  const emails = await currentEmails();
  const matched = emails.some((email) => allowed.includes(email));
  if (matched) {
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } }).catch(() => {});
    return true;
  }
  return false;
});

export interface AdminIdentity {
  userId: string;
  email: string | null;
}

/** The signed-in admin, or null. */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const { userId } = await auth();
  if (!userId) return null;
  if (!(await isAdminUser(userId))) return null;
  const emails = await currentEmails();
  return { userId, email: emails[0] ?? null };
}

/** For server actions: the admin, or a thrown refusal. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getAdminIdentity();
  if (!admin) throw new AdminAccessError();
  return admin;
}

export class AdminAccessError extends Error {
  constructor() {
    super("Only an administrator can do that.");
    this.name = "AdminAccessError";
  }
}

/** True when the env allowlist names this user — such a user cannot be demoted. */
export function isEnvAdmin(userId: string, email?: string | null): boolean {
  const allowed = envAllowlist();
  return allowed.includes(userId.toLowerCase()) || (!!email && allowed.includes(email.toLowerCase()));
}
