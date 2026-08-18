import prisma from "@/lib/db";
import { vertexProvider, MODELS } from "../llm";
import { fetchSerpAnalysis } from "@/actions/serp";
import { extractFromUrl } from "@/actions/extract";
import { recallMemories, saveMemory } from "../memory";
import { getWorkspaceAnalytics } from "@/actions/analytics";
import { saveWorkspaceBrandDNA, getWorkspaceBrandDNA } from "@/actions/brand";
import { normalizeHashtags } from "@/lib/hashtags";

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

  // ---------------- WRITE DATA (SYNCED WITH TABS) ----------------
  {
    name: "save_draft",
    description:
      "Create (or update) a draft post so it appears in the Content Library and AI Studio. Provide platform, content (caption), optional format, hashtags and topic.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "e.g. LinkedIn, Instagram, X, TikTok, YouTube, Facebook, Pinterest" },
        content: { type: "string", description: "the caption/post text" },
        format: { type: "string", description: "e.g. Feed, Reel, Post, Carousel, Story, Video" },
        hashtags: { type: "array", items: { type: "string" } },
        campaignTopic: { type: "string" },
        imagePrompt: { type: "string" },
        mediaType: { type: "string", enum: ["image", "video", "carousel", "text"] },
        id: { type: "string", description: "existing post id to update instead of create" },
      },
      required: ["platform", "content"],
    },
    execute: async (args, ctx) => {
      const hashtags = normalizeHashtags(args.hashtags || []);
      const data: any = {
        workspaceId: ctx.workspaceId,
        platform: args.platform,
        content: args.content,
        format: args.format,
        hashtags,
        campaignTopic: args.campaignTopic,
        imagePrompt: args.imagePrompt,
        mediaType: args.mediaType,
        status: "DRAFT",
        source: "ai-brain",
      };
      const post = args.id
        ? await prisma.post.update({ where: { id: args.id }, data })
        : await prisma.post.create({ data });
      return { id: post.id, platform: post.platform, status: post.status };
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
      "Read the contents of files the user uploaded (text, code, csv, md, json, or extracted PDF text). Returns file names and their text content.",
    parameters: { type: "object", properties: {} },
    execute: async (args, ctx) => {
      const files = ctx.uploadedFiles || [];
      if (files.length === 0) return { files: [], note: "No files uploaded." };
      return {
        files: files.map((f) => ({
          name: f.name,
          type: f.type,
          content: (f.content || "").slice(0, 12000),
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
