// ============================================================================
// GITHUB REST CLIENT — server-only. Used by the Plugins connection test and
// by the AI CEO chat tools. Never import this from a client component.
// ============================================================================

const GITHUB_API = "https://api.github.com";

interface GitHubUserResponse {
  login?: string;
  name?: string | null;
  html_url?: string;
  avatar_url?: string | null;
}

interface GitHubRepoResponse {
  name?: string;
  full_name?: string;
  description?: string | null;
  html_url?: string;
  private?: boolean;
  default_branch?: string;
  updated_at?: string;
}

interface GitHubContentResponse {
  sha?: string;
  content?: { html_url?: string };
}

interface GitHubErrorResponse {
  message?: string;
}

interface GitHubResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

async function gh<T>(
  path: string,
  pat: string,
  init?: RequestInit
): Promise<GitHubResponse<T>> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PostloomAI-Connectors",
        ...(init?.headers || {}),
      },
    });

    if (!res.ok) {
      let message = `GitHub API error ${res.status}`;
      try {
        const body = (await res.json()) as GitHubErrorResponse;
        if (body?.message) message = `GitHub API error ${res.status}: ${body.message}`;
      } catch {
        // keep default message
      }
      return { ok: false, error: message, status: res.status };
    }

    if (res.status === 204) return { ok: true, data: undefined as T };
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting GitHub.",
    };
  }
}

export interface GitHubAccount {
  login: string;
  name: string | null;
  htmlUrl: string;
  avatarUrl: string | null;
}

/** Verifies a PAT and returns the account it belongs to. */
export async function getGitHubAccount(pat: string): Promise<{
  success: boolean;
  account?: GitHubAccount;
  error?: string;
}> {
  if (!pat?.trim()) return { success: false, error: "No personal access token provided." };

  const res = await gh<GitHubUserResponse>("/user", pat.trim());
  if (!res.ok) {
    return {
      success: false,
      error:
        res.status === 401
          ? "GitHub rejected the token. Check that it is valid and not expired."
          : res.error || "Could not verify the token.",
    };
  }

  return {
    success: true,
    account: {
      login: res.data?.login || "",
      name: res.data?.name ?? null,
      htmlUrl: res.data?.html_url || "",
      avatarUrl: res.data?.avatar_url ?? null,
    },
  };
}

export interface GitHubRepo {
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string;
}

export async function listGitHubRepos(
  pat: string,
  limit: number = 20
): Promise<{ success: boolean; repos?: GitHubRepo[]; error?: string }> {
  const res = await gh<GitHubRepoResponse[]>(
    `/user/repos?per_page=${Math.min(Math.max(limit, 1), 100)}&sort=updated&direction=desc`,
    pat
  );
  if (!res.ok) return { success: false, error: res.error };

  const repos: GitHubRepo[] = (res.data || []).map((r) => ({
    name: r.name || "",
    fullName: r.full_name || "",
    description: r.description ?? null,
    htmlUrl: r.html_url || "",
    isPrivate: r.private === true,
    defaultBranch: r.default_branch || "main",
    updatedAt: r.updated_at || "",
  }));

  return { success: true, repos };
}

export async function createGitHubRepo(
  pat: string,
  input: { name: string; description?: string; isPrivate?: boolean; autoInit?: boolean }
): Promise<{ success: boolean; repo?: GitHubRepo; error?: string }> {
  const name = (input.name || "").trim().replace(/\s+/g, "-");
  if (!name) return { success: false, error: "Repository name is required." };

  const res = await gh<GitHubRepoResponse>("/user/repos", pat, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description: input.description?.trim() || undefined,
      private: input.isPrivate === true,
      auto_init: input.autoInit !== false,
    }),
  });

  if (!res.ok) return { success: false, error: res.error };

  return {
    success: true,
    repo: {
      name: res.data?.name || name,
      fullName: res.data?.full_name || "",
      description: res.data?.description ?? null,
      htmlUrl: res.data?.html_url || "",
      isPrivate: res.data?.private === true,
      defaultBranch: res.data?.default_branch || "main",
      updatedAt: res.data?.updated_at || "",
    },
  };
}

async function getDefaultBranch(pat: string, owner: string, repo: string): Promise<string> {
  const res = await gh<GitHubRepoResponse>(`/repos/${owner}/${repo}`, pat);
  if (res.ok && res.data?.default_branch) return res.data.default_branch;
  return "main";
}

export interface PushFile {
  path: string;
  content: string;
}

export interface PushedFileResult {
  path: string;
  ok: boolean;
  error?: string;
  htmlUrl?: string;
}

/**
 * Pushes files via the GitHub Contents API (base64 blobs — no local git
 * binary needed, works on serverless). Existing files are updated, new
 * files are created. Pushes target the repo's default branch.
 */
export async function pushFilesToGitHub(
  pat: string,
  input: {
    owner: string;
    repo: string;
    message?: string;
    branch?: string;
    files: PushFile[];
  }
): Promise<{
  success: boolean;
  branch?: string;
  repoUrl?: string;
  files?: PushedFileResult[];
  error?: string;
}> {
  const files = (input.files || []).filter(
    (f) => f && typeof f.path === "string" && f.path.trim() && typeof f.content === "string"
  );
  if (!input.owner || !input.repo) {
    return { success: false, error: "Repository owner and name are required." };
  }
  if (files.length === 0) {
    return { success: false, error: "At least one file with a path and content is required." };
  }
  if (files.length > 30) {
    return { success: false, error: "Too many files in one push (max 30). Split into multiple pushes." };
  }

  const branch = input.branch?.trim() || (await getDefaultBranch(pat, input.owner, input.repo));
  const commitMessage =
    input.message?.trim() || `Update via PostloomAI (${new Date().toISOString().slice(0, 10)})`;

  const results: PushedFileResult[] = [];

  for (const file of files) {
    const path = file.path.trim().replace(/^\/+/, "");
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");

    const contentRes = await gh<GitHubContentResponse>(
      `/repos/${input.owner}/${input.repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
      pat
    );
    const sha = contentRes.ok && contentRes.data?.sha ? contentRes.data.sha : undefined;

    const putRes = await gh<GitHubContentResponse>(
      `/repos/${input.owner}/${input.repo}/contents/${encodedPath}`,
      pat,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: sha ? `${commitMessage} (update ${path})` : `${commitMessage} (create ${path})`,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    results.push({
      path,
      ok: putRes.ok,
      error: putRes.ok ? undefined : putRes.error,
      htmlUrl: putRes.ok ? putRes.data?.content?.html_url : undefined,
    });
  }

  const failed = results.filter((r) => !r.ok);
  const repoRes = await gh<GitHubRepoResponse>(`/repos/${input.owner}/${input.repo}`, pat);

  return {
    success: failed.length === 0,
    branch,
    repoUrl: repoRes.ok ? repoRes.data?.html_url : `https://github.com/${input.owner}/${input.repo}`,
    files: results,
    error:
      failed.length > 0
        ? `${failed.length} of ${results.length} files failed: ${failed
            .map((f) => `${f.path} — ${f.error}`)
            .join("; ")
            .slice(0, 500)}`
        : undefined,
  };
}
