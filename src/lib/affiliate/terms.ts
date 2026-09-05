// ============================================================================
// AFFILIATE TERMS IN FORCE (server only)
//
// The code defaults in ./config, with the admin's changes from the back office
// applied on top. Separate from config.ts so that file stays importable from
// "use client" components.
// ============================================================================

import { ensureRuntimeConfig, getAffiliateTerms } from "@/lib/admin/runtimeConfig";
import { AFFILIATE, type AffiliateTermsView } from "./config";

export async function liveAffiliateTerms(): Promise<AffiliateTermsView> {
  await ensureRuntimeConfig();
  const live = getAffiliateTerms();
  return {
    commissionPercent: live.commissionPercent,
    flatCommissionCents: live.flatCommissionCents,
    minPayoutCents: live.minPayoutCents,
    minCreditConversionCents: AFFILIATE.minCreditConversionCents,
    lockDays: live.lockDays,
  };
}
