// ============================================================================
// /adminshahid/audit — AUDIT LOG
// ============================================================================

import { listAudit } from "@/lib/admin/audit";
import { AuditLogView } from "@/components/dashboard/admin/AuditLogView";

export const metadata = { title: "Audit Log — Admin Control Plane" };

export default async function AdminAuditPage() {
  const rows = await listAudit(300);
  return <AuditLogView rows={rows} />;
}
