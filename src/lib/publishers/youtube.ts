import { PublishResult } from './index';

/**
 * REAL YouTube publisher — Data API v3 resumable video upload.
 *
 * Flow:
 *   1. POST /upload/youtube/v3/videos?uploadType=resumable (metadata) → session URL
 *   2. PUT the video bytes to the session URL
 *
 * Settings tab mapping (post.settings):
 *   youtubePrivacy      → status.privacyStatus (public / unlisted / private)
 *   youtubeMadeForKids  → status.selfDeclaredMadeForKids
 *   youtubeTags         → snippet.tags (comma-separated string, max 15)
 *   contentTitle        → snippet.title (carried from the editor's Video Title field)
 *   contentDescription  → snippet.description (editor description)
 */
/**
 * Refresh a YouTube (Google) access token using the stored refresh_token.
 */
async function refreshYouTubeAccessToken(account: any): Promise<string | null> {
  try {
    const clientId = process.env.YOUTUBE_CLIENT_ID || "";
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
    const refreshToken = account.refreshToken;

    if (!refreshToken || !clientId || !clientSecret) return null;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    const data = await res.json();
    if (data.access_token) {
      // Persist the new token to DB
      const prisma = (await import("@/lib/db")).default;
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: data.access_token,
          tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
        },
      });
      console.log("[YouTube Publisher] Token refreshed successfully");
      return data.access_token;
    }
    console.warn("[YouTube Publisher] Token refresh response:", JSON.stringify(data));
  } catch (err) {
    console.warn("[YouTube Publisher] Error refreshing token:", err);
  }
  return null;
}

export async function publishToYouTube(post: any, account: any): Promise<PublishResult> {
  try {
    let accessToken = account.accessToken;

    if (!accessToken) {
      return { success: false, error: 'Missing YouTube account credentials', platform: 'YOUTUBE' };
    }

    // Auto-refresh token if expired or close to expiry (within 5 minutes)
    if (account.refreshToken && account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + 300000) {
      const refreshed = await refreshYouTubeAccessToken(account);
      if (refreshed) accessToken = refreshed;
    }

    const videoUrl: string | undefined = post.imageUrl || post.mediaHistory?.mediaUrls?.[0];
    if (!videoUrl) {
      return { success: false, error: 'YouTube uploads require a video', platform: 'YOUTUBE' };
    }

    let videoBuffer: Buffer;
    if (videoUrl.startsWith('data:')) {
      const match = videoUrl.match(/^data:([^;]+);base64,(.*)$/);
      const base64Data = match ? match[2] : videoUrl;
      videoBuffer = Buffer.from(base64Data, 'base64');
    } else if (videoUrl.includes('/api/media/')) {
      const assetId = videoUrl.split('/api/media/asset/')[1] || videoUrl.split('/api/media/')[1];
      const prisma = (await import('@/lib/db')).default;
      const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId.replace(/^asset-/, '') } });
      if (asset && asset.url) {
        if (asset.url.startsWith('data:')) {
          const match = asset.url.match(/^data:([^;]+);base64,(.*)$/);
          videoBuffer = Buffer.from(match ? match[2] : asset.url, 'base64');
        } else {
          const videoRes = await fetch(asset.url);
          videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        }
      } else {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://socialflow-ai-akel.vercel.app').replace(/\/$/, '');
        const fullVideoUrl = `${appUrl}${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
        const videoRes = await fetch(fullVideoUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!videoRes.ok) throw new Error(`Could not download the video for upload (HTTP ${videoRes.status})`);
        videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      }
    } else if (videoUrl.startsWith('/uploads/') || videoUrl.startsWith('uploads/')) {
      const fs = await import('fs');
      const path = await import('path');
      const cleanPath = videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl;
      const diskPath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(diskPath)) {
        videoBuffer = await fs.promises.readFile(diskPath);
      } else {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://socialflow-ai-akel.vercel.app').replace(/\/$/, '');
        const fullVideoUrl = `${appUrl}/${cleanPath}`;
        const videoRes = await fetch(fullVideoUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!videoRes.ok) throw new Error(`Could not download the video for upload (HTTP ${videoRes.status})`);
        videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      }
    } else {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://socialflow-ai-akel.vercel.app').replace(/\/$/, '');
      const fullVideoUrl = videoUrl.startsWith('/') ? `${appUrl}${videoUrl}` : videoUrl;
      const videoRes = await fetch(fullVideoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'video/*,*/*',
          'Referer': fullVideoUrl.includes('pixabay.com') ? 'https://pixabay.com/' : '',
        },
      });
      if (!videoRes.ok) {
        return {
          success: false,
          error: `Could not download the video for upload (HTTP ${videoRes.status})`,
          platform: 'YOUTUBE',
        };
      }
      videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    }

    const settings = post.settings || {};
    const title = String(
      settings.contentTitle || (post.content || '').split('\n')[0] || 'Untitled video'
    ).slice(0, 100).trim();
    const description = String(settings.contentDescription || post.content || '').slice(0, 5000);
    const tags = typeof settings.youtubeTags === 'string'
      ? settings.youtubeTags.split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 15)
      : [];
    const privacyStatus = ['public', 'unlisted', 'private'].includes(settings.youtubePrivacy)
      ? settings.youtubePrivacy
      : 'public';

    // Step 1: start a resumable session with the video metadata
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(videoBuffer.length),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: { title, description, tags, categoryId: '22' },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: settings.youtubeMadeForKids === true,
          },
        }),
      }
    );

    // If 401, try refreshing token and retry once
    let finalInitRes = initRes;
    if (initRes.status === 401 && account.refreshToken) {
      const refreshed = await refreshYouTubeAccessToken(account);
      if (refreshed) {
        accessToken = refreshed;
        finalInitRes = await fetch(
          'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8',
              'X-Upload-Content-Length': String(videoBuffer.length),
              'X-Upload-Content-Type': 'video/mp4',
            },
            body: JSON.stringify({
              snippet: { title, description, tags, categoryId: '22' },
              status: {
                privacyStatus,
                selfDeclaredMadeForKids: settings.youtubeMadeForKids === true,
              },
            }),
          }
        );
      }
    }

    if (!finalInitRes.ok) {
      const err = await finalInitRes.json().catch(() => null);
      return {
        success: false,
        error: err?.error?.message || `Failed to start YouTube upload (HTTP ${finalInitRes.status})`,
        platform: 'YOUTUBE',
      };
    }

    const uploadUrl = finalInitRes.headers.get('location');
    if (!uploadUrl) {
      return { success: false, error: 'YouTube did not return an upload session URL', platform: 'YOUTUBE' };
    }

    // Step 2: upload the video bytes to the session URL
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBuffer.length),
      },
      body: new Uint8Array(videoBuffer),
    });

    const uploadData = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      return {
        success: false,
        error: uploadData?.error?.message || `YouTube video upload failed (HTTP ${uploadRes.status})`,
        platform: 'YOUTUBE',
      };
    }

    const videoId = uploadData?.id;
    return {
      success: true,
      platformPostId: videoId,
      liveUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : 'https://www.youtube.com/',
      platform: 'YOUTUBE',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error publishing to YouTube',
      platform: 'YOUTUBE',
    };
  }
}
