// ============================================================================
// /dashboard/admin/keys — API KEYS
//
// Third-party keys the product can read from the database instead of the
// environment. A value set here wins over the env var on the next request;
// clearing it falls back to the env var. Secrets are encrypted with
// APP_ENCRYPTION_KEY and only ever shown masked.
// ============================================================================

import { describeEnvOnlyKeys, describeManagedKeys, ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { isEncryptionConfigured } from "@/lib/crypto";
import { KeysManager } from "@/components/dashboard/admin/KeysManager";

export const metadata = { title: "API keys — admin" };

export default async function AdminKeysPage() {
  await ensureRuntimeConfig();
  return (
    <KeysManager
      keys={describeManagedKeys()}
      envOnly={describeEnvOnlyKeys()}
      encryptionReady={isEncryptionConfigured()}
    />
  );
}
