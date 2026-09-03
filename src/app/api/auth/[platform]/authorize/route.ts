/**
 * OAuth 2.0 Authorization Redirect
 * 
 * GET /api/auth/[platform]/authorize
 * 
 * Redirects the user to the platform's OAuth consent page
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import {
  getOAuthConfig,
  getCallbackUrl,
  generateState,
  generatePKCE,
} from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  console.log("HIT AUTHORIZE ROUTE");
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const { platform } = await params;
    const config = getOAuthConfig(platform);

    if (!config) {
      return NextResponse.json(
        { error: `Platform "${platform}" is not supported.` },
        { status: 400 }
      );
    }

    if (!config.clientId) {
      return NextResponse.json(
        { error: `OAuth credentials not configured for ${config.displayName}.` },
        { status: 500 }
      );
    }

    // ── Plan limit gate: Free plan supports up to 2 connected accounts ────────
    const workspace = await prisma.workspace.findFirst({
      ...(await activeWorkspaceQuery(userId)),
      select: { id: true },
    });
    if (workspace) {
      const { checkSocialAccountLimit } = await import("@/lib/billing/gate");
      const limit = await checkSocialAccountLimit(workspace.id);
      if (!limit.allowed) {
        return NextResponse.redirect(
          new URL(`/dashboard/billing?status=error&message=${encodeURIComponent(limit.message || "Account limit reached")}`, req.url)
        );
      }
    }

    // Generate CSRF state token
    const state = generateState();
    const reqOrigin = new URL(req.url).origin;
    const callbackUrl = `${reqOrigin}/api/auth/${platform}/callback`;

    // Store state in cookie for validation in callback
    const cookieStore = await cookies();
    cookieStore.set(`oauth_state_${platform}`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    // Build authorization URL
    const authUrl = new URL(config.authorizeUrl);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("state", state);

    // Platform-specific handling
    if (platform === "tiktok") {
      // TikTok uses client_key instead of client_id
      authUrl.searchParams.delete("client_id");
      authUrl.searchParams.set("client_key", config.clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scopes);
    } else if (platform === "x") {
      // X/Twitter uses PKCE
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scopes);
      authUrl.searchParams.set("code_challenge_method", "plain");

      const pkce = generatePKCE();
      authUrl.searchParams.set("code_challenge", pkce.codeChallenge);

      // Store code verifier for token exchange
      cookieStore.set(`oauth_pkce_${platform}`, pkce.codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      });
    } else if (platform === "pinterest") {
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scopes);
    } else {
      // Standard OAuth 2.0 (LinkedIn, Facebook, Instagram, YouTube)
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scopes);
    }

    // Add any extra auth params
    if (config.extraAuthParams) {
      for (const [key, value] of Object.entries(config.extraAuthParams)) {
        if (!authUrl.searchParams.has(key)) {
          authUrl.searchParams.set(key, value);
        }
      }
    }

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error("OAuth authorize error:", error);
    return NextResponse.json(
      { error: error.message || "OAuth authorization failed" },
      { status: 500 }
    );
  }
}
