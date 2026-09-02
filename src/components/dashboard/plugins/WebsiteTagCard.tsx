"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Radio,
  Trash2,
} from "lucide-react";
import {
  disableWebsiteTracking,
  rotateTrackingKey,
  setupWebsiteTracking,
  verifyWebsiteTracking,
} from "@/actions/growthLeads";
import type { TrackingStatus } from "@/lib/types/growth";

/**
 * The lead tag connector: one line of JavaScript the user pastes on their own
 * site so a form submit, a WhatsApp tap, an email or a phone tap is counted as a
 * lead and credited to the post that sent the visitor.
 *
 * It lives here, in Plugins, with every other connection — the Goal page only
 * reports whether it is installed. One place to install, one truth about it.
 */
export function WebsiteTagCard({
  workspaceId,
  status,
  onStatus,
  focused,
}: {
  workspaceId: string;
  status: TrackingStatus;
  onStatus: (next: TrackingStatus) => void;
  focused: boolean;
}) {
  const [domain, setDomain] = useState(status.domain || "");
  const [busy, setBusy] = useState<null | "setup" | "verify" | "rotate" | "remove">(null);
  const [note, setNote] = useState<{ tone: "ok" | "wait" | "bad"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const install = async () => {
    setBusy("setup");
    setNote(null);
    const res = await setupWebsiteTracking(workspaceId, domain);
    setBusy(null);
    if (!res.success || !res.status) {
      setNote({ tone: "bad", text: res.error || "Could not create the snippet." });
      return;
    }
    onStatus(res.status);
    setNote({
      tone: "wait",
      text: "Snippet ready. Paste it just before </body> on every page of your site, then press Verify.",
    });
  };

  const verify = async () => {
    setBusy("verify");
    const res = await verifyWebsiteTracking(workspaceId);
    setBusy(null);
    onStatus(res.status);
    setNote({ tone: res.verified ? "ok" : "wait", text: res.message });
  };

  const rotate = async () => {
    setBusy("rotate");
    const res = await rotateTrackingKey(workspaceId);
    setBusy(null);
    if (!res.success || !res.status) {
      setNote({ tone: "bad", text: res.error || "Could not create a new key." });
      return;
    }
    onStatus(res.status);
    setNote({
      tone: "wait",
      text: "New key created. The old snippet has stopped working — replace it on your site with the one below.",
    });
  };

  const remove = async () => {
    setBusy("remove");
    const res = await disableWebsiteTracking(workspaceId);
    setBusy(null);
    setConfirmRemove(false);
    if (!res.success) {
      setNote({ tone: "bad", text: res.error || "Could not remove the tag." });
      return;
    }
    onStatus({
      installed: false,
      trackingKey: null,
      domain: null,
      verifiedAt: null,
      snippet: "",
      leadsCaptured: 0,
      stale: false,
    });
    setNote({
      tone: "wait",
      text: "Tag removed. Website leads will stop being counted. Leads already captured are kept.",
    });
  };

  const copy = async () => {
    if (!status.snippet) return;
    try {
      await navigator.clipboard.writeText(status.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setNote({ tone: "bad", text: "Could not copy. Select the snippet and copy it by hand." });
    }
  };

  return (
    <div
      id="connector-website-tag"
      className={`relative rounded-2xl border bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all ${
        focused
          ? "border-indigo-500 ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Radio className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Website Lead Tag</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Counts leads on your own site
            </p>
          </div>
        </div>
        {status.installed && status.verifiedAt && !status.stale ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Verified
          </span>
        ) : status.installed && status.stale ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" /> No leads in 7 days
          </span>
        ) : status.installed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
            Waiting for first lead
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
            Not installed
          </span>
        )}
      </div>

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        One line of JavaScript. It fires only when someone submits a form, taps WhatsApp, an email
        address or a phone number — never on a plain page view — and it carries the code from the
        post that brought the visitor, which is how a website lead gets credited to a post.
      </p>

      <div className="mt-4">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Your website domain
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="flex-1 min-w-[11rem] h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={install}
            disabled={busy !== null}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy === "setup" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {status.installed ? "Save domain" : "Create snippet"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Only requests from this domain are accepted, so nobody else can post leads into your
          account.
        </p>
      </div>

      {status.snippet && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Paste this before &lt;/body&gt;
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-1.5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
            {status.snippet}
          </pre>
        </div>
      )}

      {note && (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
            note.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : note.tone === "bad"
                ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400"
                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300"
          }`}
        >
          {note.text}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
        <span className="mr-auto text-xs font-medium text-slate-500">
          {status.installed
            ? `${status.leadsCaptured} lead${status.leadsCaptured === 1 ? "" : "s"} captured`
            : "Not installed"}
        </span>

        {status.installed && (
          <>
            <button
              type="button"
              onClick={verify}
              disabled={busy !== null}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === "verify" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Verify
            </button>
            <button
              type="button"
              onClick={rotate}
              disabled={busy !== null}
              title="Create a new key — use this if the old snippet leaked"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === "rotate" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              New key
            </button>
            {confirmRemove ? (
              <>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy !== null}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {busy === "remove" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 px-3 text-xs font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
