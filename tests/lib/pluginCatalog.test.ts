/**
 * PLUGIN DIRECTORY SUITE — the promises the one-directory-over-three-backends
 * design makes offline.
 *
 * WHY THIS EXISTS: the Plugins tab shows one flat list of rows, but a row's
 * connection is stored by one of three unrelated subsystems, and two of them are
 * matched by convention rather than by a foreign key:
 *
 *   - a `backend: "connector"` row is only clickable because a connector with
 *     that exact key exists in CONNECTOR_REGISTRY,
 *   - a `backend: "cms"` row is only publishable because the key is a real CMS
 *     provider key,
 *   - an attached MCP server is matched back to its row by *hostname*, because
 *     Zapier hands out a personal URL and GitMCP takes a repo path, so the paths
 *     differ per workspace while the host identifies the service.
 *
 * That last one is only safe while every preset host is unique, which is exactly
 * the kind of invariant a new catalog entry breaks silently. Nothing here touches
 * the network or the database.
 */
import { describe, expect, it } from "vitest";
import {
  PLUGIN_CATALOG,
  PLUGIN_SECTIONS,
  getPluginEntry,
  matchMcpPlugin,
  pluginsForBackend,
  pluginsInSection,
  resolvePluginKey,
} from "@/lib/plugins/catalog";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { isCmsProviderKey } from "@/lib/cms/registry";

describe("plugin catalog integrity", () => {
  it("has no duplicate keys", () => {
    const keys = PLUGIN_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts every row in a section the directory renders", () => {
    const sections = new Set(PLUGIN_SECTIONS.map((section) => section.key));
    for (const entry of PLUGIN_CATALOG) {
      expect(sections.has(entry.section)).toBe(true);
    }
  });

  it("accounts for every row across the sections", () => {
    const total = PLUGIN_SECTIONS.reduce((sum, s) => sum + pluginsInSection(s.key).length, 0);
    expect(total).toBe(PLUGIN_CATALOG.length);
  });

  it("gives every row a one-line blurb and at least one capability chip", () => {
    for (const entry of PLUGIN_CATALOG) {
      expect(entry.blurb.length).toBeGreaterThan(0);
      // The blurb is the single grey line under the name — a paragraph there is
      // the wall of text the directory exists to avoid.
      expect(entry.blurb.length).toBeLessThan(120);
      expect(entry.can.length).toBeGreaterThan(0);
    }
  });

  it("tells the user where to get the credential for everything but the lead tag", () => {
    for (const entry of PLUGIN_CATALOG) {
      expect(entry.setup.length).toBeGreaterThan(0);
    }
  });
});

describe("catalog rows resolve to a real backend", () => {
  it("names a connector that exists for every connector row", () => {
    const known = new Set(CONNECTOR_REGISTRY.map((c) => c.key));
    for (const entry of pluginsForBackend("connector")) {
      expect(known.has(entry.key as any)).toBe(true);
    }
  });

  it("names a real CMS provider for every publishing row", () => {
    for (const entry of pluginsForBackend("cms")) {
      expect(isCmsProviderKey(entry.key)).toBe(true);
    }
  });

  it("prefills a URL for every MCP row", () => {
    for (const entry of pluginsForBackend("mcp")) {
      expect(entry.mcp?.url).toMatch(/^https:\/\//);
    }
  });
});

describe("matchMcpPlugin", () => {
  it("keeps every preset host unique, which is what makes host matching safe", () => {
    const hosts = pluginsForBackend("mcp").map((entry) => new URL(entry.mcp!.url).hostname);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it("matches each preset back to its own row", () => {
    for (const entry of pluginsForBackend("mcp")) {
      expect(matchMcpPlugin(entry.mcp!.url)?.key).toBe(entry.key);
    }
  });

  it("matches a personal Zapier URL that shares only the host", () => {
    expect(matchMcpPlugin("https://mcp.zapier.com/api/mcp/s/NzE2/mcp")?.key).toBe("mcp-zapier");
  });

  it("matches GitMCP scoped to a repo", () => {
    expect(matchMcpPlugin("https://gitmcp.io/vercel/next.js")?.key).toBe("mcp-gitmcp");
  });

  it("ignores www and casing", () => {
    expect(matchMcpPlugin("https://WWW.Mcp.Context7.com/mcp")?.key).toBe("mcp-context7");
  });

  it("returns undefined for a server the user typed themselves", () => {
    expect(matchMcpPlugin("https://mcp.example.com/mcp")).toBeUndefined();
  });

  it("returns undefined rather than throwing on a broken URL", () => {
    expect(matchMcpPlugin("not a url")).toBeUndefined();
    expect(matchMcpPlugin("")).toBeUndefined();
  });
});

describe("resolvePluginKey", () => {
  it("passes an exact key straight through", () => {
    expect(resolvePluginKey("google-drive")).toBe("google-drive");
  });

  it("resolves the spellings deep links and the AI CEO actually use", () => {
    expect(resolvePluginKey("wp")).toBe("wordpress");
    expect(resolvePluginKey("woo")).toBe("woocommerce");
    expect(resolvePluginKey("Google Drive")).toBe("google-drive");
    expect(resolvePluginKey("tracking-tag")).toBe("website-tag");
    expect(resolvePluginKey("zapier")).toBe("mcp-zapier");
  });

  it("resolves a display name in any casing", () => {
    expect(resolvePluginKey("WooCommerce")).toBe("woocommerce");
    expect(resolvePluginKey("  heygen  ")).toBe("heygen");
  });

  it("returns null for nothing and for a service we do not ship", () => {
    expect(resolvePluginKey(null)).toBeNull();
    expect(resolvePluginKey("")).toBeNull();
    expect(resolvePluginKey("   ")).toBeNull();
    expect(resolvePluginKey("mailchimp")).toBeNull();
  });

  it("resolves every alias to a row that exists", () => {
    for (const entry of PLUGIN_CATALOG) {
      expect(getPluginEntry(entry.key)).toBeDefined();
    }
  });
});
