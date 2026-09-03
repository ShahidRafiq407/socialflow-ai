"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import type { SocialAccount as SocialAccountModel } from "@prisma/client";
import { ensureArray } from "@/lib/db-utils";
import { activeWorkspaceQuery } from "@/lib/workspace/active";

export interface SocialPlatformIntegration {
  id: string;           // DB record id (or platform key if not connected)
  platform: string;     // Display name: "Instagram", "LinkedIn", etc.
  platformKey: string;  // Lowercase key: "instagram", "linkedin", etc.
  handle: string;       // @username
  pageName: string | null; // Business page name (optional)
  avatarUrl: string | null; // Authentic social profile picture URL
  isConnected: boolean;
  isTokenExpired?: boolean;
  description: string;  // What this platform does
  color: string;        // Brand color hex
}

const PLATFORM_DEFINITIONS: Record<string, { platform: string; color: string; description: string }> = {
  instagram: { platform: "Instagram", color: "#E4405F", description: "Publish reels, stories, carousels, and feed posts to grow your visual brand." },
  linkedin: { platform: "LinkedIn", color: "#0A66C2", description: "Share executive posts, carousels, and short videos for B2B thought leadership." },
  facebook: { platform: "Facebook", color: "#1877F2", description: "Post to your page or profile with reels, stories, and community engagement." },
  x: { platform: "X (Twitter)", color: "#14171A", description: "Publish posts and threads for real-time engagement and brand visibility." },
  youtube: { platform: "YouTube", color: "#FF0000", description: "Upload Shorts and videos to build subscriber growth and brand authority." },
  tiktok: { platform: "TikTok", color: "#000000", description: "Create viral short-form videos for maximum reach and brand awareness." },
  pinterest: { platform: "Pinterest", color: "#E60023", description: "Pin visual infographics and diagrams for evergreen SEO traffic." }
};

export async function getWorkspaceIntegrations(): Promise<SocialPlatformIntegration[]> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Object.entries(PLATFORM_DEFINITIONS).map(([key, def]) => ({
        id: key,
        platformKey: key,
        platform: def.platform,
        handle: "",
        pageName: null,
        avatarUrl: null,
        isConnected: false,
        isTokenExpired: false,
        description: def.description,
        color: def.color,
      }));
    }

    const workspace = await Promise.race([
      prisma.workspace.findFirst({
        ...(await activeWorkspaceQuery(userId)),
        include: { socialAccounts: true },
      }),
      new Promise<any>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]).catch(() => null);

    if (!workspace) {
      return Object.entries(PLATFORM_DEFINITIONS).map(([key, def]) => ({
        id: key,
        platformKey: key,
        platform: def.platform,
        handle: "",
        pageName: null,
        avatarUrl: null,
        isConnected: false,
        isTokenExpired: false,
        description: def.description,
        color: def.color,
      }));
    }

    const accounts = Array.isArray(workspace?.socialAccounts) ? workspace.socialAccounts : [];
    const accountMap = new Map<string, any>(
      accounts.map((sa: any) => [sa.platform.toLowerCase(), sa])
    );

    return Object.entries(PLATFORM_DEFINITIONS).map(([key, def]) => {
      const sa = accountMap.get(key) as SocialAccountModel | undefined;
      if (sa) {
        const isExpired = sa.tokenExpiresAt ? sa.tokenExpiresAt < new Date() : false;
        return {
          id: sa.id,
          platformKey: key,
          platform: def.platform,
          handle: sa.handle,
          pageName: sa.pageName,
          avatarUrl: (sa as any).avatarUrl || null,
          isConnected: true,
          isTokenExpired: isExpired,
          description: def.description,
          color: def.color,
        };
      }
      return {
        id: key,
        platformKey: key,
        platform: def.platform,
        handle: "",
        pageName: null,
        avatarUrl: null,
        isConnected: false,
        isTokenExpired: false,
        description: def.description,
        color: def.color,
      };
    });
  } catch (err) {
    console.error("Error getting workspace integrations:", err);
    return Object.entries(PLATFORM_DEFINITIONS).map(([key, def]) => ({
      id: key,
      platformKey: key,
      platform: def.platform,
      handle: "",
      pageName: null,
      avatarUrl: null,
      isConnected: false,
      isTokenExpired: false,
      description: def.description,
      color: def.color,
    }));
  }
}

export async function connectPlatform(
  platformKey: string,
  handle: string,
  pageName?: string,
  avatarUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!handle) {
      return { success: false, error: "Handle is required" };
    }
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

    if (!workspace) {
      return { success: false, error: "Workspace not found" };
    }

    const platformEnumMap: Record<string, any> = {
      instagram: "INSTAGRAM",
      linkedin: "LINKEDIN",
      facebook: "FACEBOOK",
      x: "X",
      youtube: "YOUTUBE",
      tiktok: "TIKTOK",
      pinterest: "PINTEREST",
    };

    const enumValue = platformEnumMap[platformKey];
    if (!enumValue) {
      return { success: false, error: "Invalid platform" };
    }

    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform: {
          workspaceId: workspace.id,
          platform: enumValue,
        },
      },
      update: {
        handle,
        pageName: pageName || null,
        avatarUrl: avatarUrl || null,
      },
      create: {
        workspaceId: workspace.id,
        platform: enumValue,
        handle,
        pageName: pageName || null,
        avatarUrl: avatarUrl || null,
      },
    });

    revalidatePath("/dashboard/integrations");
    revalidatePath("/dashboard/ai-studio");

    return { success: true };
  } catch (err: any) {
    console.error("Error connecting platform:", err);
    return { success: false, error: err.message || "Failed to connect platform" };
  }
}

export async function disconnectPlatform(
  platformKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

    if (!workspace) {
      return { success: false, error: "Workspace not found" };
    }

    const platformEnumMap: Record<string, any> = {
      instagram: "INSTAGRAM",
      linkedin: "LINKEDIN",
      facebook: "FACEBOOK",
      x: "X",
      youtube: "YOUTUBE",
      tiktok: "TIKTOK",
      pinterest: "PINTEREST",
    };

    const enumValue = platformEnumMap[platformKey];
    if (!enumValue) {
      return { success: false, error: "Invalid platform" };
    }

    await prisma.socialAccount.delete({
      where: {
        workspaceId_platform: {
          workspaceId: workspace.id,
          platform: enumValue,
        },
      },
    });

    revalidatePath("/dashboard/integrations");
    revalidatePath("/dashboard/ai-studio");

    return { success: true };
  } catch (err: any) {
    if (err.code === "P2025") {
      // Record to delete does not exist
      return { success: true };
    }
    console.error("Error disconnecting platform:", err);
    return { success: false, error: err.message || "Failed to disconnect platform" };
  }
}

export async function getConnectedPlatformIds(): Promise<string[]> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return [];
    }

    const workspace = await Promise.race([
      prisma.workspace.findFirst({
        ...(await activeWorkspaceQuery(userId)),
        include: { socialAccounts: true },
      }),
      new Promise<any>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]).catch(() => null);

    if (!workspace) {
      return [];
    }

    const accounts = Array.isArray(workspace?.socialAccounts) ? workspace.socialAccounts : [];
    return accounts.map((sa: any) => sa.platform.toLowerCase());
  } catch (err) {
    console.error("Error getting connected platform ids:", err);
    return [];
  }
}
