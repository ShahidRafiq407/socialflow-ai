import { PublishResult } from './index';
import { toPublicMediaUrl } from '@/lib/media/urls';

/**
 * REAL TikTok publisher — Content Posting API v2 (Direct Post).
 *
 * Flow: POST /v2/post/publish/video/init/ with PULL_FROM_URL source — TikTok's
 * servers download the video from our public URL themselves.
 *
 * Settings tab mapping (post.settings):
 *   tiktokPrivacy            → privacy_level (PUBLIC_TO_EVERYONE / MUTUAL_FOLLOW_FRIENDS / SELF_ONLY)
 *   tiktokDisableComments    → disable_comment
 *   tiktokDisableDuet        → disable_duet
 *   tiktokDisableStitch      → disable_stitch
 *
 * NOTE: unaudited TikTok apps are forced by TikTok to SELF_ONLY (private drafts)
 * until the app passes audit — the requested privacy_level is sent and TikTok
 * enforces its own policy.
 */

async function refreshTikTokAccessToken(account: any): Promise<string | null> {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
    const refreshToken = account.refreshToken;

    if (!clientKey || !clientSecret || !refreshToken) {
      return null;
    }

    const bodyParams = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      console.warn(`[TikTok Publisher] Token refresh HTTP failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const tokenInfo = data?.data || data;
    if (tokenInfo?.access_token) {
      const prisma = (await import("@/lib/db")).default;
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: tokenInfo.access_token,
          refreshToken: tokenInfo.refresh_token || refreshToken,
          tokenExpiresAt: new Date(Date.now() + (tokenInfo.expires_in || 86400) * 1000),
        },
      });
      return tokenInfo.access_token;
    }
  } catch (err) {
    console.warn("[TikTok Publisher] Error refreshing TikTok access token:", err);
  }
  return null;
}

export async function publishToTikTok(post: any, account: any): Promise<PublishResult> {
  try {
    let accessToken = account.accessToken;

    if (!accessToken) {
      return { success: false, error: "Missing TikTok account credentials", platform: "TIKTOK" };
    }

    // Auto-refresh token if expired or close to expiry (within 5 minutes)
    if (account.refreshToken && account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + 300000) {
      const refreshedToken = await refreshTikTokAccessToken(account);
      if (refreshedToken) accessToken = refreshedToken;
    }

    const rawVideoUrl: string | undefined = post.imageUrl || post.mediaHistory?.mediaUrls?.[0];
    if (!rawVideoUrl) {
      return { success: false, error: "TikTok posts require a video", platform: "TIKTOK" };
    }

    let videoBuffer: ArrayBuffer;
    if (rawVideoUrl.startsWith("data:")) {
      const base64Data = rawVideoUrl.split(",")[1] || "";
      const buf = Buffer.from(base64Data, "base64");
      videoBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } else {
      const publicVideoUrl = toPublicMediaUrl(rawVideoUrl, post.id);
      const videoRes = await fetch(publicVideoUrl);
      if (!videoRes.ok) {
        return { success: false, error: `Could not retrieve video asset for upload (HTTP ${videoRes.status})`, platform: "TIKTOK" };
      }
      videoBuffer = await videoRes.arrayBuffer();
    }
    const videoSize = videoBuffer.byteLength;

    const settings = post.settings || {};
    const privacyMap: Record<string, string> = {
      everyone: "PUBLIC_TO_EVERYONE",
      friends: "MUTUAL_FOLLOW_FRIENDS",
      private: "SELF_ONLY",
    };

    let targetPrivacy = privacyMap[settings.tiktokPrivacy] || "PUBLIC_TO_EVERYONE";

    // Query creator info to check available privacy levels supported by TikTok
    try {
      const creatorRes = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      });
      if (creatorRes.ok) {
        const creatorData = await creatorRes.json();
        const allowedOptions: string[] = creatorData?.data?.privacy_level_options || [];
        if (allowedOptions.length > 0 && !allowedOptions.includes(targetPrivacy)) {
          targetPrivacy = allowedOptions.includes("PUBLIC_TO_EVERYONE")
            ? "PUBLIC_TO_EVERYONE"
            : (allowedOptions.includes("MUTUAL_FOLLOW_FRIENDS") ? "MUTUAL_FOLLOW_FRIENDS" : allowedOptions[0]);
        }
      }
    } catch (creatorErr) {
      console.warn("[TikTok Publisher] creator_info query failed:", creatorErr);
    }

    // TikTok title = caption + hashtags, hard limit 2200 chars (API rejects beyond that)
    const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
    const title = [post.content || "", hashtags.join(" ")]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2200)
      .trim();

    const makePublishCall = async (token: string, privacyLevel: string) => {
      return await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title,
            privacy_level: privacyLevel,
            disable_comment: settings.tiktokDisableComments === true,
            disable_duet: settings.tiktokDisableDuet === true,
            disable_stitch: settings.tiktokDisableStitch === true,
          },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        }),
      });
    };

    // Step 1: Try PUBLIC_TO_EVERYONE first
    let usedPrivacy = targetPrivacy;
    let response = await makePublishCall(accessToken, usedPrivacy);
    let data = await response.json().catch(() => ({}));
    console.log("[TikTok Publisher] Init response HTTP:", response.status, "Privacy:", usedPrivacy, "Body:", JSON.stringify(data));

    // If failed due to guidelines/privacy/audit → fallback to SELF_ONLY
    const initErr = String(data?.error?.message || "") + String(data?.error?.code || "");
    if (usedPrivacy !== "SELF_ONLY" && (initErr.includes("guidelines") || initErr.includes("privacy") || initErr.includes("audit") || initErr.includes("unaudited"))) {
      console.log("[TikTok Publisher] PUBLIC rejected, retrying with SELF_ONLY");
      usedPrivacy = "SELF_ONLY";
      response = await makePublishCall(accessToken, usedPrivacy);
      data = await response.json().catch(() => ({}));
      console.log("[TikTok Publisher] SELF_ONLY retry HTTP:", response.status, "Body:", JSON.stringify(data));
    }

    // If token invalid, try to refresh once and retry
    if (data?.error?.code === "access_token_invalid" || data?.error?.message?.includes("access token is invalid")) {
      const refreshedToken = await refreshTikTokAccessToken(account);
      if (refreshedToken) {
        accessToken = refreshedToken;
        response = await makePublishCall(accessToken, usedPrivacy);
        data = await response.json().catch(() => ({}));
        console.log("[TikTok Publisher] Retry after refresh HTTP:", response.status, "Body:", JSON.stringify(data));
      }
    }

    // TikTok returns { data: { publish_id, upload_url }, error: { code, message } }
    const apiError = data?.error;
    if (!response.ok || (apiError && apiError.code && apiError.code !== "ok")) {
      const code = String(apiError?.code || "");
      const message = String(apiError?.message || "");
      const logId = String(apiError?.log_id || data?.data?.log_id || "");

      console.error("[TikTok Publisher] FINAL ERROR — code:", code, "message:", message, "log_id:", logId, "HTTP:", response.status);

      if (code === "access_token_invalid" || message.toLowerCase().includes("access token")) {
        return {
          success: false,
          error:
            "TikTok access token has expired or is invalid. Please disconnect and reconnect your TikTok account from the Integrations page.",
          platform: "TIKTOK",
        };
      }

      // content-sharing-guidelines or integration guidelines error
      if (message.includes("guidelines") || message.includes("content-sharing")) {
        return {
          success: false,
          error:
            `TikTok rejected the post because your app is in Sandbox/Developer mode and has not passed the TikTok App Review (audit). To fix: go to developers.tiktok.com → your app → submit for App Review to get Content Posting API approved. Until then, TikTok blocks all Direct Post requests. (Error: ${code || message})`,
          platform: "TIKTOK",
        };
      }

      if (
        code.includes("privacy_level") ||
        message.toLowerCase().includes("audit") ||
        message.toLowerCase().includes("permission")
      ) {
        return {
          success: false,
          error:
            'Your TikTok app is in developer mode, so posts can only be private. Complete the Content Posting API verification (app audit) in the TikTok developer console to enable posting.',
          platform: "TIKTOK",
        };
      }
      if (code === "scope_not_authorized" || code.includes("scope")) {
        return {
          success: false,
          error:
            "TikTok account token is missing the video.publish permission. Reconnect your TikTok account from the Integrations page.",
          platform: "TIKTOK",
        };
      }

      return {
        success: false,
        error: `TikTok: ${message || code || `publish failed (HTTP ${response.status})`}`,
        platform: "TIKTOK",
      };
    }

    const uploadUrl = data?.data?.upload_url;
    if (!uploadUrl) {
      return {
        success: false,
        error: "TikTok did not return a valid upload URL for the video.",
        platform: "TIKTOK",
      };
    }

    // Step 2: Upload video binary to TikTok's upload_url
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
        "Content-Length": String(videoSize),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok && uploadRes.status !== 201 && uploadRes.status !== 204) {
      const uploadErrText = await uploadRes.text().catch(() => "");
      return {
        success: false,
        error: `Failed to upload video data to TikTok (HTTP ${uploadRes.status})${uploadErrText ? `: ${uploadErrText.slice(0, 120)}` : ""}`,
        platform: "TIKTOK",
      };
    }

    return {
      success: true,
      platformPostId: data?.data?.publish_id,
      platform: "TIKTOK",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error publishing to TikTok",
      platform: "TIKTOK",
    };
  }
}
