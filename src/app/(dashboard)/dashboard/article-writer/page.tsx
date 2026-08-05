import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { ArticleWriterHQ } from "@/components/dashboard/ArticleWriterHQ";

export default async function ArticleWriterPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    include: { brandDNA: true },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  return (
    <div className="flex flex-col w-full min-h-screen">
      <ArticleWriterHQ
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        industry={workspace.industry || ""}
        brandTone={workspace.brandDNA?.tone || "Professional"}
        targetAudience={workspace.brandDNA?.targetAudience || "General"}
      />
    </div>
  );
}
