import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getGitHubAccount,
  createGitHubRepo,
  pushFilesToGitHub,
} from "@/lib/connectors/github";

/**
 * Regression tests for the GitHub connector client.
 *
 * Locks in: token verification errors surface the real GitHub message, repo
 * names are normalized, file pushes create-vs-update via the Contents API
 * (sha only sent for existing files), and the default branch is resolved
 * from the repo metadata.
 */

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let idx = 0;
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(idx, responses.length - 1)];
    idx++;
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.json ?? {},
      text: async () => JSON.stringify(r.json ?? {}),
      headers: { get: () => "application/json" },
    } as unknown as Response;
  });
  return calls;
}

describe("getGitHubAccount", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the login on a valid token", async () => {
    mockFetchSequence([
      { ok: true, json: { login: "octocat", html_url: "https://github.com/octocat" } },
    ]);

    const res = await getGitHubAccount("valid_pat");
    expect(res.success).toBe(true);
    expect(res.account?.login).toBe("octocat");
    expect(res.account?.htmlUrl).toBe("https://github.com/octocat");
  });

  it("returns a clear error for a rejected token (401)", async () => {
    mockFetchSequence([{ ok: false, status: 401, json: { message: "Bad credentials" } }]);

    const res = await getGitHubAccount("bad_pat");
    expect(res.success).toBe(false);
    expect(res.error).toContain("GitHub rejected the token");
  });

  it("rejects an empty token without a network call", async () => {
    const calls = mockFetchSequence([]);
    const res = await getGitHubAccount("  ");
    expect(res.success).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe("createGitHubRepo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes spaces in the repo name to hyphens", async () => {
    const calls = mockFetchSequence([
      {
        ok: true,
        json: {
          name: "my-project",
          full_name: "octocat/my-project",
          html_url: "https://github.com/octocat/my-project",
          private: false,
          default_branch: "main",
        },
      },
    ]);

    const res = await createGitHubRepo("pat", { name: "my project" });
    expect(res.success).toBe(true);
    expect(res.repo?.fullName).toBe("octocat/my-project");

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.name).toBe("my-project");
  });

  it("surfaces the GitHub error message when creation fails", async () => {
    mockFetchSequence([{ ok: false, status: 422, json: { message: "name already exists" } }]);

    const res = await createGitHubRepo("pat", { name: "dup" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("name already exists");
  });

  it("rejects a blank repo name", async () => {
    const calls = mockFetchSequence([]);
    const res = await createGitHubRepo("pat", { name: "   " });
    expect(res.success).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe("pushFilesToGitHub", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new file without sha and updates an existing file with its sha", async () => {
    const calls = mockFetchSequence([
      // CREATE push: repo metadata (default branch)
      { ok: true, json: { default_branch: "main", html_url: "https://github.com/octocat/repo" } },
      // CREATE push: contents GET -> 404 (not found)
      { ok: false, status: 404, json: { message: "Not Found" } },
      // CREATE push: contents PUT
      { ok: true, json: { content: { html_url: "https://github.com/octocat/repo/blob/main/README.md" } } },
      // CREATE push: final repo metadata for URL
      { ok: true, json: { default_branch: "main", html_url: "https://github.com/octocat/repo" } },
      // UPDATE push: repo metadata
      { ok: true, json: { default_branch: "main", html_url: "https://github.com/octocat/repo" } },
      // UPDATE push: contents GET -> 200 with sha
      { ok: true, json: { sha: "abc123" } },
      // UPDATE push: contents PUT
      { ok: true, json: { content: { html_url: "https://github.com/octocat/repo/blob/main/README.md" } } },
      // UPDATE push: final repo metadata
      { ok: true, json: { default_branch: "main", html_url: "https://github.com/octocat/repo" } },
    ]);

    const createRes = await pushFilesToGitHub("pat", {
      owner: "octocat",
      repo: "repo",
      message: "init",
      files: [{ path: "README.md", content: "# New project" }],
    });
    expect(createRes.success).toBe(true);
    expect(createRes.repoUrl).toBe("https://github.com/octocat/repo");

    const createPut = calls.find((c) => c.url.includes("/contents/README.md") && c.init?.method === "PUT");
    const createBody = JSON.parse(String(createPut?.init?.body));
    expect(createBody.sha).toBeUndefined();
    expect(Buffer.from(createBody.content, "base64").toString("utf8")).toBe("# New project");

    const updateRes = await pushFilesToGitHub("pat", {
      owner: "octocat",
      repo: "repo",
      files: [{ path: "README.md", content: "# Updated project" }],
    });
    expect(updateRes.success).toBe(true);

    const updatePut = calls.filter((c) => c.url.includes("/contents/README.md") && c.init?.method === "PUT").pop();
    const updateBody = JSON.parse(String(updatePut?.init?.body));
    expect(updateBody.sha).toBe("abc123");
  });

  it("resolves the default branch from repo metadata when omitted", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { default_branch: "develop", html_url: "https://github.com/octocat/repo" } },
      { ok: false, status: 404, json: {} },
      { ok: true, json: { content: {} } },
      { ok: true, json: { default_branch: "develop", html_url: "https://github.com/octocat/repo" } },
    ]);

    const res = await pushFilesToGitHub("pat", {
      owner: "octocat",
      repo: "repo",
      files: [{ path: "docs.md", content: "hello" }],
    });
    expect(res.success).toBe(true);
    expect(res.branch).toBe("develop");

    const putBody = JSON.parse(
      String(calls.find((c) => c.init?.method === "PUT")?.init?.body)
    );
    expect(putBody.branch).toBe("develop");
  });

  it("rejects a push with no files", async () => {
    const calls = mockFetchSequence([]);
    const res = await pushFilesToGitHub("pat", {
      owner: "octocat",
      repo: "repo",
      files: [],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("At least one file");
    expect(calls.length).toBe(0);
  });

  it("reports per-file failure without throwing", async () => {
    mockFetchSequence([
      { ok: true, json: { default_branch: "main", html_url: "https://github.com/octocat/repo" } },
      { ok: false, status: 404, json: {} },
      { ok: false, status: 422, json: { message: "sha mismatch" } },
      { ok: true, json: { default_branch: "main", html_url: "https://github.com/octocat/repo" } },
    ]);

    const res = await pushFilesToGitHub("pat", {
      owner: "octocat",
      repo: "repo",
      files: [{ path: "README.md", content: "x" }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("README.md");
    expect(res.error).toContain("sha mismatch");
    expect(res.files?.[0]?.ok).toBe(false);
  });
});
