import { PublishResult } from './index';

const X_TWEET_LIMIT = 280;
const MAX_THREAD_TWEETS = 6;

function splitIntoChunks(text: string, limit: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > limit) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, limit)];
}

/**
 * Best-effort single-image upload via X API v2 media upload
 * (INIT → APPEND → FINALIZE). Requires the media.write OAuth scope on the
 * X developer app — if it is missing the upload fails here and the tweet
 * still goes out as text-only.
 */
async function uploadXImage(accessToken: string, imageUrl: string): Promise<string | null> {
  try {
    let mimeType = 'image/png';
    let buffer: Buffer;

    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) return null;
      mimeType = match[1];
      buffer = Buffer.from(match[2], 'base64');
    } else if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('uploads/')) {
      const fs = await import('fs');
      const path = await import('path');
      const cleanPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
      const diskPath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(diskPath)) {
        buffer = await fs.promises.readFile(diskPath);
        mimeType = diskPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      } else {
        const fullUrl = imageUrl.startsWith('http') ? imageUrl : `https://socialflow-ai-akel.vercel.app${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
        const imgRes = await fetch(fullUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!imgRes.ok) return null;
        mimeType = imgRes.headers.get('content-type') || 'image/png';
        buffer = Buffer.from(await imgRes.arrayBuffer());
      }
    } else {
      const imgRes = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*,video/*,*/*',
          'Referer': imageUrl.includes('pixabay.com') ? 'https://pixabay.com/' : '',
        },
      });
      if (!imgRes.ok) return null;
      mimeType = imgRes.headers.get('content-type') || 'image/png';
      buffer = Buffer.from(await imgRes.arrayBuffer());
    }

    const apiBase = 'https://api.x.com/2/media/upload';

    // INIT
    const initForm = new FormData();
    initForm.append('command', 'INIT');
    initForm.append('media_type', mimeType);
    initForm.append('media_category', 'tweet_image');
    initForm.append('total_bytes', String(buffer.length));
    const initRes = await fetch(apiBase, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: initForm,
    });
    const initData = await initRes.json().catch(() => ({}));
    const mediaId = initData?.data?.id;
    if (!initRes.ok || !mediaId) return null;

    // APPEND (single chunk — images are well under the 5MB chunk cap)
    const appendForm = new FormData();
    appendForm.append('command', 'APPEND');
    appendForm.append('media_id', mediaId);
    appendForm.append('segment_index', '0');
    appendForm.append('media', new Blob([new Uint8Array(buffer)], { type: mimeType }), 'image');
    const appendRes = await fetch(apiBase, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: appendForm,
    });
    if (!appendRes.ok) return null;

    // FINALIZE
    const finForm = new FormData();
    finForm.append('command', 'FINALIZE');
    finForm.append('media_id', mediaId);
    const finRes = await fetch(apiBase, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: finForm,
    });
    if (!finRes.ok) return null;

    return mediaId;
  } catch (err) {
    console.warn('[X Publisher] Media upload failed — posting text-only:', err);
    return null;
  }
}

export async function publishToX(post: any, account: any): Promise<PublishResult> {
  try {
    const accessToken = account.accessToken;
    
    if (!accessToken) {
      return { success: false, error: 'Missing X/Twitter account credentials. Please connect X in Integrations.', platform: 'X' };
    }

    const { content, imageUrl } = post;
    const format = String(post.format || 'Post').toLowerCase();
    const settings = post.settings || {};

    const replySetting =
      settings.xReplySetting === 'following' || settings.xReplySetting === 'mentioned'
        ? settings.xReplySetting
        : undefined;

    // Best-effort media: attach the first image when the X app has media.write
    let mediaId: string | null = null;
    if (imageUrl && format !== 'thread') {
      mediaId = await uploadXImage(accessToken, imageUrl);
    }

    const buildTweetBody = (text: string, inReplyTo?: string): any => {
      const body: any = { text: text.slice(0, X_TWEET_LIMIT) };
      if (replySetting) body.reply_settings = replySetting;
      if (settings.xMarkSensitive === true) body.possibly_sensitive = true;
      if (mediaId) body.media = { media_ids: [mediaId] };
      if (inReplyTo) body.reply = { in_reply_to_tweet_id: inReplyTo };
      return body;
    };

    // Thread: split the caption into up to 6 chained tweets
    if (format === 'thread') {
      const chunks = splitIntoChunks(content || '', X_TWEET_LIMIT).slice(0, MAX_THREAD_TWEETS);
      if (chunks.length === 0) {
        return { success: false, error: 'X Thread needs a caption with content.', platform: 'X' };
      }

      let lastTweetId: string | null = null;
      for (let i = 0; i < chunks.length; i++) {
        const tweetRes: Response = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildTweetBody(chunks[i], i > 0 ? (lastTweetId || undefined) : undefined)),
        });
        const tweetData: any = await tweetRes.json().catch(() => ({}));
        if (!tweetRes.ok || !tweetData?.data?.id) {
          const errorDetail =
            tweetData?.detail || tweetData?.title || tweetData?.errors?.[0]?.message ||
            `X API error (HTTP ${tweetRes.status}) on tweet ${i + 1} of the thread.`;
          return {
            success: i > 0,
            error: i > 0
              ? `Thread partially posted: ${i} of ${chunks.length} tweets went live, then ${errorDetail}`
              : errorDetail,
            platform: 'X',
          };
        }
        lastTweetId = tweetData.data.id;
      }

      return {
        success: true,
        platformPostId: lastTweetId || undefined,
        liveUrl: lastTweetId ? `https://x.com/i/status/${lastTweetId}` : undefined,
        platform: 'X',
      };
    }

    // Single post
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTweetBody(content || '')),
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
      platform: 'X',
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error publishing to X', platform: 'X' };
  }
}
