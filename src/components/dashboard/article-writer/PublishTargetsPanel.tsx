"use client";

/**
 * PUBLISH TARGETS — WordPress, Shopify and hand-coded sites in one panel
 *
 * The old panel was a WordPress form with WordPress words on it, and it kept the
 * site's application password in `localStorage` so the browser could talk to the
 * REST API itself. Nothing here knows what a platform needs: the form is drawn
 * from `provider.fields`, so adding a platform on the server adds it to this UI
 * with no change to this file.
 *
 * Credentials are write-only. They go out through a server action and only
 * `hasCredentials` ever comes back, which is why an edit shows empty inputs and
 * says that a blank field keeps what is stored.
 */

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Globe,
  Loader2,
  Plug,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import {
  removePublishTarget,
  savePublishTarget,
  verifyPublishTarget,
} from "@/actions/cmsTargets";
import { ConfirmButton } from "@/components/dashboard/goals/shared";
import { CONTENT_TYPE_LABELS, PUBLISH_STATUS_LABELS } from "./constants";
import type {
  CmsContentType,
  CmsProviderDescriptor,
  CmsPublishStatus,
  CmsTargetSummary,
} from "./types";

const PROVIDER_ICON: Record<string, typeof Globe> = {
  wordpress: Globe,
  shopify: ShoppingBag,
  custom: Code2,
};

export interface PublishTargetsView {
  targets: CmsTargetSummary[];
  providers: CmsProviderDescriptor[];
  encryptionReady: boolean;
}

export interface PublishTargetsPanelProps {
  workspaceId: string;
  targets: CmsTargetSummary[];
  providers: CmsProviderDescriptor[];
  encryptionReady: boolean;
  selectedTargetId: string | null;
  onSelect: (targetId: string | null) => void;
  onChange: (view: PublishTargetsView) => void;
  onNotify: (tone: "success" | "error" | "info", text: string) => void;
}

function statusTone(status: string): string {
  if (status === "connected") return "bg-primary/10 text-primary border-primary/30";
  if (status === "error") return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never checked";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never checked";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "checked just now";
  if (minutes < 60) return `checked ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `checked ${hours}h ago`;
  return `checked ${Math.round(hours / 24)}d ago`;
}
export default function PublishTargetsPanel({
  workspaceId,
  targets,
  providers,
  encryptionReady,
  selectedTargetId,
  onSelect,
  onChange,
  onNotify,
}: PublishTargetsPanelProps) {
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [defaultContentType, setDefaultContentType] = useState<CmsContentType>("post");
  const [defaultStatus, setDefaultStatus] = useState<CmsPublishStatus>("draft");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const targetFor = (providerKey: string) =>
    targets.find((t) => t.providerKey === providerKey) || null;

  function openForm(provider: CmsProviderDescriptor) {
    const existing = targetFor(provider.key);
    const prefill: Record<string, string> = {};
    // Only non-secret meta ever comes back from the server; everything else stays
    // blank and is kept as stored when the field is submitted empty.
    for (const field of provider.fields) {
      const stored = existing?.meta ? (existing.meta as Record<string, unknown>)[field.key] : undefined;
      prefill[field.key] =
        stored === undefined || stored === null ? "" : String(stored);
      if (!prefill[field.key] && field.type === "select" && field.options?.length) {
        prefill[field.key] = field.options[0].value;
      }
    }
    setValues(prefill);
    setLabel(existing && !existing.legacy ? existing.label : "");
    const storedType = existing?.meta?.defaultContentType as CmsContentType | undefined;
    const storedStatus = existing?.meta?.defaultStatus as CmsPublishStatus | undefined;
    setDefaultContentType(
      storedType && provider.contentTypes.includes(storedType) ? storedType : provider.contentTypes[0]
    );
    setDefaultStatus(
      storedStatus && provider.statuses.includes(storedStatus)
        ? storedStatus
        : provider.statuses.includes("draft")
          ? "draft"
          : provider.statuses[0]
    );
    setOpenProvider(provider.key);
  }
  function submit(provider: CmsProviderDescriptor) {
    const existing = targetFor(provider.key);
    // A required field may be blank only when something is already stored for it.
    const missing = provider.fields
      .filter((f) => f.required && !String(values[f.key] || "").trim())
      .filter((f) => !(existing?.hasCredentials && (f.secret || f.store === "credentials")))
      .filter((f) => !(existing && f.store === "meta" && (existing.meta as any)?.[f.key]));
    if (missing.length > 0) {
      onNotify("error", `${missing.map((f) => f.label).join(", ")} — required.`);
      return;
    }

    startSaving(async () => {
      const result = await savePublishTarget(workspaceId, {
        providerKey: provider.key,
        values,
        label: label.trim() || undefined,
        defaults: { contentType: defaultContentType, status: defaultStatus },
      });
      if (result.view) onChange(result.view);
      if (result.success) {
        const saved = result.view?.targets.find((t) => t.providerKey === provider.key);
        if (saved) onSelect(saved.id);
        setOpenProvider(null);
        onNotify("success", `${provider.name} is connected and verified.`);
      } else {
        // The row is still written on a failed check, so the form closes only when
        // the platform accepted the credentials.
        onNotify("error", result.error || `${provider.name} did not accept those details.`);
      }
    });
  }

  function verify(target: CmsTargetSummary) {
    setBusyId(target.id);
    startSaving(async () => {
      const result = await verifyPublishTarget(workspaceId, target.id);
      if (result.view) onChange(result.view);
      setBusyId(null);
      onNotify(
        result.success ? "success" : "error",
        result.success
          ? `${result.label || target.label} answered. Ready to publish.`
          : result.error || "The platform did not accept the stored credentials."
      );
    });
  }
  function disconnect(target: CmsTargetSummary) {
    setBusyId(target.id);
    startSaving(async () => {
      const result = await removePublishTarget(workspaceId, target.id);
      if (result.view) onChange(result.view);
      setBusyId(null);
      if (selectedTargetId === target.id) onSelect(null);
      onNotify(
        result.success ? "info" : "error",
        result.success
          ? `${target.label} disconnected. Its stored credentials were deleted.`
          : result.error || "The connection could not be removed."
      );
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            Where this publishes
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            One connection per platform. Publishing, internal links and the site&apos;s
            categories all read from the one you select.
          </p>
        </div>
        {selectedTargetId ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {targets.find((t) => t.id === selectedTargetId)?.label || "Selected"}
          </span>
        ) : null}
      </header>

      {!encryptionReady && (
        <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>APP_ENCRYPTION_KEY is not set on the server.</strong> Credentials
            cannot be encrypted at rest, so saving a connection is blocked until it is
            added to the environment. Nothing is ever stored in plain text.
          </span>
        </p>
      )}
      <div className="p-5 grid gap-3 md:grid-cols-3">
        {providers.map((provider) => {
          const target = targetFor(provider.key);
          const Icon = PROVIDER_ICON[provider.key] || Globe;
          const isSelected = !!target && target.id === selectedTargetId;
          return (
            <div
              key={provider.key}
              className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{provider.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {provider.description}
                  </p>
                </div>
              </div>

              {target ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(target.status)}`}
                    >
                      {target.status === "connected" ? (
                        <Check className="w-3 h-3" />
                      ) : target.status === "error" ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : null}
                      {target.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {relativeTime(target.lastVerifiedAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground break-all">
                    {target.meta?.siteUrl ||
                      target.meta?.shopDomain ||
                      target.meta?.endpointUrl ||
                      target.label}
                  </p>
                  {target.lastError && (
                    <p className="text-[11px] text-destructive leading-snug">{target.lastError}</p>
                  )}
                  {target.legacy && (
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Carried over from the old WordPress connection. Re-connect it here to
                      set publishing defaults.
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelect(isSelected ? null : target.id)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      {isSelected ? <Check className="w-3 h-3" /> : null}
                      {isSelected ? "Selected" : "Use this"}
                    </button>
                    <button
                      type="button"
                      disabled={saving && busyId === target.id}
                      onClick={() => verify(target)}
                      className="h-8 px-3 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {saving && busyId === target.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Re-check
                    </button>
                    <button
                      type="button"
                      onClick={() => openForm(provider)}
                      className="h-8 px-3 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted"
                    >
                      Edit
                    </button>
                    <ConfirmButton
                      onConfirm={() => disconnect(target)}
                      label="Remove"
                      confirmLabel="Remove?"
                      busy={saving && busyId === target.id}
                      icon={<Trash2 className="w-3 h-3" />}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => openForm(provider)}
                  className="mt-auto h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>
      {openProvider &&
        (() => {
          const provider = providers.find((p) => p.key === openProvider);
          if (!provider) return null;
          const existing = targetFor(provider.key);
          return (
            <div className="mx-5 mb-5 rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {existing ? `Update ${provider.name}` : `Connect ${provider.name}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {existing
                      ? "Leave a field blank to keep what is already stored. Credentials are never sent back to the browser."
                      : "Saved encrypted, then verified against the platform before it is marked connected."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenProvider(null)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Name this connection
                  </span>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={provider.name}
                    className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-ring focus:outline-none"
                  />
                </label>

                {provider.fields.map((field) => (
                  <label key={field.key} className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {field.label}
                      {field.required ? <span className="text-destructive"> *</span> : null}
                      {field.secret ? (
                        <span className="ml-1.5 normal-case tracking-normal font-medium text-[10px] text-primary">
                          encrypted
                        </span>
                      ) : null}
                    </span>
                    {field.type === "select" ? (
                      <select
                        value={values[field.key] || ""}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-ring focus:outline-none"
                      >
                        {(field.options || []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                        autoComplete={field.secret ? "new-password" : "off"}
                        value={values[field.key] || ""}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={
                          existing && field.secret ? "•••••• (stored)" : field.placeholder || ""
                        }
                        className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-ring focus:outline-none"
                      />
                    )}
                    {field.help && (
                      <span className="block text-[10px] text-muted-foreground leading-snug">
                        {field.help}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Publish as
                  </span>
                  <select
                    value={defaultContentType}
                    onChange={(e) => setDefaultContentType(e.target.value as CmsContentType)}
                    className="w-full h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-ring focus:outline-none"
                  >
                    {provider.contentTypes.map((type) => (
                      <option key={type} value={type}>
                        {CONTENT_TYPE_LABELS[type] || type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Default state
                  </span>
                  <select
                    value={defaultStatus}
                    onChange={(e) => setDefaultStatus(e.target.value as CmsPublishStatus)}
                    className="w-full h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-ring focus:outline-none"
                  >
                    {provider.statuses.map((status) => (
                      <option key={status} value={status}>
                        {PUBLISH_STATUS_LABELS[status] || status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving || !encryptionReady}
                  onClick={() => submit(provider)}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {saving ? "Verifying…" : existing ? "Save and re-verify" : "Save and verify"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenProvider(null)}
                  className="h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                {!provider.supportsSchema && (
                  <span className="text-[10px] text-muted-foreground">
                    {provider.name} takes no schema block — it is left in the HTML instead.
                  </span>
                )}
              </div>
            </div>
          );
        })()}
    </section>
  );
}
