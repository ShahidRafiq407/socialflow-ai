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
}): GoalFeasibilityResult {
  const target = Math.max(1, input.leadTarget);
  const days = Math.max(1, input.timeframeDays);
  const channels = Math.max(1, input.channelCount || 4);
  const leadType = input.leadType || "QUALIFIED_LEADS";

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
  const maxDailyRealistic = (estDailyOrganicReach * estOrganicCTR * estOrganicCVR * estQualRate);
  const minDailyRealistic = maxDailyRealistic * 0.45;

  const totalMinRealistic = Math.max(5, Math.round(minDailyRealistic * days));
  const totalMaxRealistic = Math.max(15, Math.round(maxDailyRealistic * days * 1.6));

  const recommended = Math.round((totalMinRealistic + totalMaxRealistic) / 2);

  let level: "REALISTIC" | "MODERATE" | "HIGHLY_AGGRESSIVE" = "REALISTIC";
  let explanation = "";

  if (target <= totalMaxRealistic * 1.1) {
    level = "REALISTIC";
    explanation = `A target of ${target} leads in ${days} days (${dailyPace}/day) is well within expected organic capacity for active multichannel publishing.`;
  } else if (target <= totalMaxRealistic * 2.2) {
    level = "MODERATE";
    explanation = `A target of ${target} leads in ${days} days (${dailyPace}/day) is ambitious. Requires top-tier viral hook optimization, multi-platform short-form video, and high daily consistency.`;
  } else {
    level = "HIGHLY_AGGRESSIVE";
    explanation = `Target of ${target} leads in ${days} days (${dailyPace}/day) is aggressive for purely organic social without paid ad spend. Historical organic reach indicates an expected range of ${totalMinRealistic}–${totalMaxRealistic} qualified leads.`;
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
    assumptions: {
      estAvgReachPerPost,
      estOrganicCTR,
      estOrganicCVR,
      estQualificationRate: estQualRate,
    },
  };
}
