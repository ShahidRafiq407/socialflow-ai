/**
 * CUSTOM SITE CONTRACT — the wire format, in one place
 *
 * What we send, what we expect back, and what the verify button does. The
 * per-framework and per-host recipes built on top of it live in `customStacks.ts`
 * so this file stays the short answer to "what exactly arrives at my route".
 *
 * Split out of `custom.ts` because the in-app guide is a client component and
 * `custom.ts` imports node's `crypto`, which a browser bundle should never pull
 * in. Constants and strings only, no imports.
 *
 * Every header name, event name, env var and tolerance below is interpolated into
 * both the guide and the handlers, and `custom.ts` signs with these same
 * constants — so the documentation cannot describe a request we do not send.
 */

// ---------------------------------------------------------------------------
// THE WIRE FORMAT
// ---------------------------------------------------------------------------

export const SIGNATURE_HEADER = "x-postloom-signature";
export const TIMESTAMP_HEADER = "x-postloom-timestamp";

/** Unix seconds. A handler should refuse anything older, so a captured request cannot be replayed. */
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

/** The only two `event` values we ever send. */
export const PING_EVENT = "ping";
export const PUBLISH_EVENT = "article.publish";

/** Matches the AbortSignal.timeout in `custom.ts` — after this the check reports no response. */
export const REQUEST_TIMEOUT_SECONDS = 25;

/** The route path used by the setup steps, the field placeholder and every handler here. */
export const SUGGESTED_ROUTE_PATH = "/api/publish";

/** The environment variable every handler below reads. */
export const SIGNING_SECRET_ENV = "PUBLISH_SIGNING_SECRET";

/** Exactly what the HMAC is taken over — a dot between the two, nothing else. */
export const SIGNED_STRING_TEMPLATE = "<timestamp>.<raw body>";

/**
 * How to produce the secret. "Invent a long random string" is how people end up
 * typing their dog's name, so both commands are here and either one is fine.
 */
export const SECRET_GENERATOR_COMMANDS = `openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;

// ---------------------------------------------------------------------------
// WHAT ARRIVES AT THE ROUTE — split into short blocks, because one long block
// under a form field is what nobody read the last time.
// ---------------------------------------------------------------------------

export const CUSTOM_REQUEST_HEADERS = `POST https://yoursite.com${SUGGESTED_ROUTE_PATH}
Content-Type: application/json
Accept: application/json
${TIMESTAMP_HEADER}: 1767225600
${SIGNATURE_HEADER}: sha256=<hex HMAC-SHA256 of "1767225600." + raw body, keyed with your signing secret>
Authorization: Bearer <only when you saved a bearer token>`;

/** What "Connect & verify" and "Check connection" send. Nothing else. */
export const CUSTOM_PING_BODY = `{ "event": "${PING_EVENT}", "sentAt": "2026-01-31T09:15:00.000Z" }`;

export const CUSTOM_PUBLISH_BODY = `{
  "event": "${PUBLISH_EVENT}",
  "contentType": "post" | "page",
  "status": "publish" | "draft" | "pending",
  "title": "How much do dental implants cost",
  "slug": "dental-implants-cost",
  "html": "<h2>...</h2><p>...</p>",
  "excerpt": "One-paragraph summary.",
  "seo": {
    "metaTitle": "...",
    "metaDescription": "...",
    "focusKeyword": "...",
    "schema": "<JSON-LD string, or empty>"
  },
  "tags": ["implants", "pricing"],
  "featuredImage": { "url": "https://...", "alt": "..." } | null
}`;

export const CUSTOM_RESPONSE_CONTRACT = `200 OK
{ "url": "https://yoursite.com/blog/dental-implants-cost", "id": "anything-you-like" }

Any 2xx counts as success. The "url" you return becomes the View live link; omit it
and the publish still succeeds, with a warning that there is no link to open.

Redirects are not followed — the signature headers would be dropped — so a 301 or
308 (http to https, or a trailing-slash rewrite) is reported as a failure. Save the
exact final URL.`;

/** The whole thing in one block, for anything that wants to show or copy it at once. */
export const CUSTOM_TARGET_CONTRACT = `${CUSTOM_REQUEST_HEADERS}

${CUSTOM_PUBLISH_BODY}

${CUSTOM_RESPONSE_CONTRACT}`;

// ---------------------------------------------------------------------------
// VERIFICATION — exactly what the Connect & verify button does, in five lines,
// so "it says the check failed" is never a mystery.
// ---------------------------------------------------------------------------

export const CUSTOM_VERIFY_FACTS: string[] = [
  `We POST ${CUSTOM_PING_BODY} to the endpoint you saved — signed exactly like a real publish.`,
  "Your route passes the moment it answers any 2xx. Nothing in the response body is required.",
  `We wait ${REQUEST_TIMEOUT_SECONDS} seconds, then report that the endpoint did not respond.`,
  "Redirects are not followed, so a 301 or 308 is a failure, not a hop.",
  "The endpoint has to be reachable from the public internet — localhost and private IPs are refused before any request is made.",
];

// ---------------------------------------------------------------------------
// WHEN THE CHECK FAILS — the status the app shows, mapped to the one cause that
// produces it. Every symptom here is a real message from `custom.ts`.
// ---------------------------------------------------------------------------

export interface CustomTroubleshootEntry {
  symptom: string;
  cause: string;
  fix: string;
}

export const CUSTOM_TROUBLESHOOTING: CustomTroubleshootEntry[] = [
  {
    symptom: "HTTP 401",
    cause: "The HMAC your route computed is not the one we sent.",
    fix: `Hash the raw body string, not a re-serialised object, as ${SIGNED_STRING_TEMPLATE} — and compare against the whole "sha256=…" value, prefix included.`,
  },
  {
    symptom: "HTTP 404",
    cause: "The path in the field does not match where the file actually is.",
    fix: "Open the endpoint URL in a browser: a 404 there means the route was never deployed, or the folder name differs from the URL.",
  },
  {
    symptom: "HTTP 405",
    cause: "The route exists but does not accept POST.",
    fix: "Export a POST handler, not GET. On Express, use router.post.",
  },
  {
    symptom: "HTTP 301 / 308",
    cause: "The URL you saved redirects — usually http to https, or a trailing slash being added or removed.",
    fix: "Save the exact URL the redirect lands on. Redirects are refused because they would strip the signature headers.",
  },
  {
    symptom: "HTTP 419",
    cause: "On Laravel, the route is in routes/web.php, so CSRF protection rejected it.",
    fix: "Move it to routes/api.php.",
  },
  {
    symptom: `HTTP 500, "missing ${SIGNING_SECRET_ENV}"`,
    cause: "The variable exists locally but not in the running deployment.",
    fix: "Add it in your host's dashboard and redeploy — variables are read at boot, not per request.",
  },
  {
    symptom: "The endpoint did not respond",
    cause: `Nothing answered within ${REQUEST_TIMEOUT_SECONDS} seconds, or DNS did not resolve.`,
    fix: "Check the domain is live and that your host is not blocking unknown clients or requiring a WAF exception.",
  },
  {
    symptom: "must be a public address",
    cause: "The URL points at localhost or a private network, which we refuse before sending anything.",
    fix: "Deploy the route, or expose it with a tunnel and paste the public URL.",
  },
];
