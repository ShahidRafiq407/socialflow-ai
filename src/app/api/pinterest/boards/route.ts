import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await prisma.socialAccount.findFirst({
      where: {
        workspace: { userId },
        platform: "PINTEREST",
      },
    });

    if (!account?.accessToken) {
      return NextResponse.json({ error: "Pinterest account not connected" }, { status: 400 });
    }

    const boardsRes = await fetch("https://api.pinterest.com/v5/boards?page_size=25", {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });

    const boardsData = await boardsRes.json().catch(() => ({}));
    const items = Array.isArray(boardsData.items) ? boardsData.items : [];

    return NextResponse.json({ success: true, boards: items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch boards" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await prisma.socialAccount.findFirst({
      where: {
        workspace: { userId },
        platform: "PINTEREST",
      },
    });

    if (!account?.accessToken) {
      return NextResponse.json(
        { error: "Pinterest account not connected. Please connect Pinterest in Integrations." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description, privacy } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Board name is required" }, { status: 400 });
    }

    const createRes = await fetch("https://api.pinterest.com/v5/boards", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim(),
        description: description?.trim() || `Created via SMB Robotics AI`,
        privacy: privacy || "PUBLIC",
      }),
    });

    const createData = await createRes.json().catch(() => ({}));

    if (!createRes.ok || createData.error || createData.code) {
      return NextResponse.json(
        {
          error:
            createData.message ||
            createData.error ||
            "Failed to create board on Pinterest. Reconnect Pinterest in Integrations to enable boards:write permissions.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, board: createData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create board" }, { status: 500 });
  }
}
