// ============================================================================
// CRON — BILLING HOUSEKEEPING
//
// Two jobs, both pure correction:
//
//   1. Release credit holds whose run never came back.
//   2. Unlock affiliate commissions whose 30-day refund window has passed.
//
// Every metered action reserves credits before it calls a model and settles the
// reservation afterwards, so a customer can never spend a balance they do not have.
// The failure mode of that design is a serverless function killed mid-run — the
// timeout, the deploy, the OOM. Its hold is never settled and never released, and
// from then on the customer's available balance is quietly lower than their real
// one, with nothing on screen to explain it.
//
// So the holds carry an expiry and this route sweeps the expired ones. It is pure
// correction: it never grants, never charges and never touches a hold that is still
// inside its window, which is why running it twice in a minute is harmless. Grants
// are not this route's business — those arrive with the renewal webhook, the only
// thing that knows a new period has actually been paid for.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { sweepExpiredHolds } from "@/lib/billing/wallet";
import { unlockMaturedCommissions } from "@/lib/affiliate/referral";
import { syncAllWorkspacesInsights } from "@/actions/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel sends the secret as a bearer token. When no secret is configured the
  // route stays open, matching the other cron routes in this project rather than
  // inventing a second convention.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await sweepExpiredHolds();
  if (released > 0) {
    console.log(`[Cron: billing-maintenance] released ${released} expired credit hold(s)`);
  }

  // Affiliate commissions whose 30-day refund window has passed become
  // available — the same pure correction: it grants nothing that was not
  // already earned, and running twice is harmless.
  const unlocked = await unlockMaturedCommissions();
  if (unlocked > 0) {
    console.log(`[Cron: billing-maintenance] unlocked ${unlocked} affiliate commission(s)`);
  }

  // Daily platform-insights refresh (followers/impressions/engagement) for
  // every workspace with connected accounts. Hobby allows only two cron
  // routes, so this daily housekeeping run doubles as the sync schedule; the
  // dashboard additionally refreshes stale snapshots on open.
  let insights = { workspaces: 0, refreshed: 0 };
  try {
    insights = await syncAllWorkspacesInsights();
  } catch (error) {
    console.error("[Cron: billing-maintenance] platform insights sync failed:", error);
  }

  return NextResponse.json({
    success: true,
    releasedHolds: released,
    unlockedCommissions: unlocked,
    insights,
    ranAt: new Date().toISOString(),
  });
}
