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

export interface SlideInput {
  step?: number;
  title?: string;
  body?: string;
  visualPrompt?: string;
}

export interface GenerateMediaInput {
  platform: string;
  contentType: string;
  mediaType: "image" | "video" | "multi_image";
  prompt: string;
  aspectRatio: string;
  caption?: string;
  topic?: string;
  videoTask?: string;
  sourceImage?: string | null;
  sourceVideo?: string | null;
  style?: string;
  quality?: string;
  imageModel?: string;
  slides?: SlideInput[];
  prompts?: string[];
  assetCount?: number;
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
  videoTask?: string;
  sourceImage?: string | null;
  sourceVideo?: string | null;
  onProgress?: (message: string) => void;
}): Promise<string> {
  const { prompt, topic, aspectRatio, model, videoTask, sourceImage, sourceVideo, onProgress } = options;
  const targetVideoModel = model || "gemini-omni-flash-preview";
  const ai = (vertexProvider as any).ai;
  let lastErr: any = null;

  console.log(`[Visualizer] Dispatching Video synthesis on Instance: ${targetVideoModel} for topic: "${topic}" (Task: ${videoTask || "auto"})`);

  // 1. Primary: Google Interactions API (Native endpoint for Gemini Omni Flash Preview)
  if (typeof (ai as any)?.interactions?.create === "function") {
    try {
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

  // 1. VIDEO FORMATS (Reels, Shorts, Video Pins, TikTok, YouTube Video, LinkedIn Video, X Video, etc.)
  if (
    normType.includes("reel") ||
    normType.includes("video") ||
    normType.includes("short") ||
    (normPlt === "tiktok" && !normType.includes("photo") && !normType.includes("carousel"))
  ) {
    const isLandscape =
      normType.includes("youtube_video") ||
      (normPlt === "youtube" && !normType.includes("short")) ||
      (normPlt === "linkedin" && !normType.includes("short") && !normType.includes("reel")) ||
      (normPlt === "x" && !normType.includes("short") && !normType.includes("reel")) ||
      (normPlt === "facebook" && normType === "video");

    return {
      assetType: "video" as const,
      aspectRatio: isLandscape ? "16:9" as const : "9:16" as const,
      requiredAssets: 1,
    };
  }

  // 2. MULTI-ASSET FORMATS (Carousels, Idea Pins, Multi-Image, Documents)
  if (
    normType.includes("carousel") ||
    normType.includes("idea") ||
    normType.includes("multi") ||
    normType.includes("document") ||
    normType.includes("photo")
  ) {
    let aspect: "1:1" | "9:16" | "16:9" | "4:5" | "2:3" | "1.91:1" = "1:1";
    if (normPlt === "pinterest") {
      aspect = normType.includes("idea") ? "9:16" : "2:3";
    } else if (normPlt === "linkedin") {
      aspect = (normType.includes("document") || normType.includes("carousel")) ? "4:5" : "1:1";
    } else if (normPlt === "tiktok" || normType.includes("story")) {
      aspect = "9:16";
    }
    return {
      assetType: "multi_image" as const,
      aspectRatio: aspect,
      requiredAssets: 5,
    };
  }

  // 3. SINGLE IMAGE FORMATS (Standard Pins, Feeds, Posts, Stories, Community)
  let aspect: "1:1" | "9:16" | "16:9" | "4:5" | "2:3" | "1.91:1" = "1:1";
  if (normPlt === "pinterest") {
    aspect = "2:3"; // Standard Pin official recommendation (1000x1500)
  } else if (normPlt === "linkedin") {
    aspect = "1.91:1";
  } else if (normPlt === "x") {
    aspect = "16:9";
  } else if (normType.includes("story")) {
    aspect = "9:16";
  }

  return {
    assetType: "image" as const,
    aspectRatio: aspect,
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
    onProgress?.(`[Visualizer] Compiling video stream via ${MODELS.VIDEO}...`);

    const videoUrl = await generateRealVideo({
      prompt: prompt.trim(),
      topic,
      aspectRatio,
      model: MODELS.VIDEO,
      videoTask: input.videoTask,
      sourceImage: input.sourceImage,
      sourceVideo: input.sourceVideo,
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

  const assetCount = mediaType === "multi_image"
    ? (input.assetCount || input.slides?.length || input.prompts?.length || 5)
    : 1;

  const validAspectRatios = ["1:1", "4:5", "9:16", "16:9", "2:3", "3:2", "4:3", "3:4"];
  const targetImageAspect = (aspectRatio && validAspectRatios.includes(aspectRatio)) ? aspectRatio : "1:1";

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

  for (let idx = 0; idx < assetCount; idx++) {
    let slideBasePrompt = prompt.trim();
    if (input.slides && input.slides[idx]) {
      const s = input.slides[idx];
      const normType = contentType.toLowerCase();
      const isMultiStory = normType.includes("idea") || normType.includes("carousel") || normType.includes("document");
      if (isMultiStory) {
        slideBasePrompt = `Professional vertical editorial social graphic composition for slide ${idx + 1} (${s.title ? `Title: "${s.title}"` : "Story Section"}). ${s.visualPrompt || prompt}. Clean modern layout with bold typographic title space, clear space for copy "${s.body || ""}", cohesive brand aesthetic, elegant negative space, editorial composition.`;
      } else if (s.visualPrompt) {
        slideBasePrompt = s.visualPrompt;
      }
    } else if (input.prompts && input.prompts[idx]) {
      slideBasePrompt = input.prompts[idx];
    }

    const clauses = [slideBasePrompt];
    if (styleClause) clauses.push(styleClause);
    if (qualityClause) clauses.push(qualityClause);
    const slidePrompt = clauses.filter(Boolean).join(", ");

    try {
      const ai = (vertexProvider as any).ai;
      let imageUrl = "";

      // Strictly Google Cloud Model Garden gemini-3-pro-image (Nano Banana Pro)
      const modelName = "gemini-3-pro-image";

      // 1. generateContent with responseModalities ["IMAGE"] (Official Google Model Garden Gemini Image API)
      if (typeof ai?.models?.generateContent === "function") {
        try {
          const genRes = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [{ text: slidePrompt }],
              },
            ],
            config: {
              responseModalities: ["IMAGE"],
              imageConfig: {
                aspectRatio: targetImageAspect,
              },
            },
          });

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
        } catch (e: any) {
          console.warn(`[Visualizer] generateContent on ${modelName} failed:`, e?.message || e);
        }
      }

      // 2. interactions.create fallback if available
      if (!imageUrl && typeof (ai as any)?.interactions?.create === "function") {
        try {
          const interaction = await (ai as any).interactions.create({
            model: modelName,
            input: slidePrompt,
            aspect_ratio: targetImageAspect,
          });

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
        aspectRatio: targetImageAspect,
        status: "completed",
        provider: "google_vertex",
        model: "gemini-3-pro-image (Nano Banana Pro)",
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
