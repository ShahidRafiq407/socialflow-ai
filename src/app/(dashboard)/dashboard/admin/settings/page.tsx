// ============================================================================
// /dashboard/admin/settings — PRODUCT SWITCHES
//
// Feature flags and the affiliate program's money terms. Everything here is a
// setting row that every instance re-reads within its cache window.
// ============================================================================

import { ensureRuntimeConfig, getAffiliateTerms, getFlags, listSettingRows } from "@/lib/admin/runtimeConfig";
import { SettingsManager } from "@/components/dashboard/admin/SettingsManager";

export const metadata = { title: "Settings — admin" };

export default async function AdminSettingsPage() {
  await ensureRuntimeConfig();
  return <SettingsManager flags={getFlags()} terms={getAffiliateTerms()} rows={listSettingRows()} />;
}
