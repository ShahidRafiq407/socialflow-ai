/**
 * OAuth 2.0 Callback Handler
 * 
 * GET /api/auth/[platform]/callback?code=XXX&state=XXX
 * 
 * Exchanges the authorization code for an access token,
 * fetches the user's profile, and saves everything to the database.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import {
  getOAuthConfig,
  getCallbackUrl,
  toPrismaEnum,
} from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  console.log("HIT CALLBACK ROUTE");
  const dashboardUrl = new URL("/dashboard/integrations", req.url);

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const { platform } = await params;
    const config = getOAuthConfig(platform);

    if (!config) {
      dashboardUrl.searchParams.set("error", `Platform "${platform}" is not supported.`);
      return NextResponse.redirect(dashboardUrl);
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Handle user denied access
    if (error) {
      dashboardUrl.searchParams.set("error", `Access denied for ${config.displayName}: ${error}`);
      return NextResponse.redirect(dashboardUrl);
    }

    if (!code) {
      dashboardUrl.searchParams.set("error", "No authorization code received.");
      return NextResponse.redirect(dashboardUrl);
    }

    // Validate CSRF state
    const cookieStore = await cookies();
    const savedState = cookieStore.get(`oauth_state_${platform}`)?.value;

    if (!savedState || savedState !== state) {
      dashboardUrl.searchParams.set("error", "Invalid state parameter. Please try again.");
      return NextResponse.redirect(dashboardUrl);
    }

    // Clear state cookie
    cookieStore.delete(`oauth_state_${platform}`);

    // =========================================================================
    // EXCHANGE CODE FOR ACCESS TOKEN
    // =========================================================================
    const callbackUrl = getCallbackUrl(platform);
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Platform-specific token exchange
    if (platform === "tiktok") {
      tokenBody.client_key = config.clientId;
      tokenBody.client_secret = config.clientSecret;
    } else if (config.tokenAuthMethod === "header") {
      // X/Twitter and Pinterest use Basic auth header
      const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;

      // X/Twitter PKCE
      if (platform === "x") {
        const codeVerifier = cookieStore.get(`oauth_pkce_${platform}`)?.value;
        if (codeVerifier) {
          tokenBody.code_verifier = codeVerifier;
          cookieStore.delete(`oauth_pkce_${platform}`);
        }
      }
    } else {
      // LinkedIn, Facebook, Instagram, YouTube — send credentials in body
      tokenBody.client_id = config.clientId;
      tokenBody.client_secret = config.clientSecret;
    }

    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(tokenBody).toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error(`Token exchange failed for ${platform}:`, tokenData);
      dashboardUrl.searchParams.set(
        "error",
        `Failed to connect ${config.displayName}: ${tokenData.error_description || tokenData.error || "Token exchange failed"}`
      );
      return NextResponse.redirect(dashboardUrl);
    }

    const accessToken = tokenData.access_token || tokenData.data?.access_token || "";
    const refreshToken = tokenData.refresh_token || tokenData.data?.refresh_token || null;
    const expiresIn = tokenData.expires_in || tokenData.data?.expires_in || 3600;

    if (!accessToken) {
      dashboardUrl.searchParams.set("error", `No access token received from ${config.displayName}.`);
      return NextResponse.redirect(dashboardUrl);
    }

    // =========================================================================
    // FETCH USER PROFILE
    // =========================================================================
    let accountId = "";
    let handle = "";
    let pageName: string | null = null;
    let avatarUrl: string | null = null;

    try {
      if (platform === "tiktok") {
        const profileRes = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const profileData = await profileRes.json();
        const userData = profileData.data?.user;
        accountId = userData?.open_id || tokenData.data?.open_id || "tiktok-user";
        handle = userData?.username ? `@${userData.username}` : userData?.display_name || "TikTok User";
        pageName = userData?.display_name || null;
        avatarUrl = userData?.avatar_url || null;
      } else if (platform === "x") {
        const profileRes = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profileData = await profileRes.json();
        accountId = profileData.data?.id || "x-user";
        handle = profileData.data?.username ? `@${profileData.data.username}` : "X User";
        pageName = profileData.data?.name || null;
        avatarUrl = profileData.data?.profile_image_url || null;
      } else if (platform === "pinterest") {
        const profileRes = await fetch("https://api.pinterest.com/v5/user_account", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profileData = await profileRes.json();
        accountId = profileData.id || "pinterest-user";
        handle = profileData.username ? `@${profileData.username}` : "Pinterest User";
        pageName = profileData.business_name || profileData.account_type || null;
        avatarUrl = profileData.profile_image || null;
      } else if (platform === "youtube") {
        const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profileData = await profileRes.json();
        accountId = profileData.id || "youtube-user";
        handle = profileData.name || profileData.email || "YouTube User";
        pageName = profileData.name || null;
        avatarUrl = profileData.picture || null;

        // Try to get channel name and avatar
        try {
          const channelRes = await fetch(
            "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const channelData = await channelRes.json();
          if (channelData.items?.[0]) {
            pageName = channelData.items[0].snippet?.title || pageName;
            handle = channelData.items[0].snippet?.customUrl || handle;
            avatarUrl = channelData.items[0].snippet?.thumbnails?.high?.url || channelData.items[0].snippet?.thumbnails?.default?.url || avatarUrl;
          }
        } catch {}
      } else if (platform === "facebook" || platform === "instagram") {
        // Meta Graph API
        const profileRes = await fetch(
          `https://graph.facebook.com/me?fields=id,name,picture.type(large)&access_token=${accessToken}`
        );
        const profileData = await profileRes.json();
        accountId = profileData.id || "meta-user";
        handle = profileData.name || "Facebook User";
        pageName = profileData.name || null;
        avatarUrl = profileData.picture?.data?.url || null;

        // For Instagram: try to get Instagram business account
        if (platform === "instagram") {
          try {
            const pagesRes = await fetch(
              `https://graph.facebook.com/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
            );
            const pagesData = await pagesRes.json();
            const igPage = pagesData.data?.find((p: any) => p.instagram_business_account);
            if (igPage?.instagram_business_account?.id) {
              const igRes = await fetch(
                `https://graph.facebook.com/${igPage.instagram_business_account.id}?fields=id,username,name,profile_picture_url&access_token=${accessToken}`
              );
              const igData = await igRes.json();
              accountId = igData.id || accountId;
              handle = igData.username ? `@${igData.username}` : handle;
              pageName = igData.name || pageName;
              avatarUrl = igData.profile_picture_url || avatarUrl;
            }
          } catch {}
        }
      } else if (platform === "linkedin") {
        const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profileData = await profileRes.json();
        accountId = profileData.sub || "linkedin-user";
        handle = profileData.name || profileData.email || "LinkedIn User";
        pageName = profileData.name || null;
        avatarUrl = profileData.picture || null;
      }
    } catch (profileError) {
      console.warn(`Profile fetch failed for ${platform}, proceeding with token only:`, profileError);
      accountId = `${platform}-${Date.now()}`;
      handle = `${config.displayName} User`;
    }

    // =========================================================================
    // SAVE TO DATABASE
    // =========================================================================
    let workspace = await prisma.workspace.findFirst({
      where: { userId },
    });

    if (!workspace) {
      // Auto-create user and workspace if missing (fallback for local dev / skipped onboarding)
      const user = await currentUser();
      if (!user) {
        dashboardUrl.searchParams.set("error", "No user found. Please sign in again.");
        return NextResponse.redirect(dashboardUrl);
      }

      const email = user.emailAddresses[0]?.emailAddress || `${userId}@example.com`;
      const name = user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "User";

      // Ensure user exists
      await prisma.user.upsert({
        where: { id: userId },
        create: {
          id: userId,
          email,
          name,
        },
        update: {},
      });

      // Create workspace
      workspace = await prisma.workspace.create({
        data: {
          userId,
          name: `${name}'s Workspace`,
        },
      });
    }

    const prismaEnum = toPrismaEnum(platform);
    if (!prismaEnum) {
      dashboardUrl.searchParams.set("error", `Platform ${platform} is not supported in the database yet.`);
      return NextResponse.redirect(dashboardUrl);
    }

    // Upsert social account
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform: {
          workspaceId: workspace.id,
          platform: prismaEnum as any,
        },
      },
      create: {
        workspaceId: workspace.id,
        platform: prismaEnum as any,
        accessToken,
        refreshToken,
        accountId,
        handle,
        pageName,
        avatarUrl,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
      update: {
        accessToken,
        refreshToken,
        accountId,
        handle,
        pageName,
        avatarUrl,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    // Success — redirect back to integrations
    dashboardUrl.searchParams.set("success", `${config.displayName} connected successfully!`);
    return NextResponse.redirect(dashboardUrl);

  } catch (error: any) {
    console.error("OAuth callback error:", error);
    dashboardUrl.searchParams.set("error", error.message || "OAuth callback failed");
    return NextResponse.redirect(dashboardUrl);
  }
}
