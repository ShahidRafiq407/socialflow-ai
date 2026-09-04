/**
 * TRACE SUITE — Informational deck formats must ship TEXT-RICH graphics
 *
 * WHY THIS EXISTS: Carousel, Idea Pin, Multi-Image and Document are informational
 * formats — people swipe them to learn something. The AI Studio used to hand the image
 * model a background-only art direction, so it returned a decorative photo and the
 * per-slide headline/insight the copy agent wrote never reached the published pixels.
 *
 * These tests lock the pieces that guarantee the fix:
 *   1. every one of those formats is detected as text-rich (on every platform naming),
 *   2. the design brief actually contains the exact strings to typeset,
 *   3. one deck = one design system (deterministic, no Math.random),
 *   4. two decks with different words never share a rendered asset (fingerprint).
 *
 * If any of these regress, the published carousel silently becomes a plain image again.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDesignSystemInstruction,
  buildInfographicSlidePrompt,
  deckFingerprint,
  getSlideRole,
  isDocumentFormat,
  isTextRichFormat,
  pickDeckStyle,
  sanitizeSlideText,
} from '@/lib/agents/slideDesigner';
import { getPlatformFormatSpec } from '@/lib/agents/platformMapping';

// ---------------------------------------------------------------------------
// 1. FORMAT DETECTION — every informational format the user named
// ---------------------------------------------------------------------------
describe('isTextRichFormat — informational deck formats', () => {
  const TEXT_RICH = [
    'Carousel',
    'carousel',
    'Idea Pin',
    'ideapin',
    'idea_pin',
    'Document',
    'Multi-Image',
    'multi image',
    'multi_image',
    'Multiple Photos',
    'multiple_photos',
  ];

  it.each(TEXT_RICH)('treats "%s" as text-rich', (format) => {
    expect(isTextRichFormat(format)).toBe(true);
  });

  const SINGLE_VISUAL = ['Feed', 'Reel', 'Story', 'Post', 'Pin', 'Video Pin', 'Shorts', 'Thread'];

  it.each(SINGLE_VISUAL)('leaves "%s" as a single visual', (format) => {
    expect(isTextRichFormat(format)).toBe(false);
  });

  it('falls back to the resolved media type when the format name is opaque', () => {
    expect(isTextRichFormat('Slides', 'multi_image')).toBe(true);
    expect(isTextRichFormat('Slides', 'carousel')).toBe(true);
    expect(isTextRichFormat('Slides', 'document')).toBe(true);
    expect(isTextRichFormat('Slides', 'image')).toBe(false);
  });

  it('only flags Document as a paged deck', () => {
    expect(isDocumentFormat('Document')).toBe(true);
    expect(isDocumentFormat('LinkedIn Document / PDF Carousel')).toBe(true);
    expect(isDocumentFormat('Carousel')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. PLATFORM MAPPING — deck formats must resolve to multi_image, not one image
// ---------------------------------------------------------------------------
describe('getPlatformFormatSpec — deck formats resolve to a multi-slide asset', () => {
  const DECKS: [string, string, string][] = [
    ['instagram', 'carousel', '1:1'],
    ['linkedin', 'carousel', '1:1'],
    ['linkedin', 'document', '1:1'],
    ['linkedin', 'multi-image', '1:1'],
    ['pinterest', 'idea pin', '9:16'],
    ['pinterest', 'carousel', '2:3'],
    ['facebook', 'multiple photos', '1:1'],
  ];

  it.each(DECKS)('%s / %s → multi_image @ %s', (platform, format, aspect) => {
    const spec = getPlatformFormatSpec(platform, format);
    expect(spec.mediaType).toBe('multi_image');
    expect(spec.aspectRatio).toBe(aspect);
  });

  it('routes unmapped deck names to multi_image instead of a single image', () => {
    expect(getPlatformFormatSpec('threads', 'carousel').mediaType).toBe('multi_image');
    expect(getPlatformFormatSpec('threads', 'idea pin').mediaType).toBe('multi_image');
    expect(getPlatformFormatSpec('mastodon', 'multi-image').mediaType).toBe('multi_image');
  });

  it('keeps unmapped documents square (a PDF page is not a 9:16 story)', () => {
    const spec = getPlatformFormatSpec('notion', 'document');
    expect(spec.mediaType).toBe('multi_image');
    expect(spec.aspectRatio).toBe('1:1');
  });

  it('still resolves single visuals and video normally', () => {
    expect(getPlatformFormatSpec('instagram', 'feed').mediaType).toBe('image');
    expect(getPlatformFormatSpec('instagram', 'reel').mediaType).toBe('video');
    expect(getPlatformFormatSpec('linkedin', 'article').mediaType).toBe('text_only');
  });
});

// ---------------------------------------------------------------------------
// 3. THE DESIGN BRIEF — the words must reach the image model verbatim
// ---------------------------------------------------------------------------
describe('buildInfographicSlidePrompt', () => {
  const baseCtx = {
    platform: 'instagram',
    contentType: 'Carousel',
    aspectRatio: '1:1',
    slideIndex: 1,
    totalSlides: 5,
    slideText: {
      step: 2,
      title: 'Why Physical AI Changes Scaling',
      body: 'Robot fleets cut per-unit inspection cost by 38% once perception runs on-device.',
    },
    visualPrompt: 'abstract low-contrast circuit texture, calm dark backdrop',
    topic: 'Physical AI in manufacturing',
    brandName: 'SMB Robotics',
    industry: 'Industrial Robotics',
  };

  it('typesets the headline and body copy character-for-character', () => {
    const brief = buildInfographicSlidePrompt(baseCtx);
    expect(brief).toContain(`"${baseCtx.slideText.title}"`);
    expect(brief).toContain(`"${baseCtx.slideText.body}"`);
    expect(brief).toMatch(/HEADLINE \(largest text on the canvas\)/);
    expect(brief).toMatch(/BODY COPY/);
  });

  it('states plainly that this is a designed graphic, not a photograph', () => {
    const brief = buildInfographicSlidePrompt(baseCtx);
    expect(brief).toMatch(/NOT a plain photograph/);
    expect(brief).toMatch(/NOT an empty background/);
  });

  it('renders the slide counter and the brand footer', () => {
    const brief = buildInfographicSlidePrompt(baseCtx);
    expect(brief).toContain('"2/5"');
    expect(brief).toContain('"SMB Robotics"');
  });

  it('carries the background art direction as a backdrop only', () => {
    const brief = buildInfographicSlidePrompt(baseCtx);
    expect(brief).toContain(baseCtx.visualPrompt);
    expect(brief).toMatch(/backdrop and supporting illustration only/);
  });

  it('supplies a background directive even when no art direction was written', () => {
    const brief = buildInfographicSlidePrompt({ ...baseCtx, visualPrompt: '' });
    expect(brief).toMatch(/BACKGROUND: an on-topic, low-contrast/);
    // The copy must survive a missing visual prompt — that is the whole point.
    expect(brief).toContain(`"${baseCtx.slideText.title}"`);
  });

  it('never ships a wordless slide — falls back to the campaign topic', () => {
    const brief = buildInfographicSlidePrompt({
      ...baseCtx,
      slideText: { step: 2, title: '', body: '' },
    });
    expect(brief).toContain(`"${baseCtx.topic}"`);
  });

  it('gives slide 1 the hook role and the last slide the closing role', () => {
    const hook = buildInfographicSlidePrompt({ ...baseCtx, slideIndex: 0 });
    const cta = buildInfographicSlidePrompt({ ...baseCtx, slideIndex: 4 });
    const middle = buildInfographicSlidePrompt(baseCtx);
    expect(hook).toMatch(/COVER \/ HOOK slide/);
    expect(cta).toMatch(/CLOSING slide/);
    expect(middle).toMatch(/TEACHING slide/);
    expect(cta).toContain('"5/5"');
  });

  it('closes the deck on a question, never on a rendered sales button', () => {
    // The last slide used to be briefed as a CTA, so the image model typeset an
    // offer, a price or a "contact us" block into the final frame at full render
    // cost. The closing slide now asks the reader something instead.
    const cta = buildInfographicSlidePrompt({ ...baseCtx, slideIndex: 4 });
    expect(cta).toMatch(/asks the reader the question/);
    expect(cta).toMatch(/NEVER render a sales button/);
    expect(cta.toLowerCase()).toContain("'contact us'");
  });

  it('describes a Document as a paged PDF instead of a slide', () => {
    const brief = buildInfographicSlidePrompt({
      ...baseCtx,
      platform: 'linkedin',
      contentType: 'Document',
      isDocument: true,
      slideIndex: 2,
      totalSlides: 7,
    });
    expect(brief).toMatch(/DOCUMENT PAGE/);
    expect(brief).toMatch(/page 3 of 7/);
  });

  it('honours brand colours above the generated palette', () => {
    const brief = buildInfographicSlidePrompt({
      ...baseCtx,
      brandColors: ['#0F62FE', '#FF7A00'],
    });
    expect(brief).toMatch(/Brand colours to honour above all else: #0F62FE, #FF7A00/);
  });

  it('passes the Carousel Studio instructions through to the designer', () => {
    const brief = buildInfographicSlidePrompt({
      ...baseCtx,
      extraInstructions: 'Use the 2026 rebrand typography and keep every slide bilingual.',
    });
    expect(brief).toMatch(/ADDITIONAL CLIENT DIRECTION: Use the 2026 rebrand typography/);
  });

  it('forbids invented text, placeholders and misspellings', () => {
    const brief = buildInfographicSlidePrompt(baseCtx);
    expect(brief).toMatch(/Zero misspellings/);
    expect(brief).toMatch(/Zero placeholder text/);
    expect(brief).toMatch(/no captions, hashtags, watermarks/);
  });

  it('collapses to a clean brief with no blank-line runs or stray markers', () => {
    const brief = buildInfographicSlidePrompt({ ...baseCtx, topic: undefined, brandName: undefined });
    expect(brief).not.toMatch(/\n{3,}/);
    expect(brief).not.toContain('undefined');
    expect(brief.trim()).toBe(brief);
  });
});

// ---------------------------------------------------------------------------
// 4. ONE DECK = ONE DESIGN SYSTEM (deterministic, resume-safe)
// ---------------------------------------------------------------------------
describe('pickDeckStyle', () => {
  it('is deterministic — every slide of a deck resolves to the same style', () => {
    const seed = 'SMB Robotics|Physical AI in manufacturing|instagram';
    const first = pickDeckStyle(seed);
    for (let i = 0; i < 10; i++) {
      expect(pickDeckStyle(seed)).toEqual(first);
    }
  });

  it('ignores case and surrounding whitespace so slides never drift apart', () => {
    expect(pickDeckStyle('  Acme|Topic|linkedin  ')).toEqual(pickDeckStyle('acme|topic|linkedin'));
  });

  it('varies across campaigns instead of giving every brand one look', () => {
    const styles = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map((s) => pickDeckStyle(s).name)
    );
    expect(styles.size).toBeGreaterThan(1);
  });

  it('always returns a usable palette, typography and layout', () => {
    const style = pickDeckStyle('');
    expect(style.palette).toBeTruthy();
    expect(style.typography).toBeTruthy();
    expect(style.layout).toBeTruthy();
    expect(style.motif).toBeTruthy();
  });

  it('puts the chosen design system into every slide of the same deck', () => {
    const ctx = {
      platform: 'linkedin',
      contentType: 'Carousel',
      aspectRatio: '1:1',
      totalSlides: 3,
      topic: 'Warehouse automation ROI',
      brandName: 'SMB Robotics',
    };
    const style = pickDeckStyle(`${ctx.brandName}|${ctx.topic}|${ctx.platform}`);
    for (const slideIndex of [0, 1, 2]) {
      const brief = buildInfographicSlidePrompt({ ...ctx, slideIndex });
      expect(brief).toContain(`"${style.name}"`);
      expect(brief).toContain(style.palette);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. FINGERPRINT — decks with different words must never share an asset
// ---------------------------------------------------------------------------
describe('deckFingerprint', () => {
  it('matches for identical deck copy', () => {
    expect(deckFingerprint(['Hook', 'Body one', 'CTA'])).toBe(
      deckFingerprint(['Hook', 'Body one', 'CTA'])
    );
  });

  it('differs when a single word changes — no cross-platform text bleed', () => {
    expect(deckFingerprint(['Hook', 'Body one'])).not.toBe(deckFingerprint(['Hook', 'Body two']));
  });

  it('differs when the slide order changes', () => {
    expect(deckFingerprint(['A', 'B'])).not.toBe(deckFingerprint(['B', 'A']));
  });

  it('skips empty entries so an absent body does not shift the key', () => {
    expect(deckFingerprint(['A', undefined, 'B'])).toBe(deckFingerprint(['A', 'B']));
  });

  it('is a short, cache-key-safe token', () => {
    expect(deckFingerprint(['A very long headline that goes on and on'])).toMatch(/^[0-9a-z]+$/);
  });
});

// ---------------------------------------------------------------------------
// 6. TEXT HYGIENE — the typesetter gets clean, in-frame strings
// ---------------------------------------------------------------------------
describe('sanitizeSlideText', () => {
  it('collapses newlines and repeated whitespace', () => {
    expect(sanitizeSlideText('Line one\n\n  Line   two', 100)).toBe('Line one Line two');
  });

  it('normalizes smart quotes that break the typesetter', () => {
    expect(sanitizeSlideText('The “best” option', 100)).toBe("The 'best' option");
  });

  // REGRESSION: the character class was once flattened to three ASCII quotes by an
  // editor round-trip, so curly quotes flowed straight into the `render exactly: "..."`
  // delimiters and the image model could not tell where the string ended.
  it('normalizes every quote form the copy models emit', () => {
    expect(sanitizeSlideText('don’t stop', 100)).toBe("don't stop");
    expect(sanitizeSlideText('a ‘quoted’ word', 100)).toBe("a 'quoted' word");
    expect(sanitizeSlideText('a „German“ quote', 100)).toBe("a 'German' quote");
    expect(sanitizeSlideText('a «French» quote', 100)).toBe("a 'French' quote");
    expect(sanitizeSlideText('6″ prime and 6′ feet', 100)).toBe("6' prime and 6' feet");
    expect(sanitizeSlideText('a `backtick` word', 100)).toBe("a 'backtick' word");
    expect(sanitizeSlideText('a "straight" word', 100)).toBe("a 'straight' word");
  });

  it('leaves no double-quote character that could break the brief delimiters', () => {
    const messy = 'The “AI-first” shift: don’t wait — «act» now';
    const out = sanitizeSlideText(messy, 200);
    expect(out).not.toMatch(/["“”„‟«»]/);
    expect(out).toBe("The 'AI-first' shift: don't wait — 'act' now");
  });

  it('clamps on a word boundary instead of mid-word', () => {
    const out = sanitizeSlideText('Robotics fleets cut inspection cost dramatically', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toBe('Robotics fleets cut');
  });

  it('drops a trailing separator left behind by the clamp', () => {
    expect(sanitizeSlideText('Scaling up, fast and cheap', 12)).toBe('Scaling up');
  });

  it('returns an empty string for missing copy', () => {
    expect(sanitizeSlideText(undefined, 50)).toBe('');
    expect(sanitizeSlideText('   ', 50)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 7. ROLE + SYSTEM DIRECTIVE
// ---------------------------------------------------------------------------
describe('getSlideRole', () => {
  it('opens with a hook and closes with a CTA', () => {
    expect(getSlideRole(0, 5)).toBe('hook');
    expect(getSlideRole(4, 5)).toBe('cta');
    expect(getSlideRole(2, 5)).toBe('insight');
  });

  it('treats a single-slide deck as a hook, not a CTA', () => {
    expect(getSlideRole(0, 1)).toBe('hook');
  });
});

describe('buildDesignSystemInstruction', () => {
  it('casts the model as a typographer bound to the requested ratio', () => {
    const directive = buildDesignSystemInstruction('9:16', '4K studio quality');
    expect(directive).toMatch(/graphic designer and typographer/);
    expect(directive).toContain('9:16');
    expect(directive).toContain('4K studio quality');
    expect(directive).toMatch(/Typographic accuracy is the single most important/);
  });

  it('omits the quality clause when none was chosen', () => {
    expect(buildDesignSystemInstruction('1:1')).not.toContain('Quality standard');
  });
});
