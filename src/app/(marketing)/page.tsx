import { auth } from "@clerk/nextjs/server";
import { MarketingHome } from "@/components/marketing/marketing-home";

export default async function MarketingHomePage() {
  const { userId } = await auth();
  return <MarketingHome isLoggedIn={!!userId} />;
}
