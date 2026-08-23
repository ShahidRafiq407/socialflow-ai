import { PublishResult } from './index';

// Server-side fetch() cannot follow relative paths — convert "/api/media/..."
// to an absolute URL using the app's public origin.
function resolveAbsoluteMediaUrl(url: string): string {
  if (!url) return url;
  if (/^(https?:|data:)/i.test(url)) return url;
  let base = process.env.NEXT_PUBLIC_APP_URL || '';
  if (!base && process.env.VERCEL_URL) base = `https://${process.env.VERCEL_URL}`;
  if (!base) return url;
  return `${base.replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

// LinkedIn UGC share commentary hard limit is 3000 characters.
const LINKEDIN_MAX_TEXT = 3000;

export async function publishToLinkedIn(post: any, account: any): Promise<PublishResult> {
  try {
    const personUrn = account.accountId;
    const accessToken = account.accessToken;
    
    if (!personUrn || !accessToken) {
      return {
        success: false,
        error: 'Missing LinkedIn account credentials. Please reconnect LinkedIn in Integrations.',
        platform: 'LINKEDIN',
      };
    }

    const { content, imageUrl } = post;
    const hashtagList: string[] = Array.isArray(post.hashtags)
      ? post.hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`))
      : typeof post.hashtags === 'string'
      ? post.hashtags.split(/\s+/).filter(Boolean).map((h: string) => (h.startsWith('#') ? h : `#${h}`))
      : [];

    const hashtagString = hashtagList.join(' ');
    const fullCaption = [
      post.settings?.contentTitle ? `${post.settings.contentTitle}\n` : '',
      content,
      hashtagString,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const safeCaption =
      fullCaption.length > LINKEDIN_MAX_TEXT
        ? `${fullCaption.slice(0, LINKEDIN_MAX_TEXT - 3)}...`
        : fullCaption || content || '';

    let specificContent: any = {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: safeCaption,
        },
        shareMediaCategory: 'NONE',
      },
    };

    // If media is attached, perform the 3-step LinkedIn Asset Upload per image.
    // Multi-Image posts upload every slide (up to 9) into one media array.
    const history = post.mediaHistory as any;
    const attachedUrls: string[] = Array.isArray(history?.mediaUrls) && history.mediaUrls.length > 0
      ? history.mediaUrls.filter(Boolean).map((u: string) => String(u))
      : imageUrl
      ? [imageUrl]
      : [];

    const uploadedMedia: { status: string; description: { text: string }; media: string; title: { text: string } }[] = [];

    for (let i = 0; i < Math.min(attachedUrls.length, 9); i++) {
      const rawUrl = attachedUrls[i];
      try {
        const absoluteImageUrl = resolveAbsoluteMediaUrl(rawUrl);
        // Step 1: Register upload with LinkedIn
        const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner: `urn:li:person:${personUrn}`,
              supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
            },
          }),
        });

        if (!regRes.ok) {
          const regErr = await regRes.text().catch(() => '');
          console.warn(`[LinkedIn Publisher] registerUpload failed (${regRes.status}):`, regErr.slice(0, 500));
          continue;
        }

        const regData = await regRes.json();
        const assetUrn = regData.value?.asset;
        const uploadUrl =
          regData.value?.uploadMechanism?.[
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
          ]?.uploadUrl;

        if (!assetUrn || !uploadUrl) continue;

        // Step 2: Extract binary bytes and PUT to LinkedIn uploadUrl
        let buffer: Buffer;
        let mimeType = 'image/png';

        if (rawUrl.startsWith('data:')) {
          const match = rawUrl.match(/^data:([^;]+);base64,(.*)$/);
          mimeType = match ? match[1] : 'image/png';
          buffer = Buffer.from(match ? match[2] : rawUrl, 'base64');
        } else if (rawUrl.includes('/api/media/')) {
          const assetId = rawUrl.split('/api/media/asset/')[1] || rawUrl.split('/api/media/')[1];
          const prisma = (await import('@/lib/db')).default;
          const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId.replace(/^asset-/, '') } });
          if (asset && asset.url) {
            if (asset.url.startsWith('data:')) {
              const match = asset.url.match(/^data:([^;]+);base64,(.*)$/);
              mimeType = match ? match[1] : (asset.contentType || 'image/png');
              buffer = Buffer.from(match ? match[2] : asset.url, 'base64');
            } else {
              const imgRes = await fetch(asset.url);
              buffer = Buffer.from(await imgRes.arrayBuffer());
              mimeType = imgRes.headers.get('content-type') || asset.contentType || 'image/png';
            }
          } else {
            const imgRes = await fetch(absoluteImageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            buffer = Buffer.from(await imgRes.arrayBuffer());
            mimeType = imgRes.headers.get('content-type') || 'image/png';
          }
        } else if (rawUrl.startsWith('/uploads/') || rawUrl.startsWith('uploads/')) {
          const fs = await import('fs');
          const path = await import('path');
          const cleanPath = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
          const diskPath = path.join(process.cwd(), 'public', cleanPath);
          if (fs.existsSync(diskPath)) {
            buffer = await fs.promises.readFile(diskPath);
            mimeType = diskPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
          } else {
            const imgRes = await fetch(absoluteImageUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });
            if (!imgRes.ok) throw new Error(`Failed to download media for LinkedIn upload (${imgRes.status}).`);
            buffer = Buffer.from(await imgRes.arrayBuffer());
            mimeType = imgRes.headers.get('content-type') || 'image/png';
          }
        } else {
          const imgRes = await fetch(absoluteImageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/*,video/*,*/*',
              'Referer': absoluteImageUrl.includes('pixabay.com') ? 'https://pixabay.com/' : '',
            },
          });
          if (!imgRes.ok) {
            throw new Error(`Failed to download media for LinkedIn upload (${imgRes.status}).`);
          }
          buffer = Buffer.from(await imgRes.arrayBuffer());
          mimeType = imgRes.headers.get('content-type') || 'image/png';
        }

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': mimeType,
          },
          body: new Uint8Array(buffer),
        });

        if (!(uploadRes.ok || uploadRes.status === 201)) {
          const uploadErrBody = await uploadRes.text().catch(() => '');
          console.warn(`[LinkedIn Publisher] Binary asset PUT failed (${uploadRes.status}):`, uploadErrBody.slice(0, 500));
          continue;
        }

        const imageAltText =
          (i === 0 ? post.settings?.altText : undefined) ||
          post.settings?.contentDescription ||
          post.imagePrompt ||
          content?.slice(0, 200) ||
          'SMB Robotics Visual';

        const imageTitle =
          (i === 0 ? post.settings?.contentTitle : undefined) ||
          post.campaignTopic ||
          'SMB Robotics Post';

        // Step 3: Attach uploaded asset URN, Alt Text & Title to post
        uploadedMedia.push({
          status: 'READY',
          description: {
            text: imageAltText.slice(0, 400),
          },
          media: assetUrn,
          title: {
            text: imageTitle.slice(0, 200),
          },
        });
      } catch (uploadErr) {
        console.warn(`[LinkedIn Publisher] Image ${i + 1} upload failed, skipping:`, uploadErr);
      }
    }

    if (uploadedMedia.length > 0) {
      specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
      specificContent['com.linkedin.ugc.ShareContent'].media = uploadedMedia;
    }

    const url = 'https://api.linkedin.com/v2/ugcPosts';
    const settings = post.settings || {};
    const visibilityCode =
      settings.linkedinVisibility === 'connections'
        ? 'CONNECTIONS'
        : 'PUBLIC';

    const body = {
      author: `urn:li:person:${personUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent,
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibilityCode,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    // LinkedIn deprecated /v2/ugcPosts in favor of /rest/posts. When ugcPosts is
    // rejected (404/410 gone, or 403 permission revoked), retry via the Posts API.
    if (!response.ok || data.error) {
      const restResult = await publishViaRestPosts({
        personUrn,
        accessToken,
        commentary: safeCaption,
        visibilityCode,
        firstMedia: uploadedMedia[0] || null,
      });

      if (restResult.success && restResult.postUrn) {
        return {
          success: true,
          platformPostId: restResult.postUrn,
          liveUrl: `https://www.linkedin.com/feed/update/${restResult.postUrn}`,
          platform: 'LINKEDIN',
        };
      }

      return {
        success: false,
        error:
          (data.message || data.error?.message || `Failed to publish to LinkedIn (${response.status})`) +
          (restResult.error ? ` — Posts API fallback also failed: ${restResult.error}` : ''),
        platform: 'LINKEDIN',
      };
    }

    return {
      success: true,
      platformPostId: data.id,
      liveUrl: `https://www.linkedin.com/feed/update/${data.id}`,
      platform: 'LINKEDIN',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error publishing to LinkedIn',
      platform: 'LINKEDIN',
    };
  }
}

/**
 * Posts API (/rest/posts) — LinkedIn's replacement for the deprecated ugcPosts
 * endpoint. Used as an automatic fallback whenever ugcPosts rejects a publish.
 */
async function publishViaRestPosts(params: {
  personUrn: string;
  accessToken: string;
  commentary: string;
  visibilityCode: string;
  firstMedia: { media: string; title: { text: string }; description: { text: string } } | null;
}): Promise<{ success: boolean; postUrn?: string; error?: string }> {
  try {
    const { personUrn, accessToken, commentary, visibilityCode, firstMedia } = params;

    const body: any = {
      author: `urn:li:person:${personUrn}`,
      commentary,
      visibility: visibilityCode,
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    if (firstMedia?.media) {
      body.content = {
        media: {
          id: firstMedia.media,
          title: firstMedia.title?.text || undefined,
          altText: firstMedia.description?.text || undefined,
        },
      };
    }

    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202507',
      },
      body: JSON.stringify(body),
    });

    if (res.ok || res.status === 201) {
      const postUrn =
        res.headers.get('x-restli-id') ||
        res.headers.get('x-linkedin-id') ||
        '';
      if (!postUrn) {
        return { success: false, error: 'Posts API returned no post URN header.' };
      }
      return { success: true, postUrn };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errData.message || errData.error || `LinkedIn Posts API error (HTTP ${res.status})`,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'LinkedIn Posts API fallback failed' };
  }
}
