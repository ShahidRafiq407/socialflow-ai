// ============================================================================
// /adminshahid/settings — PLATFORM SWITCHES
// ============================================================================

import { ensureRuntimeConfig, getAffiliateTerms, getFlags, listSettingRows } from "@/lib/admin/runtimeConfig";
import { SettingsManager } from "@/components/dashboard/admin/SettingsManager";

export const metadata = { title: "Settings — Admin Control Plane" };

export default async function AdminSettingsPage() {
  await ensureRuntimeConfig();
  return <SettingsManager flags={getFlags()} terms={getAffiliateTerms()} rows={listSettingRows()} />;
}
