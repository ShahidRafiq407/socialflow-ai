"use client";

// ============================================================================
// NOTIFICATION COMPOSER
//
// One form, two targets: a segment (by plan) or a pasted list of user ids /
// emails. The history below groups a segment send into one row with a read
// ratio, because "did anyone see it" is the question that follows sending.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SentNotificationGroup } from "@/lib/admin/notifications";
import { PLAN_TIERS, type PlanTier } from "@/lib/billing/plans";
import { sendSegmentNotificationAction, sendUserNotificationAction } from "@/actions/admin";
import { resolveUserIdsAction } from "@/actions/adminLookup";
import { Empty, Section, fmtDate } from "./primitives";

type Tone = "info" | "success" | "warning" | "error";
type Segment = PlanTier | "ALL" | "PAID";

const select = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30";

export function NotificationComposer({ sent }: { sent: SentNotificationGroup[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [target, setTarget] = useState<"segment" | "users">("segment");
  const [segment, setSegment] = useState<Segment>("ALL");
  const [recipients, setRecipients] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<Tone>("info");
  const [href, setHref] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setResult(null);
    const common = { title, body: body || undefined, tone, href: href || undefined, linkLabel: linkLabel || undefined };
    let outcome: { success: boolean; error?: string; sent?: number };
    if (target === "segment") {
      outcome = await sendSegmentNotificationAction({ plan: segment, ...common });
    } else {
      const wanted = recipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const resolved = await resolveUserIdsAction(wanted);
      if (!resolved.success) {
        setBusy(false);
        setResult({ ok: false, text: resolved.error });
        return;
      }
      if (resolved.missing.length > 0) {
        setBusy(false);
        setResult({ ok: false, text: `Not found: ${resolved.missing.join(", ")}` });
        return;
      }
      outcome = await sendUserNotificationAction({ userIds: resolved.ids, ...common });
    }
    setBusy(false);
    if (outcome.success) {
      setResult({ ok: true, text: `Sent to ${outcome.sent ?? 0} account${outcome.sent === 1 ? "" : "s"}.` });
      setTitle("");
      setBody("");
      setHref("");
      setLinkLabel("");
      startTransition(() => router.refresh());
    } else setResult({ ok: false, text: outcome.error || "Could not send." });
  };

  return (
    <div className="space-y-5">
      <Section title="Compose" description="Lands in the recipient's notification bell under Inbox. You will see when it is read.">
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="flex gap-1 rounded-md border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
              {(["segment", "users"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTarget(t)} className={`flex-1 rounded px-2 py-1 capitalize ${target === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {t === "segment" ? "By plan" : "Specific accounts"}
                </button>
              ))}
            </div>
            {target === "segment" ? (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Segment</span>
                <select value={segment} onChange={(e) => setSegment(e.target.value as Segment)} className={select}>
                  <option value="ALL">Everyone (not blocked)</option>
                  <option value="PAID">All paid plans</option>
                  {PLAN_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t} only
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Emails or user ids</span>
                <Textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder={"one@example.com\nuser_2abc…"} className="min-h-[96px] font-mono text-xs" />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Tone</span>
              <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className={select}>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </label>
          </div>
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (shown bold)" className="h-8 text-xs" maxLength={200} />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body (optional)" className="min-h-[96px] text-xs" maxLength={2000} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="Link, e.g. /dashboard/billing (optional)" className="h-8 text-xs" />
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Link label (optional)" className="h-8 text-xs" maxLength={80} disabled={!href} />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={busy || title.trim().length < 3 || (target === "users" && !recipients.trim())} onClick={send}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : result?.ok ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Button>
              {result && <span className={`text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{result.text}</span>}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Sent" description="Grouped by send. System rows are the ones the product wrote on an admin's behalf (block, plan change, credits).">
        {sent.length === 0 ? (
          <Empty>Nothing sent yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {sent.map((g) => (
              <li key={g.key} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">{g.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {g.tone}
                  </Badge>
                  <span className="text-muted-foreground">
                    {g.recipients} recipient{g.recipients === 1 ? "" : "s"} · {g.read} read
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {fmtDate(g.sentAt)} · {g.sentBy ? g.sentBy : "system"}
                  </span>
                </div>
                {g.body && <p className="mt-0.5 text-xs text-muted-foreground">{g.body}</p>}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.sample.map((s) => (
                    <Link key={s.userId} href={`/adminshahid/users/${s.userId}`} className={`rounded-full border px-2 py-0.5 text-[10px] hover:bg-muted ${s.read ? "border-emerald-500/40" : "border-slate-200 dark:border-slate-800"}`}>
                      {s.email}
                      {s.read ? " ✓" : ""}
                    </Link>
                  ))}
                  {g.recipients > g.sample.length && <span className="text-[10px] text-muted-foreground">+{g.recipients - g.sample.length} more</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
