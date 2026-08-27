import { PublishResult } from './index';

// Graph API v23.0 (released May 2025, supported until Oct 2027).
// v19.0 was deprecated and removed on May 21, 2026 — every call to it now fails.
const GRAPH_VERSION = 'v23.0';

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost') && !process.env.NEXT_PUBLIC_APP_URL.includes('127.0.0.1')) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://socialflow-ai-akel.vercel.app';
}

function toPublicMediaUrl(url: string, postId: string, slideIdx = 0): string {
  if (!url) return url;
  // Already a fully-qualified public URL (Supabase CDN, external CDN, etc.) — use as-is
  if (url.startsWith('https://')) return url;
  // Our internal asset streaming endpoint — prepend app base URL
  if (url.startsWith('/api/media/')) return `${getAppBaseUrl()}${url}`;
  // Any other relative path or problematic URL — proxy through our media endpoint
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('/') ||
    !url.startsWith('http')
  ) {
    return `${getAppBaseUrl()}/api/media/${postId}?idx=${slideIdx}`;
  }
  return url;
}

function collectMediaUrls(post: any): string[] {
  const history = post.mediaHistory as any;
  if (history?.mediaUrls && Array.isArray(history.mediaUrls) && history.mediaUrls.length > 0) {
    return history.mediaUrls.filter(Boolean).map((u: string) => String(u));
  }
  if (post.imageUrl) return [post.imageUrl];
  return [];
}

export async function publishToFacebook(post: any, account: any): Promise<PublishResult> {
  try {
    let targetPageId = account.accountId;
    let targetAccessToken = account.accessToken;
    
    if (!targetPageId || !targetAccessToken) {
      return {
        success: false,
        error: 'Missing Facebook account credentials. Please reconnect your Facebook Page in Integrations.',
        platform: 'FACEBOOK',
      };
    }

    // Attempt to resolve the user's primary Facebook Page and Page Access Token
    try {
      const accountsRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token,category&access_token=${targetAccessToken}`
      );
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const pagesList = Array.isArray(accountsData?.data) ? accountsData.data : [];
        if (pagesList.length > 0) {
          const matchedPage =
            pagesList.find((p: any) => p.id === targetPageId || p.name === account.pageName) ||
            pagesList[0];
          if (matchedPage?.id && matchedPage?.access_token) {
            targetPageId = matchedPage.id;
            targetAccessToken = matchedPage.access_token;
          }
        }
      }
    } catch {
      // Continue with saved credentials
    }

    const { content } = post;
    const mediaUrls = collectMediaUrls(post);
    const caption = [content, Array.isArray(post.hashtags) ? post.hashtags.join(' ') : '']
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const format = String(post.format || '').toLowerCase();
    const isVideo = post.mediaType === 'video' || format.includes('reel') || format.includes('video') || (mediaUrls[0] || '').endsWith('.mp4') || (mediaUrls[0] || '').includes('video');
    const isMultiPhoto = mediaUrls.length > 1 && !isVideo;

    let response: Response;

    if (isVideo) {
      // Page video / Reel — Graph uploads via public file_url
      const videoUrl = toPublicMediaUrl(mediaUrls[0], post.id);
      response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: targetAccessToken,
          file_url: videoUrl,
          description: caption || undefined,
          title: post.settings?.contentTitle || undefined,
        }),
      });
    } else if (isMultiPhoto) {
      // Multiple photos: upload each as an unpublished photo, then publish one
      // feed post that attaches all of them.
      const attachedMedia: string[] = [];
      for (let i = 0; i < Math.min(mediaUrls.length, 10); i++) {
        const photoUrl = toPublicMediaUrl(mediaUrls[i], post.id, i);
        const photoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: targetAccessToken,
            url: photoUrl,
            published: false,
          }),
        });
        const photoData = await photoRes.json().catch(() => ({}));
        if (!photoRes.ok || !photoData.id) {
          return {
            success: false,
            error: photoData.error?.message || `Failed to upload photo ${i + 1} (HTTP ${photoRes.status})`,
            platform: 'FACEBOOK',
          };
        }
        attachedMedia.push(photoData.id);
      }

      response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: targetAccessToken,
          message: caption || undefined,
          attached_media: attachedMedia.map((id) => ({ media_fbid: id })),
        }),
      });
    } else if (mediaUrls[0]) {
      const imageUrl = mediaUrls[0];
      if (imageUrl.startsWith('data:')) {
        // Direct Multipart Binary Upload to Facebook Photos API
        const match = imageUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const mimeType = match[1] || 'image/png';
          const buffer = Buffer.from(match[2], 'base64');
          const blob = new Blob([buffer], { type: mimeType });

          const formData = new FormData();
          formData.append('access_token', targetAccessToken);
          formData.append('source', blob, `facebook_post_${Date.now()}.png`);
          if (caption) {
            formData.append('caption', caption);
          }

          response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photos`, {
            method: 'POST',
            body: formData,
          });
        } else {
          response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: targetAccessToken,
              url: toPublicMediaUrl(imageUrl, post.id),
              caption: caption || undefined,
            }),
          });
        }
      } else {
        response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: targetAccessToken,
            url: imageUrl,
            caption: caption || undefined,
          }),
        });
      }
    } else {
      // Text-only feed post
      response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: targetAccessToken,
          message: caption || content || '',
        }),
      });
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      const rawError = data.error?.message || `Facebook API error (HTTP ${response.status})`;
      if (rawError.includes('publish_actions') || rawError.includes('permission')) {
        return {
          success: false,
          error: `Meta requires a Facebook Page with admin/manage permissions. Please reconnect your Facebook account in Integrations so the app can obtain your Page Token.`,
          platform: 'FACEBOOK',
        };
      }
      return { success: false, error: rawError, platform: 'FACEBOOK' };
    }

    const rawPostId = data.post_id || data.id;
    const liveUrl = isVideo
      ? `https://www.facebook.com/${targetPageId}/videos/${rawPostId}`
      : `https://www.facebook.com/${rawPostId}`;

    return {
      success: true,
      platformPostId: rawPostId,
      liveUrl,
      platform: 'FACEBOOK',
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to Facebook', platform: 'FACEBOOK' };
  }
}
