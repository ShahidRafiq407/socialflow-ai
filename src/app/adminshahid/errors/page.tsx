// ============================================================================
// /adminshahid/errors — SYSTEM ERRORS
// ============================================================================

import { listErrors } from "@/lib/admin/errors";
import { ErrorsView } from "@/components/dashboard/admin/ErrorsView";

export const metadata = { title: "Error Center — Admin Control Plane" };

export default async function AdminErrorsPage({ searchParams }: { searchParams?: Promise<{ all?: string }> }) {
  const params = (await searchParams) || {};
  const includeResolved = params.all === "1";
  const errors = await listErrors({ includeResolved, limit: 300 });
  return <ErrorsView errors={errors} includeResolved={includeResolved} />;
}
