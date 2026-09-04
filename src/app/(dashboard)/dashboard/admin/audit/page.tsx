// ============================================================================
// /dashboard/admin/audit — AUDIT LOG
//
// Every write the back office made, newest first: who, what, to which record,
// with the details the action recorded.
// ============================================================================

import { listAudit } from "@/lib/admin/audit";
import { AuditLogView } from "@/components/dashboard/admin/AuditLogView";

export const metadata = { title: "Audit log — admin" };

export default async function AdminAuditPage() {
  const rows = await listAudit(300);
  return <AuditLogView rows={rows} />;
}
