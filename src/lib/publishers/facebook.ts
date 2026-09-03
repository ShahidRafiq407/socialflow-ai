import { PublishResult } from './index';
import { toPublicMediaUrl, collectMediaUrls, parseDataUri } from '@/lib/media/urls';

// Graph API v23.0 (released May 2025, supported until Oct 2027).
// v19.0 was deprecated and removed on May 21, 2026 — every call to it now fails.
const GRAPH_VERSION = 'v23.0';

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
    const isStory = format.includes('story');
    const isVideo = post.mediaType === 'video' || format.includes('reel') || format.includes('video') || (mediaUrls[0] || '').endsWith('.mp4') || (mediaUrls[0] || '').includes('video');
    const isMultiPhoto = mediaUrls.length > 1 && !isVideo && !isStory;

    let response: Response;

    if (isStory) {
      if (isVideo) {
        const videoUrl = toPublicMediaUrl(mediaUrls[0], post.id);

        // Fetch video to get buffer and file_size
        const vidRes = await fetch(videoUrl);
        const vidBuffer = Buffer.from(await vidRes.arrayBuffer());
        const fileSize = vidBuffer.length;

        // 1. START Phase
        const startRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/video_stories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: targetAccessToken,
            upload_phase: 'start',
            file_size: fileSize,
          }),
        });
        
        const startData = await startRes.json().catch(() => ({}));
        if (!startRes.ok || !startData.video_id) {
          return {
            success: false,
            error: startData.error?.message || 'Failed to start Facebook Video Story upload',
            platform: 'FACEBOOK',
          };
        }

        const videoId = startData.video_id;
        const uploadUrl = startData.upload_url || `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${videoId}`;

        // 2. TRANSFER Phase
        // rupload requires BOTH the `offset` and `file_size` headers — missing
        // `file_size` makes the transfer phase reject the upload with a generic
        // "Failed to transfer Facebook Video Story" error.
        const transferRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `OAuth ${targetAccessToken}`,
            'offset': '0',
            'file_size': fileSize.toString(),
            'Content-Type': 'application/octet-stream'
          },
          body: vidBuffer,
        });

        const transferData = await transferRes.json().catch(() => ({}));
        if (!transferRes.ok) {
          return {
            success: false,
            error: transferData.error?.message || 'Failed to transfer Facebook Video Story',
            platform: 'FACEBOOK',
          };
        }

        // 3. FINISH Phase
        response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/video_stories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: targetAccessToken,
            upload_phase: 'finish',
            video_id: videoId,
          }),
        });
      } else {
        const photoUrl = toPublicMediaUrl(mediaUrls[0], post.id);
        response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photo_stories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: targetAccessToken,
            url: photoUrl,
          }),
        });
      }
    } else if (isVideo) {
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
        const itemUrl = mediaUrls[i];
        let photoRes: Response;

        if (itemUrl.startsWith('data:')) {
          const parsed = parseDataUri(itemUrl);
          if (parsed) {
            const mimeType = parsed.mimeType || 'image/png';
            const buffer = Buffer.from(parsed.base64, 'base64');
            const blob = new Blob([buffer], { type: mimeType });

            const formData = new FormData();
            formData.append('access_token', targetAccessToken);
            formData.append('source', blob, `facebook_photo_${i}_${Date.now()}.png`);
            formData.append('published', 'false');

            photoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photos`, {
              method: 'POST',
              body: formData,
            });
          } else {
            const photoUrl = toPublicMediaUrl(itemUrl, post.id, i);
            photoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                access_token: targetAccessToken,
                url: photoUrl,
                published: false,
              }),
            });
          }
        } else {
          const photoUrl = toPublicMediaUrl(itemUrl, post.id, i);
          photoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPageId}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: targetAccessToken,
              url: photoUrl,
              published: false,
            }),
          });
        }

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
        const parsed = parseDataUri(imageUrl);
        if (parsed) {
          const mimeType = parsed.mimeType || 'image/png';
          const buffer = Buffer.from(parsed.base64, 'base64');
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
            url: toPublicMediaUrl(imageUrl, post.id),
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

    // Verify the story actually exists before claiming success — the
    // video_stories "finish" phase can return an id even when the story
    // never went live (processing failure, invalid video), which previously
    // surfaced as a success modal with a dead "content isn't available" link.
    if (isStory && rawPostId) {
      try {
        const verifyRes = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${rawPostId}?fields=status,id&access_token=${targetAccessToken}`
        );
        const verifyData = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok || verifyData.error) {
          return {
            success: false,
            error: verifyData.error?.message || 'Facebook accepted the story upload but the story did not go live. The video may still be processing — try again in a minute.',
            platform: 'FACEBOOK',
          };
        }
      } catch {
        // Verification is best-effort — don't fail a live story on a flaky check.
      }
    }

    // Stories are NOT regular feed posts: facebook.com/{id} shows the
    // "This content isn't available right now" page. Stories live in the
    // story tray and use the /stories/{id} permalink format (visible for 24h,
    // mostly in the app / mobile web).
    const liveUrl = isStory
      ? rawPostId
        ? `https://www.facebook.com/stories/${rawPostId}`
        : `https://www.facebook.com/${targetPageId}`
      : isVideo
      ? `https://www.facebook.com/${targetPageId}/videos/${rawPostId}`
      : `https://www.facebook.com/${rawPostId}`;

    // First comment — posted right after the feed post goes live (best-effort).
    const firstComment = String(post.settings?.firstComment || '').trim();
    if (firstComment && rawPostId) {
      try {
        await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${rawPostId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: targetAccessToken,
            message: firstComment.slice(0, 8000),
          }),
        });
      } catch (commentErr) {
        console.warn('[Facebook Publisher] First comment failed:', commentErr);
      }
    }

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
