// ============================================================================
// /dashboard/billing — SERVER PAGE
//
// Deliberately almost empty. Everything on this tab — plan, credits, allowances,
// storage, payment method, price list, payments, credit statement — comes from one
// authenticated read of `GET /api/billing/status`, and that read is the same code
// path the gates use, so the page cannot drift from what is actually enforced.
//
// Rendering it here as well would mean two resolutions of the same wallet, one of
// them a snapshot from render time that goes stale the moment a run spends a credit.
// So this page checks that someone is signed in, reserves the space, and lets the
// shell fetch. The only thing it adds is the auth redirect: a signed-out visitor
// should land on sign-in rather than watch a spinner turn into a 401 — and carrying
// the query string through that redirect is what lets `?intent=trial` survive it,
// since a bare `redirect("/sign-in")` would drop the one parameter the visitor came
// for and return them to a grid they had already chosen from.
// ============================================================================

import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BillingShell } from "@/components/billing/BillingShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plan and billing",
  description: "Your plan, your credits, what each action costs, and every charge.",
};

function Fallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Reading your plan and balance…
      </div>
    </div>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (typeof value === "string") params.set(key, value);
    }
    const back = params.size
      ? `/dashboard/billing?${params.toString()}`
      : "/dashboard/billing";
    redirect(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-20 font-sans">
      <Suspense fallback={<Fallback />}>
        <BillingShell />
      </Suspense>
    </div>
  );
}
