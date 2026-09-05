import { auth } from "@clerk/nextjs/server";
import { MarketingHome, ONGOING_PLAN_TIERS } from "@/components/marketing/marketing-home";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { PLAN_CATALOG, yearlySavingPercent } from "@/lib/billing/plans";

export default async function MarketingHomePage() {
  // The pricing grid is a promise, so it has to show the prices this instance
  // would actually charge. `PLAN_CATALOG` is patched in place with the admin's
  // overrides only after the settings are read, and the page component is a
  // client component with its own copy of the table in the browser bundle — so
  // the values are resolved here and handed down as props.
  const [{ userId }] = await Promise.all([auth(), ensureRuntimeConfig()]);

  return (
    <MarketingHome
      isLoggedIn={!!userId}
      plans={ONGOING_PLAN_TIERS.map((tier) => PLAN_CATALOG[tier])}
      trialPlan={PLAN_CATALOG.TRIAL}
      yearlySaving={yearlySavingPercent("PRO")}
    />
  );
}
