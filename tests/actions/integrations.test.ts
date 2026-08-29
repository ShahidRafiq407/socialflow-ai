import { describe, it, expect, vi, beforeEach } from "vitest";
import * as integrations from "@/actions/integrations";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    workspace: { findFirst: vi.fn() },
    socialAccount: { upsert: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_test_1" })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("integrations actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns platform definitions when no workspace", async () => {
    (prisma.workspace.findFirst as any).mockResolvedValue(null);
    const res = await integrations.getWorkspaceIntegrations();
    expect(res).toBeInstanceOf(Array);
    expect(res.some((p) => p.platformKey === "instagram")).toBe(true);
  });

  it("maps connected accounts to platform keys", async () => {
    (prisma.workspace.findFirst as any).mockResolvedValue({
      id: "ws1",
      socialAccounts: [
        { id: "sa1", platform: "INSTAGRAM", handle: "@me", pageName: "Me", workspaceId: "ws1" },
      ],
    });
    const ids = await integrations.getConnectedPlatformIds();
    expect(ids).toEqual(["instagram"]);
  });
});
