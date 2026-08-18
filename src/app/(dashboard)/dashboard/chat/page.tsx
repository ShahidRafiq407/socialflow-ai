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
    <div className="flex flex-col w-full h-[calc(100vh-4.5rem)]">
      <ChatInterface workspaceId={workspace.id} />
    </div>
  );
}
