// ============================================================================
// /adminshahid/notifications — BROADCAST / NOTIFY
// ============================================================================

import { listSentNotifications } from "@/lib/admin/notifications";
import { NotificationComposer } from "@/components/dashboard/admin/NotificationComposer";

export const metadata = { title: "Notify — Admin Control Plane" };

export default async function AdminNotificationsPage() {
  const sent = await listSentNotifications();
  return <NotificationComposer sent={sent} />;
}
