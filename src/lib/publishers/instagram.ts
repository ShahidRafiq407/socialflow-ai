import { PublishResult } from './index';

export async function publishToInstagram(post: any, account: any): Promise<PublishResult> {
  try {
    const igUserId = account.accountId;
    const accessToken = account.accessToken;
    
    if (!igUserId || !accessToken) {
      return { success: false, error: 'Missing Instagram account credentials', platform: 'INSTAGRAM' };
    }

    const { content, imageUrl } = post;
    
    if (!imageUrl) {
      return { success: false, error: 'Instagram posts require an image', platform: 'INSTAGRAM' };
    }

    // Step 1: Create Container
    const containerUrl = `https://graph.facebook.com/v19.0/${igUserId}/media`;
    const containerBody = {
      image_url: imageUrl,
      caption: content || '',
      access_token: accessToken,
    };

    const containerResponse = await fetch(containerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    });

    const containerData = await containerResponse.json();

    if (!containerResponse.ok) {
      return { success: false, error: containerData.error?.message || 'Failed to create Instagram container', platform: 'INSTAGRAM' };
    }

    const creationId = containerData.id;

    // Wait a few seconds for the container to be ready, this is generally recommended
    await new Promise(resolve => setTimeout(resolve, 3000));

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

    if (!publishResponse.ok) {
      return { success: false, error: publishData.error?.message || 'Failed to publish Instagram post', platform: 'INSTAGRAM' };
    }

    // Apply engagement settings from the editor's Settings tab (best-effort —
    // Graph API applies these via a post-publish update on the media object).
    const settings = post.settings || {};
    if (settings.igHideLikeViews === true || settings.igDisableComments === true) {
      try {
        const params = new URLSearchParams({ access_token: accessToken });
        if (settings.igHideLikeViews === true) params.set('hide_like_and_view_counts', 'true');
        if (settings.igDisableComments === true) params.set('comment_disabled', 'true');
        await fetch(`https://graph.facebook.com/v19.0/${publishData.id}`, {
          method: 'POST',
          body: params,
        });
      } catch (updateErr: any) {
        console.warn('[Instagram publisher] Engagement settings update failed:', updateErr?.message);
      }
    }

    return { success: true, platformPostId: publishData.id, platform: 'INSTAGRAM' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to Instagram', platform: 'INSTAGRAM' };
  }
}
