// ============================================================================
// /dashboard/admin/users/[userId] — ACCOUNT DOSSIER
//
// Everything known about one account and every lever an operator has on it:
// block, role, plan, credits, notes, a direct message, and — last, behind a
// typed confirmation — deletion.
// ============================================================================

import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/admin/users";
import { getAdminIdentity } from "@/lib/admin/auth";
import { UserDetailView } from "@/components/dashboard/admin/UserDetailView";

export const metadata = { title: "Account — admin" };

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [detail, admin] = await Promise.all([getUserDetail(userId), getAdminIdentity()]);
  if (!detail) notFound();
  return <UserDetailView user={detail} selfId={admin?.userId ?? ""} />;
}
