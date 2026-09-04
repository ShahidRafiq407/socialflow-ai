/**
 * CONTENT STRATEGY — one doctrine for what the AI is allowed to write about.
 *
 * Brand DNA used to be read as a creative brief: the name, the services and the
 * value proposition went into every prompt, so every prompt came back with an
 * advert ("Partner with us to build specialised robotics"). That is wrong twice
 * over. It is wrong for the reader, who scrolls past a stranger's sales pitch,
 * and it is wrong for the business, because the model cheerfully invents offers,
 * clients and results that the business has never delivered.
 *
 * So Brand DNA is demoted here to *voice and audience*: who we are talking to,
 * in what tone, about which field. The SUBJECT is always something happening in
 * that field right now that the audience is arguing about, asking about, or
 * trying to learn. The post teaches, questions or reframes — and it earns a
 * comment instead of asking for a click.
 *
 * Every AI Studio step and both pipeline writers compose their prompts from this
 * module, and the deterministic audit scans for the same violations it forbids,
 * so the brief, the auditor and the repair pass can never drift apart.
 */

export interface StrategyBrand {
  name?: string | null;
  industry?: string | null;
  tone?: string | null;
  writingStyle?: string | null;
  targetAudience?: string | null;
  keywords?: string[] | null;
}

/**
 * The non-negotiables. Written as instructions to the writer because it is
 * pasted verbatim into every copy prompt — and quoted back, near-verbatim, to
 * the auditor that scores the result.
 */
export const AUDIENCE_FIRST_RULES = `CONTENT DOCTRINE (this overrides any instinct to market):
1. SUBJECT — write about something live in the audience's field: a shift that just happened, a claim worth arguing with, a mistake people keep repeating, or a question they are quietly stuck on. The business is the narrator, never the subject.
2. VALUE FIRST — the reader must finish knowing, seeing or questioning something they did not before. Teach the mechanism, break down the numbers, compare the options, or challenge the consensus. If the post could vanish and the reader would lose nothing, it is not written yet.
3. NO SELLING — no offers, services, pricing, availability, launches or urgency. Never "partner with us", "book a call", "we build", "we help", "our solutions", "DM us", "link in bio", "get started today". Not one line of it.
4. NO INVENTED TRACK RECORD — never state or imply that the business did a piece of work, served a client, shipped a product or achieved a result. You do not know what it has actually done, and guessing wrong is a lie the reader can catch.
5. NO CREDENTIAL CLAIMS — no "as experts", "industry leader", "trusted by", team sizes or client counts. Authority has to come from how well the thing is explained.
6. HOOK — the first line must cost the reader something to ignore: a specific number, a named mistake, a contrarian statement, or a question they cannot answer instantly. No greetings, no "let's talk about", no throat-clearing.
7. CLOSE — end on whatever makes commenting easier than scrolling: a direct question about the reader's own experience, a two-way choice, or an open invitation to disagree. Exactly one close, and it asks for words, not clicks.
8. SPECIFICS — concrete numbers, named tools, real timeframes, honest trade-offs. Vague inspiration is the failure mode.`;

/** For prompts that only have room for the one rule people get wrong most. */
export const ENGAGEMENT_CLOSE_RULE =
  "Close by asking for the reader's own experience or opinion — a real question they can answer in one comment. Never a sales CTA, never a link, never 'DM us'.";

/** For prompts that only need the prohibition. */
export const PROMOTION_BAN_RULE =
  "Never sell, never pitch services or offers, and never claim the business did work, served clients or achieved results. The business narrates; the reader's field is the subject.";

/**
 * The shapes a valuable post can take. Naming the angle up front is what stops
 * the model defaulting to the one shape it knows best (the advert), and rotating
 * it is what stops a week of posts sounding identical.
 */
export const CONTENT_ANGLES = [
  {
    id: "mechanism",
    label: "Teach the mechanism",
    brief:
      "Explain how something in this field actually works, one layer deeper than the audience expects. Reward them for reading to the end with the part that is usually left out.",
  },
  {
    id: "mistake",
    label: "Name the expensive mistake",
    brief:
      "Name a mistake the audience is probably making right now, show what it quietly costs them, then show the correction in concrete steps.",
  },
  {
    id: "debate",
    label: "Put the live argument to them",
    brief:
      "Take the disagreement the field is actually having, state a clear position with reasoning, and leave the door open for the reader to argue back.",
  },
  {
    id: "shift",
    label: "Explain what just changed",
    brief:
      "Take a recent, verifiable development in this field and answer the only question that matters: so what does this change for the reader, specifically?",
  },
  {
    id: "tradeoff",
    label: "Compare the two options",
    brief:
      "Two approaches the audience chooses between. Give the honest trade-off and say plainly when each one is the wrong choice.",
  },
  {
    id: "process",
    label: "Show how the work is really done",
    brief:
      "Walk through how this kind of work is done in practice, including the unglamorous step everyone skips. Keep it teachable and general — never a claim about a specific client or project.",
  },
  {
    id: "misread",
    label: "Correct the popular misreading",
    brief:
      "Take something the audience believes that is only half true, show where the belief came from, and replace it with what the evidence supports.",
  },
] as const;

export type ContentAngle = (typeof CONTENT_ANGLES)[number];

/**
 * Deterministic rotation: the same topic and format always get the same angle
 * (so a retry is not a lottery), but different topics and formats spread across
 * the whole set.
 */
export function contentAngleFor(seed: string): ContentAngle {
  const key = (seed || "").toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  return CONTENT_ANGLES[hash % CONTENT_ANGLES.length];
}

/**
 * Brand DNA, demoted to what it is actually good for: who is being spoken to and
 * in what voice. Deliberately omits the value proposition and the service list —
 * those are exactly the fields that used to turn every post into a pitch.
 */
export function audienceContext(brand: StrategyBrand): string {
  const field = (brand.industry || "").trim() || "this industry";
  const audience = (brand.targetAudience || "").trim() || `people working in ${field}`;
  const voice = [brand.tone, brand.writingStyle].map((v) => (v || "").trim()).filter(Boolean).join(", ");
  const vocab = (brand.keywords || []).filter(Boolean).slice(0, 12).join(", ");

  return [
    "AUDIENCE & VOICE (context for HOW you write — never the subject of the post):",
    `- Topical territory: ${field}. Everything you write must live inside this field.`,
    `- Writing for: ${audience}`,
    voice ? `- Voice: ${voice}` : "",
    vocab ? `- Language the audience already uses: ${vocab}` : "",
    brand.name
      ? `- Published by ${brand.name}. Only name it if the sentence still earns its place with the name removed.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The full brief every copy step opens with: who we are talking to, the doctrine,
 * the angle for this particular post, and the subject to stay inside.
 */
export function contentDoctrine(input: {
  brand: StrategyBrand;
  /** What the user asked for, if anything — treated as a topical boundary, not an offer to sell. */
  topic?: string | null;
  /** Rotation seed; pass something stable like `${platform}:${format}:${topic}`. */
  seed?: string;
  /** Skip the angle when the caller already fixed one (e.g. a single-field rewrite). */
  includeAngle?: boolean;
}): string {
  const topic = (input.topic || "").trim();
  const angle = contentAngleFor(input.seed || topic || input.brand.industry || "default");

  return [
    audienceContext(input.brand),
    "",
    AUDIENCE_FIRST_RULES,
    "",
    topic
      ? `SUBJECT BOUNDARY: stay on "${topic}" — but cover it as something the reader is trying to understand or decide, not as something being sold.`
      : `SUBJECT BOUNDARY: pick the angle inside ${(input.brand.industry || "this field").trim()} that the audience most needs answered right now.`,
    input.includeAngle === false ? null : `ANGLE FOR THIS POST — ${angle.label}: ${angle.brief}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * The grounded-search query. The old one asked for "viral trends and hooks about
 * <industry>", which returns marketing advice about the industry. This asks what
 * the *audience* is actually discussing — which is the raw material for a post
 * worth reading.
 */
export function trendSearchQuery(brand: StrategyBrand, topic?: string | null, platform?: string | null): string {
  const field = (brand.industry || "").trim() || "this industry";
  const audience = (brand.targetAudience || "").trim() || "practitioners";
  const focus = (topic || "").trim();
  const year = new Date().getFullYear();

  return [
    `What ${audience} in ${field} are discussing, asking and disagreeing about right now`,
    focus ? `regarding ${focus}` : "",
    `in ${year}: recent developments, hard numbers, common mistakes, misconceptions, and the questions nobody has answered clearly`,
    platform ? `— plus which of these angles is getting discussion on ${platform}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Quoted into the auditor prompts so the model scores against the same doctrine
 * the writer was handed.
 */
export const AUDIENCE_FIRST_AUDIT_CRITERIA = `- Is the post about the reader's field rather than the business? Any offer, service pitch, availability line, "partner with us", "we build/we help", credential claim, or invented client result is an automatic fail.
- Does the reader come away with something specific they could repeat to a colleague? Generic encouragement is a fail.
- Does the first line earn the second one, without greetings or throat-clearing?
- Does it close by asking for the reader's own view rather than a click, a DM or a link?`;

/** Handed to repair passes so the rewrite knows exactly what to replace. */
export const PROMO_FIX_HINT =
  "Strip every sales line, offer, availability claim, credential boast and invented result. Replace them with the substance the reader came for, and close with a question about their own experience.";

/**
 * Visual prompts drift promotional too — a slide reading "Partner with us" is the
 * same failure rendered at cost. Appended wherever an image prompt is written.
 */
export const VISUAL_PROMPT_RULE =
  "The visual illustrates the idea, not the company: no logos, no brand names, no slogans, no taglines, no contact details, no pricing, no 'call now' banners, no fake awards or badges. Any on-image text must be part of the explanation itself.";

/** Replaces the old "Our latest offering and key value" fallback topic. */
export function defaultTopicHint(brand: StrategyBrand): string {
  const field = (brand.industry || "").trim() || "this field";
  return `A question or misconception in ${field} that the audience gets wrong, explained properly`;
}
