/**
 * Render settings an editor hands to the page when it asks for media.
 *
 * Every editor owns its own visual controls (aspect ratio, style, quality, video task,
 * a source image to animate). Both the standalone "generate the visual" button and the
 * one-press "generate the complete post" action pass the SAME bag, so the post the
 * one-press action produces uses exactly the settings the user picked in that editor.
 *
 * `prompt` is deliberately optional and normally omitted by the one-press action: the
 * visual prompt it should render is the one the copy agent wrote milliseconds earlier,
 * which the page holds and the editor has not been re-rendered with yet.
 */
export interface AIRenderOptions {
  mediaType?: "image" | "video";
  duration?: number;
  prompt?: string;
  aspectRatio?: string;
  videoTask?: string;
  sourceImage?: string | null;
  sourceVideo?: string | null;
  style?: string;
  quality?: string;
  imageModel?: string;
}
