import { auth } from "@clerk/nextjs/server";
import { MarketingHome } from "@/components/marketing/marketing-home";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { PLAN_CATALOG, ONGOING_PLAN_TIERS, yearlySavingPercent } from "@/lib/billing/plans";
import { cyclesPurchasable, trialPurchasable } from "@/lib/billing/lemonsqueezy";

export default async function MarketingHomePage() {
  const { userId } = await auth();

  // Gracefully ensure runtime config with a fast fallback so DB latency never blocks the landing page
  try {
    await Promise.race([
      ensureRuntimeConfig(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (err) {
    console.warn("[MarketingHomePage] runtime config load failed:", err);
  }

  // What the store can actually sell right now. Both are plain reads of the config
  // already loaded above — no network, no database — and they exist so a pricing
  // button never sends someone to a checkout that cannot open. Monthly and yearly
  // are separate products in Lemon Squeezy, so they are answered separately.
  const cycles = cyclesPurchasable();

  return (
    <MarketingHome
      isLoggedIn={!!userId}
      plans={ONGOING_PLAN_TIERS.map((tier) => PLAN_CATALOG[tier])}
      trialPlan={PLAN_CATALOG.TRIAL}
      yearlySaving={yearlySavingPercent("PRO")}
      cycles={cycles}
      trialAvailable={trialPurchasable()}
    />
  );
}


