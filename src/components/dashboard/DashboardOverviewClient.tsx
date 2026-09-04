"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sparkles,
  MousePointerClick,
  TrendingUp,
  Send,
  Target,
  ArrowRight,
  Clock,
  Edit2,
  HelpCircle,
  Check,
  X,
  Share2,
  Zap,
  CreditCard,
} from "lucide-react";
import {
  DashboardOverviewData,
  approveDashboardPost,
} from "@/actions/dashboard";
import { syncWorkspaceInsights } from "@/actions/insights";
import { QuickGuideDialog } from "@/components/dashboard/QuickGuideDialog";

interface DashboardOverviewClientProps {
  initialData: DashboardOverviewData;
}

const PLATFORM_DOT: Record<string, string> = {
  INSTAGRAM: "bg-pink-500",
  LINKEDIN: "bg-blue-600",
  FACEBOOK: "bg-blue-500",
  YOUTUBE: "bg-red-600",
  TIKTOK: "bg-slate-800 dark:bg-slate-400",
  PINTEREST: "bg-red-500",
};

function platformLabel(platform: string): string {
  const p = (platform || "").toLowerCase();
  const known = ["instagram", "linkedin", "facebook", "youtube", "tiktok", "pinterest"];
  const match = known.find((k) => p.includes(k));
  if (match) return match.charAt(0).toUpperCase() + match.slice(1);
  return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
}

function formatDelta(pct: number): string {
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatNum(n: number): string {
  return (n || 0).toLocaleString();
}

function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  progress,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: React.ReactNode;
  progress?: number;
}) {
  return (
    <Card size="sm" className="gap-0">
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </span>
        {progress !== undefined && (
          <Progress value={progress} className="h-1.5" />
        )}
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function DashboardOverviewClient({ initialData }: DashboardOverviewClientProps) {
  const [data, setData] = useState<DashboardOverviewData>(initialData);
  const [guideOpen, setGuideOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Lazy insights refresh. The server returns stored snapshots without calling
  // any platform API when they are newer than 12h, so this is cheap on every
  // dashboard visit and only refetches when a snapshot has gone stale.
  useEffect(() => {
    let cancelled = false;
    syncWorkspaceInsights()
      .then((views) => {
        if (cancelled || !views || views.length === 0) return;
        setData((prev) => ({
          ...prev,
          platformPerformance: prev.platformPerformance.map((p) => {
            const v = views.find((x) => x.platform === p.platform);
            if (!v) return p;
            return {
              ...p,
              insight: {
                state: v.state,
                message: v.message,
                fetchedAt: v.fetchedAt,
                followers: v.followers,
                impressions30d: v.impressions30d,
                views30d: v.views30d,
                likes30d: v.likes30d,
                comments30d: v.comments30d,
                shares30d: v.shares30d,
                engagementRate: v.engagementRate,
              },
            };
          }),
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const handleApprove = (postId: string) => {
    setPendingApprovalId(postId);
    startTransition(async () => {
      try {
        const res = await approveDashboardPost(postId);
        if (res.success) {
          setActionMessage("Post approved and scheduled.");
          setData((prev) => {
            const approved = prev.pendingPosts.find((p) => p.id === postId);
            if (!approved) return prev;
            return {
              ...prev,
              pendingPosts: prev.pendingPosts.filter((p) => p.id !== postId),
              upcomingPosts: [
                { ...approved, status: "SCHEDULED" },
                ...prev.upcomingPosts,
              ],
            };
          });
        } else {
          setActionMessage(res.error || "Could not approve post.");
        }
      } catch {
        setActionMessage("Failed to approve post. Try again.");
      } finally {
        setPendingApprovalId(null);
        setTimeout(() => setActionMessage(null), 4000);
      }
    });
  };

  const { user, workspace, credits, kpis, platformPerformance } = data;
  const connectedCount = data.connectedPlatforms.filter((c) => c.isConnected).length;
  const anyConnected = connectedCount > 0;

  const hasContent =
    kpis.clicks.this7d > 0 ||
    kpis.leads.gained30d > 0 ||
    kpis.published.this30d > 0 ||
    data.upcomingPosts.length > 0 ||
    data.pendingPosts.length > 0 ||
    platformPerformance.some((p) => p.published > 0);

  const totalQueue = data.upcomingPosts.length + data.pendingPosts.length;
  const pendingNeedsReview = kpis.scheduled.pendingApproval > 0;

  return (
    <div className="space-y-5 pb-8 font-sans">
      {/* Greeting + primary actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {greeting}, {user.firstName}
          </h1>
          <p className="text-xs text-muted-foreground">{workspace.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setGuideOpen(true)}
            title="Quick guide"
            aria-label="Quick guide"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Link href="/dashboard/ai-studio">
            <Button className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Create Post
            </Button>
          </Link>
        </div>
      </div>

      {/* Plan / credits / channels status bar */}
      <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20">
              <Zap className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-foreground">
                {credits.planName}
                {(() => {
                  const key = (credits.status || "").toUpperCase();
                  if (!key || key === "NONE") return null;
                  const ok = !/PAST_DUE|CANCEL|PAUSED|EXPIRED|FAILED/.test(key);
                  return (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium ring-1 ${
                        ok
                          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400"
                      }`}
                    >
                      <span className={`h-1 w-1 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {key.replace(/_/g, " ").toLowerCase()}
                    </span>
                  );
                })()}
              </p>
              <p className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                {credits.tagline}
              </p>
            </div>
          </div>

          <div className="min-w-[180px] max-w-[260px] flex-1">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Credits remaining</span>
              <span className="font-semibold tabular-nums text-foreground">
                {credits.isUnlimited
                  ? "Unlimited"
                  : `${credits.creditsLeft} of ${credits.creditsTotal}`}
              </span>
            </div>
            <Progress
              value={credits.isUnlimited ? 100 : credits.percentUsed}
              className="h-2 bg-muted"
            />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Share2 className="h-3 w-3 text-primary" />
            {connectedCount}/{credits.maxSocialAccounts} channels
          </span>

          <Link href="/dashboard/billing" className="ml-auto">
            <Button size="sm" className="gap-1.5 shadow-xs">
              <CreditCard className="h-3.5 w-3.5" />
              {credits.plan === "AGENCY" ? "Manage Billing" : "Upgrade"}
            </Button>
          </Link>
        </div>
      </div>

      {/* Action feedback */}
      {actionMessage && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            aria-label="Dismiss"
            className="shrink-0 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* First-run: no channels connected and nothing to show yet */}
      {!anyConnected && !hasContent ? (
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <div className="mx-auto max-w-md text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Share2 className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold text-foreground">
              Connect your social channels
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Link Instagram, LinkedIn, Facebook and more, then create your first AI post.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {data.connectedPlatforms.map((ch) => (
                <Link
                  key={ch.platform}
                  href="/dashboard/integrations"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-foreground/15 transition-colors hover:bg-muted"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      ch.isConnected ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                  {platformLabel(ch.platform)}
                </Link>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/integrations">
                <Button className="gap-1.5">
                  <Share2 className="h-3.5 w-3.5" />
                  Connect channel
                </Button>
              </Link>
              <Button variant="outline" onClick={() => setGuideOpen(true)}>
                Take the quick tour
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Pending review attention strip */}
          {pendingNeedsReview && (
            <a
              href="#queue"
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
            >
              <span>{kpis.scheduled.pendingApproval} post(s) waiting for your review</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-amber-700 dark:text-amber-400">
                Open queue
                <ArrowRight className="h-3 w-3" />
              </span>
            </a>
          )}

          {/* Real measured KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Link Clicks (7d)"
              value={formatNum(kpis.clicks.this7d)}
              icon={MousePointerClick}
              sub={
                <span
                  className={`inline-flex items-center gap-0.5 tabular-nums ${
                    kpis.clicks.growthPct >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  <TrendingUp className="h-3 w-3" />
                  {formatDelta(kpis.clicks.growthPct)} vs prev week
                </span>
              }
            />
            <StatCard
              label="Leads Gained (30d)"
              value={formatNum(kpis.leads.gained30d)}
              icon={Target}
              sub={
                <span
                  className={`inline-flex items-center gap-0.5 tabular-nums ${
                    kpis.leads.growthPct >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  <TrendingUp className="h-3 w-3" />
                  {formatDelta(kpis.leads.growthPct)} vs prev 30d
                </span>
              }
            />
            <StatCard
              label="Posts Published (30d)"
              value={formatNum(kpis.published.this30d)}
              icon={Send}
              sub={
                kpis.published.failures30d > 0 ? (
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {kpis.published.failures30d} failed to publish
                  </span>
                ) : (
                  <span>{kpis.published.today} today</span>
                )
              }
            />
            {kpis.goal.hasGoal ? (
              <StatCard
                label={`Goal · ${kpis.goal.title}`}
                value={`${kpis.goal.percentComplete}%`}
                icon={Target}
                progress={kpis.goal.percentComplete}
                sub={
                  <span className="tabular-nums">
                    {formatNum(kpis.goal.achieved)} / {formatNum(kpis.goal.target)} · {kpis.goal.estDate}
                  </span>
                }
              />
            ) : (
              <StatCard
                label="Goal"
                value="—"
                icon={Target}
                sub={
                  <Link href="/dashboard/goals" className="text-primary hover:underline">
                    Set a lead goal
                  </Link>
                }
              />
            )}
          </div>

          {/* Queue + platform results */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Content queue */}
            <Card id="queue" className="gap-0 scroll-mt-20">
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle className="text-sm font-medium">Content Queue</CardTitle>
                <CardAction>
                  <Link
                    href="/dashboard/content"
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                  >
                    View all
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent className="p-3">
                <Tabs defaultValue={data.pendingPosts.length > 0 ? "pending" : "scheduled"}>
                  <TabsList className="mb-3 grid h-8 grid-cols-2">
                    <TabsTrigger value="scheduled" className="text-xs">
                      Scheduled ({data.upcomingPosts.length})
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="text-xs">
                      Review ({data.pendingPosts.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="scheduled" className="mt-0 space-y-2">
                    {data.upcomingPosts.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-5 text-center">
                        <Clock className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
                        <p className="text-xs font-medium text-foreground">Nothing scheduled</p>
                        <Link href="/dashboard/ai-studio" className="mt-2 inline-block">
                          <Button size="sm" variant="outline" className="text-xs">
                            Create your first post
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      data.upcomingPosts.map((post) => (
                        <div
                          key={post.id}
                          className="flex items-center gap-2.5 rounded-md bg-muted/30 p-2.5 transition-colors hover:bg-muted/60"
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              PLATFORM_DOT[post.platform.toUpperCase()] || "bg-slate-400"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">
                              {post.content ? post.content.slice(0, 60) : "Scheduled media post"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {platformLabel(post.platform)}
                              {post.scheduledFor && (
                                <>
                                  {" · "}
                                  {new Date(post.scheduledFor).toLocaleString([], {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </>
                              )}
                            </p>
                          </div>
                          <Link href="/dashboard/content">
                            <Button variant="ghost" size="icon-sm" aria-label="Edit post">
                              <Edit2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </Link>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="pending" className="mt-0 space-y-2">
                    {data.pendingPosts.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-5 text-center">
                        <Check className="mx-auto mb-1.5 h-5 w-5 text-emerald-500" />
                        <p className="text-xs font-medium text-foreground">Nothing to review</p>
                      </div>
                    ) : (
                      data.pendingPosts.map((post) => (
                        <div
                          key={post.id}
                          className="flex items-center gap-2.5 rounded-md bg-muted/30 p-2.5 transition-colors hover:bg-muted/60"
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              PLATFORM_DOT[post.platform.toUpperCase()] || "bg-slate-400"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">
                              {post.content ? post.content.slice(0, 60) : "Draft post"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {platformLabel(post.platform)} · Needs review
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="xs"
                              disabled={pendingApprovalId === post.id}
                              onClick={() => handleApprove(post.id)}
                              className="gap-0.5"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </Button>
                            <Link href="/dashboard/content">
                              <Button variant="ghost" size="icon-sm" aria-label="Edit post">
                                <Edit2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>
                </Tabs>

                {totalQueue === 0 && (
                  <p className="mt-2 text-center text-[10px] text-muted-foreground">
                    Approved posts publish automatically on schedule.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Platform results */}
            <Card className="gap-0">
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle className="text-sm font-medium">Platform Results</CardTitle>
                <CardAction>
                  <Link
                    href="/dashboard/integrations"
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                  >
                    {anyConnected ? "Manage" : "Connect"}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent className="p-3">
                {platformPerformance.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-5 text-center">
                    <Share2 className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
                    <p className="text-xs font-medium text-foreground">No activity yet</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Publish a post to see results per channel.
                    </p>
                    <Link href="/dashboard/ai-studio" className="mt-2 inline-block">
                      <Button size="sm" variant="outline" className="text-xs">
                        Create a post
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Desktop table header */}
                    <div className="hidden grid-cols-[1.7fr_1fr_1fr_1fr_1fr] gap-2 px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                      <span>Channel</span>
                      <span>Posts</span>
                      <span title="Platform-reported · last 30 days">Impressions</span>
                      <span title="Platform-reported">Followers</span>
                      <span title="Interactions ÷ impressions · last 30 days">Eng %</span>
                    </div>

                    {platformPerformance.map((row) => {
                      const insightLive =
                        row.insight && row.insight.state === "live" ? row.insight : null;
                      const insightNote =
                        row.connected && row.insight && row.insight.state !== "live"
                          ? row.insight.message || "Live metrics unavailable"
                          : null;
                      const followers = insightLive?.followers ?? null;
                      const impressions = insightLive?.impressions30d ?? null;
                      const engagement = insightLive?.engagementRate ?? null;

                      const metric = (v: number | null, suffix = "") =>
                        v === null || v === undefined ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <span className="tabular-nums text-foreground">
                            {fmtCompact(v)}
                            {suffix && <span className="text-muted-foreground">{suffix}</span>}
                          </span>
                        );

                      return (
                        <div key={row.platform} className="space-y-1.5 sm:space-y-0">
                          {/* Desktop row */}
                          <div className="hidden grid-cols-[1.7fr_1fr_1fr_1fr_1fr] items-center gap-2 rounded-md bg-muted/30 px-2 py-2 text-xs sm:grid">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  PLATFORM_DOT[row.platform.toUpperCase()] || "bg-slate-400"
                                }`}
                              />
                              <div className="min-w-0">
                                <p
                                  className="truncate font-medium text-foreground"
                                  title={row.connected ? row.handle || undefined : undefined}
                                >
                                  {platformLabel(row.platform)}
                                </p>
                                <p
                                  className="truncate text-[10px] text-muted-foreground"
                                  title={insightNote || undefined}
                                >
                                  {row.connected ? row.handle || "Connected" : "Not connected"}
                                  {insightNote && (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      {" · "}metrics pending
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <span className="tabular-nums text-foreground">
                              {formatNum(row.published)}
                            </span>
                            {metric(impressions)}
                            {metric(followers)}
                            {metric(engagement, "%")}
                          </div>

                          {/* Mobile row */}
                          <div className="rounded-md bg-muted/30 px-2.5 py-2 sm:hidden">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  PLATFORM_DOT[row.platform.toUpperCase()] || "bg-slate-400"
                                }`}
                              />
                              <p className="truncate text-xs font-medium text-foreground">
                                {platformLabel(row.platform)}
                              </p>
                            </div>
                            <p className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground">
                              {formatNum(row.published)} posts
                              {impressions !== null && ` · ${fmtCompact(impressions)} impressions`}
                              {followers !== null && ` · ${fmtCompact(followers)} followers`}
                              {engagement !== null && ` · ${engagement}% eng`}
                              {insightNote && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {" · "}metrics pending
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {!anyConnected && (
                      <Link
                        href="/dashboard/integrations"
                        className="mt-2 block text-center text-xs font-medium text-primary hover:underline"
                      >
                        Connect a channel to start publishing
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <QuickGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
