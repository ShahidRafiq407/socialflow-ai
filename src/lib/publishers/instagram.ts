import { PublishResult } from './index';

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://socialflow-ai-akel.vercel.app';
}

export async function publishToInstagram(post: any, account: any): Promise<PublishResult> {
  try {
    let igUserId = account.accountId;
    let accessToken = account.accessToken;
    
    if (!igUserId || !accessToken) {
      return { success: false, error: 'Missing Instagram account credentials. Please connect your Instagram Business account in Integrations.', platform: 'INSTAGRAM' };
    }

    // If the saved account ID is a Meta personal user ID rather than an IG Business ID, attempt to resolve it
    if (!igUserId.startsWith('17841') && !igUserId.match(/^\d{15,20}$/)) {
      try {
        const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`);
        if (pagesRes.ok) {
          const pagesData = await pagesRes.json();
          const igPage = pagesData.data?.find((p: any) => p.instagram_business_account);
          if (igPage?.instagram_business_account?.id) {
            igUserId = igPage.instagram_business_account.id;
            if (igPage.access_token) accessToken = igPage.access_token;
          }
        }
      } catch {}
    }

    const { content, imageUrl } = post;
    
    if (!imageUrl) {
      return { success: false, error: 'Instagram posts require an image or video asset', platform: 'INSTAGRAM' };
    }

    // Resolve public HTTPS image URL for Meta's container crawler
    let targetImageUrl = imageUrl;
    if (imageUrl.startsWith('data:')) {
      targetImageUrl = `${getAppBaseUrl()}/api/media/${post.id}`;
    }

    const caption = [content, Array.isArray(post.hashtags) ? post.hashtags.join(' ') : '']
      .filter(Boolean)
      .join('\n\n')
      .trim();

    // Step 1: Create Container
    const containerUrl = `https://graph.facebook.com/v19.0/${igUserId}/media`;
    const containerBody: Record<string, any> = {
      image_url: targetImageUrl,
      caption: caption || '',
      access_token: accessToken,
    };

    const isVideo = post.mediaType === 'video' || targetImageUrl.endsWith('.mp4') || targetImageUrl.includes('video');
    if (isVideo) {
      containerBody.media_type = 'REELS';
      containerBody.video_url = targetImageUrl;
      delete containerBody.image_url;
    }

    const containerResponse = await fetch(containerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    });

    const containerData = await containerResponse.json();

    if (!containerResponse.ok || containerData.error) {
      return {
        success: false,
        error: containerData.error?.message || `Failed to create Instagram media container (${containerResponse.status})`,
        platform: 'INSTAGRAM'
      };
    }

    const creationId = containerData.id;

    // Wait for Instagram to process the container
    await new Promise(resolve => setTimeout(resolve, isVideo ? 5000 : 3000));

    // Step 2: Publish Container
    const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish`;
    const publishBody = {
      creation_id: creationId,
      access_token: accessToken,
    };

    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(publishBody),
    });

    const publishData = await publishResponse.json();

    if (!publishResponse.ok || publishData.error) {
      return {
        success: false,
        error: publishData.error?.message || `Failed to publish Instagram post (${publishResponse.status})`,
        platform: 'INSTAGRAM'
      };
    }

    const mediaId = publishData.id;
    let liveUrl = `https://www.instagram.com/`;

    // Step 3: Fetch real post permalink
    try {
      const mediaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}?fields=permalink,shortcode&access_token=${accessToken}`);
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
        await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
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
      platform: 'INSTAGRAM'
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to Instagram', platform: 'INSTAGRAM' };
  }
}
