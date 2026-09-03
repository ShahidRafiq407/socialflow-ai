"use client";

// ============================================================================
// WORKSPACE SWITCHER
//
// Previously this dropdown showed `workspaces[0]` and the "Switch Workspace"
// rows had no click handler at all — so a second workspace could be created but
// never entered. Now the active workspace comes from the server, switching
// writes it to a cookie every server read honours, and creating one happens
// here instead of on a detour through /onboarding.
// ============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronDown,
  Loader2,
  PlusCircle,
  Settings,
  TriangleAlert,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { createWorkspace, switchWorkspace, type WorkspaceSummary } from "@/actions/workspaces";

export interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
}

export function WorkspaceSwitcher({ workspaces, activeWorkspaceId }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // The server decides which one is active; falling back to the first keeps the
  // label sane for accounts created before the cookie existed.
  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  function handleSwitch(id: string) {
    if (!id || id === active?.id) return;
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await switchWorkspace(id);
      if (!result.success) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      // The cookie is written server-side; the refresh re-runs every server
      // component against the new workspace. Staying inside the transition
      // means the spinner lives exactly as long as the swap does.
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Switch workspace"
          className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
        >
          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[140px]">{active?.name || "No workspace"}</span>
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
          ) : (
            <ChevronDown className="h-3 w-3 text-slate-400" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span>Workspaces</span>
              <span className="normal-case tracking-normal text-slate-400">
                {workspaces.length}
              </span>
            </DropdownMenuLabel>

            {workspaces.length === 0 && (
              <div className="px-2 py-2 text-xs text-slate-400">
                No workspace yet — create your first one below.
              </div>
            )}

            {workspaces.map((ws) => {
              const isActive = ws.id === active?.id;
              const isSwitching = isPending && pendingId === ws.id;
              return (
                <DropdownMenuItem
                  key={ws.id}
                  disabled={isPending}
                  closeOnClick={!isActive}
                  onClick={() => handleSwitch(ws.id)}
                  className="flex items-center justify-between gap-2 text-xs py-2"
                >
                  <span className="flex items-center gap-2 truncate">
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className={`truncate ${isActive ? "font-semibold" : ""}`}>{ws.name}</span>
                  </span>
                  {isSwitching ? (
                    <Loader2 className="h-3 w-3 animate-spin text-slate-400 shrink-0" />
                  ) : isActive ? (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                      Active
                    </Badge>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>

          {error && (
            <div className="mx-1 mt-1 flex items-start gap-1.5 rounded-md bg-rose-50 dark:bg-rose-950/40 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
              <TriangleAlert className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
              className="text-xs py-2 text-primary font-medium"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-2" />
              Create workspace
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs p-0">
              <Link href="/dashboard/settings" className="w-full flex items-center px-1.5 py-2">
                <Settings className="h-3.5 w-3.5 mr-2 text-slate-400" />
                Workspace settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>


      </DropdownMenu>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create workspace
//
// Inline instead of a link to /onboarding: the old link ran the full brand
// wizard and dropped the user back on a dashboard still pointed at the previous
// workspace, which is what "it only shows up after a refresh" actually was.
// ─────────────────────────────────────────────────────────────────────────────

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      const result = await createWorkspace({ name, industry, website });
      if (!result.success) {
        setError(result.error);
        return;
      }

      setName("");
      setIndustry("");
      setWebsite("");
      onOpenChange(false);
      // Created workspaces are switched into server-side, so the overview is
      // already the new workspace's overview by the time this lands.
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(Boolean(next))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>
            A workspace keeps its own brand, content, connections and analytics.
            You will be switched into it right away.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ws-name" className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Workspace name
            </label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              autoFocus
              maxLength={120}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ws-industry" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Industry <span className="text-slate-400">(optional)</span>
              </label>
              <Input
                id="ws-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="SaaS, Healthcare…"
                maxLength={160}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ws-website" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Website <span className="text-slate-400">(optional)</span>
              </label>
              <Input
                id="ws-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="example.com"
                maxLength={300}
              />
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Brand tone, audience and connections can be filled in afterwards from
            Brand DNA and Integrations.
          </p>

          <DialogFooter className="mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || name.trim().length < 2}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>

      </DialogContent>
    </Dialog>
  );
}



