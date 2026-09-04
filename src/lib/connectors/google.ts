// ============================================================================
// GOOGLE API CLIENT (GMAIL + DRIVE) — server-only. Never import from a client
// component. Search Console builds on the request helper at the bottom of the
// token section rather than repeating it.
//
// There is no hosted OAuth app here on purpose: the workspace owner creates their
// own client in the Cloud Console and pastes clientId + clientSecret +
// refreshToken. That means no consent screen to maintain, no verification review,
// and the token never leaves the user's own project.
//
// A refresh token is not a credential you can call an API with, so every call
// mints a short-lived access token first. Those last an hour, so they are cached
// in-process — a chat turn that reads five messages should not mint five tokens.
//
// Gmail: https://developers.google.com/gmail/api/reference/rest
// Drive:  https://developers.google.com/drive/api/reference/rest/v3
// ============================================================================

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Access tokens keyed by refresh token, with a minute of slack on expiry. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(
  creds: GoogleCredentials
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const key = creds.refreshToken || "";
  if (!creds.clientId || !creds.clientSecret || !key) {
    return { ok: false, error: "Google client id, secret and refresh token are all required." };
  }

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { ok: true, token: cached.token };
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: key,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const body = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    } | null;

    if (!res.ok || !body?.access_token) {
      const detail = body?.error_description || body?.error || `HTTP ${res.status}`;
      return {
        ok: false,
        error:
          body?.error === "invalid_grant"
            ? "Google rejected the refresh token. It was revoked, or it belongs to a different client — generate a new one."
            : `Google refused to issue an access token (${detail}).`,
      };
    }

    const ttl = (body.expires_in || 3600) * 1000;
    tokenCache.set(key, { token: body.access_token, expiresAt: Date.now() + ttl });
    return { ok: true, token: body.access_token };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Google.",
    };
  }
}

async function gapi<T>(
  creds: GoogleCredentials,
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const auth = await accessToken(creds);
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.token}`,
        ...(init?.body && !(init.headers as Record<string, string>)?.["Content-Type"]
          ? { "Content-Type": "application/json" }
          : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string; status?: string };
      } | null;
      const message = body?.error?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        status: res.status,
        error:
          res.status === 403
            ? `Google denied the request (${message}). The API may not be enabled on your project, or the refresh token is missing that scope.`
            : `Google API error: ${message}`,
      };
    }

    if (res.status === 204) return { ok: true };
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      return { ok: true, data: (await res.text()) as unknown as T };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Google.",
    };
  }
}

/**
 * The authenticated Google request, for the other Google clients in this project.
 *
 * Exported so Search Console does not carry its own copy of the token minting:
 * the access-token cache is keyed by refresh token and shared, and the sentence
 * a 403 produces — "the API may not be enabled on your project" — is the single
 * most useful error in this whole flow. Two copies of it would drift into two
 * different explanations of the same failure.
 */
export async function googleApiRequest<T>(
  creds: GoogleCredentials,
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  return gapi<T>(creds, url, init);
}

// --------------------------------------------------------------------- Gmail

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: Array<{ name?: string; value?: string }>;
}

function header(headers: Array<{ name?: string; value?: string }> | undefined, want: string) {
  const hit = (headers || []).find((h) => (h.name || "").toLowerCase() === want.toLowerCase());
  return hit?.value || "";
}

/** Depth-first walk for the first text/plain part, falling back to text/html. */
function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";
  const decode = (data?: string) => (data ? Buffer.from(data, "base64url").toString("utf8") : "");

  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);

  for (const child of part.parts || []) {
    const found = extractBody(child);
    if (found) return found;
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return decode(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

/** Verifies the credentials by reading the mailbox profile. */
export async function getGmailAccount(
  creds: GoogleCredentials
): Promise<{ success: boolean; email?: string; total?: number; error?: string }> {
  const res = await gapi<{ emailAddress?: string; messagesTotal?: number }>(
    creds,
    `${GMAIL}/profile`
  );
  if (!res.ok) return { success: false, error: res.error };
  return {
    success: true,
    email: res.data?.emailAddress || undefined,
    total: res.data?.messagesTotal ?? undefined,
  };
}

/**
 * Lists messages matching a Gmail search query ("is:unread", "from:x@y.com").
 * Gmail's list call returns ids only, so each one is fetched for its headers —
 * hence the low cap: this is one HTTP call per message.
 */
export async function listGmailMessages(
  creds: GoogleCredentials,
  options: { query?: string; limit?: number } = {}
): Promise<{ success: boolean; messages?: GmailMessageSummary[]; error?: string }> {
  const limit = Math.min(Math.max(options.limit || 10, 1), 25);
  const params = new URLSearchParams({ maxResults: String(limit) });
  if (options.query?.trim()) params.set("q", options.query.trim());

  const list = await gapi<{ messages?: Array<{ id?: string; threadId?: string }> }>(
    creds,
    `${GMAIL}/messages?${params.toString()}`
  );
  if (!list.ok) return { success: false, error: list.error };

  const ids = (list.data?.messages || []).map((m) => m.id).filter((id): id is string => !!id);
  if (ids.length === 0) return { success: true, messages: [] };

  const detailParams =
    "format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date";

  const messages = await Promise.all(
    ids.map(async (id) => {
      const one = await gapi<{
        id?: string;
        threadId?: string;
        snippet?: string;
        labelIds?: string[];
        payload?: GmailPart;
      }>(creds, `${GMAIL}/messages/${encodeURIComponent(id)}?${detailParams}`);
      if (!one.ok || !one.data) return null;
      return {
        id: one.data.id || id,
        threadId: one.data.threadId || "",
        from: header(one.data.payload?.headers, "From"),
        subject: header(one.data.payload?.headers, "Subject") || "(no subject)",
        date: header(one.data.payload?.headers, "Date"),
        snippet: one.data.snippet || "",
        unread: (one.data.labelIds || []).includes("UNREAD"),
      } satisfies GmailMessageSummary;
    })
  );

  return { success: true, messages: messages.filter((m): m is GmailMessageSummary => !!m) };
}

/** Reads one message, with the body flattened to text. */
export async function readGmailMessage(
  creds: GoogleCredentials,
  messageId: string
): Promise<{
  success: boolean;
  message?: GmailMessageSummary & { to: string; body: string };
  error?: string;
}> {
  if (!messageId?.trim()) return { success: false, error: "A message id is required." };

  const res = await gapi<{
    id?: string;
    threadId?: string;
    snippet?: string;
    labelIds?: string[];
    payload?: GmailPart;
  }>(creds, `${GMAIL}/messages/${encodeURIComponent(messageId.trim())}?format=full`);

  if (!res.ok) return { success: false, error: res.error };

  const body = extractBody(res.data?.payload);
  return {
    success: true,
    message: {
      id: res.data?.id || messageId,
      threadId: res.data?.threadId || "",
      from: header(res.data?.payload?.headers, "From"),
      to: header(res.data?.payload?.headers, "To"),
      subject: header(res.data?.payload?.headers, "Subject") || "(no subject)",
      date: header(res.data?.payload?.headers, "Date"),
      snippet: res.data?.snippet || "",
      unread: (res.data?.labelIds || []).includes("UNREAD"),
      body: body.slice(0, 12000),
    },
  };
}

/** RFC 2047 so a subject with an accent or emoji survives the transport. */
function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/**
 * Sends an email as the connected mailbox, or saves it as a draft.
 * Header values are stripped of CR/LF: a newline in `to` or `subject` would let
 * injected text become extra headers.
 */
export async function sendGmailEmail(
  creds: GoogleCredentials,
  input: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    html?: boolean;
    draftOnly?: boolean;
  }
): Promise<{ success: boolean; id?: string; threadId?: string; draft?: boolean; error?: string }> {
  const clean = (value: string) => String(value || "").replace(/[\r\n]+/g, " ").trim();
  const to = clean(input.to);
  const subject = clean(input.subject);
  if (!to) return { success: false, error: "A recipient is required." };
  if (!input.body?.trim()) return { success: false, error: "The email body is empty." };

  const lines = [
    `To: ${to}`,
    ...(input.cc ? [`Cc: ${clean(input.cc)}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: text/${input.html ? "html" : "plain"}; charset="UTF-8"`,
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body,
  ];

  const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");

  const res = input.draftOnly
    ? await gapi<{ id?: string; message?: { id?: string; threadId?: string } }>(
        creds,
        `${GMAIL}/drafts`,
        { method: "POST", body: JSON.stringify({ message: { raw } }) }
      )
    : await gapi<{ id?: string; threadId?: string }>(creds, `${GMAIL}/messages/send`, {
        method: "POST",
        body: JSON.stringify({ raw }),
      });

  if (!res.ok) return { success: false, error: res.error };

  const data = res.data as { id?: string; threadId?: string; message?: { id?: string; threadId?: string } } | undefined;
  return {
    success: true,
    draft: input.draftOnly === true,
    id: data?.message?.id || data?.id,
    threadId: data?.message?.threadId || data?.threadId,
  };
}

// --------------------------------------------------------------------- Drive

const DRIVE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_DOC = "application/vnd.google-apps.document";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  size: number | null;
}

/** Verifies the credentials by reading the Drive account. */
export async function getDriveAccount(
  creds: GoogleCredentials
): Promise<{ success: boolean; email?: string; name?: string; error?: string }> {
  const res = await gapi<{ user?: { displayName?: string; emailAddress?: string } }>(
    creds,
    `${DRIVE}/about?fields=user(displayName,emailAddress)`
  );
  if (!res.ok) return { success: false, error: res.error };
  return {
    success: true,
    email: res.data?.user?.emailAddress || undefined,
    name: res.data?.user?.displayName || undefined,
  };
}

export async function listDriveFiles(
  creds: GoogleCredentials,
  options: { search?: string; folderId?: string; limit?: number } = {}
): Promise<{ success: boolean; files?: DriveFile[]; error?: string }> {
  const limit = Math.min(Math.max(options.limit || 20, 1), 50);

  // Drive's query language wants quotes escaped, and trashed files excluded.
  const clauses = ["trashed = false"];
  if (options.search?.trim()) {
    clauses.push(`name contains '${options.search.trim().replace(/'/g, "\\'")}'`);
  }
  if (options.folderId?.trim()) {
    clauses.push(`'${options.folderId.trim().replace(/'/g, "\\'")}' in parents`);
  }

  const params = new URLSearchParams({
    q: clauses.join(" and "),
    pageSize: String(limit),
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,size)",
  });

  const res = await gapi<{ files?: Array<Record<string, unknown>> }>(
    creds,
    `${DRIVE}/files?${params.toString()}`
  );
  if (!res.ok) return { success: false, error: res.error };

  const files = (res.data?.files || []).map((f) => ({
    id: String(f.id || ""),
    name: String(f.name || "Untitled"),
    mimeType: String(f.mimeType || ""),
    modifiedTime: String(f.modifiedTime || ""),
    webViewLink: String(f.webViewLink || ""),
    size: f.size != null ? Number(f.size) : null,
  }));

  return { success: true, files };
}

/**
 * Reads a file as text. Google Docs are exported (they have no bytes of their
 * own); anything else is downloaded with alt=media and truncated, since this
 * feeds a chat turn rather than a download.
 */
export async function readDriveFile(
  creds: GoogleCredentials,
  fileId: string
): Promise<{ success: boolean; name?: string; text?: string; error?: string }> {
  const id = (fileId || "").trim();
  if (!id) return { success: false, error: "A file id is required." };

  const meta = await gapi<{ name?: string; mimeType?: string }>(
    creds,
    `${DRIVE}/files/${encodeURIComponent(id)}?fields=name,mimeType`
  );
  if (!meta.ok) return { success: false, error: meta.error };

  const mime = meta.data?.mimeType || "";
  const isGoogleFile = mime.startsWith("application/vnd.google-apps");
  if (isGoogleFile && mime !== GOOGLE_DOC) {
    return {
      success: false,
      error: `“${meta.data?.name || id}” is a ${mime.split(".").pop()} — only Docs can be read as text.`,
    };
  }

  const url = isGoogleFile
    ? `${DRIVE}/files/${encodeURIComponent(id)}/export?mimeType=text/plain`
    : `${DRIVE}/files/${encodeURIComponent(id)}?alt=media`;

  const res = await gapi<string>(creds, url);
  if (!res.ok) return { success: false, error: res.error };

  const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
  return { success: true, name: meta.data?.name, text: text.slice(0, 20000) };
}

/**
 * Uploads text content as a new Drive file. Multipart is assembled by hand
 * because the metadata and the bytes go in one request, and `convertToDoc` asks
 * Drive to turn the upload into a real Google Doc rather than an attachment.
 */
export async function uploadDriveFile(
  creds: GoogleCredentials,
  input: {
    name: string;
    content: string;
    mimeType?: string;
    folderId?: string;
    convertToDoc?: boolean;
  }
): Promise<{ success: boolean; file?: DriveFile; error?: string }> {
  if (!input.name?.trim()) return { success: false, error: "A file name is required." };
  if (!input.content) return { success: false, error: "There is no content to upload." };

  const boundary = `flow${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const metadata: Record<string, unknown> = {
    name: input.name.trim(),
    ...(input.folderId?.trim() ? { parents: [input.folderId.trim()] } : {}),
    ...(input.convertToDoc ? { mimeType: GOOGLE_DOC } : {}),
  };

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${input.mimeType || "text/plain"}; charset=UTF-8`,
    "",
    input.content,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const res = await gapi<Record<string, unknown>>(
    creds,
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink,size`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );

  if (!res.ok) return { success: false, error: res.error };

  const f = res.data || {};
  return {
    success: true,
    file: {
      id: String(f.id || ""),
      name: String(f.name || input.name),
      mimeType: String(f.mimeType || ""),
      modifiedTime: String(f.modifiedTime || ""),
      webViewLink: String(f.webViewLink || ""),
      size: f.size != null ? Number(f.size) : null,
    },
  };
}
