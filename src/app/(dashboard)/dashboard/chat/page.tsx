import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { ChatInterface } from "@/components/dashboard/ChatInterface";

export const dynamic = "force-dynamic";

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

  // Load the most recent chat session with its messages
  const lastSession = await prisma.chatSession.findFirst({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 50,
      },
    },
  });

  // Load list of all previous sessions for history switching
  const sessions = await prisma.chatSession.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: {
        select: { messages: true },
      },
    },
  });

  const initialMessages = (lastSession?.messages || []).map((m) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
    toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : undefined,
  }));

  return (
    <div className="flex flex-col w-full h-[calc(100vh-4.5rem)]">
      <ChatInterface
        workspaceId={workspace.id}
        initialSessionId={lastSession?.id || null}
        initialMessages={initialMessages}
        initialSessionsList={sessions.map((s) => ({
          id: s.id,
          title: s.title || "Untitled Chat",
          updatedAt: s.updatedAt,
          messageCount: s._count.messages,
        }))}
      />
    </div>
  );
}
