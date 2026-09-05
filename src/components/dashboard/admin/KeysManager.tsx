"use client";

// ============================================================================
// KEYS MANAGER
//
// Grouped rows, each with where its live value comes from (dashboard, env, or
// nowhere) and a masked preview. Typing a new value and saving replaces it;
// "Clear" removes the dashboard value so the env var applies again. The keys
// that a client reads at construction time are listed read-only at the bottom
// so nobody wonders why DATABASE_URL is not here.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eraser, Loader2, Lock, Save, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManagedKeyStatus } from "@/lib/admin/runtimeConfig";
import { setManagedKeyAction } from "@/actions/admin";
import { Section, fmtAgo } from "./primitives";

const SOURCE: Record<ManagedKeyStatus["source"], { label: string; className: string }> = {
  dashboard: { label: "dashboard", className: "bg-primary/10 text-primary" },
  env: { label: "env", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  unset: { label: "not set", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
};

function KeyRow({ spec, encryptionReady }: { spec: ManagedKeyStatus; encryptionReady: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const locked = spec.secret && !encryptionReady;

  const submit = async (next: string) => {
    setBusy(next ? "save" : "clear");
    setError(null);
    const result = await setManagedKeyAction({ name: spec.name, value: next });
    setBusy(null);
    if (result.success) {
      setValue("");
      setDone(true);
      setTimeout(() => setDone(false), 1500);
      startTransition(() => router.refresh());
    } else setError(result.error || "Could not save.");
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{spec.label}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{spec.name}</div>
        </div>
        <Badge variant="secondary" className={`text-[10px] ${SOURCE[spec.source].className}`}>
          {SOURCE[spec.source].label}
        </Badge>
        {spec.preview && <span className="font-mono text-[11px] text-muted-foreground">{spec.preview}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type={spec.secret ? "password" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={locked ? "Set APP_ENCRYPTION_KEY to store secrets here" : spec.source === "dashboard" ? "Replace the stored value" : "Set a value to override the env"}
          disabled={locked || busy !== null}
          autoComplete="off"
          className="h-8 font-mono text-xs"
        />
        <Button size="sm" disabled={locked || busy !== null || !value.trim()} onClick={() => submit(value)}>
          {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </Button>
        {spec.source === "dashboard" && (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => submit("")} title="Remove the dashboard value; the env var applies again">
            {busy === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
            Clear
          </Button>
        )}
      </div>
      {spec.updatedAt && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Set from the dashboard {fmtAgo(spec.updatedAt)}
          {spec.updatedBy ? ` by ${spec.updatedBy}` : ""}
        </div>
      )}
      {error && <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
    </div>
  );
}

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
