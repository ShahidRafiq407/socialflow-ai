import { vertexProvider, MODELS } from "@/lib/agents/llm";
import { uploadBase64ToStorage, isSupabaseConfigured } from "@/lib/supabase";
import { getPlatformFormatSpec } from "@/lib/agents/platformMapping";

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
}

export interface MediaAssetOutput {
  id: string;
  platform: string;
  contentType: string;
  type: "image" | "video";
  url: string;
  prompt: string;
  aspectRatio: string;
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

  // Candidate models: configured model only (fallbacks removed as per user request)
  const candidateModels = [ model || MODELS.VIDEO || "gemini-omni-flash-preview" ];

  const inlineImage = toInlineInput(sourceImage);
  const inlineVideo = toInlineInput(sourceVideo);

  let lastErr: any = null;

  for (const targetVideoModel of candidateModels) {
    console.log(`[Visualizer] Dispatching Video synthesis on Instance: ${targetVideoModel} for topic: "${topic}" (Task: ${videoTask || "auto"})`);

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

        const interaction = await Promise.race([
          (ai as any).interactions.create({
            model: targetVideoModel,
            input: formattedInput,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Video synthesis timeout after 120s")), 120000)
          ),
        ]);

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
          const POLL_INTERVAL_MS = 3000;
          const TIMEOUT_MS = 120000;
          const startTime = Date.now();
          const opName = operation.name || `operation_${Date.now()}`;

          while (!operation.done) {
            if (signal?.aborted) {
              throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
            }
            const elapsedSec = Math.round((Date.now() - startTime) / 1000);
            if (Date.now() - startTime > TIMEOUT_MS) {
              break;
            }

            // Real Google API progress percentage or dynamic progression calculation
            const rawProgress = (operation as any)?.metadata?.progressPercentage;
            const progressPercent = typeof rawProgress === "number"
              ? rawProgress
              : Math.min(98, Math.max(10, Math.round((elapsedSec / 60) * 100)));

            onProgress?.(`Rendering video frames: ${progressPercent}% (${elapsedSec}s elapsed)`);
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

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
      console.warn(`[Visualizer] Video synthesis on ${targetVideoModel} failed:`, err?.message || err);
    }
  }

  // If every candidate model failed, throw the actual last error
  if (lastErr) {
    throw new VisualizerError(
      "VIDEO_GENERATION_FAILED",
      `Video synthesis failed on all candidate models (${candidateModels.join(", ")}). Last error: ${lastErr?.message || lastErr}`
    );
  }

  throw new VisualizerError(
    "VIDEO_GENERATION_FAILED",
    "Video synthesis could not produce a valid video output on any candidate model."
  );
}

export function resolveVisualRequirements(platform: string, contentType: string) {
  // Single source of truth: delegate to getPlatformFormatSpec from platformMapping.ts
  const spec = getPlatformFormatSpec(platform, contentType);

  let assetType: "image" | "video" | "multi_image" = "image";
  let requiredAssets = 1;

  if (spec.mediaType === "video") {
    assetType = "video";
    requiredAssets = 1;
  } else if (spec.mediaType === "multi_image") {
    assetType = "multi_image";
    requiredAssets = 3;
  } else if (spec.mediaType === "text_only") {
    assetType = "image";
    requiredAssets = 0;
  } else {
    assetType = "image";
    requiredAssets = 1;
  }

  return {
    assetType,
    aspectRatio: spec.aspectRatio,
    requiredAssets,
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
  // REAL IMAGE GENERATION (Vertex AI: gemini-3-pro-image / Nano Banana Pro)
  // -------------------------------------------------------------
  const targetImageModel = input.imageModel || MODELS.VISUALIZER || "gemini-3-pro-image";
  onProgress?.(`[Visualizer] Synthesizing photographic canvas via Nano Banana Pro (${targetImageModel})...`);

  const assetCount = mediaType === "multi_image" ? 3 : 1;

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

  const systemInstructionText = `You are Nano Banana Pro (gemini-3-pro-image), a world-class professional image synthesis engine in Google Cloud Model Garden. Adhere strictly to aspect ratio (${targetImageAspect})${styleClause ? `, style: ${styleClause}` : ""}${qualityClause ? `, quality standard: ${qualityClause}` : ""}. Ensure authentic subject anatomy, realistic depth of field, and perfect composition.`;

  for (let idx = 0; idx < assetCount; idx++) {
    if (input.signal?.aborted) {
      throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
    }
    if (idx > 0) {
      onProgress?.(`[Visualizer] Preparing slide ${idx + 1}/${assetCount}...`);
      await new Promise(r => setTimeout(r, 1000));
    }

    const currentPrompt = (input.visualPrompts && input.visualPrompts[idx])
      ? input.visualPrompts[idx].trim()
      : prompt.trim();

    const clauses = [currentPrompt];
    if (styleClause) clauses.push(styleClause);
    if (qualityClause) clauses.push(qualityClause);
    const slidePrompt = clauses.filter(Boolean).join(", ");

    try {
      const ai = (vertexProvider as any).ai;
      let imageUrl = "";

      // Use the targetImageModel as requested instead of hardcoding
      const modelName = targetImageModel;

      // 1. generateContent with responseModalities (Official Google Gemini Image Generation API)
      if (typeof ai?.models?.generateContent === "function") {
        const modalityCombos = [["TEXT", "IMAGE"], ["IMAGE"]];
        const MAX_TOTAL_ATTEMPTS = 3;
        const MAX_RATE_LIMIT_WAITS = 2;
        let totalAttempts = 0;
        let rateLimitWaits = 0;

        for (const modalities of modalityCombos) {
          if (imageUrl || totalAttempts >= MAX_TOTAL_ATTEMPTS) break;

          if (input.signal?.aborted) {
            throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Workflow cancelled by user");
          }

          totalAttempts++;

          try {
            const statusLabel = assetCount > 1
              ? `[Visualizer] Generating slide ${idx + 1}/${assetCount} via ${modelName}...`
              : `[Visualizer] Generating image via ${modelName}...`;
            onProgress?.(statusLabel);
            console.log(`[Visualizer] Generating image on ${modelName} with modalities: ${modalities.join(",")} (Attempt ${totalAttempts}/${MAX_TOTAL_ATTEMPTS})`);

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
                  { text: `Create a professional marketing image incorporating the subject and aesthetic of this reference image for: ${slidePrompt}` },
                ];
              }
            }

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
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Image generation timeout after 40s")), 40000)
              )
            ]);

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
                console.warn(`[Visualizer] ${modelName} responded without image data (${finishReason}). Retrying...`);
              }
            }
          } catch (e: any) {
            console.warn(`[Visualizer] generateContent on ${modelName} (${modalities.join(",")}) failed (attempt ${totalAttempts}/${MAX_TOTAL_ATTEMPTS}):`, e?.message || e);
            const msg = (e?.message || "").toLowerCase();
            const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("exhausted") || msg.includes("503") || msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("unavailable");

            if (isRateLimit && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
              rateLimitWaits++;
              const waitMs = Math.min(2000 * rateLimitWaits, 6000);
              onProgress?.(`[Visualizer] Rate limit buffer: waiting ${waitMs / 1000}s before retry...`);
              await new Promise(r => setTimeout(r, waitMs));
              totalAttempts--;
            }
          }
        }
      }

      // 2. interactions.create fallback if available
      if (!imageUrl && typeof (ai as any)?.interactions?.create === "function") {
        try {
          const interaction = await Promise.race([
            (ai as any).interactions.create({
              model: modelName,
              input: slidePrompt,
              aspect_ratio: targetImageAspect,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Image interactions.create timeout after 35s")), 35000)
            )
          ]);

          const directImg = (interaction as any)?.output_image || (interaction as any)?.outputImage;
          if (directImg?.data) {
            imageUrl = `data:${directImg.mime_type || "image/png"};base64,${directImg.data}`;
            console.log(`[Visualizer] ✅ Image generated successfully via interactions.create on ${modelName}`);
          }
        } catch (e: any) {
          console.warn(`[Visualizer] interactions.create on ${modelName} failed:`, e?.message || e);
        }
      }

      if (!imageUrl) {
        throw new VisualizerError("IMAGE_GENERATION_FAILED", "Image generation model failed to produce image bytes.");
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
        slideIndex: idx,
        totalSlides: assetCount,
      });
    } catch (err: any) {
      console.error(`[Visualizer] Slide ${idx + 1} generation failed:`, err);
      throw new VisualizerError("IMAGE_GENERATION_FAILED", err.message || "Failed to generate image asset.");
    }
  }

  return results;
}
