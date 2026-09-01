import { describe, it, expect } from "vitest";
import {
  validateMcpUrl,
  sanitizeMcpName,
  simplifyToolResult,
} from "@/lib/mcp/client";
import { buildMcpToolDefs } from "@/lib/mcp/tools";

/**
 * Regression tests for the MCP layer's pure helpers.
 *
 * Locks in: URL validation (SSRF guard in production), server-name
 * sanitization for prefixed tool names, MCP result flattening, and the
 * toolCache → ToolDef conversion with the mcp__ prefix.
 */

describe("validateMcpUrl", () => {
  it("accepts an https URL and normalizes it", () => {
    const res = validateMcpUrl("https://mcp.example.com/mcp");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://mcp.example.com/mcp");
  });

  it("auto-prefixes https when the scheme is missing", () => {
    const res = validateMcpUrl("mcp.example.com/mcp");
    expect(res.ok).toBe(true);
    expect(res.url?.startsWith("https://mcp.example.com")).toBe(true);
  });

  it("rejects an empty URL", () => {
    const res = validateMcpUrl("   ");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Enter");
  });

  it("rejects a non-http(s) scheme", () => {
    const res = validateMcpUrl("ftp://mcp.example.com");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("http(s)");
  });

  it("blocks private-range hostnames in production", () => {
    const prev = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    try {
      for (const host of ["http://10.0.0.5/mcp", "http://192.168.1.4/mcp", "http://172.20.1.1/mcp", "http://169.254.169.254/mcp", "https://db.internal/mcp"]) {
        const res = validateMcpUrl(host);
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/Internal|https/);
      }
    } finally {
      (process.env as any).NODE_ENV = prev;
    }
  });

  it("blocks plain http in production but allows it in development", () => {
    const prev = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      expect(validateMcpUrl("http://mcp.example.com").ok).toBe(false);

      (process.env as any).NODE_ENV = "development";
      const dev = validateMcpUrl("http://mcp.example.com");
      expect(dev.ok).toBe(true);
      expect(dev.url).toBe("http://mcp.example.com/");
    } finally {
      (process.env as any).NODE_ENV = prev;
    }
  });
});

describe("sanitizeMcpName", () => {
  it("lowercases and hyphenates", () => {
    expect(sanitizeMcpName("Docs Search Pro")).toBe("docs-search-pro");
  });

  it("strips unsafe characters", () => {
    expect(sanitizeMcpName("My Server!!! #1")).toBe("my-server-1");
  });

  it("caps the length at 24 characters", () => {
    expect(sanitizeMcpName("a".repeat(40)).length).toBe(24);
  });

  it("falls back to 'server' for junk input", () => {
    expect(sanitizeMcpName("!!!")).toBe("server");
    expect(sanitizeMcpName("")).toBe("server");
  });
});

describe("simplifyToolResult", () => {
  it("joins pure text content into a plain string", () => {
    const res = simplifyToolResult({
      content: [
        { type: "text", text: "line 1" },
        { type: "text", text: "line 2" },
      ],
    });
    expect(res).toBe("line 1\nline 2");
  });

  it("keeps structure when non-text content is present", () => {
    const res = simplifyToolResult({
      content: [
        { type: "image", data: "abc" },
        { type: "text", text: "caption" },
      ],
    }) as any;
    expect(typeof res).toBe("object");
    expect(res.content).toEqual(["caption"]);
    expect(Array.isArray(res.structuredContent)).toBe(false);
  });

  it("returns null for an empty result", () => {
    expect(simplifyToolResult(null)).toBeNull();
    expect(simplifyToolResult(undefined)).toBeNull();
  });
});

describe("buildMcpToolDefs", () => {
  it("prefixes tool names and forwards schemas", () => {
    const defs = buildMcpToolDefs("Docs Search", "https://mcp.example.com/mcp", {}, [
      {
        name: "search_docs",
        description: "Search documentation",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ]);

    expect(defs.length).toBe(1);
    expect(defs[0].name).toBe("mcp__docs-search__search_docs");
    expect(defs[0].description).toContain("[MCP tool from server \"Docs Search\"]");
    expect(defs[0].description).toContain("Search documentation");
    expect(defs[0].parameters.properties.query).toBeDefined();
  });

  it("defaults to an empty object schema when none is provided", () => {
    const defs = buildMcpToolDefs("srv", "https://x.example.com/mcp", {}, [
      { name: "tool", description: "", inputSchema: { type: "object", properties: {} } },
    ]);
    expect(defs[0].parameters).toEqual({ type: "object", properties: {} });
  });
});
