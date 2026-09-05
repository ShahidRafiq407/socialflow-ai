// ============================================================================
// /dashboard/admin/plans — PLAN ENTITLEMENTS
//
// Every number the plans are sold with, editable per tier. The code defaults
// are shown beside the live values so a change is always a diff, and "reset"
// clears the override rather than typing the old number back in.
// ============================================================================

import { ensureRuntimeConfig, getPlanOverrides } from "@/lib/admin/runtimeConfig";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  PLAN_TIERS,
  basePlanConfig,
  basePlanEntitlements,
  getEntitlements,
  getPlanConfig,
} from "@/lib/billing/plans";
import { PlansEditor, type PlanSnapshot } from "@/components/dashboard/admin/PlansEditor";

export const metadata = { title: "Plans — admin" };

export default async function AdminPlansPage() {
  await ensureRuntimeConfig();
  const overrides = getPlanOverrides();

  const plans: PlanSnapshot[] = PLAN_TIERS.map((tier) => {
    const live = getEntitlements(tier);
    const base = basePlanEntitlements(tier);
    const liveConfig = getPlanConfig(tier);
    const baseConfig = basePlanConfig(tier);
    return {
      tier,
      override: overrides[tier] ?? null,
      live: {
        name: liveConfig.name,
        tagline: liveConfig.tagline,
        priceMonthly: liveConfig.priceMonthly,
        priceYearly: liveConfig.priceYearly,
        monthlyCredits: live.monthlyCredits,
        workspaces: live.workspaces,
        socialAccountsPerWorkspace: live.socialAccountsPerWorkspace,
        storageMb: live.storageMb,
        analyticsRetentionDays: live.analyticsRetentionDays,
        seats: live.seats,
        chatMaxToolLoops: live.chatMaxToolLoops,
        imageQuality: live.imageQuality,
        canBuyTopUps: live.canBuyTopUps,
        features: [...live.features],
        caps: { ...live.caps },
      },
      base: {
        name: baseConfig.name,
        tagline: baseConfig.tagline,
        priceMonthly: baseConfig.priceMonthly,
        priceYearly: baseConfig.priceYearly,
        monthlyCredits: base.monthlyCredits,
        workspaces: base.workspaces,
        socialAccountsPerWorkspace: base.socialAccountsPerWorkspace,
        storageMb: base.storageMb,
        analyticsRetentionDays: base.analyticsRetentionDays,
        seats: base.seats,
        chatMaxToolLoops: base.chatMaxToolLoops,
        imageQuality: base.imageQuality,
        canBuyTopUps: base.canBuyTopUps,
        features: [...base.features],
        caps: { ...base.caps },
      },
    };
  });

  return (
    <PlansEditor
      plans={plans}
      featureKeys={[...FEATURE_KEYS]}
      featureLabels={FEATURE_LABELS}
    />
  );
}
