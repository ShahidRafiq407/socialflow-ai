// ============================================================================
// WOOCOMMERCE API CLIENT — server-only. Used by the Plugins connection test and
// by the AI CEO chat tools. Never import this from a client component.
//
// WooCommerce REST API v3: https://woocommerce.github.io/woocommerce-rest-api-docs/
// Auth: the consumer key/secret pair. Over HTTPS Woo accepts them as HTTP Basic,
// which is what we use — query-string auth leaks the secret into access logs.
//
// The store URL comes from the user, so it goes through assertPublicHttpUrl: this
// client runs on our server, and without that check a saved connection could aim
// it at an internal address.
// ============================================================================

import { assertPublicHttpUrl, trimTrailingSlash } from "@/lib/cms/types";

export interface WooProduct {
  id: number;
  name: string;
  status: string;
  price: string;
  stockStatus: string;
  permalink: string;
  sku: string;
}

interface WooCredentials {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

function endpoint(storeUrl: string, path: string, query?: Record<string, string>): string {
  const base = assertPublicHttpUrl(trimTrailingSlash(storeUrl), "Store URL");
  const url = new URL(`${trimTrailingSlash(base.toString())}/wp-json/wc/v3${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function woo<T>(
  creds: WooCredentials,
  path: string,
  init?: RequestInit & { query?: Record<string, string> }
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const { query, ...rest } = init || {};
  let url: string;
  try {
    url = endpoint(creds.storeUrl, path, query);
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid store URL." };
  }

  const basic = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");

  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${basic}`,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers || {}),
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      let message = `WooCommerce error ${res.status}`;
      if (res.status === 401) {
        message =
          "WooCommerce rejected the key pair. Check the consumer key and secret, and that the key has Read/Write permission.";
      } else if (res.status === 404) {
        message =
          "The REST API was not found at that URL. Check the store URL and that permalinks are not set to Plain.";
      } else {
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = `WooCommerce error ${res.status}: ${body.message}`;
        } catch {
          // keep the default message
        }
      }
      return { ok: false, error: message, status: res.status };
    }

    const body = (await res.json()) as T;
    return { ok: true, data: body };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting WooCommerce.",
    };
  }
}

function shape(raw: Record<string, unknown>): WooProduct {
  return {
    id: Number(raw.id || 0),
    name: String(raw.name || "Untitled"),
    status: String(raw.status || "unknown"),
    price: String(raw.price ?? ""),
    stockStatus: String(raw.stock_status || ""),
    permalink: String(raw.permalink || ""),
    sku: String(raw.sku || ""),
  };
}

/** Verifies a key pair by asking for one product — the cheapest authorised read. */
export async function getWooStore(
  creds: WooCredentials
): Promise<{ success: boolean; label?: string; error?: string }> {
  if (!creds.storeUrl?.trim()) return { success: false, error: "No store URL provided." };
  if (!creds.consumerKey?.trim() || !creds.consumerSecret?.trim()) {
    return { success: false, error: "Both the consumer key and secret are required." };
  }

  const res = await woo<unknown[]>(creds, "/products", { query: { per_page: "1" } });
  if (!res.ok) return { success: false, error: res.error };

  try {
    return { success: true, label: new URL(creds.storeUrl.trim()).host };
  } catch {
    return { success: true, label: "WooCommerce store" };
  }
}

export async function listWooProducts(
  creds: WooCredentials,
  options: { limit?: number; search?: string; status?: string } = {}
): Promise<{ success: boolean; products?: WooProduct[]; error?: string }> {
  const limit = Math.min(Math.max(options.limit || 20, 1), 50);
  const res = await woo<Array<Record<string, unknown>>>(creds, "/products", {
    query: {
      per_page: String(limit),
      ...(options.search ? { search: options.search } : {}),
      ...(options.status ? { status: options.status } : {}),
    },
  });

  if (!res.ok) return { success: false, error: res.error };
  return { success: true, products: (res.data || []).map(shape) };
}

export async function createWooProduct(
  creds: WooCredentials,
  input: {
    name: string;
    description?: string;
    shortDescription?: string;
    regularPrice?: string;
    sku?: string;
    status?: "draft" | "publish" | "pending";
    imageUrl?: string;
  }
): Promise<{ success: boolean; product?: WooProduct; error?: string }> {
  if (!input.name?.trim()) return { success: false, error: "A product name is required." };

  const res = await woo<Record<string, unknown>>(creds, "/products", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.trim(),
      type: "simple",
      status: input.status || "draft",
      ...(input.description ? { description: input.description } : {}),
      ...(input.shortDescription ? { short_description: input.shortDescription } : {}),
      ...(input.regularPrice ? { regular_price: String(input.regularPrice) } : {}),
      ...(input.sku ? { sku: input.sku } : {}),
      ...(input.imageUrl ? { images: [{ src: input.imageUrl }] } : {}),
    }),
  });

  if (!res.ok) return { success: false, error: res.error };
  return { success: true, product: shape(res.data || {}) };
}

export async function updateWooProduct(
  creds: WooCredentials,
  productId: number,
  patch: {
    name?: string;
    regularPrice?: string;
    salePrice?: string;
    stockStatus?: "instock" | "outofstock" | "onbackorder";
    status?: "draft" | "publish" | "pending";
    description?: string;
  }
): Promise<{ success: boolean; product?: WooProduct; error?: string }> {
  if (!productId) return { success: false, error: "A product id is required." };

  const body: Record<string, unknown> = {};
  if (patch.name) body.name = patch.name;
  if (patch.regularPrice) body.regular_price = String(patch.regularPrice);
  if (patch.salePrice) body.sale_price = String(patch.salePrice);
  if (patch.stockStatus) body.stock_status = patch.stockStatus;
  if (patch.status) body.status = patch.status;
  if (patch.description) body.description = patch.description;

  if (Object.keys(body).length === 0) {
    return { success: false, error: "Nothing to update." };
  }

  const res = await woo<Record<string, unknown>>(creds, `/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!res.ok) return { success: false, error: res.error };
  return { success: true, product: shape(res.data || {}) };
}
