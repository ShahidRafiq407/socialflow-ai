// ============================================================================
// /dashboard/admin/errors — SYSTEM ERRORS
//
// Server errors, grouped by fingerprint (source + message + path), with a
// count and first/last seen. Resolving hides the group until it recurs.
// ============================================================================

import { listErrors } from "@/lib/admin/errors";
import { ErrorsView } from "@/components/dashboard/admin/ErrorsView";

export const metadata = { title: "Errors — admin" };

export default async function AdminErrorsPage({ searchParams }: { searchParams?: Promise<{ all?: string }> }) {
  const params = (await searchParams) || {};
  const includeResolved = params.all === "1";
  const errors = await listErrors({ includeResolved, limit: 300 });
  return <ErrorsView errors={errors} includeResolved={includeResolved} />;
}
