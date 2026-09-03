/**
 * WORDPRESS PUBLISH TARGET
 *
 * Wraps the existing REST helpers in the CMS provider contract, and fixes the two
 * things the old path got wrong:
 *   - the post type was sent as `post`, so the request went to `/wp/v2/post`,
 *     which does not exist; it is normalised to a real REST base here,
 *   - the featured image was never uploaded, so `featured_media` was always empty.
 *
 * Tags arrive as words and WordPress needs term ids, so they are resolved (and
 * created when missing) before the post is created.
 */

import {
  fetchWPTags,
  publishToWordPress,
  testWPConnection,
  uploadMediaToWordPress,
  type WPConfig,
} from "@/actions/wordpress";
import {
  assertPublicHttpUrl,
  trimTrailingSlash,
  type CmsProvider,
  type CmsPublishInput,
  type CmsPublishResult,
  type CmsTarget,
  type CmsVerifyResult,
} from "./types";

function configOf(target: CmsTarget): WPConfig {
  const siteUrl = trimTrailingSlash(target.meta.siteUrl || "");
  if (!siteUrl) throw new Error("This WordPress target has no site URL.");
  assertPublicHttpUrl(siteUrl, "WordPress site URL");
  const username = target.credentials.username || "";
  const appPassword = target.credentials.appPassword || "";
  if (!username || !appPassword) {
    throw new Error("This WordPress target is missing its username or application password.");
  }
  return { siteUrl, username, appPassword };
}

/**
 * WordPress REST bases are plural. A stored `post` or `page` would 404, and the
 * old code stored exactly that, so both spellings are accepted.
 */
export function resolveRestBase(contentType: "post" | "page", postType?: string): string {
  const raw = String(postType || "").trim().toLowerCase();
  if (raw && !["post", "posts", "page", "pages"].includes(raw)) return raw; // custom post type
  if (contentType === "page") return "pages";
  if (raw === "page" || raw === "pages") return "pages";
  return "posts";
}

/** Turns tag words into term ids, creating the ones the site does not have yet. */
async function resolveTagIds(config: WPConfig, tags: string[]): Promise<number[]> {
  const wanted = tags.map((t) => t.trim()).filter(Boolean).slice(0, 10);
  if (wanted.length === 0) return [];

  const existing = await fetchWPTags(config);
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
  const ids: number[] = [];

  for (const tag of wanted) {
    const hit = byName.get(tag.toLowerCase());
    if (hit) {
      ids.push(hit);
      continue;
    }
    const created = await createWPTag(config, tag);
    if (created) ids.push(created);
  }
  return ids;
}

async function createWPTag(config: WPConfig, name: string): Promise<number | null> {
  try {
    const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/tags`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.appPassword}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}) as any);
    if (res.ok && data?.id) return Number(data.id);
    // WordPress answers 400 `term_exists` with the id we actually want.
    if (data?.code === "term_exists" && data?.data?.term_id) return Number(data.data.term_id);
    return null;
  } catch {
    return null;
  }
}

async function verify(target: CmsTarget): Promise<CmsVerifyResult> {
  try {
    const config = configOf(target);
    const ok = await testWPConnection(config);
    if (!ok) {
      return {
        ok: false,
        error:
          "WordPress refused the credentials. Check the username and that the application password was copied with its spaces.",
      };
    }
    return {
      ok: true,
      label: new URL(config.siteUrl).host,
      meta: { siteUrl: config.siteUrl },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Could not reach the WordPress site." };
  }
}

async function publish(target: CmsTarget, input: CmsPublishInput): Promise<CmsPublishResult> {
  const warnings: string[] = [];
  try {
    const config = configOf(target);
    const restBase = resolveRestBase(input.contentType, target.meta.postType);

    let featuredMedia: number | undefined;
    if (input.featuredImageUrl) {
      const mediaId = await uploadMediaToWordPress(
        config,
        input.featuredImageUrl,
        input.featuredImageAlt || input.title
      );
      if (mediaId) featuredMedia = mediaId;
      else warnings.push("The featured image could not be uploaded to the media library.");
    }

    let tagIds: number[] = [];
    if (input.tags?.length) {
      try {
        tagIds = await resolveTagIds(config, input.tags);
        if (tagIds.length === 0) warnings.push("The tags could not be created on the site.");
      } catch {
        warnings.push("The tags could not be resolved to WordPress terms.");
      }
    }

    // Pages have no categories in WordPress; sending them fails the whole request.
    const categories =
      restBase === "pages" ? undefined : input.categoryIds?.filter((id) => Number(id) > 0);

    // `none` is a real choice, not an unknown value: the SEO plugin keys are left
    // alone so a site that manages its own meta is not overwritten.
    const seoPlugin = target.meta.seoPlugin || "universal";
    const seoMeta =
      seoPlugin === "none"
        ? {}
        : {
            ...(input.metaTitle ? { _yoast_wpseo_title: input.metaTitle } : {}),
            ...(input.metaDescription ? { _yoast_wpseo_metadesc: input.metaDescription } : {}),
          };

    const result = await publishToWordPress(config, {
      title: input.title,
      content: input.html,
      status: input.status,
      categories,
      tags: tagIds.length ? tagIds : undefined,
      author: input.authorId && input.authorId > 0 ? input.authorId : undefined,
      slug: input.slug,
      excerpt: input.excerpt,
      featured_media: featuredMedia,
      type: restBase,
      schemaMarkup: input.schemaMarkup,
      focusKeyword: input.focusKeyword,
      seoPlugin,
      meta: seoMeta,
    });

    if (!result.success) {
      return { success: false, error: result.error || "WordPress rejected the post.", warnings };
    }
    return {
      success: true,
      id: result.postId != null ? String(result.postId) : undefined,
      url: result.postUrl,
      status: input.status,
      warnings,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "WordPress publish failed.", warnings };
  }
}

export const wordpressProvider: CmsProvider = {
  key: "wordpress",
  name: "WordPress",
  description: "Self-hosted or WordPress.com business plans, via the REST API and an application password.",
  contentTypes: ["post", "page"],
  statuses: ["publish", "draft", "pending"],
  supportsSchema: true,
  supportsFeaturedImage: true,
  fields: [
    {
      key: "siteUrl",
      label: "Site URL",
      type: "url",
      required: true,
      secret: false,
      store: "meta",
      placeholder: "https://example.com",
      help: "The site root, not the wp-admin URL.",
    },
    {
      key: "username",
      label: "WordPress username",
      type: "text",
      required: true,
      secret: false,
      store: "credentials",
      placeholder: "editor",
    },
    {
      key: "appPassword",
      label: "Application password",
      type: "password",
      required: true,
      secret: true,
      store: "credentials",
      placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx",
      help: "Users → Profile → Application Passwords. Paste it with the spaces.",
    },
    {
      key: "seoPlugin",
      label: "SEO plugin",
      type: "select",
      required: false,
      secret: false,
      store: "meta",
      help: "Which plugin's meta fields to fill. Universal writes all of them.",
      options: [
        { value: "universal", label: "Detect / write all" },
        { value: "rank_math", label: "Rank Math" },
        { value: "yoast", label: "Yoast SEO" },
        { value: "aioseo", label: "All in One SEO" },
        { value: "seopress", label: "SEOPress" },
        { value: "none", label: "Don't write SEO meta" },
      ],
    },
  ],
  verify,
  publish,
};
