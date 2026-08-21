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
        `https://graph.facebook.com/v19.0/${igUserId}?fields=id,username,instagram_business_account,connected_instagram_account,access_token&access_token=${accessToken}`
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
          `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}&access_token=${accessToken}`
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
          `https://graph.facebook.com/v19.0/me/businesses?fields=id,name,instagram_accounts{id,username},owned_instagram_accounts{id,username}&access_token=${accessToken}`
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
          `https://graph.facebook.com/v19.0/1772056396948184/instagram_accounts?fields=id,username,name&access_token=${accessToken}`
        );
        if (directBizRes.ok) {
          const directBizData = await directBizRes.json();
          if (directBizData?.data?.[0]?.id) {
            igUserId = directBizData.data[0].id;
          }
        }
      } catch {}
    }

    const { content, imageUrl } = post;
    
    if (!imageUrl) {
      return {
        success: false,
        error: 'Instagram posts require an image or video asset',
        platform: 'INSTAGRAM',
      };
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

    const creationId = containerData.id;

    // Wait for Instagram to process the container
    await new Promise((resolve) => setTimeout(resolve, isVideo ? 6000 : 3500));

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

    // Step 3: Fetch real post permalink
    try {
      const mediaRes = await fetch(
        `https://graph.facebook.com/v19.0/${mediaId}?fields=permalink,shortcode&access_token=${accessToken}`
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
      platform: 'INSTAGRAM',
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to Instagram', platform: 'INSTAGRAM' };
  }
}
