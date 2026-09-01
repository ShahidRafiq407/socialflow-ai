/**
 * Shared client-side AI action cancellation.
 *
 * Editors dispatch `cancel-ai-action` with a scope + key; the AI Studio page
 * owns the AbortControllers and aborts the matching in-flight request.
 *
 * Scopes:
 *  - "copy"    → full copy generation ("Generate Caption, Hashtags & Prompt")
 *  - "field"   → single field generation (title / description / hashtags / altText)
 *  - "enhance" → prompt enhancement
 *  - "script"  → auto-prompt-from-caption
 *  - "analyze" → uploaded media analysis
 *  - "slide"   → single slide/page regeneration
 *  - "refine"  → caption quick actions (rewrite / boost hook / tone / hashtags)
 */
export type AIActionScope = "copy" | "field" | "enhance" | "script" | "analyze" | "slide" | "refine";

export function cancelAIAction(scope: AIActionScope, key: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cancel-ai-action", {
      detail: { scope, key },
    })
  );
}

/** Controller key convention shared by the page-level listener. */
export function aiActionControllerKey(scope: AIActionScope, key: string) {
  return `${scope}:${key}`;
}
