/**
 * CUSTOM SITE CONTRACT — the request described in one place
 *
 * Split out of `custom.ts` because the in-app guide is a client component and
 * `custom.ts` imports node's `crypto`, which a browser bundle should never pull
 * in. Strings only. The same words now describe the request in the connector
 * form, in the guide the user copies from, and in the code that signs it, so the
 * three cannot drift apart.
 */

export const SIGNATURE_HEADER = "x-postloom-signature";
export const TIMESTAMP_HEADER = "x-postloom-timestamp";

export const CUSTOM_TARGET_CONTRACT = `POST <your endpoint>
Content-Type: application/json
${TIMESTAMP_HEADER}: <unix seconds>
${SIGNATURE_HEADER}: sha256=<hex HMAC of "<timestamp>.<raw body>" using your signing secret>

{
  "event": "article.publish" | "ping",
  "contentType": "post" | "page",
  "status": "publish" | "draft" | "pending",
  "title": "...", "slug": "...", "html": "...", "excerpt": "...",
  "seo": { "metaTitle": "...", "metaDescription": "...", "focusKeyword": "...", "schema": "<json-ld or empty>" },
  "tags": ["..."],
  "featuredImage": { "url": "...", "alt": "..." } | null
}

Reply 2xx. Return {"url":"https://...","id":"..."} to have the live link shown in the app.`;

/**
 * A handler that really works, in plain Node — no framework helpers, so it ports
 * to Express, Laravel or a serverless function by changing the first two lines.
 */
export const CUSTOM_HANDLER_EXAMPLE = `// app/api/publish/route.js  —  Next.js App Router
import crypto from "crypto";

export async function POST(req) {
  const secret = process.env.PUBLISH_SIGNING_SECRET;

  // The raw bytes, before JSON.parse. Re-serialising changes them and the
  // signature will never match.
  const raw = await req.text();
  const ts = req.headers.get("${TIMESTAMP_HEADER}") || "";
  const sig = req.headers.get("${SIGNATURE_HEADER}") || "";

  // Older than five minutes: refuse it, so a captured request cannot be replayed.
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return new Response("stale timestamp", { status: 401 });
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");

  // Constant-time compare. A plain === leaks where the first wrong byte is.
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return new Response("bad signature", { status: 401 });
  }

  const body = JSON.parse(raw);

  // The app sends this when you press Check connection. Answer 2xx and stop.
  if (body.event === "ping") return Response.json({ ok: true });

  // Your code: write the post, then hand back where it landed.
  const url = await savePost(body);
  return Response.json({ url, id: body.slug });
}`;
