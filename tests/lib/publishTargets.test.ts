/**
 * PUBLISH TARGET SUITE — the promises the publishing layer makes offline
 *
 * WHY THIS EXISTS: the article writer used to speak WordPress and nothing else,
 * and the one thing it did speak it got wrong — it POSTed to `/wp/v2/post`
 * (singular), which does not exist. Publishing now goes through a provider
 * contract, so the parts that decide *where* a request goes and *whether it is
 * allowed to go there* are pure functions, and they are locked here.
 *
 * Nothing in this file touches the network. What it proves:
 *   - a stored post type can no longer produce a 404 REST route,
 *   - the custom-site signature is the exact scheme the contract documents,
 *   - the publish endpoint cannot be aimed back inside our own network,
 *   - an unsupported status degrades to the most private state, never to live,
 *   - discovered internal links are real same-site pages, never invented ones.
 */
import { describe, expect, it } from "vitest";
import { customProvider, signPayload } from "@/lib/cms/custom";
import { normalizeShopDomain, shopifyProvider } from "@/lib/cms/shopify";
import {
  CMS_PROVIDERS,
  connectionKeyFor,
  describeCmsProviders,
  getCmsProvider,
  isCmsProviderKey,
  providerKeyFromConnection,
} from "@/lib/cms/registry";
import { assertPublicHttpUrl, statusLabel, trimTrailingSlash } from "@/lib/cms/types";
import { resolveRestBase, wordpressProvider } from "@/lib/cms/wordpress";
import { resolvePublishOptions } from "@/lib/cms";
import {
  isContentUrl,
  isSitemapIndex,
  originOf,
  parseSitemapLocations,
  rankCandidates,
  scoreCandidate,
  tokenize,
  type InternalLinkCandidate,
} from "@/lib/seo/internalLinks";

// ---------------------------------------------------------------------------
// WORDPRESS ROUTING — the bug that silently broke every publish
// ---------------------------------------------------------------------------

describe("resolveRestBase", () => {
  it("never returns a singular route, whatever was stored", () => {
    expect(resolveRestBase("post", "post")).toBe("posts");
    expect(resolveRestBase("page", "page")).toBe("pages");
  });

  it("follows the requested content type when no post type is stored", () => {
    expect(resolveRestBase("post")).toBe("posts");
    expect(resolveRestBase("page")).toBe("pages");
    expect(resolveRestBase("page", "")).toBe("pages");
  });

  it("keeps a custom post type slug exactly as the site spells it", () => {
    expect(resolveRestBase("post", "case_studies")).toBe("case_studies");
    expect(resolveRestBase("page", "docs")).toBe("docs");
  });

  it("a stored page type wins over a post request, because the site was configured that way", () => {
    expect(resolveRestBase("post", "pages")).toBe("pages");
  });
});

// ---------------------------------------------------------------------------
// SHOPIFY DOMAINS
// ---------------------------------------------------------------------------

describe("normalizeShopDomain", () => {
  it("accepts every shape a user pastes", () => {
    expect(normalizeShopDomain("my-store")).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("My-Store.myshopify.com")).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("https://my-store.myshopify.com/admin")).toBe(
      "my-store.myshopify.com"
    );
    expect(normalizeShopDomain("  shop.example.co.uk  ")).toBe("shop.example.co.uk");
  });

  it("returns empty for something that is not a domain, so the caller can refuse", () => {
    expect(normalizeShopDomain("")).toBe("");
    expect(normalizeShopDomain("not a domain")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// CUSTOM SITE SIGNATURE
// ---------------------------------------------------------------------------

describe("signPayload", () => {
  it("signs timestamp and body together, as the published contract states", () => {
    const a = signPayload("secret", 1700000000, '{"event":"ping"}');
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/);
    // Same body, different second → different signature (no replay of an old body).
    expect(signPayload("secret", 1700000001, '{"event":"ping"}')).not.toBe(a);
    // Same second, tampered body → different signature.
    expect(signPayload("secret", 1700000000, '{"event":"pong"}')).not.toBe(a);
    // Wrong secret cannot produce it.
    expect(signPayload("other", 1700000000, '{"event":"ping"}')).not.toBe(a);
  });

  it("is stable, so a handler can recompute it", () => {
    expect(signPayload("k", 42, "body")).toBe(signPayload("k", 42, "body"));
  });
});

// ---------------------------------------------------------------------------
// SSRF GUARD — the publish button must not become a request proxy
// ---------------------------------------------------------------------------

describe("assertPublicHttpUrl", () => {
  it("allows an ordinary public endpoint", () => {
    expect(assertPublicHttpUrl("https://example.com/api/publish").host).toBe("example.com");
    expect(assertPublicHttpUrl("http://example.com:3000/hook").port).toBe("3000");
  });

  it("refuses anything that resolves inside our own network", () => {
    for (const host of [
      "http://localhost/api",
      "http://app.localhost/api",
      "http://127.0.0.1/api",
      "http://127.5.5.5/api",
      "http://10.0.0.4/api",
      "http://192.168.1.10/api",
      "http://169.254.169.254/latest/meta-data",
      "http://172.16.0.1/api",
      "http://172.31.255.255/api",
      "http://0.0.0.0/api",
      "http://db.internal/api",
      "http://printer.local/api",
      "http://[::1]/api",
      "http://[fd00::1]/api",
    ]) {
      expect(() => assertPublicHttpUrl(host, "Publish endpoint")).toThrow(/public address/i);
    }
  });

  it("refuses non-http schemes and junk, naming the field", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd", "Publish endpoint")).toThrow(
      /must start with http/i
    );
    expect(() => assertPublicHttpUrl("ftp://example.com", "Publish endpoint")).toThrow(
      /must start with http/i
    );
    expect(() => assertPublicHttpUrl("", "Publish endpoint")).toThrow(/not a valid URL/i);
    expect(() => assertPublicHttpUrl("example.com", "Publish endpoint")).toThrow(/not a valid URL/i);
  });

  it("172.15 and 172.32 are public — the private block is only 16–31", () => {
    expect(assertPublicHttpUrl("http://172.15.0.1/api").hostname).toBe("172.15.0.1");
    expect(assertPublicHttpUrl("http://172.32.0.1/api").hostname).toBe("172.32.0.1");
  });
});

describe("trimTrailingSlash / statusLabel", () => {
  it("joins never double up", () => {
    expect(trimTrailingSlash("https://example.com///")).toBe("https://example.com");
    expect(trimTrailingSlash(" https://example.com/blog/ ")).toBe("https://example.com/blog");
  });

  it("labels the three states in the user's words", () => {
    expect(statusLabel("publish")).toBe("Published");
    expect(statusLabel("pending")).toBe("Pending review");
    expect(statusLabel("draft")).toBe("Draft");
  });
});

// ---------------------------------------------------------------------------
// REGISTRY — adding a platform must not need a change anywhere else
// ---------------------------------------------------------------------------

describe("provider registry", () => {
  it("ships the three platforms the user asked for", () => {
    expect(CMS_PROVIDERS.map((p) => p.key).sort()).toEqual(["custom", "shopify", "wordpress"]);
    expect(getCmsProvider("wordpress")).toBe(wordpressProvider);
    expect(getCmsProvider("shopify")).toBe(shopifyProvider);
    expect(getCmsProvider("custom")).toBe(customProvider);
    expect(getCmsProvider("wix")).toBeUndefined();
  });

  it("namespaces connection keys so a Plugins connector cannot collide", () => {
    expect(connectionKeyFor("shopify")).toBe("cms:shopify");
    expect(providerKeyFromConnection("cms:shopify")).toBe("shopify");
    // A Plugins row, or a provider this build dropped, is not a publish target.
    expect(providerKeyFromConnection("shopify")).toBeNull();
    expect(providerKeyFromConnection("cms:medium")).toBeNull();
    expect(isCmsProviderKey("custom")).toBe(true);
    expect(isCmsProviderKey("ghost")).toBe(false);
  });

  it("every provider can create something, and declares where each field is stored", () => {
    for (const provider of CMS_PROVIDERS) {
      expect(provider.contentTypes.length).toBeGreaterThan(0);
      expect(provider.statuses.length).toBeGreaterThan(0);
      expect(provider.fields.some((f) => f.required)).toBe(true);
      for (const field of provider.fields) {
        expect(["credentials", "meta"]).toContain(field.store);
        // A secret in readable meta would be handed back to the browser.
        if (field.secret) expect(field.store).toBe("credentials");
        if (field.type === "select") expect(field.options?.length).toBeGreaterThan(0);
      }
    }
  });

  it("the descriptor the browser receives carries no functions", () => {
    const described = describeCmsProviders();
    expect(described).toHaveLength(CMS_PROVIDERS.length);
    for (const d of described) {
      expect(typeof (d as any).verify).toBe("undefined");
      expect(typeof (d as any).publish).toBe("undefined");
      expect(JSON.parse(JSON.stringify(d))).toEqual(JSON.parse(JSON.stringify(d)));
    }
    // Mutating a descriptor must not reach the live provider.
    described[0].fields.push({
      key: "injected",
      label: "x",
      type: "text",
      required: true,
      secret: false,
      store: "meta",
    });
    expect(CMS_PROVIDERS[0].fields.some((f) => f.key === "injected")).toBe(false);
  });

  it("Shopify admits what it cannot do instead of pretending", () => {
    expect(shopifyProvider.statuses).not.toContain("pending");
    expect(shopifyProvider.supportsSchema).toBe(false);
    expect(wordpressProvider.supportsSchema).toBe(true);
    expect(customProvider.supportsSchema).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STATUS COERCION — an unsupported state must never become "live"
// ---------------------------------------------------------------------------

describe("resolvePublishOptions", () => {
  it("passes a supported request through untouched", () => {
    const res = resolvePublishOptions("wordpress", { contentType: "page", status: "pending" });
    expect(res).toEqual({ contentType: "page", status: "pending", warnings: [] });
  });

  it("downgrades pending to draft on Shopify and says so", () => {
    const res = resolvePublishOptions("shopify", { contentType: "post", status: "pending" });
    expect(res.status).toBe("draft");
    expect(res.contentType).toBe("post");
    expect(res.warnings.join(" ")).toMatch(/Shopify has no "pending" state/);
  });

  it("never escalates an unsupported status to publish", () => {
    for (const provider of CMS_PROVIDERS) {
      const res = resolvePublishOptions(provider.key, { contentType: "post", status: "pending" });
      if (!provider.statuses.includes("pending")) expect(res.status).not.toBe("publish");
    }
  });

  it("leaves an unknown platform's request alone rather than inventing a fallback", () => {
    const res = resolvePublishOptions("medium" as any, { contentType: "post", status: "publish" });
    expect(res).toEqual({ contentType: "post", status: "publish", warnings: [] });
  });
});

// ---------------------------------------------------------------------------
// INTERNAL LINK DISCOVERY — a link the site does not have is a 404 we shipped
// ---------------------------------------------------------------------------

describe("originOf", () => {
  it("normalises whatever the user saved as their site", () => {
    expect(originOf("example.com")).toBe("https://example.com");
    expect(originOf("https://example.com/blog/post-1?x=1")).toBe("https://example.com");
    expect(originOf("http://example.com:8080/x")).toBe("http://example.com:8080");
    expect(originOf("")).toBeNull();
    expect(originOf("   ")).toBeNull();
  });
});

describe("isContentUrl", () => {
  const origin = "https://mysite.com";

  it("accepts real pages on the same site", () => {
    expect(isContentUrl("https://mysite.com/email-marketing-for-dentists", origin)).toBe(true);
    expect(isContentUrl("https://mysite.com/blog/2025/guide", origin)).toBe(true);
  });

  it("rejects another domain, however similar", () => {
    expect(isContentUrl("https://othersite.com/page", origin)).toBe(false);
    expect(isContentUrl("https://sub.mysite.com/page", origin)).toBe(false);
    expect(isContentUrl("http://mysite.com/page", origin)).toBe(false); // scheme is part of identity
  });

  it("rejects the home page — an article linking to '/' helps nobody", () => {
    expect(isContentUrl("https://mysite.com/", origin)).toBe(false);
    expect(isContentUrl("https://mysite.com", origin)).toBe(false);
  });

  it("rejects the URL shapes that are never a useful destination", () => {
    for (const url of [
      "https://mysite.com/wp-content/uploads/x.png",
      "https://mysite.com/wp-json/wp/v2/posts",
      "https://mysite.com/blog/feed/",
      "https://mysite.com/category/news/",
      "https://mysite.com/tag/seo/",
      "https://mysite.com/author/admin/",
      "https://mysite.com/blog/page/3/",
      "https://mysite.com/post?replytocom=12",
      "https://mysite.com/hero.jpg",
      "https://mysite.com/whitepaper.pdf",
      "https://mysite.com/cart",
      "https://mysite.com/checkout/step-1",
      "https://mysite.com/privacy-policy",
      "https://mysite.com/wp-login.php",
    ]) {
      expect(isContentUrl(url, origin)).toBe(false);
    }
  });

  it("rejects anything that is not an absolute http URL", () => {
    expect(isContentUrl("/relative/path", origin)).toBe(false);
    expect(isContentUrl("javascript:alert(1)", origin)).toBe(false);
    expect(isContentUrl("", origin)).toBe(false);
  });
});

describe("tokenize / scoreCandidate", () => {
  it("drops filler words that would match everything", () => {
    expect(tokenize("The best complete guide about your blog")).toEqual([]);
    expect(tokenize("Email marketing for dentists")).toEqual(["email", "marketing", "dentists"]);
  });

  it("a keyword in the slug outranks the same keyword in a title", () => {
    const tokens = tokenize("dental implants");
    const inSlug = scoreCandidate("https://mysite.com/dental-implants", "Untitled", tokens);
    const inTitle = scoreCandidate("https://mysite.com/p/1234", "Dental implants explained", tokens);
    expect(inSlug).toBeGreaterThan(inTitle);
  });

  it("scores zero when the keyword produced no usable tokens", () => {
    expect(scoreCandidate("https://mysite.com/anything", "Anything", [])).toBe(0);
  });

  it("prefers a shallower page when relevance ties", () => {
    const tokens = tokenize("dental implants");
    const shallow = scoreCandidate("https://mysite.com/dental-implants", "", tokens);
    const deep = scoreCandidate("https://mysite.com/a/b/c/d/dental-implants", "", tokens);
    expect(shallow).toBeGreaterThan(deep);
  });
});

describe("parseSitemapLocations / isSitemapIndex", () => {
  it("reads locations and decodes entities", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://mysite.com/a</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>  https://mysite.com/b?x=1&amp;y=2  </loc></url>
    </urlset>`;
    expect(parseSitemapLocations(xml)).toEqual([
      "https://mysite.com/a",
      "https://mysite.com/b?x=1&y=2",
    ]);
  });

  it("returns nothing for junk instead of throwing", () => {
    expect(parseSitemapLocations("")).toEqual([]);
    expect(parseSitemapLocations("<html>not a sitemap</html>")).toEqual([]);
  });

  it("tells an index apart from a urlset", () => {
    expect(isSitemapIndex('<sitemapindex xmlns="x"><sitemap><loc>u</loc></sitemap></sitemapindex>')).toBe(
      true
    );
    expect(isSitemapIndex("<urlset><url><loc>u</loc></url></urlset>")).toBe(false);
  });
});

describe("rankCandidates", () => {
  const candidate = (url: string, title?: string): InternalLinkCandidate => ({
    url,
    title,
    source: "sitemap",
  });

  it("puts the pages that match the keyword first", () => {
    const ranked = rankCandidates(
      [
        candidate("https://mysite.com/about-us"),
        candidate("https://mysite.com/dental-implants-cost"),
        candidate("https://mysite.com/contact"),
      ],
      "dental implants",
      "How much do dental implants cost",
      3
    );
    expect(ranked[0].url).toBe("https://mysite.com/dental-implants-cost");
  });

  it("drops duplicates that differ only by a trailing slash or case", () => {
    const ranked = rankCandidates(
      [
        candidate("https://mysite.com/guide"),
        candidate("https://mysite.com/guide/"),
        candidate("https://MySite.com/GUIDE"),
      ],
      "guide",
      undefined,
      5
    );
    expect(ranked).toHaveLength(1);
  });

  it("keeps discovery order when nothing matches, rather than dropping everything", () => {
    const ranked = rankCandidates(
      [candidate("https://mysite.com/one"), candidate("https://mysite.com/two")],
      "unrelated topic",
      undefined,
      2
    );
    expect(ranked.map((c) => c.url)).toEqual(["https://mysite.com/one", "https://mysite.com/two"]);
  });

  it("honours the limit and never returns an empty list for a non-empty input", () => {
    const many = Array.from({ length: 30 }, (_, i) => candidate(`https://mysite.com/p-${i}`));
    expect(rankCandidates(many, "p", undefined, 4)).toHaveLength(4);
    expect(rankCandidates(many, "p", undefined, 0)).toHaveLength(1);
  });
});
