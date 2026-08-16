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
export async function publishToYouTube(post: any, account: any): Promise<PublishResult> {
  try {
    const accessToken = account.accessToken;

    if (!accessToken) {
      return { success: false, error: 'Missing YouTube account credentials', platform: 'YOUTUBE' };
    }

    const videoUrl: string | undefined = post.imageUrl || post.mediaHistory?.mediaUrls?.[0];
    if (!videoUrl) {
      return { success: false, error: 'YouTube uploads require a video', platform: 'YOUTUBE' };
    }
    if (videoUrl.startsWith('data:')) {
      return {
        success: false,
        error: 'YouTube needs a public video URL — data: URLs cannot be uploaded',
        platform: 'YOUTUBE',
      };
    }

    // Download the video bytes (resumable upload requires the payload server-side)
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      return { success: false, error: `Could not download the video for upload (HTTP ${videoRes.status})`, platform: 'YOUTUBE' };
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

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

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => null);
      return {
        success: false,
        error: err?.error?.message || `Failed to start YouTube upload (HTTP ${initRes.status})`,
        platform: 'YOUTUBE',
      };
    }

    const uploadUrl = initRes.headers.get('location');
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

    return {
      success: true,
      platformPostId: uploadData?.id,
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
