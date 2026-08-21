import { PublishResult } from './index';

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://socialflow-ai-akel.vercel.app';
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
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category&access_token=${targetAccessToken}`
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

    const { content, imageUrl } = post;
    const caption = [content, Array.isArray(post.hashtags) ? post.hashtags.join(' ') : '']
      .filter(Boolean)
      .join('\n\n')
      .trim();

    let response: Response;

    if (imageUrl) {
      if (imageUrl.startsWith('data:')) {
        // Option A: Direct Multipart Binary Upload to Facebook Photos API
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

          response = await fetch(`https://graph.facebook.com/v19.0/${targetPageId}/photos`, {
            method: 'POST',
            body: formData,
          });
        } else {
          // Option B: Public Media Proxy URL fallback
          const publicMediaUrl = `${getAppBaseUrl()}/api/media/${post.id}`;
          response = await fetch(`https://graph.facebook.com/v19.0/${targetPageId}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: targetAccessToken,
              url: publicMediaUrl,
              caption: caption || undefined,
            }),
          });
        }
      } else {
        // Standard public URL
        response = await fetch(`https://graph.facebook.com/v19.0/${targetPageId}/photos`, {
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
      response = await fetch(`https://graph.facebook.com/v19.0/${targetPageId}/feed`, {
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
    const liveUrl = `https://www.facebook.com/${rawPostId}`;

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
