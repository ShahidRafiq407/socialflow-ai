// ============================================================================
// CMS PUBLISHING — shared contract
//
// The article writer used to speak WordPress and nothing else. A provider now
// declares what it can do (posts, pages, which credentials it needs), and the UI
// renders its connect form from that declaration instead of hard-coding one form
// per platform. Adding a CMS means adding one file and one registry entry.
//
// This is a plain module, NOT a "use server" file: it handles decrypted
// credentials, and every export of a server-action file is a callable HTTP
// endpoint. Only server code may import it.
// ============================================================================

export type CmsProviderKey = "wordpress" | "shopify" | "custom";

/** What is being created on the far side. Every provider supports at least one. */
export type CmsContentType = "post" | "page";

export type CmsPublishStatus = "publish" | "draft" | "pending";

/** Non-secret configuration, stored on UserConnection.meta as JSON. */
export interface CmsTargetMeta {
  /** WordPress / custom: the site root. */
  siteUrl?: string;
  /** Shopify: `example.myshopify.com`. */
  shopDomain?: string;
  /** Shopify: which blog new articles go to. Resolved on verify when blank. */
  blogId?: string;
  /** Custom: the endpoint that receives the signed payload. */
  endpointUrl?: string;
  /** WordPress: `posts`, `pages` or a custom post type slug. */
  postType?: string;
  /** WordPress: which SEO plugin's meta keys to write. */
  seoPlugin?: string;
  defaultStatus?: CmsPublishStatus;
  defaultContentType?: CmsContentType;
  defaultCategoryId?: number | null;
  defaultAuthorId?: number | null;
  /** Free-form detail captured at verify time, e.g. the shop or site name. */
  detail?: Record<string, string | number | boolean | null>;
}

/** A connected publishing destination, with its secrets already decrypted. */
export interface CmsTarget {
  id: string;
  providerKey: CmsProviderKey;
  label: string;
  status: string;
  meta: CmsTargetMeta;
  credentials: Record<string, string>;
}

export interface CmsPublishInput {
  title: string;
  /** The article HTML exactly as it will appear. */
  html: string;
  contentType: CmsContentType;
  status: CmsPublishStatus;
  excerpt?: string;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  /** JSON-LD. Providers that cannot store scripts report a warning instead. */
  schemaMarkup?: string;
  tags?: string[];
  /** WordPress term ids. Other providers ignore them. */
  categoryIds?: number[];
  authorId?: number;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
}

export interface CmsPublishResult {
  success: boolean;
  /** Remote id, as a string because Shopify ids are 64-bit. */
  id?: string;
  url?: string;
  status?: string;
  error?: string;
  /** Things that partially failed, e.g. SEO meta the platform refused. */
  warnings?: string[];
}

export interface CmsVerifyResult {
  ok: boolean;
  label?: string;
  error?: string;
  /** Merged into the stored meta so a later publish does not re-discover it. */
  meta?: Partial<CmsTargetMeta>;
}

/** One input on the connect form. The UI renders from this, so nothing is hard-coded. */
export interface CmsField {
  key: string;
  label: string;
  type: "text" | "url" | "password" | "select";
  required: boolean;
  /** Secret fields are encrypted at rest and never sent back to the browser. */
  secret: boolean;
  /**
   * Where the value is kept. `credentials` is encrypted as a unit; `meta` is
   * readable configuration the UI is allowed to display again.
   */
  store: "credentials" | "meta";
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
}

export interface CmsProvider {
  key: CmsProviderKey;
  name: string;
  /** One line the UI shows under the provider name. */
  description: string;
  contentTypes: CmsContentType[];
  /** Statuses this platform really supports. */
  statuses: CmsPublishStatus[];
  fields: CmsField[];
  /** True when the platform can host the article's JSON-LD. */
  supportsSchema: boolean;
  supportsFeaturedImage: boolean;
  verify(target: CmsTarget): Promise<CmsVerifyResult>;
  publish(target: CmsTarget, input: CmsPublishInput): Promise<CmsPublishResult>;
}

// ---------------------------------------------------------------------------
// SHARED HELPERS
// ---------------------------------------------------------------------------

/**
 * Rejects URLs that point back inside our own infrastructure.
 *
 * The custom-site target posts to whatever URL the user saves. Without this a
 * tenant could aim it at the container's metadata service or another internal
 * host and use the publish button as a request proxy.
 */
export function assertPublicHttpUrl(raw: string, field = "URL"): URL {
  let url: URL;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw new Error(`${field} is not a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${field} must start with http:// or https://`);
  }

  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host.startsWith("[fc") ||
    host.startsWith("[fd");

  if (blocked) throw new Error(`${field} must be a public address, not a private or local one.`);
  return url;
}

/** Trailing-slash-free origin + path, so joins never double up. */
export function trimTrailingSlash(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function statusLabel(status: CmsPublishStatus): string {
  return status === "publish" ? "Published" : status === "pending" ? "Pending review" : "Draft";
}
