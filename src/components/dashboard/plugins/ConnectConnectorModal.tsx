"use client";

import React, { useState } from "react";
import { Plug, ExternalLink, Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import type { ConnectorDef } from "@/lib/connectors/registry";
import {
  connectConnector,
  testConnector,
  disconnectConnector,
} from "@/actions/connections";
import type { ConnectorView } from "@/actions/connections";

interface ConnectConnectorModalProps {
  workspaceId: string;
  connector: ConnectorDef;
  connection: ConnectorView | undefined;
  onClose: () => void;
  onUpdate: (view: ConnectorView | undefined) => void;
}

export function ConnectConnectorModal({
  workspaceId,
  connector,
  connection,
  onClose,
  onUpdate,
}: ConnectConnectorModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const connected = connection?.status === "connected";

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await connectConnector(workspaceId, connector.key, values);
      if (res.success && res.view) {
        onUpdate(res.view);
        setValues({});
        setSuccessMsg(
          `Connected successfully as ${res.view.accountLabel || "your account"}. The AI CEO can now use ${connector.name} tools.`
        );
      } else {
        setError(res.error || "Connection failed.");
      }
    } catch (err: any) {
      setError(err?.message || "Connection failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await testConnector(workspaceId, connector.key);
      if (res.view) onUpdate(res.view);
      if (res.success) {
        setSuccessMsg("Connection verified.");
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
      const res = await disconnectConnector(workspaceId, connector.key);
      if (res.success) {
        onUpdate(undefined);
        setSuccessMsg("Disconnected.");
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">{connector.name} Connection</h3>
              <p className="text-xs text-slate-500">{connector.tagline}</p>
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

        {connected && connection?.accountLabel && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected as {connection.accountLabel}
            {connection.lastVerifiedAt && (
              <span className="ml-auto text-[11px] font-normal text-emerald-600/70 dark:text-emerald-400/70">
                Verified {new Date(connection.lastVerifiedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleConnect} className="mt-5 space-y-4">
          {connector.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {field.label}
              </label>
              <input
                type={field.type === "password" ? "password" : "text"}
                required={field.required && !connected}
                value={values[field.key] || ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={connected ? "•••• (saved — leave blank to keep)" : field.placeholder}
                autoComplete="off"
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
              />
              {field.help && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {field.help}
                  {field.docsUrl && (
                    <>
                      {" "}
                      <a
                        href={field.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                      >
                        Create a token <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </p>
              )}
            </div>
          ))}

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
                {saving ? "Verifying..." : connected ? "Update credentials" : "Connect & verify"}
              </button>
            </div>
          </div>
        </form>

        {connector.chatTools && connector.chatTools.length > 0 && (
          <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4">
            <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
              AI CEO tools unlocked
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {connector.chatTools.map((tool) => (
                <code
                  key={tool}
                  className="rounded-md bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700"
                >
                  {tool}
                </code>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Once connected, just ask in AI Chat — e.g. &ldquo;Create a GitHub repo called
              my-project and push a README&rdquo;.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
