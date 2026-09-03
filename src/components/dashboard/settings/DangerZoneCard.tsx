"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Download,
  Loader2,
  MessageSquare,
  Share2,
  Trash2,
  UserX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { closeAccount, deleteWorkspace } from "@/actions/account";
import type { SettingsData } from "./types";

/**
 * Danger Zone — the two destructive actions, both guarded.
 *
 * Delete Workspace removes one workspace; Close Account removes the user and
 * everything they own. Both list the live consequences before the button ever
 * arms, and both require typing a confirmation so a stray click can never land
 * here. The export link sits inside both dialogs because the only good time to
 * back up is right before deleting.
 */

function ConsequenceRow({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5 text-xs text-foreground leading-relaxed">
      <span className="mt-0.5 text-destructive shrink-0">{icon}</span>
      {text}
    </li>
  );
}

export function DangerZoneCard({
  data,
  onToast,
}: {
  data: SettingsData;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const { workspace, counts, billing } = data;

  // ── Delete workspace state ──
  const [wsOpen, setWsOpen] = useState(false);
  const [wsConfirm, setWsConfirm] = useState("");
  const [wsBusy, setWsBusy] = useState(false);
  const [wsError, setWsError] = useState("");

  // ── Close account state ──
  const [acOpen, setAcOpen] = useState(false);
  const [acStep, setAcStep] = useState(1);
  const [acAck, setAcAck] = useState(false);
  const [acConfirm, setAcConfirm] = useState("");
  const [acBusy, setAcBusy] = useState(false);
  const [acError, setAcError] = useState("");

  const paidPlanActive =
    (billing.status || "").toUpperCase() === "ACTIVE" && billing.tier !== "FREE";

  const resetWsDialog = () => {
    setWsConfirm("");
    setWsError("");
    setWsBusy(false);
  };

  const resetAcDialog = () => {
    setAcStep(1);
    setAcAck(false);
    setAcConfirm("");
    setAcError("");
    setAcBusy(false);
  };

  const runDeleteWorkspace = async () => {
    setWsBusy(true);
    setWsError("");
    try {
      const result = await deleteWorkspace(workspace.id);
      if (result.success) {
        setWsOpen(false);
        // Hard navigation — the deleted workspace must not survive in any cache.
        window.location.href = result.redirect;
      } else {
        setWsError(result.error);
        setWsBusy(false);
      }
    } catch {
      setWsError("The workspace could not be deleted. Please try again.");
      setWsBusy(false);
    }
  };

  const runCloseAccount = async () => {
    setAcBusy(true);
    setAcError("");
    try {
      const result = await closeAccount();
      if (result.success) {
        // The Clerk user is gone, so the session is gone with it — a hard
        // redirect lands on the signed-out home page.
        window.location.href = "/";
      } else {
        setAcError(result.error);
        setAcBusy(false);
      }
    } catch {
      setAcError("Account closure failed. Please try again.");
      setAcBusy(false);
    }
  };

  const exportNow = async () => {
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `postloomai-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onToast("success", "Export downloaded.");
    } catch {
      onToast("error", "Export failed — try again from Data & Privacy.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="ring-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions are permanent. Export your data first — after deletion there is nothing to
            recover.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Delete workspace ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Delete this workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Removes &ldquo;{workspace.name}&rdquo; and everything inside it — posts, connected
                accounts, scheduled posts and chat history for this workspace only.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0 font-semibold"
              onClick={() => {
                resetWsDialog();
                setWsOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete workspace
            </Button>
          </div>

          {/* ── Close account ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Close account</p>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Deletes your account and every workspace you own. Scheduled posts stop immediately
                and all connected social accounts are disconnected.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0 font-semibold"
              onClick={() => {
                resetAcDialog();
                setAcOpen(true);
              }}
            >
              <UserX className="h-3.5 w-3.5" />
              Close account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Delete workspace dialog ── */}
      <Dialog
        open={wsOpen}
        onOpenChange={(open) => {
          setWsOpen(open);
          if (!open && !wsBusy) resetWsDialog();
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete &ldquo;{workspace.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Everything listed below is erased permanently. There is no undo.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
            <ConsequenceRow
              icon={<Share2 className="h-4 w-4" />}
              text={`${counts.socialAccounts} connected social ${
                counts.socialAccounts === 1 ? "account" : "accounts"
              } — disconnected`}
            />
            <ConsequenceRow
              icon={<Trash2 className="h-4 w-4" />}
              text={`${counts.posts} ${
                counts.posts === 1 ? "post" : "posts"
              } in this workspace (drafts, scheduled and published)`}
            />
            <ConsequenceRow
              icon={<CalendarClock className="h-4 w-4" />}
              text={`${counts.scheduledPosts} scheduled ${
                counts.scheduledPosts === 1 ? "post" : "posts"
              } — cancelled and never published`}
            />
            <ConsequenceRow
              icon={<MessageSquare className="h-4 w-4" />}
              text={`${counts.chatSessions} chat ${
                counts.chatSessions === 1 ? "session" : "sessions"
              } with their full history`}
            />
          </ul>

          <button
            type="button"
            onClick={() => void exportNow()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Export this data first (recommended)
          </button>

          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-foreground">
              Type <span className="font-mono font-bold">{workspace.name}</span> to confirm
              <Input
                value={wsConfirm}
                onChange={(e) => setWsConfirm(e.target.value)}
                placeholder={workspace.name}
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 h-9"
                disabled={wsBusy}
              />
            </label>
          </div>

          {wsError && (
            <p className="text-xs font-medium text-destructive leading-relaxed">{wsError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWsOpen(false)}
              disabled={wsBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="font-bold"
              disabled={wsConfirm !== workspace.name || wsBusy}
              onClick={() => void runDeleteWorkspace()}
            >
              {wsBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {wsBusy ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close account dialog ── */}
      <Dialog
        open={acOpen}
        onOpenChange={(open) => {
          setAcOpen(open);
          if (!open && !acBusy) resetAcDialog();
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-destructive">Close your account</DialogTitle>
            <DialogDescription>
              This removes everything, across every workspace you own. Step {acStep} of{" "}
              {paidPlanActive ? 3 : 2}.
            </DialogDescription>
          </DialogHeader>

          {acStep === 1 && (
            <div className="space-y-4">
              <ul className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
                <ConsequenceRow
                  icon={<Building2 className="h-4 w-4" />}
                  text={`${counts.totalWorkspaces} ${
                    counts.totalWorkspaces === 1 ? "workspace" : "workspaces"
                  } and everything inside ${
                    counts.totalWorkspaces === 1 ? "it" : "them"
                  } (brand profiles, media, tracked links, leads)`}
                />
                <ConsequenceRow
                  icon={<Share2 className="h-4 w-4" />}
                  text={`${counts.totalSocialAccounts} connected social ${
                    counts.totalSocialAccounts === 1 ? "account" : "accounts"
                  } — disconnected`}
                />
                <ConsequenceRow
                  icon={<Trash2 className="h-4 w-4" />}
                  text={`${counts.totalPosts} ${
                    counts.totalPosts === 1 ? "post" : "posts"
                  } — drafts, scheduled and published`}
                />
                <ConsequenceRow
                  icon={<CalendarClock className="h-4 w-4" />}
                  text={`${counts.totalScheduledPosts} scheduled ${
                    counts.totalScheduledPosts === 1 ? "post" : "posts"
                  } — they stop immediately and are never published`}
                />
                <ConsequenceRow
                  icon={<MessageSquare className="h-4 w-4" />}
                  text={`${counts.totalChatSessions} chat ${
                    counts.totalChatSessions === 1 ? "session" : "sessions"
                  } with their full history and AI memory`}
                />
              </ul>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Personal data is removed within 30 days. Generated content may remain in encrypted
                backups for up to 90 days before full deletion, as described in our data processing
                policy.
              </p>

              <button
                type="button"
                onClick={() => void exportNow()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Export everything first (recommended)
              </button>
            </div>
          )}

          {acStep === 2 && paidPlanActive && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <p className="font-bold">You are on a paid plan ({billing.tier})</p>
                <p className="mt-1">
                  Closing your account does not cancel future billing by itself — downgrade to the
                  Free plan first from the Billing page, then come back. If you close now, you may
                  still be charged until the plan is cancelled.
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-foreground leading-relaxed">
                <input
                  type="checkbox"
                  checked={acAck}
                  onChange={(e) => setAcAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                I understand I should downgrade first, and I want to close my account anyway.
              </label>
            </div>
          )}

          {(acStep === 3 || (acStep === 2 && !paidPlanActive)) && (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
                <Input
                  value={acConfirm}
                  onChange={(e) => setAcConfirm(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1.5 h-9"
                  disabled={acBusy}
                />
              </label>
            </div>
          )}

          {acError && (
            <p className="text-xs font-medium text-destructive leading-relaxed">{acError}</p>
          )}

          <DialogFooter>
            {acStep > 1 && (
              <Button
                variant="outline"
                onClick={() => {
                  setAcStep((s) => s - 1);
                  setAcError("");
                }}
                disabled={acBusy}
              >
                Back
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setAcOpen(false)}
              disabled={acBusy}
            >
              {acBusy ? "Closing…" : "Keep my account"}
            </Button>

            {acStep === 1 && (
              <Button
                variant="destructive"
                className="font-semibold"
                onClick={() => setAcStep(2)}
              >
                Continue
              </Button>
            )}

            {acStep === 2 && paidPlanActive && (
              <Button
                variant="destructive"
                className="font-semibold"
                disabled={!acAck || acBusy}
                onClick={() => setAcStep(3)}
              >
                Continue
              </Button>
            )}

            {(acStep === 3 || (acStep === 2 && !paidPlanActive)) && (
              <Button
                variant="destructive"
                className="font-bold"
                disabled={acConfirm !== "DELETE" || acBusy}
                onClick={() => void runCloseAccount()}
              >
                {acBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserX className="h-3.5 w-3.5" />
                )}
                {acBusy ? "Closing account…" : "Close my account"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
