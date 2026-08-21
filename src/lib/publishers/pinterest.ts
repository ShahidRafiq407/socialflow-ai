import { PublishResult } from './index';

export async function publishToPinterest(post: any, account: any): Promise<PublishResult> {
  try {
    const accessToken = account.accessToken;

    if (!accessToken) {
      return {
        success: false,
        error: 'Missing Pinterest account credentials. Please connect Pinterest in Integrations.',
        platform: 'PINTEREST',
      };
    }

    const { content, imageUrl } = post;
    const settings = post.settings || {};

    if (!imageUrl) {
      return {
        success: false,
        error: 'Pinterest Pins require an image asset',
        platform: 'PINTEREST',
      };
    }

    // Step 1: Resolve Board ID
    let boardId = settings.pinterestBoard || account.boardId;

    if (!boardId) {
      try {
        const boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=10', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (boardsRes.ok) {
          const boardsData = await boardsRes.json();
          if (boardsData.items && boardsData.items.length > 0) {
            boardId = boardsData.items[0].id;
          }
        }
      } catch {}

      // If still no board, try auto-creating a default board
      if (!boardId) {
        try {
          const createBoardRes = await fetch('https://api.pinterest.com/v5/boards', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'AI Marketing Pins',
              description: 'Created by SMB Robotics Marketing AI',
              privacy: 'PUBLIC',
            }),
          });
          if (createBoardRes.ok) {
            const newBoard = await createBoardRes.json();
            boardId = newBoard.id;
          }
        } catch {}
      }
    }

    if (!boardId) {
      return {
        success: false,
        error: 'No Pinterest board found. Please create at least 1 board (e.g. "SMB Robotics") on Pinterest.com, or reconnect Pinterest in Integrations.',
        platform: 'PINTEREST',
      };
    }

    // Step 2: Prepare Media Source
    let media_source: any;

    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.*)$/);
      const contentType = match ? match[1] : 'image/png';
      const base64Data = match ? match[2] : imageUrl;

      media_source = {
        source_type: 'image_base64',
        content_type: contentType,
        data: base64Data,
      };
    } else {
      media_source = {
        source_type: 'image_url',
        url: imageUrl,
      };
    }

    const title = String(settings.contentTitle || post.campaignTopic || content?.slice(0, 100) || 'New Pin')
      .slice(0, 100)
      .trim();

    const description = [content, Array.isArray(post.hashtags) ? post.hashtags.join(' ') : '']
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 800)
      .trim();

    const pinPayload: any = {
      title,
      description,
      board_id: boardId,
      media_source,
    };

    if (settings.destinationUrl || settings.pinterestLink) {
      pinPayload.link = settings.destinationUrl || settings.pinterestLink;
    }

    // Step 3: Create Pin via Pinterest API v5
    const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinPayload),
    });

    const pinData = await pinRes.json().catch(() => ({}));

    if (!pinRes.ok || pinData.code || pinData.error) {
      return {
        success: false,
        error: pinData.message || pinData.error || `Pinterest API error (${pinRes.status})`,
        platform: 'PINTEREST',
      };
    }

    const pinId = pinData.id;
    const liveUrl = pinId ? `https://www.pinterest.com/pin/${pinId}/` : 'https://www.pinterest.com/';

    return {
      success: true,
      platformPostId: pinId,
      liveUrl,
      platform: 'PINTEREST',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error publishing to Pinterest',
      platform: 'PINTEREST',
    };
  }
}
