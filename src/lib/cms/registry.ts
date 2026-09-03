/**
 * CMS PROVIDER REGISTRY
 *
 * The one list of publishing platforms. Adding a CMS means writing its file and
 * adding it here — no other file needs a new branch, because everything else
 * (the connect form, the status dropdown, the post/page choice) is rendered from
 * what the provider declares about itself.
 *
 * Server-only: the providers close over decrypted credentials and import
 * `"use server"` helpers. Client components receive `describeCmsProviders()`
 * output as props instead of importing this module.
 */

import { customProvider } from "./custom";
import { shopifyProvider } from "./shopify";
import type {
  CmsContentType,
  CmsField,
  CmsProvider,
  CmsProviderKey,
  CmsPublishStatus,
} from "./types";
import { wordpressProvider } from "./wordpress";

export const CMS_PROVIDERS: CmsProvider[] = [wordpressProvider, shopifyProvider, customProvider];

export function getCmsProvider(key: string): CmsProvider | undefined {
  return CMS_PROVIDERS.find((p) => p.key === key);
}

export function isCmsProviderKey(value: unknown): value is CmsProviderKey {
  return typeof value === "string" && CMS_PROVIDERS.some((p) => p.key === value);
}

/**
 * `UserConnection.providerKey` is shared with the Plugins connectors (github,
 * heygen, …), so publish targets are namespaced. Without the prefix a future
 * "shopify" automation connector and the Shopify publish target would collide on
 * `@@unique([workspaceId, providerKey])`.
 */
export const CMS_CONNECTION_PREFIX = "cms:";

export function connectionKeyFor(key: CmsProviderKey): string {
  return `${CMS_CONNECTION_PREFIX}${key}`;
}

/** The provider key inside a namespaced connection key, or null if it is not one. */
export function providerKeyFromConnection(connectionKey: string): CmsProviderKey | null {
  const raw = String(connectionKey || "");
  if (!raw.startsWith(CMS_CONNECTION_PREFIX)) return null;
  const key = raw.slice(CMS_CONNECTION_PREFIX.length);
  return isCmsProviderKey(key) ? key : null;
}

/**
 * The serializable half of a provider — everything the browser needs to draw the
 * connect form and the publish controls, and nothing it must not have (no
 * functions, no credentials).
 */
export interface CmsProviderDescriptor {
  key: CmsProviderKey;
  name: string;
  description: string;
  contentTypes: CmsContentType[];
  statuses: CmsPublishStatus[];
  supportsSchema: boolean;
  supportsFeaturedImage: boolean;
  fields: CmsField[];
}

export function describeCmsProvider(provider: CmsProvider): CmsProviderDescriptor {
  return {
    key: provider.key,
    name: provider.name,
    description: provider.description,
    contentTypes: [...provider.contentTypes],
    statuses: [...provider.statuses],
    supportsSchema: provider.supportsSchema,
    supportsFeaturedImage: provider.supportsFeaturedImage,
    fields: provider.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
  };
}

export function describeCmsProviders(): CmsProviderDescriptor[] {
  return CMS_PROVIDERS.map(describeCmsProvider);
}
