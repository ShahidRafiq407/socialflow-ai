/**
 * CUSTOM SITE CONTRACT — one source of truth for the coded-site connector
 *
 * A WordPress user pastes a URL and an application password and is done. Someone
 * whose site is Next.js, Astro or Laravel has to write the receiving end, so the
 * only documentation worth shipping is the exact kind: which file to create, the
 * path it goes at, the line that holds the secret, and a handler that verifies
 * the signature correctly the first time.
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
// HANDLERS — one per framework, because "add a POST route" is not an instruction
//
// The three things a user actually gets wrong are all framework-specific: where
// the file goes, how to read the body *before* the framework parses it, and where
// the secret lives. So each recipe names all three, and the code is complete —
// paste it, fill in the one marked line, done.
// ---------------------------------------------------------------------------

export interface CustomHandlerRecipe {
  id: string;
  /** Tab label in the guide. */
  label: string;
  /** Exact path, relative to the project root. */
  file: string;
  /** The same file's other accepted path on this framework — a `src/` layout, when there is one. */
  fileAlt?: string;
  /** Other files the snippet edits, when pasting one file is not the whole job. */
  alsoTouches?: string;
  /** Where the secret goes on this stack. */
  envFile: string;
  /** The exact line to add there. */
  envLine: string;
  /** Framework-specific traps that silently break the signature. */
  notes: string[];
  code: string;
}

const NEXT_APP_ROUTER: CustomHandlerRecipe = {
  id: "next-app",
  label: "Next.js (App Router)",
  file: `app${SUGGESTED_ROUTE_PATH}/route.ts`,
  fileAlt: `src/app${SUGGESTED_ROUTE_PATH}/route.ts`,
  envFile: ".env.local — and in your host's dashboard for production",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  notes: [
    "Create the folders too: app/api/publish/ with route.ts inside it. The folder names are the URL.",
    "Keep runtime = \"nodejs\". The edge runtime has no node:crypto.",
    "await req.text() must come before JSON.parse. Parsing and re-serialising changes the bytes and the signature will not match.",
    "On Vercel add the variable under Settings → Environment Variables, then redeploy — a variable added after the last deploy is not live yet.",
  ],
  code: `// app/api/publish/route.ts
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.${SIGNING_SECRET_ENV};
  if (!secret) return new Response("missing ${SIGNING_SECRET_ENV}", { status: 500 });

  // The raw bytes, before JSON.parse.
  const raw = await req.text();
  const ts = req.headers.get("${TIMESTAMP_HEADER}") || "";
  const sig = req.headers.get("${SIGNATURE_HEADER}") || "";

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
    return new Response("stale timestamp", { status: 401 });
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");

  // Constant-time compare: a plain === leaks where the first wrong byte is.
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return new Response("bad signature", { status: 401 });
  }

  const body = JSON.parse(raw);
  if (body.event === "${PING_EVENT}") return Response.json({ ok: true });

  // ── your code: store the article, then say where it landed ──
  const slug = body.slug || "untitled";
  return Response.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
}`,
};

const NEXT_PAGES_ROUTER: CustomHandlerRecipe = {
  id: "next-pages",
  label: "Next.js (Pages Router)",
  file: `pages${SUGGESTED_ROUTE_PATH}.ts`,
  fileAlt: `src/pages${SUGGESTED_ROUTE_PATH}.ts`,
  envFile: ".env.local — and in your host's dashboard for production",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  notes: [
    "The bodyParser export is not optional. With it on, Next hands you a parsed object and the raw bytes are gone for good.",
    "Node lowercases incoming header names, which is why they are read in lowercase here.",
    "One file, no folder: pages/api/publish.ts already answers /api/publish.",
  ],
  code: `// pages/api/publish.ts
import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

// Without this Next parses the body and the signature can never be checked.
export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = process.env.${SIGNING_SECRET_ENV};
  if (!secret) return res.status(500).end("missing ${SIGNING_SECRET_ENV}");

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");

  const ts = String(req.headers["${TIMESTAMP_HEADER}"] || "");
  const sig = String(req.headers["${SIGNATURE_HEADER}"] || "");

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
    return res.status(401).end("stale timestamp");
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return res.status(401).end("bad signature");
  }

  const body = JSON.parse(raw);
  if (body.event === "${PING_EVENT}") return res.status(200).json({ ok: true });

  // ── your code: store the article, then say where it landed ──
  const slug = body.slug || "untitled";
  return res.status(200).json({ url: "https://yoursite.com/blog/" + slug, id: slug });
}`,
};

const ASTRO: CustomHandlerRecipe = {
  id: "astro",
  label: "Astro",
  file: `src/pages${SUGGESTED_ROUTE_PATH}.ts`,
  envFile: ".env at the project root — and in your host's dashboard for production",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  notes: [
    "prerender = false is required, otherwise Astro builds the route into a static file that cannot accept POST.",
    "On-demand routes need an adapter: run `npx astro add node` (or vercel / netlify / cloudflare) once.",
    "Do NOT name the variable PUBLIC_… — that prefix ships it to the browser. Without it, import.meta.env keeps it server-side.",
  ],
  code: `// src/pages/api/publish.ts
import type { APIRoute } from "astro";
import crypto from "node:crypto";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.${SIGNING_SECRET_ENV};
  if (!secret) return new Response("missing ${SIGNING_SECRET_ENV}", { status: 500 });

  const raw = await request.text();
  const ts = request.headers.get("${TIMESTAMP_HEADER}") || "";
  const sig = request.headers.get("${SIGNATURE_HEADER}") || "";

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
    return new Response("stale timestamp", { status: 401 });
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return new Response("bad signature", { status: 401 });
  }

  const body = JSON.parse(raw);
  if (body.event === "${PING_EVENT}") {
    return Response.json({ ok: true });
  }

  // ── your code: write the entry / call your CMS, then say where it landed ──
  const slug = body.slug || "untitled";
  return Response.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
};`,
};

const EXPRESS: CustomHandlerRecipe = {
  id: "express",
  label: "Express / Node",
  file: "routes/publish.js",
  alsoTouches: 'your server file — app.use(require("./routes/publish"))',
  envFile: ".env (with dotenv) or your process manager's environment",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  notes: [
    "express.raw, never express.json, for this one route — json() throws the raw bytes away.",
    "If you call app.use(express.json()) globally, mount this router BEFORE that line, or the body is already parsed by the time it gets here and every signature fails.",
    "Behind nginx or a load balancer, make sure the request body is passed through untouched.",
  ],
  code: `// routes/publish.js
const crypto = require("crypto");
const express = require("express");
const router = express.Router();

// express.raw gives a Buffer — the exact bytes we signed.
router.post("${SUGGESTED_ROUTE_PATH}", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.${SIGNING_SECRET_ENV};
  if (!secret) return res.status(500).send("missing ${SIGNING_SECRET_ENV}");

  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const ts = req.get("${TIMESTAMP_HEADER}") || "";
  const sig = req.get("${SIGNATURE_HEADER}") || "";

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
    return res.status(401).send("stale timestamp");
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return res.status(401).send("bad signature");
  }

  const body = JSON.parse(raw);
  if (body.event === "${PING_EVENT}") return res.json({ ok: true });

  // ── your code: store the article, then say where it landed ──
  const slug = body.slug || "untitled";
  return res.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
});

module.exports = router;`,
};

const LARAVEL: CustomHandlerRecipe = {
  id: "laravel",
  label: "Laravel",
  file: "app/Http/Controllers/PublishController.php",
  alsoTouches: "routes/api.php and config/services.php — the two short blocks at the top of the snippet",
  envFile: ".env at the project root",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  notes: [
    "Put the route in routes/api.php, not routes/web.php — a web route is CSRF-protected and answers 419 to us.",
    "routes/api.php adds the /api prefix itself, so Route::post('/publish', …) is reachable at /api/publish.",
    "Laravel 11 and later: if routes/api.php does not exist yet, run `php artisan install:api` once.",
    "Read the secret through config(), not env() — env() returns null once you run `php artisan config:cache`.",
    "$request->getContent() is the raw body. Never rebuild it from $request->all().",
  ],
  code: `<?php
// ── routes/api.php ──
use App\\Http\\Controllers\\PublishController;
Route::post('/publish', [PublishController::class, 'store']);   // → /api/publish

// ── config/services.php, inside the returned array ──
'publish' => ['secret' => env('${SIGNING_SECRET_ENV}')],

// ── app/Http/Controllers/PublishController.php ──
namespace App\\Http\\Controllers;

use Illuminate\\Http\\Request;

class PublishController extends Controller
{
    public function store(Request $request)
    {
        $secret = config('services.publish.secret');
        if (! $secret) {
            return response('missing ${SIGNING_SECRET_ENV}', 500);
        }

        $raw = $request->getContent();                        // raw body, unparsed
        $ts  = (string) $request->header('${TIMESTAMP_HEADER}', '');
        $sig = (string) $request->header('${SIGNATURE_HEADER}', '');

        if ($ts === '' || abs(time() - (int) $ts) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
            return response('stale timestamp', 401);
        }

        $expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, $secret);
        if (! hash_equals($expected, $sig)) {                 // constant-time
            return response('bad signature', 401);
        }

        $body = json_decode($raw, true);
        if (($body['event'] ?? '') === '${PING_EVENT}') {
            return response()->json(['ok' => true]);
        }

        // ── your code: store the post, then say where it landed ──
        $slug = ($body['slug'] ?? '') ?: 'untitled';
        return response()->json(['url' => "https://yoursite.com/blog/{$slug}", 'id' => $slug]);
    }
}`,
};

/** Every stack we ship a paste-ready handler for. Order is the tab order. */
export const CUSTOM_HANDLERS: CustomHandlerRecipe[] = [
  NEXT_APP_ROUTER,
  NEXT_PAGES_ROUTER,
  ASTRO,
  EXPRESS,
  LARAVEL,
];

export const DEFAULT_HANDLER_ID = NEXT_APP_ROUTER.id;

export function getHandlerRecipe(id: string): CustomHandlerRecipe {
  return CUSTOM_HANDLERS.find((recipe) => recipe.id === id) || NEXT_APP_ROUTER;
}

/** The original single export, kept so nothing that imports it has to change. */
export const CUSTOM_HANDLER_EXAMPLE = NEXT_APP_ROUTER.code;

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
