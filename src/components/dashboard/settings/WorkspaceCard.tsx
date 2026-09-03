"use client";

import React, { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateWorkspaceSettings } from "@/actions/account";
import type { SettingsData } from "./types";

/**
 * Workspace section — the business profile the AI writes for.
 *
 * Only the current workspace is editable here. The app opens a user's first
 * workspace everywhere, so this matches what every other tab operates on.
 */

export function WorkspaceCard({
  data,
  onToast,
}: {
  data: SettingsData;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const { workspace } = data;

  const [name, setName] = useState(workspace.name);
  const [industry, setIndustry] = useState(workspace.industry || "");
  const [website, setWebsite] = useState(workspace.website || "");
  const [saving, setSaving] = useState(false);

  const dirty =
    name.trim() !== workspace.name ||
    industry.trim() !== (workspace.industry || "") ||
    website.trim() !== (workspace.website || "");

  const save = async () => {
    if (!name.trim()) {
      onToast("error", "Workspace name is required.");
      return;
    }

    setSaving(true);
    try {
      const result = await updateWorkspaceSettings(workspace.id, {
        name: name.trim(),
        industry: industry.trim(),
        website: website.trim(),
      });
      if (result.success) {
        onToast("success", "Workspace settings saved.");
      } else {
        onToast("error", result.error);
      }
    } catch {
      onToast("error", "The workspace could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const created = new Date(workspace.createdAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace details</CardTitle>
          <CardDescription>
            The business your AI assistant writes and publishes for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-foreground">
              Workspace name <span className="text-destructive">*</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SMB Robotics"
                maxLength={120}
                className="h-9"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-foreground">
              Industry
              <Input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Marketing agency"
                maxLength={160}
                className="h-9"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-foreground sm:col-span-2">
              Website
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourbusiness.com"
                maxLength={300}
                className="h-9"
              />
              <span className="text-[11px] font-normal text-muted-foreground">
                Optional. Used when the AI researches your business. A bare domain is fine — the
                protocol is added automatically.
              </span>
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : dirty ? (
                <Save className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
            {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About this workspace</CardTitle>
          <CardDescription>Facts about the workspace, read-only.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Created
              </dt>
              <dd className="mt-1 text-foreground">{created}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Workspaces you own
              </dt>
              <dd className="mt-1 text-foreground">
                {workspace.workspaceCount}{" "}
                <span className="text-muted-foreground">
                  {workspace.workspaceCount === 1 ? "workspace" : "workspaces"}
                </span>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Website lead tracking
              </dt>
              <dd className="mt-1">
                {workspace.trackingInstalled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary">
                    <Check className="h-3.5 w-3.5" />
                    Tracking key issued — tag ready to install
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    Not set up
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
