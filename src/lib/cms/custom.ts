/**
 * CUSTOM SITE PUBLISH TARGET ("coding wali site")
 *
 * For a hand-built site — Next.js, Astro, Laravel, a static generator, anything.
 * The article is POSTed as JSON to an endpoint the site owner controls, signed
 * with HMAC-SHA256 so their handler can prove the request came from us and not
 * from anyone who guessed the URL.
 *
 * The payload is stable and documented in `CUSTOM_TARGET_CONTRACT`, which the UI
 * shows next to the field, so the receiving handler can be written once.
 *
 * Two safeguards worth naming: the endpoint must be a public address (see
 * assertPublicHttpUrl — otherwise the publish button becomes a request proxy into
 * our own network), and the signature covers the exact bytes we send.
 */

import crypto from "crypto";
import {
  CUSTOM_TARGET_CONTRACT,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "./customContract";
import {
  assertPublicHttpUrl,
  type CmsProvider,
  type CmsPublishInput,
  type CmsPublishResult,
  type CmsTarget,
  type CmsVerifyResult,
} from "./types";

// Re-exported so nothing that already imports them from here has to move. The
// definitions live in `customContract.ts`, which the client-side guide can read.
export { CUSTOM_TARGET_CONTRACT, SIGNATURE_HEADER, TIMESTAMP_HEADER };

/** `sha256=<hex>` over `${timestamp}.${body}` — the scheme the contract documents. */
export function signPayload(secret: string, timestamp: number, body: string): string {
  const mac = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `sha256=${mac}`;
}

async function send(
  target: CmsTarget,
  payload: Record<string, any>
): Promise<{ ok: boolean; status: number; body: string; data: any }> {
  const endpoint = assertPublicHttpUrl(target.meta.endpointUrl || "", "Publish endpoint");
  const secret = target.credentials.signingSecret || "";
  if (!secret) throw new Error("This custom target has no signing secret.");

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: signPayload(secret, timestamp, body),
  };
  if (target.credentials.bearerToken) {
    headers.Authorization = `Bearer ${target.credentials.bearerToken}`;
  }

  const res = await fetch(endpoint.toString(), {
    method: "POST",
    headers,
    body,
    cache: "no-store",
    redirect: "manual", // a redirect would drop the signature headers
    signal: AbortSignal.timeout(25000),
  });

  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, body: text, data };
}

async function verify(target: CmsTarget): Promise<CmsVerifyResult> {
  try {
    const res = await send(target, { event: "ping", sentAt: new Date().toISOString() });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 0
            ? "The endpoint did not respond."
            : `The endpoint answered HTTP ${res.status}. It must return 2xx for a ping.`,
      };
    }
    const host = new URL(target.meta.endpointUrl || "").host;
    return { ok: true, label: host, meta: { detail: { pingStatus: res.status } } };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Could not reach the endpoint." };
  }
}

async function publish(target: CmsTarget, input: CmsPublishInput): Promise<CmsPublishResult> {
  try {
    const res = await send(target, {
      event: "article.publish",
      contentType: input.contentType,
      status: input.status,
      title: input.title,
      slug: input.slug || "",
      html: input.html,
      excerpt: input.excerpt || "",
      seo: {
        metaTitle: input.metaTitle || input.title,
        metaDescription: input.metaDescription || "",
        focusKeyword: input.focusKeyword || "",
        schema: input.schemaMarkup || "",
      },
      tags: input.tags || [],
      featuredImage: input.featuredImageUrl
        ? { url: input.featuredImageUrl, alt: input.featuredImageAlt || input.title }
        : null,
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Your endpoint answered HTTP ${res.status}${
          res.body ? `: ${res.body.slice(0, 200)}` : ""
        }`,
      };
    }

    // The handler may return the live URL; if it does not, that is not an error.
    const url = typeof res.data?.url === "string" ? res.data.url : undefined;
    const id = res.data?.id != null ? String(res.data.id) : undefined;
    return {
      success: true,
      id,
      url,
      status: input.status,
      warnings: url ? [] : ["Your endpoint did not return a URL, so there is no live link to open."],
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "The custom publish request failed." };
  }
}

export const customProvider: CmsProvider = {
  key: "custom",
  name: "Custom / coded site",
  description:
    "Any hand-built site. We POST the article as signed JSON to an endpoint you control.",
  contentTypes: ["post", "page"],
  statuses: ["publish", "draft", "pending"],
  supportsSchema: true,
  supportsFeaturedImage: true,
  fields: [
    {
      key: "endpointUrl",
      label: "Publish endpoint",
      type: "url",
      required: true,
      secret: false,
      store: "meta",
      placeholder: "https://example.com/api/publish",
      help: CUSTOM_TARGET_CONTRACT,
    },
    {
      key: "signingSecret",
      label: "Signing secret",
      type: "password",
      required: true,
      secret: true,
      store: "credentials",
      placeholder: "a long random string",
      help: "Your handler recomputes the HMAC with this and rejects anything that does not match.",
    },
    {
      key: "bearerToken",
      label: "Bearer token (optional)",
      type: "password",
      required: false,
      secret: true,
      store: "credentials",
      help: "Sent as an Authorization header if your endpoint sits behind one.",
    },
  ],
  verify,
  publish,
};
