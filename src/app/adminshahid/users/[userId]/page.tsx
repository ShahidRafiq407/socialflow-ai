// ============================================================================
// /adminshahid/users/[userId] — ACCOUNT DOSSIER
// ============================================================================

import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/admin/users";
import { getAdminIdentity } from "@/lib/admin/auth";
import { UserDetailView } from "@/components/dashboard/admin/UserDetailView";

export const metadata = { title: "User Account — Admin Control Plane" };

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [detail, admin] = await Promise.all([getUserDetail(userId), getAdminIdentity()]);
  if (!detail) notFound();
  return <UserDetailView user={detail} selfId={admin?.userId ?? ""} />;
}
