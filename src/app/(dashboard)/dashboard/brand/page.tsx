import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { BrandDNAHQ } from "@/components/dashboard/BrandDNAHQ";
import { getWorkspaceBrandDNA } from "@/actions/brand";

export default async function BrandDNAPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await Promise.race([
    prisma.workspace.findFirst({
      where: { userId },
    }),
    new Promise<any>((resolve) => setTimeout(() => resolve(null), 2500)),
  ]).catch(() => null);

  const workspaceId = workspace?.id || "default-workspace";
  const initialData = await getWorkspaceBrandDNA(workspaceId);

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-6xl mx-auto p-4 md:p-8">
      <BrandDNAHQ
        workspaceId={workspaceId}
        initialData={initialData}
      />
    </div>
  );
}
