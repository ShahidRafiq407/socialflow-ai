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

function validateAssetUrl(url: string, type: "image" | "video") {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:"))) {
    throw new VisualizerError(
      "VISUALIZER_VALIDATION_FAILED",
      `Generated ${type} target is not a valid output link.`
    );
  }
}

/**
 * Flagship Video Synthesis Engine (Focus: Maximum Cinematic Fidelity)
 */
async function generateRealVideo(options: {
  prompt: string;
  topic: string;
  aspectRatio: string;
  model: string;
  onProgress?: (message: string) => void;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model, onProgress } = options;

  // Strict high-quality mapping only. Removed cheap/lite versions.
  const premiumVideoModels = [
    model,
    "veo-2.0-generate-001" // Heavy weight flagship production video model
  ];
  const uniqueVideoModels = [...new Set(premiumVideoModels.filter(Boolean))];
  let lastErr: any = null;

  for (const vModel of uniqueVideoModels) {
    try {
      const ai = (vertexProvider as any).mediaAi || (vertexProvider as any).ai;
      console.log(`[Visualizer] Launching Premium Video Synthesis with: ${vModel}`);

      if (typeof ai?.models?.generateVideos === "function") {
        onProgress?.(`[Visualizer] Initiating Veo video operation (${vModel})...`);
        let operation = await ai.models.generateVideos({
          model: vModel,
          prompt: `${prompt}, dynamic engaging commercial video for ${topic}`,
          config: {
            aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
            numberOfVideos: 1,
          },
        });

        if (!operation) {
          throw new VisualizerError("VIDEO_GENERATION_FAILED", "Veo video generation returned no operation object.");
        }

        const POLL_INTERVAL_MS = 5000;
        const TIMEOUT_MS = 180000;
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
          console.log(`[Visualizer] ✅ Video generation success with model: ${vModel}`);
          return `data:video/mp4;base64,${videoBytes}`;
        }
        if (videoUri) {
          console.log(`[Visualizer] ✅ Video generation success (URI) with model: ${vModel}`);
          return videoUri;
        }
      }
    } catch (err: any) {
      console.warn(`[Visualizer] Premium engine ${vModel} was restricted, attempting secure alternative...`, err?.message || err);
      lastErr = err;
    }
  }

  throw new VisualizerError(
    "VIDEO_GENERATION_FAILED",
    `Vertex AI high-fidelity cinematic video cluster failed to render. Trace: ${lastErr?.message || lastErr}`
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
    throw new VisualizerError(
      "VISUALIZER_API_KEY_MISSING",
      "Google credentials mapping is incomplete."
    );
  }

  const results: MediaAssetOutput[] = [];

  if (mediaType === "video") {
    onProgress?.(`[Visualizer] Initiating professional video rendering sequence with ${MODELS.VIDEO}...`);

    const videoUrl = await generateRealVideo({
      prompt,
      topic,
      aspectRatio,
      model: MODELS.VIDEO,
      onProgress,
    });

    if (!videoUrl || !videoUrl.trim()) {
      throw new VisualizerError("VISUALIZER_ASSET_MISSING", "Video processing returned an unreadable asset link.");
    }

    validateAssetUrl(videoUrl, "video");
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

  if (mediaType === "multi_image") {
    const totalSlides = 3;
    onProgress?.(`[Visualizer] Initializing elite rendering for ${totalSlides} multi-slide frames using ${MODELS.VISUALIZER}...`);

    for (let slideIdx = 1; slideIdx <= totalSlides; slideIdx++) {
      const slidePrompt = `${prompt} (Slide ${slideIdx} of ${totalSlides}: Photorealistic, ultra-detailed professional studio shot, 8k resolution, crisp texture)`;
      onProgress?.(`[Visualizer] Rendering Slide ${slideIdx}/${totalSlides}...`);

      const imageUrl = await generateRealImage({
        prompt: slidePrompt,
        topic,
        aspectRatio,
        model: MODELS.VISUALIZER,
      });

      if (!imageUrl || !imageUrl.trim()) {
        throw new VisualizerError("IMAGE_GENERATION_FAILED", `Slide ${slideIdx} generation dropped execution frame.`);
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
    return results;
  }

  onProgress?.(`[Visualizer] Dispatching master image synthesis via ${MODELS.VISUALIZER}...`);

  // Appending strict clarity enhancers directly to prompt variables for better output text compliance
  const enhancedPrompt = `${prompt} (Photorealistic, commercial grade product photography, cinematic lighting, ultra-high resolution textures)`;

  const imageUrl = await generateRealImage({
    prompt: enhancedPrompt,
    topic,
    aspectRatio,
    model: MODELS.VISUALIZER,
  });

  if (!imageUrl || !imageUrl.trim()) {
    throw new VisualizerError("IMAGE_GENERATION_FAILED", "Image compilation returned empty frame bytes.");
  }

  validateAssetUrl(imageUrl, "image");
  results.push({
    id: `asset_img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    platform,
    contentType,
    type: "image",
    url: imageUrl,
    prompt: enhancedPrompt,
    aspectRatio,
    status: "completed",
    provider: "google_vertex",
    model: MODELS.VISUALIZER,
    createdAt: Date.now(),
  });

  return results;
}

/**
 * Top-Tier Text-to-Image Generation Processing via Vertex AI Studio
 */
async function generateRealImage(options: {
  prompt: string;
  topic: string;
  aspectRatio: string;
  model: string;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model } = options;

  // STRICT RULE: Stripped away all light/fast/banana model strings completely.
  const coreHighQualityModels = [
    model,
    "imagen-3.0-generate-002" // Google's absolute highest tier photorealism production unit
  ];
  const uniqueModels = [...new Set(coreHighQualityModels.filter(Boolean))];
  let lastErr: any = null;

  for (const mName of uniqueModels) {
    try {
      const ai = (vertexProvider as any).mediaAi || (vertexProvider as any).ai;
      if (!ai?.models?.generateImages && !ai?.models?.generateContent) {
        throw new VisualizerError("VISUALIZER_PROVIDER_ERROR", "Vertex AI core image engine interface is unreachable.");
      }

      console.log(`[Visualizer] Executing production payload on raw high-quality cluster: ${mName}`);

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
      console.error(`[Visualizer] Frame processing rejected by model instance ${mName}:`, err);
      lastErr = err;
    }
  }

  throw new VisualizerError(
    "IMAGE_GENERATION_FAILED",
    `All master image generation engines rejected parameters. Trace: ${lastErr?.message || lastErr}`
  );
}
