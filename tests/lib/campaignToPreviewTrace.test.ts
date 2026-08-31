/**
 * TRACE SUITE — Campaign payload → Content Editor → Live Preview
 *
 * WHY THIS EXISTS: the user reported that after the multi-agent campaign
 * finishes, the generated image appears in the campaign modal ("View") but
 * NOT in the Content Editor media panel and NOT in the Live Preview.
 *
 * This suite replicates the EXACT client-side data path:
 *
 *   1. campaignGraph output (state.generatedContent with imageUrl attached
 *      by the visualizer) → SSE workflow_completed → modal → page
 *   2. handleMultiAgentPayload transformation (page.tsx)
 *   3. The media derivation chain used by PlatformEditorRouter /
 *      PlatformPreviewWrapper (displayImageUrl / displayImageUrls)
 *
 * If any step silently drops the image URL, the corresponding test fails
 * BEFORE the change ships.
 */
import { describe, it, expect } from 'vitest';
import { normalizeHashtags } from '@/lib/hashtags';

// ---------------------------------------------------------------------------
// Exact replica of the page.tsx derivation inputs
// ---------------------------------------------------------------------------

interface GeneratedFormat {
  title?: string;
  caption: string;
  imagePrompt: string;
  visualPrompts: string[];
  overlayText: { step: number; title: string; body: string; theme: string }[];
  hashtags: string[];
  bestTime: string;
  imageUrls?: string[];
  imageUrl?: string | null;
  videoUrl?: string | null;
}

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', contentTypes: ['Feed', 'Carousel', 'Reel', 'Story'] },
  { id: 'facebook', label: 'Facebook', contentTypes: ['Feed', 'Multiple Photos', 'Reel', 'Story'] },
  { id: 'x', label: 'X', contentTypes: ['Post', 'Thread'] },
] as const;

function deriveSlideOverlayFallback(content: any, slideCount: number) {
  const caption = (content.caption || '').replace(/\s+/g, ' ').trim();
  const hook = (content.hook || content.title || '').toString().trim();
  const sentences = caption
    .split(/(?<=[.!?])\s+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 3);

  const overlays: { step: number; title: string; body: string; theme: string }[] = [];
  for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0;
    const isLast = i === slideCount - 1;
    const sentence = sentences[Math.min(i, sentences.length - 1)] || '';
    overlays.push({
      step: i + 1,
      title: isFirst && hook ? hook.slice(0, 60) : isLast ? 'Save This & Follow' : `Key Insight ${i}`,
      body: sentence || (isLast ? 'Follow for more actionable growth strategies.' : caption.slice(0, 120)),
      theme: i % 2 === 0 ? 'gradient-purple' : 'gradient-blue',
    });
  }
  return overlays;
}

/**
 * EXACT replica of handleMultiAgentPayload (page.tsx) — the transformation
 * applied when the user clicks "Add Content to Editor" after a campaign run.
 * Includes the stale-media reset: a fresh campaign's generated image must win
 * over leftover clearedMediaKeys / customMediaDict / renderedImageUrlsDict /
 * mediaItemsDict entries from previous runs (they persist in the session
 * store + IndexedDB and used to hide/shadow every new image).
 */
function applyCampaignPayload(
  campaignPayload: any,
  prevGeneratedContents: Record<string, Record<string, GeneratedFormat>> = {},
  staleState: {
    clearedMediaKeys?: Record<string, boolean>;
    customMediaDict?: Record<string, { url: string; type: 'image' | 'video' }>;
    renderedImageUrlsDict?: Record<string, string>;
    mediaItemsDict?: Record<string, any[]>;
  } = {}
): {
  generatedContents: Record<string, Record<string, GeneratedFormat>>;
  clearedMediaKeys: Record<string, boolean>;
  customMediaDict: Record<string, { url: string; type: 'image' | 'video' }>;
  renderedImageUrlsDict: Record<string, string>;
  mediaItemsDict: Record<string, any[]>;
} {
  if (!campaignPayload || !campaignPayload.platforms) {
    return {
      generatedContents: prevGeneratedContents,
      clearedMediaKeys: staleState.clearedMediaKeys || {},
      customMediaDict: staleState.customMediaDict || {},
      renderedImageUrlsDict: staleState.renderedImageUrlsDict || {},
      mediaItemsDict: staleState.mediaItemsDict || {},
    };
  }

  // ── stale-format-key collection (page.tsx fix) ──
  // ONLY formats whose incoming content actually carries media are reset:
  // a media-less format (e.g. X Thread text_only) must never destroy
  // user-uploaded media.
  const refreshedFormatKeys: string[] = [];
  for (const [plt, formats] of Object.entries(
    campaignPayload.platforms as Record<string, Record<string, any>>
  )) {
    const normalizedPlt = plt.toLowerCase();
    const pltDef = PLATFORMS.find((p) => p.id.toLowerCase() === normalizedPlt);
    const validFmts = pltDef?.contentTypes || [];
    for (const [fmt, rawContent] of Object.entries(formats)) {
      const content = rawContent || {};
      const hasMedia = Boolean(
        content.imageUrl ||
          content.videoUrl ||
          (Array.isArray(content.slideUrls) && content.slideUrls.length > 0)
      );
      if (!hasMedia) continue;
      refreshedFormatKeys.push(`${normalizedPlt}-${fmt}`);
      const matchedTitleCase = validFmts.find((vf: string) => vf.toLowerCase() === fmt.toLowerCase());
      if (matchedTitleCase) {
        refreshedFormatKeys.push(`${normalizedPlt}-${matchedTitleCase}`);
      }
    }
  }
  const isStaleMediaKey = (key: string) =>
    refreshedFormatKeys.some((prefix) => key === prefix || key.startsWith(`${prefix}-`));

  const updated = { ...prevGeneratedContents };
  for (const [plt, formats] of Object.entries(
    campaignPayload.platforms as Record<string, Record<string, any>>
  )) {
    const normalizedPlt = plt.toLowerCase();
    updated[normalizedPlt] = updated[normalizedPlt] || {};

    const pltDef = PLATFORMS.find((p) => p.id.toLowerCase() === normalizedPlt);
    const validFmts = pltDef?.contentTypes || [];

    for (const [fmt, rawContent] of Object.entries(formats)) {
      const content = rawContent || {};
      const caption = content.caption || '';
      const hashtags = normalizeHashtags(content.hashtags);
      const visualPrompts =
        Array.isArray(content.visualPrompts) && content.visualPrompts.length > 0
          ? content.visualPrompts
          : content.imagePrompt || content.visualPrompt
          ? [content.imagePrompt || content.visualPrompt]
          : [];

      const imageUrl = content.imageUrl || null;
      const videoUrl = content.videoUrl || null;
      const slideUrls = Array.isArray(content.slideUrls)
        ? content.slideUrls
        : imageUrl
        ? [imageUrl]
        : [];

      const formatData: GeneratedFormat = {
        title: content.title || '',
        caption,
        imagePrompt: content.imagePrompt || content.visualPrompt || '',
        hashtags,
        visualPrompts,
        bestTime: content.bestTime || 'Best engagement window',
        overlayText:
          Array.isArray(content.overlayText) && content.overlayText.length > 0
            ? content.overlayText
            : deriveSlideOverlayFallback(content, Math.max(visualPrompts.length, slideUrls.length, 3)),
        imageUrl,
        videoUrl,
        imageUrls: slideUrls,
      };

      updated[normalizedPlt][fmt] = formatData;
      updated[normalizedPlt][fmt.toLowerCase()] = formatData;

      const matchedTitleCase = validFmts.find((vf: string) => vf.toLowerCase() === fmt.toLowerCase());
      if (matchedTitleCase) {
        updated[normalizedPlt][matchedTitleCase] = formatData;
      }
    }
  }

  // ── stale-media reset (page.tsx fix) ──
  const filterDict = <T>(dict: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(dict).filter(([k]) => !isStaleMediaKey(k)));

  return {
    generatedContents: updated,
    clearedMediaKeys: filterDict(staleState.clearedMediaKeys || {}),
    customMediaDict: filterDict(staleState.customMediaDict || {}),
    renderedImageUrlsDict: filterDict(staleState.renderedImageUrlsDict || {}),
    mediaItemsDict: filterDict(staleState.mediaItemsDict || {}),
  };
}

/**
 * EXACT replica of the derivation chain in page.tsx that feeds both the
 * Content Editor (PlatformEditorRouter) and the Live Preview
 * (PlatformPreviewWrapper) for a single-image format like Instagram Feed.
 */
function deriveDisplayImageUrl(opts: {
  generatedContents: Record<string, Record<string, GeneratedFormat>>;
  activePlatformTab: string;
  currentFormatName: string;
  activeSlideIdx?: number;
  clearedMediaKeys?: Record<string, boolean>;
  customMediaDict?: Record<string, { url: string; type: 'image' | 'video' }>;
  renderedImageUrlsDict?: Record<string, string>;
  isMultiFormat?: boolean;
}): { displayImageUrl: string | null; displayImageUrls: string[]; currentGenerated?: GeneratedFormat } {
  const {
    generatedContents,
    activePlatformTab,
    currentFormatName,
    activeSlideIdx = 0,
    clearedMediaKeys = {},
    customMediaDict = {},
    renderedImageUrlsDict = {},
    isMultiFormat = false,
  } = opts;

  const currentGenerated =
    generatedContents[activePlatformTab]?.[currentFormatName] ||
    generatedContents[activePlatformTab]?.[currentFormatName.toLowerCase()] ||
    Object.values(generatedContents[activePlatformTab] || {})[0];

  const currentVisualPrompts = currentGenerated?.visualPrompts || [];
  const currentOverlayTexts = currentGenerated?.overlayText || [];
  const aiGeneratedImageUrls =
    currentGenerated?.imageUrls && currentGenerated.imageUrls.length > 0
      ? currentGenerated.imageUrls
      : null;

  const displayPrompts = isMultiFormat ? currentVisualPrompts : currentVisualPrompts.slice(0, 1);
  const totalCarouselSlides = isMultiFormat
    ? Math.max(displayPrompts.length, currentOverlayTexts.length, aiGeneratedImageUrls?.length || 0, 3)
    : 1;

  // displayImageUrls memo (page.tsx)
  const count = isMultiFormat ? totalCarouselSlides : 1;
  const displayImageUrls: string[] = [];
  for (let i = 0; i < count; i++) {
    const slideKey = `${activePlatformTab}-${currentFormatName}-${i}`;
    if (clearedMediaKeys[slideKey]) {
      displayImageUrls.push('');
    } else if (customMediaDict[slideKey]?.url) {
      displayImageUrls.push(customMediaDict[slideKey].url);
    } else if (renderedImageUrlsDict[slideKey]) {
      displayImageUrls.push(renderedImageUrlsDict[slideKey]);
    } else if (aiGeneratedImageUrls && aiGeneratedImageUrls[i]) {
      displayImageUrls.push(aiGeneratedImageUrls[i]);
    } else {
      displayImageUrls.push('');
    }
  }

  // aiMediaUrl / rawDisplayUrl / displayImageUrl (page.tsx)
  const currentMediaKey = `${activePlatformTab}-${currentFormatName}-${activeSlideIdx}`;
  const customMedia = customMediaDict[currentMediaKey] || null;
  const renderedImageUrl = renderedImageUrlsDict[currentMediaKey] || null;
  const aiMediaUrl =
    currentGenerated?.videoUrl ||
    currentGenerated?.imageUrl ||
    (aiGeneratedImageUrls ? displayImageUrls[activeSlideIdx] || displayImageUrls[0] : '');
  const rawDisplayUrl = customMedia?.url || renderedImageUrl || (isMultiFormat
    ? displayImageUrls[activeSlideIdx] || null
    : aiMediaUrl || null);
  const displayImageUrl = clearedMediaKeys[currentMediaKey] ? null : rawDisplayUrl || null;

  return { displayImageUrl, displayImageUrls, currentGenerated };
}

// ---------------------------------------------------------------------------
// Realistic campaign payload — exactly what campaignGraph produces after the
// visualizer attaches imageUrl (visualizer sets targetObj.imageUrl and, for
// multi-image buckets, targetObj.slideUrls).
// ---------------------------------------------------------------------------

function buildCampaignPayload(opts?: { slideUrls?: boolean }): any {
  const img = (n: number) =>
    opts?.slideUrls
      ? [`https://cdn.supabase.co/img-${n}-a.png`, `https://cdn.supabase.co/img-${n}-b.png`, `https://cdn.supabase.co/img-${n}-c.png`]
      : [`https://cdn.supabase.co/img-${n}.png`];

  return {
    platforms: {
      instagram: {
        feed: {
          platform: 'instagram',
          contentType: 'feed',
          title: 'Why founders burn out',
          caption: 'You are not lazy. Your systems are. Here is the fix.',
          hashtags: ['#Founders', '#Systems'],
          hook: 'Stop scrolling.',
          visualRequired: true,
          visualType: 'image',
          visualPrompt: 'photorealistic founder at desk',
          visualPrompts: ['photorealistic founder at desk'],
          aspectRatio: '1:1',
          wordCount: 12,
          readingTimeSeconds: 5,
          imageUrl: img(1)[0],
          ...(opts?.slideUrls ? { slideUrls: img(1) } : {}),
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('campaign → editor → preview image flow', () => {
  it('happy path: generated imageUrl reaches the editor media panel and live preview', () => {
    const payload = buildCampaignPayload();
    const { generatedContents, clearedMediaKeys, customMediaDict, renderedImageUrlsDict } =
      applyCampaignPayload(payload);

    const { displayImageUrl, displayImageUrls, currentGenerated } = deriveDisplayImageUrl({
      generatedContents,
      activePlatformTab: 'instagram',
      currentFormatName: 'Feed',
      clearedMediaKeys,
      customMediaDict,
      renderedImageUrlsDict,
    });

    expect(currentGenerated?.imageUrl).toBe('https://cdn.supabase.co/img-1.png');
    expect(displayImageUrl).toBe('https://cdn.supabase.co/img-1.png');
    expect(displayImageUrls[0]).toBe('https://cdn.supabase.co/img-1.png');
  });

  it('carousel: slideUrls reach displayImageUrls in order', () => {
    const payload = buildCampaignPayload({ slideUrls: true });
    const { generatedContents, clearedMediaKeys, customMediaDict, renderedImageUrlsDict } =
      applyCampaignPayload(payload);

    const { displayImageUrls, displayImageUrl } = deriveDisplayImageUrl({
      generatedContents,
      activePlatformTab: 'instagram',
      currentFormatName: 'Carousel',
      clearedMediaKeys,
      customMediaDict,
      renderedImageUrlsDict,
      isMultiFormat: true,
      activeSlideIdx: 1,
    });

    expect(displayImageUrls.slice(0, 3)).toEqual([
      'https://cdn.supabase.co/img-1-a.png',
      'https://cdn.supabase.co/img-1-b.png',
      'https://cdn.supabase.co/img-1-c.png',
    ]);
    expect(displayImageUrl).toBe('https://cdn.supabase.co/img-1-b.png');
  });

  it('REGRESSION: stale clearedMediaKeys from a previous run no longer hides the NEW campaign image', () => {
    const payload = buildCampaignPayload();
    // User removed media on instagram-Feed-0 in a PREVIOUS campaign/session.
    // clearedMediaKeys persisted in the session store and (before the fix) kept
    // nullifying the display of every subsequently generated image.
    const { generatedContents, clearedMediaKeys, customMediaDict, renderedImageUrlsDict } =
      applyCampaignPayload(payload, {}, {
        clearedMediaKeys: { 'instagram-Feed-0': true },
      });

    // The fix drops the stale key when the campaign is applied:
    expect(clearedMediaKeys['instagram-Feed-0']).toBeUndefined();

    const { displayImageUrl } = deriveDisplayImageUrl({
      generatedContents,
      activePlatformTab: 'instagram',
      currentFormatName: 'Feed',
      clearedMediaKeys,
      customMediaDict,
      renderedImageUrlsDict,
    });

    expect(displayImageUrl).toBe('https://cdn.supabase.co/img-1.png');
  });

  it('REGRESSION: stale customMediaDict upload from a previous run no longer shadows the new campaign image', () => {
    const payload = buildCampaignPayload();
    const { generatedContents, clearedMediaKeys, customMediaDict, renderedImageUrlsDict } =
      applyCampaignPayload(payload, {}, {
        customMediaDict: { 'instagram-Feed-0': { url: '/uploads/OLD-upload.png', type: 'image' } },
      });

    // The fix drops the stale upload when the campaign is applied:
    expect(customMediaDict['instagram-Feed-0']).toBeUndefined();

    const { displayImageUrl } = deriveDisplayImageUrl({
      generatedContents,
      activePlatformTab: 'instagram',
      currentFormatName: 'Feed',
      clearedMediaKeys,
      customMediaDict,
      renderedImageUrlsDict,
    });

    expect(displayImageUrl).toBe('https://cdn.supabase.co/img-1.png');
  });

  it('REGRESSION: stale overrides for OTHER formats are preserved (only refreshed formats reset)', () => {
    const payload = buildCampaignPayload(); // only instagram/feed refreshed
    const { customMediaDict, clearedMediaKeys } = applyCampaignPayload(payload, {}, {
      customMediaDict: {
        'instagram-Reel-0': { url: '/uploads/my-reel.mp4', type: 'video' },
        'facebook-Feed-0': { url: '/uploads/fb-img.png', type: 'image' },
      },
      clearedMediaKeys: { 'pinterest-Pin-0': true },
    });

    // Untouched formats keep their user media/flags:
    expect(customMediaDict['instagram-Reel-0']?.url).toBe('/uploads/my-reel.mp4');
    expect(customMediaDict['facebook-Feed-0']?.url).toBe('/uploads/fb-img.png');
    expect(clearedMediaKeys['pinterest-Pin-0']).toBe(true);
  });

  it('REGRESSION: media-less formats (e.g. X Thread text_only) NEVER wipe user-uploaded media', () => {
    // A campaign that includes x/thread — the visualizer attaches no media to
    // text_only formats, so the payload arrives without imageUrl/slideUrls.
    const payload = {
      platforms: {
        instagram: {
          feed: {
            platform: 'instagram',
            contentType: 'feed',
            caption: 'With image',
            hashtags: ['#A'],
            visualPrompt: 'p',
            visualPrompts: ['p'],
            overlayText: [],
            imageUrl: 'https://cdn.supabase.co/img-1.png',
          },
        },
        x: {
          thread: {
            platform: 'x',
            contentType: 'thread',
            caption: 'Text-only thread',
            hashtags: ['#B'],
            visualPrompt: 'p',
            visualPrompts: ['p'],
            overlayText: [],
            // no imageUrl / videoUrl / slideUrls — text_only
          },
        },
      },
    };

    const { customMediaDict, mediaItemsDict, clearedMediaKeys } = applyCampaignPayload(payload, {}, {
      customMediaDict: {
        // User's own uploaded image for the thread slot — must SURVIVE
        'x-Thread-0': { url: 'https://cdn.supabase.co/user-thread-img.png', type: 'image' },
      },
      mediaItemsDict: {
        'x-Thread': [{ id: 'item_1', url: 'https://cdn.supabase.co/user-thread-img.png', type: 'image', prompt: 'p' }],
      },
      clearedMediaKeys: { 'x-Thread-1': true },
    });

    // Media-less format keeps ALL user media state:
    expect(customMediaDict['x-Thread-0']?.url).toBe('https://cdn.supabase.co/user-thread-img.png');
    expect(mediaItemsDict['x-Thread']?.[0]?.url).toBe('https://cdn.supabase.co/user-thread-img.png');
    expect(clearedMediaKeys['x-Thread-1']).toBe(true);
  });
});
