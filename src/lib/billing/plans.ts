// ============================================================================
// PLANS — THE ONE PLACE PRICES, CREDITS AND ENTITLEMENTS ARE WRITTEN DOWN
//
// Nothing else in the product decides what a plan may do. A route that wants to
// know whether this person can render a video asks here; it does not compare
// strings against "PRO". That matters because the alternative — a tier check
// spelled out at each call site — is how a plan quietly grows a feature nobody
// sold.
//
// HOW THE PRICES WERE SET
//
// Every number below is derived from the list price of the models this codebase
// actually calls (see `src/lib/agents/llm.ts`), read from Google's published
// pricing in September 2026:
//
//   gemini-3.1-pro-preview   $2.00 / $12.00  per 1M in / out   (writing, reasoning)
//   gemini-3.6-flash         $0.75 / $3.75                     (research, utility)
//   gemini-3.5-flash-lite    $0.30 / $2.50                     (competitor scan)
//   gemini-3.1-flash-image   $0.101 per 2K image               (default renders)
//   gemini-3-pro-image       $0.134 per image                   (premium renders)
//   gemini-omni-flash        ~$0.10 per second of 720p video
//   Google Search grounding  $14 per 1,000 requests after 5,000/month free
//
// A credit is $0.01 of that list spend. Action prices in `actions.ts` carry a
// ~1.5x cover over measured cost, which absorbs thinking-token variance, the
// retry a stage is allowed, and grounding charged per search rather than per
// call. Plan prices then sit far enough above the credit grant to leave the
// $5-$20 gross margin this product is launching on — deliberately thin, to be
// widened later rather than apologised for now.
// ============================================================================

export const PLAN_TIERS = ["FREE", "TRIAL", "GO", "PRO", "AGENCY"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** What one credit is worth in list model spend. The whole system's unit. */
export const CREDIT_USD = 0.01;
/** Same figure in micro-dollars, for integer maths against `UsageEvent`. */
export const CREDIT_MICROS = 10_000;

/** -1 means "no ceiling" everywhere a limit is expressed as a number. */
export const UNLIMITED = -1;

export function isUnlimited(value: number): boolean {
  return value === UNLIMITED;
}

// ─────────────────────────────────────────────────────────────────────────────
// Features
//
// One key per thing a plan can switch on or off. The keys are dotted and grouped
// by product surface so a gate reads like the tab it guards, and so a new
// capability has an obvious home.
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURE_KEYS = [
  // Composing and publishing — the floor, present on every plan including Free.
  "post.manual",
  "post.publish",
  "media.upload",
  // The only AI a Free account touches: the scheduler's best-time pick.
  "schedule.bestTime",
  // Content Studio (/dashboard/ai-studio)
  "aistudio.generate",
  "media.image",
  "media.imagePro",
  "media.video",
  "media.carousel",
  // Automate Task (/dashboard/chat)
  "chat.message",
  "chat.tools",
  "plugins.connect",
  // Article Writer
  "article.quick",
  "article.deep",
  // Lead Goal (/dashboard/goals)
  "goals.manage",
  "goals.autopilot",
  "optimize.run",
  // Brand DNA
  "brandDna.manual",
  "brandDna.analyze",
  // Elsewhere
  "analytics.advanced",
  "competitors.track",
  "export.zip",
  "wordpress.publish",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Human labels, used by the upgrade prompts so a gate never invents its own copy. */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  "post.manual": "Writing posts by hand",
  "post.publish": "Publishing to connected accounts",
  "media.upload": "Uploading your own media",
  "schedule.bestTime": "AI best-time scheduling",
  "aistudio.generate": "AI post generation in Content Studio",
  "media.image": "AI image generation",
  "media.imagePro": "The premium image model",
  "media.video": "AI video generation",
  "media.carousel": "AI carousels and slide sets",
  "chat.message": "The CEO chat in Automate Task",
  "chat.tools": "Letting the CEO chat use your tools",
  "plugins.connect": "The Plugin tab",
  "article.quick": "Article Writer — Quick mode",
  "article.deep": "Article Writer — Deep research mode",
  "goals.manage": "The Lead Goal tab",
  "goals.autopilot": "Goal autopilot",
  "optimize.run": "Performance optimisation runs",
  "brandDna.manual": "Brand DNA",
  "brandDna.analyze": "AI brand analysis",
  "analytics.advanced": "Full analytics history",
  "competitors.track": "Competitor tracking",
  "export.zip": "ZIP export and bulk upload",
  "wordpress.publish": "Publishing to WordPress",
};

// ─────────────────────────────────────────────────────────────────────────────
// Entitlements
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanEntitlements {
  /** Workspaces the account may own. */
  workspaces: number;
  /** Social accounts per workspace. Six is every platform this product supports. */
  socialAccountsPerWorkspace: number;
  /** Media storage ceiling, in megabytes. Sized against the hosting tier in use. */
  storageMb: number;
  /** How far back analytics and performance history is kept. */
  analyticsRetentionDays: number;
  /** Credits granted at the start of each billing period. */
  monthlyCredits: number;
  /** Team members who can be invited into the account's workspaces. */
  seats: number;
  /**
   * Tool-call loops the CEO chat may take in one turn. This is a cost control as
   * much as a capability: each loop is a full model call, so eight loops is eight
   * times the price of one.
   */
  chatMaxToolLoops: number;
  /** Which image model renders are billed against. */
  imageQuality: "standard" | "premium";
  /** Whether an exhausted balance can be topped up without changing plan. */
  canBuyTopUps: boolean;
  /** Features the plan switches on. Anything absent is off. */
  features: readonly FeatureKey[];
  /**
   * Hard per-period ceilings, independent of the credit balance. A Go account
   * with credits to spare still does not get a fifth quick article, because Go
   * is not sold with five.
   *
   * A feature present in `features` but absent here is limited only by credits.
   */
  caps: Partial<Record<FeatureKey, number>>;
}

/** Everything Free can do. Every other plan starts from this list. */
const FREE_FEATURES = [
  "post.manual",
  "post.publish",
  "media.upload",
  "schedule.bestTime",
  "brandDna.manual",
] as const satisfies readonly FeatureKey[];

/** Go adds the Content Studio's AI, the chat, plugins, and quick articles. */
const GO_FEATURES = [
  ...FREE_FEATURES,
  "aistudio.generate",
  "media.image",
  "media.video",
  "media.carousel",
  "chat.message",
  "chat.tools",
  "plugins.connect",
  "article.quick",
  "brandDna.analyze",
  "competitors.track",
  "wordpress.publish",
] as const satisfies readonly FeatureKey[];

/** Pro adds the Lead Goal tab and the optimisation loop that feeds it. */
const PRO_FEATURES = [
  ...GO_FEATURES,
  "goals.manage",
  "goals.autopilot",
  "optimize.run",
  "analytics.advanced",
] as const satisfies readonly FeatureKey[];

/** Agency adds deep research, the premium image model, and bulk export. */
const AGENCY_FEATURES = [
  ...PRO_FEATURES,
  "article.deep",
  "media.imagePro",
  "export.zip",
] as const satisfies readonly FeatureKey[];

export const PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlements> = {
  FREE: {
    workspaces: 1,
    socialAccountsPerWorkspace: 6,
    storageMb: 500,
    analyticsRetentionDays: 30,
    monthlyCredits: 0,
    seats: 1,
    chatMaxToolLoops: 0,
    imageQuality: "standard",
    canBuyTopUps: false,
    features: FREE_FEATURES,
    // The best-time pick is one cheap model call, but it is still a model call,
    // so it is counted rather than left open on a plan that pays nothing.
    caps: { "schedule.bestTime": 60 },
  },

  TRIAL: {
    workspaces: 1,
    socialAccountsPerWorkspace: 6,
    storageMb: 1_024,
    analyticsRetentionDays: 30,
    monthlyCredits: 500,
    seats: 1,
    chatMaxToolLoops: 4,
    imageQuality: "standard",
    canBuyTopUps: false,
    // Everything a paying account gets, minus the two things one run of which
    // would consume the whole trial balance and leave nothing else testable.
    features: [...GO_FEATURES, "goals.manage", "goals.autopilot", "optimize.run"],
    caps: {
      "aistudio.generate": 2,
      "media.video": 1,
      "media.image": 4,
      "chat.message": 10,
      "article.quick": 1,
      "goals.autopilot": 1,
      "optimize.run": 1,
      "schedule.bestTime": 20,
    },
  },

  GO: {
    workspaces: 2,
    socialAccountsPerWorkspace: 6,
    storageMb: 5 * 1_024,
    analyticsRetentionDays: 365,
    monthlyCredits: 1_500,
    seats: 1,
    chatMaxToolLoops: 6,
    imageQuality: "standard",
    canBuyTopUps: true,
    features: GO_FEATURES,
    caps: {
      "media.video": 3,
      "article.quick": 4,
      "schedule.bestTime": UNLIMITED,
    },
  },

  PRO: {
    workspaces: 3,
    socialAccountsPerWorkspace: 6,
    storageMb: 25 * 1_024,
    analyticsRetentionDays: 730,
    monthlyCredits: 5_000,
    seats: 3,
    chatMaxToolLoops: 8,
    imageQuality: "standard",
    canBuyTopUps: true,
    features: PRO_FEATURES,
    caps: {
      "media.video": 12,
      "article.quick": 15,
      "goals.manage": 3,
      "schedule.bestTime": UNLIMITED,
    },
  },

  AGENCY: {
    workspaces: UNLIMITED,
    socialAccountsPerWorkspace: 6,
    storageMb: 100 * 1_024,
    analyticsRetentionDays: UNLIMITED,
    monthlyCredits: 15_000,
    seats: 10,
    chatMaxToolLoops: 12,
    imageQuality: "premium",
    canBuyTopUps: true,
    features: AGENCY_FEATURES,
    // Nothing is capped by count on Agency. The credit balance is the only limit,
    // which is the plan's whole promise.
    caps: {},
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// The catalogue the billing page renders
//
// Copy lives here rather than in the page so the plan a gate refuses and the plan
// a card advertises cannot describe themselves differently.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanConfig {
  id: PlanTier;
  name: string;
  /** One line under the name. What the plan is for, not what it contains. */
  tagline: string;
  /** Two or three sentences. Read before the feature list, so it carries the point. */
  blurb: string;
  priceMonthly: number;
  priceYearly: number;
  /** Trial plans are billed once, not per period. */
  oneTimePrice?: number;
  /** Days the trial runs before it becomes the plan named in `convertsTo`. */
  trialDays?: number;
  convertsTo?: PlanTier;
  /** Short ribbon on the card. */
  badge?: string;
  /** The card the pricing grid leads with. */
  highlight?: boolean;
  /** Button text, so the CTA matches the commitment. */
  ctaLabel: string;
  /** Bulleted, in the order a buyer cares about. */
  features: string[];
  /** Named so a buyer can see where the plan stops, not only where it starts. */
  notIncluded?: string[];
}

/** Yearly is ten months' money for twelve months' service, on every paid plan. */
function yearlyFor(monthly: number): number {
  return monthly * 10;
}

export function yearlySavingPercent(tier: PlanTier): number {
  const plan = PLAN_CATALOG[tier];
  if (!plan.priceMonthly || !plan.priceYearly) return 0;
  const full = plan.priceMonthly * 12;
  return Math.round(((full - plan.priceYearly) / full) * 100);
}

export const PLAN_CATALOG: Record<PlanTier, PlanConfig> = {
  FREE: {
    id: "FREE",
    name: "Free",
    tagline: "Publish everywhere, by hand.",
    blurb:
      "Connect your accounts, write your own posts, and let the scheduler pick the moment each one goes out. No card, no expiry, no trial clock.",
    priceMonthly: 0,
    priceYearly: 0,
    ctaLabel: "Start free",
    features: [
      "1 workspace",
      "Connect up to 6 social accounts",
      "Write and publish to every connected account",
      "AI best-time scheduling — 60 posts a month",
      "Upload your own images and video",
      "500 MB media storage",
      "30 days of analytics history",
    ],
    notIncluded: [
      "AI-written posts",
      "AI images and video",
      "The CEO chat",
      "The Article Writer",
      "The Lead Goal tab",
    ],
  },

  TRIAL: {
    id: "TRIAL",
    name: "3-Day Trial",
    tagline: "The whole product, for three days.",
    blurb:
      "Sized for trying it properly rather than skimming it: generate one campaign for every account you have connected, render a video, and put the CEO chat to work. Cancel inside the three days and you are never charged again.",
    priceMonthly: 0,
    priceYearly: 0,
    oneTimePrice: 1,
    trialDays: 3,
    convertsTo: "GO",
    badge: "Try everything",
    ctaLabel: "Start the 3-day trial — $1",
    features: [
      "500 credits, valid for 3 days",
      "1 workspace, up to 6 connected accounts",
      "Content Studio: 1 full campaign across every connected account",
      "1 AI video and up to 4 AI images",
      "Up to 10 CEO chat messages",
      "1 quick article",
      "1 goal with autopilot",
      "Cancel any time in the first 3 days",
    ],
    notIncluded: ["Deep research articles", "The premium image model"],
  },

  GO: {
    id: "GO",
    name: "Go",
    tagline: "AI writes the posts.",
    blurb:
      "The Content Studio's AI, the CEO chat, your plugins, and quick articles. Everything needed to hold a real posting rhythm without writing every word yourself.",
    priceMonthly: 19,
    priceYearly: yearlyFor(19),
    ctaLabel: "Choose Go",
    features: [
      "1,500 credits a month",
      "2 workspaces, 6 accounts each",
      "Everything in Free",
      "Content Studio AI: copy, images and video",
      "CEO chat in Automate Task, with your plugins",
      "Article Writer — Quick mode, up to 4 a month",
      "Up to 3 AI videos a month",
      "AI brand analysis and competitor tracking",
      "5 GB media storage, 12 months of analytics",
    ],
    notIncluded: ["The Lead Goal tab", "Deep research articles"],
  },

  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "Goals that run themselves.",
    blurb:
      "Everything in Go, plus the Lead Goal tab: set a target and the autopilot plans, writes and schedules against it. Every credit-backed feature gets a bigger allowance.",
    priceMonthly: 49,
    priceYearly: yearlyFor(49),
    badge: "Most popular",
    highlight: true,
    ctaLabel: "Choose Pro",
    features: [
      "5,000 credits a month",
      "3 workspaces, 3 team members",
      "Everything in Go",
      "Lead Goal tab with autopilot — up to 3 active goals",
      "Article Writer — Quick mode, up to 15 a month",
      "Up to 12 AI videos a month",
      "Performance optimisation runs",
      "25 GB media storage, 24 months of analytics",
    ],
    notIncluded: ["Deep research articles", "Unlimited workspaces"],
  },

  AGENCY: {
    id: "AGENCY",
    name: "Agency",
    tagline: "Everything, across as many brands as you run.",
    blurb:
      "Unlimited workspaces and every feature in the product, including the Article Writer's deep research pipeline and the premium image model. Nothing is capped by count — the credit balance is the only limit.",
    priceMonthly: 129,
    priceYearly: yearlyFor(129),
    ctaLabel: "Choose Agency",
    features: [
      "15,000 credits a month",
      "Unlimited workspaces, 10 team members",
      "Everything in Pro",
      "Article Writer — Deep research mode, all 23 stages",
      "The premium image model",
      "Unlimited goals and autopilot cycles",
      "Unlimited quick articles and videos",
      "ZIP export and bulk upload",
      "100 GB media storage, unlimited analytics history",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Top-ups
//
// A cap that cannot be lifted without a plan change turns a busy month into a
// support ticket. Packs never expire and are spent only after the period's grant
// is gone, so buying one is never a way to lose credits you already had.
// ─────────────────────────────────────────────────────────────────────────────

export interface TopUpPack {
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
}

export const TOPUP_PACKS: TopUpPack[] = [
  { id: "topup_1000", credits: 1_000, priceUsd: 12, label: "1,000 credits" },
  { id: "topup_5000", credits: 5_000, priceUsd: 50, label: "5,000 credits" },
  { id: "topup_15000", credits: 15_000, priceUsd: 135, label: "15,000 credits" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reading the catalogue
// ─────────────────────────────────────────────────────────────────────────────

/** Low to high. Used for "is this plan at least X" and for upgrade suggestions. */
const PLAN_RANK: Record<PlanTier, number> = {
  FREE: 0,
  TRIAL: 1,
  GO: 2,
  PRO: 3,
  AGENCY: 4,
};

export function planRank(tier: PlanTier): number {
  return PLAN_RANK[tier] ?? 0;
}

/** The plans a buyer chooses between. The trial is offered separately, once. */
export const PURCHASABLE_PLANS: PlanTier[] = ["GO", "PRO", "AGENCY"];

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value);
}

/** Never throws: an unknown tier reads as Free, which is the safe direction. */
export function getPlanConfig(tier: PlanTier | string | null | undefined): PlanConfig {
  return PLAN_CATALOG[isPlanTier(tier) ? tier : "FREE"];
}

export function getEntitlements(tier: PlanTier | string | null | undefined): PlanEntitlements {
  return PLAN_ENTITLEMENTS[isPlanTier(tier) ? tier : "FREE"];
}

export function planHasFeature(
  tier: PlanTier | string | null | undefined,
  feature: FeatureKey
): boolean {
  return getEntitlements(tier).features.includes(feature);
}

/**
 * The per-period ceiling for a feature on this plan.
 *
 * Returns 0 when the plan does not have the feature at all — a caller that only
 * checks the cap still gets the right answer, so a missing feature check cannot
 * become an open door.
 */
export function featureCap(
  tier: PlanTier | string | null | undefined,
  feature: FeatureKey
): number {
  const ent = getEntitlements(tier);
  if (!ent.features.includes(feature)) return 0;
  const cap = ent.caps[feature];
  return cap === undefined ? UNLIMITED : cap;
}

/** The cheapest plan that includes this feature, for the upgrade prompt. */
export function lowestPlanWith(feature: FeatureKey): PlanTier {
  const found = ([...PLAN_TIERS] as PlanTier[])
    .filter((tier) => tier !== "TRIAL")
    .sort((a, b) => planRank(a) - planRank(b))
    .find((tier) => PLAN_ENTITLEMENTS[tier].features.includes(feature));
  return found ?? "AGENCY";
}

export function planPrice(tier: PlanTier, cycle: "monthly" | "yearly"): number {
  const plan = getPlanConfig(tier);
  if (plan.oneTimePrice !== undefined) return plan.oneTimePrice;
  return cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
}

export function formatStorage(mb: number): string {
  if (isUnlimited(mb)) return "Unlimited";
  return mb >= 1_024 ? `${Math.round(mb / 1_024)} GB` : `${mb} MB`;
}

export function formatCap(cap: number): string {
  return isUnlimited(cap) ? "Unlimited" : String(cap);
}
