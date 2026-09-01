"use client";

import React, { useState } from "react";
import { Server, Loader2, CheckCircle2, AlertCircle, Trash2, RefreshCw } from "lucide-react";
import {
  testMcpServer,
  toggleMcpServer,
  deleteMcpServer,
} from "@/actions/mcpServers";
import type { McpServerView } from "@/actions/mcpServers";

interface McpServerCardProps {
  workspaceId: string;
  server: McpServerView;
  onUpdated: (server: McpServerView) => void;
  onDeleted: (id: string) => void;
}

export function McpServerCard({ workspaceId, server, onUpdated, onDeleted }: McpServerCardProps) {
  const [busy, setBusy] = useState<"test" | "toggle" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(server.lastError || null);
  const [expanded, setExpanded] = useState(false);

  const connected = Boolean(server.lastVerifiedAt);

  const handleTest = async () => {
    setBusy("test");
    setError(null);
    try {
      const res = await testMcpServer(workspaceId, server.id);
      if (res.success && res.server) {
        onUpdated(res.server);
      } else {
        setError(res.error || "Connection test failed.");
      }
    } catch (err: any) {
      setError(err?.message || "Connection test failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = async () => {
    setBusy("toggle");
    setError(null);
    try {
      const res = await toggleMcpServer(workspaceId, server.id, !server.enabled);
      if (res.success && res.server) {
        onUpdated(res.server);
      } else {
        setError(res.error || "Failed to update the MCP server.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update the MCP server.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy("delete");
    setError(null);
    try {
      const res = await deleteMcpServer(workspaceId, server.id);
      if (res.success) {
        onDeleted(server.id);
      } else {
        setError(res.error || "Failed to delete the MCP server.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to delete the MCP server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{server.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
              {server.url}
            </p>
          </div>
        </div>
        {connected ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              server.enabled
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {server.enabled ? `${server.toolCount} tools` : "Disabled"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3" /> Failed
          </span>
        )}
      </div>

      {server.toolCount > 0 && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 text-xs font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-400"
        >
          {expanded ? "Hide tools" : `Show ${server.toolCount} discovered tools`}
        </button>
      )}
      {expanded && server.toolNames.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {server.toolNames.map((name) => (
            <code
              key={name}
              className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono text-violet-600 dark:text-violet-400"
            >
              {name}
            </code>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 font-medium">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
        <span className="text-xs font-medium text-slate-500">
          {server.lastVerifiedAt
            ? `Verified ${new Date(server.lastVerifiedAt).toLocaleDateString()}`
            : "Not verified"}
          {server.hasHeaders ? " • auth headers stored" : ""}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 disabled:opacity-60"
          >
            {busy === "test" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Test
          </button>
          <button
            onClick={handleToggle}
            disabled={busy !== null}
            className="text-xs font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 disabled:opacity-60"
          >
            {server.enabled ? "Disable" : "Enable"}
          </button>
          <button
            onClick={handleDelete}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-500 dark:text-red-400 disabled:opacity-60"
          >
            {busy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
