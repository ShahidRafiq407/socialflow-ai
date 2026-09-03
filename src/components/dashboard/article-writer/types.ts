/**
 * ARTICLE WRITER — client-side contract
 *
 * The shapes `/api/article-writer` really returns. They are declared here rather
 * than imported from the server modules because those modules pull in Prisma, the
 * model SDKs and decrypted credentials; a client component that imported them
 * would either fail to build or ship them to the browser.
 *
 * Everything optional here is optional because the server can legitimately omit
 * it — a step that could not do its job returns the reason instead of a fake
 * value, so the UI must be able to render "not available" rather than a zero.
 */

export interface SerpResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  wordCount?: number;
  headingCount?: number;
}

export interface SerpAnalysis {
  keyword: string;
  topResults: SerpResult[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  estimatedAvgWordCount: number;
  estimatedHeadingCount: number;
}

export interface SeoCheckItem {
  rule: string;
  passed: boolean;
  details: string;
  weight: number;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface ArticleLink {
  anchorText: string;
  url: string;
  label?: string;
}

export interface ArticleImage {
  url: string;
  alt: string;
  afterSectionIndex: number;
  credit?: string;
}

/** Exactly the generator's `seoMetrics`. Every number here was measured. */
export interface SeoMetrics {
  wordCount: number;
  keywordCount: number;
  keywordDensity: number;
  headingCount: { h2: number; h3: number };
  keywordInH2: boolean;
  metaTitleLength: number;
  metaDescriptionLength: number;
  readabilityScore: string;
  readabilityValue: number;
  avgSentenceWords: number;
  readingTimeMinutes: number;
  internalLinksCount: number;
  externalLinksCount: number;
  imageCount: number;
  imagesWithAlt: number;
  hasSchemaMarkup: boolean;
  hasToc: boolean;
  faqCount: number;
  keywordInTitle: boolean;
  keywordInIntro: boolean;
  keywordInMetaDescription: boolean;
  seoScore: number;
  targetWordCount: number;
  /** 1 = exactly the requested length. Below 1 = short or long of it. */
  wordCountAccuracy: number;
}

export interface GeneratedArticle {
  title: string;
  metaTitle: string;
  metaDescription: string;
  content: string;
  excerpt: string;
  slug: string;
  schemaMarkup: string;
  tableOfContents: TocItem[];
  seoChecklist: SeoCheckItem[];
  faqItems: { question: string; answer: string }[];
  keyTakeaways: string[];
  suggestedTags: string[];
  internalLinks: ArticleLink[];
  externalLinks: ArticleLink[];
  images: ArticleImage[];
  youtube?: { videoId: string; title: string; url: string } | null;
  pillarCoverage: { pillar: string; sections: string[] }[];
  searchIntent: string;
  warnings: string[];
  seoMetrics: SeoMetrics;
}

/** A trending topic the server proved Google really returns, or flagged as inferred. */
export interface TopicIdea {
  keyword: string;
  title: string;
  angle: string;
  searchIntent: string;
  pillar: string;
  source: "google-related" | "google-paa" | "brand-model";
  questions: string[];
}

export interface TopicIdeasResponse {
  success: boolean;
  ideas?: TopicIdea[];
  seeds?: string[];
  poolSize?: number;
  warnings?: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// PUBLISHING
// ---------------------------------------------------------------------------

export type CmsContentType = "post" | "page";
export type CmsPublishStatus = "publish" | "draft" | "pending";

export interface CmsField {
  key: string;
  label: string;
  type: "text" | "url" | "password" | "select";
  required: boolean;
  secret: boolean;
  store: "credentials" | "meta";
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
}

export interface CmsProviderDescriptor {
  key: string;
  name: string;
  description: string;
  contentTypes: CmsContentType[];
  statuses: CmsPublishStatus[];
  supportsSchema: boolean;
  supportsFeaturedImage: boolean;
  fields: CmsField[];
}

export interface CmsTargetSummary {
  id: string;
  providerKey: string;
  providerName: string;
  label: string;
  status: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
  contentTypes: CmsContentType[];
  statuses: CmsPublishStatus[];
  supportsSchema: boolean;
  supportsFeaturedImage: boolean;
  meta: Record<string, any>;
  hasCredentials: boolean;
  legacy: boolean;
}

/**
 * WordPress-only taxonomy. `supported: false` carries the reason in `note`;
 * `error` is set when the platform does support categories but the site refused
 * the credentials — the two read very differently to a user, so they are kept
 * apart rather than folded into one string.
 */
export interface TargetTaxonomy {
  supported: boolean;
  categories: { id: number; name: string; slug: string }[];
  authors: { id: number; name: string; slug: string }[];
  postTypes: { slug: string; name: string }[];
  note?: string;
  error?: string;
}

export interface PublishOutcome {
  success: boolean;
  id?: string;
  url?: string;
  status?: string;
  error?: string;
  warnings?: string[];
  label?: string;
}

/**
 * The Brand DNA the page hands down, already unpacked. Every field may be missing
 * — none is faked.
 *
 * There is deliberately no `writingStyle` here: that column holds a JSON blob and
 * the page used to render it straight into a fact chip. `buildBrandProfile` splits
 * it, so what arrives is the rules the owner typed plus the business facts that
 * were hidden inside it.
 */
export interface BrandDnaProps {
  tone?: string | null;
  targetAudience?: string | null;
  missionVision?: string | null;
  /** Writing rules the owner typed, never the serialised blob. */
  writingRules?: string | null;
  /** Customer problems the business solves. */
  painPoints?: string | null;
  /** Why customers choose this business. */
  differentiator?: string | null;
  /** The default offer an article should lead towards. */
  ctaOffer?: string | null;
  /** Benchmark competitor brands, as free text. */
  competitors?: string | null;
  forbiddenWords?: string[];
  primaryColors?: string[];
}
