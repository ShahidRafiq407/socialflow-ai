import { PublishResult } from './index';
import { toPublicMediaUrl, parseDataUri } from '@/lib/media/urls';

async function uploadVideoToPinterest(videoUrl: string, accessToken: string, isSandbox: boolean = false): Promise<string> {
  const baseUrl = isSandbox ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
  
  // 1. Register media upload
  const registerRes = await fetch(`${baseUrl}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ media_type: 'video' }),
  });
  
  if (!registerRes.ok) {
    const errText = await registerRes.text().catch(() => '');
    throw new Error(`Failed to register video upload: ${errText}`);
  }
  const registerData = await registerRes.json();
  const mediaId = registerData.media_id;
  const uploadUrl = registerData.upload_url;
  const uploadParams = registerData.upload_parameters;

  // 2. Fetch video buffer
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to fetch video from ${videoUrl}`);
  const videoBuffer = await videoRes.arrayBuffer();

  // 3. Upload to S3
  const formData = new FormData();
  for (const key of Object.keys(uploadParams)) {
    formData.append(key, uploadParams[key]);
  }
  formData.append('file', new Blob([videoBuffer], { type: 'video/mp4' }));

  const s3Res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  if (!s3Res.ok) {
    const errText = await s3Res.text().catch(() => '');
    throw new Error(`S3 video upload failed: ${s3Res.status} ${errText}`);
  }

  // 4. Poll status
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`${baseUrl}/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData.status === 'succeeded') return mediaId;
      if (statusData.status === 'failed') throw new Error('Pinterest video processing failed');
    }
  }
  throw new Error('Pinterest video processing timed out');
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

    const { content, imageUrl, format, platformFormat } = post;
    const settings = post.settings || {};

    if (!imageUrl) {
      return {
        success: false,
        error: 'Pinterest Pins require a media asset',
        platform: 'PINTEREST',
      };
    }

    const isVideo = String(format || platformFormat || '').toLowerCase().includes('video') || 
                    imageUrl.toLowerCase().includes('.mp4') || 
                    imageUrl.toLowerCase().includes('.mov');

    // Step 1: Resolve Board ID
    // Accepted inputs (in priority order):
    //   1. settings.pinterestBoard — a numeric board ID from the settings tab dropdown
    //   2. settings.pinterestBoardName — board NAME from the editor's board field
    //   3. account.boardId
    //   4. First board on the account, or a newly created default board
    let boardId = settings.pinterestBoard || settings.pinterestBoardName || account.boardId;

    // If the stored value is a board NAME (not a numeric ID), resolve it to an ID.
    if (boardId && !/^\d+$/.test(String(boardId).trim())) {
      const boardName = String(boardId).trim().toLowerCase();
      try {
        const boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=50', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (boardsRes.ok) {
          const boardsData = await boardsRes.json();
          const matched = (boardsData.items || []).find(
            (b: any) => String(b.name || '').trim().toLowerCase() === boardName
          );
          if (matched?.id) {
            boardId = matched.id;
          } else if (boardsData.items && boardsData.items.length > 0) {
            boardId = boardsData.items[0].id;
          }
        }
      } catch {}
    }

    // If still no board (empty account), auto-create a default board.
    if (!boardId || !/^\d+$/.test(String(boardId).trim())) {
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

    if (!boardId || !/^\d+$/.test(String(boardId).trim())) {
      return {
        success: false,
        error: 'No Pinterest board found. Please create at least 1 board (e.g. "SMB Robotics") on Pinterest.com, or reconnect Pinterest in Integrations.',
        platform: 'PINTEREST',
      };
    }

    // Determine Sandbox Token (used later if production fails, or used now if we explicitly want to test)
    const sandboxToken = process.env.PINTEREST_SANDBOX_TOKEN || accessToken;

    // Step 2: Prepare Media Source
    let media_source: any;
    let isSandboxMedia = false;

    if (isVideo) {
      try {
        // Try production upload first
        const mediaId = await uploadVideoToPinterest(toPublicMediaUrl(imageUrl, post.id), accessToken, false);
        media_source = {
          source_type: 'video_id',
          media_id: mediaId,
          ...(post.thumbnailUrl ? { cover_image_url: toPublicMediaUrl(post.thumbnailUrl, post.id) } : { cover_image_key_frame_time: 0 })
        };
      } catch (err: any) {
        if (err.message?.includes('Trial access') || err.message?.includes('401') || err.message?.includes('403') || err.message?.includes('Trial')) {
           // Fallback to sandbox upload
           const mediaId = await uploadVideoToPinterest(toPublicMediaUrl(imageUrl, post.id), sandboxToken, true);
           media_source = {
             source_type: 'video_id',
             media_id: mediaId,
             ...(post.thumbnailUrl ? { cover_image_url: toPublicMediaUrl(post.thumbnailUrl, post.id) } : { cover_image_key_frame_time: 0 })
           };
           isSandboxMedia = true;
        } else {
           throw err;
        }
      }
    } else if (imageUrl.startsWith('data:')) {
      const parsed = parseDataUri(imageUrl);
      const contentType = parsed?.mimeType || 'image/png';
      const base64Data = parsed?.base64 || imageUrl;

      media_source = {
        source_type: 'image_base64',
        content_type: contentType,
        data: base64Data,
      };
    } else {
      media_source = {
        source_type: 'image_url',
        url: toPublicMediaUrl(imageUrl, post.id),
      };
    }

    // Pinterest API v5 Create Pin field limits (official docs):
    //   title       ≤ 100 chars
    //   description ≤ 800 chars (organic composer caps at 500)
    //   alt_text    ≤ 500 chars
    //   link        ≤ 2048 chars
    const title = String(
      settings.contentTitle ||
      post.campaignTopic ||
      content?.slice(0, 100) ||
      'New Pin'
    )
      .slice(0, 100)
      .trim();

    // The description shown on the pin. The Pinterest editor's "Description"
    // field is stored in settings.contentDescription — it MUST take priority,
    // falling back to the caption. Hashtags ride along in the description
    // (Pinterest has no separate hashtag field).
    const description = [
      settings.contentDescription || content || '',
      Array.isArray(post.hashtags) ? post.hashtags.join(' ') : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 800)
      .trim();

    const altText = String(settings.altText || '')
      .slice(0, 500)
      .trim();

    const pinPayload: any = {
      title,
      description,
      board_id: boardId,
      media_source,
    };

    // Alt text — accessibility text that shows on the pin (API supports ≤ 500 chars).
    if (altText) {
      pinPayload.alt_text = altText;
    }

    // AI-modified disclosure — Pinterest v5 Create Pin accepts
    // ai_disclosures.values: ["AI_MODIFIED"].
    if (settings.pinterestAiModified === true) {
      pinPayload.ai_disclosures = { values: ['AI_MODIFIED'] };
    }

    if (settings.destinationUrl || settings.pinterestLink) {
      pinPayload.link = String(settings.destinationUrl || settings.pinterestLink).slice(0, 2048);
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
    
    const fallbackRawMsg = String(pinData.message || pinData.error || "");

    // If Pinterest App is in Trial mode and rejects production endpoint, attempt sandbox fallback
    if (!pinRes.ok && (
      fallbackRawMsg.toLowerCase().includes('trial') || 
      fallbackRawMsg.toLowerCase().includes('sandbox') || 
      pinData.code === 3
    )) {
      try {
        let sandboxBoardId = null;
        
        // 1. Try to get a sandbox board
        const sandboxBoardsRes = await fetch('https://api-sandbox.pinterest.com/v5/boards', {
          headers: { Authorization: `Bearer ${sandboxToken}` },
        });
        
        if (sandboxBoardsRes.ok) {
          const sBoards = await sandboxBoardsRes.json();
          if (sBoards.items && sBoards.items.length > 0) {
            sandboxBoardId = sBoards.items[0].id;
          }
        } else {
          const errData = await sandboxBoardsRes.json().catch(() => ({}));
          console.error("Sandbox boards fetch failed:", sandboxBoardsRes.status, errData);
        }

        // 2. If no sandbox board exists, create one
        if (!sandboxBoardId) {
          const createSBoardRes = await fetch('https://api-sandbox.pinterest.com/v5/boards', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${sandboxToken}`,
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
          } else {
            const errData = await createSBoardRes.json().catch(() => ({}));
            console.error("Sandbox board creation failed:", createSBoardRes.status, errData);
          }
        }

        // 3. Post pin to sandbox using the sandbox board ID
        if (sandboxBoardId) {
          pinPayload.board_id = sandboxBoardId;
          
          if (isVideo && !isSandboxMedia) {
             const sandboxMediaId = await uploadVideoToPinterest(toPublicMediaUrl(imageUrl, post.id), sandboxToken, true);
             pinPayload.media_source.media_id = sandboxMediaId;
             isSandboxMedia = true;
          }

          const sandboxRes = await fetch('https://api-sandbox.pinterest.com/v5/pins', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${sandboxToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pinPayload),
          });
          if (sandboxRes.ok) {
            pinRes = sandboxRes;
            pinData = await sandboxRes.json().catch(() => ({}));
          } else {
            const errData = await sandboxRes.json().catch(() => ({}));
            console.error("Sandbox fallback failed with status:", sandboxRes.status, errData);
            return {
              success: false,
              error: `Sandbox fallback failed: ${errData.message || JSON.stringify(errData)}`,
              platform: 'PINTEREST'
            };
          }
        } else {
            return {
              success: false,
              error: `Sandbox fallback failed: Could not resolve or create sandbox board.`,
              platform: 'PINTEREST'
            };
        }
      } catch (err: any) {
        console.error("Sandbox fallback exception:", err);
        return {
          success: false,
          error: `Sandbox fallback exception: ${err.message}`,
          platform: 'PINTEREST'
        };
      }
    }

    if (!pinRes.ok || pinData.code || pinData.error) {
      const rawMsg = String(pinData.message || pinData.error || `Pinterest API error (${pinRes.status})`);
      if (rawMsg.toLowerCase().includes('trial') || rawMsg.toLowerCase().includes('sandbox')) {
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
