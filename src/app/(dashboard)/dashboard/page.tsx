import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getDashboardOverviewData } from "@/actions/dashboard";
import { DashboardOverviewClient } from "@/components/dashboard/DashboardOverviewClient";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const overviewData = await getDashboardOverviewData();

  if (!overviewData) {
    redirect("/onboarding");
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <DashboardOverviewClient initialData={overviewData} />
    </div>
  );
}
