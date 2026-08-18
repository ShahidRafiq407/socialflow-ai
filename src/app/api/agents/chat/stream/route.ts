import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { runBrain } from "@/lib/agents/chat/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { prompt, workspaceId, chatSessionId, files = [] } = body;

  if (!prompt || !workspaceId) {
    return new Response(JSON.stringify({ error: "prompt and workspaceId required" }), { status: 400 });
  }

  // Find or create the chat session
  let session: any = null;
  if (chatSessionId) {
    session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
  }
  if (!session) {
    session = await prisma.chatSession.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
  }
  if (!session) {
    session = await prisma.chatSession.create({
      data: { workspaceId, title: (prompt || "").slice(0, 80) },
      include: { messages: true },
    });
  }

  const history = (session.messages || []).map((m: any) => ({
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content,
  }));

  // Persist the user message immediately
  await prisma.message.create({
    data: { role: "USER", content: prompt, chatSessionId: session.id },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, any>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({ type: "session", sessionId: session.id, title: session.title || "" });

      let finalAnswer = "";
      let finalToolCalls: any[] = [];

      try {
        const result = await runBrain({
          prompt,
          workspaceId,
          userId,
          history,
          uploadedFiles: files,
          onEvent: (event) => {
            send(event);
            if (event.type === "done") finalAnswer = event.answer || "";
          },
        });
        finalAnswer = result.answer;
        finalToolCalls = result.toolCalls;

        await prisma.message.create({
          data: {
            role: "AGENT",
            content: finalAnswer,
            toolCalls: finalToolCalls,
            chatSessionId: session.id,
          },
        });
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { updatedAt: new Date() },
        });
      } catch (err: any) {
        send({ type: "error", message: err?.message || "An error occurred." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
