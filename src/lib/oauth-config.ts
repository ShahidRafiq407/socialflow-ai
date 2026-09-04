/**
 * Central OAuth 2.0 Configuration for all social platforms
 * Each platform has its authorization URL, token URL, scopes, and credentials
 */

import type { Platform } from "@prisma/client";

export interface OAuthPlatformConfig {
  platformKey: string;
  displayName: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  clientId: string;
  clientSecret: string;
  /** Extra query params to add to the authorize URL */
  extraAuthParams?: Record<string, string>;
  /** How to send client credentials in token exchange: "body" or "header" */
  tokenAuthMethod: "body" | "header";
  /** API endpoint to get user profile info after auth */
  profileUrl?: string;
}

export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost") && !process.env.NEXT_PUBLIC_APP_URL.includes("127.0.0.1")) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://socialflow-ai-akel.vercel.app";
}

export function getCallbackUrl(platform: string, origin?: string): string {
  const base = origin || getBaseUrl();
  return `${base.replace(/\/$/, "")}/api/auth/${platform}/callback`;
}

export function getOAuthConfig(platform: string): OAuthPlatformConfig | null {
  const configs: Record<string, OAuthPlatformConfig> = {
    linkedin: {
      platformKey: "linkedin",
      displayName: "LinkedIn",
      authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: "openid profile email w_member_social",
      clientId: process.env.LINKEDIN_CLIENT_ID || "",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
      tokenAuthMethod: "body",
      profileUrl: "https://api.linkedin.com/v2/userinfo",
    },
    facebook: {
      platformKey: "facebook",
      displayName: "Facebook",
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      scopes: "public_profile,email,pages_manage_posts,pages_read_engagement,pages_show_list",
      clientId: process.env.FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
      tokenAuthMethod: "body",
      profileUrl: "https://graph.facebook.com/me?fields=id,name,picture",
    },
    instagram: {
      platformKey: "instagram",
      displayName: "Instagram",
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      scopes: "public_profile,email,instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts,business_management",
      clientId: process.env.FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
      tokenAuthMethod: "body",
      profileUrl: "https://graph.facebook.com/me?fields=id,name,picture",
    },
    tiktok: {
      platformKey: "tiktok",
      displayName: "TikTok",
      authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
      tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
      scopes: "user.info.basic,video.publish,video.upload",
      clientId: process.env.TIKTOK_CLIENT_KEY || "",
      clientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
      tokenAuthMethod: "body",
      extraAuthParams: { response_type: "code" },
      profileUrl: "https://open.tiktokapis.com/v2/user/info/",
    },
    youtube: {
      platformKey: "youtube",
      displayName: "YouTube",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      // youtube.force-ssl is required by commentThreads.insert — lets the
      // publisher post the "first comment" on uploaded videos.
      scopes: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl openid profile email",
      clientId: process.env.YOUTUBE_CLIENT_ID || "",
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
      tokenAuthMethod: "body",
      extraAuthParams: { access_type: "offline", prompt: "consent" },
      profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    },
    pinterest: {
      platformKey: "pinterest",
      displayName: "Pinterest",
      authorizeUrl: "https://www.pinterest.com/oauth/",
      tokenUrl: "https://api.pinterest.com/v5/oauth/token",
      scopes: "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
      clientId: process.env.PINTEREST_CLIENT_ID || "",
      clientSecret: process.env.PINTEREST_CLIENT_SECRET || "",
      tokenAuthMethod: "header",
      profileUrl: "https://api.pinterest.com/v5/user_account",
    },
  };

  return configs[platform] || null;
}

/**
 * Map platform key to Prisma Platform enum value
 */
export function toPrismaEnum(platform: string): Platform | null {
  const map: Record<string, Platform> = {
    linkedin: "LINKEDIN",
    facebook: "FACEBOOK",
    instagram: "INSTAGRAM",
    youtube: "YOUTUBE",
    tiktok: "TIKTOK",
    pinterest: "PINTEREST",
  };
  return map[platform] || null;
}

/**
 * Generate a random state string for CSRF protection
 */
export function generateState(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * Math.floor(chars.length)));
  }
  return result;
}

