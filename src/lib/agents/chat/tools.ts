import prisma from "@/lib/db";
import { vertexProvider, MODELS } from "../llm";
import { fetchSerpAnalysis } from "@/actions/serp";
import { extractFromUrl } from "@/actions/extract";
import { recallMemories, saveMemory } from "../memory";
import { getWorkspaceAnalytics } from "@/actions/analytics";
import { saveWorkspaceBrandDNA, getWorkspaceBrandDNA } from "@/actions/brand";
import { normalizeHashtags } from "@/lib/hashtags";
import { generateMediaAsset } from "../mediaGenerator";

// ============================================================================
// MARKETING BRAIN — TOOL REGISTRY
// Each tool wraps a real data source or a real write operation so the brain
// reads/writes the SAME database that every dashboard tab uses.
// ============================================================================

export interface ToolContext {
  workspaceId: string;
  userId: string;
  uploadedFiles?: { name: string; content: string; type: string }[];
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
      const platform = args.platform || "Instagram";
      const aspectRatio = args.aspectRatio || "1:1";
      const assets = await generateMediaAsset({
        platform,
        contentType: "Feed",
        mediaType: "image",
        prompt: args.prompt,
        aspectRatio,
        style: args.style || "commercial_product",
        quality: args.quality || "studio_4k",
        imageModel: "gemini-3-pro-image",
      });
      const first = assets[0];
      if (!first || !first.url) return { error: "Failed to generate image" };

      // Save to media assets library
      try {
        await prisma.mediaAsset.create({
          data: {
            url: first.url,
            filename: `ai-image-${platform.toLowerCase()}-${Date.now()}.png`,
            contentType: "image/png",
            workspaceId: ctx.workspaceId,
          },
        });
      } catch (e) {
        console.warn("[tools:generate_image] Saved asset record failed non-fatally", e);
      }

      return {
        url: first.url,
        prompt: args.prompt,
        platform,
        aspectRatio,
        model: "gemini-3-pro-image",
        status: "completed",
      };
    },
  },
  {
    name: "generate_video",
    description:
      "Generate a short-form marketing video or Reel. Use for Reels, TikToks, Shorts, or Video Ads.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed motion/scene prompt for the video" },
        platform: { type: "string", description: "Platform name (e.g. TikTok, Instagram, YouTube, Facebook)" },
        topic: { type: "string", description: "Core marketing topic or product name" },
        aspectRatio: { type: "string", enum: ["9:16", "16:9", "1:1"], description: "Default 9:16 for vertical reels" },
        videoTask: { type: "string", description: "Task type: text_to_video, product_showcase, cinematic_broll" },
      },
      required: ["prompt"],
    },
    execute: async (args, ctx) => {
      const platform = args.platform || "Instagram";
      const aspectRatio = args.aspectRatio || "9:16";
      const assets = await generateMediaAsset({
        platform,
        contentType: "Reel",
        mediaType: "video",
        prompt: args.prompt,
        topic: args.topic || "Product Launch",
        aspectRatio,
        videoTask: args.videoTask || "product_showcase",
      });
      const first = assets[0];
      if (!first || !first.url) return { error: "Failed to generate video" };

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

      return {
        url: first.url,
        prompt: args.prompt,
        platform,
        aspectRatio,
        model: MODELS.VIDEO,
        status: "completed",
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
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Compact tool list for the planner prompt. */
export function describeTools(): string {
  return TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
}

