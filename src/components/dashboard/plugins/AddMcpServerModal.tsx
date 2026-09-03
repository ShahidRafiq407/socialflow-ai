"use client";

import React, { useState } from "react";
import { Server, Plus, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { addMcpServer } from "@/actions/mcpServers";
import type { McpServerView, McpToolSummary } from "@/actions/mcpServers";

interface HeaderPair {
  key: string;
  value: string;
}

interface AddMcpServerModalProps {
  workspaceId: string;
  onClose: () => void;
  onAdded: (server: McpServerView) => void;
}

const EXAMPLE_SERVERS = [
  { name: "Context7 · free", url: "https://mcp.context7.com/mcp" },
  { name: "DeepWiki · free", url: "https://mcp.deepwiki.com/mcp" },
  { name: "Higress · free", url: "https://mcp.higress.ai/mcp" },
];

export function AddMcpServerModal({ workspaceId, onClose, onAdded }: AddMcpServerModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headerPairs, setHeaderPairs] = useState<HeaderPair[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [discoveredTools, setDiscoveredTools] = useState<McpToolSummary[] | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    setDiscoveredTools(null);
    try {
      const res = await addMcpServer(workspaceId, { name, url, headers: headerPairs });
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
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Add MCP Server</h3>
              <p className="text-xs text-slate-500">
                Connect free or private MCP servers for the AI CEO
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
              The server must support the Streamable HTTP transport. We connect and list its tools
              before saving — nothing is stored until the connection is verified.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLE_SERVERS.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  onClick={() => {
                    setName(ex.name);
                    setUrl(ex.url);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <ExternalLink className="h-2.5 w-2.5" /> {ex.name}
                </button>
              ))}
            </div>
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
