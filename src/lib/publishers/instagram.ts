import { PublishResult } from './index';

// Graph API v23.0 (released May 2025, supported until Oct 2027).
// v19.0 was deprecated and removed on May 21, 2026 — every call to it now fails.
const GRAPH_VERSION = 'v23.0';
const IG_CAPTION_LIMIT = 2200;

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost') && !process.env.NEXT_PUBLIC_APP_URL.includes('127.0.0.1')) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://socialflow-ai-akel.vercel.app';
}

// Meta's crawler fetches media over public HTTPS. base64 data URIs, relative
// paths, and hotlink-protected stock CDNs (Pixabay) are rewritten to our public streaming endpoint (/api/media/[postId]).
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

export async function publishToInstagram(post: any, account: any): Promise<PublishResult> {
  try {
    let igUserId = account.accountId;
    let accessToken = account.accessToken;
    
    if (!igUserId || !accessToken) {
      return {
        success: false,
        error: 'Missing Instagram account credentials. Please connect your Instagram Business account in Integrations.',
        platform: 'INSTAGRAM',
      };
    }

    // Step 0: Ensure we have a valid Instagram Business Account ID (not a Facebook Page ID)
    // 0A: Check if igUserId is a Page ID that has an instagram_business_account or connected_instagram_account
    try {
      const inspectRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}?fields=id,username,instagram_business_account,connected_instagram_account,access_token&access_token=${accessToken}`
      );
      if (inspectRes.ok) {
        const inspectData = await inspectRes.json();
        const foundIg = inspectData.instagram_business_account?.id || inspectData.connected_instagram_account?.id;
        if (foundIg) {
          igUserId = foundIg;
          if (inspectData.access_token) accessToken = inspectData.access_token;
        }
      }
    } catch {}

    // 0B: If still not an IG business account (or if inspect failed), scan user's connected Facebook pages
    if (!igUserId.startsWith('17841')) {
      try {
        const pagesRes = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}&access_token=${accessToken}`
        );
        if (pagesRes.ok) {
          const pagesData = await pagesRes.json();
          for (const p of pagesData?.data || []) {
            const igAcc = p.instagram_business_account?.id || p.connected_instagram_account?.id;
            if (igAcc) {
              igUserId = igAcc;
              if (p.access_token) accessToken = p.access_token;
              break;
            }
          }
        }
      } catch {}
    }

    // 0C: If still not found, scan Meta Business Portfolios (SMB Robotics portfolio)
    if (!igUserId.startsWith('17841')) {
      try {
        const bizRes = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/me/businesses?fields=id,name,instagram_accounts{id,username},owned_instagram_accounts{id,username}&access_token=${accessToken}`
        );
        if (bizRes.ok) {
          const bizData = await bizRes.json();
          for (const biz of bizData?.data || []) {
            const igList = biz.instagram_accounts?.data || biz.owned_instagram_accounts?.data || [];
            if (igList.length > 0) {
              igUserId = igList[0].id;
              break;
            }
          }
        }
      } catch {}
    }

    // 0D: Direct fallback for SMB Robotics Business Portfolio (ID: 1772056396948184 from Meta Business Suite)
    if (!igUserId.startsWith('17841')) {
      try {
        const directBizRes = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/1772056396948184/instagram_accounts?fields=id,username,name&access_token=${accessToken}`
        );
        if (directBizRes.ok) {
          const directBizData = await directBizRes.json();
          if (directBizData?.data?.[0]?.id) {
            igUserId = directBizData.data[0].id;
          }
        }
      } catch {}
    }

    const { content } = post;
    const mediaUrls = collectMediaUrls(post);

    if (mediaUrls.length === 0) {
      return {
        success: false,
        error: 'Instagram posts require an image or video asset',
        platform: 'INSTAGRAM',
      };
    }

    const caption = [content, Array.isArray(post.hashtags) ? post.hashtags.join(' ') : '']
      .filter(Boolean)
      .join('\n\n')
      .trim()
      .slice(0, IG_CAPTION_LIMIT);

    const format = String(post.format || 'Feed').toLowerCase();
    const isStory = format === 'story';
    const isCarousel = format === 'carousel' || post.mediaType === 'carousel';
    const isVideo = post.mediaType === 'video' || format.includes('reel') || format.includes('video') || (mediaUrls[0] || '').endsWith('.mp4') || (mediaUrls[0] || '').includes('video');

    // Stories publish as STORIES media and can't carry a caption — IG auto-hides
    // the caption on story posts anyway.
    const containerBody: Record<string, any> = {
      caption: isStory ? '' : caption,
      access_token: accessToken,
    };

    if (isStory) {
      containerBody.media_type = 'STORIES';
      containerBody.image_url = toPublicMediaUrl(mediaUrls[0], post.id);
    } else if (isCarousel && mediaUrls.length > 1 && !isVideo) {
      // Multi-image carousel: one container per image (is_carousel_item) then a
      // CAROUSEL container linking the children.
      const childIds: string[] = [];
      for (let i = 0; i < Math.min(mediaUrls.length, 10); i++) {
        const childRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: toPublicMediaUrl(mediaUrls[i], post.id, i),
            is_carousel_item: true,
            access_token: accessToken,
          }),
        });
        const childData = await childRes.json().catch(() => ({}));
        if (!childRes.ok || !childData.id) {
          return {
            success: false,
            error: childData.error?.message || `Failed to create carousel item ${i + 1} (HTTP ${childRes.status})`,
            platform: 'INSTAGRAM',
          };
        }
        childIds.push(childData.id);
      }

      // Allow IG time to process the child containers before linking them
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const carouselRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: childIds,
          caption,
          access_token: accessToken,
        }),
      });
      const carouselData = await carouselRes.json().catch(() => ({}));
      if (!carouselRes.ok || !carouselData.id) {
        return {
          success: false,
          error: carouselData.error?.message || `Failed to create carousel container (HTTP ${carouselRes.status})`,
          platform: 'INSTAGRAM',
        };
      }
      containerBody.creation_id = carouselData.id;
      containerBody.media_type = 'CAROUSEL';
      delete containerBody.caption;
    } else if (isVideo) {
      containerBody.media_type = 'REELS';
      containerBody.video_url = toPublicMediaUrl(mediaUrls[0], post.id);
    } else {
      containerBody.image_url = toPublicMediaUrl(mediaUrls[0], post.id);
    }

    // Single container flow (Feed / Story / Reel): create then publish.
    // Carousel flow skips creation because we already created the container above.
    if (!containerBody.creation_id) {
      const containerResponse = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody),
      });

      const containerData = await containerResponse.json().catch(() => ({}));

      if (!containerResponse.ok || containerData.error) {
        const rawError = containerData.error?.message || `Failed to create Instagram media container (${containerResponse.status})`;
        if (rawError.includes('does not exist') || rawError.includes('Unsupported post request')) {
          return {
            success: false,
            error: `Instagram Business account ID (${igUserId}) could not be accessed. Please reconnect Instagram in Integrations to refresh the token with full Business Portfolio permissions.`,
            platform: 'INSTAGRAM',
          };
        }
        return {
          success: false,
          error: rawError,
          platform: 'INSTAGRAM',
        };
      }

      containerBody.creation_id = containerData.id;
    }

    // Wait for Instagram to process the container
    await new Promise((resolve) => setTimeout(resolve, isVideo ? 6000 : 3500));

    // Publish the container
    const publishResponse = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerBody.creation_id,
        access_token: accessToken,
      }),
    });

    const publishData = await publishResponse.json().catch(() => ({}));

    if (!publishResponse.ok || publishData.error) {
      return {
        success: false,
        error: publishData.error?.message || `Failed to publish Instagram post (${publishResponse.status})`,
        platform: 'INSTAGRAM',
      };
    }

    const mediaId = publishData.id;
    let liveUrl = `https://www.instagram.com/`;

    // Fetch real post permalink
    try {
      const mediaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}?fields=permalink,shortcode&access_token=${accessToken}`
      );
      if (mediaRes.ok) {
        const mediaInfo = await mediaRes.json();
        if (mediaInfo.permalink) {
          liveUrl = mediaInfo.permalink;
        } else if (mediaInfo.shortcode) {
          liveUrl = `https://www.instagram.com/p/${mediaInfo.shortcode}/`;
        }
      }
    } catch {}

    // Apply optional engagement settings
    const settings = post.settings || {};
    if (settings.igHideLikeViews === true || settings.igDisableComments === true) {
      try {
        const params = new URLSearchParams({ access_token: accessToken });
        if (settings.igHideLikeViews === true) params.set('hide_like_and_view_counts', 'true');
        if (settings.igDisableComments === true) params.set('comment_disabled', 'true');
        await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
          method: 'POST',
          body: params,
        });
      } catch (updateErr: any) {
        console.warn('[Instagram publisher] Engagement settings update failed:', updateErr?.message);
      }
    }

    return {
      success: true,
      platformPostId: mediaId,
      liveUrl,
      platform: 'INSTAGRAM',
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to Instagram', platform: 'INSTAGRAM' };
  }
}
