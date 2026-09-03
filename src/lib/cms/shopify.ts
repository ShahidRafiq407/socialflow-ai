/**
 * SHOPIFY PUBLISH TARGET
 *
 * Publishes to a Shopify store's blog (`article`) or to a store page (`page`)
 * through the Admin REST API with a custom-app access token.
 *
 * Two Shopify facts shape this file:
 *   - there is no "pending review" state; an unpublished article is simply
 *     `published: false`, so `pending` maps to draft and says so,
 *   - the SEO title and description are metafields (`global.title_tag`,
 *     `global.description_tag`), written after the record exists.
 */

import { getShopifyApiVersion } from "@/lib/apiKeys";
import {
  type CmsProvider,
  type CmsPublishInput,
  type CmsPublishResult,
  type CmsTarget,
  type CmsVerifyResult,
} from "./types";

/** `example.myshopify.com` from whatever the user pasted. */
export function normalizeShopDomain(raw: string): string {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!value) return "";
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) return value;
  if (/^[a-z0-9][a-z0-9-]*$/.test(value)) return `${value}.myshopify.com`;
  // A custom storefront domain is accepted as-is; the Admin API answers on it too.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value) ? value : "";
}

function shopifyBase(target: CmsTarget): string {
  const shop = normalizeShopDomain(target.meta.shopDomain || "");
  if (!shop) throw new Error("This Shopify target has no store domain.");
  const token = target.credentials.accessToken || "";
  if (!token) throw new Error("This Shopify target is missing its Admin API access token.");
  return `https://${shop}/admin/api/${getShopifyApiVersion()}`;
}

async function shopifyFetch(
  target: CmsTarget,
  path: string,
  init?: { method?: string; body?: any }
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const url = `${shopifyBase(target)}${path}`;
  const res = await fetch(url, {
    method: init?.method || "GET",
    headers: {
      "X-Shopify-Access-Token": target.credentials.accessToken || "",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail =
      (data?.errors && (typeof data.errors === "string" ? data.errors : JSON.stringify(data.errors))) ||
      data?.error ||
      text.slice(0, 200);
    return { ok: false, status: res.status, data, error: detail || `HTTP ${res.status}` };
  }
  return { ok: true, status: res.status, data };
}

async function verify(target: CmsTarget): Promise<CmsVerifyResult> {
  try {
    const shop = await shopifyFetch(target, "/shop.json");
    if (!shop.ok) {
      return {
        ok: false,
        error:
          shop.status === 401 || shop.status === 403
            ? "Shopify rejected the access token. The custom app needs write_content scope."
            : `Shopify said: ${shop.error}`,
      };
    }

    // Remember which blog articles go to, so publishing does not re-discover it.
    const meta: CmsVerifyResult["meta"] = {
      shopDomain: normalizeShopDomain(target.meta.shopDomain || ""),
      detail: {
        shopName: shop.data?.shop?.name || null,
        primaryDomain: shop.data?.shop?.domain || null,
      },
    };

    if (!target.meta.blogId) {
      const blogs = await shopifyFetch(target, "/blogs.json?limit=5");
      const first = Array.isArray(blogs.data?.blogs) ? blogs.data.blogs[0] : null;
      if (first?.id) meta.blogId = String(first.id);
    }

    return { ok: true, label: shop.data?.shop?.name || meta.shopDomain, meta };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Could not reach the Shopify store." };
  }
}

/** SEO title / description live in metafields, and only once the record exists. */
async function writeSeoMetafields(
  target: CmsTarget,
  ownerPath: string,
  input: CmsPublishInput
): Promise<string[]> {
  const warnings: string[] = [];
  const pairs: { key: string; value: string }[] = [];
  if (input.metaTitle) pairs.push({ key: "title_tag", value: input.metaTitle });
  if (input.metaDescription) pairs.push({ key: "description_tag", value: input.metaDescription });

  for (const pair of pairs) {
    const res = await shopifyFetch(target, `${ownerPath}/metafields.json`, {
      method: "POST",
      body: {
        metafield: {
          namespace: "global",
          key: pair.key,
          value: pair.value,
          type: "single_line_text_field",
        },
      },
    });
    if (!res.ok) warnings.push(`Shopify would not store the SEO ${pair.key.replace("_tag", "")}.`);
  }
  return warnings;
}

async function publish(target: CmsTarget, input: CmsPublishInput): Promise<CmsPublishResult> {
  const warnings: string[] = [];
  try {
    const published = input.status === "publish";
    if (input.status === "pending") {
      warnings.push("Shopify has no pending-review state, so this was saved unpublished.");
    }
    // Shopify strips <script> from body_html, so the JSON-LD cannot ride along.
    if (input.schemaMarkup) {
      warnings.push(
        "Shopify does not accept JSON-LD inside article HTML; add it to your theme template instead."
      );
    }

    if (input.contentType === "page") {
      const res = await shopifyFetch(target, "/pages.json", {
        method: "POST",
        body: {
          page: {
            title: input.title,
            body_html: input.html,
            handle: input.slug || undefined,
            published,
          },
        },
      });
      if (!res.ok) return { success: false, error: `Shopify said: ${res.error}`, warnings };

      const page = res.data?.page;
      warnings.push(...(await writeSeoMetafields(target, `/pages/${page?.id}`, input)));
      return {
        success: true,
        id: page?.id != null ? String(page.id) : undefined,
        url: pageUrl(target, page?.handle),
        status: published ? "publish" : "draft",
        warnings,
      };
    }

    const blogId = String(target.meta.blogId || "").trim();
    if (!blogId) {
      return {
        success: false,
        error: "No Shopify blog is selected for this store. Re-verify the connection to pick one.",
        warnings,
      };
    }

    const res = await shopifyFetch(target, `/blogs/${encodeURIComponent(blogId)}/articles.json`, {
      method: "POST",
      body: {
        article: {
          title: input.title,
          body_html: input.html,
          summary_html: input.excerpt || undefined,
          handle: input.slug || undefined,
          tags: input.tags?.length ? input.tags.join(", ") : undefined,
          published,
          ...(input.featuredImageUrl
            ? { image: { src: input.featuredImageUrl, alt: input.featuredImageAlt || input.title } }
            : {}),
        },
      },
    });
    if (!res.ok) return { success: false, error: `Shopify said: ${res.error}`, warnings };

    const article = res.data?.article;
    warnings.push(
      ...(await writeSeoMetafields(target, `/blogs/${blogId}/articles/${article?.id}`, input))
    );
    return {
      success: true,
      id: article?.id != null ? String(article.id) : undefined,
      url: articleUrl(target, article?.handle),
      status: published ? "publish" : "draft",
      warnings,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Shopify publish failed.", warnings };
  }
}

/** The storefront URL, using the shop's own domain when verify captured it. */
function storefrontHost(target: CmsTarget): string {
  const primary = target.meta.detail?.primaryDomain;
  if (typeof primary === "string" && primary.trim()) return primary.trim();
  return normalizeShopDomain(target.meta.shopDomain || "");
}

function pageUrl(target: CmsTarget, handle?: string): string | undefined {
  const host = storefrontHost(target);
  return host && handle ? `https://${host}/pages/${handle}` : undefined;
}

function articleUrl(target: CmsTarget, handle?: string): string | undefined {
  const host = storefrontHost(target);
  return host && handle ? `https://${host}/blogs/news/${handle}` : undefined;
}

export const shopifyProvider: CmsProvider = {
  key: "shopify",
  name: "Shopify",
  description: "Store blog articles and store pages, via a custom app Admin API token.",
  contentTypes: ["post", "page"],
  // No pending state on the platform; it is offered so the UI stays uniform and
  // the publish result explains what actually happened.
  statuses: ["publish", "draft"],
  supportsSchema: false,
  supportsFeaturedImage: true,
  fields: [
    {
      key: "shopDomain",
      label: "Store domain",
      type: "text",
      required: true,
      secret: false,
      store: "meta",
      placeholder: "your-store.myshopify.com",
      help: "The myshopify.com domain, or your custom storefront domain.",
    },
    {
      key: "accessToken",
      label: "Admin API access token",
      type: "password",
      required: true,
      secret: true,
      store: "credentials",
      placeholder: "shpat_...",
      help: "Settings → Apps → Develop apps → your app → Admin API. Needs write_content.",
    },
    {
      key: "blogId",
      label: "Blog ID",
      type: "text",
      required: false,
      secret: false,
      store: "meta",
      help: "Leave blank to use the store's first blog, which is picked when you verify.",
    },
  ],
  verify,
  publish,
};
