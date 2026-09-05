// ============================================================================
// /adminshahid/keys — API KEYS & CREDENTIALS
// ============================================================================

import { describeEnvOnlyKeys, describeManagedKeys, ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { isEncryptionConfigured } from "@/lib/crypto";
import { providerKeyNames } from "@/lib/providers/registry";
import { KeysManager } from "@/components/dashboard/admin/KeysManager";

export const metadata = { title: "API Keys — Admin Control Plane" };

export default async function AdminKeysPage() {
  await ensureRuntimeConfig();
  // The AI companies are connected on the Models screen, beside the models that use
  // them, so they are filtered out here rather than removed from `MANAGED_KEYS` —
  // that list is the write allowlist and the only source of the `secret` flag.
  const providerKeys = new Set(providerKeyNames());
  return (
    <KeysManager
      keys={describeManagedKeys().filter((k) => !providerKeys.has(k.name))}
      envOnly={describeEnvOnlyKeys()}
      encryptionReady={isEncryptionConfigured()}
    />
  );
}
