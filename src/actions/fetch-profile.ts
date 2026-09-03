"use server";

import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import type { SocialAccount as SocialAccountModel } from "@prisma/client";
import { ensureArray } from "@/lib/db-utils";
import { activeWorkspaceQuery } from "@/lib/workspace/active";

export interface PlatformProfile {
  platformKey: string;
  platform: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isTokenExpired: boolean;
  error?: string;
}

/**
 * Fetch real-time profile data from Instagram Graph API / Basic Display API
 */
async function fetchInstagramProfile(accessToken: string, accountId: string): Promise<{ username: string; displayName: string; avatarUrl: string | null } | null> {
  try {
    const cleanAccountId = (accountId || "").replace(/^@/, "").trim();

    // 1. Try directly with stored numerical accountId
    if (cleanAccountId && /^\d+$/.test(cleanAccountId)) {
      const url = `https://graph.facebook.com/v19.0/${cleanAccountId}?fields=username,profile_picture_url,name&access_token=${accessToken}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok && (data.username || data.name)) {
        return {
          username: data.username ? `@${data.username.replace(/^@/, "")}` : `@${cleanAccountId}`,
          displayName: data.name || data.username || "Instagram User",
          avatarUrl: data.profile_picture_url || null,
        };
      }
    }

    // 2. Query /me/accounts for Instagram Business Account
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${accessToken}`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesResponse.ok && pagesData.data && Array.isArray(pagesData.data)) {
      const igPage = pagesData.data.find((p: any) => p.instagram_business_account);
      if (igPage?.instagram_business_account) {
        const ig = igPage.instagram_business_account;
        return {
          username: ig.username ? `@${ig.username.replace(/^@/, "")}` : "@instagram_user",
          displayName: ig.name || ig.username || "Instagram Account",
          avatarUrl: ig.profile_picture_url || null,
        };
      }
    }

    // 3. Query Graph API /me user endpoint
    const meUrl = `https://graph.facebook.com/v19.0/me?fields=id,name,username,picture.type(large)&access_token=${accessToken}`;
    const meResponse = await fetch(meUrl);
    const meData = await meResponse.json();

    if (meResponse.ok && (meData.name || meData.username)) {
      const uname = meData.username || meData.name?.toLowerCase().replace(/\s+/g, "") || "instagram_user";
      return {
        username: uname.startsWith("@") ? uname : `@${uname}`,
        displayName: meData.name || uname,
        avatarUrl: meData.picture?.data?.url || null,
      };
    }

    // 4. Try Instagram Basic Display API endpoint
    const igBasicUrl = `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`;
    const igBasicResponse = await fetch(igBasicUrl);
    const igBasicData = await igBasicResponse.json();

    if (igBasicResponse.ok && igBasicData.username) {
      return {
        username: `@${igBasicData.username.replace(/^@/, "")}`,
        displayName: igBasicData.username,
        avatarUrl: null,
      };
    }

    console.error("Instagram profile fetch failed after fallbacks:", { pagesData, meData, igBasicData });
    return null;
  } catch (error) {
    console.error("Instagram profile fetch exception:", error);
    return null;
  }
}

/**
 * Fetch real-time profile data from Facebook Graph API
 */
async function fetchFacebookProfile(accessToken: string, pageId: string): Promise<{ username: string; displayName: string; avatarUrl: string } | null> {
  try {
    // Facebook Graph API - get page/profile info
    const url = `https://graph.facebook.com/v19.0/${pageId}?fields=name,picture.type(large)&access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error("Facebook profile fetch error:", data);
      return null;
    }

    return {
      username: data.name?.toLowerCase().replace(/\s+/g, "") || "",
      displayName: data.name || "",
      avatarUrl: data.picture?.data?.url || null,
    };
  } catch (error) {
    console.error("Facebook profile fetch exception:", error);
    return null;
  }
}

/**
 * Fetch real-time profile data from LinkedIn API
 */
async function fetchLinkedInProfile(accessToken: string, personUrn: string): Promise<{ username: string; displayName: string; avatarUrl: string } | null> {
  try {
    // LinkedIn API v2 - get profile
    const url = `https://api.linkedin.com/v2/userinfo`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("LinkedIn profile fetch error:", data);
      return null;
    }

    // Extract username from email or sub
    const username = data.email?.split("@")[0] || data.sub || "";
    
    return {
      username,
      displayName: data.name || data.given_name + " " + data.family_name || "",
      avatarUrl: data.picture || null,
    };
  } catch (error) {
    console.error("LinkedIn profile fetch exception:", error);
    return null;
  }
}

/**
 * Fetch real-time profile data from X (Twitter) API v2
 */
async function fetchXProfile(accessToken: string): Promise<{ username: string; displayName: string; avatarUrl: string } | null> {
  try {
    // X API v2 - get authenticated user
    const url = `https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("X profile fetch error:", data);
      return null;
    }

    return {
      username: data.data?.username || "",
      displayName: data.data?.name || "",
      avatarUrl: data.data?.profile_image_url?.replace("_normal", "") || null, // Get larger image
    };
  } catch (error) {
    console.error("X profile fetch exception:", error);
    return null;
  }
}

/**
 * Fetch real-time profile data from YouTube API
 */
async function fetchYouTubeProfile(accessToken: string): Promise<{ username: string; displayName: string; avatarUrl: string } | null> {
  try {
    // YouTube Data API v3 - get channel info
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();

    if (!response.ok || !data.items?.length) {
      console.error("YouTube profile fetch error:", data);
      return null;
    }

    const channel = data.items[0];
    return {
      username: channel.snippet?.customUrl?.replace("@", "") || channel.id || "",
      displayName: channel.snippet?.title || "",
      avatarUrl: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url || null,
    };
  } catch (error) {
    console.error("YouTube profile fetch exception:", error);
    return null;
  }
}

/**
 * Fetch real-time profile data from TikTok API
 */
async function fetchTikTokProfile(accessToken: string): Promise<{ username: string; displayName: string; avatarUrl: string } | null> {
  try {
    // TikTok API - get user info (only fields covered by user.info.basic scope)
    const url = `https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();

    if (!response.ok || data.error?.code !== "ok") {
      console.error("TikTok profile fetch error:", data);
      return null;
    }

    return {
      username: data.data?.user?.username || "",
      displayName: data.data?.user?.display_name || "",
      avatarUrl: data.data?.user?.avatar_url || null,
    };
  } catch (error) {
    console.error("TikTok profile fetch exception:", error);
    return null;
  }
}

/**
 * Fetch real-time profile data from Pinterest API
 */
async function fetchPinterestProfile(accessToken: string): Promise<{ username: string; displayName: string; avatarUrl: string } | null> {
  try {
    // Pinterest API v5 - get user account
    const url = `https://api.pinterest.com/v5/user_account`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("Pinterest profile fetch error:", data);
      return null;
    }

    return {
      username: data.username || "",
      displayName: data.full_name || data.username || "",
      avatarUrl: data.profile_image || null,
    };
  } catch (error) {
    console.error("Pinterest profile fetch exception:", error);
    return null;
  }
}

/**
 * Main function to fetch profile for a specific platform
 */
export async function fetchPlatformProfile(platformKey: string): Promise<PlatformProfile> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return {
        platformKey,
        platform: platformKey,
        username: "",
        displayName: "",
        avatarUrl: null,
        isConnected: false,
        isTokenExpired: false,
        error: "Unauthorized",
      };
    }

    const workspace = await prisma.workspace.findFirst({
      ...(await activeWorkspaceQuery(userId)),
      include: { socialAccounts: true },
    });

    if (!workspace) {
      return {
        platformKey,
        platform: platformKey,
        username: "",
        displayName: "",
        avatarUrl: null,
        isConnected: false,
        isTokenExpired: false,
        error: "Workspace not found",
      };
    }

    const platformEnumMap: Record<string, string> = {
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
      return {
        platformKey,
        platform: platformKey,
        username: "",
        displayName: "",
        avatarUrl: null,
        isConnected: false,
        isTokenExpired: false,
        error: "Invalid platform",
      };
    }

    const account = ensureArray(workspace.socialAccounts).find(
      (sa: SocialAccountModel) => sa.platform === enumValue
    );

    if (!account) {
      return {
        platformKey,
        platform: platformKey,
        username: "",
        displayName: "",
        avatarUrl: null,
        isConnected: false,
        isTokenExpired: false,
        error: "Account not connected",
      };
    }

    // Check token expiration
    const isTokenExpired = account.tokenExpiresAt ? account.tokenExpiresAt < new Date() : false;
    if (isTokenExpired) {
      return {
        platformKey,
        platform: platformKey,
        username: account.handle || "",
        displayName: account.pageName || account.handle || "",
        avatarUrl: account.avatarUrl || null,
        isConnected: true,
        isTokenExpired: true,
        error: "Access token expired - please reconnect",
      };
    }

    // Fetch real-time profile from platform API
    let profileData: { username: string; displayName: string; avatarUrl: string | null } | null = null;

    switch (platformKey) {
      case "instagram":
        profileData = await fetchInstagramProfile(account.accessToken, account.accountId);
        break;
      case "facebook":
        profileData = await fetchFacebookProfile(account.accessToken, account.accountId);
        break;
      case "linkedin":
        profileData = await fetchLinkedInProfile(account.accessToken, account.accountId);
        break;
      case "x":
        profileData = await fetchXProfile(account.accessToken);
        break;
      case "youtube":
        profileData = await fetchYouTubeProfile(account.accessToken);
        break;
      case "tiktok":
        profileData = await fetchTikTokProfile(account.accessToken);
        break;
      case "pinterest":
        profileData = await fetchPinterestProfile(account.accessToken);
        break;
    }

    if (profileData) {
      // Update database with fresh profile data (optional - for caching)
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          handle: profileData.username,
          pageName: profileData.displayName,
          avatarUrl: profileData.avatarUrl,
        },
      });

      return {
        platformKey,
        platform: platformKey,
        username: profileData.username,
        displayName: profileData.displayName,
        avatarUrl: profileData.avatarUrl,
        isConnected: true,
        isTokenExpired: false,
      };
    }

    // Fallback to stored data if API fetch fails
    return {
      platformKey,
      platform: platformKey,
      username: account.handle || "",
      displayName: account.pageName || account.handle || "",
      avatarUrl: account.avatarUrl || null,
      isConnected: true,
      isTokenExpired: false,
      error: "Failed to fetch live profile - showing cached data",
    };
  } catch (error: any) {
    console.error(`Error fetching ${platformKey} profile:`, error);
    return {
      platformKey,
      platform: platformKey,
      username: "",
      displayName: "",
      avatarUrl: null,
      isConnected: false,
      isTokenExpired: false,
      error: error.message || "Failed to fetch profile",
    };
  }
}

/**
 * Fetch profiles for all connected platforms in parallel
 */
export async function fetchAllPlatformProfiles(): Promise<PlatformProfile[]> {
  const { userId } = await auth();
  if (!userId) return [];

  const workspace = await prisma.workspace.findFirst({
    ...(await activeWorkspaceQuery(userId)),
    include: { socialAccounts: true },
  });

  if (!workspace) return [];

  const connectedPlatforms = ensureArray(workspace.socialAccounts).map(
    (sa: SocialAccountModel) => sa.platform.toLowerCase()
  );

  // Fetch all profiles in parallel
  const profiles = await Promise.all(
    connectedPlatforms.map((platformKey) => fetchPlatformProfile(platformKey))
  );

  return profiles;
}