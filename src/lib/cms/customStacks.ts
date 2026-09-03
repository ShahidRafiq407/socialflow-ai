/**
 * EVERY STACK, EVERY HOST — the receiving end, written out
 *
 * The connector itself is language-agnostic: it POSTs signed JSON to a URL. But
 * "add a POST route and verify the HMAC" is only an instruction if you already
 * know how. The three things people get wrong are all local to their stack —
 * which file, how to read the body *before* the framework parses it, and where
 * the secret lives on their host — so every one of those is spelled out here per
 * framework and per host, instead of being implied by a Next.js example.
 *
 * A stack that isn't listed is still supported: ANY_LANGUAGE is the same contract
 * as steps, so it can be implemented in anything that speaks HTTP.
 *
 * Strings and constants only — no imports beyond the wire format, so the browser
 * can render all of it without pulling node's crypto into the bundle.
 */

import {
  PING_EVENT,
  SIGNATURE_HEADER,
  SIGNING_SECRET_ENV,
  SUGGESTED_ROUTE_PATH,
  TIMESTAMP_HEADER,
  TIMESTAMP_TOLERANCE_SECONDS,
} from "./customContract";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface CustomHandlerRecipe {
  id: string;
  /** Option label in the framework dropdown. */
  label: string;
  /** The language group this sits under. Must be one of CUSTOM_LANGUAGES. */
  language: string;
  /** Exact path, relative to the project root. */
  file: string;
  /** The same file's other accepted path on this framework — a `src/` layout, when there is one. */
  fileAlt?: string;
  /** Other files the snippet edits, when pasting one file is not the whole job. */
  alsoTouches?: string;
  /** Where the secret goes on this stack, before the host-specific dashboard step. */
  envFile: string;
  /** The exact line to add there. */
  envLine: string;
  /** How the code reads the secret, so it can be matched against the host's UI. */
  envRead: string;
  /** The URL the file answers on once deployed. */
  endpoint: string;
  /** Framework-specific traps that silently break the signature. */
  notes: string[];
  code: string;
}

export interface CustomHostGuide {
  id: string;
  label: string;
  /** The exact click-path or command that sets the variable. */
  where: string;
  /** What makes it live — almost always the step people skip. */
  after: string;
  /** Host-specific gotchas that break a route which works locally. */
  notes?: string[];
}
// ---------------------------------------------------------------------------
// HOSTS — where the variable goes, and what makes it live
//
// A handler that works locally and 500s in production is almost always a
// variable that was never added to the running deployment, or was added and
// never redeployed. So each host gets its own exact path through its own UI.
// ---------------------------------------------------------------------------

const VERCEL: CustomHostGuide = {
  id: "vercel",
  label: "Vercel",
  where: "Project → Settings → Environment Variables → Add, ticking Production (and Preview if you publish from there)",
  after: "Deployments → the latest one → ⋯ → Redeploy. Variables are read at build/boot, so the deploy that is already live never sees a variable added after it.",
  notes: [
    "Serverless functions have a 10s default timeout on Hobby; if your save is slow, return 200 first and finish the work in the background.",
  ],
};

const NETLIFY: CustomHostGuide = {
  id: "netlify",
  label: "Netlify",
  where: "Site configuration → Environment variables → Add a variable → Same value for all deploy contexts",
  after: "Deploys → Trigger deploy → Clear cache and deploy site.",
  notes: [
    "A POST route needs a function, not a static build: Next.js needs @netlify/plugin-nextjs, Astro needs @astrojs/netlify. Without an adapter the path 404s.",
  ],
};

const CLOUDFLARE: CustomHostGuide = {
  id: "cloudflare",
  label: "Cloudflare Pages / Workers",
  where: "Workers & Pages → your project → Settings → Variables and Secrets → Add → type Secret",
  after: "Save, then redeploy (Pages) or `npx wrangler deploy` (Workers).",
  notes: [
    "The Workers runtime has no node:crypto unless you set compatibility_flags = [\"nodejs_compat\"] in wrangler.toml. The Cloudflare snippet uses Web Crypto instead, so you do not need the flag.",
    "Secrets are not readable from process.env in a Worker — they arrive as the `env` argument, which is what the snippet reads.",
  ],
};

const RAILWAY: CustomHostGuide = {
  id: "railway",
  label: "Railway",
  where: "Project → your service → Variables → New Variable",
  after: "Railway redeploys the service by itself once you save. Wait for the new deployment to go green.",
};

const RENDER: CustomHostGuide = {
  id: "render",
  label: "Render",
  where: "Service → Environment → Add Environment Variable → Save Changes",
  after: "Saving triggers a redeploy automatically; watch the Events tab until it is live.",
};

const FLY: CustomHostGuide = {
  id: "fly",
  label: "Fly.io",
  where: "`fly secrets set PUBLISH_SIGNING_SECRET=your-value` from the project directory",
  after: "Setting a secret restarts the machines by itself — no separate deploy needed.",
};
const HEROKU: CustomHostGuide = {
  id: "heroku",
  label: "Heroku",
  where: "App → Settings → Config Vars → Reveal Config Vars → add the KEY and VALUE (or `heroku config:set PUBLISH_SIGNING_SECRET=…`)",
  after: "Heroku restarts the dynos on save. No redeploy needed.",
};

const CPANEL: CustomHostGuide = {
  id: "cpanel",
  label: "cPanel / shared hosting",
  where:
    "No dashboard for this: put the line in your app's .env (Laravel, Symfony) or, for plain PHP, in a file above the web root that your handler includes. On a Node app, use cPanel → Setup Node.js App → Environment variables.",
  after: "PHP reads it per request, so there is nothing to restart. For a Node app, press Restart in Setup Node.js App.",
  notes: [
    "There is no build step here: upload the file over FTP or File Manager and the path is literal — public_html/api/publish.php answers at https://yoursite.com/api/publish.php.",
    "Never put the secret in a file inside public_html that can be fetched. A .env or an includes/ file above the web root is safe; secret.txt next to index.php is not.",
    "If .env is not being read, your host may run PHP-FPM without it — read the value with getenv() and add it as an env[] line in the FPM pool, or define it in a PHP config file you include.",
  ],
};

const VPS: CustomHostGuide = {
  id: "vps",
  label: "Your own VPS (nginx / Apache)",
  where:
    "systemd: add `Environment=PUBLISH_SIGNING_SECRET=…` to the unit's [Service] block, then `systemctl daemon-reload && systemctl restart yourapp`. PM2: put it in ecosystem.config.js under env, then `pm2 restart yourapp --update-env`. Apache with mod_php: SetEnv in the vhost.",
  after: "The process only sees the variable after a restart — reloading nginx is not enough, the app itself has to come back up.",
  notes: [
    "nginx must pass the body through untouched: `proxy_pass` with the default settings is fine, but a `client_max_body_size` smaller than the article truncates it and every signature then fails.",
    "Make sure the route is served over the exact hostname you paste, with a valid certificate. A redirect from http to https is rejected here, because the signature headers would be dropped.",
  ],
};

const DOCKER: CustomHostGuide = {
  id: "docker",
  label: "Docker / Docker Compose",
  where:
    "docker-compose.yml → the service's `environment:` list, or `docker run -e PUBLISH_SIGNING_SECRET=…`. For Swarm or Kubernetes, a secret mounted as an env var.",
  after: "`docker compose up -d --force-recreate` — an existing container keeps the environment it was started with.",
  notes: ["Do not bake the secret into the image with ENV in the Dockerfile; anyone who pulls the image can read it."],
};

const AWS: CustomHostGuide = {
  id: "aws",
  label: "AWS (Amplify, Beanstalk, Lambda)",
  where:
    "Amplify → App settings → Environment variables. Elastic Beanstalk → Configuration → Updates, monitoring and logging → Environment properties. Lambda → Configuration → Environment variables.",
  after: "Amplify needs a redeploy of the branch; Beanstalk applies on the environment update; Lambda takes effect on the next invocation.",
  notes: [
    "Behind API Gateway, use a Lambda proxy integration. A mapping template that rebuilds the body changes the bytes and every signature fails.",
    "If the function sits behind CloudFront, make sure the POST method is allowed and the body is not cached.",
  ],
};

const OTHER_HOST: CustomHostGuide = {
  id: "other",
  label: "Somewhere else / not sure",
  where:
    "Wherever that host keeps environment variables — every platform has the same two places: a local .env for development, and a dashboard or CLI for the deployed app.",
  after: "Restart or redeploy the app afterwards. Almost every 500 with \"missing PUBLISH_SIGNING_SECRET\" is a variable that exists locally and not in the running deployment.",
  notes: [
    "Only two things have to be true: the URL is reachable from the public internet, and your route can read the same secret string you paste here.",
  ],
};

/** Order is the order of the host dropdown. */
export const CUSTOM_HOSTS: CustomHostGuide[] = [
  VERCEL,
  NETLIFY,
  CLOUDFLARE,
  RAILWAY,
  RENDER,
  FLY,
  HEROKU,
  DOCKER,
  VPS,
  CPANEL,
  AWS,
  OTHER_HOST,
];

export const DEFAULT_HOST_ID = VERCEL.id;

export function getHostGuide(id: string): CustomHostGuide {
  return CUSTOM_HOSTS.find((host) => host.id === id) || OTHER_HOST;
}
// ---------------------------------------------------------------------------
// LANGUAGES — the first dropdown. A framework list is only useful once you have
// narrowed it to the language you actually wrote the site in.
// ---------------------------------------------------------------------------

export const LANG_JS = "JavaScript / TypeScript";
export const LANG_PHP = "PHP";
export const LANG_PYTHON = "Python";
export const LANG_RUBY = "Ruby";
export const LANG_GO = "Go";
export const LANG_DOTNET = "C# / .NET";
export const LANG_JAVA = "Java";
export const LANG_ANY = "Any other language";

/** The one line every recipe's code ends with, so the shape is obvious. */
const RETURN_NOTE = "── your code: store the article, then say where it landed ──";

const NEXT_APP_ROUTER: CustomHandlerRecipe = {
  id: "next-app",
  label: "Next.js (App Router)",
  language: LANG_JS,
  file: `app${SUGGESTED_ROUTE_PATH}/route.ts`,
  fileAlt: `src/app${SUGGESTED_ROUTE_PATH}/route.ts`,
  envFile: ".env.local for development",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `process.env.${SIGNING_SECRET_ENV}`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "Create the folders too — app/api/publish/ with route.ts inside it. The folder names are the URL.",
    'Keep runtime = "nodejs". The edge runtime has no node:crypto.',
    "await req.text() must come before JSON.parse: parsing and re-serialising changes the bytes and the signature will not match.",
  ],
  code: `// app/api/publish/route.ts
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.${SIGNING_SECRET_ENV};
  if (!secret) return new Response("missing ${SIGNING_SECRET_ENV}", { status: 500 });

  const raw = await req.text();                       // raw bytes, before JSON.parse
  const ts = req.headers.get("${TIMESTAMP_HEADER}") || "";
  const sig = req.headers.get("${SIGNATURE_HEADER}") || "";

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
    return new Response("stale timestamp", { status: 401 });
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");

  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return new Response("bad signature", { status: 401 });   // constant-time compare
  }

  const body = JSON.parse(raw);
  if (body.event === "${PING_EVENT}") return Response.json({ ok: true });

  // ${RETURN_NOTE}
  const slug = body.slug || "untitled";
  return Response.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
}`,
};
const NEXT_PAGES_ROUTER: CustomHandlerRecipe = {
  id: "next-pages",
  label: "Next.js (Pages Router)",
  language: LANG_JS,
  file: `pages${SUGGESTED_ROUTE_PATH}.ts`,
  fileAlt: `src/pages${SUGGESTED_ROUTE_PATH}.ts`,
  envFile: ".env.local for development",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `process.env.${SIGNING_SECRET_ENV}`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
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

  // ${RETURN_NOTE}
  const slug = body.slug || "untitled";
  return res.status(200).json({ url: "https://yoursite.com/blog/" + slug, id: slug });
}`,
};
const ASTRO: CustomHandlerRecipe = {
  id: "astro",
  label: "Astro",
  language: LANG_JS,
  file: `src/pages${SUGGESTED_ROUTE_PATH}.ts`,
  envFile: ".env at the project root",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `import.meta.env.${SIGNING_SECRET_ENV}`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "prerender = false is required, otherwise Astro builds the route into a static file that cannot accept POST.",
    "On-demand routes need an adapter: run `npx astro add node` (or vercel / netlify / cloudflare) once.",
    "Do NOT name the variable PUBLIC_… — that prefix ships it to the browser.",
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
  if (body.event === "${PING_EVENT}") return Response.json({ ok: true });

  // ${RETURN_NOTE}
  const slug = body.slug || "untitled";
  return Response.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
};`,
};
const NUXT: CustomHandlerRecipe = {
  id: "nuxt",
  label: "Nuxt 3 / 4",
  language: LANG_JS,
  file: "server/api/publish.post.ts",
  envFile: ".env at the project root",
  envLine: `NUXT_${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: "useRuntimeConfig().publishSigningSecret",
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "The .post suffix in the filename is what limits it to POST. server/api/publish.post.ts answers /api/publish.",
    "readRawBody(event), never readBody(event) — readBody parses the JSON and the raw bytes are gone.",
    "Add `runtimeConfig: { publishSigningSecret: \"\" }` to nuxt.config.ts. Nuxt fills it from NUXT_PUBLISH_SIGNING_SECRET; a key under runtimeConfig (not runtimeConfig.public) stays server-side.",
  ],
  code: `// server/api/publish.post.ts
import crypto from "node:crypto";

export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().publishSigningSecret;
  if (!secret) throw createError({ statusCode: 500, statusMessage: "missing ${SIGNING_SECRET_ENV}" });

  const raw = (await readRawBody(event, "utf8")) || "";     // NOT readBody
  const ts = getHeader(event, "${TIMESTAMP_HEADER}") || "";
  const sig = getHeader(event, "${SIGNATURE_HEADER}") || "";

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
    throw createError({ statusCode: 401, statusMessage: "stale timestamp" });
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    throw createError({ statusCode: 401, statusMessage: "bad signature" });
  }

  const body = JSON.parse(raw);
  if (body.event === "${PING_EVENT}") return { ok: true };

  // ${RETURN_NOTE}
  const slug = body.slug || "untitled";
  return { url: "https://yoursite.com/blog/" + slug, id: slug };
});`,
};
const SVELTEKIT: CustomHandlerRecipe = {
  id: "sveltekit",
  label: "SvelteKit",
  language: LANG_JS,
  file: "src/routes/api/publish/+server.ts",
  envFile: ".env at the project root",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `import { ${SIGNING_SECRET_ENV} } from "$env/static/private"`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "The folder is the URL: src/routes/api/publish/+server.ts answers /api/publish.",
    "Import from $env/static/private, never $env/static/public — the public module is bundled into the browser build.",
    "Prerendering must stay off for this route (it is off by default unless you set prerender = true somewhere above it).",
  ],
  code: `// src/routes/api/publish/+server.ts
import crypto from "node:crypto";
import { ${SIGNING_SECRET_ENV} } from "$env/static/private";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  const secret = ${SIGNING_SECRET_ENV};
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
  if (body.event === "${PING_EVENT}") return new Response(JSON.stringify({ ok: true }));

  // ${RETURN_NOTE}
  const slug = body.slug || "untitled";
  return new Response(JSON.stringify({ url: "https://yoursite.com/blog/" + slug, id: slug }));
};`,
};
const REMIX: CustomHandlerRecipe = {
  id: "remix",
  label: "Remix / React Router 7",
  language: LANG_JS,
  file: "app/routes/api.publish.tsx",
  envFile: ".env at the project root",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `process.env.${SIGNING_SECRET_ENV}`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "The dot in the filename is the slash: app/routes/api.publish.tsx answers /api/publish.",
    "Export an `action`, not a `loader` — a loader only answers GET.",
    "Do not call request.formData() or request.json() first; either one consumes the body and text() then returns empty.",
  ],
  code: `// app/routes/api.publish.tsx
import crypto from "node:crypto";
import type { ActionFunctionArgs } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = process.env.${SIGNING_SECRET_ENV};
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
  if (body.event === "${PING_EVENT}") return Response.json({ ok: true });

  // ${RETURN_NOTE}
  const slug = body.slug || "untitled";
  return Response.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
}`,
};
const EXPRESS: CustomHandlerRecipe = {
  id: "express",
  label: "Express",
  language: LANG_JS,
  file: "routes/publish.js",
  alsoTouches: 'your server file — app.use(require("./routes/publish"))',
  envFile: ".env (with dotenv) or your process manager's environment",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `process.env.${SIGNING_SECRET_ENV}`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "express.raw, never express.json, for this one route — json() throws the raw bytes away.",
    "If you call app.use(express.json()) globally, mount this router BEFORE that line, or the body is already parsed by the time it arrives and every signature fails.",
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

  // ${RETURN_NOTE}
  const slug = body.slug || "untitled";
  return res.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
});

module.exports = router;`,
};
const FASTIFY: CustomHandlerRecipe = {
  id: "fastify",
  label: "Fastify",
  language: LANG_JS,
  file: "routes/publish.js",
  alsoTouches: "your server file — fastify.register(require(\"./routes/publish\"))",
  envFile: ".env (with @fastify/env or dotenv) or your process manager's environment",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `process.env.${SIGNING_SECRET_ENV}`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "Fastify parses JSON by default. The content-type parser below hands you the string instead, for this plugin only.",
    "addContentTypeParser has to be registered inside the same plugin scope as the route, or it will not apply to it.",
  ],
  code: `// routes/publish.js
const crypto = require("crypto");

module.exports = async function (fastify) {
  // Keep the body as a string instead of letting Fastify parse it.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => done(null, body)
  );

  fastify.post("${SUGGESTED_ROUTE_PATH}", async (request, reply) => {
    const secret = process.env.${SIGNING_SECRET_ENV};
    if (!secret) return reply.code(500).send("missing ${SIGNING_SECRET_ENV}");

    const raw = typeof request.body === "string" ? request.body : "";
    const ts = request.headers["${TIMESTAMP_HEADER}"] || "";
    const sig = request.headers["${SIGNATURE_HEADER}"] || "";

    if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
      return reply.code(401).send("stale timestamp");
    }

    const expected =
      "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");
    const got = Buffer.from(String(sig));
    const want = Buffer.from(expected);
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
      return reply.code(401).send("bad signature");
    }

    const body = JSON.parse(raw);
    if (body.event === "${PING_EVENT}") return { ok: true };

    // ${RETURN_NOTE}
    const slug = body.slug || "untitled";
    return { url: "https://yoursite.com/blog/" + slug, id: slug };
  });
};`,
};
const EDGE_WORKER: CustomHandlerRecipe = {
  id: "edge-worker",
  label: "Cloudflare Worker / Deno / Bun (Web Crypto)",
  language: LANG_JS,
  file: "src/index.ts",
  envFile: "Worker: wrangler secret / the dashboard. Deno Deploy: the project's env vars. Bun: .env",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `env.${SIGNING_SECRET_ENV} (Worker) · Deno.env.get("${SIGNING_SECRET_ENV}") · process.env (Bun)`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "No node:crypto needed — this uses Web Crypto, which every edge runtime has.",
    "In a Worker the secret arrives as the `env` argument, not process.env.",
    "On Deno Deploy replace env.PUBLISH_SIGNING_SECRET with Deno.env.get(\"PUBLISH_SIGNING_SECRET\") and serve with Deno.serve.",
  ],
  code: `// src/index.ts — Cloudflare Worker (Web Crypto, no node APIs)
export default {
  async fetch(request: Request, env: Record<string, string>) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "${SUGGESTED_ROUTE_PATH}") {
      return new Response("not found", { status: 404 });
    }

    const secret = env.${SIGNING_SECRET_ENV};
    if (!secret) return new Response("missing ${SIGNING_SECRET_ENV}", { status: 500 });

    const raw = await request.text();
    const ts = request.headers.get("${TIMESTAMP_HEADER}") || "";
    const sig = request.headers.get("${SIGNATURE_HEADER}") || "";

    if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
      return new Response("stale timestamp", { status: 401 });
    }

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(ts + "." + raw));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expected = "sha256=" + hex;

    // Constant-time compare without node's timingSafeEqual.
    let diff = expected.length ^ sig.length;
    for (let i = 0; i < expected.length && i < sig.length; i++) {
      diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    if (diff !== 0) return new Response("bad signature", { status: 401 });

    const body = JSON.parse(raw);
    if (body.event === "${PING_EVENT}") return Response.json({ ok: true });

    // ${RETURN_NOTE}
    const slug = body.slug || "untitled";
    return Response.json({ url: "https://yoursite.com/blog/" + slug, id: slug });
  },
};`,
};
const LARAVEL: CustomHandlerRecipe = {
  id: "laravel",
  label: "Laravel",
  language: LANG_PHP,
  file: "app/Http/Controllers/PublishController.php",
  alsoTouches: "routes/api.php and config/services.php — the two short blocks at the top of the snippet",
  envFile: ".env at the project root",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: "config('services.publish.secret')",
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
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

        // ${RETURN_NOTE}
        $slug = ($body['slug'] ?? '') ?: 'untitled';
        return response()->json(['url' => "https://yoursite.com/blog/{$slug}", 'id' => $slug]);
    }
}`,
};
const PHP_PLAIN: CustomHandlerRecipe = {
  id: "php-plain",
  label: "Plain PHP (no framework, cPanel)",
  language: LANG_PHP,
  file: "public_html/api/publish.php",
  fileAlt: "httpdocs/api/publish.php or www/api/publish.php, depending on the host",
  alsoTouches: "a config file ABOVE the web root, e.g. ../publish-config.php, holding the secret",
  envFile: "publish-config.php one level above public_html (so it can never be downloaded)",
  envLine: `<?php return ['secret' => 'paste-the-same-long-random-string'];`,
  envRead: `require __DIR__ . '/../publish-config.php' — or getenv('${SIGNING_SECRET_ENV}')`,
  endpoint: "https://yoursite.com/api/publish.php",
  notes: [
    "There is no build step: upload the file and the path is literal. public_html/api/publish.php answers at /api/publish.php — paste that exact URL, .php included.",
    "PHP renames headers: x-postloom-timestamp arrives as $_SERVER['HTTP_X_POSTLOOM_TIMESTAMP']. Dashes become underscores, everything is uppercased, and HTTP_ is prepended.",
    "php://input can only be read once, and only if you have not read $_POST first. Read it before anything else.",
    "Keep the secret out of public_html. A file one level up is safe; secret.txt next to index.php is downloadable by anyone.",
  ],
  code: `<?php
// public_html/api/publish.php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'method not allowed']));
}

// The secret, from a file that is NOT inside public_html.
$config = require __DIR__ . '/../publish-config.php';
$secret = $config['secret'] ?? getenv('${SIGNING_SECRET_ENV}');
if (! $secret) {
    http_response_code(500);
    exit(json_encode(['error' => 'missing ${SIGNING_SECRET_ENV}']));
}

$raw = file_get_contents('php://input');                     // raw body, read once
$ts  = $_SERVER['HTTP_X_POSTLOOM_TIMESTAMP'] ?? '';          // header name, PHP-style
$sig = $_SERVER['HTTP_X_POSTLOOM_SIGNATURE'] ?? '';

if ($ts === '' || abs(time() - (int) $ts) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
    http_response_code(401);
    exit(json_encode(['error' => 'stale timestamp']));
}

$expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, $secret);
if (! hash_equals($expected, $sig)) {                        // constant-time
    http_response_code(401);
    exit(json_encode(['error' => 'bad signature']));
}

$body = json_decode($raw, true);
if (($body['event'] ?? '') === '${PING_EVENT}') {
    exit(json_encode(['ok' => true]));
}

// ${RETURN_NOTE}
$slug = ($body['slug'] ?? '') ?: 'untitled';
// e.g. file_put_contents(__DIR__ . "/../posts/{$slug}.html", $body['html']);
exit(json_encode(['url' => "https://yoursite.com/blog/{$slug}", 'id' => $slug]));`,
};
const SYMFONY: CustomHandlerRecipe = {
  id: "symfony",
  label: "Symfony",
  language: LANG_PHP,
  file: "src/Controller/PublishController.php",
  envFile: ".env.local at the project root",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `$_ENV['${SIGNING_SECRET_ENV}'] via a bound parameter or %env()%`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "The #[Route] attribute is the whole routing config — no extra YAML needed with the default annotation loader.",
    "$request->getContent() is the raw body. Do not use $request->request->all(), which is parsed and re-ordered.",
    "If the firewall covers /api, add an access_control rule that lets this path through unauthenticated; the signature is the authentication.",
  ],
  code: `<?php
// src/Controller/PublishController.php
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\JsonResponse;
use Symfony\\Component\\HttpFoundation\\Request;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

class PublishController extends AbstractController
{
    #[Route('${SUGGESTED_ROUTE_PATH}', methods: ['POST'])]
    public function publish(Request $request): Response
    {
        $secret = $_ENV['${SIGNING_SECRET_ENV}'] ?? '';
        if (! $secret) {
            return new Response('missing ${SIGNING_SECRET_ENV}', 500);
        }

        $raw = $request->getContent();                        // raw body
        $ts  = (string) $request->headers->get('${TIMESTAMP_HEADER}', '');
        $sig = (string) $request->headers->get('${SIGNATURE_HEADER}', '');

        if ($ts === '' || abs(time() - (int) $ts) > ${TIMESTAMP_TOLERANCE_SECONDS}) {
            return new Response('stale timestamp', 401);
        }

        $expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, $secret);
        if (! hash_equals($expected, $sig)) {
            return new Response('bad signature', 401);
        }

        $body = json_decode($raw, true);
        if (($body['event'] ?? '') === '${PING_EVENT}') {
            return new JsonResponse(['ok' => true]);
        }

        // ${RETURN_NOTE}
        $slug = ($body['slug'] ?? '') ?: 'untitled';
        return new JsonResponse(['url' => "https://yoursite.com/blog/{$slug}", 'id' => $slug]);
    }
}`,
};
const DJANGO: CustomHandlerRecipe = {
  id: "django",
  label: "Django",
  language: LANG_PYTHON,
  file: "blog/views.py",
  alsoTouches: "urls.py — path(\"api/publish\", publish) — the line at the top of the snippet",
  envFile: ".env (with django-environ) or the process environment",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `os.environ["${SIGNING_SECRET_ENV}"]`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "@csrf_exempt is required. Without it Django answers 403 to any POST that has no CSRF token, and we do not send one.",
    "request.body is the raw bytes. Never use request.POST — it is parsed, and for JSON it is empty anyway.",
    "Add the path to urls.py; a view alone is not routed.",
  ],
  code: `# urls.py
# from blog.views import publish
# urlpatterns += [path("api/publish", publish)]

# blog/views.py
import hashlib, hmac, json, os, time
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

@csrf_exempt
@require_POST
def publish(request):
    secret = os.environ.get("${SIGNING_SECRET_ENV}")
    if not secret:
        return HttpResponse("missing ${SIGNING_SECRET_ENV}", status=500)

    raw = request.body.decode("utf-8")                       # raw bytes, not request.POST
    ts = request.headers.get("${TIMESTAMP_HEADER}", "")
    sig = request.headers.get("${SIGNATURE_HEADER}", "")

    if not ts or abs(time.time() - int(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}:
        return HttpResponse("stale timestamp", status=401)

    digest = hmac.new(secret.encode(), f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest("sha256=" + digest, sig):      # constant-time
        return HttpResponse("bad signature", status=401)

    body = json.loads(raw)
    if body.get("event") == "${PING_EVENT}":
        return JsonResponse({"ok": True})

    # ${RETURN_NOTE}
    slug = body.get("slug") or "untitled"
    return JsonResponse({"url": f"https://yoursite.com/blog/{slug}", "id": slug})`,
};
const FLASK: CustomHandlerRecipe = {
  id: "flask",
  label: "Flask",
  language: LANG_PYTHON,
  file: "app.py",
  envFile: ".env (with python-dotenv) or the process environment",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `os.environ["${SIGNING_SECRET_ENV}"]`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "request.get_data(as_text=True) is the raw body. request.get_json() parses it, and the signature can no longer be checked.",
    "Behind gunicorn + nginx, nothing else is needed — but the route must be reachable over https on the exact host you paste.",
  ],
  code: `# app.py
import hashlib, hmac, json, os, time
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.post("${SUGGESTED_ROUTE_PATH}")
def publish():
    secret = os.environ.get("${SIGNING_SECRET_ENV}")
    if not secret:
        return "missing ${SIGNING_SECRET_ENV}", 500

    raw = request.get_data(as_text=True)                     # raw body, unparsed
    ts = request.headers.get("${TIMESTAMP_HEADER}", "")
    sig = request.headers.get("${SIGNATURE_HEADER}", "")

    if not ts or abs(time.time() - int(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}:
        return "stale timestamp", 401

    digest = hmac.new(secret.encode(), f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest("sha256=" + digest, sig):
        return "bad signature", 401

    body = json.loads(raw)
    if body.get("event") == "${PING_EVENT}":
        return jsonify(ok=True)

    # ${RETURN_NOTE}
    slug = body.get("slug") or "untitled"
    return jsonify(url=f"https://yoursite.com/blog/{slug}", id=slug)`,
};

const FASTAPI: CustomHandlerRecipe = {
  id: "fastapi",
  label: "FastAPI",
  language: LANG_PYTHON,
  file: "main.py",
  envFile: ".env (with pydantic-settings) or the process environment",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `os.environ["${SIGNING_SECRET_ENV}"]`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "Take Request, not a Pydantic model. A model argument makes FastAPI parse the body and you lose the bytes.",
    "await request.body() can only be awaited once per request — do it before anything else touches the body.",
  ],
  code: `# main.py
import hashlib, hmac, json, os, time
from fastapi import FastAPI, Request, Response

app = FastAPI()

@app.post("${SUGGESTED_ROUTE_PATH}")
async def publish(request: Request):
    secret = os.environ.get("${SIGNING_SECRET_ENV}")
    if not secret:
        return Response("missing ${SIGNING_SECRET_ENV}", status_code=500)

    raw = (await request.body()).decode("utf-8")             # raw body, not a model
    ts = request.headers.get("${TIMESTAMP_HEADER}", "")
    sig = request.headers.get("${SIGNATURE_HEADER}", "")

    if not ts or abs(time.time() - int(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS}:
        return Response("stale timestamp", status_code=401)

    digest = hmac.new(secret.encode(), f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest("sha256=" + digest, sig):
        return Response("bad signature", status_code=401)

    body = json.loads(raw)
    if body.get("event") == "${PING_EVENT}":
        return {"ok": True}

    # ${RETURN_NOTE}
    slug = body.get("slug") or "untitled"
    return {"url": f"https://yoursite.com/blog/{slug}", "id": slug}`,
};
const RAILS: CustomHandlerRecipe = {
  id: "rails",
  label: "Ruby on Rails",
  language: LANG_RUBY,
  file: "app/controllers/publish_controller.rb",
  alsoTouches: "config/routes.rb — post \"/api/publish\", to: \"publish#create\"",
  envFile: ".env (with dotenv-rails) or Rails credentials",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `ENV["${SIGNING_SECRET_ENV}"]`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "skip_before_action :verify_authenticity_token is required, or Rails rejects the POST with an InvalidAuthenticityToken.",
    "request.raw_post is the raw body. params is parsed and re-ordered, so it cannot be used for the HMAC.",
    "Inheriting from ActionController::API (rather than Base) skips the CSRF machinery entirely.",
  ],
  code: `# config/routes.rb
#   post "/api/publish", to: "publish#create"

# app/controllers/publish_controller.rb
require "openssl"

class PublishController < ActionController::API
  skip_before_action :verify_authenticity_token, raise: false

  def create
    secret = ENV["${SIGNING_SECRET_ENV}"]
    return render plain: "missing ${SIGNING_SECRET_ENV}", status: 500 if secret.blank?

    raw = request.raw_post                                   # raw body, not params
    ts  = request.headers["${TIMESTAMP_HEADER}"].to_s
    sig = request.headers["${SIGNATURE_HEADER}"].to_s

    if ts.empty? || (Time.now.to_i - ts.to_i).abs > ${TIMESTAMP_TOLERANCE_SECONDS}
      return render plain: "stale timestamp", status: 401
    end

    expected = "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", secret, "#{ts}.#{raw}")
    unless ActiveSupport::SecurityUtils.secure_compare(expected, sig)
      return render plain: "bad signature", status: 401
    end

    body = JSON.parse(raw)
    return render json: { ok: true } if body["event"] == "${PING_EVENT}"

    # ${RETURN_NOTE}
    slug = body["slug"].presence || "untitled"
    render json: { url: "https://yoursite.com/blog/#{slug}", id: slug }
  end
end`,
};
const GO_HTTP: CustomHandlerRecipe = {
  id: "go",
  label: "Go (net/http)",
  language: LANG_GO,
  file: "publish.go",
  alsoTouches: "your main() — http.HandleFunc(\"/api/publish\", publishHandler)",
  envFile: "the process environment, or a .env loaded by your own code",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `os.Getenv("${SIGNING_SECRET_ENV}")`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "io.ReadAll(r.Body) once, then use those bytes for both the HMAC and json.Unmarshal.",
    "hmac.Equal, not bytes.Equal or ==, so the comparison is constant-time.",
    "Header names are canonicalised by net/http, so r.Header.Get is case-insensitive — the lowercase name we send matches.",
  ],
  code: `// publish.go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"time"
)

func publishHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	secret := os.Getenv("${SIGNING_SECRET_ENV}")
	if secret == "" {
		http.Error(w, "missing ${SIGNING_SECRET_ENV}", http.StatusInternalServerError)
		return
	}

	raw, _ := io.ReadAll(r.Body) // raw bytes, used for both the HMAC and the decode
	ts := r.Header.Get("${TIMESTAMP_HEADER}")
	sig := r.Header.Get("${SIGNATURE_HEADER}")

	sent, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || math.Abs(float64(time.Now().Unix()-sent)) > ${TIMESTAMP_TOLERANCE_SECONDS} {
		http.Error(w, "stale timestamp", http.StatusUnauthorized)
		return
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + string(raw)))
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(sig)) {
		http.Error(w, "bad signature", http.StatusUnauthorized)
		return
	}

	var body map[string]any
	json.Unmarshal(raw, &body)
	w.Header().Set("Content-Type", "application/json")
	if body["event"] == "${PING_EVENT}" {
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	}

	// ${RETURN_NOTE}
	slug, _ := body["slug"].(string)
	if slug == "" {
		slug = "untitled"
	}
	json.NewEncoder(w).Encode(map[string]any{"url": "https://yoursite.com/blog/" + slug, "id": slug})
}`,
};
const ASPNET: CustomHandlerRecipe = {
  id: "aspnet",
  label: "ASP.NET Core (minimal API)",
  language: LANG_DOTNET,
  file: "Program.cs",
  envFile: "appsettings.Development.json locally; the host's environment variables in production",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `Environment.GetEnvironmentVariable("${SIGNING_SECRET_ENV}")`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "Read the body with a StreamReader before model binding — take HttpRequest as the parameter, not a DTO.",
    "CryptographicOperations.FixedTimeEquals is the constant-time comparison; == on strings is not.",
    "Convert.ToHexString returns uppercase, so lower it — the signature we send is lowercase hex.",
  ],
  code: `// Program.cs
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapPost("${SUGGESTED_ROUTE_PATH}", async (HttpRequest request) =>
{
    var secret = Environment.GetEnvironmentVariable("${SIGNING_SECRET_ENV}");
    if (string.IsNullOrEmpty(secret))
        return Results.Text("missing ${SIGNING_SECRET_ENV}", statusCode: 500);

    using var reader = new StreamReader(request.Body);
    var raw = await reader.ReadToEndAsync();                  // raw body, before binding
    var ts = request.Headers["${TIMESTAMP_HEADER}"].ToString();
    var sig = request.Headers["${SIGNATURE_HEADER}"].ToString();

    if (!long.TryParse(ts, out var sent) ||
        Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - sent) > ${TIMESTAMP_TOLERANCE_SECONDS})
        return Results.Text("stale timestamp", statusCode: 401);

    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{ts}.{raw}"));
    var expected = "sha256=" + Convert.ToHexString(hash).ToLowerInvariant();

    if (!CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(sig)))
        return Results.Text("bad signature", statusCode: 401);

    var body = JsonDocument.Parse(raw).RootElement;
    var evt = body.TryGetProperty("event", out var e) ? e.GetString() : "";
    if (evt == "${PING_EVENT}") return Results.Json(new { ok = true });

    // ${RETURN_NOTE}
    var slug = body.TryGetProperty("slug", out var s) ? s.GetString() : null;
    slug = string.IsNullOrEmpty(slug) ? "untitled" : slug;
    return Results.Json(new { url = $"https://yoursite.com/blog/{slug}", id = slug });
});

app.Run();`,
};
const SPRING: CustomHandlerRecipe = {
  id: "spring",
  label: "Java (Spring Boot)",
  language: LANG_JAVA,
  file: "src/main/java/com/yoursite/PublishController.java",
  envFile: "application.properties locally; the host's environment variables in production",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: `@Value("\${${SIGNING_SECRET_ENV}}")`,
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "Take @RequestBody String — a String gives you the body exactly as sent. A DTO is deserialised and cannot be re-signed.",
    "MessageDigest.isEqual is the constant-time comparison on the JVM; String.equals is not.",
    "With Spring Security on the classpath, permit this path explicitly and disable CSRF for it — the signature is the authentication.",
  ],
  code: `// src/main/java/com/yoursite/PublishController.java
package com.yoursite;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class PublishController {

  @Value("\${${SIGNING_SECRET_ENV}:}")
  private String secret;

  @PostMapping("${SUGGESTED_ROUTE_PATH}")
  public ResponseEntity<?> publish(
      @RequestBody String raw,                                 // raw body as sent
      @RequestHeader(value = "${TIMESTAMP_HEADER}", required = false) String ts,
      @RequestHeader(value = "${SIGNATURE_HEADER}", required = false) String sig)
      throws Exception {

    if (secret == null || secret.isEmpty())
      return ResponseEntity.status(500).body("missing ${SIGNING_SECRET_ENV}");

    if (ts == null || Math.abs(Instant.now().getEpochSecond() - Long.parseLong(ts)) > ${TIMESTAMP_TOLERANCE_SECONDS})
      return ResponseEntity.status(401).body("stale timestamp");

    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    byte[] hash = mac.doFinal((ts + "." + raw).getBytes(StandardCharsets.UTF_8));
    StringBuilder hex = new StringBuilder("sha256=");
    for (byte b : hash) hex.append(String.format("%02x", b));

    if (sig == null || !MessageDigest.isEqual(
            hex.toString().getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8)))
      return ResponseEntity.status(401).body("bad signature");

    var body = new com.fasterxml.jackson.databind.ObjectMapper().readTree(raw);
    if ("${PING_EVENT}".equals(body.path("event").asText()))
      return ResponseEntity.ok(java.util.Map.of("ok", true));

    // ${RETURN_NOTE}
    String slug = body.path("slug").asText("");
    if (slug.isEmpty()) slug = "untitled";
    return ResponseEntity.ok(java.util.Map.of("url", "https://yoursite.com/blog/" + slug, "id", slug));
  }
}`,
};
/**
 * The fallback that makes "any coded site" true rather than a slogan: the same
 * contract as eight numbered steps, implementable in anything that can read an
 * HTTP body and compute an HMAC — Elixir, Rust, Perl, ColdFusion, a CGI script.
 */
const ANY_LANGUAGE: CustomHandlerRecipe = {
  id: "any",
  label: "My stack is not listed",
  language: LANG_ANY,
  file: "any public route that accepts POST — e.g. /api/publish",
  envFile: "wherever your stack keeps secrets (environment variable, config file, secret manager)",
  envLine: `${SIGNING_SECRET_ENV}=paste-the-same-long-random-string`,
  envRead: "however your language reads an environment variable",
  endpoint: `https://yoursite.com${SUGGESTED_ROUTE_PATH}`,
  notes: [
    "Nothing about the connector is framework-specific — it is one signed POST. If your stack can read a request body and compute HMAC-SHA256, it is supported.",
    "The two rules that decide whether it works: hash the body exactly as received, and put the timestamp, a dot, then that body into the HMAC.",
    "Use the curl self-test below to prove your route accepts a signed request before you press Connect & verify.",
  ],
  code: `THE WHOLE CONTRACT, IN EIGHT STEPS
==================================

1. Serve a route at a public https URL that accepts POST.
   Anything works: ${SUGGESTED_ROUTE_PATH}, /webhooks/postloom, /publish.php — you paste the URL.

2. Read the request body as raw text or bytes, BEFORE any JSON parsing.
   Store it as-is. Do not pretty-print, re-order keys, or re-serialise it.

3. Read two headers:
   ${TIMESTAMP_HEADER}   → unix seconds, as a string
   ${SIGNATURE_HEADER}   → "sha256=" followed by 64 lowercase hex characters

4. Reject the request if the timestamp is more than ${TIMESTAMP_TOLERANCE_SECONDS} seconds away from your
   own clock (either direction). This is what stops a captured request being replayed.

5. Compute:  expected = "sha256=" + lowercase_hex( HMAC_SHA256( key = your secret,
                                                                message = timestamp + "." + raw_body ) )
   The message is the timestamp string, one literal dot, then the raw body. Nothing else,
   no newline at the end.

6. Compare expected with the ${SIGNATURE_HEADER} value using a constant-time
   comparison (hmac.compare_digest, hash_equals, hmac.Equal, MessageDigest.isEqual…).
   Compare the whole value, "sha256=" prefix included. If it differs, answer 401 and stop.

7. Parse the JSON. If body.event == "${PING_EVENT}", answer 200 with any body — that is the
   Check connection button, and it is all it needs.

8. Otherwise the body is an article (title, slug, html, excerpt, seo, tags, featuredImage).
   Store it, then answer 200 with {"url": "<where it now lives>", "id": "<your id>"}.
   The url becomes the View live link. Omit it and the publish still counts as done.`,
};

/**
 * Prove the route works before involving the app: signs a ping with the same
 * scheme and posts it. If this returns 2xx, "Check connection" will too.
 */
export const CUSTOM_CURL_SELFTEST = `# bash + openssl — run this from your own machine
SECRET='paste-your-signing-secret'
URL='https://yoursite.com${SUGGESTED_ROUTE_PATH}'

TS=$(date +%s)
BODY='{"event":"${PING_EVENT}","sentAt":"2026-01-31T09:15:00.000Z"}'
SIG="sha256=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)"

curl -i -X POST "$URL" \\
  -H 'Content-Type: application/json' \\
  -H "${TIMESTAMP_HEADER}: $TS" \\
  -H "${SIGNATURE_HEADER}: $SIG" \\
  --data "$BODY"

# 2xx  → your route is ready; paste the URL and the secret into the connector.
# 401  → the HMAC does not match. Almost always the body was re-serialised, or the
#        timestamp and the dot were left out of the signed string.
# 404  → the path is not where you think it is. Check the deployed URL in a browser.
# 301/308 → the URL redirects. Save the URL it redirects TO; we do not follow redirects.`;
// ---------------------------------------------------------------------------
// THE PICKERS
// ---------------------------------------------------------------------------

/** Every stack we ship a paste-ready handler for. Order is the dropdown order. */
export const CUSTOM_HANDLERS: CustomHandlerRecipe[] = [
  NEXT_APP_ROUTER,
  NEXT_PAGES_ROUTER,
  ASTRO,
  NUXT,
  SVELTEKIT,
  REMIX,
  EXPRESS,
  FASTIFY,
  EDGE_WORKER,
  LARAVEL,
  PHP_PLAIN,
  SYMFONY,
  DJANGO,
  FLASK,
  FASTAPI,
  RAILS,
  GO_HTTP,
  ASPNET,
  SPRING,
  ANY_LANGUAGE,
];

/**
 * The language dropdown, in the order shown. Derived from the recipes so a new
 * one cannot be added to a language group the picker does not render.
 */
export const CUSTOM_LANGUAGES: string[] = [
  LANG_JS,
  LANG_PHP,
  LANG_PYTHON,
  LANG_RUBY,
  LANG_GO,
  LANG_DOTNET,
  LANG_JAVA,
  LANG_ANY,
];

export function handlersForLanguage(language: string): CustomHandlerRecipe[] {
  return CUSTOM_HANDLERS.filter((recipe) => recipe.language === language);
}

export const DEFAULT_LANGUAGE = LANG_JS;
export const DEFAULT_HANDLER_ID = NEXT_APP_ROUTER.id;

export function getHandlerRecipe(id: string): CustomHandlerRecipe {
  return CUSTOM_HANDLERS.find((recipe) => recipe.id === id) || ANY_LANGUAGE;
}

/** The original single export, kept so nothing that imports it has to change. */
export const CUSTOM_HANDLER_EXAMPLE = NEXT_APP_ROUTER.code;
