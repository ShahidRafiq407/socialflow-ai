import { PublishResult } from './index';

export async function publishToFacebook(post: any, account: any): Promise<PublishResult> {
  try {
    const pageId = account.accountId;
    const accessToken = account.accessToken;
    
    if (!pageId || !accessToken) {
      return { success: false, error: 'Missing Facebook account credentials', platform: 'FACEBOOK' };
    }

    const { content, imageUrl } = post;
    let url = '';
    let body: any = { access_token: accessToken };

    if (imageUrl) {
      url = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      body.url = imageUrl;
      if (content) {
        body.caption = content;
      }
    } else {
      url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
      body.message = content;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error?.message || 'Failed to publish to Facebook', platform: 'FACEBOOK' };
    }

    return { success: true, platformPostId: data.id || data.post_id, platform: 'FACEBOOK' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to Facebook', platform: 'FACEBOOK' };
  }
}
