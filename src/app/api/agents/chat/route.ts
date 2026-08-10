import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { HumanMessage } from "@langchain/core/messages";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, workspaceId } = body;

    if (!prompt || !workspaceId) {
      return NextResponse.json(
        { error: "Prompt and workspaceId are required." },
        { status: 400 }
      );
    }

    // Dynamic import to prevent build-time collection errors
    const { marketingGraph } = await import("@/lib/agents/graph");

    // Invoke the compiled marketing supervisor graph
    const result = await marketingGraph.invoke({
      messages: [new HumanMessage(prompt)],
      workspaceId: workspaceId,
    });

    const lastMessage = result.messages[result.messages.length - 1];

    return NextResponse.json({
      success: true,
      response: lastMessage.content,
    });
  } catch (error: any) {
    console.error("Agent Chat Error:", error);
    return NextResponse.json(
      { error: error.message || "An error occurred while generating content." },
      { status: 500 }
    );
  }
}
