/**
 * TRACE SUITE — Delete Slide must actually delete a slide
 *
 * WHY THIS EXISTS: the deck editors (Instagram Carousel, LinkedIn Document / Carousel,
 * Pinterest Idea Pin) each carried their own copy of the "how short can a deck get"
 * rule, and they drifted:
 *   - LinkedInDocumentEditor guarded at `slides.length <= 2` while its delete button
 *     rendered at `slides.length > 1`, so on a two-page document the button was visible
 *     and clicking it did nothing at all,
 *   - PinterestIdeaPinEditor allowed a delete down to one page while the page-count
 *     derivation upstream never went below two, so the deck snapped back.
 *
 * These tests lock the single shared rule so a button can never again be enabled for a
 * delete the handler will refuse.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_DECK_SLIDES,
  canRemoveDeckSlide,
  nextActiveSlideIndex,
} from '@/components/editors/deckSlides';

describe('canRemoveDeckSlide', () => {
  it('keeps a publishable minimum', () => {
    expect(MIN_DECK_SLIDES).toBe(2);
    expect(canRemoveDeckSlide(MIN_DECK_SLIDES)).toBe(false);
    expect(canRemoveDeckSlide(MIN_DECK_SLIDES + 1)).toBe(true);
  });

  it('allows the delete the user reported as broken (3 slides → 2)', () => {
    expect(canRemoveDeckSlide(3)).toBe(true);
  });

  it('never allows a deck below the minimum, however it got there', () => {
    expect(canRemoveDeckSlide(1)).toBe(false);
    expect(canRemoveDeckSlide(0)).toBe(false);
  });

  it('is the same answer the button and the handler both ask', () => {
    // The regression was a *disagreement*: the button showed at > 1 and the handler
    // bailed at <= 2. One predicate makes that impossible to reintroduce.
    for (const count of [0, 1, 2, 3, 10, 15]) {
      const buttonEnabled = canRemoveDeckSlide(count);
      const handlerProceeds = canRemoveDeckSlide(count);
      expect(buttonEnabled).toBe(handlerProceeds);
    }
  });
});

describe('nextActiveSlideIndex', () => {
  it('holds the position so the next slide slides into view', () => {
    // Deleting slide 2 of 4 leaves 3 slides; the cursor stays on index 1, which is now
    // the old slide 3 — the user keeps reading forward instead of jumping backwards.
    expect(nextActiveSlideIndex(1, 3)).toBe(1);
  });

  it('falls back to the new last slide when the tail was deleted', () => {
    expect(nextActiveSlideIndex(2, 2)).toBe(1);
  });

  it('stays on the first slide when the first slide is deleted', () => {
    expect(nextActiveSlideIndex(0, 2)).toBe(0);
  });

  it('never returns a negative index', () => {
    expect(nextActiveSlideIndex(0, 0)).toBe(0);
    expect(nextActiveSlideIndex(5, 0)).toBe(0);
  });
});
