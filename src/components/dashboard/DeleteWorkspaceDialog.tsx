"use client";

// ============================================================================
// DELETE WORKSPACE
//
// Settings' Danger Zone can only delete the workspace you are already inside.
// The switcher is where workspaces actually live, so this one can delete any of
// them — which is why it takes a picker instead of assuming the active one.
//
// Guarded the same way as the Danger Zone: the consequences are counted out of
// the database before the button arms, and the name has to be typed. The
// redirect comes back from the server, because deleting your last workspace has
// to land on /onboarding while deleting any other lands on /dashboard.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Images,
  Loader2,
  MessageSquare,
  Newspaper,
  Share2,
  Trash2,
  TriangleAlert,
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
import { deleteWorkspace } from "@/actions/account";
import {
  getWorkspaceDeletionSummary,
  type WorkspaceDeletionSummary,
  type WorkspaceSummary,
} from "@/actions/workspaces";

function ConsequenceRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-xs text-foreground leading-relaxed">
      <span className="mt-0.5 text-destructive shrink-0">{icon}</span>
      {text}
    </li>
  );
}

/** The counts are read out loud in the dialog, so they have to agree with it. */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface DeleteWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
}

export function DeleteWorkspaceDialog({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
}: DeleteWorkspaceDialogProps) {
  const [targetId, setTargetId] = useState("");
  const [summary, setSummary] = useState<WorkspaceDeletionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Opening picks the workspace the user is looking at: that is the one they
  // almost always mean, and it is the one the switcher's label just named.
  useEffect(() => {
    if (!open) return;
    setTargetId(activeWorkspaceId || workspaces[0]?.id || "");
    setConfirm("");
    setError("");
    setBusy(false);
  }, [open, activeWorkspaceId, workspaces]);

  const loadSummary = useCallback(async (id: string) => {
    setLoading(true);
    setSummary(null);
    try {
      const result = await getWorkspaceDeletionSummary(id);
      if (result.success) setSummary(result.summary);
      else setError(result.error);
    } catch {
      setError("Could not read that workspace. Close this and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !targetId) return;
    void loadSummary(targetId);
  }, [open, targetId, loadSummary]);

  const target = workspaces.find((w) => w.id === targetId) || null;
  const nameMatches = Boolean(target && confirm === target.name);
  const deletingActive = Boolean(targetId && targetId === activeWorkspaceId);

  async function run() {
    if (!targetId || !nameMatches || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await deleteWorkspace(targetId);
      if (result.success) {
        // Hard navigation on purpose: nothing about a deleted workspace should
        // survive in the router cache, and the server has already dropped the
        // active-workspace cookie so the next read picks a workspace that exists.
        window.location.href = result.redirect;
        return;
      }
      setError(result.error);
      setBusy(false);
    } catch {
      setError("The workspace could not be deleted. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(Boolean(next));
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete a workspace</DialogTitle>
          <DialogDescription>
            Everything listed below is erased permanently. There is no undo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <label
            htmlFor="delete-ws-target"
            className="text-xs font-semibold text-foreground"
          >
            Workspace
          </label>
          <select
            id="delete-ws-target"
            value={targetId}
            disabled={busy}
            onChange={(e) => {
              setTargetId(e.target.value);
              // A name typed for one workspace must never arm the button for
              // another.
              setConfirm("");
              setError("");
            }}
            className="h-9 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/40 disabled:opacity-50"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
                {ws.id === activeWorkspaceId ? " — currently open" : ""}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Counting what this would delete…
          </p>
        )}

        {summary && !loading && (
          <ul className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
            <ConsequenceRow
              icon={<Share2 className="h-4 w-4" />}
              text={`${plural(
                summary.counts.socialAccounts,
                "connected social account",
                "connected social accounts"
              )} — disconnected`}
            />
            <ConsequenceRow
              icon={<Trash2 className="h-4 w-4" />}
              text={`${plural(summary.counts.posts, "post", "posts")} — drafts, scheduled and published`}
            />
            <ConsequenceRow
              icon={<CalendarClock className="h-4 w-4" />}
              text={`${plural(
                summary.counts.scheduledPosts,
                "scheduled post",
                "scheduled posts"
              )} — cancelled and never published`}
            />
            <ConsequenceRow
              icon={<MessageSquare className="h-4 w-4" />}
              text={`${plural(summary.counts.chatSessions, "chat session", "chat sessions")} with their full history`}
            />
            <ConsequenceRow
              icon={<Images className="h-4 w-4" />}
              text={`${plural(summary.counts.mediaAssets, "media asset", "media assets")} in the library`}
            />
            <ConsequenceRow
              icon={<Newspaper className="h-4 w-4" />}
              text={`${plural(summary.counts.articleRuns, "article run", "article runs")} with their research and evidence`}
            />
          </ul>
        )}

        {summary?.isLast && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              This is your only workspace. Deleting it takes you back to onboarding to
              set up a new one — your account itself stays.
            </span>
          </p>
        )}

        {deletingActive && summary && !summary.isLast && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            This is the workspace you have open. Afterwards the dashboard switches to
            your oldest remaining workspace.
          </p>
        )}

        {target && (
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-foreground">
              Type <span className="font-mono font-bold">{target.name}</span> to confirm
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={target.name}
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 h-9"
                disabled={busy}
              />
            </label>
          </div>
        )}

        {error && (
          <p className="text-xs font-medium text-destructive leading-relaxed">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="font-bold"
            disabled={!nameMatches || busy}
            onClick={() => void run()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
