import { PublishResult } from './index';

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost') && !process.env.NEXT_PUBLIC_APP_URL.includes('127.0.0.1')) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://socialflow-ai-akel.vercel.app';
}

// Pinterest's ingestion fetches image_url over public HTTPS — relative paths,
// local uploads, and hotlink-protected stock media are routed to /api/media/[postId].
function toAbsoluteUrl(url: string, postId?: string): string {
  if (!url) return url;
  // Already a fully-qualified public URL (Supabase CDN, external CDN, etc.) — use as-is
  if (url.startsWith('https://')) return url;
  // Our internal asset streaming endpoint — prepend app base URL
  if (url.startsWith('/api/media/')) return `${getAppBaseUrl()}${url}`;
  // Local uploads or relative paths — proxy through our media endpoint
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    if (postId) return `${getAppBaseUrl()}/api/media/${postId}?idx=0`;
  }
  if (/^(https?:|data:)/i.test(url)) return url;
  return `${getAppBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
}

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
        url: toAbsoluteUrl(imageUrl, post.id),
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
    let pinRes = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinPayload),
    });

    let pinData = await pinRes.json().catch(() => ({}));

    // If Pinterest App is in Trial mode and rejects production endpoint, attempt sandbox fallback
    if (!pinRes.ok && (pinData.message?.includes('Trial access') || pinData.message?.includes('API Sandbox') || pinData.code === 3)) {
      try {
        let sandboxBoardId = null;
        
        // 1. Try to get a sandbox board
        const sandboxBoardsRes = await fetch('https://api-sandbox.pinterest.com/v5/boards', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (sandboxBoardsRes.ok) {
          const sBoards = await sandboxBoardsRes.json();
          if (sBoards.items && sBoards.items.length > 0) {
            sandboxBoardId = sBoards.items[0].id;
          }
        }

        // 2. If no sandbox board exists, create one
        if (!sandboxBoardId) {
          const createSBoardRes = await fetch('https://api-sandbox.pinterest.com/v5/boards', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'Sandbox Test Board',
              description: 'Created automatically for Sandbox testing',
              privacy: 'PUBLIC',
            }),
          });
          if (createSBoardRes.ok) {
            const newSBoard = await createSBoardRes.json();
            sandboxBoardId = newSBoard.id;
          }
        }

        // 3. Post pin to sandbox using the sandbox board ID
        if (sandboxBoardId) {
          pinPayload.board_id = sandboxBoardId;
          const sandboxRes = await fetch('https://api-sandbox.pinterest.com/v5/pins', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pinPayload),
          });
          if (sandboxRes.ok) {
            pinRes = sandboxRes;
            pinData = await sandboxRes.json().catch(() => ({}));
          }
        }
      } catch (err) {
        console.error("Sandbox fallback failed:", err);
      }
    }

    if (!pinRes.ok || pinData.code || pinData.error) {
      const rawMsg = pinData.message || pinData.error || `Pinterest API error (${pinRes.status})`;
      if (rawMsg.includes('Trial access') || rawMsg.includes('api-sandbox')) {
        return {
          success: false,
          error: `Your Pinterest Developer App is in "Trial Access" mode. Go to developers.pinterest.com → Apps → Your App → Click "Apply for Standard Access" (Free & Instant approval) to publish live pins.`,
          platform: 'PINTEREST',
        };
      }
      return {
        success: false,
        error: rawMsg,
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
