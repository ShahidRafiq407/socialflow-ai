"use client";

import React, { useState } from "react";
import { Server, Plus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { addMcpServer } from "@/actions/mcpServers";
import type { McpServerView, McpToolSummary } from "@/actions/mcpServers";
import { pluginsForBackend, type PluginCatalogEntry } from "@/lib/plugins/catalog";
import { PluginLogoTile } from "./BrandLogos";
import { PluginCanChips, PluginSetupSteps } from "./PluginSetupSteps";

interface HeaderPair {
  key: string;
  value: string;
}

interface AddMcpServerModalProps {
  workspaceId: string;
  onClose: () => void;
  onAdded: (server: McpServerView) => void;
  /**
   * A catalog row the user picked from the directory. Its URL, name and auth
   * header are prefilled so connecting a free server is a confirm rather than a
   * copy-paste job — but nothing is stored until they press the button, because
   * the ones that need a key would fail if we saved them silently.
   */
  preset?: PluginCatalogEntry;
}

/** The catalog's own MCP rows, so the shortcuts can never drift from the directory. */
const CATALOG_PRESETS = pluginsForBackend("mcp").filter((entry) => entry.mcp);

export function AddMcpServerModal({
  workspaceId,
  onClose,
  onAdded,
  preset,
}: AddMcpServerModalProps) {
  const [name, setName] = useState(preset?.mcp?.suggestedName || "");
  const [url, setUrl] = useState(preset?.mcp?.urlIsPersonal ? "" : preset?.mcp?.url || "");
  const [headerPairs, setHeaderPairs] = useState<HeaderPair[]>(
    preset?.mcp?.authHeader ? [{ key: preset.mcp.authHeader, value: "" }] : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [discoveredTools, setDiscoveredTools] = useState<McpToolSummary[] | null>(null);

  /** Filling the form from a shortcut resets the headers that came with the last one. */
  const applyPreset = (entry: PluginCatalogEntry) => {
    setName(entry.mcp?.suggestedName || entry.name);
    setUrl(entry.mcp?.urlIsPersonal ? "" : entry.mcp?.url || "");
    setHeaderPairs(entry.mcp?.authHeader ? [{ key: entry.mcp.authHeader, value: "" }] : []);
    setError(null);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    setDiscoveredTools(null);
    try {
      // A header the user left blank is not a header — sending "Authorization: "
      // makes the server reject the handshake instead of treating it as absent.
      const headers = headerPairs.filter((p) => p.key.trim() && p.value.trim());
      const res = await addMcpServer(workspaceId, { name, url, headers });
      if (res.success && res.server) {
        onAdded(res.server);
        setDiscoveredTools(res.tools || []);
        setSuccessMsg(`Connected. ${res.server.toolCount} tools discovered.`);
      } else {
        setError(res.error || "Could not connect to the MCP server.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not connect to the MCP server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            {preset ? (
              <PluginLogoTile id={preset.logo} size="md" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Server className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate font-bold text-slate-900 dark:text-white">
                {preset ? `Connect ${preset.name}` : "Add MCP server"}
              </h3>
              <p className="truncate text-xs text-slate-500">
                {preset?.blurb || "Attach a free or private MCP server for the AI CEO"}
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

        {preset && preset.can.length > 0 && (
          <div className="mt-4">
            <PluginCanChips can={preset.can} />
          </div>
        )}

        {preset && preset.setup.length > 0 && (
          <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Before you connect
            </p>
            <PluginSetupSteps steps={preset.setup} accent="violet" />
          </div>
        )}

        <form onSubmit={handleConnect} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Server Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Docs Search"
              maxLength={40}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              MCP Server URL (Streamable HTTP)
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              {preset?.mcp?.urlIsPersonal
                ? "This server gives you a personal URL that contains your own key — paste that one, not the example from their docs."
                : "The server must support the Streamable HTTP transport. We connect and list its tools before saving — nothing is stored until the connection is verified."}
            </p>
            {!preset && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CATALOG_PRESETS.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => applyPreset(entry)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <PluginLogoTile id={entry.logo} size="sm" className="h-4 w-4 rounded-[5px]" />
                    {entry.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Auth Headers (optional)
              </label>
              <button
                type="button"
                onClick={() => setHeaderPairs((prev) => [...prev, { key: "", value: "" }])}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-400"
              >
                <Plus className="h-3 w-3" /> Add header
              </button>
            </div>
            {headerPairs.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Only needed if the server requires an API key — e.g.{" "}
                <code className="font-mono">Authorization: Bearer ...</code> or{" "}
                <code className="font-mono">X-API-Key</code>. Stored encrypted, never sent back to
                the browser.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {headerPairs.map((pair, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) =>
                        setHeaderPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, key: e.target.value } : p))
                        )
                      }
                      placeholder="Header name"
                      className="w-2/5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                    <input
                      type="password"
                      value={pair.value}
                      onChange={(e) =>
                        setHeaderPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p))
                        )
                      }
                      placeholder="Value"
                      autoComplete="off"
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => setHeaderPairs((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600"
                      aria-label="Remove header"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> {successMsg}
              </span>
              {discoveredTools && discoveredTools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {discoveredTools.slice(0, 12).map((t) => (
                    <code
                      key={t.name}
                      title={t.description}
                      className="rounded-md bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-mono text-violet-600 dark:text-violet-400 border border-slate-200 dark:border-slate-700"
                    >
                      {t.name}
                    </code>
                  ))}
                  {discoveredTools.length > 12 && (
                    <span className="text-[10px] text-emerald-600/70">
                      +{discoveredTools.length - 12} more
                    </span>
                  )}
                </div>
              )}
              <p className="mt-2 text-[11px] font-normal">
                Ask the AI CEO in chat to use these tools — e.g. &ldquo;Use the{" "}
                {discoveredTools?.[0]?.name || "new MCP"} tool to help me&rdquo;.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400"
            >
              {successMsg ? "Done" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 disabled:opacity-60 transition-all"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
              {saving ? "Connecting & discovering tools..." : "Connect & discover tools"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
