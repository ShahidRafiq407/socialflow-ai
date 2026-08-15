import { vertexProvider, MODELS } from "@/lib/agents/llm";
import { uploadBase64ToStorage, isSupabaseConfigured } from "@/lib/supabase";

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
  aspectRatio: string;
  caption?: string;
  topic?: string;
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
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:"))) {
    throw new VisualizerError(
      "VISUALIZER_VALIDATION_FAILED",
      `Rendered ${type} asset allocation failed string target formatting.`
    );
  }
}

/**
 * Flagship Video Synthesis Handler Utilizing Gemini Omni Flash Preview / Interactions API
 */
async function generateRealVideo(options: {
  prompt: string;
  topic: string;
  aspectRatio: string;
  model: string;
  onProgress?: (message: string) => void;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model, onProgress } = options;
  const targetVideoModel = model || "gemini-omni-flash-preview";
  const ai = (vertexProvider as any).ai;
  let lastErr: any = null;

  console.log(`[Visualizer] Dispatching Video synthesis on Instance: ${targetVideoModel} for topic: "${topic}"`);

  // 1. Primary: Google Interactions API (Native endpoint for Gemini Omni Flash Preview)
  if (typeof (ai as any)?.interactions?.create === "function") {
    try {
      const fullPrompt = `${prompt}, high definition ${aspectRatio === "9:16" ? "9:16 vertical" : "16:9 widescreen"} cinematic commercial video for ${topic || "brand"}`;
      
      onProgress?.(`[Visualizer] Synthesizing video frames & audio stream via ${targetVideoModel}...`);

      const interaction = await Promise.race([
        (ai as any).interactions.create({
          model: targetVideoModel,
          input: fullPrompt,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Video synthesis timeout after 120s")), 120000)
        ),
      ]);

      // Check direct output_video (standard response format from gemini-omni-flash-preview)
      const directVideo = (interaction as any)?.output_video || (interaction as any)?.outputVideo;
      if (directVideo?.data) {
        onProgress?.(`[Visualizer] ✅ Video synthesis complete via ${targetVideoModel}!`);
        const mime = directVideo.mime_type || directVideo.mimeType || "video/mp4";
        const base64Data = `data:${mime};base64,${directVideo.data}`;
        
        // If Supabase storage is configured, upload to storage for permanent CDN streaming
        if (isSupabaseConfigured()) {
          try {
            const uploadedUrl = await uploadBase64ToStorage(base64Data, `video-${Date.now()}.mp4`, mime);
            if (uploadedUrl) return uploadedUrl;
          } catch (storageErr) {
            console.warn("[Visualizer] Supabase video upload failed, returning data URI:", storageErr);
          }
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
    } catch (iErr: any) {
      lastErr = iErr;
      console.warn(`[Visualizer] interactions.create on ${targetVideoModel} failed:`, iErr?.message || iErr);
    }
  }

  // 2. Secondary: generateVideos method
  if (typeof ai?.models?.generateVideos === "function") {
    try {
      onProgress?.(`[Visualizer] Submitting video synthesis job (${targetVideoModel})...`);
      let operation = await ai.models.generateVideos({
        model: targetVideoModel,
        prompt: `${prompt}, dynamic engaging commercial video for ${topic}`,
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
          const elapsedSec = Math.round((Date.now() - startTime) / 1000);
          if (Date.now() - startTime > TIMEOUT_MS) {
            break;
          }

          onProgress?.(`[Visualizer] Video frame rendering in progress... (${elapsedSec}s elapsed)`);
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
          onProgress?.(`[Visualizer] ✅ Video frame synthesis completed (${targetVideoModel})!`);
          return `data:video/mp4;base64,${videoBytes}`;
        }
        if (videoUri) {
          onProgress?.(`[Visualizer] ✅ Video asset ready (${targetVideoModel})!`);
          return videoUri;
        }
      }
    } catch (gvErr: any) {
      lastErr = gvErr;
      console.warn(`[Visualizer] generateVideos on ${targetVideoModel} failed:`, gvErr?.message || gvErr);
    }
  }

  // If live Vertex video synthesis failed with an error, throw the actual error
  if (lastErr) {
    throw new VisualizerError(
      "VIDEO_GENERATION_FAILED",
      `Video synthesis on ${targetVideoModel} failed: ${lastErr?.message || lastErr}`
    );
  }

  throw new VisualizerError(
    "VIDEO_GENERATION_FAILED",
    `Video synthesis on ${targetVideoModel} could not produce a valid video output.`
  );
}

export function resolveVisualRequirements(platform: string, contentType: string) {
  const normPlt = platform.toLowerCase().trim();
  const normType = contentType.toLowerCase().trim();

  if (normType.includes("reel") || normType.includes("video") || normType.includes("short")) {
    return {
      assetType: "video" as const,
      aspectRatio: normType.includes("short") || normType.includes("reel") || normPlt === "tiktok" ? "9:16" : "16:9",
      requiredAssets: 1,
    };
  }

  if (normType.includes("carousel") || normType.includes("idea_pin") || normType.includes("ideapin") || normType.includes("idea pin")) {
    return {
      assetType: "multi_image" as const,
      aspectRatio: normType.includes("idea") ? "9:16" : "1:1",
      requiredAssets: 3,
    };
  }

  return {
    assetType: "image" as const,
    aspectRatio: normPlt === "linkedin" ? "1.91:1" : normPlt === "x" ? "16:9" : normType.includes("story") || normPlt === "pinterest" ? "9:16" : "1:1",
    requiredAssets: 1,
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
    onProgress?.(`[Visualizer] Compiling cinematic narrative via ${MODELS.VIDEO}...`);

    const highEndVideoPrompt = `${prompt}, hyper-realistic photography, 8k resolution, smooth cinematography, cinematic lighting, photorealism style, flawless texture map`;

    const videoUrl = await generateRealVideo({
      prompt: highEndVideoPrompt,
      topic,
      aspectRatio,
      model: MODELS.VIDEO,
      onProgress,
    });

    if (!videoUrl || !videoUrl.trim()) {
      throw new VisualizerError("VISUALIZER_ASSET_MISSING", "Video thread compilation returned an empty frame link.");
    }

    let finalVideoUrl = videoUrl;
    if (videoUrl.startsWith("data:") && isSupabaseConfigured()) {
      onProgress?.(`[Visualizer] Persisting video asset to Supabase Storage CDN...`);
      const supabaseUrl = await uploadBase64ToStorage(videoUrl, `video-${platform}-${contentType}-${Date.now()}.mp4`, "video/mp4");
      if (supabaseUrl) {
        finalVideoUrl = supabaseUrl;
      }
    }

    validateAssetUrl(finalVideoUrl, "video");
    results.push({
      id: `asset_vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      platform,
      contentType,
      type: "video",
      url: finalVideoUrl,
      prompt: highEndVideoPrompt,
      aspectRatio,
      status: "completed",
      provider: "google_vertex",
      model: MODELS.VIDEO,
      createdAt: Date.now(),
    });

    return results;
  }

  // -------------------------------------------------------------
  // REAL IMAGE GENERATION (Vertex AI: gemini-3-pro-image)
  // -------------------------------------------------------------
  onProgress?.(`[Visualizer] Synthesizing photographic layer canvas via ${MODELS.VISUALIZER}...`);

  const assetCount = mediaType === "multi_image" ? 3 : 1;

  for (let idx = 0; idx < assetCount; idx++) {
    const slidePrompt = `${prompt}, highly detailed studio shot, realistic lighting layers, hyper-detailed photography aesthetics, crisp focus, 8k resolution`;

    try {
      const ai = (vertexProvider as any).ai;
      let imageUrl = "";

      if (typeof ai?.models?.generateImages === "function") {
        try {
          const imgRes = await ai.models.generateImages({
            model: MODELS.VISUALIZER || "gemini-3-pro-image",
            prompt: slidePrompt,
            config: {
              numberOfImages: 1,
              aspectRatio: aspectRatio === "9:16" ? "9:16" : aspectRatio === "16:9" ? "16:9" : "1:1",
            },
          });

          if (imgRes?.generatedImages?.[0]?.image?.imageBytes) {
            imageUrl = `data:image/png;base64,${imgRes.generatedImages[0].image.imageBytes}`;
          }
        } catch (e: any) {
          console.warn("[Visualizer] generateImages error:", e?.message || e);
        }
      }

      if (!imageUrl && typeof ai?.models?.generateContent === "function") {
        try {
          const genRes = await ai.models.generateContent({
            model: MODELS.VISUALIZER || "gemini-3-pro-image",
            contents: `Generate a photorealistic marketing image: ${slidePrompt}`,
            config: {
              responseModalities: ["IMAGE"],
            },
          });

          const candidates = (genRes as any)?.candidates || [];
          for (const cand of candidates) {
            for (const part of cand.content?.parts || []) {
              if (part.inlineData?.data) {
                imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
                break;
              }
            }
            if (imageUrl) break;
          }
        } catch (e: any) {
          console.warn("[Visualizer] generateContent image error:", e?.message || e);
        }
      }

      if (!imageUrl) {
        throw new VisualizerError("IMAGE_GENERATION_FAILED", "Image generation model failed to produce image bytes.");
      }

      let finalImageUrl = imageUrl;
      if (imageUrl.startsWith("data:") && isSupabaseConfigured()) {
        const supabaseUrl = await uploadBase64ToStorage(imageUrl, `img-${platform}-${contentType}-${idx}-${Date.now()}.png`, "image/png");
        if (supabaseUrl) {
          finalImageUrl = supabaseUrl;
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
        aspectRatio,
        status: "completed",
        provider: "google_vertex",
        model: MODELS.VISUALIZER,
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
