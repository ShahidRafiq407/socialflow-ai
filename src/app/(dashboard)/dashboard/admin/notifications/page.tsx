// ============================================================================
// /dashboard/admin/notifications — NOTIFY
//
// Send to a segment (everyone, a plan, all paid) or to specific accounts, and
// see what has been sent and whether it was read. Broadcasts to every
// workspace without an address (SystemNotice) still live in the bell's System
// tab composer; this is the addressed kind.
// ============================================================================

import { listSentNotifications } from "@/lib/admin/notifications";
import { NotificationComposer } from "@/components/dashboard/admin/NotificationComposer";

export const metadata = { title: "Notify — admin" };

export default async function AdminNotificationsPage() {
  const sent = await listSentNotifications();
  return <NotificationComposer sent={sent} />;
}
