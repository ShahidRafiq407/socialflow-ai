import { vertexProvider, MODELS } from "@/lib/agents/llm";
import { uploadBase64ToStorage, isSupabaseConfigured } from "@/lib/supabase";
import { getPlatformFormatSpec } from "@/lib/agents/platformMapping";
import { envInt, sleep } from "@/lib/agents/concurrency";
import { getModelRatePacer } from "@/lib/agents/rateLimit";
import {
  buildDesignSystemInstruction,
  buildInfographicSlidePrompt,
  isDocumentFormat,
  isTextRichFormat,
  pickDeckStyle,
  type SlideTextSpec,
} from "@/lib/agents/slideDesigner";

/**
 * Vertex answers a quota rejection with its own `RetryInfo` ("retryDelay":"27s").
 * Honouring it is the difference between one clean retry and burning every attempt
 * against a window that has not reopened yet.
 */
export function parseRetryDelayMs(message: string): number {
  if (!message) return 0;
  const seconds = message.match(/retry[_-]?delay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s?/i);
  if (seconds) return Math.round(Number(seconds[1]) * 1000);
  const retryAfter = message.match(/retry[- ]?after["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i);
  if (retryAfter) return Math.round(Number(retryAfter[1]) * 1000);
  return 0;
}

/**
 * Whether a failure is the provider refusing on rate/quota grounds.
 *
 * This is worth telling apart from every other failure because it is the only one
 * that is a *clock* rather than a fault: the request was fine, the window was shut.
 * It calls for a wait sized to the window and a smaller allowance afterwards — not
 * the exponential backoff that suits an overloaded model.
 */
export function isQuotaFailure(message: string): boolean {
  return /\b429\b|quota|resource[_\s-]?exhaust|rate[_\s-]?limit|too many requests/i.test(
    message || ""
  );
}

/**
 * Turns a provider error into something a marketer can act on. The old
 * "failed to produce image bytes" was true of every cause and useful for none.
 */
export function describeFailure(message: string): string {
  const msg = (message || "").toLowerCase();
  if (!msg) return "no image data returned";
  if (/429|quota|exhaust|rate limit|too many requests/.test(msg)) {
    // Spelled out because the instinct is to go and check the billing page. Vertex
    // meters requests-per-minute per model separately from spend, so an account with
    // credit to burn still gets refused for going too fast.
    return "the image model's per-minute request quota is full (a rate limit, not a billing limit)";
  }
  if (/timeout|deadline/.test(msg)) return "the render exceeded its time budget";
  if (/503|unavailable|overloaded/.test(msg)) return "the image model is temporarily overloaded";
  if (/permission|401|403|credential|unauthenticated/.test(msg)) {
    return "the image model rejected the project credentials";
  }
  if (/not found|404|does not exist/.test(msg)) return "the configured image model is not available to this project";
  if (/safety|blocked|prohibited|recitation/.test(msg)) return "the prompt was blocked by safety filters";
  return message.length > 180 ? `${message.slice(0, 180)}…` : message;
}

export type VisualErrorCode =
  | "VISUALIZER_PROVIDER_ERROR"
  | "VISUALIZER_API_KEY_MISSING"
  | "VISUALIZER_MODEL_NOT_AVAILABLE"
  | "IMAGE_GENERATION_FAILED"
  | "VIDEO_GENERATION_FAILED"
  | "VIDEO_GENERATION_TIMEOUT"
  | "VISUALIZER_ASSET_MISSING"
  | "VISUALIZER_OUTPUT_TYPE_MISMATCH"
  | "VISUALIZER_ASPECT_RATIO_MISMATCH"
  | "VISUALIZER_STORAGE_FAILED"
  | "VISUALIZER_VALIDATION_FAILED";

export class VisualizerError extends Error {
  public code: VisualErrorCode;
  public details?: any;

  constructor(code: VisualErrorCode, message: string, details?: any) {
    super(message);
    this.name = "VisualizerError";
    this.code = code;
    this.details = details;
  }
}

export interface GenerateMediaInput {
  platform: string;
  contentType: string;
  mediaType: "image" | "video" | "multi_image";
  prompt: string;
  visualPrompts?: string[];
  aspectRatio: string;
  caption?: string;
  topic?: string;
  videoTask?: string;
  sourceImage?: string | null;
  sourceVideo?: string | null;
  style?: string;
  quality?: string;
  imageModel?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /**
   * Per-slide informational copy (headline + key insight) that MUST be typeset into
   * the generated graphic for carousels / idea pins / multi-image / document formats.
   */
  slideTexts?: SlideTextSpec[];
  /** How many slides/pages to render. Defaults to the slideTexts/visualPrompts length. */
  slideCount?: number;
  /** Index offset when rendering a single slide of a larger deck (editor path). */
  slideIndexOffset?: number;
  /** Total deck size when rendering a single slide of a larger deck. */
  totalSlides?: number;
  /**
   * "infographic" forces the text-rich graphic-design pipeline, "photographic" forces
   * the classic photo pipeline. "auto" (default) decides from the format.
   */
  designMode?: "auto" | "infographic" | "photographic";
  brandName?: string;
  brandColors?: string[];
  industry?: string;
  /** Extra art direction typed by the user in the Carousel Studio. */
  extraInstructions?: string;
}

export interface MediaAssetOutput {
  id: string;
  platform: string;
  contentType: string;
  type: "image" | "video";
  url: string;
  prompt: string;
  /** The ratio the pixels were actually rendered at. */
  aspectRatio: string;
  /**
   * The ratio the target platform ideally wanted, when it differs from what was
   * rendered — a shared family render serves several platforms, so the editor needs
   * to know the intended crop rather than assuming `aspectRatio` is native.
   */
  requestedAspectRatio?: string;
  status: "completed" | "failed";
  provider: string;
  model: string;
  createdAt: number;
  duration?: number;
  slideIndex?: number;
  totalSlides?: number;
  error?: string;
}

function validateAssetUrl(url: string, type: "image" | "video") {
  if (
    !url ||
    (!url.startsWith("http://") &&
      !url.startsWith("https://") &&
      !url.startsWith("data:") &&
      !url.startsWith("/") &&
      !url.startsWith("blob:"))
  ) {
    throw new VisualizerError(
      "VISUALIZER_VALIDATION_FAILED",
      `Rendered ${type} asset allocation failed string target formatting.`
    );
  }
}

// Helper to convert data URLs to inline MIME and bytes for Google GenAI
const toInlineInput = (url: string | null | undefined): { mimeType: string; bytes: string } | null => {
  if (!url) return null;
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  return match ? { mimeType: match[1], bytes: match[2] } : null;
};

/**
 * Flagship Video Synthesis Handler — Google Veo family via the Gemini SDK
 * generateVideos API with automatic model fallback. Google decommissions
 * "-preview" models without notice (HTTP 404 "Publisher model not found"), so
 * the configured model is tried first and stable Veo GA models follow.
 */
async function generateRealVideo(options: {
  prompt: string;
  topic: string;
  aspectRatio: string;
  model: string;
  videoTask?: string;
  sourceImage?: string | null;
  sourceVideo?: string | null;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model, videoTask, sourceImage, sourceVideo, signal, onProgress } = options;
  const ai = (vertexProvider as any).ai;

  // Video generation runs on the configured video model (MODELS.VIDEO, overridable
  // via MODEL_VIDEO_GENERATOR). Never hardcode the model here — the caller already
  // resolved it, and ignoring `model` made the env override silently dead.
  const candidateModels = [model || MODELS.VIDEO].filter(Boolean);

  const inlineImage = toInlineInput(sourceImage);
  const inlineVideo = toInlineInput(sourceVideo);

  // Video render budgets belong to the deployment (region, model tier), not to the code.
  const videoTimeoutMs = envInt("VIDEO_TIMEOUT_MS", 120000, { min: 20000, max: 600000 });
  const videoPollIntervalMs = envInt("VIDEO_POLL_INTERVAL_MS", 3000, { min: 500, max: 30000 });
  // Video quotas are far tighter than image quotas — a couple of starts a minute is
  // typical — so the same pacer guards them, with its own allowance.
  const videoRpm = envInt("VIDEO_MODEL_RPM", 2, { min: 1, max: 120 });

  let lastErr: any = null;

  for (const targetVideoModel of candidateModels) {
    console.log(`[Visualizer] Dispatching Video synthesis on Instance: ${targetVideoModel} for topic: "${topic}" (Task: ${videoTask || "auto"})`);

    // One render start per slot. Polling an operation that is already running is not
    // metered the same way, so only the kick-off waits here.
    const videoPacer = getModelRatePacer(targetVideoModel, { limit: videoRpm });
    await videoPacer.acquire({
      signal,
      onWait: (waitMs, info) =>
        onProgress?.(
          `[Visualizer] ${targetVideoModel} is at its rate ceiling (${info.used}/${info.limit} this minute) — starting in ${Math.max(1, Math.round(waitMs / 1000))}s...`
        ),
    });
    if (signal?.aborted) throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");

    try {
      // 1. Primary: Google Interactions API (native endpoint for Omni-class models)
      if (typeof (ai as any)?.interactions?.create === "function") {
        const fullPrompt = prompt.trim();
        
        onProgress?.(`[Visualizer] Synthesizing video frames & audio stream via ${targetVideoModel}...`);

        let formattedInput: any = fullPrompt;
        const inputParts: any[] = [];

        if (sourceImage) {
          if (sourceImage.startsWith("data:")) {
            const match = sourceImage.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              inputParts.push({
                type: "image",
                mime_type: match[1],
                data: match[2],
              });
            }
          } else if (sourceImage.startsWith("http://") || sourceImage.startsWith("https://")) {
            inputParts.push({
              type: "image",
              uri: sourceImage,
            });
          }
        }

        if (sourceVideo) {
          if (sourceVideo.startsWith("data:")) {
            const match = sourceVideo.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              inputParts.push({
                type: "video",
                mime_type: match[1],
                data: match[2],
              });
            }
          } else if (sourceVideo.startsWith("http://") || sourceVideo.startsWith("https://")) {
            inputParts.push({
              type: "video",
              uri: sourceVideo,
            });
          }
        }

        if (inputParts.length > 0) {
          inputParts.push({ type: "text", text: fullPrompt });
          formattedInput = inputParts;
        }

        let videoTimeout: ReturnType<typeof setTimeout> | undefined;
        const interaction = await Promise.race([
          (ai as any).interactions.create({
            model: targetVideoModel,
            input: formattedInput,
          }),
          new Promise((_, reject) => {
            videoTimeout = setTimeout(
              () => reject(new Error(`Video synthesis timeout after ${Math.round(videoTimeoutMs / 1000)}s`)),
              videoTimeoutMs
            );
          }),
        ]).finally(() => {
          if (videoTimeout) clearTimeout(videoTimeout);
        });

        // Check direct output_video (standard response format from Omni-class models)
        const directVideo = (interaction as any)?.output_video || (interaction as any)?.outputVideo;
        if (directVideo?.data) {
          onProgress?.(`[Visualizer] ✅ Video synthesis complete via ${targetVideoModel}!`);
          const mime = directVideo.mime_type || directVideo.mimeType || "video/mp4";
          const base64Data = `data:${mime};base64,${directVideo.data}`;
          
          try {
            const uploadedUrl = await uploadBase64ToStorage(base64Data, `video-${Date.now()}.mp4`, mime);
            if (uploadedUrl) return uploadedUrl;
          } catch (storageErr) {
            console.warn("[Visualizer] Video storage upload failed, returning data URI:", storageErr);
          }
          return base64Data;
        }

        if (directVideo?.uri) {
          onProgress?.(`[Visualizer] ✅ Video asset ready via ${targetVideoModel}!`);
          return directVideo.uri;
        }

        // Check steps format
        if (interaction?.steps) {
          for (const step of (interaction as any).steps) {
            if (step.type === "model_output" && Array.isArray(step.content)) {
              for (const part of step.content) {
                if (part.type === "video" && part.data) {
                  onProgress?.(`[Visualizer] ✅ Video synthesis complete!`);
                  return `data:video/mp4;base64,${part.data}`;
                } else if (part.type === "video" && part.uri) {
                  return part.uri;
                }
              }
            }
          }
        }
      }

      // 2. generateVideos (Veo path — the standard Google GenAI video API)
      if (typeof ai?.models?.generateVideos === "function") {
        onProgress?.(`[Visualizer] Initializing video synthesis (${targetVideoModel})... 5%`);
        let operation = await ai.models.generateVideos({
          model: targetVideoModel,
          prompt: `${prompt}, dynamic engaging commercial video for ${topic}`,
          ...(inlineImage && !inlineVideo ? { image: { imageBytes: inlineImage.bytes, mimeType: inlineImage.mimeType } } : {}),
          ...(inlineVideo ? { video: { videoBytes: inlineVideo.bytes, mimeType: inlineVideo.mimeType } } : {}),
          config: {
            aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
            numberOfVideos: 1,
          },
        });

        if (operation) {
          const startTime = Date.now();
          const opName = operation.name || `operation_${Date.now()}`;

          while (!operation.done) {
            if (signal?.aborted) {
              throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
            }
            const elapsedMs = Date.now() - startTime;
            const elapsedSec = Math.round(elapsedMs / 1000);
            if (elapsedMs > videoTimeoutMs) {
              break;
            }

            // Real Google API progress percentage, or elapsed share of the actual budget
            // when the operation reports none — never an invented curve.
            const rawProgress = (operation as any)?.metadata?.progressPercentage;
            const progressPercent = typeof rawProgress === "number"
              ? rawProgress
              : Math.min(98, Math.max(5, Math.round((elapsedMs / videoTimeoutMs) * 100)));

            onProgress?.(`Rendering video frames: ${progressPercent}% (${elapsedSec}s elapsed)`);
            await sleep(videoPollIntervalMs, signal);

            if (typeof (ai.operations as any)?.getVideosOperation === "function") {
              operation = await (ai.operations as any).getVideosOperation({ operation });
            } else if (typeof (ai.operations as any)?.get === "function") {
              operation = await (ai.operations as any).get({ name: opName });
            } else if (typeof operation.poll === "function") {
              operation = await operation.poll();
            } else {
              break;
            }
          }

          const videoBytes = operation?.response?.generatedVideos?.[0]?.video?.videoBytes;
          const videoUri = operation?.response?.generatedVideos?.[0]?.video?.uri;

          if (videoBytes) {
            onProgress?.(`[Visualizer] ✅ Video frame synthesis completed 100%!`);
            return `data:video/mp4;base64,${videoBytes}`;
          }
          if (videoUri) {
            onProgress?.(`[Visualizer] ✅ Video asset ready 100%!`);
            return videoUri;
          }
        }
      }
    } catch (err: any) {
      lastErr = err;
      if (err?.isCancelled || signal?.aborted) throw err;
      const message = err?.message ? String(err.message) : String(err);
      if (isQuotaFailure(message)) videoPacer.penalize(parseRetryDelayMs(message));
      console.warn(`[Visualizer] Video synthesis on ${targetVideoModel} failed:`, err?.message || err);
    }
  }

  // If every candidate model failed, throw the actual last error
  if (lastErr) {
    const message = lastErr?.message ? String(lastErr.message) : String(lastErr);
    throw new VisualizerError(
      "VIDEO_GENERATION_FAILED",
      `Video synthesis failed on all candidate models (${candidateModels.join(", ")}). Last error: ${message}` +
        (isQuotaFailure(message)
          ? ` — this is a per-minute rate limit on the video model, not a billing limit; raise the quota in Google Cloud or lower VIDEO_MODEL_RPM (currently ${videoRpm}).`
          : "")
    );
  }

  throw new VisualizerError(
    "VIDEO_GENERATION_FAILED",
    "Video synthesis could not produce a valid video output on any candidate model."
  );
}

/** Hard bounds for a generated deck — every target platform accepts 2-10 slides. */
export const MIN_DECK_SLIDES = 2;
export const MAX_DECK_SLIDES = 10;
export const DEFAULT_DECK_SLIDES = 5;

export function clampDeckSlides(count: number | undefined | null, fallback = DEFAULT_DECK_SLIDES): number {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_DECK_SLIDES, Math.max(MIN_DECK_SLIDES, Math.round(n)));
}

export function resolveVisualRequirements(
  platform: string,
  contentType: string,
  desiredSlides?: number
) {
  // Single source of truth: delegate to getPlatformFormatSpec from platformMapping.ts
  const spec = getPlatformFormatSpec(platform, contentType);

  let assetType: "image" | "video" | "multi_image" = "image";
  let requiredAssets = 1;
  // Text-only formats (X text posts, LinkedIn text updates, …) publish without any
  // media. Callers used to still queue an image render for them because assetType
  // fell through to "image" — that burned a paid generation on an asset nothing reads.
  let visualRequired = true;

  if (spec.mediaType === "video") {
    assetType = "video";
    requiredAssets = 1;
  } else if (spec.mediaType === "multi_image") {
    assetType = "multi_image";
    // A deck is only as long as there is real teaching copy for — the caller passes
    // the actual storyboard length so the CEO audit checks against what was asked for.
    requiredAssets = clampDeckSlides(desiredSlides, 3);
  } else if (spec.mediaType === "text_only") {
    assetType = "image";
    requiredAssets = 0;
    visualRequired = false;
  } else {
    assetType = "image";
    requiredAssets = 1;
  }

  return {
    assetType,
    aspectRatio: spec.aspectRatio,
    requiredAssets,
    visualRequired,
    mediaType: spec.mediaType,
  };
}

export async function generateMediaAsset(input: GenerateMediaInput): Promise<MediaAssetOutput[]> {
  const { platform, contentType, mediaType, prompt, aspectRatio, topic = "Marketing", onProgress } = input;

  const hasKey =
    !!process.env.GEMINI_API_KEY ||
    !!process.env.GOOGLE_API_KEY ||
    !!process.env.GOOGLE_CREDENTIALS_JSON ||
    (!!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY);

  if (!hasKey) {
    throw new VisualizerError("VISUALIZER_API_KEY_MISSING", "Google Cloud Environment credentials structure mapping is broken.");
  }

  const results: MediaAssetOutput[] = [];

  if (mediaType === "video") {
    onProgress?.(`[Visualizer] Compiling video stream via ${MODELS.VIDEO}...`);

    const videoUrl = await generateRealVideo({
      prompt: prompt.trim(),
      topic,
      aspectRatio,
      model: MODELS.VIDEO,
      videoTask: input.videoTask,
      sourceImage: input.sourceImage,
      sourceVideo: input.sourceVideo,
      signal: input.signal,
      onProgress,
    });

    if (!videoUrl || !videoUrl.trim()) {
      throw new VisualizerError("VISUALIZER_ASSET_MISSING", "Video thread compilation returned an empty frame link.");
    }

    let finalVideoUrl = videoUrl;
    if (videoUrl.startsWith("data:")) {
      onProgress?.(`[Visualizer] Persisting video asset to Storage CDN...`);
      const storageUrl = await uploadBase64ToStorage(videoUrl, `video-${platform}-${contentType}-${Date.now()}.mp4`, "video/mp4");
      if (storageUrl) {
        finalVideoUrl = storageUrl;
      }
    }

    validateAssetUrl(finalVideoUrl, "video");
    results.push({
      id: `asset_vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      platform,
      contentType,
      type: "video",
      url: finalVideoUrl,
      prompt: prompt.trim(),
      aspectRatio,
      status: "completed",
      provider: "google_vertex",
      model: MODELS.VIDEO,
      createdAt: Date.now(),
    });

    return results;
  }

  // -------------------------------------------------------------
  // REAL IMAGE GENERATION (Vertex AI image model, MODELS.VISUALIZER)
  // -------------------------------------------------------------
  const targetImageModel = input.imageModel || MODELS.VISUALIZER;

  // ── TEXT-RICH (INFOGRAPHIC) MODE ──────────────────────────────────────────────
  // Carousels, Idea Pins, Multi-Image posts and LinkedIn Documents are informational
  // formats. They must ship with the headline + key insight TYPESET INTO the graphic,
  // otherwise the published post is a decorative image that teaches nothing.
  const slideTexts = (input.slideTexts || []).filter(
    (s) => s && ((s.title || "").trim() || (s.body || "").trim() || (s.points || []).length > 0)
  );
  const isDeck = mediaType === "multi_image";
  const designMode = input.designMode || "auto";
  const isInfographic =
    designMode === "infographic" ||
    (designMode !== "photographic" &&
      (slideTexts.length > 0 || isDeck) &&
      isTextRichFormat(contentType, mediaType));

  onProgress?.(
    isInfographic
      ? `[Visualizer] Designing text-rich informational ${isDocumentFormat(contentType) ? "document pages" : "slides"} via ${targetImageModel}...`
      : `[Visualizer] Synthesizing photographic canvas via ${targetImageModel}...`
  );

  const requestedDeckSlides = Math.max(
    input.slideCount || 0,
    input.visualPrompts?.length || 0,
    slideTexts.length
  );
  const assetCount = isDeck ? clampDeckSlides(requestedDeckSlides, 3) : 1;

  // Position inside the overall deck (the editor renders one slide at a time).
  const slideOffset = Math.max(0, input.slideIndexOffset || 0);
  const deckTotal = isDeck
    ? assetCount
    : Math.max(input.totalSlides || 0, slideOffset + 1, 1);

  const validAspectRatios = ["1:1", "9:16", "16:9", "3:4", "4:3"];
  // The image API only accepts these 5 ratios. Platform ratios outside this list 
  // MUST map to the closest supported one instead of throwing 400 errors.
  const aspectFallbackMap: Record<string, string> = {
    "1.91:1": "16:9",
    "21:9": "16:9",
    "4:5": "3:4",    // Instagram Feed portrait fallback
    "2:3": "9:16",   // Pinterest standard fallback
    "3:2": "16:9",   // Landscape fallback
  };
  const targetImageAspect = aspectRatio
    ? (validAspectRatios.includes(aspectRatio)
        ? aspectRatio
        : (aspectFallbackMap[aspectRatio] || "1:1"))
    : "1:1";

  const styleInstructionMap: Record<string, string> = {
    photorealistic: "hyper-realistic photograph, natural lighting, true-to-life textures, sharp optical lens focus",
    cinematic: "cinematic film still, dramatic volumetric lighting, shallow depth of field, anamorphic aesthetic",
    commercial_product: "clean commercial product photography, professional studio light box, pristine reflective surface, ultra-crisp detail",
    minimalist: "minimalist graphic aesthetic, elegant negative space, clean geometric composition, modern editorial palette",
    "3d_render": "3D digital render, Octane / Unreal Engine style, ray-traced reflections, intricate ambient occlusion",
    editorial: "high-fashion editorial magazine shot, artistic avant-garde composition, high dynamic range color grading",
    illustration: "modern vector digital illustration, bold clean contours, stylized vibrant color harmony",
  };

  const qualityInstructionMap: Record<string, string> = {
    ultra_hd_8k: "8K UHD master resolution, extreme micro-texture detail, flawless edge clarity, HDR dynamic range",
    studio_4k: "4K studio quality, crisp clarity, clean post-processing, balanced exposure",
    standard_hd: "high-definition crisp image, vibrant balanced colors",
  };

  const styleClause = input.style && styleInstructionMap[input.style] ? styleInstructionMap[input.style] : "";
  const qualityClause = input.quality && qualityInstructionMap[input.quality] ? qualityInstructionMap[input.quality] : "";

  // One design system per deck so every slide of the same carousel looks like one deck.
  const deckStyle = pickDeckStyle(
    `${input.brandName || ""}|${topic || contentType}|${platform}`
  );

  const systemInstructionText = isInfographic
    ? buildDesignSystemInstruction(targetImageAspect, qualityClause, targetImageModel)
    : `You are ${targetImageModel}, a world-class professional image synthesis engine in Google Cloud Model Garden. Adhere strictly to aspect ratio (${targetImageAspect})${styleClause ? `, style: ${styleClause}` : ""}${qualityClause ? `, quality standard: ${qualityClause}` : ""}. Ensure authentic subject anatomy, realistic depth of field, and perfect composition.`;

  // Typesetting several text blocks takes noticeably longer than a plain photo render.
  // Both ceilings are deployment facts (region, model tier), not pipeline constants.
  //
  // gemini-3-pro-image routinely takes 30-120s for one render on Vertex — the old
  // 40s default made the pipeline give up on prompts that are still rendering fine
  // (a single-prompt render squeaks under the cap, the campaign's longer art-direction
  // prompts do not), so the budget has to fit the model, not the other way round.
  const imageTimeoutMs = isInfographic
    ? envInt("IMAGE_TIMEOUT_INFOGRAPHIC_MS", 220000, { min: 10000, max: 300000 })
    : envInt("IMAGE_TIMEOUT_MS", 180000, { min: 10000, max: 300000 });
  // Spacing between slides of one deck keeps a burst of renders inside the model's
  // per-minute allowance instead of provoking the 429 the retry then has to absorb.
  const slideSpacingMs = envInt("IMAGE_SLIDE_SPACING_MS", 1000, { min: 0, max: 30000 });
  // Requests per minute the deployment's quota actually allows for the image model.
  // Sending slower than the wall is the only thing that reliably clears a 429 — Vertex
  // meters rate per model independently of the account balance, so no amount of credit
  // substitutes for pacing. Raise it on a project with a lifted quota or provisioned
  // throughput; the pacer lowers itself on its own if the provider disagrees.
  const imageRpm = envInt("IMAGE_MODEL_RPM", 6, { min: 1, max: 600 });

  for (let idx = 0; idx < assetCount; idx++) {
    if (input.signal?.aborted) {
      throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
    }
    if (idx > 0 && slideSpacingMs > 0) {
      onProgress?.(`[Visualizer] Preparing slide ${idx + 1}/${assetCount}...`);
      await sleep(slideSpacingMs, input.signal);
    }

    const currentPrompt = (input.visualPrompts && input.visualPrompts[idx])
      ? input.visualPrompts[idx].trim()
      : prompt.trim();

    let slidePrompt: string;
    let deckSlideIndex = isDeck ? idx : slideOffset;
    let deckSlideTotal = Math.max(deckTotal, deckSlideIndex + 1);

    if (isInfographic) {
      // Absolute position of this render inside the published deck.
      const deckIndex = isDeck ? idx : slideOffset;
      const slideText = slideTexts.length > 0
        ? (slideTexts[isDeck ? idx : Math.min(slideOffset, slideTexts.length - 1)] || slideTexts[0])
        : undefined;

      slidePrompt = buildInfographicSlidePrompt({
        platform,
        contentType,
        aspectRatio: targetImageAspect,
        slideIndex: deckIndex,
        totalSlides: Math.max(deckTotal, deckIndex + 1),
        slideText,
        visualPrompt: currentPrompt,
        topic,
        brandName: input.brandName,
        brandColors: input.brandColors,
        industry: input.industry,
        extraInstructions: input.extraInstructions,
        deckStyle,
        isDocument: isDocumentFormat(contentType),
      });

      if (qualityClause) slidePrompt += `\n- Output fidelity: ${qualityClause}.`;
      // The image endpoint ignores `systemInstruction`, so the role directive is
      // carried inline as the opening line of the brief.
      slidePrompt = `${systemInstructionText}\n\n${slidePrompt}`;
      deckSlideIndex = deckIndex;
      deckSlideTotal = Math.max(deckTotal, deckIndex + 1);
    } else {
      const clauses = [currentPrompt];
      if (styleClause) clauses.push(styleClause);
      if (qualityClause) clauses.push(qualityClause);
      slidePrompt = clauses.filter(Boolean).join(", ");
    }

    try {
      const ai = (vertexProvider as any).ai;
      let imageUrl = "";
      /** Why the last attempt produced nothing — reported instead of a bare "no bytes". */
      let lastFailure = "";
      let attemptsUsed = 0;

      // Use the targetImageModel as requested instead of hardcoding. It stays a
      // `let` only so the record of which model actually drew the asset is truthful
      // when the ladder below had to step down.
      let modelName = targetImageModel;

      // 1. generateContent with responseModalities (Official Google Gemini Image Generation API)
      if (typeof ai?.models?.generateContent === "function") {
        // Two request shapes: most Gemini image models want TEXT+IMAGE back, a few
        // reject the text modality and need IMAGE alone. The shape rotates per attempt,
        // it does NOT bound the retries — the loop used to iterate this array, so a
        // single 429 consumed a shape instead of being retried and the whole campaign
        // died with "no image bytes" after about six seconds of patience.
        const modalityCombos = [["TEXT", "IMAGE"], ["IMAGE"]];
        // Kept deliberately small. The per-model rate pacer keeps the request rate
        // under the quota even with several families rendering in parallel, so the old
        // retry storm (up to 7 tries chasing 429s) is no longer needed — one render,
        // and a single second try only for a genuine transient blip. Set
        // IMAGE_MAX_ATTEMPTS=1 to disable the retry entirely.
        const maxRungAttempts = envInt("IMAGE_MAX_ATTEMPTS", 2, { min: 1, max: 12 });
        const baseBackoffMs = envInt("IMAGE_RETRY_BACKOFF_MS", 2000, { min: 250, max: 60000 });
        const maxBackoffMs = envInt("IMAGE_RETRY_BACKOFF_MAX_MS", 24000, {
          min: baseBackoffMs,
          max: 120000,
        });

        // Model step-down is OFF by default: the configured image model is the only one
        // used, so no run silently swaps in a lighter model. To allow a fallback after
        // the primary exhausts its attempts, set IMAGE_FALLBACK_MODELS to a comma list
        // (e.g. "gemini-2.5-flash-image").
        const fallbackModels = (process.env.IMAGE_FALLBACK_MODELS ?? "")
          .split(",")
          .map((m) => m.trim())
          .filter((m) => m && m !== targetImageModel);

        // The whole retry sequence, flattened: one entry per request we are willing to
        // send, in order. Flat beats nested loops here because "attempt 6 of 7" stays
        // meaningful to the person watching even when attempt 6 is on another model.
        const plan = [
          { model: targetImageModel, attempts: maxRungAttempts },
          ...fallbackModels.map((m) => ({ model: m, attempts: Math.min(2, maxRungAttempts) })),
        ].flatMap((rung) =>
          Array.from({ length: rung.attempts }, (_, i) => ({
            model: rung.model,
            modalities: modalityCombos[i % modalityCombos.length],
            isFallback: rung.model !== targetImageModel,
          }))
        );

        const maxAttempts = plan.length;

        for (let attempt = 1; attempt <= maxAttempts && !imageUrl; attempt++) {
          if (input.signal?.aborted) {
            throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
          }

          const step = plan[attempt - 1];
          const modalities = step.modalities;
          modelName = step.model;
          attemptsUsed = attempt;

          // Hold here until this model's per-minute window has room. Doing it before
          // the request rather than after the rejection is the difference between
          // pacing the deck and manufacturing our own 429s eight slides in a row.
          const pacer = getModelRatePacer(modelName, { limit: imageRpm });
          await pacer.acquire({
            signal: input.signal,
            onWait: (waitMs, info) =>
              onProgress?.(
                `[Visualizer] ${modelName} is at its rate ceiling (${info.used}/${info.limit} this minute) — resuming in ${Math.max(1, Math.round(waitMs / 1000))}s...`
              ),
          });
          if (input.signal?.aborted) {
            throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
          }

          try {
            const slideNoun = isInfographic
              ? (isDocumentFormat(contentType) ? "document page" : "designed slide")
              : "image";
            const statusLabel = assetCount > 1
              ? `[Visualizer] Rendering ${slideNoun} ${idx + 1}/${assetCount} with headline & insight text via ${modelName}...`
              : `[Visualizer] Generating ${slideNoun} via ${modelName}...`;
            onProgress?.(
              attempt > 1 ? `${statusLabel.replace(/\.\.\.$/, "")} (attempt ${attempt}/${maxAttempts})...` : statusLabel
            );
            console.log(`[Visualizer] Generating ${isInfographic ? "text-rich graphic" : "image"} on ${modelName} with modalities: ${modalities.join(",")} (Attempt ${attempt}/${maxAttempts})`);

            let contentsInput: any = slidePrompt;
            if (input.sourceImage) {
              const inline = toInlineInput(input.sourceImage);
              if (inline) {
                contentsInput = [
                  {
                    inlineData: {
                      mimeType: inline.mimeType,
                      data: inline.bytes,
                    },
                  },
                  {
                    text: isInfographic
                      ? `Use this reference image as the visual/brand foundation, then execute the following design brief on top of it:\n\n${slidePrompt}`
                      : `Create a professional marketing image incorporating the subject and aesthetic of this reference image for: ${slidePrompt}`,
                  },
                ];
              }
            }

            // The timeout only abandons the wait; the handle is cleared either way so a
            // finished render doesn't keep a stray timer alive for the whole ceiling.
            let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
            const genRes = await Promise.race([
              ai.models.generateContent({
                model: modelName,
                contents: contentsInput,
                config: {
                  responseModalities: modalities,
                  imageConfig: {
                    aspectRatio: targetImageAspect,
                  },
                },
              }),
              new Promise((_, reject) => {
                timeoutHandle = setTimeout(
                  () => reject(new Error(`Image generation timeout after ${imageTimeoutMs / 1000}s`)),
                  imageTimeoutMs
                );
              }),
            ]).finally(() => {
              if (timeoutHandle) clearTimeout(timeoutHandle);
            });

            // Check for generatedImages array (Google Cloud GenAI Imagen response format)
            const generatedImages = (genRes as any)?.generatedImages || (genRes as any)?.generated_images || [];
            for (const gImg of generatedImages) {
              if (gImg?.image?.imageBytes) {
                imageUrl = `data:${gImg.image.mimeType || "image/png"};base64,${gImg.image.imageBytes}`;
                console.log(`[Visualizer] ✅ Image generated successfully via generatedImages on ${modelName}`);
                break;
              }
            }

            // Fallback to checking candidates array (standard text/multimodal response format)
            if (!imageUrl) {
              const candidates = (genRes as any)?.candidates || [];
              for (const cand of candidates) {
                const parts = cand?.content?.parts || [];
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
                    console.log(`[Visualizer] ✅ Image generated successfully via generateContent on ${modelName}`);
                    break;
                  }
                  if (part.inline_data?.data) {
                    imageUrl = `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}`;
                    console.log(`[Visualizer] ✅ Image generated successfully via generateContent (inline_data) on ${modelName}`);
                    break;
                  }
                  if (part.image?.imageBytes) {
                    imageUrl = `data:image/png;base64,${part.image.imageBytes}`;
                    console.log(`[Visualizer] ✅ Image generated successfully via generateContent (imageBytes) on ${modelName}`);
                    break;
                  }
                }
                if (imageUrl) break;
              }

              if (!imageUrl) {
                const finishReason = candidates[0]?.finishReason || "unknown";
                const blockReason =
                  (genRes as any)?.promptFeedback?.blockReason ||
                  (genRes as any)?.prompt_feedback?.block_reason ||
                  "";
                lastFailure = blockReason
                  ? `${modelName} returned no image (${finishReason}, prompt blocked: ${blockReason})`
                  : `${modelName} returned no image (finishReason: ${finishReason})`;
                console.warn(`[Visualizer] ${lastFailure}.`);
              }
            }
          } catch (e: any) {
            lastFailure = e?.message || String(e);
            console.warn(`[Visualizer] generateContent on ${modelName} (${modalities.join(",")}) failed (attempt ${attempt}/${maxAttempts}):`, lastFailure);
            if (e?.isCancelled || input.signal?.aborted) {
              throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
            }
            // Teach the pacer what the provider just proved: our estimate of this
            // model's allowance was too high. It shrinks the window for everyone,
            // including the families rendering alongside this one.
            if (isQuotaFailure(lastFailure)) {
              pacer.penalize(parseRetryDelayMs(lastFailure));
            }
          }

          // Back off before the next attempt whether the call threw or simply came back
          // empty — both mean the model needs a moment, and an instant retry against a
          // throttled image model only burns the remaining attempts.
          if (!imageUrl && attempt < maxAttempts) {
            const next = plan[attempt];
            if (next.model !== modelName) {
              // Stepping down to another model. Its quota is its own, so the wait the
              // previous model earned does not apply — and its pacer will hold the
              // request anyway if that model is busy too.
              onProgress?.(
                `[Visualizer] ${modelName} could not deliver (${describeFailure(lastFailure)}) — stepping down to ${next.model} for this render...`
              );
            } else if (isQuotaFailure(lastFailure)) {
              // A quota wall is a clock, not congestion. The pacer was just told when
              // the window reopens, so it owns this wait: sleeping here as well would
              // double it, and `maxBackoffMs` (tuned for an overloaded model) would
              // cut a 60s window short and waste the attempt.
              onProgress?.(
                `[Visualizer] ${modelName} hit its per-minute quota — waiting for the next window (attempt ${attempt + 1}/${maxAttempts})...`
              );
            } else {
              const hinted = parseRetryDelayMs(lastFailure);
              const waitMs = Math.min(
                maxBackoffMs,
                Math.max(hinted, baseBackoffMs * Math.pow(2, attempt - 1))
              );
              onProgress?.(
                `[Visualizer] ${modelName} unavailable (${describeFailure(lastFailure)}) — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts})...`
              );
              await sleep(waitMs, input.signal);
            }
          }
        }
      }

      // 2. interactions.create fallback if available
      if (!imageUrl && typeof (ai as any)?.interactions?.create === "function") {
        try {
          // Still the same model on the same quota, so this request queues in the same
          // window as the attempts above rather than jumping it.
          const pacer = getModelRatePacer(modelName, { limit: imageRpm });
          await pacer.acquire({
            signal: input.signal,
            onWait: (waitMs) =>
              onProgress?.(
                `[Visualizer] Waiting ${Math.max(1, Math.round(waitMs / 1000))}s for ${modelName}'s quota window before the fallback render...`
              ),
          });
          if (input.signal?.aborted) {
            throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
          }
          let interactionTimeout: ReturnType<typeof setTimeout> | undefined;
          const interaction = await Promise.race([
            (ai as any).interactions.create({
              model: modelName,
              input: slidePrompt,
              // The Interactions API takes the ratio inside generation_config, NOT
              // next to `model`: a top-level aspect_ratio is rejected with
              // 400 Unknown parameter 'aspect_ratio'.
              generation_config: {
                image_config: {
                  aspect_ratio: targetImageAspect,
                },
              },
            }),
            new Promise((_, reject) => {
              interactionTimeout = setTimeout(
                () => reject(new Error("Image interactions.create timeout")),
                Math.round(imageTimeoutMs * 0.9)
              );
            }),
          ]).finally(() => {
            if (interactionTimeout) clearTimeout(interactionTimeout);
          });

          const directImg = (interaction as any)?.output_image || (interaction as any)?.outputImage;
          if (directImg?.data) {
            imageUrl = `data:${directImg.mime_type || "image/png"};base64,${directImg.data}`;
            console.log(`[Visualizer] ✅ Image generated successfully via interactions.create on ${modelName}`);
          } else if (directImg?.uri) {
            imageUrl = directImg.uri;
            console.log(`[Visualizer] ✅ Image asset ready via interactions.create on ${modelName}`);
          }
        } catch (e: any) {
          if (e?.isCancelled || input.signal?.aborted || e instanceof VisualizerError) throw e;
          // The primary path's failure is the real story. Keep it ahead of the
          // fallback's own error so a quota wall is never masked by a 400.
          const fallbackFailure = e?.message ? String(e.message) : "";
          lastFailure =
            lastFailure && fallbackFailure
              ? `${lastFailure} | interactions fallback: ${fallbackFailure}`
              : fallbackFailure || lastFailure;
          if (isQuotaFailure(fallbackFailure)) {
            getModelRatePacer(modelName, { limit: imageRpm }).penalize(
              parseRetryDelayMs(fallbackFailure)
            );
          }
          console.warn(`[Visualizer] interactions.create on ${modelName} failed:`, e?.message || e);
        }
      }

      if (!imageUrl) {
        // Say what actually went wrong, and — for the one cause a person can act on —
        // where the lever is. "failed to produce image bytes" told nobody whether it
        // was a quota wall, a blocked prompt or a timeout.
        const quotaWall = isQuotaFailure(lastFailure);
        throw new VisualizerError(
          "IMAGE_GENERATION_FAILED",
          `${modelName} produced no image after ${attemptsUsed || 1} attempt(s)` +
            (lastFailure ? `: ${describeFailure(lastFailure)}` : ".") +
            (quotaWall
              ? ` Vertex meters image requests per minute per model, separately from your credit balance, so adding credit will not clear this. Either raise the quota for ${modelName} in Google Cloud (IAM & Admin → Quotas) or lower IMAGE_MODEL_RPM (currently ${imageRpm}) and CAMPAIGN_MEDIA_CONCURRENCY so the pipeline sends slower.`
              : ""),
        );
      }

      let finalImageUrl = imageUrl;
      if (imageUrl.startsWith("data:")) {
        const storageUrl = await uploadBase64ToStorage(imageUrl, `img-${platform}-${contentType}-${idx}-${Date.now()}.png`, "image/png");
        if (storageUrl) {
          finalImageUrl = storageUrl;
        }
      }

      validateAssetUrl(finalImageUrl, "image");

      results.push({
        id: `asset_img_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        platform,
        contentType,
        type: "image",
        url: finalImageUrl,
        prompt: slidePrompt,
        aspectRatio: targetImageAspect,
        status: "completed",
        provider: "google_vertex",
        model: modelName,
        createdAt: Date.now(),
        slideIndex: deckSlideIndex,
        totalSlides: deckSlideTotal,
      });
    } catch (err: any) {
      console.error(`[Visualizer] Slide ${idx + 1} generation failed:`, err);
      throw new VisualizerError("IMAGE_GENERATION_FAILED", err.message || "Failed to generate image asset.");
    }
  }

  return results;
}
