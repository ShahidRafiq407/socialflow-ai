// ============================================================================
// ACTIONS — WHAT EACH THING COSTS, AND WHY
//
// One row per billable action. A route never invents a number; it names an action
// and this file says what it costs. The `basis` line on each row records the
// measurement the price came from, so a price can be argued with rather than
// inherited.
//
// Prices carry roughly 1.5x cover over measured list cost. That is not padding —
// three things make a single run's cost variable in a way a fixed price has to
// absorb:
//
//   Thinking tokens. Gemini 3.x Pro bills reasoning as output. A hard prompt can
//   emit several thousand tokens nobody reads.
//   Retries. Stages that must return a shape are allowed a second attempt.
//   Grounding. Charged per search request, not per call, and one call can issue
//   several. $14 per 1,000 makes a research-heavy run noticeably dearer.
//
// One rule holds the whole table together: an action's price covers a KNOWN
// number of model calls. Where the number of calls is decided at runtime, the
// count is the quantity on the ticket, not a bigger flat price — a deck reserves
// per slide (`media.image`), and a chat turn reserves per round
// (`chat.toolLoop`). A flat price over a variable call count is the one shape
// that cannot be made safe: it is either a rip-off at the low end or a loss at
// the high end, and the high end is exactly what a heavy user reaches.
//
// The thinnest cover in the table is `ai.post.single` at 1.47x, which is what the
// plan grants in `plans.ts` are sized against.
//
// Client-safe: no database, no server-only imports. The billing page renders this
// table directly, which is the point — the price list a customer reads is the
// price list the server charges.
// ============================================================================

import type { FeatureKey } from "./plans";
import { CREDIT_USD } from "./plans";

export const ACTION_KEYS = [
  "ai.post.campaign",
  "ai.post.single",
  "ai.post.variant",
  "ai.post.rewrite",
  "ai.post.fromMedia",
  "ai.post.field",
  "ai.trend.suggest",
  "media.image",
  "media.imagePro",
  "media.video",
  "media.reelScript",
  "chat.message",
  "chat.toolLoop",
  "article.quick",
  "article.deep",
  "article.serp",
  "article.assist",
  "article.optimizeScan",
  "goal.autopilotCycle",
  "goal.taskPost",
  "goal.channelAdvice",
  "optimize.run",
  "schedule.bestTime",
  "brand.analyze",
  "brand.document",
  "brand.preview",
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

export interface ActionSpec {
  key: ActionKey;
  /** What the customer sees on the usage list. */
  label: string;
  /** Credits charged. 1 credit = $0.01 of list model spend. */
  credits: number;
  /** The entitlement that must be on for this action to run at all. */
  feature: FeatureKey;
  /**
   * The feature whose per-period count this action increments, when it is capped
   * separately from credits. Usually the same as `feature`.
   */
  countsAgainst?: FeatureKey;
  /** One line for the price table. */
  description: string;
  /**
   * How the price was arrived at. Kept in the code because a number without its
   * derivation is a number nobody can safely change.
   */
  basis: string;
  /**
   * True when the credits must be reserved before the run starts rather than
   * charged after. Anything that takes long enough for a second tab to start
   * another one, or costs enough that going negative matters.
   */
  reserve?: boolean;
  /** How long a reservation is held before the sweeper releases it. */
  reserveMs?: number;
}

export const ACTION_CATALOG: Record<ActionKey, ActionSpec> = {
  "ai.post.campaign": {
    key: "ai.post.campaign",
    label: "AI campaign",
    credits: 60,
    feature: "aistudio.generate",
    description:
      "One creative core written and adapted for every connected account, with the family's shared media brief.",
    basis:
      "8 model calls: 2 grounded research on 3.6-flash (~$0.057 incl. 2 search requests), 2 competitor calls on 3.5-flash-lite (~$0.014), 4 reasoning and writing calls on 3.1-pro at ~10k in / 5k out (~$0.32). Measured ~$0.39.",
    reserve: true,
    reserveMs: 5 * 60_000,
  },

  "ai.post.single": {
    key: "ai.post.single",
    label: "AI post — one platform",
    credits: 25,
    feature: "aistudio.generate",
    description:
      "One post written for one platform and format: live research, the draft, and the CEO audit that has to pass before you see it.",
    basis:
      "1 grounded trend call on 3.6-flash (~$0.028 incl. search), 1 saturation call on 3.5-flash-lite (~$0.007, cached per industry for a day), 1 writing call on 3.1-pro at ~8k in / 3k out (~$0.08), 1 audit pass (~$0.04), and a revision on the ~20% of drafts the audit rejects (~$0.016). Measured ~$0.17.",
  },

  "ai.post.variant": {
    key: "ai.post.variant",
    label: "Extra platform variant",
    credits: 8,
    feature: "aistudio.generate",
    description: "One additional platform rewritten off an existing creative core.",
    basis: "1 call on 3.1-pro at ~6k in / 1.5k out. Measured ~$0.030.",
    // A campaign charges its core once and its extra format families through this,
    // so the reservation has to be able to settle down to the families that
    // actually finished inside the run's time budget.
    reserve: true,
    reserveMs: 10 * 60_000,
  },

  "ai.post.rewrite": {
    key: "ai.post.rewrite",
    label: "Rewrite or refine",
    credits: 12,
    feature: "aistudio.generate",
    description: "Regenerating a caption, hook, or hashtag set on a post that already exists.",
    basis: "1 call on 3.1-pro at ~8k in / 2k out plus a supervisor pass. Measured ~$0.055.",
  },

  "ai.post.fromMedia": {
    key: "ai.post.fromMedia",
    label: "Post written from your media",
    credits: 12,
    feature: "aistudio.generate",
    description:
      "Watching or reading the file you uploaded — including the spoken audio of a video — and writing the post from what is actually in it.",
    basis:
      "Vision pass on 3.6-flash over the whole file: a 60-second clip is ~16k tokens of video (~$0.012). Then 1 writing call on 3.1-pro at ~4k in / 1.2k out (~$0.023). Measured ~$0.035, and rising with the length of the upload, which is why the cover here is wider than elsewhere.",
  },

  "ai.post.field": {
    key: "ai.post.field",
    label: "One field or prompt",
    credits: 3,
    feature: "aistudio.generate",
    description:
      "A single title, description, hashtag set, alt text, slide, or image prompt — the small buttons inside the editor.",
    basis:
      "1 call on 3.1-pro at ~2k in / 500 out: ~$0.010. Priced at three credits because the cheap buttons are the ones pressed in a row.",
  },

  "ai.trend.suggest": {
    key: "ai.trend.suggest",
    label: "Trend suggestions",
    credits: 6,
    feature: "aistudio.generate",
    description:
      "Three ideas worth writing about, from live search on your industry rather than from a list of generic prompts.",
    basis:
      "1 grounded call on 3.6-flash (~$0.028 incl. 2 search requests) plus 1 shaping call (~$0.008). Measured ~$0.036. Cached for an hour per platform, format and industry, and a cache hit is not charged.",
    // Reserved rather than debited so that a cache hit — which is the common case
    // once a workspace has looked at a format once — releases a hold instead of
    // moving the balance twice.
    reserve: true,
    reserveMs: 3 * 60_000,
  },

  "media.image": {
    key: "media.image",
    label: "AI image",
    credits: 15,
    feature: "media.image",
    description: "One rendered image at up to 2K.",
    basis: "gemini-3.1-flash-image, 2K output: $0.101 per image plus the prompt's input tokens.",
    // Reserved rather than charged outright because a carousel asks for its slides
    // in one go and some of them can fail. The reservation covers the deck the
    // caller asked for; settling charges the slides that came back.
    reserve: true,
    reserveMs: 10 * 60_000,
  },

  "media.imagePro": {
    key: "media.imagePro",
    label: "AI image — premium model",
    credits: 30,
    feature: "media.imagePro",
    countsAgainst: "media.image",
    description: "One image from the premium model, for work that has to hold up at full size.",
    basis: "gemini-3-pro-image: $0.134 per image at 1-2K, $0.24 at 4K, plus $2.00/1M input.",
    reserve: true,
    reserveMs: 10 * 60_000,
  },

  "media.video": {
    key: "media.video",
    label: "AI video",
    credits: 120,
    feature: "media.video",
    description: "One clip of up to 8 seconds at 720p.",
    basis:
      "gemini-omni-flash at ~$0.10 per second of 720p. An 8-second clip is ~$0.80 — the most expensive single action in the product, which is why it is also count-capped.",
    reserve: true,
    reserveMs: 10 * 60_000,
  },

  "media.reelScript": {
    key: "media.reelScript",
    label: "Reel script from stock footage",
    credits: 3,
    feature: "aistudio.generate",
    // No model renders anything here, so this is not a media allowance question —
    // it is one AI generation, and it draws on the same monthly post count as one
    // written in the studio. Otherwise the Video Studio is a way around that count.
    countsAgainst: "aistudio.generate",
    description: "A scene-by-scene reel script, with matching stock clips found for each scene.",
    basis:
      "1 structured call on 3.1-pro at ~700 in / ~800 out = ~$0.011, plus up to three Pixabay searches per scene (free tier, but rate-limited). Three credits covers a 4-scene script.",
  },

  "chat.message": {
    key: "chat.message",
    label: "CEO chat message",
    credits: 12,
    feature: "chat.message",
    description: "One turn of the CEO chat — the answer itself, and the bookkeeping the turn ends with.",
    basis:
      "One model call on 3.1-pro at ~12k in / 3k out is ~$0.060, and a turn that thinks hard bills its reasoning as output, so ~$0.096 is reachable on one call. Add ~$0.007 of flash for the three chores every turn ends with: naming the session, folding the dropped window into the rolling summary, and the three follow-up suggestions. Measured ~$0.067 typical.",
    // Held, not debited. The tool loops below are reserved in the same breath, and a
    // turn that produces nothing has to give both back together — a debit here and a
    // hold there would settle at different times and show the customer two prices.
    reserve: true,
    reserveMs: 6 * 60_000,
  },

  "chat.toolLoop": {
    key: "chat.toolLoop",
    label: "CEO chat — extra tool round",
    credits: 12,
    // Deliberately its own feature, and deliberately uncapped on every plan that
    // has it. `chat.message` carries the per-period count so a plan can promise a
    // number of MESSAGES; if the loops counted against that too, the trial's "6
    // messages" would silently become "6 model calls" — `claimFeatureUsage`
    // increments the period counter by the ticket's quantity.
    feature: "chat.tools",
    description:
      "Each round after the first, when the chat uses a tool and then has to read the result and carry on.",
    basis:
      "A round is another whole model call with the transcript so far as input, so it costs more than the one before it: ~$0.060 early, ~$0.086 by the fifth round as the tool results accumulate. The plan's `chatMaxToolLoops` is the ceiling on how many a turn may take, and the balance is reserved for that many before the turn starts and settled down to the rounds actually used.",
    reserve: true,
    reserveMs: 6 * 60_000,
  },

  "article.quick": {
    key: "article.quick",
    label: "Article — Quick",
    credits: 150,
    feature: "article.quick",
    description: "The 12-stage pipeline: brief, outline, draft, fact-check, SEO, score.",
    basis:
      "~7 writing calls on 3.1-pro for the sections (~$0.32), 8 reasoning calls (~$0.45), 3 fast calls (~$0.04). Measured ~$0.81.",
    reserve: true,
    reserveMs: 20 * 60_000,
  },

  "article.deep": {
    key: "article.deep",
    label: "Article — Deep research",
    credits: 350,
    feature: "article.deep",
    description:
      "The full 23-stage pipeline: grounded research, sources fetched and read, every claim put through the evidence gate.",
    basis:
      "Quick (~$0.81) plus grounded research (~$0.075), up to 11 evidence-gate judgements against fetched pages (~$0.33), 8 further reasoning stages (~$0.45), the editor pass (~$0.14) and the media plan (~$0.05). Measured ~$1.86 before image renders.",
    reserve: true,
    reserveMs: 30 * 60_000,
  },

  "article.serp": {
    key: "article.serp",
    label: "Live search results",
    credits: 2,
    feature: "article.quick",
    // Counted apart from the articles themselves. This is pressed while deciding
    // what to write — often several times over one keyword — and a plan that sold
    // four articles a month must not have one of them spent on a search.
    countsAgainst: "article.assist",
    description:
      "Reading the pages currently ranking for a keyword, and measuring how long and how deep they actually are.",
    basis:
      "1 Serper request (~$0.001) plus up to 8 competitor page fetches, which cost bandwidth rather than tokens. No model call. Two credits is mostly a rate limit: this is the cheapest thing in the product and the easiest to run in a loop.",
  },

  "article.assist": {
    key: "article.assist",
    label: "Article helper",
    credits: 4,
    feature: "article.quick",
    countsAgainst: "article.assist",
    description:
      "One of the small article buttons: topic ideas, title options, category suggestions, or a rewritten meta title and description.",
    basis:
      "1 call on 3.1-pro at ~3k in / 1k out (~$0.017), and for titles a Serper request first so the options are written against the pages they have to beat (~$0.001). Measured ~$0.018.",
  },

  "article.optimizeScan": {
    key: "article.optimizeScan",
    label: "Page optimisation scan",
    credits: 12,
    feature: "article.deep",
    description:
      "Reading a page you already published against what it is being found for, and proposing only what the data supports.",
    basis:
      "The live page fetched to 30k characters, then 1 reasoning call on 3.1-pro at ~12k in / 2k out (~$0.055). Measured ~$0.058. Filed under Deep because what it proposes is verified by a full deep run, not by assertion.",
  },

  "goal.autopilotCycle": {
    key: "goal.autopilotCycle",
    label: "Autopilot cycle",
    credits: 20,
    feature: "goals.autopilot",
    description:
      "One planning pass against a goal. The posts and articles it decides to make are charged as their own actions.",
    basis:
      "Channel advice and a scheduling plan on 3.1-pro at ~12k in / 3k out, plus a cheap ranking pass. Measured ~$0.10.",
  },

  "goal.taskPost": {
    key: "goal.taskPost",
    label: "Autopilot post",
    credits: 12,
    feature: "goals.autopilot",
    // The Goal tab is what unlocks this, but a post the autopilot wrote is still a
    // post, so it draws down the same per-period post allowance as one written by
    // hand in the studio. Otherwise the autopilot is a way around that allowance.
    countsAgainst: "aistudio.generate",
    description:
      "One post written and scheduled by the autopilot from a task already on your plan.",
    basis:
      "1 writing call on 3.1-pro at ~8k in / 2.5k out: ~$0.075. There is no research stage — the plan decided the topic when it was drawn up — which is why this costs half of a studio post. A visual is charged separately, per asset, when the task asks for one.",
  },

  "goal.channelAdvice": {
    key: "goal.channelAdvice",
    label: "Channel shortlist",
    credits: 3,
    feature: "goals.manage",
    description:
      "Which platforms to post on for this goal, ranked for your business and explained in its own terms.",
    basis:
      "The ranking itself is arithmetic over your own tracked clicks and leads and costs nothing — the Lead Goal tab renders it on every load without a model call. This charge is only the 'Ask the AI again' button, which adds 1 call on 3.1-pro at ~1k in / ~1.5k out including thinking: ~$0.020. The button can be pressed repeatedly, which is the reason it is priced at all.",
  },

  "optimize.run": {
    key: "optimize.run",
    label: "Optimisation run",
    credits: 30,
    feature: "optimize.run",
    description: "Reading what performed, and rewriting the plan against it.",
    basis: "2 reasoning calls on 3.1-pro over performance history at ~20k in / 4k out. Measured ~$0.14.",
  },

  "schedule.bestTime": {
    key: "schedule.bestTime",
    label: "Best-time scheduling",
    credits: 1,
    feature: "schedule.bestTime",
    description: "Picking the slot a post should go out in.",
    basis:
      "1 call on 3.5-flash-lite at ~4k in / 600 out: ~$0.003. Priced at one credit because a smaller unit is not worth the row it costs to store.",
  },

  "brand.analyze": {
    key: "brand.analyze",
    label: "Brand DNA analysis",
    credits: 2,
    feature: "brandDna.analyze",
    description: "Reading a website and filling in tone, audience, and voice.",
    basis:
      "`extractFromUrl` fetches the page and makes exactly one `llm.invoke`, which defaults to 3.1-pro. The page text is truncated to 10k characters, so input cannot run away: ~2.8k in at $2/1M plus ~300 out at $12/1M = ~$0.009. Two credits covers that and the outbound fetch.",
  },

  "brand.document": {
    key: "brand.document",
    label: "Brand DNA from a document",
    credits: 2,
    feature: "brandDna.analyze",
    description: "Reading a deck, brief, or PDF and filling in tone, audience, and voice.",
    basis:
      "`extractFromDocument` parses the upload locally — `parseUploadedFile` has no model in it — then makes the same single `llm.invoke` as the website scan against text truncated to the same 10k characters: ~2.8k in at $2/1M plus ~300 out at $12/1M = ~$0.009. Priced level with `brand.analyze` because it is the same call on a different source, and a customer choosing between a URL and a PDF should not be choosing between prices.",
  },

  "brand.preview": {
    key: "brand.preview",
    label: "Brand voice preview",
    credits: 1,
    feature: "brandDna.analyze",
    description: "The sample post that shows what your saved voice sounds like.",
    basis:
      "1 call on 3.1-pro at ~350 in / 200 out: ~$0.003. Shares the `brandDna.analyze` count with the website scan on purpose — both are the brand model, and one counter is easier to explain than two.",
  },

  // There is no `competitor.scan` row, and that is deliberate. The competitor
  // research the product actually does is a Google-grounded call inside the AI
  // Studio's own generation (see `src/app/api/ai-studio/route.ts`), cached 24h per
  // industry — so it is already paid for by the post that asked for it, and the
  // `competitors.track` feature only gates the benchmark brands a workspace stores.
  // A priced row for a scan no surface can start would be a promise on the pricing
  // page that nothing in the app can keep. When a real competitor tab lands, the
  // derivation is: 1 grounded call on 3.5-flash-lite plus ~$0.014 of search ≈ $0.045.
};

// ─────────────────────────────────────────────────────────────────────────────
// Reading the catalogue
// ─────────────────────────────────────────────────────────────────────────────

export function isActionKey(value: unknown): value is ActionKey {
  return typeof value === "string" && (ACTION_KEYS as readonly string[]).includes(value);
}

/**
 * Throws on an unknown key rather than defaulting to zero.
 *
 * A typo in an action name must not become a free action. This is the one place
 * in the billing code that prefers a 500 to a quiet success.
 */
export function getAction(key: ActionKey | string): ActionSpec {
  const spec = isActionKey(key) ? ACTION_CATALOG[key] : undefined;
  if (!spec) throw new Error(`[billing] unknown action "${String(key)}"`);
  return spec;
}

export function actionCredits(key: ActionKey | string): number {
  return getAction(key).credits;
}

/** For the price table: what a credit price works out to in dollars. */
export function creditsToUsd(credits: number): number {
  return Math.round(credits * CREDIT_USD * 100) / 100;
}

/**
 * The catalogue grouped the way the billing page shows it, so the page does not
 * hold its own idea of which action belongs under which heading.
 */
export const ACTION_GROUPS: { title: string; blurb: string; actions: ActionKey[] }[] = [
  {
    title: "Posts",
    blurb: "Written in Content Studio, or by the CEO chat on your behalf.",
    actions: [
      "ai.post.campaign",
      "ai.post.single",
      "ai.post.variant",
      "ai.post.rewrite",
      "ai.post.fromMedia",
      "ai.post.field",
      "ai.trend.suggest",
      "schedule.bestTime",
    ],
  },
  {
    title: "Media",
    blurb: "Rendered once per format family and shared across the accounts in it.",
    actions: ["media.image", "media.imagePro", "media.video", "media.reelScript"],
  },
  {
    title: "Articles",
    blurb: "Quick is a full draft. Deep reads its sources and proves its claims.",
    actions: ["article.quick", "article.deep", "article.optimizeScan", "article.assist", "article.serp"],
  },
  {
    title: "Automation",
    blurb: "The chat, your goals, and the loop that learns from results.",
    actions: [
      "chat.message",
      "chat.toolLoop",
      "goal.autopilotCycle",
      "goal.taskPost",
      "goal.channelAdvice",
      "optimize.run",
    ],
  },
  {
    title: "Research",
    blurb: "Reading your own brand: your site, your documents, and the voice we learn from them.",
    actions: ["brand.analyze", "brand.document", "brand.preview"],
  },
];
