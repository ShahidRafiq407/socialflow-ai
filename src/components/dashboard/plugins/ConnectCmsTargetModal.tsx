"use client";

import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Trash2 } from "lucide-react";
// The client-side contract, not the server's: `@/lib/cms` narrows providerKey to a
// union the browser cannot reconstruct from a JSON payload, and PublishTargetsView
// — what this dialog is handed and what it hands back — already uses these.
import type { CmsProviderDescriptor, CmsTargetSummary } from "../article-writer/types";
import type { PublishTargetsView } from "@/actions/cmsTargets";
import { removePublishTarget, savePublishTarget, verifyPublishTarget } from "@/actions/cmsTargets";
import { getPluginEntry } from "@/lib/plugins/catalog";
import { PluginLogoTile } from "./BrandLogos";
import { PluginCanChips, PluginSetupSteps } from "./PluginSetupSteps";
import CustomSiteSetup from "./CustomSiteSetup";

// ============================================================================
// CONNECT A PUBLISHING TARGET
//
// WordPress, Shopify and hand-coded sites live in the CMS layer rather than the
// connector layer, but from the directory they are the same kind of row. This is
// the connector dialog's twin: same logo, same numbered guide, same write-only
// credential rules — it just posts to the CMS actions instead.
// ============================================================================

interface ConnectCmsTargetModalProps {
  workspaceId: string;
  provider: CmsProviderDescriptor;
  /** The existing target for this provider, when one is already connected. */
  target: CmsTargetSummary | undefined;
  encryptionReady: boolean;
  onClose: () => void;
  onUpdate: (view: PublishTargetsView) => void;
}

export function ConnectCmsTargetModal({
  workspaceId,
  provider,
  target,
  encryptionReady,
  onClose,
  onUpdate,
}: ConnectCmsTargetModalProps) {
  const entry = getPluginEntry(provider.key);
  const connected = target?.status === "connected";
  // A hand-coded site is the one target whose setup cannot be four fixed lines:
  // the file, the env location and the deploy step all depend on the stack, so the
  // picker replaces the catalog's steps here rather than sitting beside them.
  const isCustom = provider.key === "custom";

  // Readable config (meta) is redisplayed so an edit does not start from blank;
  // secrets are not, because the server never sends them back.
  const initial = useMemo(() => {
    const seed: Record<string, string> = {};
    for (const field of provider.fields) {
      if (field.secret) continue;
      const stored = (target?.meta as Record<string, unknown> | undefined)?.[field.key];
      if (typeof stored === "string" || typeof stored === "number") seed[field.key] = String(stored);
      else if (field.type === "select" && field.options?.length) seed[field.key] = field.options[0].value;
    }
    return seed;
  }, [provider.fields, target]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [label, setLabel] = useState(target?.label || "");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await savePublishTarget(workspaceId, {
        providerKey: provider.key,
        values,
        label: label.trim() || undefined,
      });
      if (res.view) onUpdate(res.view);
      if (res.success) {
        setSuccessMsg(`${provider.name} is connected. The AI CEO can publish to it now.`);
      } else {
        setError(res.error || "Could not save this target.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not save this target.");
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!target) return;
    setVerifying(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await verifyPublishTarget(workspaceId, target.id);
      if (res.view) onUpdate(res.view);
      if (res.success) setSuccessMsg(`Verified${res.label ? ` — ${res.label}` : ""}.`);
      else setError(res.error || "The check failed.");
    } catch (err: any) {
      setError(err?.message || "The check failed.");
    } finally {
      setVerifying(false);
    }
  };

  const handleRemove = async () => {
    if (!target) return;
    setRemoving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await removePublishTarget(workspaceId, target.id);
      if (res.view) onUpdate(res.view);
      if (res.success) {
        setSuccessMsg("Disconnected.");
      } else {
        setError(res.error || "Could not disconnect.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not disconnect.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div
        className={`relative max-h-[90vh] w-full ${
          isCustom ? "max-w-2xl" : "max-w-lg"
        } overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-3">
            {entry ? (
              <PluginLogoTile id={entry.logo} size="md" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {provider.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate font-bold text-slate-900 dark:text-white">{provider.name}</h3>
              <p className="truncate text-xs text-slate-500">
                {entry?.blurb || provider.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {entry && entry.can.length > 0 && (
          <div className="mt-4">
            <PluginCanChips can={entry.can} />
          </div>
        )}

        {connected && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected{target?.label ? ` — ${target.label}` : ""}
            {target?.lastVerifiedAt && (
              <span className="ml-auto text-[11px] font-normal text-emerald-600/70 dark:text-emerald-400/70">
                Verified {new Date(target.lastVerifiedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {target?.lastError && !connected && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {target.lastError}
          </div>
        )}

        {isCustom ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Set up your site — pick your stack
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                Any language, any host. Choose the three below and every file path, secret location
                and deploy step changes to match.
              </p>
            </div>
            <CustomSiteSetup variant="modal" />
          </div>
        ) : (
          entry &&
          entry.setup.length > 0 && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Where to get this
                </p>
                {entry.docsUrl && (
                  <a
                    href={entry.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                  >
                    Docs <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <PluginSetupSteps steps={entry.setup} accent="emerald" />
            </div>
          )
        )}

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          {provider.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {field.label}
                {!field.required && (
                  <span className="ml-1 font-normal text-slate-400">optional</span>
                )}
              </label>
              {field.type === "select" ? (
                <select
                  value={values[field.key] || ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {(field.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.secret ? "password" : field.type === "url" ? "url" : "text"}
                  required={field.required && !(field.secret && target?.hasCredentials)}
                  value={values[field.key] || ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={
                    field.secret && target?.hasCredentials
                      ? "•••• (saved — leave blank to keep)"
                      : field.placeholder
                  }
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              )}
              {field.help && <p className="mt-1.5 text-[11px] text-slate-500">{field.help}</p>}
            </div>
          ))}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Name it <span className="ml-1 font-normal text-slate-400">optional</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`My ${provider.name} site`}
              maxLength={60}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          {!encryptionReady && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              APP_ENCRYPTION_KEY is not set on the server, so credentials cannot be stored
              securely. Add it to your environment variables first.
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-600 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {successMsg}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              {target && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {removing ? "Removing..." : "Disconnect"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {target && (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {verifying ? "Checking..." : "Check connection"}
                </button>
              )}
              <button
                type="submit"
                disabled={saving || !encryptionReady}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? "Verifying..." : connected ? "Update" : "Connect & verify"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
