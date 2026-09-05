"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Coins,
  CreditCard,
  FlaskConical,
  Info,
  Layers,
  Loader2,
  Receipt,
  RefreshCw,
  ScrollText,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isPlanTier, type PlanTier } from "@/lib/billing/plans";
import { CONFIG_REVISION_EVENT } from "@/components/dashboard/ConfigSync";
import type { BillingCycle, BillingStatus, BillingToast } from "./types";
import { CreditPanel } from "./CreditPanel";
import { HistoryPanel } from "./HistoryPanel";
import { PaymentPanel } from "./PaymentPanel";
import { PlanGrid } from "./PlanGrid";
import { PricePanel } from "./PricePanel";
import { TopUpPanel } from "./TopUpPanel";
import { browserFingerprint } from "./fingerprint";
import { fmtDate } from "./format";

/**
 * The billing tab.
 *
 * One GET to `/api/billing/status` fills this page. Everything below is a reading of
 * that single answer — plan, credits, per-feature allowances, storage, payment
 * method, price list, payments, credit statement — and nothing that money depends on
 * is computed here. The server already resolved the catalogue, the caps and the
 * wallet; this shell would rather show the server's number than a cleverer one of
 * its own, because the number the customer reads has to be the number the gate
 * enforces.
 *
 * Writes leave through two routes only: `/api/billing/checkout` to start something
 * and `/api/billing/subscription` to change or stop it. Neither writes the plan —
 * the Lemon Squeezy webhook is the single writer — so after any action this page
 * re-reads status instead of patching what it is showing. That is also why returning
 * from checkout polls for a few seconds: the redirect usually arrives before the
 * webhook does, and a page that painted the new plan too early would have to take it
 * back a moment later.
 */

type View = "plans" | "usage" | "prices" | "payment" | "history";

const VIEWS: { key: View; label: string; icon: LucideIcon }[] = [
  { key: "plans", label: "Plans", icon: Layers },
  { key: "usage", label: "Credits and usage", icon: Coins },
  { key: "prices", label: "Price list", icon: Receipt },
  { key: "payment", label: "Payment", icon: CreditCard },
  { key: "history", label: "History", icon: ScrollText },
];

/** Status said the way a customer would say it, not the way the enum spells it. */
const STATUS_TEXT: Record<string, string> = {
  ACTIVE: "Active",
  ON_TRIAL: "Trial running",
  PAST_DUE: "Payment failed",
  UNPAID: "Unpaid",
  PAUSED: "Paused",
  CANCELLED: "Ending soon",
  EXPIRED: "Ended",
  NONE: "No plan",
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  ON_TRIAL: "bg-secondary/20 text-secondary",
  PAST_DUE: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  UNPAID: "bg-destructive/15 text-destructive",
  PAUSED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  EXPIRED: "bg-muted text-muted-foreground",
  NONE: "bg-muted text-muted-foreground",
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status.replace(/_/g, " ").toLowerCase();
}

/**
 * The one date that matters next, chosen in the order the customer cares about:
 * a trial ending beats a renewal, and a cancellation beats both.
 */
function nextEvent(plan: BillingStatus["plan"]): string | null {
  if (!plan.hasSubscription) return null;
  if (plan.cancelAtPeriodEnd) return `Access ends ${fmtDate(plan.endsAt ?? plan.periodEnd)}`;
  if (plan.isTrial && plan.trialEndsAt) return `Trial ends ${fmtDate(plan.trialEndsAt)}`;
  if (plan.renewsAt) return `Renews ${fmtDate(plan.renewsAt)}`;
  return `This period ends ${fmtDate(plan.periodEnd)}`;
}

export function BillingShell() {
  const [data, setData] = useState<BillingStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [view, setView] = useState<View>("plans");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRemoveCard, setConfirmRemoveCard] = useState(false);
  const [toasts, setToasts] = useState<BillingToast[]>([]);

  const counter = useRef(0);
  const cycleSeeded = useRef(false);
  const bootstrapped = useRef(false);
  /** The freshest status, for handlers that must not be re-created on every read. */
  const latest = useRef<BillingStatus | null>(null);

  const pushToast = useCallback((tone: BillingToast["tone"], text: string) => {
    const id = `b${++counter.current}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6500);
  }, []);

  const load = useCallback(async (): Promise<BillingStatus | null> => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      const json = (await res.json()) as BillingStatus & { ok?: boolean; message?: string };
      if (!res.ok || json.ok !== true) {
        setLoadError(json.message ?? "Your billing details could not be loaded just now.");
        return null;
      }
      setLoadError(null);
      setData(json);
      latest.current = json;
      // The toggle opens on the cycle they are already paying for, once, and after
      // that it is theirs to move.
      if (!cycleSeeded.current && json.plan.cycle) {
        cycleSeeded.current = true;
        setCycle(json.plan.cycle);
      }
      return json;
    } catch {
      setLoadError("Billing could not be reached. Check your connection and try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /**
   * After a checkout, wait for the webhook rather than guessing.
   *
   * Lemon Squeezy redirects the buyer back the moment they pay, which is normally
   * before its webhook reaches us, so this asks again a few times and reports the
   * change only once the server actually shows it. If the webhook is slow the page
   * says so plainly instead of pretending nothing happened.
   */
  const settle = useCallback(
    async (intent: string | null, before: BillingStatus | null) => {
      for (const wait of [1500, 3000, 5000]) {
        await sleep(wait);
        const next = await load();
        if (!next) continue;

        if (intent === "topup") {
          const added = next.credits.topUpBalance - (before?.credits.topUpBalance ?? 0);
          if (added > 0) {
            pushToast("success", `${added.toLocaleString()} credits added to your balance.`);
            return;
          }
          continue;
        }

        const changed =
          !before || next.plan.id !== before.plan.id || next.plan.status !== before.plan.status;
        if (next.plan.hasSubscription && !next.plan.stale && changed) {
          pushToast("success", `${next.plan.name} is active. Your credits are ready to use.`);
          return;
        }
      }
      pushToast(
        "info",
        "Your payment went through. It can take a moment to appear here — refresh if it has not."
      );
    },
    [load, pushToast]
  );

  /**
   * Every purchase goes through here, and there are exactly two outcomes.
   *
   * A new subscription comes back with a hosted checkout `url` — the card is entered
   * on Lemon Squeezy's page, never ours. A customer who already has a live
   * subscription comes back with no url at all, because a plan change is applied to
   * the existing subscription and confirmed by webhook; in that case the route's own
   * sentence is shown and the page waits for the change rather than announcing it.
   */
  const checkout = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      const before = latest.current;
      setBusy(key);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          url?: string;
          message?: string;
          flagged?: boolean;
        };

        if (!res.ok || json.ok !== true) {
          pushToast("error", json.message ?? "That could not be started, so nothing was charged.");
          setBusy(null);
          return;
        }

        if (json.url) {
          // Leave the button spinning: this page is already on its way out, and
          // clearing it here would flash an idle button during the redirect.
          window.location.href = json.url;
          return;
        }

        pushToast("success", json.message ?? "Done — your account is being updated.");
        setBusy(null);
        void settle(typeof body.intent === "string" ? body.intent : null, before);
        return;
      } catch {
        pushToast("error", "The payment service could not be reached, so nothing was charged.");
      }
      setBusy(null);
    },
    [pushToast, settle]
  );

  const choosePlan = useCallback(
    (plan: PlanTier) => checkout(plan, { intent: "subscribe", plan, cycle }),
    [checkout, cycle]
  );

  const startTrial = useCallback(async () => {
    // Hashing takes a few milliseconds; the button owns the wait so a second click
    // cannot start a second trial checkout.
    setBusy("TRIAL");
    const fingerprint = await browserFingerprint();
    await checkout("TRIAL", { intent: "trial", fingerprint });
  }, [checkout]);

  const buyPack = useCallback(
    (packId: string) => checkout(packId, { intent: "topup", packId }),
    [checkout]
  );

  /** Cancel, resume, remove the card, and the invoice portal — one call out, then a re-read. */
  const act = useCallback(
    async (action: "cancel" | "resume" | "portal" | "remove-card") => {
      setBusy(action);
      try {
        const res = await fetch("/api/billing/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json()) as { ok?: boolean; url?: string; message?: string };

        if (!res.ok || json.ok !== true) {
          pushToast("error", json.message ?? "That did not go through, so nothing has changed.");
          setBusy(null);
          return;
        }

        if (action === "portal" && json.url) {
          // A signed link with an expiry, so it is opened rather than kept.
          const opened = window.open(json.url, "_blank", "noopener,noreferrer");
          if (opened) pushToast("info", "Your invoices and receipts opened in a new tab.");
          else window.location.href = json.url;
        } else if (action === "remove-card") {
          // The charges have already stopped by the time this runs. The card itself
          // lives at Lemon Squeezy, so the last step is theirs — opened in a new tab
          // rather than navigated to, because the plan state behind this page has just
          // changed and the customer should see it settle.
          pushToast("success", json.message ?? "Done.");
          if (json.url) window.open(json.url, "_blank", "noopener,noreferrer");
          await load();
        } else {
          pushToast("success", json.message ?? "Done.");
          await load();
        }
      } catch {
        pushToast("error", "The payment service could not be reached, so nothing has changed.");
      }
      setBusy(null);
    },
    [load, pushToast]
  );

  /**
   * One pass over the URL, after mount.
   *
   * The query string is read from the browser rather than from props so the server
   * and client render the same markup and nothing hydrates wrong, and it is read
   * once — the parameters are stripped straight afterwards so a refresh cannot
   * replay a checkout. Four arrivals land here: a return from Lemon Squeezy
   * (`?checkout=success`), a return from a closed checkout, a deep link from the
   * pricing page (`?plan=PRO&cycle=yearly`), and the trial (`?intent=trial`) — in all
   * of which the choice was already clicked once and asking for it twice would be the
   * worse behaviour.
   *
   * The trial is a subscription like any other, so clicking it anywhere in the product
   * has to end on the payment page rather than on this one. That is the whole reason
   * the `intent=trial` branch exists: the marketing page and the sign-up return both
   * land here, and without it a customer who has already decided is shown the grid
   * again and asked to decide a second time.
   */
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const params = new URLSearchParams(window.location.search);
    const returned = params.get("checkout");
    const intent = params.get("intent");
    const wantedPlan = (params.get("plan") ?? "").toUpperCase();
    const rawCycle = params.get("cycle");
    const wantedCycle: BillingCycle = rawCycle === "yearly" ? "yearly" : "monthly";
    const wantsTrial = intent === "trial" || wantedPlan === "TRIAL";

    if (rawCycle === "yearly" || rawCycle === "monthly") {
      cycleSeeded.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL (external system) into view state
      setCycle(wantedCycle);
    }
    if (params.size > 0) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    void (async () => {
      const first = await load();

      if (returned === "success") {
        pushToast("info", "Payment received. Applying it to your account…");
        await settle(intent, first);
        return;
      }
      if (returned === "cancelled" || returned === "cancel") {
        pushToast("info", "Checkout was closed, so nothing was charged.");
        return;
      }
      // Gated on exactly what `PlanGrid` gates its own trial strip on, so a deep link
      // can never start something the button would not have offered. A refusal past
      // that point comes from the trial guard itself and arrives as its own sentence.
      if (first && wantsTrial) {
        if (first.store.trialPurchasable && !first.plan.hasSubscription) {
          await startTrial();
        }
        return;
      }
      if (
        first &&
        isPlanTier(wantedPlan) &&
        wantedPlan !== "FREE" &&
        wantedPlan !== first.plan.id &&
        first.store.plansPurchasable
      ) {
        await checkout(wantedPlan, {
          intent: "subscribe",
          plan: wantedPlan,
          cycle: wantedCycle,
        });
      }
    })();
  }, [checkout, load, pushToast, settle, startTrial]);

  /**
   * Re-read status when the back office changes something.
   *
   * Deliberately its own effect rather than a branch inside the bootstrap above: that
   * one is latched on `bootstrapped` because it also consumes the checkout deep link,
   * and it has to stay a once-only.
   *
   * This is the tab where an admin edit is most visible — plan prices, the credit
   * allowance, what a top-up costs — and it was the one dashboard shell holding
   * admin-derived state with no subscriber, so its figures sat at whatever they were
   * when the tab opened until the customer navigated away and back or pressed Refresh.
   * `load` is a `useCallback` with no dependencies, so this binds once.
   */
  useEffect(() => {
    const onConfigChange = () => void load();
    window.addEventListener(CONFIG_REVISION_EVENT, onConfigChange);
    return () => window.removeEventListener(CONFIG_REVISION_EVENT, onConfigChange);
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading your plan and balance…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <header className="border-b border-slate-200 pb-5 dark:border-slate-800">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Plan and billing
          </h1>
        </header>
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
          <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            {loadError ?? "Your billing details could not be loaded."}
          </p>
          {/* Said because it is the first thing anyone wonders when a billing page
              breaks: a failed read cannot spend, grant or charge anything. */}
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            Nothing on your account has changed. Your plan, your credits and your card are exactly
            as they were.
          </p>
          <Button
            className="mt-4 gap-1.5 text-xs font-semibold"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { plan, credits, usage, storage, workspaces, payment, catalog, store, history, ledger } =
    data;
  const event = nextEvent(plan);
  // Named from the payload rather than `getPlanConfig`: this is a client component,
  // so the catalogue in the browser bundle is the code default and has never had the
  // admin's plan overrides applied — a renamed plan read here disagreed with the very
  // cards below it, which do come from the server. `catalog.plans` covers every tier.
  const storedPlanName =
    catalog.plans.find((entry) => entry.id === plan.storedPlan)?.name ?? plan.storedPlan;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Plan and billing
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your plan, what you have left this period, what each action costs and every charge ever
            made.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-1.5 text-xs font-semibold"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </header>

      {/* ── Where the account stands right now ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Current plan
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-foreground">{plan.name}</span>
            <Badge className={`text-[10px] ${STATUS_STYLE[plan.status] ?? STATUS_STYLE.NONE}`}>
              {statusText(plan.status)}
            </Badge>
            {plan.cycle && !plan.isTrial && (
              <span className="text-xs text-muted-foreground">billed {plan.cycle}</span>
            )}
          </div>
          {event && <p className="mt-1 text-xs text-muted-foreground">{event}</p>}
        </div>

        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Credits available
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {credits.available.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            {credits.monthlyGrant > 0
              ? `of ${credits.monthlyGrant.toLocaleString()} this period`
              : "no monthly credits on this plan"}
          </p>
        </div>
      </div>

      {/* ── Anything wrong, said before the plans ── */}
      {plan.stale && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            Your {storedPlanName} period ended without a renewal, so paid
            features are switched off.
          </p>
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            Nothing has been deleted. Update the card or start the plan again and everything comes
            back exactly as it was.
          </p>
        </div>
      )}

      {(plan.status === "PAST_DUE" || plan.status === "UNPAID") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            The last payment did not go through. Lemon Squeezy will try again, and updating the card
            settles it immediately.
          </p>
          <Button
            variant="outline"
            className="gap-1.5 text-xs font-semibold"
            onClick={() => void act("portal")}
            disabled={busy !== null}
          >
            {busy === "portal" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CreditCard className="h-3.5 w-3.5" />
            )}
            Update card
          </Button>
        </div>
      )}

      {!store.configured && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Payments are not connected on this deployment yet, so plans cannot be bought here.
          </p>
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            Everything below still shows real limits and real usage — your Free plan works normally.
          </p>
        </div>
      )}

      {store.configured && store.missingConfig.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Some things on this page are not on sale yet.
          </p>
          {/* The names are the deployment's own settings rather than anything
              private, and the person reading this page is the one who can fix it. */}
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            Waiting on: {store.missingConfig.join(", ")}. Buttons for those stay disabled instead of
            failing after a click.
          </p>
        </div>
      )}

      {(store.testMode || plan.testMode) && (
        <div className="rounded-2xl border border-secondary/40 bg-secondary/5 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
            This store is in test mode, so no real money moves.
          </p>
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            Checkouts complete with test cards and grant real credits in this environment. Nothing
            here will appear on a bank statement.
          </p>
        </div>
      )}

      {/* ── Sections ── */}
      <nav aria-label="Billing sections" className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {VIEWS.map((item) => {
            const active = view === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                aria-current={active ? "true" : undefined}
                className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {view === "plans" && (
        <div className="space-y-5">
          <PlanGrid
            plans={catalog.plans}
            planState={plan}
            store={store}
            cycle={cycle}
            onCycleChange={setCycle}
            busy={busy}
            onChoose={(tier) => void choosePlan(tier)}
            onTrial={() => void startTrial()}
            onCancel={() => setConfirmCancel(true)}
          />
          <TopUpPanel
            packs={catalog.topUps}
            store={store}
            planId={plan.id}
            canBuy={plan.hasSubscription}
            busy={busy}
            onBuy={(packId) => void buyPack(packId)}
          />
        </div>
      )}

      {view === "usage" && (
        <div className="space-y-4">
          <CreditPanel
            credits={credits}
            usage={usage}
            storage={storage}
            workspaces={workspaces}
            planState={plan}
          />
          <TopUpPanel
            packs={catalog.topUps}
            store={store}
            planId={plan.id}
            canBuy={plan.hasSubscription}
            busy={busy}
            onBuy={(packId) => void buyPack(packId)}
          />
        </div>
      )}

      {view === "prices" && <PricePanel groups={catalog.actions} />}

      {view === "payment" && (
        <PaymentPanel
          payment={payment}
          planState={plan}
          busy={busy}
          onCancel={() => setConfirmCancel(true)}
          onResume={() => void act("resume")}
          onPortal={() => void act("portal")}
          onRemoveCard={() => setConfirmRemoveCard(true)}
        />
      )}

      {view === "history" && <HistoryPanel history={history} ledger={ledger} />}

      {/* ── Cancelling, confirmed once ──────────────────────────────────────────
          The button that starts this is two clicks from anywhere in the tab, so the
          consequences are spelled out here rather than assumed: the exact date, what
          survives, and what happens to credits already paid for. */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {plan.name}?</DialogTitle>
            <DialogDescription>
              Everything keeps working until{" "}
              {fmtDate(plan.endsAt ?? plan.renewsAt ?? plan.periodEnd)}, and nothing is charged
              after that. Your posts, brand, connected accounts and drafts stay exactly where they
              are — the account simply moves to Free.
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs leading-relaxed text-muted-foreground">
            The credits already in your balance stay spendable until that date, and any credit packs
            you bought never expire — they will still be waiting if you come back. You can resume
            before the end date at no cost.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              className="text-xs font-semibold"
              onClick={() => setConfirmCancel(false)}
            >
              Keep my plan
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              onClick={() => {
                setConfirmCancel(false);
                void act("cancel");
              }}
              disabled={busy !== null}
            >
              Yes, cancel it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Removing the card, confirmed once ───────────────────────────────────
          Worded around what actually happens, because the honest version is not what
          the button implies: we cannot delete a card we have never held. What we can
          do is guarantee it is never charged again, which means ending the plan, and
          then open the one page where the details themselves can be deleted. A
          customer who only wanted a different card should use "Update card", so that
          is said here too rather than left to be discovered afterwards. */}
      <Dialog open={confirmRemoveCard} onOpenChange={setConfirmRemoveCard}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove your card?</DialogTitle>
            <DialogDescription>
              Your card will not be charged again. {plan.name} ends on{" "}
              {fmtDate(plan.endsAt ?? plan.renewsAt ?? plan.periodEnd)} and everything keeps
              working until then, exactly as it does now.
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs leading-relaxed text-muted-foreground">
            The card details are held by Lemon Squeezy, our payment processor — they have never
            been in our system. Their page opens straight after this so you can delete or replace
            them there. Nothing about your account goes away: posts, brand, connected accounts and
            drafts all stay, and you can come back to any plan whenever you like.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            If you only want to pay with a different card, close this and use{" "}
            <span className="font-semibold text-foreground">Update card</span> instead — that keeps
            your plan running.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              className="text-xs font-semibold"
              onClick={() => setConfirmRemoveCard(false)}
            >
              Keep my card
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              onClick={() => {
                setConfirmRemoveCard(false);
                void act("remove-card");
              }}
              disabled={busy !== null}
            >
              Remove it and stop billing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Toasts ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur ${
                t.tone === "error"
                  ? "border-destructive/40"
                  : t.tone === "success"
                    ? "border-primary/40"
                    : "border-secondary/40"
              }`}
            >
              {t.tone === "error" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : t.tone === "success" ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              )}
              <p className="flex-1 text-xs leading-relaxed text-foreground">{t.text}</p>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
