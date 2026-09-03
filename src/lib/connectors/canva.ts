// ============================================================================
// CANVA CONNECT API CLIENT — server-only. Never import from a client component.
//
// Canva Connect: https://www.canva.dev/docs/connect/
// Auth is OAuth with the workspace owner's own private integration, so there is
// no app of ours to get reviewed and the token stays inside their Canva team.
//
// One sharp edge worth knowing about: Canva ROTATES the refresh token on every
// refresh and invalidates the old one. Callers pass `onRotate` so the new value
// is written back to the stored credentials — skip that and the connector works
// exactly once.
// ============================================================================

const CANVA_API = "https://api.canva.com/rest/v1";

export interface CanvaCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  editUrl: string | null;
  viewUrl: string | null;
  updatedAt: string | null;
}

export type CanvaExportFormat = "png" | "jpg" | "pdf";

/** Exchanges the refresh token for an access token, returning the rotated one. */
async function refresh(
  creds: CanvaCredentials
): Promise<{ ok: boolean; token?: string; rotated?: string; error?: string }> {
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    return { ok: false, error: "Canva client id, secret and refresh token are all required." };
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  try {
    const res = await fetch(`${CANVA_API}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const body = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    } | null;

    if (!res.ok || !body?.access_token) {
      const detail = body?.error_description || body?.error || `HTTP ${res.status}`;
      return {
        ok: false,
        error:
          res.status === 401 || body?.error === "invalid_grant"
            ? "Canva rejected the refresh token. Refresh tokens rotate on use — authorise the integration again to get a fresh one."
            : `Canva refused to issue an access token (${detail}).`,
      };
    }

    return { ok: true, token: body.access_token, rotated: body.refresh_token || undefined };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Canva.",
    };
  }
}

/** Called with the rotated refresh token so the caller can store it. */
export type CanvaRotateHandler = (refreshToken: string) => void | Promise<void>;

async function canva<T>(
  creds: CanvaCredentials,
  path: string,
  init?: RequestInit,
  onRotate?: CanvaRotateHandler
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const auth = await refresh(creds);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (auth.rotated && auth.rotated !== creds.refreshToken && onRotate) {
    try {
      await onRotate(auth.rotated);
    } catch {
      // A failed write-back is not worth failing the user's request over; the
      // next call will simply refresh again.
    }
  }

  try {
    const res = await fetch(`${CANVA_API}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      return {
        ok: false,
        status: res.status,
        error:
          res.status === 403
            ? `Canva denied the request (${body?.code || "missing scope"}). Add the scope to your integration and authorise it again.`
            : `Canva API error ${res.status}${body?.message ? `: ${body.message}` : ""}`,
      };
    }

    if (res.status === 204) return { ok: true };
    return { ok: true, data: (await res.json()) as T };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Canva.",
    };
  }
}

/** Verifies the credentials by reading the connected Canva profile. */
export async function getCanvaAccount(
  creds: CanvaCredentials,
  onRotate?: CanvaRotateHandler
): Promise<{ success: boolean; label?: string; error?: string }> {
  const res = await canva<{ profile?: { display_name?: string } }>(
    creds,
    "/users/me/profile",
    undefined,
    onRotate
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, label: res.data?.profile?.display_name || "Canva account" };
}

export async function listCanvaDesigns(
  creds: CanvaCredentials,
  options: { limit?: number; query?: string } = {},
  onRotate?: CanvaRotateHandler
): Promise<{ success: boolean; designs?: CanvaDesign[]; error?: string }> {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set("query", options.query.trim());

  const res = await canva<{
    items?: Array<{
      id?: string;
      title?: string;
      updated_at?: number | string;
      thumbnail?: { url?: string };
      urls?: { edit_url?: string; view_url?: string };
    }>;
  }>(creds, `/designs${params.toString() ? `?${params.toString()}` : ""}`, undefined, onRotate);

  if (!res.ok) return { success: false, error: res.error };

  const limit = Math.min(Math.max(options.limit || 20, 1), 50);
  const designs = (res.data?.items || [])
    .filter((d) => d?.id)
    .slice(0, limit)
    .map((d) => ({
      id: String(d.id),
      title: d.title || "Untitled design",
      thumbnailUrl: d.thumbnail?.url || null,
      editUrl: d.urls?.edit_url || null,
      viewUrl: d.urls?.view_url || null,
      updatedAt: d.updated_at != null ? String(d.updated_at) : null,
    }));

  return { success: true, designs };
}

/**
 * Exports a design and waits for the render. Canva returns a job, so this polls
 * — with a hard ceiling, because it runs inside a chat turn and an export that
 * takes longer than this should be reported rather than waited on.
 */
export async function exportCanvaDesign(
  creds: CanvaCredentials,
  input: { designId: string; format?: CanvaExportFormat; pages?: number[] },
  onRotate?: CanvaRotateHandler
): Promise<{ success: boolean; urls?: string[]; format?: CanvaExportFormat; error?: string }> {
  const designId = (input.designId || "").trim();
  if (!designId) return { success: false, error: "A design id is required." };

  const format = input.format || "png";
  const start = await canva<{ job?: { id?: string; status?: string; urls?: string[] } }>(
    creds,
    "/exports",
    {
      method: "POST",
      body: JSON.stringify({
        design_id: designId,
        format: {
          type: format,
          ...(input.pages?.length ? { pages: input.pages } : {}),
        },
      }),
    },
    onRotate
  );

  if (!start.ok) return { success: false, error: start.error };

  const jobId = start.data?.job?.id;
  if (start.data?.job?.status === "success" && start.data.job.urls?.length) {
    return { success: true, urls: start.data.job.urls, format };
  }
  if (!jobId) return { success: false, error: "Canva did not return an export job." };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const poll = await canva<{ job?: { status?: string; urls?: string[]; error?: { message?: string } } }>(
      creds,
      `/exports/${encodeURIComponent(jobId)}`,
      undefined,
      onRotate
    );
    if (!poll.ok) return { success: false, error: poll.error };

    const job = poll.data?.job;
    if (job?.status === "success") {
      if (!job.urls?.length) {
        return { success: false, error: "Canva finished the export but returned no file." };
      }
      return { success: true, urls: job.urls, format };
    }
    if (job?.status === "failed") {
      return { success: false, error: job.error?.message || "Canva reported the export as failed." };
    }
  }

  return {
    success: false,
    error: "The export is still rendering in Canva. Try again in a moment.",
  };
}
