"use client";

import React, { useState } from "react";
import { Globe, Loader2, CheckCircle2, AlertCircle, Trash2, ExternalLink } from "lucide-react";
import {
  connectWordPressSite,
  testWordPressSite,
  disconnectWordPressSite,
} from "@/actions/wordpressSite";
import type { WordPressSiteView } from "@/actions/wordpressSite";

interface ConnectWordPressModalProps {
  workspaceId: string;
  site: WordPressSiteView;
  onClose: () => void;
  onUpdate: (site: WordPressSiteView) => void;
}

export function ConnectWordPressModal({
  workspaceId,
  site,
  onClose,
  onUpdate,
}: ConnectWordPressModalProps) {
  const [siteUrl, setSiteUrl] = useState(site.siteUrl || "");
  const [username, setUsername] = useState(site.username || "");
  const [appPassword, setAppPassword] = useState("");
  const [defaultStatus, setDefaultStatus] = useState(site.defaultStatus || "publish");
  const [enableYoastSeo, setEnableYoastSeo] = useState(site.enableYoastSeo);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(site.lastError || null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const connected = site.connected;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await connectWordPressSite(workspaceId, {
        siteUrl,
        username,
        ...(appPassword.trim() ? { appPassword: appPassword.trim() } : {}),
        defaultStatus,
        enableYoastSeo,
      });
      if (res.success && res.site) {
        onUpdate(res.site);
        setAppPassword("");
        const extras = [
          res.categories?.length ? `${res.categories.length} categories` : null,
          res.authors?.length ? `${res.authors.length} authors` : null,
        ].filter(Boolean);
        setSuccessMsg(
          `Connected to WordPress REST API.${extras.length ? ` Detected: ${extras.join(", ")}.` : ""}`
        );
      } else {
        setError(res.error || "WordPress connection failed.");
      }
    } catch (err: any) {
      setError(err?.message || "WordPress connection failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await testWordPressSite(workspaceId);
      if (res.success) {
        setSuccessMsg("Connection verified with WordPress.");
        onUpdate({ ...site, connected: true, lastVerifiedAt: res.lastVerifiedAt || null, lastError: null });
      } else {
        setError(res.error || "Connection test failed.");
      }
    } catch (err: any) {
      setError(err?.message || "Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await disconnectWordPressSite(workspaceId);
      if (res.success) {
        onUpdate({
          connected: false,
          siteUrl: "",
          username: "",
          hasPassword: false,
          defaultStatus: "publish",
          defaultCategoryId: null,
          defaultAuthorId: null,
          postType: "posts",
          enableYoastSeo: true,
          lastVerifiedAt: null,
          lastError: null,
          encryptionConfigured: site.encryptionConfigured,
        });
        setSiteUrl("");
        setUsername("");
        setAppPassword("");
        setSuccessMsg("WordPress disconnected.");
      } else {
        setError(res.error || "Failed to disconnect.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">WordPress Connection</h3>
              <p className="text-xs text-slate-500">Secure REST API Application Password setup</p>
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

        {connected && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected
            {site.lastVerifiedAt && (
              <span className="ml-auto text-[11px] font-normal text-emerald-600/70 dark:text-emerald-400/70">
                Verified {new Date(site.lastVerifiedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {!site.encryptionConfigured && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            APP_ENCRYPTION_KEY is not set on the server. Credentials cannot be stored securely until
            it is added to the environment variables.
          </div>
        )}

        <form onSubmit={handleConnect} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              WordPress Website URL
            </label>
            <input
              type="url"
              required
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Admin Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-username"
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Default Post Status
              </label>
              <select
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="draft">Save as Draft (Recommended)</option>
                <option value="publish">Publish Immediately</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              WordPress Application Password (WordPress 5.6+)
            </label>
            <input
              type="password"
              required={!connected}
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder={connected ? "•••• (saved — leave blank to keep)" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              In WordPress WP-Admin → Users → Profile → scroll down to{" "}
              <a
                href="https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                &ldquo;Application Passwords&rdquo; <ExternalLink className="h-3 w-3" />
              </a>{" "}
              to generate a secure REST API token.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Enable Yoast / RankMath SEO Optimization
              </p>
              <p className="text-[11px] text-slate-500">
                AI auto-assigns SEO title, slug, and meta description
              </p>
            </div>
            <input
              type="checkbox"
              checked={enableYoastSeo}
              onChange={(e) => setEnableYoastSeo(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {successMsg}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              {connected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {disconnecting ? "Removing..." : "Disconnect"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {connected && (
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {testing ? "Testing..." : "Test connection"}
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? "Testing REST API..." : connected ? "Update credentials" : "Test Connection & Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
