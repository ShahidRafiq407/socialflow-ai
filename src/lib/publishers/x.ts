import { PublishResult } from './index';
import { toAbsoluteAppUrl, parseDataUri, extractMediaIdFromApiUrl } from '@/lib/media/urls';

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
 * Best-effort single-image upload via the X API v2 media upload endpoint
 * (POST https://api.x.com/2/media/upload — base64 JSON body).
 * Requires the media.write OAuth scope on the X developer app — if it is
 * missing the upload fails here and the tweet still goes out as text-only.
 */
async function uploadXImage(accessToken: string, imageUrl: string): Promise<string | null> {
  try {
    let mimeType = 'image/png';
    let buffer: Buffer;

    if (imageUrl.startsWith('data:')) {
      const parsed = parseDataUri(imageUrl);
      if (!parsed) return null;
      mimeType = parsed.mimeType;
      buffer = Buffer.from(parsed.base64, 'base64');
    } else if (imageUrl.includes('/api/media/')) {
      const assetId = extractMediaIdFromApiUrl(imageUrl);
      const prisma = (await import('@/lib/db')).default;
      const asset = assetId
        ? await prisma.mediaAsset.findUnique({ where: { id: assetId } })
        : null;
      if (asset && asset.url) {
        if (asset.url.startsWith('data:')) {
          const parsed = parseDataUri(asset.url);
          mimeType = parsed?.mimeType || asset.contentType || 'image/png';
          buffer = Buffer.from(parsed?.base64 || asset.url, 'base64');
        } else {
          const imgRes = await fetch(asset.url);
          buffer = Buffer.from(await imgRes.arrayBuffer());
          mimeType = imgRes.headers.get('content-type') || asset.contentType || 'image/png';
        }
      } else {
        const fullUrl = toAbsoluteAppUrl(imageUrl);
        const imgRes = await fetch(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!imgRes.ok) return null;
        mimeType = imgRes.headers.get('content-type') || 'image/png';
        buffer = Buffer.from(await imgRes.arrayBuffer());
      }
    } else if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('uploads/')) {
      const fs = await import('fs');
      const path = await import('path');
      const cleanPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
      const diskPath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(diskPath)) {
        buffer = await fs.promises.readFile(diskPath);
        mimeType = diskPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      } else {
        const fullUrl = toAbsoluteAppUrl(imageUrl);
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

    // X API v2 simple upload — JSON body with base64-encoded media.
    const uploadRes = await fetch('https://api.x.com/2/media/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media: buffer.toString('base64'),
        media_category: 'tweet_image',
      }),
    });

    const uploadData = await uploadRes.json().catch(() => ({}));
    const mediaId = uploadData?.data?.id || uploadData?.media_id_string || uploadData?.media_id;
    if (!uploadRes.ok || !mediaId) {
      console.warn('[X Publisher] v2 media upload failed:', uploadRes.status, JSON.stringify(uploadData).slice(0, 300));
      return null;
    }
    return String(mediaId);
  } catch (err) {
    console.warn('[X Publisher] Media upload failed — posting text-only:', err);
    return null;
  }
}

/**
 * Attach alt text to an uploaded image via POST /2/media/metadata
 * (max 1000 chars, media.write scope). Best-effort — never blocks the tweet.
 */
async function attachXAltText(accessToken: string, mediaId: string, altText: string): Promise<void> {
  try {
    const res = await fetch('https://api.x.com/2/media/metadata', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: mediaId,
        metadata: {
          alt_text: { text: altText.slice(0, 1000) },
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[X Publisher] Alt text metadata failed:', res.status, errBody.slice(0, 200));
    }
  } catch (err) {
    console.warn('[X Publisher] Alt text metadata error:', err);
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

    const reply_setting =
      settings.xReplySetting === 'following' || settings.xReplySetting === 'mentioned'
        ? settings.xReplySetting
        : undefined;

    // Full tweet text = caption + hashtags (X has no separate hashtag field;
    // they are part of the post text). Hashtags were previously dropped here.
    const hashtagString = Array.isArray(post.hashtags)
      ? post.hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
      : '';
    const fullText = [content || '', hashtagString].filter(Boolean).join('\n\n').trim();

    // Best-effort media: attach the first image when the X app has media.write
    let mediaId: string | null = null;
    if (imageUrl && format !== 'thread') {
      mediaId = await uploadXImage(accessToken, imageUrl);
      // Attach alt text to the uploaded image (accessibility, max 1000 chars).
      if (mediaId && settings.altText && String(settings.altText).trim()) {
        await attachXAltText(accessToken, mediaId, String(settings.altText).trim());
      }
    }

    const buildTweetBody = (text: string, inReplyTo?: string): any => {
      const body: any = { text: text.slice(0, X_TWEET_LIMIT) };
      if (reply_setting) body.reply_settings = reply_setting;
      if (settings.xMarkSensitive === true) body.possibly_sensitive = true;
      if (mediaId) body.media = { media_ids: [mediaId] };
      if (inReplyTo) body.reply = { in_reply_to_tweet_id: inReplyTo };
      return body;
    };

    // Thread: split the caption into up to 6 chained tweets
    if (format === 'thread') {
      const chunks = splitIntoChunks(fullText, X_TWEET_LIMIT).slice(0, MAX_THREAD_TWEETS);
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
      body: JSON.stringify(buildTweetBody(fullText)),
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

    // First comment — posted as a reply to the tweet (best-effort, never fails the post).
    const firstComment = String(settings.firstComment || '').trim();
    if (firstComment) {
      try {
        await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: firstComment.slice(0, X_TWEET_LIMIT),
            reply: { in_reply_to_tweet_id: tweetId },
          }),
        });
      } catch (commentErr) {
        console.warn('[X Publisher] First comment reply failed:', commentErr);
      }
    }

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
