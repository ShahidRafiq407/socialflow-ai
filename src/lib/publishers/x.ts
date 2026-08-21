import { PublishResult } from './index';

export async function publishToX(post: any, account: any): Promise<PublishResult> {
  try {
    const accessToken = account.accessToken;
    
    if (!accessToken) {
      return { success: false, error: 'Missing X/Twitter account credentials. Please connect X in Integrations.', platform: 'X' };
    }

    const { content, imageUrl } = post;
    
    const url = 'https://api.twitter.com/2/tweets';
    const body: any = {
      text: content || '',
    };

    // Settings tab → real X API v2 params:
    const settings = post.settings || {};
    if (settings.xReplySetting === 'following' || settings.xReplySetting === 'mentioned') {
      body.reply_setting = settings.xReplySetting;
    }
    if (settings.xMarkSensitive === true) {
      body.possibly_sensitive = true;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.data?.id) {
      const errorDetail =
        data?.detail ||
        data?.title ||
        data?.error ||
        data?.errors?.[0]?.message ||
        `X API error (HTTP ${response.status}): Failed to post tweet. Check X developer permissions (tweet.write) or tier limits.`;
      return { success: false, error: errorDetail, platform: 'X' };
    }

    const tweetId = data.data.id;
    return {
      success: true,
      platformPostId: tweetId,
      liveUrl: `https://x.com/i/status/${tweetId}`,
      platform: 'X'
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to X', platform: 'X' };
  }
}
