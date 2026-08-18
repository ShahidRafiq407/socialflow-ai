import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      return NextResponse.json({ success: true, session });
    }

    if (workspaceId) {
      const sessions = await prisma.chatSession.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { messages: true },
          },
        },
      });
      return NextResponse.json({ success: true, sessions });
    }

    return NextResponse.json({ error: "workspaceId or sessionId required" }, { status: 400 });
  } catch (error: any) {
    console.error("[Chat Sessions GET Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to load sessions" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    await prisma.message.deleteMany({
      where: { chatSessionId: sessionId },
    });

    await prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Chat Sessions DELETE Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to delete session" }, { status: 500 });
  }
}
