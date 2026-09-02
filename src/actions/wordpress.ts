"use server";

export interface WPConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

export interface WPPostType { slug: string; name: string; }
export interface WPCategory { id: number; name: string; slug: string; }
export interface WPTag { id: number; name: string; slug: string; }
export interface WPAuthor { id: number; name: string; slug: string; }

export interface WPPublishPayload {
  title: string;
  content: string; // HTML
  status: 'publish' | 'draft' | 'pending';
  categories?: number[];
  tags?: number[];
  author?: number;
  slug?: string;
  excerpt?: string;
  featured_media?: number;
  meta?: Record<string, string>;
  type?: string; // post type
  schemaMarkup?: string;
  focusKeyword?: string;
  seoPlugin?: string; // 'universal' | 'rank_math' | 'yoast' | 'aioseo' | 'seopress'
}

export interface WPPublishResult {
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
}

function getAuthHeader(config: WPConfig): string {
  return `Basic ${Buffer.from(`${config.username}:${config.appPassword}`).toString("base64")}`;
}

export async function testWPConnection(config: WPConfig): Promise<boolean> {
  try {
    const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(config),
      },
      cache: 'no-store',
    });
    return res.ok;
  } catch (error) {
    console.error("WP Connection Error:", error);
    return false;
  }
}

export async function fetchWPPostTypes(config: WPConfig): Promise<WPPostType[]> {
  try {
    const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/types`, {
      headers: { 'Authorization': getAuthHeader(config) },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Object.keys(data).map(key => ({ slug: key, name: data[key].name }));
  } catch (error) {
    return [];
  }
}

export async function fetchWPCategories(config: WPConfig): Promise<WPCategory[]> {
  try {
    const timestamp = Date.now();
    const [resAll, resDefault] = await Promise.all([
      fetch(`${config.siteUrl}/wp-json/wp/v2/categories?per_page=100&hide_empty=false&orderby=id&order=desc&_cb=${timestamp}`, {
        headers: { 'Authorization': getAuthHeader(config) },
        cache: 'no-store',
      }),
      fetch(`${config.siteUrl}/wp-json/wp/v2/categories?per_page=100&orderby=id&order=desc&_cb=${timestamp}`, {
        headers: { 'Authorization': getAuthHeader(config) },
        cache: 'no-store',
      })
    ]);

    const catMap = new Map<number, WPCategory>();
    if (resAll.ok) {
      const data = await resAll.json();
      if (Array.isArray(data)) {
        data.forEach((c: any) => catMap.set(c.id, { id: c.id, name: c.name, slug: c.slug }));
      }
    }
    if (resDefault.ok) {
      const data = await resDefault.json();
      if (Array.isArray(data)) {
        data.forEach((c: any) => catMap.set(c.id, { id: c.id, name: c.name, slug: c.slug }));
      }
    }
    const categories = Array.from(catMap.values());
    // Return exactly what the site has. Never fabricate category ids — a made-up
    // id would map to whatever real category happens to hold that id on the
    // user's site, filing the post in the wrong place.
    return categories;
  } catch (error) {
    console.error("WP fetchWPCategories error:", error);
    return [];
  }
}

export async function fetchWPTags(config: WPConfig): Promise<WPTag[]> {
  try {
    const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/tags?per_page=100&orderby=id&order=desc&hide_empty=0`, {
      headers: { 'Authorization': getAuthHeader(config) },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((t: any) => ({ id: t.id, name: t.name, slug: t.slug }));
  } catch (error) {
    return [];
  }
}

export async function fetchWPAuthors(config: WPConfig): Promise<WPAuthor[]> {
  try {
    const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/users?per_page=100`, {
      headers: { 'Authorization': getAuthHeader(config) },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((u: any) => ({ id: u.id, name: u.name, slug: u.slug }));
  } catch (error) {
    return [];
  }
}

export async function createWPCategory(config: WPConfig, name: string): Promise<WPCategory | null> {
  try {
    const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/categories`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(config),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      if (errJson.code === 'term_exists' && errJson.data?.term_id) {
        return { id: errJson.data.term_id, name: name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
      }
      return null;
    }
    const data = await res.json();
    return { id: data.id, name: data.name, slug: data.slug };
  } catch (error) {
    console.error("WP Category Create Error:", error);
    return null;
  }
}

export async function publishToWordPress(config: WPConfig, payload: WPPublishPayload): Promise<WPPublishResult> {
  try {
    const postType = payload.type || 'posts';
    let finalContent = payload.content;
    if (payload.schemaMarkup && payload.schemaMarkup.trim().length > 10) {
      finalContent = `${payload.content}\n\n<!-- SEO Schema JSON-LD -->\n<script type="application/ld+json">\n${payload.schemaMarkup.trim()}\n</script>`;
    }

    // Step 1: Create post with core fields so it never fails on unregistered REST API meta keys
    const corePayload = {
      title: payload.title,
      content: finalContent,
      status: payload.status,
      categories: payload.categories,
      tags: payload.tags,
      author: payload.author,
      slug: payload.slug,
      excerpt: payload.excerpt,
      featured_media: payload.featured_media,
    };

    const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/${postType}`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(config),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(corePayload)
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to publish to WordPress');
    }

    const data = await res.json();
    const postId = data.id;

    // Step 2: Build & sync SEO Plugin Meta for Rank Math, Yoast, AIOSEO, and SEOPress
    const metaTitle = payload.meta?._yoast_wpseo_title || payload.title;
    const metaDesc = payload.meta?._yoast_wpseo_metadesc || payload.excerpt || "";
    const focusKw = payload.focusKeyword || "";

    const seoMeta: Record<string, any> = { ...payload.meta };
    const plugin = payload.seoPlugin || "universal";

    if (plugin === "universal" || plugin === "rank_math") {
      seoMeta["rank_math_title"] = metaTitle;
      seoMeta["rank_math_description"] = metaDesc;
      if (focusKw) seoMeta["rank_math_focus_keyword"] = focusKw;
    }
    if (plugin === "universal" || plugin === "yoast") {
      seoMeta["_yoast_wpseo_title"] = metaTitle;
      seoMeta["_yoast_wpseo_metadesc"] = metaDesc;
      if (focusKw) seoMeta["_yoast_wpseo_focuskw"] = focusKw;
    }
    if (plugin === "universal" || plugin === "aioseo") {
      seoMeta["_aioseo_title"] = metaTitle;
      seoMeta["_aioseo_description"] = metaDesc;
      if (focusKw) seoMeta["_aioseo_keywords"] = focusKw;
    }
    if (plugin === "universal" || plugin === "seopress") {
      seoMeta["_seopress_titles_title"] = metaTitle;
      seoMeta["_seopress_titles_desc"] = metaDesc;
      if (focusKw) seoMeta["_seopress_analysis_target_kw"] = focusKw;
    }

    // Try sending SEO plugin metadata via WordPress REST API
    try {
      await fetch(`${config.siteUrl}/wp-json/wp/v2/${postType}/${postId}`, {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeader(config),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ meta: seoMeta })
      });
    } catch (metaErr) {
      console.warn("WP SEO Plugin REST Meta sync notice:", metaErr);
    }

    return {
      success: true,
      postId: data.id,
      postUrl: data.link
    };
  } catch (error: any) {
    console.error("WP Publish Error:", error);
    return { success: false, error: error.message };
  }
}

export async function uploadMediaToWordPress(config: WPConfig, imageUrl: string, altText: string): Promise<number | null> {
  try {
    // 1. Download image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error("Failed to download image");
    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Determine content type from headers or default to jpeg
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';

    const filename = `media-${Date.now()}.${ext}`;

    // 2. Upload to WP
    const uploadRes = await fetch(`${config.siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(config),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': contentType,
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload media. Status: ${uploadRes.status}`);
    }

    const mediaData = await uploadRes.json();
    
    // 3. Update alt text (optional but recommended)
    if (altText && mediaData.id) {
      await fetch(`${config.siteUrl}/wp-json/wp/v2/media/${mediaData.id}`, {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeader(config),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ alt_text: altText })
      });
    }

    return mediaData.id;
  } catch (error) {
    console.error("WP Media Upload Error:", error);
    return null;
  }
}
