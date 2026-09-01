// ============================================================================
// PURE GROWTH ENGINE TYPES & CLIENT-SAFE MATHEMATICAL VALIDATION
// ============================================================================

export type LeadType =
  | "QUALIFIED_LEADS"
  | "LEADS"
  | "WEBSITE_INQUIRIES"
  | "CONTACT_FORM"
  | "WHATSAPP"
  | "BOOKINGS"
  | "CUSTOM";

export type AutopilotMode = "MANUAL" | "ASSISTED" | "AUTOPILOT";

/** Where the user expects leads to come from. */
export type LeadSource = "SOCIAL" | "WEBSITE";

/** Social posts vs. SEO articles on the user's own website. */
export type LeadChannel = "SOCIAL" | "WEBSITE";

/**
 * Search engines take weeks to index and rank a new article, so a website lead
 * source cannot contribute inside the first few weeks of a goal. This is used
 * by the feasibility check so the promise we make to the user is honest.
 */
export const SEO_RAMP_UP_DAYS = 21;

export type GoalStatus =
  | "ON_TRACK"
  | "NEEDS_OPTIMIZATION"
  | "BEHIND_TARGET"
  | "INSUFFICIENT_DATA"
  | "GOAL_ACHIEVED";

export interface AutopilotPermissions {
  createContent: boolean;
  generateVisuals: boolean;
  schedule: boolean;
  autoPublish: boolean;
  autoModifyStrategy: boolean;
}

export interface FunnelCalculation {
  targetLeads: number;
  leadType: string;
  qualificationRate: number; // e.g. 0.35 for qualified leads
  requiredConversions: number;
  organicCVR: number; // Click/Profile visit -> Conversion (e.g. 0.021 = 2.1%)
  requiredProfileVisits: number;
  engagementCTR: number; // Impression -> Click/Profile Visit (e.g. 0.048 = 4.8%)
  requiredImpressions: number;
  avgImpressionsPerPost: number;
  requiredTotalPosts: number;
  requiredPostsPerWeek: number;
  requiredDailyPace: number;
  isBenchmarkFallback: boolean;
  assumptions: string[];
  dataSourceSummary: string;

  // ── measured mode ─────────────────────────────────────────────────────────
  /** True when the numbers below come from this workspace's own tracked data. */
  isMeasured?: boolean;
  /** Real LinkClick count used to derive the rates. */
  measuredClicks?: number;
  /** Real confirmed LeadEvent count used to derive the rates. */
  measuredLeads?: number;
  /** Real PublishLog count used to derive clicks-per-post. */
  measuredPosts?: number;
  /** Measured leads ÷ clicks (only set in measured mode). */
  leadsPerClick?: number;
  /** Measured clicks ÷ published posts (only set in measured mode). */
  clicksPerPost?: number;
  /** Posts needed per day, rounded up for scheduling. */
  requiredPostsPerDay?: number;
  /** SEO articles per week when Website is a lead source. */
  requiredArticlesPerWeek?: number;
  /** Which sources this funnel was calculated for. */
  leadSources?: LeadSource[];
}

export interface PlatformStrategyItem {
  platform: string;
  role: string;
  leadPotential: "HIGH" | "MEDIUM" | "LOW";
  recommendedFrequency: string;
  postsPerWeek: number;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  confidence?: number;
  supportedFormats?: string[];
  supportedMedia?: string[];
  capabilityNotice?: string;
  status?: "ACTIVE" | "PAUSED" | "UNAVAILABLE";
  attributionData?: {
    clicks: number;
    leads: number;
    conversionRate: string;
  };
  recommendedFormats?: string[];
  primaryCTA?: string;
  secondaryCTA?: string;
  reason: string;
  funnelStage?: "AWARENESS" | "CONSIDERATION" | "CONVERSION" | "RETENTION";
}

export interface ContentPillar {
  id: string;
  name: string;
  purpose: string;
  leadGenerationRole: string;
  allocationPercentage: number;
  targetPainPoints?: string[];
  targetPlatforms?: string[];
  recommendedFormats?: string[];
  cta?: string;
  exampleHook?: string;
  audienceStage: string;
}

export interface GrowthPlanTask {
  id: string;
  day: string;
  time: string;
  platform: string;
  format: string;
  topic: string;
  hook: string;
  angle?: string;
  cta?: string;
  leadGoalRole: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "DRAFT" | "GENERATING" | "FAILED" | "REJECTED";
  reason?: string;
  date?: string;
  postId?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "carousel" | "document" | "text";

  /** SOCIAL = post on a connected platform, WEBSITE = SEO article on the user's site. */
  channel?: LeadChannel;
  /** Article tasks only: the keyword the AI chose to target. */
  keyword?: string;
  /** Article tasks only: search intent the keyword serves. */
  searchIntent?: string;
  /** Content pillar this task fulfils. */
  pillarId?: string;
  /** Tracked short link put into the caption / article CTA. */
  shortUrl?: string;
  /** Real URL of the published post/article, when the platform returned one. */
  liveUrl?: string;
  /** Set when no CTA destination is configured, so the UI can ask for a link. */
  needsDestination?: boolean;
  /** Last execution error, surfaced next to a Retry button. */
  error?: string;
}

/** One permanent row of "aaj maine ye post is platform par ki". */
export interface PublishHistoryItem {
  id: string;
  channel: LeadChannel;
  platform: string;
  format?: string | null;
  status: "PUBLISHED" | "FAILED" | string;
  liveUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  excerpt: string;
  topic?: string | null;
  keyword?: string | null;
  error?: string | null;
  publishedAt: string;
  postId?: string | null;
  /** Real clicks measured on this item's tracked link. */
  clicks: number;
  /** Confirmed leads attributed to this item. */
  leads: number;
  shortUrl?: string | null;
  isAutopilot?: boolean;
}

export interface LeadEventItem {
  id: string;
  source: "MANUAL" | "WEBSITE_TAG" | "LINK_CLICK_CONFIRMED" | string;
  channel: LeadChannel;
  platform?: string | null;
  action?: string | null;
  leadType: string;
  contactName?: string | null;
  contactInfo?: string | null;
  value?: number | null;
  note?: string | null;
  status: "NEW" | "CONFIRMED" | "QUALIFIED" | "WON" | "LOST" | string;
  occurredAt: string;
  postId?: string | null;
  /** Excerpt of the post/article credited with this lead, when known. */
  attributedTo?: string | null;
}

/** State of the website lead-capture tag for the Goal tab. */
export interface TrackingStatus {
  installed: boolean;
  trackingKey: string | null;
  domain: string | null;
  verifiedAt: string | null;
  snippet: string;
  leadsCaptured: number;
  /** True when installed but nothing has been seen for a while. */
  stale: boolean;
}

export interface ExperimentItem {
  id: string;
  name: string;
  hypothesis: string;
  variableTested?: string;
  type?: "HOOK" | "CTA" | "FORMAT" | "POSTING_TIME" | "PILLAR";
  status: "ACTIVE" | "COMPLETED" | "PLANNED" | "RUNNING";
  metric: string;
  winner?: string;
  impact?: string;
  sampleSize?: number;
}

export interface DecisionItem {
  id: string;
  date: string;
  action: string;
  reason: string;
  data?: string;
  expectedImpact: string;
  status: "APPLIED" | "PENDING" | "REVERTED" | "PENDING_REVIEW" | "REJECTED";
  title?: string;
}

export interface LearningInsight {
  observation: string;
  conclusion: string;
  nextAction: string;
}

export interface GrowthRecommendation {
  id: string;
  title: string;
  description: string;
  why: string;
  data?: string;
  expectedImpact: string;
  type: "CHANNEL_SHIFT" | "CADENCE_CHANGE" | "HOOK_OPTIMIZATION" | "CTA_REFINEMENT" | "RECALCULATION" | "ALERT" | "OPPORTUNITY" | "OPTIMIZATION" | "WARNING";
  actionType?: "INCREASE_CADENCE" | "PAUSE_PLATFORM" | "SHIFT_PILLAR" | "UPDATE_CTA" | "CUSTOM";
  applied: boolean;
}

export interface GrowthStrategy {
  id?: string;
  workspaceId?: string;
  targetLeads: number;
  leadType: LeadType | string;
  timeframeDays: number;
  startDate?: string;
  targetPlatforms?: string[];
  autopilotMode?: AutopilotMode;
  funnel: FunnelCalculation;
  platformStrategies: PlatformStrategyItem[];
  contentPillars: ContentPillar[];
  todayPlan: GrowthPlanTask[];
  weeklyPlan: GrowthPlanTask[];
  experiments: ExperimentItem[];
  decisions: DecisionItem[];
  learningInsights: LearningInsight[];
  recommendations: GrowthRecommendation[];
  dataSources?: {
    brandDNASynced: boolean;
    analyzedPostsCount: number;
    trackedLeadsCount: number;
    connectedPlatformsCount: number;
    trendSourcesCount: number;
    competitorSourcesCount: number;
    historicalPeriod: string;
    isBenchmarkFallback: boolean;
  };
  recoveryPlan?: {
    isNeeded: boolean;
    bottlenecks: string[];
    recoverySteps: string[];
  };
  /** True when there is no Brand DNA to work from — the UI asks for it instead
   *  of the engine inventing a business. */
  needsBrandDNA?: boolean;
  /** Anything the user must know about how this strategy was built (e.g. a
   *  generation step failed and a structural fallback was used). */
  warnings?: string[];
  /** Platforms in the plan that have no CTA destination configured yet. */
  needsDestinationFor?: string[];
  leadSources?: LeadSource[];
  articlesPerWeek?: number;
  /** Grounded research actually used to build this strategy (not discarded). */
  research?: {
    trends?: string;
    competitors?: string;
    trendSources?: { title?: string; url?: string }[];
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface GrowthKPIs {
  targetLeads: number;
  achievedLeads: number;
  remainingLeads: number;
  daysTotal: number;
  daysElapsed: number;
  daysLeft: number;
  currentPace: number;
  requiredPace: number;
  projectedResult: number;
  progressPercentage: number;
  status: GoalStatus;
  statusReason: string;

  // ── measured breakdown (all counted from real rows) ────────────────────────
  /** Real clicks on tracked links inside the goal window. */
  clicks?: number;
  /** Unique visitors among those clicks. */
  uniqueClicks?: number;
  /** Confirmed leads that came through social posts. */
  socialLeads?: number;
  /** Confirmed leads captured by the website tag. */
  websiteLeads?: number;
  /** Manually confirmed leads ("Lead aaya" button). */
  manualLeads?: number;
  /** Social posts published inside the window (PublishLog). */
  postsPublished?: number;
  /** Articles published inside the window (PublishLog, channel WEBSITE). */
  articlesPublished?: number;
  /** Failed publish attempts inside the window. */
  publishFailures?: number;
  /**
   * Reach is not returned by the platform APIs we use, so it is always an
   * estimate and the UI must label it as one.
   */
  estimatedImpressions?: number;
}

export interface GoalFeasibilityResult {
  isFeasible: boolean;
  feasibilityLevel: "REALISTIC" | "MODERATE" | "HIGHLY_AGGRESSIVE";
  requestedLeads?: number;
  timeframeDays?: number;
  dailyPaceRequested: number;
  dailyPaceRealistic?: number;
  estimatedRealisticMin: number;
  estimatedRealisticMax: number;
  recommendedTarget: number;
  explanation: string;
  /** Honest split of where the estimate comes from. */
  sourceBreakdown?: {
    socialMin: number;
    socialMax: number;
    websiteMin: number;
    websiteMax: number;
    /** Days of the timeframe during which SEO articles can realistically rank. */
    websiteEffectiveDays: number;
  };
  /** Extra caveats the UI must show verbatim (e.g. SEO indexing delay). */
  notes?: string[];
  assumptions: {
    estAvgReachPerPost: number;
    estOrganicCTR: number;
    estOrganicCVR: number;
    estQualificationRate: number;
  } | string[];
}

/**
 * Validates whether a given organic lead target is realistically achievable
 * Pure client-safe function based on industry empirical organic benchmarks
 */
export function validateGoalFeasibility(input: {
  leadTarget: number;
  timeframeDays: number;
  leadType?: LeadType | string;
  channelCount?: number;
  historicalPosts?: any[];
  leadSources?: LeadSource[];
  articlesPerWeek?: number;
}): GoalFeasibilityResult {
  const target = Math.max(1, input.leadTarget);
  const days = Math.max(1, input.timeframeDays);
  const channels = Math.max(1, input.channelCount || 4);
  const leadType = input.leadType || "QUALIFIED_LEADS";
  const sources: LeadSource[] =
    input.leadSources && input.leadSources.length ? input.leadSources : ["SOCIAL"];
  const useSocial = sources.includes("SOCIAL");
  const useWebsite = sources.includes("WEBSITE");

  const dailyPace = Number((target / days).toFixed(2));

  // Organic reach capacity per channel per day for organic accounts (non-paid)
  const estPostsPerDay = channels >= 4 ? 2.5 : 1.5;
  const estAvgReachPerPost = 850; // Conservative organic reach per high-value post
  const estDailyOrganicReach = estPostsPerDay * estAvgReachPerPost;

  // Organic engagement and click-through rates (CTR to bio / landing link)
  const estOrganicCTR = 0.048; // 4.8% profile / link visit rate
  // Conversion rate (visitor to lead inquiry)
  const estOrganicCVR = 0.021; // 2.1% conversion rate
  // Qualification rate for high-intent B2B
  const estQualRate = leadType === "QUALIFIED_LEADS" ? 0.35 : 0.85;

  // Daily realistic capacity
  const maxDailyRealistic = estDailyOrganicReach * estOrganicCTR * estOrganicCVR * estQualRate;
  const minDailyRealistic = maxDailyRealistic * 0.45;

  const socialMin = useSocial ? Math.round(minDailyRealistic * days) : 0;
  const socialMax = useSocial ? Math.round(maxDailyRealistic * days * 1.6) : 0;

  // ── SEO article capacity ──────────────────────────────────────────────────
  // A new article needs roughly SEO_RAMP_UP_DAYS before it can bring search
  // traffic, so only the days after that count. This is why a 7-day goal gets
  // almost nothing from the website source, and we say so instead of pretending.
  const articlesPerWeek = Math.max(1, input.articlesPerWeek || 2);
  const websiteEffectiveDays = useWebsite ? Math.max(0, days - SEO_RAMP_UP_DAYS) : 0;
  const rankedArticles = Math.floor((articlesPerWeek * websiteEffectiveDays) / 7);
  // Conservative: a ranking long-tail article brings ~25-90 visits/month and
  // converts at the same organic CVR.
  const websiteMin = useWebsite
    ? Math.round(rankedArticles * ((25 / 30) * websiteEffectiveDays * estOrganicCVR * estQualRate))
    : 0;
  const websiteMax = useWebsite
    ? Math.round(rankedArticles * ((90 / 30) * websiteEffectiveDays * estOrganicCVR * estQualRate))
    : 0;

  const totalMinRealistic = Math.max(useSocial ? 5 : 1, socialMin + websiteMin);
  const totalMaxRealistic = Math.max(useSocial ? 15 : 3, socialMax + websiteMax);

  const recommended = Math.round((totalMinRealistic + totalMaxRealistic) / 2);

  let level: "REALISTIC" | "MODERATE" | "HIGHLY_AGGRESSIVE" = "REALISTIC";
  let explanation = "";

  const sourceLabel = useSocial && useWebsite ? "social + website" : useWebsite ? "website SEO" : "organic social";

  if (target <= totalMaxRealistic * 1.1) {
    level = "REALISTIC";
    explanation = `A target of ${target} leads in ${days} days (${dailyPace}/day) is well within expected ${sourceLabel} capacity for active multichannel publishing.`;
  } else if (target <= totalMaxRealistic * 2.2) {
    level = "MODERATE";
    explanation = `A target of ${target} leads in ${days} days (${dailyPace}/day) is ambitious. Requires top-tier viral hook optimization, multi-platform short-form video, and high daily consistency.`;
  } else {
    level = "HIGHLY_AGGRESSIVE";
    explanation = `Target of ${target} leads in ${days} days (${dailyPace}/day) is aggressive for purely ${sourceLabel} without paid ad spend. Expected range at this pace is ${totalMinRealistic}–${totalMaxRealistic} ${String(leadType).replace(/_/g, " ").toLowerCase()}.`;
  }

  const notes: string[] = [];
  if (useWebsite) {
    notes.push(
      websiteEffectiveDays <= 0
        ? `Website SEO needs about ${SEO_RAMP_UP_DAYS} days before an article can rank, so in a ${days}-day window the website source adds close to nothing. Social carries this goal.`
        : `Website SEO articles start bringing search traffic after about ${SEO_RAMP_UP_DAYS} days, so only ${websiteEffectiveDays} of your ${days} days count toward website leads (${websiteMin}–${websiteMax} of the range).`
    );
  }
  if (!useSocial) {
    notes.push("Only the website source is selected — no social posts will be created for this goal.");
  }

  return {
    isFeasible: level !== "HIGHLY_AGGRESSIVE",
    feasibilityLevel: level,
    requestedLeads: target,
    timeframeDays: days,
    dailyPaceRequested: dailyPace,
    dailyPaceRealistic: Number((recommended / days).toFixed(2)),
    estimatedRealisticMin: totalMinRealistic,
    estimatedRealisticMax: totalMaxRealistic,
    recommendedTarget: recommended,
    explanation,
    sourceBreakdown: {
      socialMin,
      socialMax,
      websiteMin,
      websiteMax,
      websiteEffectiveDays,
    },
    notes,
    assumptions: {
      estAvgReachPerPost,
      estOrganicCTR,
      estOrganicCVR,
      estQualificationRate: estQualRate,
    },
  };
}
