"use client";

// ============================================================================
// KEYS MANAGER
//
// Grouped rows, each with where its live value comes from (dashboard, env, or
// nowhere) and a masked preview. Typing a new value and saving replaces it;
// "Clear" removes the dashboard value so the env var applies again. The keys
// that a client reads at construction time are listed read-only at the bottom
// so nobody wonders why DATABASE_URL is not here.
//
// The AI companies are deliberately absent: their credential is entered on the
// Models screen, in the panel for the company itself, next to the models that
// need it. `MANAGED_KEYS` still lists them — it is the write allowlist — so the
// filtering happens where the page is built, not in the allowlist.
// ============================================================================

import { Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ManagedKeyStatus } from "@/lib/admin/runtimeConfig";
import { KeyRow } from "./KeyRow";
import { Section } from "./primitives";

export function KeysManager({
  keys,
  envOnly,
  encryptionReady,
}: {
  keys: ManagedKeyStatus[];
  envOnly: Array<{ name: string; configured: boolean }>;
  encryptionReady: boolean;
}) {
  const groups = Array.from(new Set(keys.map((k) => k.group)));

  return (
    <div className="space-y-5">
      {!encryptionReady && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">APP_ENCRYPTION_KEY is not set.</span> Secret keys cannot be stored from the dashboard until it is; non-secret
            values (store id, variant ids, test mode) still can. Env-provided secrets keep working.
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A value saved here takes effect on the next request on every instance, without a deploy. Clearing it returns to the environment variable.
        Secrets are encrypted at rest and only shown masked.
      </p>

      <p className="text-xs text-muted-foreground">
        Looking for an AI company&apos;s key? Those live on the{" "}
        <Link href="/adminshahid/models" className="font-medium text-primary underline-offset-2 hover:underline">
          Models
        </Link>{" "}
        screen, in the panel for the company itself, so the key sits beside the models that use it.
      </p>

      {groups.map((group) => (
        <Section key={group} title={group}>
          <div className="grid gap-3 lg:grid-cols-2">
            {keys
              .filter((k) => k.group === group)
              .map((k) => (
                <KeyRow key={k.name} spec={k} encryptionReady={encryptionReady} />
              ))}
          </div>
        </Section>
      ))}

      <Section title="Environment only" description="Read once when the process starts; changing them requires a redeploy. Shown so you can see what is configured.">
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {envOnly.map((k) => (
            <div key={k.name} className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono">{k.name}</span>
              <span className={`h-2 w-2 rounded-full ${k.configured ? "bg-emerald-500" : "bg-rose-500"}`} title={k.configured ? "configured" : "missing"} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
