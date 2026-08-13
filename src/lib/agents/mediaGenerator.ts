import { vertexProvider, MODELS } from "@/lib/agents/llm";

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
  status: "completed" | "error";
  provider: string;
  model: string;
  createdAt: number;
  slideIndex?: number;
  totalSlides?: number;
  error?: string;
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
      requiredAssets: 3, // 3 slides required for Carousel / Idea Pin
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

  // 1. Verify Credentials - FAIL CLEARLY IF MISSING API KEY
  const hasKey =
    !!process.env.GEMINI_API_KEY ||
    !!process.env.GOOGLE_API_KEY ||
    !!process.env.GOOGLE_CREDENTIALS_JSON ||
    (!!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY);

  if (!hasKey) {
    throw new VisualizerError(
      "VISUALIZER_API_KEY_MISSING",
      "Google API key / GCP credentials are not configured in environment variables."
    );
  }

  const results: MediaAssetOutput[] = [];

  // =========================================================================
  // VIDEO GENERATION (Facebook Reel, TikTok, Shorts)
  // =========================================================================
  if (mediaType === "video") {
    onProgress?.(`[Visualizer] Generating ${platform} ${contentType} video with model ${MODELS.VIDEO}...`);

    const videoUrl = await generateRealVideo({
      prompt,
      topic,
      aspectRatio,
      model: MODELS.VIDEO,
      onProgress,
    });

    // Validate generated video asset
    if (!videoUrl || !videoUrl.trim()) {
      throw new VisualizerError(
        "VISUALIZER_ASSET_MISSING",
        `Video generation produced no valid URL for ${platform} ${contentType}`
      );
    }

    validateAssetUrl(videoUrl, "video");

    onProgress?.(`[Visualizer] ✅ ${platform} ${contentType} video validated.`);
    results.push({
      id: `asset_vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      platform,
      contentType,
      type: "video",
      url: videoUrl,
      prompt,
      aspectRatio,
      status: "completed",
      provider: "google_vertex",
      model: MODELS.VIDEO,
      createdAt: Date.now(),
    });

    return results;
  }

  // =========================================================================
  // MULTI-SLIDE IMAGE GENERATION (Pinterest Idea Pin / Instagram Carousel)
  // =========================================================================
  if (mediaType === "multi_image") {
    const totalSlides = 3;
    onProgress?.(`[Visualizer] Generating ${totalSlides}-slide ${platform} ${contentType} with model ${MODELS.VISUALIZER}...`);

    for (let slideIdx = 1; slideIdx <= totalSlides; slideIdx++) {
      const slidePrompt = `${prompt} (Slide ${slideIdx} of ${totalSlides}: High impact visual graphic)`;
      onProgress?.(`[Visualizer] Generating Slide ${slideIdx}/${totalSlides} for ${platform} ${contentType}...`);

      const imageUrl = await generateRealImage({
        prompt: slidePrompt,
        topic,
        aspectRatio,
        model: MODELS.VISUALIZER,
      });

      if (!imageUrl || !imageUrl.trim()) {
        throw new VisualizerError(
          "IMAGE_GENERATION_FAILED",
          `Failed to generate Slide ${slideIdx}/${totalSlides} for ${platform} ${contentType}`
        );
      }

      validateAssetUrl(imageUrl, "image");

      results.push({
        id: `asset_img_${Date.now()}_slide${slideIdx}_${Math.random().toString(36).substring(2, 7)}`,
        platform,
        contentType,
        type: "image",
        url: imageUrl,
        prompt: slidePrompt,
        aspectRatio,
        status: "completed",
        provider: "google_vertex",
        model: MODELS.VISUALIZER,
        createdAt: Date.now(),
        slideIndex: slideIdx,
        totalSlides,
      });
    }

    onProgress?.(`[Visualizer] ✅ All ${totalSlides} slides generated & validated for ${platform} ${contentType}.`);
    return results;
  }

  // =========================================================================
  // SINGLE IMAGE GENERATION (Facebook Feed, Instagram Feed, LinkedIn Post)
  // =========================================================================
  onProgress?.(`[Visualizer] Generating ${platform} ${contentType} image with model ${MODELS.VISUALIZER}...`);
  const imageUrl = await generateRealImage({
    prompt,
    topic,
    aspectRatio,
    model: MODELS.VISUALIZER,
  });

  if (!imageUrl || !imageUrl.trim()) {
    throw new VisualizerError(
      "IMAGE_GENERATION_FAILED",
      `Image generation returned empty output for ${platform} ${contentType}`
    );
  }

  validateAssetUrl(imageUrl, "image");

  onProgress?.(`[Visualizer] ✅ ${platform} ${contentType} image generated & validated.`);
  results.push({
    id: `asset_img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    platform,
    contentType,
    type: "image",
    url: imageUrl,
    prompt,
    aspectRatio,
    status: "completed",
    provider: "google_vertex",
    model: MODELS.VISUALIZER,
    createdAt: Date.now(),
  });

  return results;
}

/**
 * Perform real Google Imagen / Gemini Image Generation via Google GenAI / Vertex SDK
 */
async function generateRealImage(options: {
  prompt: string;
  topic: string;
  aspectRatio: string;
  model: string;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model } = options;

  const candidateModels = [
    model,
    "gemini-3.1-flash-image",
    "imagen-3.0-generate-002",
    "imagen-3.0-fast-generate-001",
    "gemini-2.5-flash-image",
    "gemini-2.0-flash",
  ];
  const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

  let lastErr: any = null;

  for (const mName of uniqueModels) {
    try {
      const ai = (vertexProvider as any).mediaAi || (vertexProvider as any).ai;
      if (!ai?.models?.generateImages && !ai?.models?.generateContent) {
        throw new VisualizerError("VISUALIZER_PROVIDER_ERROR", "Google GenAI SDK models interface is not available.");
      }

      console.log(`[Visualizer] Calling Google Image Generation (Model: ${mName})...`);

      if (typeof ai.models.generateImages === "function") {
        const response = await ai.models.generateImages({
          model: mName,
          prompt: `${prompt}, professional marketing visual for ${topic}, high quality 4k digital graphic`,
          config: {
            numberOfImages: 1,
            aspectRatio: aspectRatio === "9:16" ? "9:16" : aspectRatio === "16:9" ? "16:9" : "1:1",
            outputMimeType: "image/png",
          },
        });

        const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
          console.log(`[Visualizer] ✅ Image generation success with model: ${mName}`);
          return `data:image/png;base64,${imageBytes}`;
        }
      }

      // Fallback generateContent attempt if generateImages endpoint returns structured bytes
      const genRes = await ai.models.generateContent({
        model: mName,
        contents: `Generate a high quality visual image: ${prompt}`,
      });

      const cand = genRes.candidates?.[0]?.content?.parts?.[0];
      if (cand?.inlineData?.data) {
        console.log(`[Visualizer] ✅ Image generation success via generateContent with model: ${mName}`);
        return `data:${cand.inlineData.mimeType || "image/png"};base64,${cand.inlineData.data}`;
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Visualizer] Image model ${mName} failed:`, err?.message || err);
    }
  }

  throw new VisualizerError(
    "IMAGE_GENERATION_FAILED",
    `Google image model ${model} failed: ${lastErr?.message || "Publisher model not found or unavailable in global region"}`,
    lastErr
  );
}

/**
 * Perform real Google Veo Video Generation with Async Polling
 */
async function generateRealVideo(options: {
  prompt: string;
  topic: string;
  aspectRatio: string;
  model: string;
  onProgress?: (message: string) => void;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model, onProgress } = options;

  const candidateModels = [
    model,
    "veo-3.1-lite-generate-preview",
    "veo-3.1-generate-preview",
    "veo-2.0-generate-001",
    "veo-2.0-flash",
  ];
  const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

  let lastErr: any = null;

  for (const mName of uniqueModels) {
    try {
      const ai = (vertexProvider as any).mediaAi || (vertexProvider as any).ai;
      console.log(`[Visualizer] Calling Veo Video Generation (Model: ${mName})...`);

      if (typeof ai?.models?.generateVideos === "function") {
        onProgress?.(`[Visualizer] Initiating Veo video operation (${mName})...`);
        let operation = await ai.models.generateVideos({
          model: mName,
          prompt: `${prompt}, dynamic engaging commercial video for ${topic}`,
          config: {
            aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
            numberOfVideos: 1,
          },
        });

        if (!operation) {
          throw new VisualizerError("VIDEO_GENERATION_FAILED", "Veo video generation returned no operation object.");
        }

        // ASYNC POLLING LIFECYCLE FOR VEO OPERATION
        const POLL_INTERVAL_MS = 5000;
        const TIMEOUT_MS = 180000; // 3 minutes timeout
        const startTime = Date.now();
        const opName = operation.name || `operation_${Date.now()}`;

        console.log(`[Visualizer] Veo operation started: ${opName}. Polling operation status...`);

        while (!operation.done) {
          const elapsedSec = Math.round((Date.now() - startTime) / 1000);
          if (Date.now() - startTime > TIMEOUT_MS) {
            throw new VisualizerError(
              "VIDEO_GENERATION_TIMEOUT",
              `Veo video generation timed out after ${elapsedSec}s (Operation: ${opName}).`
            );
          }

          onProgress?.(`[Visualizer] Waiting for Veo video generation... (${elapsedSec}s elapsed)`);
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

          // Poll operation status
          if (typeof (ai.operations as any)?.get === "function") {
            operation = await (ai.operations as any).get({ name: opName });
          } else if (typeof operation.poll === "function") {
            operation = await operation.poll();
          } else {
            break;
          }
        }

        if (operation.error) {
          throw new VisualizerError(
            "VIDEO_GENERATION_FAILED",
            `Veo video generation operation error: ${operation.error.message || JSON.stringify(operation.error)}`
          );
        }

        const videoBytes = operation.response?.generatedVideos?.[0]?.video?.videoBytes;
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;

        if (videoBytes) {
          console.log(`[Visualizer] ✅ Video generation success with model: ${mName}`);
          return `data:video/mp4;base64,${videoBytes}`;
        }
        if (videoUri) {
          console.log(`[Visualizer] ✅ Video generation success (URI) with model: ${mName}`);
          return videoUri;
        }
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Visualizer] Veo video model ${mName} failed:`, err?.message || err);
    }
  }

  throw new VisualizerError("VIDEO_GENERATION_FAILED", `Veo video generation failed: ${lastErr?.message || "Publisher model not found or unavailable"}`);
}

/**
 * Validate asset URL - MUST NOT BE EMPTY, FAKE, OR MOCK
 */
function validateAssetUrl(url: string, expectedType: "image" | "video") {
  if (!url || typeof url !== "string" || url.trim() === "") {
    throw new VisualizerError("VISUALIZER_ASSET_MISSING", "Asset URL is empty.");
  }

  const forbiddenMockDomains = ["pollinations.ai", "unsplash.com", "mixkit.co", "placeholder", "localhost"];
  for (const domain of forbiddenMockDomains) {
    if (url.includes(domain)) {
      throw new VisualizerError(
        "VISUALIZER_VALIDATION_FAILED",
        `Fake/mock visual URL detected (${domain}). Real generated asset required.`
      );
    }
  }

  if (expectedType === "image" && !url.startsWith("data:image/") && !url.startsWith("http://") && !url.startsWith("https://")) {
    throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Invalid image asset URL format.");
  }

  if (expectedType === "video" && !url.startsWith("data:video/") && !url.startsWith("http://") && !url.startsWith("https://")) {
    throw new VisualizerError("VISUALIZER_VALIDATION_FAILED", "Invalid video asset URL format.");
  }
}
