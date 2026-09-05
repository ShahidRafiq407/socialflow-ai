// ============================================================================
// /adminshahid/keys — API KEYS & CREDENTIALS
// ============================================================================

import { describeEnvOnlyKeys, describeManagedKeys, ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { isEncryptionConfigured } from "@/lib/crypto";
import { KeysManager } from "@/components/dashboard/admin/KeysManager";

export const metadata = { title: "API Keys — Admin Control Plane" };

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
