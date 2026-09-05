"use client";

// ============================================================================
// ONE MANAGED KEY, ONE ROW
//
// Shared by the Keys screen and the provider connection panel on the Models
// screen, because the rules are fiddly enough that a second copy would drift:
//
//   • a secret cannot be stored at all without APP_ENCRYPTION_KEY, so the input
//     locks rather than failing on save;
//   • "Clear" only exists where there is a dashboard value to clear — clearing
//     an env-provided key would look like it worked and change nothing;
//   • the value is never sent back to the browser, only the mask.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eraser, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManagedKeyStatus } from "@/lib/admin/runtimeConfig";
import { setManagedKeyAction } from "@/actions/admin";
import { fmtAgo } from "./primitives";

export const KEY_SOURCE: Record<ManagedKeyStatus["source"], { label: string; className: string }> = {
  dashboard: { label: "dashboard", className: "bg-primary/10 text-primary" },
  env: { label: "env", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  unset: { label: "not set", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
};

export function KeyRow({
  spec,
  encryptionReady,
  /** Overrides the row's heading, so the Models screen can show the company name. */
  title,
  /** Extra line under the heading — a link to where the key is minted. */
  footer,
  bare = false,
}: {
  spec: ManagedKeyStatus;
  encryptionReady: boolean;
  title?: string;
  footer?: React.ReactNode;
  bare?: boolean;
}) {
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
    <div className={bare ? "" : "rounded-lg border border-slate-200 dark:border-slate-800 p-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{title ?? spec.label}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{spec.name}</div>
        </div>
        <Badge variant="secondary" className={`text-[10px] ${KEY_SOURCE[spec.source].className}`}>
          {KEY_SOURCE[spec.source].label}
        </Badge>
        {spec.preview && <span className="font-mono text-[11px] text-muted-foreground">{spec.preview}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type={spec.secret ? "password" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            locked
              ? "Set APP_ENCRYPTION_KEY to store secrets here"
              : spec.source === "dashboard"
                ? "Replace the stored value"
                : "Paste the key to connect this company"
          }
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
      {footer}
      {error && <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
    </div>
  );
}
