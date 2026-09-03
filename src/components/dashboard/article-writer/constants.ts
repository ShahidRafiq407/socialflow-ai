/**
 * ARTICLE WRITER — option data
 *
 * Everything the form offers lives here as data, because the previous build spelled
 * each choice out as JSX. That is how the UI drifted from the server: it offered
 * three article sizes where the generator understood seven, and sent `gl=uk` for the
 * United Kingdom, which is not an ISO-3166 country code (`GB` is).
 *
 * No imports beyond the shared length presets — this file is read by a client
 * component, so it must not reach into anything that carries Prisma or a model SDK.
 */

import {
  ARTICLE_SIZE_PRESETS,
  MAX_TARGET_WORDS,
  MIN_TARGET_WORDS,
} from "@/lib/seo/articleLength";

export { ARTICLE_SIZE_PRESETS, MAX_TARGET_WORDS, MIN_TARGET_WORDS };

// ---------------------------------------------------------------------------
// MARKETS
//
// `code` is passed straight to Serper as `gl`, so it has to be a real ISO-3166
// alpha-2 code. "WW" is the one exception and means "no country bias".
// ---------------------------------------------------------------------------

export interface MarketOption {
  code: string;
  label: string;
}

export const WORLDWIDE_MARKET: MarketOption = {
  code: "WW",
  label: "Worldwide — no country bias",
};

export const MARKET_GROUPS: { group: string; markets: MarketOption[] }[] = [
  {
    group: "North America",
    markets: [
      { code: "US", label: "United States" },
      { code: "CA", label: "Canada" },
      { code: "MX", label: "Mexico" },
    ],
  },
  {
    group: "Europe",
    markets: [
      { code: "GB", label: "United Kingdom" },
      { code: "IE", label: "Ireland" },
      { code: "DE", label: "Germany" },
      { code: "FR", label: "France" },
      { code: "ES", label: "Spain" },
      { code: "IT", label: "Italy" },
      { code: "NL", label: "Netherlands" },
      { code: "SE", label: "Sweden" },
      { code: "PL", label: "Poland" },
    ],
  },
  {
    group: "Asia & Oceania",
    markets: [
      { code: "AU", label: "Australia" },
      { code: "NZ", label: "New Zealand" },
      { code: "IN", label: "India" },
      { code: "PK", label: "Pakistan" },
      { code: "BD", label: "Bangladesh" },
      { code: "SG", label: "Singapore" },
      { code: "MY", label: "Malaysia" },
      { code: "ID", label: "Indonesia" },
      { code: "PH", label: "Philippines" },
      { code: "JP", label: "Japan" },
      { code: "KR", label: "South Korea" },
    ],
  },
  {
    group: "Middle East & Africa",
    markets: [
      { code: "AE", label: "United Arab Emirates" },
      { code: "SA", label: "Saudi Arabia" },
      { code: "QA", label: "Qatar" },
      { code: "TR", label: "Türkiye" },
      { code: "EG", label: "Egypt" },
      { code: "ZA", label: "South Africa" },
      { code: "NG", label: "Nigeria" },
      { code: "KE", label: "Kenya" },
    ],
  },
  {
    group: "Latin America",
    markets: [
      { code: "BR", label: "Brazil" },
      { code: "AR", label: "Argentina" },
      { code: "CL", label: "Chile" },
      { code: "CO", label: "Colombia" },
    ],
  },
];

/** Flat lookup for turning a stored code back into its label. */
export const MARKET_BY_CODE: Record<string, string> = MARKET_GROUPS.reduce(
  (acc, g) => {
    for (const m of g.markets) acc[m.code] = m.label;
    return acc;
  },
  { [WORLDWIDE_MARKET.code]: WORLDWIDE_MARKET.label } as Record<string, string>
);

// ---------------------------------------------------------------------------
// LANGUAGE
//
// Sent as free text to the generator ("Write in: X"), so this is a convenience
// list, not a constraint — the field also accepts anything typed into it.
// ---------------------------------------------------------------------------

export const LANGUAGES: string[] = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Swedish",
  "Polish",
  "Turkish",
  "Arabic",
  "Urdu",
  "Hindi",
  "Bengali",
  "Indonesian",
  "Malay",
  "Filipino",
  "Vietnamese",
  "Thai",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Russian",
  "Ukrainian",
  "Hebrew",
  "Persian",
];

/**
 * BCP-47 code and writing direction for each label above.
 *
 * The page preview needs both: `lang` is what a screen reader and a search
 * engine read, and an Arabic or Urdu article laid out left-to-right is not a
 * preview of anything. Anything missing from this map falls back to English
 * rather than guessing a code.
 */
export const LANGUAGE_LOCALES: Record<string, { code: string; rtl?: boolean }> = {
  English: { code: "en" },
  Spanish: { code: "es" },
  French: { code: "fr" },
  German: { code: "de" },
  Italian: { code: "it" },
  Portuguese: { code: "pt" },
  Dutch: { code: "nl" },
  Swedish: { code: "sv" },
  Polish: { code: "pl" },
  Turkish: { code: "tr" },
  Arabic: { code: "ar", rtl: true },
  Urdu: { code: "ur", rtl: true },
  Hindi: { code: "hi" },
  Bengali: { code: "bn" },
  Indonesian: { code: "id" },
  Malay: { code: "ms" },
  Filipino: { code: "fil" },
  Vietnamese: { code: "vi" },
  Thai: { code: "th" },
  Japanese: { code: "ja" },
  Korean: { code: "ko" },
  "Chinese (Simplified)": { code: "zh-Hans" },
  Russian: { code: "ru" },
  Ukrainian: { code: "uk" },
  Hebrew: { code: "he", rtl: true },
  Persian: { code: "fa", rtl: true },
};

export function resolveLanguage(label: string): { code: string; rtl: boolean } {
  const found = LANGUAGE_LOCALES[(label || "").trim()];
  return { code: found?.code || "en", rtl: Boolean(found?.rtl) };
}

// ---------------------------------------------------------------------------
// VOICE
// ---------------------------------------------------------------------------

export const POINT_OF_VIEW_OPTIONS: { value: string; label: string }[] = [
  { value: "first", label: "First person — I, we, our" },
  { value: "second", label: "Second person — you, your" },
  { value: "third", label: "Third person — they, the team" },
];

/**
 * Tone suggestions. The Brand DNA tone is used when the user leaves this alone,
 * which is why the first entry carries an empty value.
 */
export const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Use the brand's own tone" },
  { value: "Professional and authoritative", label: "Professional & authoritative" },
  { value: "Conversational and warm", label: "Conversational & warm" },
  { value: "Technical and precise", label: "Technical & precise" },
  { value: "Practical and direct", label: "Practical & direct" },
  { value: "Analytical and evidence-led", label: "Analytical & evidence-led" },
  { value: "Persuasive and commercial", label: "Persuasive & commercial" },
  { value: "Friendly and beginner-friendly", label: "Friendly & beginner-friendly" },
];

// ---------------------------------------------------------------------------
// IMAGES
// ---------------------------------------------------------------------------

export const IMAGE_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: "photographic", label: "Photographic" },
  { value: "editorial", label: "Editorial / magazine" },
  { value: "minimal", label: "Minimal & clean" },
  { value: "illustration", label: "Illustration" },
  { value: "diagram", label: "Diagram / explainer" },
  { value: "3d", label: "3D render" },
];

/**
 * Shapes offered for AI-rendered artwork.
 *
 * `platform` and `format` are the keys `/api/ai-studio` resolves capabilities
 * from — an article is not a social post, so a real format that renders at the
 * right aspect ratio is borrowed rather than inventing an unsupported one.
 */
export const AI_IMAGE_SHAPES: {
  value: string;
  label: string;
  platform: string;
  format: string;
  aspectRatio: string;
}[] = [
  { value: "wide", label: "Wide 16:9 — in-article", platform: "x", format: "Post", aspectRatio: "16:9" },
  { value: "social", label: "Social preview 1.91:1 — featured", platform: "linkedin", format: "Post", aspectRatio: "1.91:1" },
  { value: "square", label: "Square 1:1", platform: "x", format: "Post", aspectRatio: "1:1" },
  { value: "portrait", label: "Portrait 4:5", platform: "linkedin", format: "Multi-Image", aspectRatio: "4:5" },
];

/** How many in-article images the generator will place, on top of the hero. */
export const IMAGE_COUNT_CHOICES: number[] = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
// PUBLISHING
// ---------------------------------------------------------------------------

/** Labels for the statuses a provider declares. Never used to invent one. */
export const PUBLISH_STATUS_LABELS: Record<string, string> = {
  publish: "Publish live",
  draft: "Save as draft",
  pending: "Submit for review",
};

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  post: "Post / article",
  page: "Page",
};

// ---------------------------------------------------------------------------
// EDITOR
// ---------------------------------------------------------------------------

/**
 * The editor's tabs. `page` is the read-only one: the article inside a real page,
 * at real viewport widths, which the editing surface cannot show because it
 * inherits the dashboard's theme and column.
 */
export type EditorView = "preview" | "page" | "html" | "schema";


/** Extracts the 11-character video id from any YouTube URL shape. */
const YOUTUBE_ID = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

export function extractYouTubeId(input: string): string | null {
  const value = (input || "").trim();
  if (!value) return null;
  const matched = value.match(YOUTUBE_ID);
  if (matched?.[1]) return matched[1];
  // A bare id pasted on its own.
  return /^[\w-]{11}$/.test(value) ? value : null;
}

/**
 * What a run actually does, in order.
 *
 * These are labels for the work, not progress: the generator runs inside one POST
 * and cannot report back mid-flight, so the UI shows elapsed time against the
 * server's real deadline instead of ticking these off on a timer. The old build
 * faked three of them with `setTimeout`.
 */
export const PIPELINE_STAGES: string[] = [
  "Reading the live search results and measuring the pages that rank",
  "Planning an outline that covers all four E-E-A-T pillars",
  "Writing each section against the brand's voice",
  "Measuring the draft and closing the word-count gap",
  "Placing images, the video, and internal and external links",
  "Auditing the finished article and scoring the checklist",
];

/** The server's own time budget for one article, so the UI counts down the truth. */
export const GENERATION_BUDGET_MS = 235_000;
