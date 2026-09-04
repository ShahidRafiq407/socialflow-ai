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
//
// HOW THE GRANTS WERE SIZED
//
// The credit grant is the binding limit on every plan, so the worst case a plan
// can cost is the grant spent entirely on the action with the THINNEST cover.
// That action is `ai.post.single` at 1.47x (25 credits charged against $0.17
// measured), so the floor of each plan's margin is `price - (credits / 100) / 1.47`:
//
//                                          worst case   floor
//   Free      $0   /     70 credits           $0.48     -$0.48   acquisition cost
//   Trial     $7   /    800 credits           $5.44      $1.56   filtered, one per person
//   Go        $19  /  1,500 credits          $10.20      $8.80
//   Pro       $49  /  5,000 credits          $34.01     $14.99
//   Agency    $129 / 15,000 credits         $102.04     $26.96
//
// Yearly is ten months for twelve, so the floor has to hold there too — it is the
// same grant against a lower monthly take:
//
//   Go        $15.83/mo  →  $5.63     Pro  $40.83/mo  →  $6.82
//   Agency   $107.50/mo  →  $5.46
//
// Every paid floor is at or above the $5 the product is launching on. Free is a
// cost of acquisition by design and the trial is a filtered one, which is what the
// device and network checks in `trialGuard.ts` are for.
//
// Note what these floors are NOT: they are not the expected margin. They are the
// margin if a customer spends an entire grant on the single worst-covered action
// and never touches a cheaper one, which no real account does. The typical mix
// runs nearer 2x cover, so the plans clear roughly double these numbers in
// practice. The floor is the number that has to be safe; the average is the number
// the business runs on.
//
// The one shape that would break all of this is a flat price over a variable
// number of model calls. `actions.ts` has none left: a deck reserves per slide and
// a chat turn reserves per round, so no single press can outrun its price.
//
// The per-feature `caps` are not a second pricing mechanism. They exist so a
// single expensive action cannot eat a whole period's grant in one press — a
// 350-credit deep article is 23% of an Agency month — and so the plan cards can
// promise a countable number rather than "as many as your credits allow".
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
  // The only AI a Free account touches: the scheduler's best-time pick and the
  // brand scan that onboarding opens with. Both are cheap, both are counted.
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
  // The small buttons beside the article form — topic ideas, title options, a
  // rewritten meta description, the live SERP read. Its own key so it can carry
  // its own counter: these cost 2-4 credits each and are pressed while deciding
  // what to write, so counting them against `article.quick` would let one press of
  // "suggest titles" consume the article a plan promised.
  "article.assist",
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
  "article.assist": "The Article Writer's research and title helpers",
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
  // The only AI a Free account touches: the scheduler's best-time pick, and the
  // website scan that fills in the brand profile. The scan is here rather than on
  // Go because it is the first thing a new account is asked to do — onboarding's
  // "Generate Magic Profile" is a free signup's opening AI call, and a plan that
  // refuses it turns the first minute of the product into an upgrade wall.
  "schedule.bestTime",
  "brandDna.manual",
  "brandDna.analyze",
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
  // Always granted with `article.quick` and never capped. The gate on the helpers
  // is still the article tab; this key exists only so their count does not draw on
  // the articles the plan sold.
  "article.assist",
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
    // Not zero. Free is sold on AI best-time scheduling and on the brand scan that
    // onboarding opens with, and both are priced actions — a zero balance would
    // refuse the plan's own headline feature on the first press. Sized to exactly
    // what the caps below allow (60 picks at 1 credit, 3 brand calls at 2), so the
    // grant cannot be spent on anything that is not advertised.
    monthlyCredits: 70,
    seats: 1,
    chatMaxToolLoops: 0,
    imageQuality: "standard",
    canBuyTopUps: false,
    features: FREE_FEATURES,
    // Every model call a Free account can reach is counted. Nothing else in the
    // product is reachable without a feature this plan does not have, so these two
    // rows are the whole of Free's exposure.
    caps: { "schedule.bestTime": 60, "brandDna.analyze": 3 },
  },

  TRIAL: {
    workspaces: 1,
    socialAccountsPerWorkspace: 6,
    storageMb: 1_024,
    analyticsRetentionDays: 30,
    // Sized against the caps below rather than picked. Spending every cap to its
    // ceiling costs 676 credits — 1 video (120), 8 images (120), 6 chat messages at
    // three rounds each (216), 1 quick article (150), 1 autopilot cycle (20), 1
    // optimisation run (30), 20 best-time picks (20) — and the uncapped rows a trial
    // is expected to reach add about another 90: a campaign across every connected
    // account (60), a couple of extra format variants (16), a trend refresh (6) and
    // the brand scan (6). 800 covers all of it with room to press one button twice.
    // A trial that promises more than its balance can buy is worse than a smaller
    // trial.
    monthlyCredits: 800,
    seats: 1,
    // Three rounds, not four. Enough to show the chat calling a tool, reading the
    // result and answering — which is the thing being demonstrated — without any one
    // message costing 48 credits of a trial that has to cover six of them.
    chatMaxToolLoops: 3,
    imageQuality: "standard",
    canBuyTopUps: false,
    // Everything a paying account gets, minus the two things one run of which
    // would consume the whole trial balance and leave nothing else testable.
    features: [...GO_FEATURES, "goals.manage", "goals.autopilot", "optimize.run"],
    caps: {
      // Deliberately NOT capped: `aistudio.generate`. Every small button in the
      // editor — one hashtag set, one title, a trend refresh, a rewrite — is an
      // `aistudio.generate` action, and `goal.taskPost` and `media.reelScript`
      // count against it too. A count here of the size a trial wants (two or
      // three) is spent by pressing "regenerate hashtags" twice, which is not
      // what anybody means by trying the product. The 800-credit balance and the
      // three-day clock are the limits; the rows below exist only for the actions
      // expensive enough to empty that balance in one press.
      "media.video": 1,
      // Eight, not four: a carousel is five slides in one press, so a four-image
      // ceiling refuses the deck the trial is meant to show off.
      "media.image": 8,
      // Six MESSAGES, which is what this counts — the rounds a message takes are
      // charged as `chat.toolLoop` under `chat.tools`, which is uncapped here on
      // purpose. Counting rounds against this row would turn the card's promise of
      // six messages into six model calls, and a single tool-using question would
      // eat half of them.
      "chat.message": 6,
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

/**
 * Yearly is ten months' money for twelve months' service, on every paid plan.
 *
 * Two months free is only affordable because the grant does not grow with the
 * discount: the same monthly credits against a $15.83 Go month still floors at
 * $5.63 (see HOW THE GRANTS WERE SIZED at the top of this file). Before the chat
 * was repriced per round it did not — Agency yearly floored at -$1.99, because a
 * flat-priced chat turn could cost more than it charged. Anything that widens
 * this discount has to be re-checked against those floors, not eyeballed.
 */
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
      "AI brand analysis from your website — 3 scans a month",
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
      "Sized for trying it properly rather than skimming it: generate a full campaign for every account you have connected, render a carousel and a video, put the CEO chat to work, and write an article. Cancel inside the three days and you are never charged again.",
    priceMonthly: 0,
    priceYearly: 0,
    oneTimePrice: 7,
    trialDays: 3,
    convertsTo: "GO",
    badge: "Try everything",
    ctaLabel: "Start the 3-day trial — $7",
    features: [
      "800 credits, valid for 3 days",
      "1 workspace, up to 6 connected accounts",
      "Content Studio: a full campaign across every connected account",
      "Up to 8 AI images — enough for a 5-slide carousel and more",
      "1 AI video",
      "Up to 6 CEO chat messages, tools included",
      "1 quick article",
      "1 goal with autopilot, and 1 optimisation run",
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
      "Unlimited brand scans, plus competitor tracking",
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

// ─────────────────────────────────────────────────────────────────────────────
// Admin overrides
//
// The back office can change a plan's price, grant, caps and features without a
// deploy. The change is written to the AppSetting table and pushed in here by
// `runtimeConfig.applyOverrides()`, which mutates PLAN_CATALOG / PLAN_ENTITLEMENTS
// in place — so every module that imported the tables keeps reading the same
// objects and sees the new values. The code-defined tables above are the
// baseline every override is applied on top of, never the running state.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanOverride {
  name?: string;
  tagline?: string;
  priceMonthly?: number;
  priceYearly?: number;
  monthlyCredits?: number;
  workspaces?: number;
  socialAccountsPerWorkspace?: number;
  storageMb?: number;
  analyticsRetentionDays?: number;
  seats?: number;
  chatMaxToolLoops?: number;
  imageQuality?: "standard" | "premium";
  canBuyTopUps?: boolean;
  features?: FeatureKey[];
  caps?: Partial<Record<FeatureKey, number>>;
}

export type PlanOverrides = Partial<Record<PlanTier, PlanOverride>>;

const BASE_CATALOG = Object.fromEntries(
  PLAN_TIERS.map((tier) => [tier, { ...PLAN_CATALOG[tier], features: [...PLAN_CATALOG[tier].features] }])
) as unknown as Record<PlanTier, PlanConfig>;

const BASE_ENTITLEMENTS = Object.fromEntries(
  PLAN_TIERS.map((tier) => [
    tier,
    { ...PLAN_ENTITLEMENTS[tier], features: [...PLAN_ENTITLEMENTS[tier].features], caps: { ...PLAN_ENTITLEMENTS[tier].caps } },
  ])
) as unknown as Record<PlanTier, PlanEntitlements>;

let activeOverrides: PlanOverrides = {};

function pickNumber(value: unknown, fallback: number, min = UNLIMITED): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n === UNLIMITED) return UNLIMITED;
  return Math.max(min, Math.round(n));
}

/** Applies the admin's plan changes on top of the code defaults, for every tier. */
export function setPlanOverrides(overrides: PlanOverrides): void {
  activeOverrides = overrides || {};
  for (const tier of PLAN_TIERS) {
    const base = BASE_ENTITLEMENTS[tier];
    const baseConfig = BASE_CATALOG[tier];
    const patch = activeOverrides[tier] ?? {};

    const features = Array.isArray(patch.features)
      ? (patch.features.filter((f): f is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(f)) as FeatureKey[])
      : [...base.features];

    const caps: Partial<Record<FeatureKey, number>> = {};
    const capSource = patch.caps && typeof patch.caps === "object" ? patch.caps : base.caps;
    for (const [key, value] of Object.entries(capSource)) {
      if ((FEATURE_KEYS as readonly string[]).includes(key) && typeof value === "number" && Number.isFinite(value)) {
        caps[key as FeatureKey] = value;
      }
    }

    Object.assign(PLAN_ENTITLEMENTS[tier], {
      workspaces: pickNumber(patch.workspaces, base.workspaces, 1),
      socialAccountsPerWorkspace: pickNumber(patch.socialAccountsPerWorkspace, base.socialAccountsPerWorkspace, 1),
      storageMb: pickNumber(patch.storageMb, base.storageMb, 1),
      analyticsRetentionDays: pickNumber(patch.analyticsRetentionDays, base.analyticsRetentionDays, 1),
      monthlyCredits: pickNumber(patch.monthlyCredits, base.monthlyCredits, 0),
      seats: pickNumber(patch.seats, base.seats, 1),
      chatMaxToolLoops: pickNumber(patch.chatMaxToolLoops, base.chatMaxToolLoops, 0),
      imageQuality: patch.imageQuality === "premium" || patch.imageQuality === "standard" ? patch.imageQuality : base.imageQuality,
      canBuyTopUps: typeof patch.canBuyTopUps === "boolean" ? patch.canBuyTopUps : base.canBuyTopUps,
      features,
      caps,
    } satisfies PlanEntitlements);

    const priceMonthly = pickNumber(patch.priceMonthly, baseConfig.priceMonthly, 0);
    Object.assign(PLAN_CATALOG[tier], {
      name: typeof patch.name === "string" && patch.name.trim() ? patch.name.trim() : baseConfig.name,
      tagline: typeof patch.tagline === "string" && patch.tagline.trim() ? patch.tagline.trim() : baseConfig.tagline,
      priceMonthly,
      priceYearly:
        patch.priceYearly !== undefined
          ? pickNumber(patch.priceYearly, baseConfig.priceYearly, 0)
          : patch.priceMonthly !== undefined && baseConfig.priceYearly > 0
            ? yearlyFor(priceMonthly)
            : baseConfig.priceYearly,
    });
  }
}

/** The overrides currently applied, for the admin screen. */
export function getActivePlanOverrides(): PlanOverrides {
  return activeOverrides;
}

/** The code-defined defaults, so the admin screen can show what "reset" returns to. */
export function basePlanEntitlements(tier: PlanTier): PlanEntitlements {
  return BASE_ENTITLEMENTS[tier];
}

export function basePlanConfig(tier: PlanTier): PlanConfig {
  return BASE_CATALOG[tier];
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
