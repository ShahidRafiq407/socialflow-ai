"use client";

import React, { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Code2,
  Globe,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import {
  connectWordPressSite,
  testWordPressSite,
  disconnectWordPressSite,
  type WordPressSiteView,
} from "@/actions/wordpressSite";
import {
  setupWebsiteTracking,
  verifyWebsiteTracking,
  rotateTrackingKey,
  disableWebsiteTracking,
} from "@/actions/growthLeads";
import type { TrackingStatus } from "@/lib/types/growth";
import { Chip, ConfirmButton, CopyButton, SectionCard, fmtDateTime } from "./shared";
import type { GoalHQData } from "./types";

/**
 * The two things a Website lead source needs before autopilot can work:
 *   1. A real WordPress connection, so articles can actually be published.
 *   2. The tracking tag, so a lead on the site can be traced back to the post
 *      that produced it.
 *
 * Nothing here is faked — the connect button performs a live authentication
 * request, and "Verify" reports the truth until a real lead event arrives.
 */
export function WebsiteChannelCards({
  data,
  onToast,
  onChanged,
}: {
  data: GoalHQData;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onChanged: () => void;
}) {
  return (
    <>
      <WordPressCard
        workspaceId={data.workspaceId}
        initial={data.wordpress}
        website={data.website}
        onToast={onToast}
        onChanged={onChanged}
      />
      <WebsiteTagCard
        workspaceId={data.workspaceId}
        initial={data.tracking}
        website={data.website}
        onToast={onToast}
        onChanged={onChanged}
      />
    </>
  );
}

// ============================================================================
// WordPress
// ============================================================================

function WordPressCard({
  workspaceId,
  initial,
  website,
  onToast,
  onChanged,
}: {
  workspaceId: string;
  initial: WordPressSiteView;
  website: string;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onChanged: () => void;
}) {
  const [site, setSite] = useState<WordPressSiteView>(initial);
  const [siteUrl, setSiteUrl] = useState(initial.siteUrl || website || "");
  const [username, setUsername] = useState(initial.username || "");
  const [appPassword, setAppPassword] = useState("");
  const [status, setStatus] = useState(initial.defaultStatus || "publish");
  const [connecting, startConnecting] = useTransition();
  const [testing, startTesting] = useTransition();
  const [disconnecting, startDisconnecting] = useTransition();

  const connect = () => {
    startConnecting(async () => {
      const res = await connectWordPressSite(workspaceId, {
        siteUrl,
        username,
        appPassword: appPassword || undefined,
        defaultStatus: status,
      });
      if (!res.success || !res.site) {
        onToast("error", res.error || "WordPress connection failed.");
        setSite((prev) => ({ ...prev, connected: false, lastError: res.error || prev.lastError }));
        return;
      }
      setSite(res.site);
      setAppPassword("");
      onToast("success", "WordPress connected and verified. Articles can now publish to your site.");
      onChanged();
    });
  };

  const test = () => {
    startTesting(async () => {
      const res = await testWordPressSite(workspaceId);
      if (!res.success) {
        onToast("error", res.error || "Connection test failed.");
        setSite((prev) => ({ ...prev, connected: false, lastError: res.error || null }));
        return;
      }
      setSite((prev) => ({
        ...prev,
        connected: true,
        lastError: null,
        lastVerifiedAt: res.lastVerifiedAt || prev.lastVerifiedAt,
      }));
      onToast("success", "Connection is working.");
    });
  };

  const disconnect = () => {
    startDisconnecting(async () => {
      const res = await disconnectWordPressSite(workspaceId);
      if (!res.success) {
        onToast("error", res.error || "Could not disconnect.");
        return;
      }
      setSite({ ...site, connected: false, siteUrl: "", username: "", hasPassword: false, lastError: null });
      setAppPassword("");
      onToast("info", "WordPress disconnected. Article tasks will be skipped until you reconnect.");
      onChanged();
    });
  };

  return (
    <SectionCard
      title="Your WordPress site"
      subtitle="Articles are published straight to this site. The credentials are tested against your real site — a wrong password fails here, not silently later."
      icon={<Plug className="w-4 h-4" />}
      accent="secondary"
      actions={
        site.connected ? (
          <Chip tone="primary" icon={<Check className="w-3 h-3" />}>
            Connected
          </Chip>
        ) : (
          <Chip tone="muted">Not connected</Chip>
        )
      }
    >
      {!site.encryptionConfigured && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-foreground leading-relaxed">
            <span className="font-semibold">APP_ENCRYPTION_KEY is not set on the server.</span> The
            application password cannot be stored securely until it is, so connecting will be refused
            rather than saving your password in plain text.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-foreground">Site URL</span>
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://your-site.com"
            className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">WordPress username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your-wp-username"
            autoComplete="off"
            className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">
            Application password
            {site.hasPassword && (
              <span className="ml-1 font-normal text-muted-foreground">(saved — leave blank to keep)</span>
            )}
          </span>
          <input
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder={site.hasPassword ? "••••••••••••" : "xxxx xxxx xxxx xxxx"}
            autoComplete="new-password"
            className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">Publish articles as</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
          >
            <option value="publish">Published (live immediately)</option>
            <option value="draft">Draft (you publish manually)</option>
          </select>
        </label>
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Create the password in WordPress under <span className="font-semibold">Users → Profile →
        Application Passwords</span>. Your normal login password will not work.
      </p>

      {site.lastError && !site.connected && (
        <p className="text-[11px] text-destructive mt-2 leading-relaxed">{site.lastError}</p>
      )}
      {site.connected && site.lastVerifiedAt && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Last verified {fmtDateTime(site.lastVerifiedAt)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          type="button"
          onClick={connect}
          disabled={connecting || !siteUrl.trim() || !username.trim()}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {site.connected ? "Save & re-verify" : "Connect & verify"}
        </button>

        {site.hasPassword && (
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-secondary/30 text-secondary text-xs font-semibold hover:bg-secondary/10 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Test connection
          </button>
        )}

        {(site.connected || site.hasPassword) && (
          <ConfirmButton
            onConfirm={disconnect}
            busy={disconnecting}
            label="Disconnect"
            confirmLabel="Disconnect it"
            icon={<Unplug className="w-3 h-3" />}
            size="default"
          />
        )}
      </div>
    </SectionCard>
  );
}

// ============================================================================
// Website tag
// ============================================================================

function WebsiteTagCard({
  workspaceId,
  initial,
  website,
  onToast,
  onChanged,
}: {
  workspaceId: string;
  initial: TrackingStatus;
  website: string;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onChanged: () => void;
}) {
  const [tracking, setTracking] = useState<TrackingStatus>(initial);
  const [domain, setDomain] = useState(initial.domain || website || "");
  const [saving, startSaving] = useTransition();
  const [verifying, startVerifying] = useTransition();
  const [rotating, startRotating] = useTransition();
  const [removing, startRemoving] = useTransition();

  const install = () => {
    startSaving(async () => {
      const res = await setupWebsiteTracking(workspaceId, domain);
      if (!res.success || !res.status) {
        onToast("error", res.error || "Could not create the tracking snippet.");
        return;
      }
      setTracking(res.status);
      onToast("success", "Snippet ready. Paste it into your site, then hit Verify.");
      onChanged();
    });
  };

  const verify = () => {
    startVerifying(async () => {
      const res = await verifyWebsiteTracking(workspaceId);
      setTracking(res.status);
      onToast(res.verified ? "success" : "info", res.message);
      if (res.verified) onChanged();
    });
  };

  const rotate = () => {
    startRotating(async () => {
      const res = await rotateTrackingKey(workspaceId);
      if (!res.success || !res.status) {
        onToast("error", res.error || "Could not rotate the key.");
        return;
      }
      setTracking(res.status);
      onToast("info", "New key generated. Replace the old snippet on your site — it no longer reports.");
      onChanged();
    });
  };

  const remove = () => {
    startRemoving(async () => {
      const res = await disableWebsiteTracking(workspaceId);
      if (!res.success) {
        onToast("error", res.error || "Could not disable tracking.");
        return;
      }
      setTracking({ ...tracking, installed: false, trackingKey: null, snippet: "", verifiedAt: null });
      onToast("info", "Website lead capture disabled.");
      onChanged();
    });
  };

  const statusChip = !tracking.trackingKey ? (
    <Chip tone="muted">Not installed</Chip>
  ) : tracking.verifiedAt ? (
    tracking.stale ? (
      <Chip tone="secondary" title="Installed, but no lead has been captured in the last 7 days.">
        No events in 7 days
      </Chip>
    ) : (
      <Chip tone="primary" icon={<Check className="w-3 h-3" />}>
        Verified
      </Chip>
    )
  ) : (
    <Chip tone="secondary">Waiting for first event</Chip>
  );

  return (
    <SectionCard
      title="Website lead tag"
      subtitle="One script line on your site. It only fires on real lead actions — form submits, WhatsApp, email and phone clicks — so no pageviews are ever stored."
      icon={<Globe className="w-4 h-4" />}
      accent="secondary"
      actions={statusChip}
    >
      <label className="block max-w-md">
        <span className="text-xs font-semibold text-foreground">Your website domain</span>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="your-site.com"
          className="mt-1.5 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
        />
        <span className="text-[11px] text-muted-foreground">
          Only requests from this domain are accepted, so nobody else can send you fake leads.
        </span>
      </label>

      {tracking.snippet ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Code2 className="w-3.5 h-3.5 text-secondary" />
              Paste this before <code className="font-mono">&lt;/body&gt;</code>
            </span>
            <CopyButton value={tracking.snippet} label="Copy snippet" />
          </div>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-foreground font-mono whitespace-pre-wrap break-all">
            {tracking.snippet}
          </pre>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            On WordPress you can add it under Appearance → Theme File Editor → footer.php, or with any
            &ldquo;insert header and footer code&rdquo; plugin.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
          Generate the snippet to start capturing website leads. Until it is installed, website leads
          cannot be counted and the goal will only measure social results.
        </p>
      )}

      {tracking.verifiedAt && (
        <p className="text-[11px] text-muted-foreground mt-3">
          First reported {fmtDateTime(tracking.verifiedAt)} · {tracking.leadsCaptured} lead
          {tracking.leadsCaptured === 1 ? "" : "s"} captured
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          type="button"
          onClick={install}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
          {tracking.trackingKey ? "Save domain" : "Generate snippet"}
        </button>

        {tracking.trackingKey && (
          <>
            <button
              type="button"
              onClick={verify}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/10 disabled:opacity-50"
            >
              {verifying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              Verify installation
            </button>

            <button
              type="button"
              onClick={rotate}
              disabled={rotating}
              title="Generate a new key — useful if the old snippet leaked."
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Rotate key
            </button>

            <ConfirmButton
              onConfirm={remove}
              busy={removing}
              label="Disable"
              confirmLabel="Disable it"
              icon={<RefreshCw className="w-3 h-3" />}
              size="default"
            />
          </>
        )}
      </div>
    </SectionCard>
  );
}
