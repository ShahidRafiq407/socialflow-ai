/**
 * SLIDE DESIGNER — Text-rich / graphic-rich informational slide prompt builder.
 *
 * Carousels, Idea Pins, Multi-Image posts and LinkedIn Documents are INFORMATIONAL
 * formats: people swipe them to learn something. A decorative background photo with
 * no words on it is useless for that job.
 *
 * The copy agents already write per-slide `title` + `body` (the storyboard). This
 * module turns each slide's text + art direction into a full graphic-design brief so
 * the configured image model (one that typesets real legible text) renders a finished
 * infographic slide: headline, body copy, slide counter, brand footer and background
 * graphics — all baked into the image that gets published.
 */

export interface SlideTextSpec {
  step?: number;
  title?: string;
  body?: string;
  theme?: string;
  type?: string;
  points?: string[];
}

export type SlideRole = "hook" | "insight" | "cta";

export interface DeckStyle {
  name: string;
  palette: string;
  typography: string;
  motif: string;
  layout: string;
}

/**
 * Fixed design systems. One is picked deterministically per deck (hashed from the
 * topic/brand) so every slide of the same carousel shares one identical look, while
 * different campaigns don't all come out the same.
 */
const DECK_STYLES: DeckStyle[] = [
  {
    name: "Editorial Deep Navy",
    palette:
      "deep navy #0B1F3B background, crisp white typography, one electric cyan #22D3EE accent used for numbers and underlines",
    typography:
      "modern geometric sans-serif (Inter / Söhne feel), extra-bold headline with tight letter spacing, medium-weight body copy",
    motif: "faint diagonal grid lines, soft radial glow behind the headline, thin cyan rule under the headline",
    layout: "left-aligned editorial layout with a generous left margin",
  },
  {
    name: "Warm Cream Report",
    palette:
      "warm cream #F6F1E7 background, near-black #14110E typography, one terracotta #C2542D accent for numbers and highlight bars",
    typography:
      "confident modern serif headline paired with a clean grotesque sans body, high contrast between the two",
    motif: "subtle paper grain, thin hairline rules, a small terracotta block behind the slide number",
    layout: "print-report layout with the headline top-left and body copy in a single readable column",
  },
  {
    name: "Gradient Violet Tech",
    palette:
      "deep violet-to-indigo gradient (#2E1065 → #4338CA) background, white typography, lime #A3E635 accent for key metrics",
    typography: "bold rounded sans-serif headline, clean light-weight body copy, generous line height",
    motif: "soft glassmorphism card holding the body text, blurred light orbs, faint circuit-line texture",
    layout: "centered stacked layout with the headline above a translucent content card",
  },
  {
    name: "Mono Slate Minimal",
    palette:
      "light slate #EEF2F6 background, charcoal #0F172A typography, single blue #2563EB accent for emphasis words",
    typography: "clean neutral sans-serif, very heavy headline, restrained body copy, strong typographic hierarchy",
    motif: "wide clean negative space, one thin accent bar at the top edge, minimal geometric shapes",
    layout: "Swiss-grid minimal layout, headline in the upper third, body copy in the middle third",
  },
  {
    name: "Bold Contrast Black",
    palette:
      "near-black #08090A background, white typography, high-voltage amber #FBBF24 accent for the key phrase and slide number",
    typography: "condensed heavy display sans headline in sentence case, tight body copy in a lighter grade of the same family",
    motif: "large soft spotlight vignette, subtle noise texture, an amber keyline framing the content area",
    layout: "poster layout with an oversized headline and compact supporting paragraph beneath it",
  },
  {
    name: "Fresh Emerald Data",
    palette:
      "off-white #FAFDFB background with a deep emerald #064E3B content band, emerald typography on white and white typography on emerald, gold #D4A73A accent",
    typography: "modern humanist sans, semibold headline, comfortable body copy, numerals emphasized",
    motif: "clean data-visual accents (simple bars, a progress ring or a stat chip), thin emerald rules",
    layout: "split layout: coloured band carrying the headline, white area carrying the body copy and stat",
  },
];

/** Stable 32-bit string hash (deterministic across runs, unlike Math.random). */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

/** Picks one design system for the whole deck, deterministically from a seed. */
export function pickDeckStyle(seed: string): DeckStyle {
  if (!seed || !seed.trim()) return DECK_STYLES[0];
  return DECK_STYLES[hashString(seed.trim().toLowerCase()) % DECK_STYLES.length];
}

/** Short stable fingerprint of a deck's text — used for cache keys and dedup buckets. */
export function deckFingerprint(parts: (string | undefined)[]): string {
  return hashString(parts.filter(Boolean).join("~")).toString(36);
}

export function getSlideRole(index: number, total: number): SlideRole {
  if (index === 0) return "hook";
  if (total > 1 && index === total - 1) return "cta";
  return "insight";
}

/**
 * Formats that exist to teach something and therefore MUST carry readable text
 * baked into the visual.
 */
export function isTextRichFormat(contentType: string, mediaType?: string): boolean {
  const f = (contentType || "").toLowerCase();
  if (
    f.includes("carousel") ||
    f.includes("idea pin") ||
    f.includes("ideapin") ||
    f.includes("idea_pin") ||
    f.includes("document") ||
    f.includes("multi-image") ||
    f.includes("multi image") ||
    f.includes("multi_image") ||
    f.includes("multiple photos") ||
    f.includes("multiple_photos")
  ) {
    return true;
  }
  const m = (mediaType || "").toLowerCase();
  return m === "multi_image" || m === "carousel" || m === "document";
}

/** True when the format is published as a paged document (LinkedIn PDF carousel). */
export function isDocumentFormat(contentType: string): boolean {
  return (contentType || "").toLowerCase().includes("document");
}

/**
 * Collapses whitespace and strips characters that confuse the typesetter.
 *
 * Every quote character becomes a straight apostrophe. The copy models emit curly
 * quotes constantly, and the design brief wraps each string in `"..."` — a raw `"` or
 * `”` inside that would leave the image model guessing where the string ends.
 * The curly quotes in the classes below are load-bearing: an editor round-trip once
 * flattened them all to ASCII `"`, which silently disabled the normalization.
 * tests/lib/slideDesigner.test.ts guards against that happening again.
 */
export function sanitizeSlideText(value: string | undefined, maxLen: number): string {
  if (!value) return "";
  const cleaned = value
    .replace(/[\r\n]+/g, " ")
    .replace(/[“”„‟″«»"]/g, "'")
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\-]$/, "").trim();
}

export interface SlideDesignContext {
  platform: string;
  contentType: string;
  aspectRatio: string;
  slideIndex: number;
  totalSlides: number;
  slideText?: SlideTextSpec;
  /** Art direction for the background / graphic treatment (from the copy agent). */
  visualPrompt?: string;
  topic?: string;
  brandName?: string;
  brandColors?: string[];
  industry?: string;
  /** Extra user instructions typed in the Carousel Studio. */
  extraInstructions?: string;
  deckStyle?: DeckStyle;
  isDocument?: boolean;
}

const ROLE_DIRECTION: Record<SlideRole, string> = {
  hook: "This is the COVER / HOOK slide: the headline is the biggest type in the whole deck (it should dominate the canvas) and the supporting line sits directly beneath it. Add a small 'Swipe →' or 'Read more →' affordance in a corner.",
  insight:
    "This is a TEACHING slide: the headline names the idea, the body copy explains it in full readable sentences. Give the body copy real presence — it is the reason someone stopped scrolling.",
  cta: "This is the CLOSING slide: the headline states the single takeaway and the body copy asks the reader the question that makes them comment. Set that closing line inside a clearly designed highlight block so it reads as the deliberate last word. NEVER render a sales button, an offer, a price, a website, a phone number or a 'contact us' block.",
};

/**
 * Builds the complete design brief for one informational slide.
 *
 * The output is intentionally explicit: the image model is told (a) that this is a
 * designed graphic and not a photograph, (b) the EXACT strings to typeset, and
 * (c) the shared design system so all slides of the deck look like one deck.
 */
export function buildInfographicSlidePrompt(ctx: SlideDesignContext): string {
  const {
    platform,
    contentType,
    aspectRatio,
    slideIndex,
    totalSlides,
    slideText,
    visualPrompt,
    topic,
    brandName,
    brandColors,
    industry,
    extraInstructions,
    isDocument,
  } = ctx;

  const style =
    ctx.deckStyle || pickDeckStyle(`${brandName || ""}|${topic || contentType}|${platform}`);
  const role = getSlideRole(slideIndex, totalSlides);
  const slideNo = slideIndex + 1;

  const bodyFromPoints =
    !slideText?.body && Array.isArray(slideText?.points) && slideText.points.length > 0
      ? slideText.points.join(". ")
      : "";
  const body = sanitizeSlideText(slideText?.body || bodyFromPoints, isDocument ? 320 : 220);
  // A slide with no headline still has to say something — fall back to the campaign
  // topic rather than shipping an empty background.
  const headline = sanitizeSlideText(slideText?.title, 70) || sanitizeSlideText(topic, 70);

  const paletteLine =
    brandColors && brandColors.length > 0
      ? `${style.palette}. Brand colours to honour above all else: ${brandColors.join(", ")} — build the palette around these.`
      : style.palette;

  const textBlock: string[] = [];
  if (headline) {
    textBlock.push(`HEADLINE (largest text on the canvas) — render exactly: "${headline}"`);
  }
  if (body) {
    textBlock.push(
      `BODY COPY (clearly readable supporting paragraph, smaller than the headline) — render exactly: "${body}"`
    );
  }
  textBlock.push(
    `SLIDE COUNTER (small, corner placement) — render exactly: "${slideNo}/${totalSlides}"`
  );
  if (brandName) {
    textBlock.push(`FOOTER (small, understated, bottom edge) — render exactly: "${brandName}"`);
  }

  const surface = isDocument
    ? `a page of a professional PDF document / whitepaper carousel (page ${slideNo} of ${totalSlides})`
    : `slide ${slideNo} of ${totalSlides} of a single cohesive ${platform} ${contentType} deck`;

  const lines = [
    `GRAPHIC DESIGN BRIEF — produce a FINISHED, TEXT-RICH INFOGRAPHIC ${isDocument ? "DOCUMENT PAGE" : "SLIDE"}, designed in a professional layout tool. This is a designed graphic with real typography rendered on it, NOT a plain photograph and NOT an empty background.`,
    ``,
    `CANVAS: ${aspectRatio} ${surface}.`,
    topic ? `SUBJECT: ${topic}${industry ? ` (${industry})` : ""}.` : ``,
    ``,
    `TEXT TO TYPESET — reproduce every string below character-for-character, correctly spelled, in the language it is written in. Do not paraphrase, translate, truncate, duplicate or invent any other words:`,
    ...textBlock.map((t) => `- ${t}`),
    ``,
    `SLIDE ROLE: ${ROLE_DIRECTION[role]}`,
    ``,
    `SHARED DESIGN SYSTEM (identical on every slide of this deck — "${style.name}"):`,
    `- Colour: ${paletteLine}`,
    `- Typography: ${style.typography}. Strong hierarchy: headline >> body copy >> counter/footer.`,
    `- Layout: ${style.layout}. Text sits inside a safe margin of at least 8% of the canvas on every edge.`,
    `- Graphic motif: ${style.motif}`,
    `- Supporting graphics (icons, simple charts, geometric shapes, imagery) must sit BEHIND or BESIDE the text and never overlap or obscure a single letter.`,
    ``,
    visualPrompt && visualPrompt.trim()
      ? `BACKGROUND / IMAGERY ART DIRECTION for this specific slide: ${visualPrompt.trim()}. Treat it as the backdrop and supporting illustration only — keep it low-contrast and calm wherever text sits so the copy stays perfectly legible.`
      : `BACKGROUND: an on-topic, low-contrast abstract or illustrative backdrop that supports the message without competing with the text.`,
    extraInstructions && extraInstructions.trim()
      ? `ADDITIONAL CLIENT DIRECTION: ${extraInstructions.trim()}`
      : ``,
    ``,
    `HARD RULES:`,
    `- Every letter must be crisp, correctly kerned, real and readable at thumbnail size. No warped, cropped, doubled, blurred or invented characters.`,
    `- Zero misspellings. Zero gibberish. Zero lorem ipsum. Zero placeholder text.`,
    `- Render ONLY the strings listed above — no captions, hashtags, watermarks, signatures, stock-logo marks, UI chrome or fake browser windows.`,
    `- The headline and body copy must be present and fully inside the frame; nothing may run off the edge.`,
    `- Flat, print-quality graphic-design finish: clean edges, deliberate alignment, balanced composition, high contrast between text and its background.`,
  ];

  // Conditional lines above collapse to "" — join, then squash the resulting blank runs.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * System instruction for the image model when it is acting as a graphic designer
 * (text-rich slides) rather than a photographer.
 *
 * `modelName` is passed in rather than written here: the deployment decides which
 * image model runs (`MODEL_IMAGE_GENERATOR`), and a prompt that addresses the model
 * by a name it does not have is a lie the model has to reconcile.
 */
export function buildDesignSystemInstruction(
  aspectRatio: string,
  qualityClause?: string,
  modelName?: string
): string {
  return [
    `You are ${modelName || "an image generation model"} operating as a senior graphic designer and typographer for social-media infographics.`,
    `You render finished, publication-ready designed graphics with real, perfectly legible typography baked into the image — never blank backgrounds, never placeholder text, never misspelled words.`,
    `Adhere strictly to the ${aspectRatio} aspect ratio and keep all text inside a safe margin.`,
    qualityClause ? `Quality standard: ${qualityClause}.` : ``,
    `Typographic accuracy is the single most important success criterion: if any supplied string is missing or misspelled, the design has failed.`,
  ]
    .filter(Boolean)
    .join(" ");
}
