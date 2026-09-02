// ============================================================================
// MEDIA MODEL REGISTRY (client-safe)
//
// The controller never draws or films anything itself — images and video come
// from their own dedicated models. Those ids are needed on BOTH sides: the
// server picks them up through MODELS.VISUALIZER / MODELS.VIDEO in llm.ts, and
// the editors + AI Studio pickers have to name the same model in the request
// body and on the label.
//
// This module is the one place a media model string is written for the client.
// It is pure (no imports, no prisma, no server SDKs) so a "use client" file can
// import it, and only NEXT_PUBLIC_* vars are read because those are the only
// ones that survive into the browser bundle. llm.ts honours the same two vars,
// so a single env change moves the server and the UI together.
// ============================================================================

/** The image model. Override with NEXT_PUBLIC_MODEL_IMAGE_GENERATOR. */
export const IMAGE_MODEL_ID =
  process.env.NEXT_PUBLIC_MODEL_IMAGE_GENERATOR?.trim() || "gemini-3-pro-image";

/** The video model. Override with NEXT_PUBLIC_MODEL_VIDEO_GENERATOR. */
export const VIDEO_MODEL_ID =
  process.env.NEXT_PUBLIC_MODEL_VIDEO_GENERATOR?.trim() || "gemini-omni-flash-preview";

/** Product names for the model ids we ship with; anything else is shown as-is. */
const MODEL_LABELS: Record<string, string> = {
  "gemini-3-pro-image": "Nano Banana Pro",
  "gemini-2.5-flash-image": "Nano Banana",
  "gemini-omni-flash-preview": "Omni Flash Video",
};

/** Human name for a media model id — never invents one for an unknown id. */
export function mediaModelLabel(id: string): string {
  return MODEL_LABELS[id] || id;
}

export const IMAGE_MODEL_LABEL = mediaModelLabel(IMAGE_MODEL_ID);
export const VIDEO_MODEL_LABEL = mediaModelLabel(VIDEO_MODEL_ID);
