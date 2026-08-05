import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { ChatInterface } from "@/components/dashboard/ChatInterface";

export default async function CEOChatPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] w-full items-center justify-center">
      <div className="w-full max-w-4xl mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          CEO Chat: {workspace.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your autonomous marketing AI team is standing by.
        </p>
      </div>

      <ChatInterface workspaceId={workspace.id} />
    </div>
  );
}
