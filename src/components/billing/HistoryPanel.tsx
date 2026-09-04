"use client";

import React from "react";
import { ExternalLink, FileText, ScrollText } from "lucide-react";
import type { BillingHistoryRow, BillingLedgerRow } from "./types";
import { eventLabel, fmtDate, fmtDateTime, fmtMoney, isCredit, ledgerLabel } from "./format";

/**
 * The two records a customer may want to check, kept apart on purpose.
 *
 * Payments answer "what did you charge me"; the statement answers "where did my
 * credits go". Merging them into one feed would make both harder to read, and it is
 * the second one that settles arguments — every line of it is written by the same
 * ledger the gates debit, so if a credit left the balance it is on this list.
 */
interface HistoryPanelProps {
  history: BillingHistoryRow[];
  ledger: BillingLedgerRow[];
}

export function HistoryPanel({ history, ledger }: HistoryPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Payments
        </p>

        {history.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing yet. Payments appear here the moment Lemon Squeezy confirms them.
          </p>
        ) : (
          <div className="mt-3 max-h-[22rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {history.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-muted/20 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {eventLabel(row.type)}
                    {row.planName ? ` — ${row.planName}` : ""}
                    {row.billingCycle ? ` (${row.billingCycle})` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(row.createdAt)}
                    {row.testMode ? " · test payment" : ""}
                    {row.message ? ` · ${row.message}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {row.amount !== undefined && (
                    <span className="text-sm font-bold text-foreground">
                      {fmtMoney(row.amount, row.currency ?? "USD")}
                    </span>
                  )}
                  {row.receiptUrl && (
                    <a
                      href={row.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      Receipt
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5" />
          Credit statement
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every credit in and out, newest first, with the balance after each line.
        </p>

        {ledger.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing spent yet. The first line appears when your credits arrive.
          </p>
        ) : (
          <div className="mt-3 max-h-[26rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {ledger.map((row) => {
              const positive = isCredit(row.kind);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-muted/20 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {ledgerLabel(row.kind)}
                      {row.action ? ` — ${row.action}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDateTime(row.createdAt)}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${
                        positive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                      }`}
                    >
                      {/* Debits are already stored negative, so the sign is read
                          from the number rather than decided here. */}
                      {row.credits > 0 ? "+" : ""}
                      {row.credits.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.balanceAfter.toLocaleString()} left
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
