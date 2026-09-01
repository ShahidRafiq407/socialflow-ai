/**
 * Shared rules for the multi-slide deck editors — Instagram Carousel, LinkedIn
 * Document / Carousel and Pinterest Idea Pin.
 *
 * These used to be inline literals in each editor, which is exactly how Delete Slide
 * broke: LinkedInDocumentEditor guarded at `slides.length <= 2` while its delete button
 * rendered at `slides.length > 1`, so on a two-page document the button was visible and
 * silently did nothing. One source of truth keeps the guard and the button from drifting
 * apart again.
 */

/**
 * Smallest publishable deck. Instagram rejects a single-slide carousel and a one-page
 * document is just an image, so Delete Slide stops here.
 */
export const MIN_DECK_SLIDES = 2;

/** Whether a deck of this length still has a slide to spare. */
export function canRemoveDeckSlide(count: number): boolean {
  return count > MIN_DECK_SLIDES;
}

/**
 * Where the cursor lands after slide `removedIdx` is removed from a deck that is now
 * `nextLength` long: hold the same position so the user keeps reading forward, and fall
 * back to the new last slide when the tail was the one deleted.
 */
export function nextActiveSlideIndex(removedIdx: number, nextLength: number): number {
  return Math.max(0, Math.min(removedIdx, nextLength - 1));
}

/**
 * Extra context about *why* the slide array changed.
 *
 * Deleting a slide is not just "here is a shorter array" — the per-slide rendered
 * graphics are keyed by index upstream, so the parent needs to know which index went
 * away in order to shift them down. Without it, deleting slide 2 leaves slide 3's
 * design sitting under slide 2's copy.
 */
export interface SlidesChangeMeta {
  removedIndex?: number;
}
