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

  const workspace = await Promise.race([
    prisma.workspace.findFirst({
      where: { userId },
    }),
    new Promise<any>((resolve) => setTimeout(() => resolve(null), 2500)),
  ]).catch(() => null);

  const workspaceId = workspace?.id || "default-workspace";

  // Load chat session and history in parallel with timeout guard
  const [lastSession, sessions] = await Promise.all([
    Promise.race([
      prisma.chatSession.findFirst({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 50,
          },
        },
      }),
      new Promise<any>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]).catch(() => null),
    Promise.race([
      prisma.chatSession.findMany({
        where: { workspaceId },
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
      }),
      new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2500)),
    ]).catch(() => []),
  ]);

  const initialMessages = (lastSession?.messages || []).map((m: any) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
    toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : undefined,
  }));

  return (
    <div className="flex flex-col w-full h-[calc(100vh-4.5rem)]">
      <ChatInterface
        workspaceId={workspaceId}
        initialSessionId={lastSession?.id || null}
        initialMessages={initialMessages}
        initialSessionsList={(sessions || []).map((s: any) => ({
          id: s.id,
          title: s.title || "Untitled Chat",
          updatedAt: s.updatedAt,
          messageCount: s._count?.messages || 0,
        }))}
      />
    </div>
  );
}
