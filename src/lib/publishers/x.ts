import { PublishResult } from './index';

export async function publishToX(post: any, account: any): Promise<PublishResult> {
  try {
    const accessToken = account.accessToken;
    
    if (!accessToken) {
      return { success: false, error: 'Missing X/Twitter account credentials', platform: 'X' };
    }

    const { content, imageUrl } = post;
    
    // NOTE: In a real scenario with X API v2, if you have an image URL, 
    // you first need to download it and upload via Twitter API v1.1 media/upload to get a media_id
    // Here we provide a simplified version that posts text, or you would need OAuth 1.0a / OAuth 2.0 user context.
    
    const url = 'https://api.twitter.com/2/tweets';
    const body: any = {
      text: content || '',
    };

    // Settings tab → real X API v2 params:
    // - reply_setting: who can reply to this post
    // - possibly_sensitive: sensitive-content flag
    const settings = post.settings || {};
    if (settings.xReplySetting === 'following' || settings.xReplySetting === 'mentioned') {
      body.reply_setting = settings.xReplySetting;
    }
    if (settings.xMarkSensitive === true) {
      body.possibly_sensitive = true;
    }

    // If we had a media_id from v1.1 media/upload:
    // if (mediaId) {
    //   body.media = { media_ids: [mediaId] };
    // }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`, // Assuming OAuth 2.0 Bearer token
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.detail || 'Failed to publish to X', platform: 'X' };
    }

    return { success: true, platformPostId: data.data?.id, platform: 'X' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to X', platform: 'X' };
  }
}
