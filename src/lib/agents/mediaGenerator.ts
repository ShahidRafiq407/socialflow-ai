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
      `Rendered ${type} asset allocation failed string target formatting.`
    );
  }
}

/**
 * Flagship Video Synthesis Handler Utilizing Veo 3.1 Premium Tier
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

  console.log(`[Visualizer] Dispatching Video synthesis on Instance: ${targetVideoModel}`);

  // 1. Primary: Google Interactions API (Native endpoint for Gemini Omni Flash Preview)
  if (typeof (ai as any)?.interactions?.create === "function") {
    try {
      onProgress?.(`[Visualizer] Initiating video via Interactions API (${targetVideoModel})...`);
      const interaction = await (ai as any).interactions.create({
        model: targetVideoModel,
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text: `${prompt}, dynamic engaging commercial video for ${topic}`,
              },
            ],
          },
        ],
      });

      if (interaction?.steps) {
        for (const step of interaction.steps) {
          if (step.type === "model_output" && Array.isArray(step.content)) {
            for (const part of step.content) {
              if (part.type === "video") {
                if (part.data) {
                  onProgress?.(`[Visualizer] ✅ Video synthesis complete via Interactions API (${targetVideoModel})!`);
                  return `data:video/mp4;base64,${part.data}`;
                } else if (part.uri) {
                  onProgress?.(`[Visualizer] ✅ Video asset ready via Interactions API (${targetVideoModel})!`);
                  return part.uri;
                }
              }
            }
          }
        }
      }

      const directData = (interaction as any)?.output_video?.data || (interaction as any)?.outputVideo?.data || (interaction as any)?.outputs?.[0]?.video?.data;
      if (directData) {
        onProgress?.(`[Visualizer] ✅ Video synthesis complete via Interactions API (${targetVideoModel})!`);
        return `data:video/mp4;base64,${directData}`;
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
        const POLL_INTERVAL_MS = 5000;
        const TIMEOUT_MS = 180000;
        const startTime = Date.now();
        const opName = operation.name || `operation_${Date.now()}`;

        console.log(`[Visualizer] Video operation started: ${opName}. Polling operation status...`);

        while (!operation.done) {
          const elapsedSec = Math.round((Date.now() - startTime) / 1000);
          if (Date.now() - startTime > TIMEOUT_MS) {
            throw new VisualizerError(
              "VIDEO_GENERATION_TIMEOUT",
              `Video generation timed out after ${elapsedSec}s (Operation: ${opName}).`
            );
          }

          onProgress?.(`[Visualizer] Video frame rendering in progress... (${elapsedSec}s elapsed)`);
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
            `Video generation operation error: ${operation.error.message || JSON.stringify(operation.error)}`
          );
        }

        const videoBytes = operation.response?.generatedVideos?.[0]?.video?.videoBytes;
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;

        if (videoBytes) {
          onProgress?.(`[Visualizer] ✅ Video frame synthesis completed (${targetVideoModel})!`);
          console.log(`[Visualizer] ✅ Video generation success with model: ${targetVideoModel}`);
          return `data:video/mp4;base64,${videoBytes}`;
        }
        if (videoUri) {
          onProgress?.(`[Visualizer] ✅ Video asset ready (${targetVideoModel})!`);
          console.log(`[Visualizer] ✅ Video generation success (URI) with model: ${targetVideoModel}`);
          return videoUri;
        }
      }
    } catch (gvErr: any) {
      lastErr = gvErr;
      console.warn(`[Visualizer] generateVideos on ${targetVideoModel} failed:`, gvErr?.message || gvErr);
    }
  }

  // 3. Multimodal generateContent with VIDEO modality
  if (typeof ai?.models?.generateContent === "function") {
    try {
      onProgress?.(`[Visualizer] Synthesizing video via multimodal channel (${targetVideoModel})...`);
      const genRes = await ai.models.generateContent({
        model: targetVideoModel,
        contents: `Generate a high quality engaging commercial video: ${prompt}`,
        config: {
          responseModalities: ["VIDEO"],
        },
      });

      const candidates = genRes.candidates || [];
      for (const cand of candidates) {
        for (const part of cand.content?.parts || []) {
          if (part.inlineData?.data) {
            onProgress?.(`[Visualizer] ✅ Video frame generated successfully (${targetVideoModel})!`);
            return `data:${part.inlineData.mimeType || "video/mp4"};base64,${part.inlineData.data}`;
          }
          if ((part as any).fileData?.fileUri) {
            onProgress?.(`[Visualizer] ✅ Video asset URI ready (${targetVideoModel})!`);
            return (part as any).fileData.fileUri;
          }
        }
      }
    } catch (gcErr: any) {
      lastErr = gcErr;
      console.warn(`[Visualizer] generateContent video on ${targetVideoModel} failed:`, gcErr?.message || gcErr);
    }
  }

  const errDetail = lastErr?.message || (typeof lastErr === "string" ? lastErr : JSON.stringify(lastErr));
  throw new VisualizerError(
    "VIDEO_GENERATION_FAILED",
    `Vertex AI video synthesis failed on model ${targetVideoModel}. Trace: ${errDetail}`
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

    // Injecting strict adherence directives for maximum video realism
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

    validateAssetUrl(videoUrl, "video");
    results.push({
      id: `asset_vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      platform,
      contentType,
      type: "video",
      url: videoUrl,
      prompt: highEndVideoPrompt,
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
    onProgress?.(`[Visualizer] Processing multi-frame carousel (${totalSlides} slides) with engine: ${MODELS.VISUALIZER}...`);

    for (let slideIdx = 1; slideIdx <= totalSlides; slideIdx++) {
      const slidePrompt = `${prompt} (Slide ${slideIdx} of ${totalSlides}: Commercial studio product capture, ultra detailed textures, raytraced reflections, 8k resolution close-up)`;
      onProgress?.(`[Visualizer] Synthesizing carousel slide ${slideIdx}/${totalSlides}...`);

      const imageUrl = await generateRealImage({
        prompt: slidePrompt,
        topic,
        aspectRatio,
        model: MODELS.VISUALIZER,
        onProgress,
      });

      if (!imageUrl || !imageUrl.trim()) {
        throw new VisualizerError("IMAGE_GENERATION_FAILED", `Multi-frame layer compilation failed at slide ${slideIdx}.`);
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

  const commercialPrompt = `${prompt}, highly detailed studio shot, realistic lighting layers, hyper-detailed photography aesthetics, crisp focus, 8k resolution`;

  const imageUrl = await generateRealImage({
    prompt: commercialPrompt,
    topic,
    aspectRatio,
    model: MODELS.VISUALIZER,
    onProgress,
  });

  if (!imageUrl || !imageUrl.trim()) {
    throw new VisualizerError("IMAGE_GENERATION_FAILED", "Image canvas compilation dropped layer bytes.");
  }

  validateAssetUrl(imageUrl, "image");
  results.push({
    id: `asset_img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    platform,
    contentType,
    type: "image",
    url: imageUrl,
    prompt: commercialPrompt,
    aspectRatio,
    status: "completed",
    provider: "google_vertex",
    model: MODELS.VISUALIZER,
    createdAt: Date.now(),
  });

  return results;
}

async function generateRealImage(options: {
  prompt: string;
  topic: string;
  aspectRatio: string;
  model: string;
  onProgress?: (message: string) => void;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model, onProgress } = options;
  const targetImageModel = model || "gemini-3-pro-image";
  const ai = (vertexProvider as any).ai;
  let lastErr: any = null;

  console.log(`[Visualizer] Executing image generation: ${targetImageModel}`);

  // 1. Multimodal generateContent with responseModalities (Native Gemini 3 Image Mode)
  if (typeof ai?.models?.generateContent === "function") {
    try {
      onProgress?.(`[Visualizer] Synthesizing image canvas with ${targetImageModel}...`);
      const genRes = await ai.models.generateContent({
        model: targetImageModel,
        contents: `Generate a high quality visual image: ${prompt}`,
        config: {
          responseModalities: ["IMAGE"],
        },
      });

      const candidates = genRes.candidates || [];
      for (const cand of candidates) {
        for (const part of cand.content?.parts || []) {
          if (part.inlineData?.data) {
            onProgress?.(`[Visualizer] ✅ Image frame generated successfully (${targetImageModel})!`);
            console.log(`[Visualizer] ✅ Image generation success via generateContent with model: ${targetImageModel}`);
            return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          }
        }
      }
    } catch (gcErr: any) {
      lastErr = gcErr;
      console.log(`[Visualizer] generateContent attempt with ${targetImageModel}:`, gcErr?.message || gcErr);
    }
  }

  // 2. Dedicated generateImages method (Imagen Endpoint)
  if (typeof ai?.models?.generateImages === "function") {
    try {
      onProgress?.(`[Visualizer] Rendering photorealistic canvas with ${targetImageModel}...`);
      const response = await ai.models.generateImages({
        model: targetImageModel,
        prompt: `${prompt}, professional marketing visual for ${topic}, high quality 4k digital graphic`,
        config: {
          numberOfImages: 1,
          aspectRatio: aspectRatio === "9:16" ? "9:16" : aspectRatio === "16:9" ? "16:9" : "1:1",
          outputMimeType: "image/png",
        },
      });

      const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (imageBytes) {
        onProgress?.(`[Visualizer] ✅ Image frame rendered successfully (${targetImageModel})!`);
        console.log(`[Visualizer] ✅ Image generation success with model: ${targetImageModel}`);
        return `data:image/png;base64,${imageBytes}`;
      }
    } catch (giErr: any) {
      lastErr = giErr;
      console.log(`[Visualizer] generateImages attempt with ${targetImageModel}:`, giErr?.message || giErr);
    }
  }

  const errDetail = lastErr?.message || (typeof lastErr === "string" ? lastErr : JSON.stringify(lastErr));
  throw new VisualizerError(
    "IMAGE_GENERATION_FAILED",
    `Vertex AI image synthesis failed on model ${targetImageModel}. Trace: ${errDetail}`
  );
}
