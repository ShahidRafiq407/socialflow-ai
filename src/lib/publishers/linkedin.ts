import { PublishResult } from './index';

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
    
    let specificContent: any = {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: fullCaption || content || '',
        },
        shareMediaCategory: 'NONE',
      },
    };

    // If an image is attached, perform the 3-step LinkedIn Image Upload with Alt Text
    if (imageUrl) {
      try {
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

        if (regRes.ok) {
          const regData = await regRes.json();
          const assetUrn = regData.value?.asset;
          const uploadUrl =
            regData.value?.uploadMechanism?.[
              'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
            ]?.uploadUrl;

          if (assetUrn && uploadUrl) {
            // Step 2: Extract binary bytes and PUT to LinkedIn uploadUrl
            let buffer: Buffer;
            let mimeType = 'image/png';

            if (imageUrl.startsWith('data:')) {
              const match = imageUrl.match(/^data:([^;]+);base64,(.*)$/);
              mimeType = match ? match[1] : 'image/png';
              buffer = Buffer.from(match ? match[2] : imageUrl, 'base64');
            } else {
              const imgRes = await fetch(imageUrl);
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

            if (uploadRes.ok || uploadRes.status === 201) {
              const imageAltText =
                post.settings?.altText ||
                post.settings?.contentDescription ||
                post.imagePrompt ||
                content?.slice(0, 200) ||
                'SMB Robotics Visual';

              const imageTitle =
                post.settings?.contentTitle ||
                post.campaignTopic ||
                'SMB Robotics Post';

              // Step 3: Attach uploaded asset URN, Alt Text & Title to post
              specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
              specificContent['com.linkedin.ugc.ShareContent'].media = [
                {
                  status: 'READY',
                  description: {
                    text: imageAltText.slice(0, 400),
                  },
                  media: assetUrn,
                  title: {
                    text: imageTitle.slice(0, 200),
                  },
                },
              ];
            }
          }
        }
      } catch (uploadErr) {
        console.warn('[LinkedIn Publisher] Image upload failed, falling back to text post:', uploadErr);
      }
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

    if (!response.ok || data.error) {
      return {
        success: false,
        error: data.message || data.error?.message || `Failed to publish to LinkedIn (${response.status})`,
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
