import { PublishResult } from './index';

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
function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://socialflow-ai-akel.vercel.app';
}

function toPublicMediaUrl(url: string, postId: string, slideIdx = 0): string {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return `${getAppBaseUrl()}/api/media/${postId}?idx=${slideIdx}`;
  if (url.startsWith('/')) return `${getAppBaseUrl()}${url}`;
  return url;
}

export async function publishToTikTok(post: any, account: any): Promise<PublishResult> {
  try {
    const accessToken = account.accessToken;

    if (!accessToken) {
      return { success: false, error: 'Missing TikTok account credentials', platform: 'TIKTOK' };
    }

    const rawVideoUrl: string | undefined = post.imageUrl || post.mediaHistory?.mediaUrls?.[0];
    if (!rawVideoUrl) {
      return { success: false, error: 'TikTok posts require a video', platform: 'TIKTOK' };
    }

    const publicVideoUrl = toPublicMediaUrl(rawVideoUrl, post.id);

    const settings = post.settings || {};
    const privacyMap: Record<string, string> = {
      everyone: 'PUBLIC_TO_EVERYONE',
      friends: 'MUTUAL_FOLLOW_FRIENDS',
      private: 'SELF_ONLY',
    };

    // TikTok title = caption + hashtags, hard limit 2200 chars (API rejects beyond that)
    const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
    const title = [post.content || '', hashtags.join(' ')]
      .filter(Boolean)
      .join(' ')
      .slice(0, 2200)
      .trim();

    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title,
          privacy_level: privacyMap[settings.tiktokPrivacy] || 'PUBLIC_TO_EVERYONE',
          disable_comment: settings.tiktokDisableComments === true,
          disable_duet: settings.tiktokDisableDuet === true,
          disable_stitch: settings.tiktokDisableStitch === true,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: publicVideoUrl,
        },
      }),
    });

    const data = await response.json().catch(() => ({}));

    // TikTok returns { data: { publish_id }, error: { code, message } } —
    // HTTP 200 with error.code !== 'ok' is still a failure.
    const apiError = data?.error;
    if (!response.ok || (apiError && apiError.code && apiError.code !== 'ok')) {
      const code = String(apiError?.code || '');
      const message = String(apiError?.message || '');

      // Unaudited apps may only Direct Post as SELF_ONLY — turn the cryptic API
      // error into actionable guidance instead of a raw code.
      if (
        code.includes('privacy_level') ||
        message.toLowerCase().includes('audit') ||
        message.toLowerCase().includes('permission')
      ) {
        return {
          success: false,
          error:
            'Your TikTok app is not verified yet, so posts can only be private. Set "Who Can View" to "Only Me" to publish now, or complete the Content Posting API verification (app audit) in the TikTok developer console to enable public posting.',
          platform: 'TIKTOK',
        };
      }
      if (code === 'scope_not_authorized' || code.includes('scope')) {
        return {
          success: false,
          error:
            'TikTok account token is missing the video.publish permission. Reconnect your TikTok account from the Integrations page.',
          platform: 'TIKTOK',
        };
      }

      return {
        success: false,
        error: apiError?.message || apiError?.code || `TikTok publish failed (HTTP ${response.status})`,
        platform: 'TIKTOK',
      };
    }

    return {
      success: true,
      platformPostId: data?.data?.publish_id,
      platform: 'TIKTOK',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error publishing to TikTok',
      platform: 'TIKTOK',
    };
  }
}
