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
  /** Some platforms (TikTok, X) need PKCE or special params */
  usesPKCE?: boolean;
  /** Extra query params to add to the authorize URL */
  extraAuthParams?: Record<string, string>;
  /** How to send client credentials in token exchange: "body" or "header" */
  tokenAuthMethod: "body" | "header";
  /** API endpoint to get user profile info after auth */
  profileUrl?: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function getCallbackUrl(platform: string): string {
  return `${BASE_URL}/api/auth/${platform}/callback`;
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
      scopes: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload openid profile email",
      clientId: process.env.YOUTUBE_CLIENT_ID || "",
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
      tokenAuthMethod: "body",
      extraAuthParams: { access_type: "offline", prompt: "consent" },
      profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    },
    x: {
      platformKey: "x",
      displayName: "X (Twitter)",
      authorizeUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      scopes: "tweet.read tweet.write users.read offline.access",
      clientId: process.env.TWITTER_CLIENT_ID || "",
      clientSecret: process.env.TWITTER_CLIENT_SECRET || "",
      usesPKCE: true,
      tokenAuthMethod: "header",
      profileUrl: "https://api.twitter.com/2/users/me",
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
    x: "X",
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

/**
 * Generate PKCE code verifier and challenge for OAuth 2.0 PKCE flow (used by X/Twitter)
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Simple PKCE: use plain method (code_challenge = code_verifier)
  // For production, use S256 method with crypto
  const verifier = generateState() + generateState(); // 64 chars
  return {
    codeVerifier: verifier,
    codeChallenge: verifier, // plain method
  };
}
