import { PublishResult } from './index';

export async function publishToLinkedIn(post: any, account: any): Promise<PublishResult> {
  try {
    const personUrn = account.accountId;
    const accessToken = account.accessToken;
    
    if (!personUrn || !accessToken) {
      return { success: false, error: 'Missing LinkedIn account credentials', platform: 'LINKEDIN' };
    }

    const { content, imageUrl } = post;
    
    let specificContent: any = {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: content || '',
        },
        shareMediaCategory: 'NONE',
      }
    };

    if (imageUrl) {
      // NOTE: For a real production app, you first need to register an image upload,
      // upload the binary data, and get an asset URN.
      // Here we assume imageUrl is already a registered asset URN or we use an article share for simplicity if it's a URL.
      // We will map it to an ARTICLE if it's an HTTP url, since uploading raw images requires a 3-step process.
      specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
      specificContent['com.linkedin.ugc.ShareContent'].media = [
        {
          status: 'READY',
          description: {
            text: 'Image',
          },
          originalUrl: imageUrl,
        }
      ];
    }

    const url = 'https://api.linkedin.com/v2/ugcPosts';
    // Settings tab → real LinkedIn visibility (Anyone = PUBLIC, Connections = CONNECTIONS)
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
        'com.linkedin.ugc.MemberNetworkVisibility': visibilityCode
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to publish to LinkedIn', platform: 'LINKEDIN' };
    }

    return { success: true, platformPostId: data.id, platform: 'LINKEDIN' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to LinkedIn', platform: 'LINKEDIN' };
  }
}
