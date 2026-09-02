import prisma from "@/lib/db";
import { vertexProvider, MODELS } from "@/lib/agents/llm";
import { PLATFORM_CAPABILITIES } from "@/lib/capabilities/platformCapabilities";
import { cacheGet, cacheSet } from "@/lib/redis";
import { getBestTimeSpec } from "@/lib/bestPublishTime";
import {
  getGrowthMetrics,
  getAttribution,
  getPublishHistory,
  getClickTimingBuckets,
  GrowthMetrics,
} from "@/lib/growth/metrics";
import {
  learnAllBestTimes,
  pillarPerformanceBlock,
  historicalWinnersBlock,
  closeMeasuredExperiments,
  rankPillars,
  type LearnedTiming,
} from "@/lib/growth/learning";
import { LINK_PLACEHOLDER, isCaptionLinkClickable } from "@/lib/growth/ctaLinks";

import {
  LeadType,
  LeadSource,
  GoalStatus,
  FunnelCalculation,
  PlatformStrategyItem,
  ContentPillar,
  GrowthPlanTask,
  ExperimentItem,
  DecisionItem,
  GrowthRecommendation,
  GrowthStrategy,
  GrowthKPIs,
  SEO_RAMP_UP_DAYS,
} from "@/lib/types/growth";

export * from "@/lib/types/growth";

export type AIDecision = DecisionItem;
export type GrowthExperiment = ExperimentItem;

// ============================================================================
// FUNNEL & CAPACITY CALCULATOR
//
// Two modes:
//   measured  — derived from this workspace's own tracked clicks and confirmed
//               leads (needs a minimum sample, see metrics.ts)
//   benchmark — conservative organic industry constants, clearly labelled
// Nothing here is ever fabricated from a post id or any other placeholder.
// ============================================================================

/** Conservative organic benchmarks, used only until real data exists. */
export const ORGANIC_BENCHMARKS = {
  /** Impressions → link/profile click. */
  engagementCTR: 0.048,
  /** Click → lead. */
  organicCVR: 0.021,
  /** Reach per organic post (estimate — platform APIs do not report this). */
  avgImpressionsPerPost: 2450,
};

const QUALIFICATION_RATES: Record<string, number> = {
  QUALIFIED_LEADS: 0.35,
  LEADS: 1.0,
  WEBSITE_INQUIRIES: 0.8,
  CONTACT_FORM: 0.9,
  WHATSAPP: 0.85,
  BOOKINGS: 0.5,
  CUSTOM: 0.7,
};

export function calculateLeadFunnel(params: {
  targetLeads: number;
  leadType: string;
  timeframeDays: number;
  connectedPlatformCount?: number;
  leadSources?: LeadSource[];
  articlesPerWeek?: number;
  /** Real counts from LinkClick / LeadEvent / PublishLog. */
  measured?: {
    clicks: number;
    leads: number;
    posts: number;
    isMeasured: boolean;
  };
}): FunnelCalculation {
  const { targetLeads, leadType, timeframeDays } = params;
  const leadSources: LeadSource[] =
    params.leadSources && params.leadSources.length ? params.leadSources : ["SOCIAL"];
  const measured = params.measured;
  const isMeasured = Boolean(measured?.isMeasured && measured.clicks > 0 && measured.posts > 0);

  const qualRate = QUALIFICATION_RATES[leadType] ?? 0.5;
  const weeks = Math.max(1, timeframeDays / 7);

  let organicCVR: number;
  let clicksPerPost: number | undefined;
  let leadsPerClick: number | undefined;
  let requiredConversions: number;
  let requiredProfileVisits: number;
  let requiredTotalPosts: number;
  let avgImpressionsPerPost: number;

  if (isMeasured && measured) {
    // Real rates. LeadEvent already stores the goal's lead type, so no
    // qualification factor is applied on top of a measured lead.
    leadsPerClick = Math.max(0.002, Math.min(0.5, measured.leads / measured.clicks));
    clicksPerPost = Math.max(0.1, Math.min(500, measured.clicks / measured.posts));
    organicCVR = leadsPerClick;

    requiredConversions = targetLeads;
    requiredProfileVisits = Math.ceil(targetLeads / leadsPerClick);
    requiredTotalPosts = Math.max(1, Math.ceil(requiredProfileVisits / clicksPerPost));
    avgImpressionsPerPost = ORGANIC_BENCHMARKS.avgImpressionsPerPost; // still an estimate
  } else {
    organicCVR = ORGANIC_BENCHMARKS.organicCVR;
    requiredConversions = Math.ceil(
      targetLeads / (leadType === "QUALIFIED_LEADS" ? qualRate : 1.0)
    );
    requiredProfileVisits = Math.ceil(requiredConversions / organicCVR);
    avgImpressionsPerPost = ORGANIC_BENCHMARKS.avgImpressionsPerPost;
    requiredTotalPosts = Math.max(
      1,
      Math.ceil(
        Math.ceil(requiredProfileVisits / ORGANIC_BENCHMARKS.engagementCTR) / avgImpressionsPerPost
      )
    );
  }

  const engagementCTR = ORGANIC_BENCHMARKS.engagementCTR;
  const requiredImpressions = Math.ceil(requiredProfileVisits / engagementCTR);

  // ── split the workload between social posts and SEO articles ──────────────
  const useSocial = leadSources.includes("SOCIAL");
  const useWebsite = leadSources.includes("WEBSITE");

  // Website only contributes once articles can rank, so it never reduces the
  // social workload inside the ramp-up period.
  const websiteEffectiveDays = useWebsite ? Math.max(0, timeframeDays - SEO_RAMP_UP_DAYS) : 0;
  const websiteShare =
    useWebsite && useSocial
      ? Math.min(0.4, websiteEffectiveDays / Math.max(1, timeframeDays))
      : useWebsite && !useSocial
        ? 1
        : 0;

  const socialPosts = useSocial ? Math.max(1, Math.round(requiredTotalPosts * (1 - websiteShare))) : 0;
  const requiredPostsPerWeek = useSocial ? Math.max(1, Math.round(socialPosts / weeks)) : 0;
  const requiredPostsPerDay = useSocial
    ? Number(Math.max(0, socialPosts / timeframeDays).toFixed(2))
    : 0;

  const requiredArticlesPerWeek = useWebsite
    ? Math.max(1, params.articlesPerWeek || (websiteShare > 0.25 ? 3 : 2))
    : 0;

  const requiredDailyPace = Number((targetLeads / timeframeDays).toFixed(2));

  const assumptions: string[] = [];
  if (isMeasured && measured) {
    assumptions.push(
      `Measured from your data: ${measured.leads} confirmed leads from ${measured.clicks} tracked clicks (${(leadsPerClick! * 100).toFixed(1)}% click → lead)`,
      `Measured reach per post: ${clicksPerPost!.toFixed(1)} tracked clicks per published post`,
      `Production requirement: ~${requiredPostsPerWeek} posts/week to reach ${targetLeads} ${leadType.replace(/_/g, " ").toLowerCase()}`
    );
  } else {
    assumptions.push(
      `Lead type: ${leadType.replace(/_/g, " ")} with a ${(qualRate * 100).toFixed(0)}% qualification factor`,
      `Benchmark click → lead rate: ${(organicCVR * 100).toFixed(1)}% (replaced by your own rate after ${20} tracked clicks)`,
      `Benchmark impression → click rate: ${(engagementCTR * 100).toFixed(1)}%`,
      `Estimated reach: ~${avgImpressionsPerPost.toLocaleString()} impressions/post (estimate — platforms do not report organic reach here)`,
      `Production requirement: ~${requiredPostsPerWeek} posts/week across selected channels`
    );
  }
  if (useWebsite) {
    assumptions.push(
      websiteEffectiveDays > 0
        ? `Website channel: ${requiredArticlesPerWeek} SEO articles/week; search traffic counts from day ${SEO_RAMP_UP_DAYS} onward (${websiteEffectiveDays} effective days)`
        : `Website channel: articles will be published, but a ${timeframeDays}-day window is shorter than the ~${SEO_RAMP_UP_DAYS}-day indexing ramp, so social carries this goal`
    );
  }

  const dataSourceSummary = isMeasured
    ? `Calculated from your real tracked data: ${measured!.clicks} clicks, ${measured!.leads} confirmed leads across ${measured!.posts} published items.`
    : `Not enough tracked data yet (${measured?.clicks || 0} clicks, ${measured?.leads || 0} confirmed leads) — showing conservative organic benchmarks. These switch to your own numbers automatically.`;

  return {
    targetLeads,
    leadType,
    qualificationRate: isMeasured ? 1 : qualRate,
    requiredConversions,
    organicCVR,
    requiredProfileVisits,
    engagementCTR,
    requiredImpressions,
    avgImpressionsPerPost,
    requiredTotalPosts,
    requiredPostsPerWeek,
    requiredDailyPace,
    isBenchmarkFallback: !isMeasured,
    assumptions,
    dataSourceSummary,

    isMeasured,
    measuredClicks: measured?.clicks || 0,
    measuredLeads: measured?.leads || 0,
    measuredPosts: measured?.posts || 0,
    leadsPerClick,
    clicksPerPost,
    requiredPostsPerDay,
    requiredArticlesPerWeek,
    leadSources,
  };
}

// ============================================================================
// KPI CALCULATOR & PACE MONITOR — counted rows only
// ============================================================================

export function computeGrowthKPIs(
  goal: {
    leadTarget: number;
    startDate: Date | string;
    timeframeDays: number;
    leadType?: string;
  },
  metrics?: Partial<GrowthMetrics> | null
): GrowthKPIs {
  const targetLeads = Math.max(1, goal.leadTarget || 0);
  const timeframeDays = Math.max(1, goal.timeframeDays || 0);
  const start = new Date(goal.startDate || Date.now());
  const now = new Date();

  const elapsedMs = Math.max(0, now.getTime() - start.getTime());
  const daysElapsed = Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)) + 1);
  const daysLeft = Math.max(0, timeframeDays - daysElapsed);

  const achievedLeads = metrics?.leads || 0;
  const clicks = metrics?.clicks || 0;
  const postsPublished = metrics?.postsPublished || 0;
  const articlesPublished = metrics?.articlesPublished || 0;

  const remainingLeads = Math.max(0, targetLeads - achievedLeads);
  const currentPace = Number((achievedLeads / daysElapsed).toFixed(2));
  const requiredPace = daysLeft > 0 ? Number((remainingLeads / daysLeft).toFixed(2)) : 0;
  const projectedResult = Math.round(currentPace * timeframeDays);
  const progressPercentage = Math.min(100, Math.round((achievedLeads / targetLeads) * 100));

  const totalPublished = postsPublished + articlesPublished;

  let status: GoalStatus = "INSUFFICIENT_DATA";
  let statusReason = "";

  if (achievedLeads >= targetLeads) {
    status = "GOAL_ACHIEVED";
    statusReason = `Goal achieved — ${achievedLeads} confirmed leads recorded.`;
  } else if (totalPublished === 0) {
    status = "INSUFFICIENT_DATA";
    statusReason = "Nothing published yet — build the plan and let autopilot publish the first posts.";
  } else if (clicks === 0) {
    status = "INSUFFICIENT_DATA";
    statusReason = `${totalPublished} item${totalPublished === 1 ? "" : "s"} published, no tracked clicks yet. Clicks appear as soon as someone opens a post link.`;
  } else if (achievedLeads === 0) {
    status = "NEEDS_OPTIMIZATION";
    statusReason = `${clicks} real click${clicks === 1 ? "" : "s"} measured but no lead confirmed yet. Check that your CTA link goes to a page that captures contacts.`;
  } else if (requiredPace === 0 || currentPace >= requiredPace * 0.95) {
    status = "ON_TRACK";
    statusReason = `Pacing at ${currentPace} leads/day (needs ${requiredPace}/day for the remaining ${daysLeft} days).`;
  } else if (currentPace >= requiredPace * 0.7) {
    status = "NEEDS_OPTIMIZATION";
    const gap = Math.round((1 - currentPace / requiredPace) * 100);
    statusReason = `Lead pace is ${gap}% below what the remaining ${daysLeft} days need.`;
  } else {
    status = "BEHIND_TARGET";
    const gap = Math.round((1 - currentPace / requiredPace) * 100);
    statusReason = `Behind target by ${gap}% — ${remainingLeads} leads still needed in ${daysLeft} days.`;
  }

  return {
    targetLeads,
    achievedLeads,
    remainingLeads,
    daysTotal: timeframeDays,
    daysElapsed: Math.min(daysElapsed, timeframeDays),
    daysLeft,
    currentPace,
    requiredPace,
    projectedResult,
    progressPercentage,
    status,
    statusReason,

    clicks,
    uniqueClicks: metrics?.uniqueClicks || 0,
    socialLeads: metrics?.socialLeads || 0,
    websiteLeads: metrics?.websiteLeads || 0,
    manualLeads: metrics?.manualLeads || 0,
    postsPublished,
    articlesPublished,
    publishFailures: metrics?.publishFailures || 0,
    estimatedImpressions: postsPublished * ORGANIC_BENCHMARKS.avgImpressionsPerPost,
  };
}

// ============================================================================
// AGENTIC STRATEGY BUILDER
// Brand DNA + live grounded research + real capabilities + measured funnel.
// Every stage that can run at the same time does (Promise.all).
// ============================================================================

export interface GenerateStrategyInput {
  workspaceId: string;
  userId: string;
  leadTarget: number;
  leadType: LeadType;
  timeframeDays: number;
  targetPlatforms: string[];
  leadSources?: LeadSource[];
  articlesPerWeek?: number;
  ctaDestinations?: Record<string, string> | null;
  customGuidance?: string;
  signal?: AbortSignal;
  onProgress?: (step: string, status?: "running" | "done" | "info") => void;
}

interface BrandContext {
  name: string;
  industry: string;
  website: string;
  tone: string;
  targetAudience: string;
  missionVision: string;
  writingStyle: string;
  forbiddenWords: string[];
  hasBrandDNA: boolean;
}

function buildBrandContext(workspace: any): BrandContext {
  const dna = workspace?.brandDNA;
  return {
    name: (workspace?.name || "").trim(),
    industry: (workspace?.industry || "").trim(),
    website: (workspace?.website || "").trim(),
    tone: (dna?.tone || "").trim(),
    targetAudience: (dna?.targetAudience || "").trim(),
    missionVision: (dna?.missionVision || "").trim(),
    writingStyle: (dna?.writingStyle || "").trim(),
    forbiddenWords: Array.isArray(dna?.forbiddenWords) ? dna.forbiddenWords : [],
    hasBrandDNA: Boolean(dna),
  };
}

function brandBlock(brand: BrandContext): string {
  const lines = [
    brand.name && `Business name: ${brand.name}`,
    brand.industry && `Industry / what they do: ${brand.industry}`,
    brand.website && `Website: ${brand.website}`,
    brand.targetAudience && `Target audience: ${brand.targetAudience}`,
    brand.missionVision && `Mission: ${brand.missionVision}`,
    brand.tone && `Brand tone: ${brand.tone}`,
    brand.writingStyle && `Writing style: ${brand.writingStyle}`,
    brand.forbiddenWords.length > 0 && `Never use these words: ${brand.forbiddenWords.join(", ")}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function safeArray<T>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

function abortIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error("Strategy generation stopped by user");
    err.name = "AbortError";
    throw err;
  }
}

/** Supported formats for a platform, read from the real capability registry. */
function platformFormats(platformKey: string): { formats: string[]; mediaTypes: string[] } {
  const formats: string[] = [];
  const mediaTypes: string[] = [];
  Object.keys(PLATFORM_CAPABILITIES).forEach((capKey) => {
    if (capKey.startsWith(`${platformKey}:`)) {
      const cap = PLATFORM_CAPABILITIES[capKey];
      formats.push(cap.format);
      if (!mediaTypes.includes(cap.mediaType)) mediaTypes.push(cap.mediaType);
    }
  });
  return { formats, mediaTypes };
}

export async function generateGrowthStrategy(
  input: GenerateStrategyInput
): Promise<GrowthStrategy> {
  const {
    workspaceId,
    leadTarget,
    leadType,
    timeframeDays,
    targetPlatforms,
    customGuidance,
    signal,
    onProgress,
  } = input;

  const leadSources: LeadSource[] =
    input.leadSources && input.leadSources.length ? input.leadSources : ["SOCIAL"];
  const useSocial = leadSources.includes("SOCIAL");
  const useWebsite = leadSources.includes("WEBSITE");
  const warnings: string[] = [];

  // ── STAGE 1: read everything we know about the business (parallel) ─────────
  onProgress?.("Reading Brand DNA, connected accounts and measured results...", "running");

  const [workspace, metrics, attribution, publishHistory, timingBuckets] = await Promise.all([
    prisma.workspace
      .findUnique({
        where: { id: workspaceId },
        include: {
          brandDNA: true,
          socialAccounts: true,
          competitors: true,
        },
      })
      .catch(() => null),
    getGrowthMetrics(workspaceId, new Date(Date.now() - 90 * 86400000)),
    getAttribution(workspaceId).catch(() => ({ byPlatform: [], byPillar: [], byChannel: [] })),
    getPublishHistory(workspaceId, { status: "PUBLISHED", limit: 100 }).catch(() => []),
    getClickTimingBuckets(workspaceId).catch(() => []),
  ]);

  abortIfCancelled(signal);

  // ── learn from the workspace's own tracked data (honest, may be empty) ─────
  // Timing: real click windows per platform, falling back to the industry table
  // for any platform without enough of its own clicks yet.
  const timingByPlatform: Map<string, LearnedTiming> = learnAllBestTimes(
    targetPlatforms.map((p) => p.toLowerCase()),
    timingBuckets
  );
  const bestSpecFor = (platformKey: string) =>
    timingByPlatform.get(platformKey.toLowerCase())?.spec || getBestTimeSpec(platformKey);

  // Pillar performance + past winners as prompt signal ("" when no real data).
  const pillarBlock = pillarPerformanceBlock(attribution.byPillar);
  const historyBlock = historicalWinnersBlock(publishHistory);
  const rankedPillars = rankPillars(attribution.byPillar);
  const topPillar = rankedPillars.length ? rankedPillars[0] : null;
  if (timingByPlatform.size > 0) {
    onProgress?.(
      `Learned posting windows from your own clicks for ${timingByPlatform.size} platform${timingByPlatform.size === 1 ? "" : "s"}.`,
      "info"
    );
  }

  const brand = buildBrandContext(workspace);
  const connectedPlatforms = (workspace?.socialAccounts || []).map((a: any) =>
    String(a.platform).toLowerCase()
  );

  // We refuse to invent a business. Without a name or industry there is nothing
  // honest to build a lead strategy on.
  if (!brand.name && !brand.industry) {
    onProgress?.("No Brand DNA found — cannot build a strategy without your business details.", "info");
    return {
      targetLeads: leadTarget,
      leadType,
      timeframeDays,
      startDate: new Date().toISOString(),
      needsBrandDNA: true,
      leadSources,
      funnel: calculateLeadFunnel({
        targetLeads: leadTarget,
        leadType,
        timeframeDays,
        leadSources,
        articlesPerWeek: input.articlesPerWeek,
        measured: {
          clicks: metrics.lifetimeClicks,
          leads: metrics.lifetimeLeads,
          posts: metrics.lifetimePosts,
          isMeasured: metrics.isMeasured,
        },
      }),
      platformStrategies: [],
      contentPillars: [],
      todayPlan: [],
      weeklyPlan: [],
      decisions: [],
      recommendations: [],
      experiments: [],
      learningInsights: [],
      warnings: [
        "Add your business name, industry and Brand DNA first — the AI will not guess your business.",
      ],
    };
  }

  onProgress?.(
    brand.hasBrandDNA
      ? "Brand DNA loaded."
      : "Workspace details loaded (Brand DNA is empty — add it for sharper copy).",
    "done"
  );
  if (!brand.hasBrandDNA) {
    warnings.push("Brand DNA is empty. Tone and audience are inferred from your industry only.");
  }

  // ── STAGE 2: funnel from measured data ────────────────────────────────────
  const funnel = calculateLeadFunnel({
    targetLeads: leadTarget,
    leadType,
    timeframeDays,
    connectedPlatformCount: connectedPlatforms.length,
    leadSources,
    articlesPerWeek: input.articlesPerWeek,
    measured: {
      clicks: metrics.lifetimeClicks,
      leads: metrics.lifetimeLeads,
      posts: metrics.lifetimePosts,
      isMeasured: metrics.isMeasured,
    },
  });

  onProgress?.(
    funnel.isMeasured
      ? `Funnel from your own data: ${funnel.requiredPostsPerWeek} posts/week needed for ${leadTarget} leads.`
      : `Funnel from organic benchmarks: ${funnel.requiredPostsPerWeek} posts/week needed (switches to your data after ~20 tracked clicks).`,
    "done"
  );

  abortIfCancelled(signal);

  // ── STAGE 3: live research + generation, all in parallel ──────────────────
  onProgress?.("Researching live trends, competitors and keyword demand in parallel...", "running");

  const researchTopic = brand.industry || brand.name;
  const year = new Date().getFullYear();

  const trendsPromise = (async (): Promise<{ text: string; sources: any[] }> => {
    try {
      const res = await vertexProvider.generateWithGrounding(
        `What are buyers in "${researchTopic}" actively searching, asking and complaining about right now (${year})? List concrete pain points, buying triggers and questions. Be specific to this industry, no generic marketing advice.`,
        { modelName: MODELS.TREND_RESEARCHER, temperature: 0.3 }
      );
      return { text: (res?.text || "").slice(0, 3000), sources: safeArray(res?.sources) };
    } catch (err) {
      console.warn("[GrowthEngine] trend grounding failed:", err);
      return { text: "", sources: [] };
    }
  })();

  const competitorCacheKey = `growth:competitors:v2:${Buffer.from(researchTopic).toString("base64").slice(0, 40)}`;
  const competitorPromise = (async (): Promise<string> => {
    const cached = await cacheGet<string>(competitorCacheKey).catch(() => null);
    if (cached) return cached;
    try {
      const named = (workspace?.competitors || []).map((c: any) => c.name).filter(Boolean);
      const res = await vertexProvider.generateWithGrounding(
        `Analyse how the leading players in "${researchTopic}" market on social media in ${year}${named.length ? ` (specifically: ${named.join(", ")})` : ""}. What content are they publishing, and what content gap is left open? Be concrete.`,
        { modelName: MODELS.COMPETITOR_ANALYST, temperature: 0.3 }
      );
      const text = (res?.text || "").slice(0, 2000);
      if (text) await cacheSet(competitorCacheKey, text, 86400).catch(() => null);
      return text;
    } catch (err) {
      console.warn("[GrowthEngine] competitor grounding failed:", err);
      return "";
    }
  })();

  const keywordPromise = (async (): Promise<
    { keyword: string; searchIntent: string; title: string; why: string }[]
  > => {
    if (!useWebsite) return [];
    try {
      const { fetchLiveTrendingNews } = await import("@/actions/trends");
      const trending = await fetchLiveTrendingNews(researchTopic, 8).catch(() => null);
      const headlines = safeArray<any>(trending?.trends)
        .map((t) => t.title)
        .filter(Boolean)
        .slice(0, 8);

      const res = await vertexProvider.generateJSON(
        [
          {
            role: "user",
            content: `You are an SEO strategist. Pick article keywords that will bring BUYERS (not just readers) to this business's website.

${brandBlock(brand)}

Live headlines in this space right now:
${headlines.length ? headlines.map((h, i) => `${i + 1}. ${h}`).join("\n") : "(none available)"}

Rules:
- Every keyword must be something a potential customer of THIS business would search.
- Mix 2 trending/timely keywords with commercial-intent keywords.
- Long-tail (3-6 words) so a new site can realistically rank.
- No keyword about a topic this business does not serve.

Return JSON only:
{"keywords":[{"keyword":"...","searchIntent":"informational|commercial|transactional","title":"proposed article title","why":"why this brings leads for this business"}]}
Return between ${Math.max(2, input.articlesPerWeek || 2)} and 8 keywords.`,
          },
        ],
        { modelName: MODELS.TREND_RESEARCHER, temperature: 0.4 }
      );

      return safeArray<any>(res?.keywords)
        .filter((k) => k?.keyword)
        .map((k) => ({
          keyword: String(k.keyword).slice(0, 120),
          searchIntent: String(k.searchIntent || "informational"),
          title: String(k.title || k.keyword).slice(0, 160),
          why: String(k.why || "").slice(0, 300),
        }));
    } catch (err) {
      console.warn("[GrowthEngine] keyword research failed:", err);
      return [];
    }
  })();

  const [trendRes, competitorInsights, articleKeywords] = await Promise.all([
    trendsPromise,
    competitorPromise,
    keywordPromise,
  ]);

  abortIfCancelled(signal);
  onProgress?.(
    `Research done — ${trendRes.sources.length} live sources${useWebsite ? `, ${articleKeywords.length} keyword opportunities` : ""}.`,
    "done"
  );

  const researchBlock = [
    trendRes.text && `LIVE MARKET RESEARCH:\n${trendRes.text}`,
    competitorInsights && `COMPETITOR LANDSCAPE:\n${competitorInsights}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // ── STAGE 4: pillars + platform roles + growth intelligence, in parallel ──
  onProgress?.("Generating content pillars, channel roles and growth intelligence in parallel...", "running");

  const capabilityBlock = targetPlatforms
    .map((pl) => {
      const key = pl.toLowerCase();
      const { formats } = platformFormats(key);
      const spec = bestSpecFor(key);
      return `- ${pl}: formats [${(formats.length ? formats : ["Feed"]).join(", ")}], best window ${spec.label} (${spec.reason}), caption link clickable: ${isCaptionLinkClickable(key) ? "yes" : "no (bio link only)"}, connected: ${connectedPlatforms.includes(key) ? "yes" : "no"}`;
    })
    .join("\n");

  const goalBlock = `LEAD GOAL: ${leadTarget} ${leadType.replace(/_/g, " ").toLowerCase()} in ${timeframeDays} days (${funnel.requiredDailyPace}/day).
FUNNEL REQUIREMENT: ~${funnel.requiredPostsPerWeek} social posts/week${useWebsite ? ` plus ${funnel.requiredArticlesPerWeek} SEO articles/week` : ""}.
DATA BASIS: ${funnel.dataSourceSummary}
LEAD SOURCES: ${leadSources.join(" + ")}`;

  const pillarsPromise = (async (): Promise<ContentPillar[]> => {
    try {
      const res = await vertexProvider.generateJSON(
        [
          {
            role: "user",
            content: `You are a lead-generation content strategist. Design the content pillars that will actually produce leads for this specific business.

${brandBlock(brand)}

${goalBlock}

${researchBlock || "(no external research available — use the business details only)"}

${pillarBlock ? `${pillarBlock}\n\n` : ""}${historyBlock ? `${historyBlock}\n\n` : ""}AVAILABLE CHANNELS:
${capabilityBlock}

Rules:
- 3 to 5 pillars. Allocation percentages must sum to 100.
- Each pillar must map to a real buying stage and a real reason it generates leads for THIS business.
- Every CTA must use the exact placeholder ${LINK_PLACEHOLDER} where the link goes (a tracked link is substituted later). Never write a literal URL.
- exampleHook must be specific to this business, not a template.
- Only use platforms from the available channel list.

Return JSON only:
{"pillars":[{"name":"...","purpose":"...","audienceStage":"Top of Funnel (Awareness)|Middle of Funnel (Consideration)|Bottom of Funnel (Decision)","allocationPercentage":30,"targetPlatforms":["..."],"recommendedFormats":["..."],"cta":"... ${LINK_PLACEHOLDER}","leadGenerationRole":"...","exampleHook":"...","targetPainPoints":["..."]}]}`,
          },
        ],
        { modelName: MODELS.ORCHESTRATOR, temperature: 0.5 }
      );

      const pillars = safeArray<any>(res?.pillars)
        .filter((p) => p?.name)
        .slice(0, 5)
        .map((p, i) => ({
          id: `pillar-${i + 1}-${String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}`,
          name: String(p.name).slice(0, 90),
          purpose: String(p.purpose || "").slice(0, 400),
          audienceStage: String(p.audienceStage || "Middle of Funnel (Consideration)"),
          allocationPercentage: Number(p.allocationPercentage) || 0,
          targetPlatforms: safeArray<string>(p.targetPlatforms).filter((x) =>
            targetPlatforms.some((tp) => tp.toLowerCase() === String(x).toLowerCase())
          ),
          recommendedFormats: safeArray<string>(p.recommendedFormats),
          cta: String(p.cta || `Learn more: ${LINK_PLACEHOLDER}`),
          leadGenerationRole: String(p.leadGenerationRole || "").slice(0, 300),
          exampleHook: String(p.exampleHook || "").slice(0, 250),
          targetPainPoints: safeArray<string>(p.targetPainPoints),
        })) as ContentPillar[];

      // Normalise allocation to exactly 100
      const total = pillars.reduce((s, p) => s + (p.allocationPercentage || 0), 0);
      if (pillars.length && (total < 95 || total > 105)) {
        const even = Math.floor(100 / pillars.length);
        pillars.forEach((p, i) => {
          p.allocationPercentage = i === pillars.length - 1 ? 100 - even * (pillars.length - 1) : even;
        });
      }

      return pillars;
    } catch (err) {
      console.warn("[GrowthEngine] pillar generation failed:", err);
      return [];
    }
  })();

  const platformPromise = (async (): Promise<PlatformStrategyItem[]> => {
    try {
      const res = await vertexProvider.generateJSON(
        [
          {
            role: "user",
            content: `You are a channel strategist. Allocate this business's weekly posting budget across its channels to maximise leads.

${brandBlock(brand)}

${goalBlock}

${researchBlock || ""}

CHANNELS (use exactly these names):
${capabilityBlock}

Rules:
- postsPerWeek across all channels should total roughly ${funnel.requiredPostsPerWeek}.
- Give more volume to the channel where THIS business's buyers actually are — justify it from the business details, not generic platform trivia.
- role and reason must reference this specific business/audience.
- funnelStage: AWARENESS | CONSIDERATION | CONVERSION | RETENTION.

Return JSON only:
{"platforms":[{"platform":"...","role":"...","leadPotential":"HIGH|MEDIUM|LOW","priority":"HIGH|MEDIUM|LOW","postsPerWeek":3,"funnelStage":"CONVERSION","reason":"...","primaryCTA":"..."}]}`,
          },
        ],
        { modelName: MODELS.ORCHESTRATOR, temperature: 0.4 }
      );
      return safeArray<any>(res?.platforms);
    } catch (err) {
      console.warn("[GrowthEngine] platform strategy generation failed:", err);
      return [];
    }
  })();

  const intelPromise = (async () => {
    try {
      const res = await vertexProvider.generateJSON(
        [
          {
            role: "user",
            content: `You are the growth analyst for this business. Explain the decisions behind this plan and what to test next. Ground everything in the numbers given — never invent a metric.

${brandBlock(brand)}

${goalBlock}

MEASURED SO FAR (last 90 days): ${metrics.lifetimePosts} items published, ${metrics.lifetimeClicks} tracked link clicks, ${metrics.lifetimeLeads} confirmed leads.
${pillarBlock ? `${pillarBlock}\n` : ""}${researchBlock || ""}

Rules:
- If a number is not in the data above, do NOT state a number. Say what will be measured instead.
- decisions = what this plan changes and why. recommendations = what the user could do next.
- experiments = concrete A/B tests for hooks, CTAs, formats or timing.
- insights = what the data so far actually shows (say "not enough data yet" when it does not).

Return JSON only:
{"decisions":[{"title":"...","action":"...","reason":"...","data":"...","expectedImpact":"..."}],
 "recommendations":[{"title":"...","description":"...","why":"...","data":"...","expectedImpact":"...","type":"OPPORTUNITY|OPTIMIZATION|WARNING|CADENCE_CHANGE|CHANNEL_SHIFT|CTA_REFINEMENT","actionType":"INCREASE_CADENCE|PAUSE_PLATFORM|SHIFT_PILLAR|UPDATE_CTA|CUSTOM"}],
 "experiments":[{"name":"...","type":"HOOK|CTA|FORMAT|POSTING_TIME|PILLAR","hypothesis":"...","metric":"..."}],
 "insights":[{"observation":"...","conclusion":"...","nextAction":"..."}]}`,
          },
        ],
        { modelName: MODELS.CEO_SUPERVISOR, temperature: 0.4 }
      );
      return res || {};
    } catch (err) {
      console.warn("[GrowthEngine] growth intelligence generation failed:", err);
      return {};
    }
  })();

  const [generatedPillars, generatedPlatforms, intel] = await Promise.all([
    pillarsPromise,
    platformPromise,
    intelPromise,
  ]);

  abortIfCancelled(signal);

  const contentPillars: ContentPillar[] = generatedPillars;
  if (contentPillars.length === 0) {
    warnings.push(
      "Content pillars could not be generated right now (AI service error). Press Rebuild Plan to try again."
    );
  }
  onProgress?.(`${contentPillars.length} content pillars ready.`, "done");

  // ── merge generated channel roles with real capability data ───────────────
  const platformStrategies: PlatformStrategyItem[] = targetPlatforms.map((pl) => {
    const key = pl.toLowerCase();
    const gen =
      generatedPlatforms.find((g: any) => String(g?.platform || "").toLowerCase() === key) || {};
    const isConnected = connectedPlatforms.includes(key);
    const { formats, mediaTypes } = platformFormats(key);
    const spec = bestSpecFor(key);

    const postsPerWeek = Math.max(
      1,
      Math.min(14, Number((gen as any).postsPerWeek) || Math.ceil(funnel.requiredPostsPerWeek / Math.max(1, targetPlatforms.length)))
    );

    const isDirect = key !== "pinterest";
    const capabilityNotice = isDirect
      ? isConnected
        ? `Connected — autopilot publishes directly at ${spec.label}.`
        : "Account not connected — posts are created and held as approved drafts until you connect it."
      : "Pinterest uses a manual export workflow by official API design.";

    return {
      platform: pl,
      role: String((gen as any).role || "").slice(0, 160) || `Organic lead channel for ${brand.name || "your business"}`,
      leadPotential: (["HIGH", "MEDIUM", "LOW"].includes((gen as any).leadPotential)
        ? (gen as any).leadPotential
        : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
      recommendedFrequency: `${postsPerWeek} posts/week`,
      postsPerWeek,
      priority: (["HIGH", "MEDIUM", "LOW"].includes((gen as any).priority)
        ? (gen as any).priority
        : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
      confidence: isConnected ? 90 : 70,
      supportedFormats: formats.length > 0 ? formats : ["Feed"],
      supportedMedia: mediaTypes.length > 0 ? mediaTypes : ["image"],
      capabilityNotice,
      status: isConnected || !isDirect ? "ACTIVE" : "UNAVAILABLE",
      recommendedFormats: safeArray<string>((gen as any).recommendedFormats),
      primaryCTA: (gen as any).primaryCTA ? String((gen as any).primaryCTA) : undefined,
      funnelStage: (["AWARENESS", "CONSIDERATION", "CONVERSION", "RETENTION"].includes(
        (gen as any).funnelStage
      )
        ? (gen as any).funnelStage
        : undefined) as any,
      reason: String((gen as any).reason || "").slice(0, 400) || `Selected because you chose ${pl} for this goal.`,
    };
  });

  // ── STAGE 5: the actual 7-day calendar (needs pillars + channel weights) ──
  onProgress?.("Building the 7-day publishing calendar...", "running");

  const activePlatforms = platformStrategies
    .filter((p) => p.status === "ACTIVE")
    .map((p) => p.platform);
  const schedulablePlatforms = (useSocial ? (activePlatforms.length ? activePlatforms : targetPlatforms) : []).slice(0, 7);

  let weeklyPlan: GrowthPlanTask[] = [];

  if (useSocial && contentPillars.length > 0 && schedulablePlatforms.length > 0) {
    try {
      const res = await vertexProvider.generateJSON(
        [
          {
            role: "user",
            content: `Create the next 7 days of lead-generating posts for this business.

${brandBlock(brand)}

${goalBlock}

CONTENT PILLARS (respect the allocation %):
${contentPillars
  .map(
    (p) =>
      `- ${p.name} (${p.allocationPercentage}%, ${p.audienceStage}) — ${p.purpose} | formats: ${(p.recommendedFormats || []).join(", ") || "any"}`
  )
  .join("\n")}

CHANNEL BUDGET (posts per week):
${platformStrategies
  .filter((p) => schedulablePlatforms.includes(p.platform))
  .map((p) => `- ${p.platform}: ${p.postsPerWeek}/week, formats [${(p.supportedFormats || []).join(", ")}]`)
  .join("\n")}

${researchBlock || ""}

${historyBlock ? `${historyBlock}\n\n` : ""}Rules:
- dayOffset 0 = today, up to 6.
- Total tasks must match the channel budget (about ${funnel.requiredPostsPerWeek} for the week).
- Use only the listed platforms, and only formats listed for that platform.
- Every topic and hook must be specific to THIS business. No generic marketing filler.
- Every cta must contain the exact placeholder ${LINK_PLACEHOLDER} (a tracked link replaces it).
- reason = why this post, this platform, this day, for the lead goal.
- mediaType: image | video | carousel | document | text.

Return JSON only:
{"tasks":[{"dayOffset":0,"platform":"...","format":"...","pillarName":"...","topic":"...","hook":"...","cta":"... ${LINK_PLACEHOLDER}","leadGoalRole":"...","reason":"...","mediaType":"image"}]}`,
          },
        ],
        { modelName: MODELS.CONTENT_CREATOR, temperature: 0.6 }
      );

      const now = Date.now();
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      weeklyPlan = safeArray<any>(res?.tasks)
        .filter((t) => t?.platform && t?.topic)
        .slice(0, 30)
        .map((t, i) => {
          const platform =
            schedulablePlatforms.find((p) => p.toLowerCase() === String(t.platform).toLowerCase()) ||
            schedulablePlatforms[i % schedulablePlatforms.length];
          const offset = Math.max(0, Math.min(6, Number(t.dayOffset) || 0));
          const date = new Date(now + offset * 86400000);
          const spec = bestSpecFor(platform.toLowerCase());
          date.setHours(spec.hour, spec.minute, 0, 0);
          const pillar = contentPillars.find(
            (p) => p.name.toLowerCase() === String(t.pillarName || "").toLowerCase()
          );

          return {
            id: `task-${offset}-${i}-${now}`,
            date: date.toISOString(),
            time: spec.label,
            day: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : dayNames[date.getDay()],
            platform,
            format: String(t.format || "Feed"),
            topic: String(t.topic).slice(0, 220),
            hook: String(t.hook || "").slice(0, 300),
            cta: String(t.cta || pillar?.cta || `${LINK_PLACEHOLDER}`),
            leadGoalRole: String(t.leadGoalRole || pillar?.leadGenerationRole || "Lead generation").slice(0, 200),
            status: "DRAFT" as const,
            reason: String(t.reason || "").slice(0, 400),
            mediaType: (["image", "video", "carousel", "document", "text"].includes(t.mediaType)
              ? t.mediaType
              : "image") as any,
            channel: "SOCIAL" as const,
            pillarId: pillar?.id,
          };
        });
    } catch (err) {
      console.warn("[GrowthEngine] calendar generation failed:", err);
      warnings.push("The 7-day calendar could not be generated right now. Press Rebuild Plan to retry.");
    }
  }

  // ── article tasks from the researched keywords ────────────────────────────
  if (useWebsite && articleKeywords.length > 0) {
    const perWeek = Math.max(1, funnel.requiredArticlesPerWeek || 2);
    const spacing = Math.max(1, Math.floor(7 / perWeek));
    const now = Date.now();

    articleKeywords.slice(0, perWeek).forEach((kw, i) => {
      const date = new Date(now + i * spacing * 86400000);
      date.setHours(10, 0, 0, 0);
      weeklyPlan.push({
        id: `task-article-${i}-${now}`,
        date: date.toISOString(),
        time: "10:00 AM",
        day: i === 0 ? "Today" : new Date(date).toLocaleDateString("en-US", { weekday: "long" }),
        platform: "Website",
        format: "SEO Article",
        topic: kw.title,
        hook: kw.why || `Targets the search "${kw.keyword}"`,
        cta: `Read more and get in touch: ${LINK_PLACEHOLDER}`,
        leadGoalRole: "Search-intent lead capture (compounding)",
        status: "DRAFT",
        reason:
          kw.why ||
          `Long-tail keyword with ${kw.searchIntent} intent — reachable for a newer site and relevant to your offer.`,
        mediaType: "text",
        channel: "WEBSITE",
        keyword: kw.keyword,
        searchIntent: kw.searchIntent,
      });
    });
  }

  weeklyPlan.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

  const todayKey = new Date().toDateString();
  const todayPlan = weeklyPlan.filter(
    (t) => new Date(t.date || 0).toDateString() === todayKey
  );

  onProgress?.(
    `Calendar ready — ${weeklyPlan.length} items this week, ${todayPlan.length} for today.`,
    "done"
  );

  // ── map generated intelligence into typed shapes ──────────────────────────
  const stamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const decisions: DecisionItem[] = safeArray<any>((intel as any).decisions)
    .filter((d) => d?.action || d?.title)
    .slice(0, 6)
    .map((d, i) => ({
      id: `dec-${Date.now()}-${i}`,
      date: stamp,
      title: d.title ? String(d.title).slice(0, 140) : undefined,
      action: String(d.action || d.title).slice(0, 400),
      reason: String(d.reason || "").slice(0, 500),
      data: d.data ? String(d.data).slice(0, 300) : undefined,
      expectedImpact: String(d.expectedImpact || "").slice(0, 300),
      status: "APPLIED",
    }));

  const recommendations: GrowthRecommendation[] = safeArray<any>((intel as any).recommendations)
    .filter((r) => r?.title)
    .slice(0, 6)
    .map((r, i) => ({
      id: `rec-${Date.now()}-${i}`,
      title: String(r.title).slice(0, 140),
      description: String(r.description || "").slice(0, 400),
      why: String(r.why || "").slice(0, 400),
      data: r.data ? String(r.data).slice(0, 300) : undefined,
      expectedImpact: String(r.expectedImpact || "").slice(0, 300),
      type: (r.type || "OPPORTUNITY") as GrowthRecommendation["type"],
      actionType: (r.actionType || "CUSTOM") as GrowthRecommendation["actionType"],
      applied: false,
    }));

  const experiments: ExperimentItem[] = safeArray<any>((intel as any).experiments)
    .filter((e) => e?.name && e?.hypothesis)
    .slice(0, 6)
    .map((e, i) => ({
      id: `exp-${Date.now()}-${i}`,
      name: String(e.name).slice(0, 140),
      type: (["HOOK", "CTA", "FORMAT", "POSTING_TIME", "PILLAR"].includes(e.type) ? e.type : "HOOK") as any,
      hypothesis: String(e.hypothesis).slice(0, 400),
      status: "PLANNED",
      metric: String(e.metric || "Confirmed leads").slice(0, 120),
      sampleSize: 0,
    }));

  // Settle the experiments we can actually measure from data already in hand:
  // POSTING_TIME from the learned click windows, PILLAR from attribution. The
  // rest stay PLANNED — no per-variant tracking exists to fake an outcome from.
  const closedExperiments = closeMeasuredExperiments(experiments, {
    timingByPlatform,
    topPillar,
  });

  const learningInsights = safeArray<any>((intel as any).insights)
    .filter((l) => l?.observation)
    .slice(0, 6)
    .map((l) => ({
      observation: String(l.observation).slice(0, 400),
      conclusion: String(l.conclusion || "").slice(0, 400),
      nextAction: String(l.nextAction || "").slice(0, 400),
    }));

  // ── which platforms still have no CTA destination? ────────────────────────
  const destinations = input.ctaDestinations || {};
  const needsDestinationFor = brand.website
    ? []
    : targetPlatforms.filter((pl) => {
        const key = pl.toLowerCase();
        return !destinations[key] && !destinations[pl] && !destinations.default;
      });

  if (needsDestinationFor.length > 0) {
    warnings.push(
      `No CTA link set for: ${needsDestinationFor.join(", ")}. Add a destination link in the Goal tab or these posts cannot generate trackable leads.`
    );
  }

  onProgress?.("Growth strategy finalised.", "done");

  return {
    targetLeads: leadTarget,
    leadType,
    timeframeDays,
    startDate: new Date().toISOString(),
    targetPlatforms,
    leadSources,
    articlesPerWeek: funnel.requiredArticlesPerWeek,
    funnel,
    platformStrategies,
    contentPillars,
    todayPlan,
    weeklyPlan,
    decisions,
    recommendations,
    experiments: closedExperiments,
    learningInsights,
    warnings: warnings.length ? warnings : undefined,
    needsDestinationFor: needsDestinationFor.length ? needsDestinationFor : undefined,
    research: {
      trends: trendRes.text || undefined,
      competitors: competitorInsights || undefined,
      trendSources: trendRes.sources
        .slice(0, 8)
        .map((s: any) => ({ title: s?.title || s?.web?.title, url: s?.uri || s?.url || s?.web?.uri }))
        .filter((s: any) => s.url),
    },
    dataSources: {
      brandDNASynced: brand.hasBrandDNA,
      analyzedPostsCount: metrics.lifetimePosts,
      trackedLeadsCount: metrics.lifetimeLeads,
      connectedPlatformsCount: connectedPlatforms.length,
      trendSourcesCount: trendRes.sources.length,
      competitorSourcesCount: competitorInsights ? 1 : 0,
      historicalPeriod: metrics.lifetimePosts > 0 ? "Last 90 days (measured)" : "No published history yet",
      isBenchmarkFallback: funnel.isBenchmarkFallback,
    },
  };
}
