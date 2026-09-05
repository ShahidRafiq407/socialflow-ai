"use client";

// ============================================================================
// USER DETAIL — THE DOSSIER AND THE LEVERS
//
// Left: who they are and the actions. Right: tabs over the evidence — billing
// statement, usage, workspaces, payments, affiliate, messages, feedback, and the
// audit trail of what admins did to this account. Every action calls a server
// action that refuses non-admins, writes an audit row, and revalidates here.
// ============================================================================

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  Coins,
  Layers,
  Loader2,
  Mail,
  ShieldCheck,
  ShieldOff,
  StickyNote,
  Trash2,
  Unlock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserDetail } from "@/lib/admin/users";
import { PLAN_TIERS, type PlanTier } from "@/lib/billing/plans";
import {
  adjustCreditsAction,
  blockUserAction,
  deleteUserAction,
  saveAdminNotesAction,
  sendUserNotificationAction,
  setUserPlanAction,
  setUserRoleAction,
  unblockUserAction,
} from "@/actions/admin";
import { Empty, KV, PlanPill, Section, Stat, fmtAgo, fmtDate, fmtDay, fmtInt, fmtMicros, fmtUsd } from "./primitives";

type ActionResult = { success: boolean; error?: string };

function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const run = async (key: string, fn: () => Promise<ActionResult>, onOk?: () => void) => {
    setBusy(key);
    setError(null);
    setDone(null);
    const result = await fn();
    setBusy(null);
    if (result.success) {
      setDone(key);
      onOk?.();
      startTransition(() => router.refresh());
      setTimeout(() => setDone(null), 2000);
    } else {
      setError(result.error || "That did not work.");
    }
  };

  return { busy, error, done, run };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const select = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30";

export function UserDetailView({ user, selfId }: { user: UserDetail; selfId: string }) {
  const act = useAction();
  const router = useRouter();

  const [blockReason, setBlockReason] = useState("");
  const [notes, setNotes] = useState(user.adminNotes ?? "");
  const [credits, setCredits] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [plan, setPlan] = useState<PlanTier>(user.plan?.effective ?? "FREE");
  const [planDays, setPlanDays] = useState("30");
  const [planNote, setPlanNote] = useState("");
  const [grantCredits, setGrantCredits] = useState(true);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgTone, setMsgTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [msgHref, setMsgHref] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const isSelf = user.id === selfId;
  const blocked = user.blockedAt !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/adminshahid/users" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All users
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover border border-slate-200 dark:border-slate-800"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {((user.name || user.email)[0] || "U").toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold">{user.name || user.email}</h2>
              <PlanPill plan={user.plan?.effective ?? "FREE"} />
              {user.role === "ADMIN" && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  <ShieldCheck className="h-3 w-3" /> admin
                </Badge>
              )}
              {blocked && (
                <Badge variant="destructive">
                  <Ban className="h-3 w-3" /> blocked
                </Badge>
              )}
              {isSelf && <Badge variant="outline">you</Badge>}
            </div>
            {user.name && <div className="text-xs text-muted-foreground">{user.email}</div>}
          </div>
        </div>
      </div>

      {act.error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">{act.error}</div>
      )}

      {blocked && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs">
          <span className="font-semibold text-rose-700 dark:text-rose-400">Suspended {fmtDate(user.blockedAt)}</span>
          {user.blockedReason ? <span className="text-muted-foreground"> — {user.blockedReason}</span> : null}
          {user.blockedBy ? <span className="text-muted-foreground"> · by {user.blockedBy}</span> : null}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Left column: identity and levers */}
        <div className="space-y-4">
          <Section title="Account">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <KV label="Name">{user.name || "—"}</KV>
              <KV label="Email">{user.email}</KV>
              <KV label="User id">
                <span className="font-mono text-[11px]">{user.id}</span>
              </KV>
              <KV label="Joined">{fmtDate(user.createdAt)}</KV>
              <KV label="Last seen">{fmtAgo(user.lastSeenAt)}</KV>
              <KV label="Referral code">{user.referralCode || "—"}</KV>
              <KV label="Referred by">
                {user.affiliate.referredBy ? (
                  <Link href={`/adminshahid/users/${user.affiliate.referredBy.id}`} className="text-primary hover:underline">
                    {user.affiliate.referredBy.email}
                  </Link>
                ) : (
                  "—"
                )}
              </KV>
            </div>
          </Section>

          <Section title="Wallet">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Available" value={fmtInt(user.wallet.available)} />
              <Stat label="Held" value={fmtInt(user.wallet.heldCredits)} />
              <Stat label="Plan grant" value={fmtInt(user.wallet.grantBalance)} />
              <Stat label="Top-ups" value={fmtInt(user.wallet.topUpBalance)} />
            </div>
          </Section>

          {/* Credits */}
          <Section title="Adjust credits" description="Positive adds, negative removes. The note appears on their statement.">
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 500 or -200" className="h-8 text-xs" />
                <div className="flex gap-1">
                  {[100, 500, 1000].map((n) => (
                    <button key={n} type="button" onClick={() => setCredits(String(n))} className="rounded border px-1.5 text-[10px] text-muted-foreground hover:bg-muted">
                      +{n}
                    </button>
                  ))}
                </div>
              </div>
              <Input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="Why (required)" className="h-8 text-xs" maxLength={300} />
              <Button
                size="sm"
                className="w-full"
                disabled={act.busy !== null || !credits || creditNote.trim().length < 3}
                onClick={() =>
                  act.run(
                    "credits",
                    () => adjustCreditsAction({ userId: user.id, credits: Number(credits), note: creditNote }),
                    () => {
                      setCredits("");
                      setCreditNote("");
                    }
                  )
                }
              >
                {act.busy === "credits" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : act.done === "credits" ? <Check className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />}
                Apply adjustment
              </Button>
            </div>
          </Section>

          {/* Plan */}
          <Section title="Change plan" description="Puts the account on a plan by hand, outside Lemon Squeezy.">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Plan">
                  <select value={plan} onChange={(e) => setPlan(e.target.value as PlanTier)} className={select}>
                    {PLAN_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Days">
                  <Input type="number" min={1} max={3650} value={planDays} onChange={(e) => setPlanDays(e.target.value)} disabled={plan === "FREE"} className="h-8 text-xs" />
                </Field>
              </div>
              <Input value={planNote} onChange={(e) => setPlanNote(e.target.value)} placeholder="Note shown to the customer (optional)" className="h-8 text-xs" maxLength={300} />
              {plan !== "FREE" && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={grantCredits} onChange={(e) => setGrantCredits(e.target.checked)} />
                  Grant the plan&apos;s monthly credits now
                </label>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={act.busy !== null}
                onClick={() =>
                  act.run("plan", () =>
                    setUserPlanAction({ userId: user.id, plan, days: Number(planDays) || 30, grantCredits, note: planNote || undefined })
                  )
                }
              >
                {act.busy === "plan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : act.done === "plan" ? <Check className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                Set plan to {plan}
              </Button>
            </div>
          </Section>

          {/* Message */}
          <Section title="Send a message" description="Lands in their notification bell; you can see when it is read.">
            <div className="space-y-2">
              <Input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} placeholder="Title" className="h-8 text-xs" maxLength={200} />
              <Textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="Body (optional)" className="min-h-[60px] text-xs" maxLength={2000} />
              <div className="grid grid-cols-2 gap-2">
                <select value={msgTone} onChange={(e) => setMsgTone(e.target.value as typeof msgTone)} className={select}>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
                <Input value={msgHref} onChange={(e) => setMsgHref(e.target.value)} placeholder="Link (optional)" className="h-8 text-xs" />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={act.busy !== null || msgTitle.trim().length < 3}
                onClick={() =>
                  act.run(
                    "message",
                    () => sendUserNotificationAction({ userIds: [user.id], title: msgTitle, body: msgBody || undefined, tone: msgTone, href: msgHref || undefined }),
                    () => {
                      setMsgTitle("");
                      setMsgBody("");
                      setMsgHref("");
                    }
                  )
                }
              >
                {act.busy === "message" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : act.done === "message" ? <Check className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                Send
              </Button>
            </div>
          </Section>

          {/* Notes */}
          <Section title="Admin notes" description="Only admins see these.">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[70px] text-xs" maxLength={5000} />
            <Button size="sm" variant="outline" className="mt-2 w-full" disabled={act.busy !== null || notes === (user.adminNotes ?? "")} onClick={() => act.run("notes", () => saveAdminNotesAction({ userId: user.id, notes }))}>
              {act.busy === "notes" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : act.done === "notes" ? <Check className="h-3.5 w-3.5" /> : <StickyNote className="h-3.5 w-3.5" />}
              Save notes
            </Button>
          </Section>

          {/* Access */}
          <Section title="Access" description="Blocking refuses every gate in the product; the customer sees the reason.">
            <div className="space-y-2">
              {blocked ? (
                <Button size="sm" variant="outline" className="w-full" disabled={act.busy !== null} onClick={() => act.run("unblock", () => unblockUserAction({ userId: user.id }))}>
                  {act.busy === "unblock" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                  Lift suspension
                </Button>
              ) : (
                <>
                  <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Reason shown to the customer" className="h-8 text-xs" maxLength={500} />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    disabled={act.busy !== null || isSelf || user.role === "ADMIN" || blockReason.trim().length < 3}
                    onClick={() => act.run("block", () => blockUserAction({ userId: user.id, reason: blockReason }), () => setBlockReason(""))}
                  >
                    {act.busy === "block" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                    Suspend account
                  </Button>
                </>
              )}

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={act.busy !== null || isSelf}
                onClick={() => act.run("role", () => setUserRoleAction({ userId: user.id, role: user.role === "ADMIN" ? "USER" : "ADMIN" }))}
              >
                {act.busy === "role" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : user.role === "ADMIN" ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {user.role === "ADMIN" ? "Remove admin role" : "Make admin"}
              </Button>

              <Button size="sm" variant="destructive" className="w-full" disabled={act.busy !== null || isSelf || user.role === "ADMIN"} onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete account…
              </Button>
            </div>
          </Section>
        </div>

        {/* Right column: evidence */}
        <div className="min-w-0">
          <Tabs defaultValue="billing">
            <TabsList className="mb-3 flex h-8 w-full flex-wrap justify-start">
              <TabsTrigger value="billing" className="text-xs">Billing</TabsTrigger>
              <TabsTrigger value="usage" className="text-xs">Usage</TabsTrigger>
              <TabsTrigger value="workspaces" className="text-xs">Workspaces ({user.workspaces.length})</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs">Payments ({user.payments.length})</TabsTrigger>
              <TabsTrigger value="affiliate" className="text-xs">Affiliate</TabsTrigger>
              <TabsTrigger value="messages" className="text-xs">Messages ({user.notifications.length})</TabsTrigger>
              <TabsTrigger value="feedback" className="text-xs">Feedback ({user.feedback.length})</TabsTrigger>
              <TabsTrigger value="audit" className="text-xs">Audit ({user.audit.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="billing" className="space-y-4">
              <Section title="Subscription">
                {user.plan ? (
                  <div className="grid gap-x-6 sm:grid-cols-2">
                    <KV label="Effective plan"><PlanPill plan={user.plan.effective} /></KV>
                    <KV label="Stored plan">{user.plan.stored}</KV>
                    <KV label="Status">{user.plan.status}</KV>
                    <KV label="Cycle">{user.plan.cycle}</KV>
                    <KV label="Period">{fmtDay(user.plan.periodStart)} → {fmtDay(user.plan.periodEnd)}</KV>
                    <KV label="Trial ends">{fmtDay(user.plan.trialEndsAt)}</KV>
                    <KV label="Ends at">{fmtDay(user.plan.endsAt)}</KV>
                    <KV label="Cancel at period end">{user.plan.cancelAtPeriodEnd ? "yes" : "no"}</KV>
                    <KV label="LS customer">{user.plan.lsCustomerId || "—"}</KV>
                    <KV label="LS subscription">{user.plan.lsSubscriptionId || "—"}</KV>
                    <KV label="Test mode">{user.plan.testMode ? "yes" : "no"}</KV>
                    <KV label="Portal">{user.plan.portalUrl ? <a href={user.plan.portalUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">open</a> : "—"}</KV>
                  </div>
                ) : (
                  <Empty>No subscription row — this account is on Free.</Empty>
                )}
              </Section>

              <Section title="Credit statement" description="Newest first. Adjustments by support are marked.">
                {user.ledger.length === 0 ? (
                  <Empty>No ledger entries.</Empty>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-2 font-medium">When</th>
                          <th className="py-1 pr-2 font-medium">Kind</th>
                          <th className="py-1 pr-2 font-medium">Action / note</th>
                          <th className="py-1 pr-2 text-right font-medium">Credits</th>
                          <th className="py-1 text-right font-medium">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {user.ledger.map((e) => (
                          <tr key={e.id}>
                            <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt))}</td>
                            <td className="py-1.5 pr-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.kind === "ADJUSTMENT" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : e.kind === "DEBIT" ? "bg-slate-500/10" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"}`}>
                                {e.kind}
                              </span>
                            </td>
                            <td className="max-w-[260px] truncate py-1.5 pr-2">{e.action || e.note || "—"}{e.action && e.note ? <span className="text-muted-foreground"> · {e.note}</span> : null}</td>
                            <td className={`py-1.5 pr-2 text-right tabular-nums ${e.credits < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{e.credits > 0 ? "+" : ""}{fmtInt(e.credits)}</td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmtInt(e.balanceAfter)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="usage" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Calls (30d)" value={fmtInt(user.usage30d.calls)} hint={`${fmtInt(user.usage30d.failures)} failed`} />
                <Stat label="Cost (30d)" value={fmtMicros(user.usage30d.costMicros)} />
                <Stat label="Tokens in/out" value={`${fmtInt(user.usage30d.inputTokens)} / ${fmtInt(user.usage30d.outputTokens)}`} />
                <Stat label="Media" value={`${fmtInt(user.usage30d.images)} img · ${fmtInt(user.usage30d.videoSeconds)}s`} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Section title="By feature (30d)">
                  {user.usageByFeature.length === 0 ? <Empty>No usage.</Empty> : (
                    <ul className="space-y-1 text-xs">
                      {user.usageByFeature.map((r) => (
                        <li key={r.feature} className="flex justify-between gap-2"><span>{r.feature}</span><span className="tabular-nums text-muted-foreground">{fmtInt(r.calls)} · {fmtMicros(r.costMicros)}</span></li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section title="By model (30d)">
                  {user.usageByModel.length === 0 ? <Empty>No usage.</Empty> : (
                    <ul className="space-y-1 text-xs">
                      {user.usageByModel.map((r) => (
                        <li key={r.model} className="flex justify-between gap-2"><span className="font-mono">{r.model}</span><span className="tabular-nums text-muted-foreground">{fmtInt(r.calls)} · {fmtMicros(r.costMicros)}</span></li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
              <Section title="Per-period caps used">
                {user.featureUsage.length === 0 ? <Empty>No capped features used.</Empty> : (
                  <ul className="space-y-1 text-xs">
                    {user.featureUsage.map((r) => (
                      <li key={`${r.feature}-${r.periodStart}`} className="flex justify-between gap-2"><span>{r.feature}</span><span className="tabular-nums text-muted-foreground">{fmtInt(r.used)} · {fmtDay(r.periodStart)} → {fmtDay(r.periodEnd)}</span></li>
                    ))}
                  </ul>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="workspaces">
              <Section title="Workspaces">
                {user.workspaces.length === 0 ? <Empty>No workspaces — onboarding not finished.</Empty> : (
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr><th className="py-1 pr-2 font-medium">Name</th><th className="py-1 pr-2 font-medium">Industry</th><th className="py-1 pr-2 text-right font-medium">Accounts</th><th className="py-1 pr-2 text-right font-medium">Posts</th><th className="py-1 pr-2 text-right font-medium">Chats</th><th className="py-1 pr-2 text-right font-medium">Articles</th><th className="py-1 font-medium">Created</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {user.workspaces.map((w) => (
                        <tr key={w.id}><td className="py-1.5 pr-2 font-medium">{w.name}<div className="font-mono text-[10px] text-muted-foreground">{w.id}</div></td><td className="py-1.5 pr-2">{w.industry || "—"}</td><td className="py-1.5 pr-2 text-right tabular-nums">{w.socialAccounts}</td><td className="py-1.5 pr-2 text-right tabular-nums">{w.posts}</td><td className="py-1.5 pr-2 text-right tabular-nums">{w.chatSessions}</td><td className="py-1.5 pr-2 text-right tabular-nums">{w.articleRuns}</td><td className="py-1.5 text-muted-foreground">{fmtDay(w.createdAt)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="payments">
              <Section title="Billing events" description="Raw Lemon Squeezy webhook facts for this account.">
                {user.payments.length === 0 ? <Empty>No billing events.</Empty> : (
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr><th className="py-1 pr-2 font-medium">When</th><th className="py-1 pr-2 font-medium">Event</th><th className="py-1 pr-2 font-medium">Plan</th><th className="py-1 pr-2 text-right font-medium">Amount</th><th className="py-1 font-medium">State</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {user.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{fmtDate(p.createdAt)}</td>
                          <td className="py-1.5 pr-2 font-mono">{p.eventName}</td>
                          <td className="py-1.5 pr-2">{p.plan || "—"}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{p.amountCents !== null ? fmtUsd(p.amountCents) : "—"}{p.testMode ? <span className="ml-1 text-[10px] text-amber-600">test</span> : null}</td>
                          <td className="py-1.5">{p.processed ? <span className="text-emerald-600 dark:text-emerald-400">processed</span> : <span className="text-rose-600 dark:text-rose-400" title={p.error || ""}>unprocessed{p.error ? ` · ${p.error}` : ""}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="affiliate" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Referrals made" value={fmtInt(user.affiliate.referralsMade)} hint={`${fmtInt(user.affiliate.converted)} converted`} />
                <Stat label="Locked" value={fmtUsd(user.affiliate.commissionCents.locked)} />
                <Stat label="Available" value={fmtUsd(user.affiliate.commissionCents.available)} />
                <Stat label="Paid" value={fmtUsd(user.affiliate.commissionCents.paid)} hint={`${fmtUsd(user.affiliate.commissionCents.rejected)} rejected`} />
              </div>
              <Section title="Payout requests">
                {user.affiliate.payouts.length === 0 ? <Empty>No payouts requested.</Empty> : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {user.affiliate.payouts.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-1.5"><span>{fmtUsd(p.amountCents)} · {p.method}</span><span className="text-muted-foreground">{p.status} · {fmtDay(p.createdAt)}{p.paidAt ? ` · paid ${fmtDay(p.paidAt)}` : ""}</span></li>
                    ))}
                  </ul>
                )}
              </Section>
              {user.affiliate.referralStatus && (
                <Section title="As a referred account"><KV label="Referral status">{user.affiliate.referralStatus}</KV></Section>
              )}
              {user.trialClaims.length > 0 && (
                <Section title="Trial claims" description="Fraud checks at trial time.">
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {user.trialClaims.map((c) => (
                      <li key={c.id} className="py-1.5"><span className={c.decision === "ALLOW" ? "text-emerald-600" : "text-rose-600"}>{c.decision}</span> · risk {c.riskScore} · {c.riskFlags.join(", ") || "no flags"} · {fmtDate(c.createdAt)}{c.reason ? <div className="text-muted-foreground">{c.reason}</div> : null}</li>
                    ))}
                  </ul>
                </Section>
              )}
            </TabsContent>

            <TabsContent value="messages">
              <Section title="Messages sent to this account" description="Read state comes from the bell.">
                {user.notifications.length === 0 ? <Empty>Nothing sent yet.</Empty> : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {user.notifications.map((n) => (
                      <li key={n.id} className="py-2">
                        <div className="flex items-center gap-2"><span className="font-medium">{n.title}</span><Badge variant="outline" className="text-[10px]">{n.tone}</Badge><span className="ml-auto text-muted-foreground">{n.readAt ? `read ${fmtAgo(n.readAt)}` : "unread"}</span></div>
                        {n.body ? <p className="mt-0.5 text-muted-foreground">{n.body}</p> : null}
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(n.createdAt)}{n.sentBy ? ` · by ${n.sentBy}` : " · system"}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="feedback">
              <Section title="Chat feedback from this account">
                {user.feedback.length === 0 ? <Empty>No votes yet.</Empty> : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {user.feedback.map((f) => (
                      <li key={f.id} className="py-2">
                        <div className="flex items-center gap-2"><span className={f.rating > 0 ? "text-emerald-600" : "text-rose-600"}>{f.rating > 0 ? "👍" : "👎"}</span><span className="font-mono text-[10px] text-muted-foreground">{f.model || "—"}</span><span className="ml-auto text-muted-foreground">{fmtDate(f.createdAt)}</span></div>
                        {f.comment ? <p className="mt-0.5">{f.comment}</p> : null}
                        {f.messageExcerpt ? <p className="mt-0.5 line-clamp-2 text-muted-foreground">“{f.messageExcerpt}”</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="audit">
              <Section title="Admin actions on this account">
                {user.audit.length === 0 ? <Empty>No admin action recorded.</Empty> : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {user.audit.map((a) => (
                      <li key={a.id} className="py-2">
                        <div className="flex items-center gap-2"><span className="font-mono font-medium">{a.action}</span><span className="ml-auto text-muted-foreground">{fmtDate(a.createdAt)}</span></div>
                        <div className="text-muted-foreground">by {a.adminEmail || a.adminId}</div>
                        {a.details ? <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/40 p-1.5 text-[10px]">{JSON.stringify(a.details, null, 1)}</pre> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this account permanently?</DialogTitle>
            <DialogDescription>
              Every workspace, post, article, chat, media file, wallet and ledger row for <span className="font-medium">{user.email}</span> is removed
              and the Clerk user is deleted. There is no undo. Type the email to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={user.email} className="text-xs" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={act.busy !== null || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()}
              onClick={() =>
                act.run("delete", () => deleteUserAction({ userId: user.id, confirmEmail }), () => {
                  setDeleteOpen(false);
                  router.push("/adminshahid/users");
                })
              }
            >
              {act.busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
