"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, Link2, Loader2, Plug, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadAccountExport } from "./exportDownload";
import type { SettingsData } from "./types";

/**
 * Data & Privacy section — take your data with you, see what is connected,
 * and know what happens to it over time.
 *
 * The export hits /api/account/export which streams everything the account
 * owns as JSON — with every token and credential replaced by a boolean.
 */
export function DataPrivacyCard({
  data,
  onToast,
}: {
  data: SettingsData;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      await downloadAccountExport();
      onToast("success", "Your export has been downloaded.");
    } catch {
      onToast("error", "Export failed. Please try again in a moment.");
    } finally {
      setExporting(false);
    }
  };

  const connectedApps = [
    {
      icon: <Link2 className="h-4 w-4" />,
      label: "Social accounts",
      value: data.counts.socialAccounts,
      href: "/dashboard/integrations",
      hrefLabel: "Integrations",
    },
    {
      icon: <Plug className="h-4 w-4" />,
      label: "Connectors & plugins",
      value: data.counts.connectors + data.counts.mcpServers,
      href: "/dashboard/plugins",
      hrefLabel: "Plugins",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Download everything in your account as a single JSON file: workspaces, brand profiles,
            posts, chat history, leads and tracked links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The export never contains passwords or platform tokens — connected accounts are listed
            with a &quot;has credentials&quot; flag instead, so the file is safe to store anywhere.
            Very long chat messages are capped at the first 10,000 characters and marked
            &quot;truncated&quot; so the download stays a reasonable size.
          </p>
          <button
            type="button"
            onClick={() => void exportData()}
            disabled={exporting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? "Preparing export…" : "Download my data"}
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected apps</CardTitle>
          <CardDescription>What this workspace is linked to right now.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {connectedApps.map((app) => (
            <div
              key={app.label}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-0.5 text-secondary shrink-0">{app.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {app.label}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{app.value}</p>
                </div>
              </div>
              <Link
                href={app.href}
                className="inline-flex h-8 shrink-0 items-center rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground hover:bg-muted"
              >
                {app.hrefLabel}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-secondary" />
            Data retention
          </CardTitle>
          <CardDescription>What happens to your data over time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <p>
            Heavy media rows behind already-published posts are cleaned up automatically by a
            scheduled job; the permanent publish receipts and live links always stay.
          </p>
          <p>
            If you close your account, personal data is removed within 30 days. Generated content
            may remain in encrypted backups for up to 90 days before full deletion.
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            <Link
              href="/privacy-policy"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Privacy Policy
              <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href="/data-processing"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Data Processing &amp; GDPR
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
