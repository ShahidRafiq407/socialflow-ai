import prisma from "@/lib/db";
import { vertexProvider, MODELS } from "../llm";
import { fetchSerpAnalysis } from "@/actions/serp";
import { extractFromUrl } from "@/actions/extract";
import { recallMemories, saveMemory } from "../memory";
import { getWorkspaceAnalytics } from "@/actions/analytics";
import { saveWorkspaceBrandDNA, getWorkspaceBrandDNA } from "@/actions/brand";
import { normalizeHashtags } from "@/lib/hashtags";
import { generateMediaAsset } from "../mediaGenerator";
import { getPlatformCapability } from "@/lib/capabilities/platformCapabilities";
import { removeFromScheduleQueue } from "@/lib/redis";

// ============================================================================
// MARKETING BRAIN — TOOL REGISTRY
// Each tool wraps a real data source or a real write operation so the brain
// reads/writes the SAME database that every dashboard tab uses.
// ============================================================================

export interface ToolContext {
  workspaceId: string;
  userId: string;
  uploadedFiles?: { name: string; content: string; type: string }[];
  onProgress?: (message: string) => void;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any, ctx: ToolContext) => Promise<any>;
}

export const TOOLS: ToolDef[] = [
  // ---------------- REAL-TIME INTERNET RESEARCH ----------------
  {
    name: "search_web",
    description:
      "Search the live internet (Google Search grounding) for the latest news, trends, facts or information. Use for anything time-sensitive or that needs current data.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "What to search for" } },
      required: ["query"],
    },
    execute: async (args, ctx) => {
      const q = (args.query || "").trim();
      if (!q) return { error: "query is required" };
      const res = await vertexProvider.generateWithGrounding(
        `You are a research agent. Answer the following using live Google Search, cite sources: ${q}`,
        { modelName: MODELS.ORCHESTRATOR }
      );
      return { query: q, answer: res.text, sources: res.sources };
    },
  },
  {
    name: "fetch_serp",
    description:
      "Run a SERP (search engine results page) analysis for a keyword — returns top organic results, People Also Ask, and related searches. Best for SEO and competitor ranking data.",
    parameters: {
      type: "object",
      properties: { keyword: { type: "string" } },
      required: ["keyword"],
    },
    execute: async (args) => {
      return fetchSerpAnalysis(args.keyword);
    },
  },
  {
    name: "scrape_url",
    description:
      "Scrape the text content of a webpage/URL to extract real data (e.g. a competitor page or article).",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    execute: async (args) => {
      return extractFromUrl(args.url);
    },
  },

  // ---------------- READ DATA (SYNCED WITH TABS) ----------------
  {
    name: "get_brand_dna",
    description:
      "Read the workspace Brand DNA (tone, audience, mission, pain points, differentiator, forbidden words). Use before writing any marketing copy.",
    parameters: { type: "object", properties: {} },
    execute: async (args, ctx) => {
      return getWorkspaceBrandDNA(ctx.workspaceId);
    },
  },
  {
    name: "list_posts",
    description:
      "List the workspace's posts (drafts, scheduled, published) — the Content Library data.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "max rows (default 20)" } },
    },
    execute: async (args, ctx) => {
      return prisma.post.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
        take: args.limit || 20,
        select: {
          id: true,
          platform: true,
          content: true,
          imageUrl: true,
          mediaType: true,
          format: true,
          status: true,
          scheduledFor: true,
          createdAt: true,
        },
      });
    },
  },
  {
    name: "list_competitors",
    description: "List the tracked competitors for the workspace.",
    parameters: { type: "object", properties: {} },
    execute: async (args, ctx) => {
      return prisma.competitor.findMany({ where: { workspaceId: ctx.workspaceId } });
    },
  },
  {
    name: "get_analytics",
    description:
      "Read the workspace analytics (impressions, clicks, leads, engagement, post performance).",
    parameters: { type: "object", properties: {} },
    execute: async (args, ctx) => {
      return getWorkspaceAnalytics(ctx.workspaceId);
    },
  },

  // ---------------- MEDIA GENERATION (REAL AI) ----------------
  {
    name: "generate_image",
    description:
      "Generate a high-resolution marketing image, visual asset, or social media graphic. Use whenever the user asks to generate, design, or create an image.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed visual description of the image to generate" },
        platform: { type: "string", description: "Platform name (e.g. LinkedIn, Instagram, Pinterest, X, Facebook)" },
        aspectRatio: { type: "string", enum: ["1:1", "9:16", "16:9", "4:5", "2:3"], description: "Target aspect ratio (default: 1:1 for feed, 9:16 for vertical, 16:9 for landscape)" },
        style: { type: "string", description: "Style preset: photorealistic, cinematic, commercial_product, minimalist, 3d_render, editorial, illustration" },
        quality: { type: "string", description: "Quality preset: ultra_hd_8k, studio_4k, standard_hd" },
      },
      required: ["prompt"],
    },
    execute: async (args, ctx) => {
      const platform = args.platform || "Brand Asset";
      const aspectRatio = args.aspectRatio || "1:1";
      const format = args.format || "Feed";

      // Automatically find reference image from uploaded files if user attached one
      let sourceImage: string | undefined = args.sourceImage;
      if (!sourceImage && ctx.uploadedFiles && ctx.uploadedFiles.length > 0) {
        const imageFile = ctx.uploadedFiles.find(
          (f) =>
            f.type.startsWith("image/") ||
            (f.content && f.content.startsWith("data:image/")) ||
            /\.(png|jpg|jpeg|webp|gif)$/i.test(f.name)
        );
        if (imageFile && imageFile.content) {
          sourceImage = imageFile.content;
        }
      }

      ctx.onProgress?.(`Starting image synthesis with gemini-3-pro-image...`);

      const assets = await generateMediaAsset({
        platform,
        contentType: format,
        mediaType: "image",
        prompt: args.prompt,
        aspectRatio,
        style: args.style || "commercial_product",
        quality: args.quality || "studio_4k",
        imageModel: "gemini-3-pro-image",
        sourceImage,
        onProgress: ctx.onProgress,
      });
      const first = assets[0];
      if (!first || !first.url) return { error: "Failed to generate image" };

      // 1. Save to media assets library
      try {
        await prisma.mediaAsset.create({
          data: {
            url: first.url,
            filename: `ai-image-${platform.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.png`,
            contentType: "image/png",
            workspaceId: ctx.workspaceId,
          },
        });
      } catch (e) {
        console.warn("[tools:generate_image] Saved asset record failed non-fatally", e);
      }

      // 2. Save to Post table so it shows on Content Approval Board & AI Studio
      let savedPostId: string | undefined;
      try {
        const post = await prisma.post.create({
          data: {
            workspaceId: ctx.workspaceId,
            platform,
            content: args.prompt,
            format,
            imageUrl: first.url,
            imagePrompt: args.prompt,
            mediaType: "image",
            status: "PENDING_APPROVAL",
            source: "ai-brain",
          },
        });
        savedPostId = post.id;
      } catch (e) {
        console.warn("[tools:generate_image] Saved post record failed non-fatally", e);
      }

      return {
        id: savedPostId,
        url: first.url,
        prompt: args.prompt,
        platform,
        format,
        aspectRatio,
        model: "gemini-3-pro-image",
        status: "completed",
        hasReferenceImage: Boolean(sourceImage),
        savedToContentLibrary: true,
      };
    },
  },
  {
    name: "generate_video",
    description:
      "Generate a short-form marketing video or Reel. Use for Reels, TikToks, Shorts, or Video Ads. Can use attached images as reference for Image-to-Video.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed motion/scene prompt for the video" },
        platform: { type: "string", description: "Platform name (e.g. TikTok, Instagram, YouTube, Facebook)" },
        topic: { type: "string", description: "Core marketing topic or product name" },
        aspectRatio: { type: "string", enum: ["9:16", "16:9", "1:1"], description: "Default 9:16 for vertical reels" },
        videoTask: { type: "string", description: "Task type: text_to_video, image_to_video, product_showcase, cinematic_broll" },
      },
      required: ["prompt"],
    },
    execute: async (args, ctx) => {
      const platform = args.platform || "Instagram";
      const aspectRatio = args.aspectRatio || "9:16";

      // Automatically find reference image from uploaded files if user attached one
      let sourceImage: string | undefined = args.sourceImage;
      if (!sourceImage && ctx.uploadedFiles && ctx.uploadedFiles.length > 0) {
        const imageFile = ctx.uploadedFiles.find(
          (f) =>
            f.type.startsWith("image/") ||
            (f.content && f.content.startsWith("data:image/")) ||
            /\.(png|jpg|jpeg|webp|gif)$/i.test(f.name)
        );
        if (imageFile && imageFile.content) {
          sourceImage = imageFile.content;
        }
      }

      ctx.onProgress?.(`Initializing video generation (gemini-omni-flash-preview)...`);

      const assets = await generateMediaAsset({
        platform,
        contentType: "Reel",
        mediaType: "video",
        prompt: args.prompt,
        topic: args.topic || "Product Launch",
        aspectRatio,
        videoTask: sourceImage ? "image_to_video" : (args.videoTask || "product_showcase"),
        sourceImage,
        onProgress: ctx.onProgress,
      });
      const first = assets[0];
      if (!first || !first.url) return { error: "Failed to generate video" };

      // 1. Save to MediaAsset table
      try {
        await prisma.mediaAsset.create({
          data: {
            url: first.url,
            filename: `ai-video-${platform.toLowerCase()}-${Date.now()}.mp4`,
            contentType: "video/mp4",
            workspaceId: ctx.workspaceId,
          },
        });
      } catch (e) {
        console.warn("[tools:generate_video] Saved video record failed non-fatally", e);
      }

      // 2. Save to Post table so it shows on Content Approval Board & AI Studio
      let savedPostId: string | undefined;
      try {
        const post = await prisma.post.create({
          data: {
            workspaceId: ctx.workspaceId,
            platform,
            content: args.prompt,
            format: "Reel",
            imageUrl: first.url,
            imagePrompt: args.prompt,
            mediaType: "video",
            status: "PENDING_APPROVAL",
            source: "ai-brain",
          },
        });
        savedPostId = post.id;
      } catch (e) {
        console.warn("[tools:generate_video] Saved post record failed non-fatally", e);
      }

      return {
        id: savedPostId,
        url: first.url,
        prompt: args.prompt,
        platform,
        aspectRatio,
        model: MODELS.VIDEO,
        status: "completed",
        hasReferenceImage: Boolean(sourceImage),
        savedToContentLibrary: true,
      };
    },
  },

  // ---------------- WRITE DATA (SYNCED WITH TABS & CONTENT LIBRARY) ----------------
  {
    name: "save_draft",
    description:
      "Create (or update) a draft post so it appears in the Content Library and AI Studio. Provide platform, content (caption), optional format, hashtags, topic, and optional imageUrl or videoUrl.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "e.g. LinkedIn, Instagram, X, TikTok, YouTube, Facebook, Pinterest" },
        content: { type: "string", description: "the caption/post text" },
        format: { type: "string", description: "e.g. Feed, Reel, Post, Carousel, Story, Video, Pin" },
        hashtags: { type: "array", items: { type: "string" } },
        campaignTopic: { type: "string" },
        imagePrompt: { type: "string" },
        imageUrl: { type: "string" },
        videoUrl: { type: "string" },
        mediaType: { type: "string", enum: ["image", "video", "carousel", "text"] },
        id: { type: "string", description: "existing post id to update instead of create" },
      },
      required: ["platform", "content"],
    },
    execute: async (args, ctx) => {
      const hashtags = normalizeHashtags(args.hashtags || []);
      const mediaUrl = args.imageUrl || args.videoUrl;
      const data: any = {
        workspaceId: ctx.workspaceId,
        platform: args.platform,
        content: args.content,
        format: args.format || "Feed",
        hashtags,
        campaignTopic: args.campaignTopic,
        imagePrompt: args.imagePrompt,
        imageUrl: mediaUrl,
        mediaType: args.mediaType || (args.videoUrl ? "video" : args.imageUrl ? "image" : "text"),
        status: "DRAFT",
        source: "ai-brain",
      };
      const post = args.id
        ? await prisma.post.update({ where: { id: args.id }, data })
        : await prisma.post.create({ data });
      return { id: post.id, platform: post.platform, format: post.format, status: post.status };
    },
  },
  {
    name: "schedule_post",
    description:
      "Schedule a post for automated publishing on a specific date and time. Immediately visible in the Calendar and Content Library with SCHEDULED status.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "e.g. LinkedIn, Instagram, X, Facebook" },
        content: { type: "string", description: "the post copy" },
        scheduledFor: { type: "string", description: "ISO 8601 date string or readable date/time (e.g. 2026-08-20T10:00:00Z)" },
        format: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        imageUrl: { type: "string" },
        videoUrl: { type: "string" },
        id: { type: "string", description: "existing draft post id to schedule" },
      },
      required: ["platform", "content", "scheduledFor"],
    },
    execute: async (args, ctx) => {
      const hashtags = normalizeHashtags(args.hashtags || []);
      const scheduledDate = new Date(args.scheduledFor);
      const validDate = isNaN(scheduledDate.getTime()) ? new Date(Date.now() + 86400000) : scheduledDate;
      const mediaUrl = args.imageUrl || args.videoUrl;

      const data: any = {
        workspaceId: ctx.workspaceId,
        platform: args.platform,
        content: args.content,
        format: args.format || "Feed",
        hashtags,
        imageUrl: mediaUrl,
        mediaType: args.videoUrl ? "video" : mediaUrl ? "image" : "text",
        status: "SCHEDULED",
        scheduledFor: validDate,
        source: "ai-brain",
      };

      const post = args.id
        ? await prisma.post.update({ where: { id: args.id }, data })
        : await prisma.post.create({ data });

      return {
        id: post.id,
        platform: post.platform,
        scheduledFor: post.scheduledFor?.toISOString(),
        status: "SCHEDULED",
      };
    },
  },
  {
    name: "create_campaign_post",
    description:
      "Full end-to-end post generator that crafts the caption, optionally generates real AI visual media (gemini-3-pro-image or video), and saves it into Content Library & AI Studio in one go.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "Target social platform" },
        topic: { type: "string", description: "Core campaign topic or product feature" },
        content: { type: "string", description: "Full formatted caption with hooks and CTA" },
        mediaType: { type: "string", enum: ["image", "video", "text_only"], description: "Whether to generate an image or video" },
        visualPrompt: { type: "string", description: "Prompt for the AI image/video generator" },
        aspectRatio: { type: "string", enum: ["1:1", "9:16", "16:9", "2:3", "4:5"] },
        hashtags: { type: "array", items: { type: "string" } },
      },
      required: ["platform", "topic", "content"],
    },
    execute: async (args, ctx) => {
      let mediaUrl: string | undefined;
      let actualMediaType: "image" | "video" | "text" = "text";

      if (args.mediaType === "image" && args.visualPrompt) {
        try {
          const assets = await generateMediaAsset({
            platform: args.platform,
            contentType: "Feed",
            mediaType: "image",
            prompt: args.visualPrompt,
            aspectRatio: args.aspectRatio || "1:1",
            imageModel: "gemini-3-pro-image",
          });
          if (assets[0]?.url) {
            mediaUrl = assets[0].url;
            actualMediaType = "image";
          }
        } catch (err) {
          console.warn("[create_campaign_post] Image generation non-fatal error:", err);
        }
      } else if (args.mediaType === "video" && args.visualPrompt) {
        try {
          const assets = await generateMediaAsset({
            platform: args.platform,
            contentType: "Reel",
            mediaType: "video",
            prompt: args.visualPrompt,
            topic: args.topic,
            aspectRatio: args.aspectRatio || "9:16",
          });
          if (assets[0]?.url) {
            mediaUrl = assets[0].url;
            actualMediaType = "video";
          }
        } catch (err) {
          console.warn("[create_campaign_post] Video generation non-fatal error:", err);
        }
      }

      const post = await prisma.post.create({
        data: {
          workspaceId: ctx.workspaceId,
          platform: args.platform,
          content: args.content,
          campaignTopic: args.topic,
          format: actualMediaType === "video" ? "Reel" : "Feed",
          imageUrl: mediaUrl,
          imagePrompt: args.visualPrompt,
          mediaType: actualMediaType,
          hashtags: normalizeHashtags(args.hashtags || []),
          status: "DRAFT",
          source: "ai-brain",
        },
      });

      return {
        id: post.id,
        platform: post.platform,
        contentPreview: post.content.slice(0, 150),
        mediaUrl: post.imageUrl,
        mediaType: post.mediaType,
        status: post.status,
      };
    },
  },
  {
    name: "update_brand_dna",
    description:
      "Update the workspace Brand DNA (e.g. change tone, audience, differentiator). Pass only the fields to change.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        targetAudience: { type: "string" },
        missionVision: { type: "string" },
        ctaOffer: { type: "string" },
        painPoints: { type: "string" },
        differentiator: { type: "string" },
        competitors: { type: "string" },
        tone: { type: "string" },
        writingStyle: { type: "string" },
        forbiddenWords: { type: "array", items: { type: "string" } },
      },
    },
    execute: async (args, ctx) => {
      const current = await getWorkspaceBrandDNA(ctx.workspaceId).catch(() => ({} as any));
      const merged = { ...current, ...args };
      await saveWorkspaceBrandDNA(ctx.workspaceId, merged);
      return { ok: true };
    },
  },

  // ---------------- MEMORY ----------------
  {
    name: "recall_memory",
    description:
      "Recall relevant long-term memories/facts about this user, brand or past work for a given query.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: async (args, ctx) => {
      return recallMemories(ctx.workspaceId, args.query, 6);
    },
  },
  {
    name: "save_memory",
    description:
      "Persist an important fact/preference about the user or brand into long-term memory.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "e.g. brand, preference, decision, file, note" },
        content: { type: "string" },
      },
      required: ["category", "content"],
    },
    execute: async (args, ctx) => {
      await saveMemory(ctx.workspaceId, args.category, args.content);
      return { ok: true };
    },
  },

  // ---------------- FILES ----------------
  {
    name: "read_uploaded_files",
    description:
      "Read the contents of all files the user uploaded (code, text, csv, md, json, ino, documents, or base64 images). Returns file names, types, and their complete text/data content.",
    parameters: { type: "object", properties: {} },
    execute: async (args, ctx) => {
      const files = ctx.uploadedFiles || [];
      if (files.length === 0) return { files: [], note: "No files uploaded." };
      return {
        files: files.map((f) => ({
          name: f.name,
          type: f.type,
          content: (f.content || "").slice(0, 35000),
        })),
      };
    },
  },

  // ---------------- CRUD / CALENDAR / CONTENT CONTROL ----------------
  {
    name: "get_post",
    description:
      "Read a single post by its ID with all details (caption, media, status, schedule, platform, format, hashtags).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The post ID to look up" },
      },
      required: ["id"],
    },
    execute: async (args, ctx) => {
      const post = await prisma.post.findUnique({
        where: { id: args.id },
      });
      if (!post) return { error: `Post not found: ${args.id}` };
      return {
        id: post.id,
        platform: post.platform,
        content: post.content,
        format: post.format,
        status: post.status,
        imageUrl: post.imageUrl,
        mediaType: post.mediaType,
        hashtags: post.hashtags,
        campaignTopic: post.campaignTopic,
        scheduledFor: post.scheduledFor?.toISOString() || null,
        publishedAt: post.publishedAt?.toISOString() || null,
        createdAt: post.createdAt.toISOString(),
      };
    },
  },
  {
    name: "update_post",
    description:
      "Update an existing post's content, caption, hashtags, format, media URL, or campaign topic. Resets status to DRAFT when content changes to prevent publishing stale content.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The post ID to update" },
        content: { type: "string", description: "New caption / post text" },
        hashtags: { type: "array", items: { type: "string" } },
        format: { type: "string" },
        imageUrl: { type: "string" },
        mediaType: { type: "string" },
        campaignTopic: { type: "string" },
      },
      required: ["id"],
    },
    execute: async (args, ctx) => {
      const existing = await prisma.post.findUnique({ where: { id: args.id } });
      if (!existing) return { error: `Post not found: ${args.id}` };
      const data: any = {};
      if (args.content !== undefined) data.content = args.content;
      if (args.hashtags !== undefined) data.hashtags = normalizeHashtags(args.hashtags);
      if (args.format !== undefined) data.format = args.format;
      if (args.imageUrl !== undefined) data.imageUrl = args.imageUrl;
      if (args.mediaType !== undefined) data.mediaType = args.mediaType;
      if (args.campaignTopic !== undefined) data.campaignTopic = args.campaignTopic;
      // Reset status to DRAFT if content changed to prevent publishing stale content
      if (data.content || data.imageUrl || data.hashtags) {
        data.status = "DRAFT";
      }
      const post = await prisma.post.update({ where: { id: args.id }, data });
      return { id: post.id, platform: post.platform, format: post.format, status: post.status, updated: true };
    },
  },
  {
    name: "delete_post",
    description:
      "Delete a post (draft, scheduled, or failed) by its ID. This is a destructive action — only call when the user explicitly requests deletion.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The post ID to delete" },
      },
      required: ["id"],
    },
    execute: async (args, ctx) => {
      const existing = await prisma.post.findUnique({ where: { id: args.id } });
      if (!existing) return { error: `Post not found: ${args.id}` };
      await prisma.post.delete({ where: { id: args.id } });
      // Clean up Redis schedule queue if it was scheduled
      if (existing.status === "SCHEDULED" && existing.scheduledFor) {
        try { await removeFromScheduleQueue(args.id); } catch { /* non-fatal */ }
      }
      return { deleted: true, id: args.id, platform: existing.platform, format: existing.format };
    },
  },
  {
    name: "reschedule_post",
    description:
      "Change the scheduled date/time of an existing post. The new date must be in the future.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The post ID to reschedule" },
        scheduledFor: { type: "string", description: "New ISO 8601 date string (e.g. 2026-08-22T19:00:00Z)" },
      },
      required: ["id", "scheduledFor"],
    },
    execute: async (args, ctx) => {
      const existing = await prisma.post.findUnique({ where: { id: args.id } });
      if (!existing) return { error: `Post not found: ${args.id}` };
      const newDate = new Date(args.scheduledFor);
      if (isNaN(newDate.getTime())) return { error: "Invalid date format" };
      if (newDate.getTime() <= Date.now()) return { error: "Scheduled date must be in the future" };
      const post = await prisma.post.update({
        where: { id: args.id },
        data: { scheduledFor: newDate, status: "SCHEDULED" },
      });
      return {
        id: post.id,
        platform: post.platform,
        previousDate: existing.scheduledFor?.toISOString() || null,
        newDate: post.scheduledFor?.toISOString(),
        status: "SCHEDULED",
      };
    },
  },
  {
    name: "publish_post",
    description:
      "Publish a post immediately to its connected social platform. This is a real publishing action — only call when the user explicitly requests immediate publishing.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The post ID to publish" },
      },
      required: ["id"],
    },
    execute: async (args, ctx) => {
      const post = await prisma.post.findUnique({
        where: { id: args.id },
        include: { workspace: true },
      });
      if (!post) return { error: `Post not found: ${args.id}` };
      if (!post.content && !post.imageUrl) return { error: "Post has no content or media to publish" };

      const platformEnumMap: Record<string, string> = {
        instagram: "INSTAGRAM", facebook: "FACEBOOK", linkedin: "LINKEDIN",
        x: "X", youtube: "YOUTUBE", tiktok: "TIKTOK", pinterest: "PINTEREST",
      };
      const basePlatform = post.platform.split(/[\s\-_]+/)[0].toLowerCase();
      const platformEnum = platformEnumMap[basePlatform];
      if (!platformEnum) return { error: `Unknown platform: ${post.platform}` };

      const account = await prisma.socialAccount.findFirst({
        where: { workspaceId: post.workspaceId, platform: platformEnum as any },
      });
      if (!account) return { error: `Social account not connected for: ${post.platform}` };

      // Import at runtime to avoid circular dependencies with server actions
      const { publishToPlatform } = await import("@/actions/publish");
      try {
        const result = await publishToPlatform(post, account);
        return {
          id: result.id,
          platform: result.platform,
          status: result.status,
          publishedAt: result.publishedAt?.toISOString() || null,
          publishError: result.publishError || null,
        };
      } catch (err: any) {
        return { error: `Publishing failed: ${err.message}` };
      }
    },
  },
  {
    name: "approve_content",
    description:
      "Approve a post that is pending approval. Changes status to APPROVED (or SCHEDULED if it has a scheduled date).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The post ID to approve" },
      },
      required: ["id"],
    },
    execute: async (args, ctx) => {
      const post = await prisma.post.findUnique({ where: { id: args.id } });
      if (!post) return { error: `Post not found: ${args.id}` };
      const newStatus = post.scheduledFor ? "SCHEDULED" : "APPROVED";
      const updated = await prisma.post.update({
        where: { id: args.id },
        data: { status: newStatus },
      });
      return { id: updated.id, platform: updated.platform, status: updated.status, approved: true };
    },
  },
  {
    name: "cancel_scheduled_post",
    description:
      "Cancel a scheduled post and move it back to DRAFT status. The post is NOT deleted, just unscheduled.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The post ID to cancel scheduling for" },
      },
      required: ["id"],
    },
    execute: async (args, ctx) => {
      const existing = await prisma.post.findUnique({ where: { id: args.id } });
      if (!existing) return { error: `Post not found: ${args.id}` };
      if (existing.status !== "SCHEDULED") return { error: `Post is not scheduled (current status: ${existing.status})` };
      const post = await prisma.post.update({
        where: { id: args.id },
        data: { status: "DRAFT", scheduledFor: null },
      });
      try { await removeFromScheduleQueue(args.id); } catch { /* non-fatal */ }
      return { id: post.id, platform: post.platform, status: "DRAFT", cancelled: true };
    },
  },
  {
    name: "get_calendar",
    description:
      "Read scheduled posts for a date range. Shows what is scheduled in the calendar. Defaults to the next 7 days if no dates are provided.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date (ISO 8601), defaults to now" },
        endDate: { type: "string", description: "End date (ISO 8601), defaults to 7 days from now" },
      },
    },
    execute: async (args, ctx) => {
      const start = args.startDate ? new Date(args.startDate) : new Date();
      const end = args.endDate ? new Date(args.endDate) : new Date(Date.now() + 7 * 86400000);
      const posts = await prisma.post.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          scheduledFor: { gte: start, lte: end },
          status: { in: ["SCHEDULED", "PUBLISHING", "PUBLISHED"] },
        },
        orderBy: { scheduledFor: "asc" },
        select: {
          id: true, platform: true, content: true, format: true, status: true,
          scheduledFor: true, mediaType: true, campaignTopic: true,
        },
      });
      return {
        range: { start: start.toISOString(), end: end.toISOString() },
        count: posts.length,
        posts: posts.map((p) => ({
          ...p,
          contentPreview: p.content.slice(0, 100),
          scheduledFor: p.scheduledFor?.toISOString(),
        })),
      };
    },
  },
  {
    name: "get_workspace_state",
    description:
      "Get a quick overview of the current workspace state — connected platforms, content counts by status, Brand DNA summary, recent campaigns.",
    parameters: { type: "object", properties: {} },
    execute: async (args, ctx) => {
      const [accounts, postCounts, brand, recentPosts] = await Promise.all([
        prisma.socialAccount.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { platform: true, handle: true, pageName: true },
        }),
        prisma.post.groupBy({
          by: ["status"],
          where: { workspaceId: ctx.workspaceId },
          _count: true,
        }),
        getWorkspaceBrandDNA(ctx.workspaceId).catch(() => null),
        prisma.post.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, platform: true, status: true, format: true, campaignTopic: true, createdAt: true },
        }),
      ]);
      const statusMap: Record<string, number> = {};
      for (const g of postCounts) statusMap[g.status] = g._count;
      return {
        connectedPlatforms: accounts.map((a) => ({ platform: a.platform, handle: a.handle || a.pageName })),
        contentCounts: statusMap,
        brandDNA: brand ? { name: brand.name, industry: brand.industry, tone: brand.tone, hasAudience: Boolean(brand.targetAudience) } : null,
        recentPosts: recentPosts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      };
    },
  },
  {
    name: "list_campaigns",
    description:
      "List campaigns — groups of posts that share a campaign topic. Returns campaign names, post counts, and status breakdown.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max campaigns to return (default 10)" },
      },
    },
    execute: async (args, ctx) => {
      const campaigns = await prisma.post.groupBy({
        by: ["campaignTopic"],
        where: { workspaceId: ctx.workspaceId, campaignTopic: { not: null } },
        _count: true,
        orderBy: { _count: { campaignTopic: "desc" } },
        take: args.limit || 10,
      });
      if (campaigns.length === 0) return { campaigns: [], note: "No campaigns found. Create one by asking me!" };
      // Fetch status breakdown per campaign
      const details = await Promise.all(
        campaigns.map(async (c) => {
          const posts = await prisma.post.findMany({
            where: { workspaceId: ctx.workspaceId, campaignTopic: c.campaignTopic },
            select: { id: true, platform: true, status: true, format: true, scheduledFor: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          });
          return {
            campaignTopic: c.campaignTopic,
            totalPosts: c._count,
            posts: posts.map((p) => ({ ...p, scheduledFor: p.scheduledFor?.toISOString() || null })),
          };
        })
      );
      return { campaigns: details };
    },
  },
  {
    name: "get_content_library",
    description:
      "Browse the content library with optional filters for status, platform, or search text. Returns posts from the Content Library.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: DRAFT, SCHEDULED, PUBLISHED, PENDING_APPROVAL, FAILED, APPROVED" },
        platform: { type: "string", description: "Filter by platform name (e.g. Instagram, LinkedIn)" },
        search: { type: "string", description: "Search text in caption content" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
    execute: async (args, ctx) => {
      const where: any = { workspaceId: ctx.workspaceId };
      if (args.status) where.status = args.status;
      if (args.platform) where.platform = { contains: args.platform, mode: "insensitive" };
      if (args.search) where.content = { contains: args.search, mode: "insensitive" };
      const posts = await prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: args.limit || 20,
        select: {
          id: true, platform: true, content: true, format: true, status: true,
          imageUrl: true, mediaType: true, hashtags: true, scheduledFor: true,
          campaignTopic: true, createdAt: true,
        },
      });
      return {
        count: posts.length,
        filters: { status: args.status || "all", platform: args.platform || "all" },
        posts: posts.map((p) => ({
          ...p,
          contentPreview: p.content.slice(0, 120),
          scheduledFor: p.scheduledFor?.toISOString() || null,
          createdAt: p.createdAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "repurpose_content",
    description:
      "Take an existing post and adapt it for a different platform. Creates a new draft with the content rewritten using platform-specific rules, format, character limits, and hashtag limits.",
    parameters: {
      type: "object",
      properties: {
        sourcePostId: { type: "string", description: "The ID of the post to repurpose" },
        targetPlatform: { type: "string", description: "Target platform (e.g. LinkedIn, Instagram, X, TikTok)" },
        targetFormat: { type: "string", description: "Target format (e.g. Feed, Reel, Post, Thread)" },
      },
      required: ["sourcePostId", "targetPlatform"],
    },
    execute: async (args, ctx) => {
      const source = await prisma.post.findUnique({ where: { id: args.sourcePostId } });
      if (!source) return { error: `Source post not found: ${args.sourcePostId}` };

      const targetFormat = args.targetFormat || "Feed";
      const cap = getPlatformCapability(args.targetPlatform.toLowerCase() as any, targetFormat);

      // Use LLM to adapt the content for the target platform
      const repurposePrompt = `Adapt the following social media post for ${args.targetPlatform} (${targetFormat} format).

ORIGINAL POST (${source.platform} ${source.format || "Feed"}):
${source.content}

TARGET PLATFORM RULES:
- Platform: ${args.targetPlatform} ${targetFormat}
- Max caption length: ${cap.captionLimit} characters
- Max hashtags: ${cap.hashtagLimit}
- Supports title: ${cap.supportsTitle}
- Supports description: ${cap.supportsDescription}
${cap.supportsTitle ? `- Max title length: ${cap.titleLimit || 100} chars` : ""}

INSTRUCTIONS:
- Rewrite the caption to match ${args.targetPlatform} tone and format norms
- Do NOT simply copy-paste — adapt the hook, length, CTA and style
- If the target supports title/description, include them
- Keep core message but optimize for the platform audience
- Return ONLY valid JSON: { "caption": "...", "hashtags": ["#Tag1"], "title": "..." (if applicable) }`;

      const adapted = await vertexProvider.generateJSON(
        [{ role: "user", content: repurposePrompt }],
        { modelName: MODELS.CONTENT_CREATOR, temperature: 0.3 }
      );

      const caption = adapted?.caption || source.content.slice(0, cap.captionLimit);
      const hashtags = normalizeHashtags(adapted?.hashtags || source.hashtags, { limit: cap.hashtagLimit });

      const newPost = await prisma.post.create({
        data: {
          workspaceId: ctx.workspaceId,
          platform: args.targetPlatform,
          content: caption,
          format: targetFormat,
          hashtags,
          imageUrl: source.imageUrl,
          imagePrompt: source.imagePrompt,
          mediaType: source.mediaType,
          campaignTopic: source.campaignTopic,
          status: "DRAFT",
          source: `repurposed-from-${source.id}`,
        },
      });

      return {
        id: newPost.id,
        sourcePlatform: source.platform,
        targetPlatform: args.targetPlatform,
        targetFormat,
        contentPreview: caption.slice(0, 120),
        status: "DRAFT",
        repurposed: true,
      };
    },
  },
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Compact tool list for the planner prompt. */
export function describeTools(): string {
  return TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
}

