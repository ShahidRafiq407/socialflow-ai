"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sparkles,
  TrendingUp,
  Users,
  Calendar,
  Target,
  ArrowRight,
  Clock,
  RefreshCw,
  Edit2,
  HelpCircle,
  Check,
  X,
} from "lucide-react";
import {
  DashboardOverviewData,
  approveDashboardPost,
  refreshDashboardTrends,
} from "@/actions/dashboard";
import { TrendItem } from "@/actions/trends";
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

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: React.ReactNode;
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
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function DashboardOverviewClient({ initialData }: DashboardOverviewClientProps) {
  const [data, setData] = useState<DashboardOverviewData>(initialData);
  const [trends, setTrends] = useState<TrendItem[]>(initialData.trends || []);
  const [isRefreshingTrends, setIsRefreshingTrends] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  const handleRefreshTrends = async () => {
    setIsRefreshingTrends(true);
    try {
      const res = await refreshDashboardTrends(
        data.workspace.industry || data.workspace.name || "AI Marketing"
      );
      if (res.success && res.trends) {
        setTrends(res.trends);
      }
    } catch {
      // Keep existing trends
    } finally {
      setIsRefreshingTrends(false);
    }
  };

  const { user, workspace, credits, kpis, connectedPlatforms } = data;
  const totalQueue = data.upcomingPosts.length + data.pendingPosts.length;

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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <Badge variant="secondary" className="font-medium">
          {credits.planName}
        </Badge>

        <div className="flex min-w-[170px] max-w-[240px] flex-1 items-center gap-2.5">
          <Progress
            value={credits.isUnlimited ? 100 : credits.percentUsed}
            className="h-1.5 flex-1"
          />
          <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
            {credits.isUnlimited
              ? "Unlimited"
              : `${credits.creditsLeft} / ${credits.creditsTotal} credits`}
          </span>
        </div>

        <span className="text-xs text-muted-foreground">
          {credits.connectedAccounts}/{credits.maxSocialAccounts} channels
        </span>

        <Link href="/dashboard/billing" className="ml-auto">
          <Button variant="outline" size="sm" className="text-xs">
            {credits.plan === "AGENCY" ? "Billing" : "Upgrade"}
          </Button>
        </Link>
      </div>

      {/* Action feedback toast */}
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

      {/* KPI stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Reach (7d)"
          value={kpis.reach.thisWeek.toLocaleString()}
          icon={Users}
          sub={
            <span
              className={`inline-flex items-center gap-0.5 tabular-nums ${
                kpis.reach.growthPct >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              {formatDelta(kpis.reach.growthPct)} vs last week
            </span>
          }
        />
        <StatCard
          label="Audience Gained"
          value={kpis.followers.totalFollowersGained.toLocaleString()}
          icon={TrendingUp}
          sub={
            <span
              className={`inline-flex items-center gap-0.5 tabular-nums ${
                kpis.followers.growthPct >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              +{kpis.followers.new30Days.toLocaleString()} (30d)
            </span>
          }
        />
        <StatCard
          label="Scheduled (7d)"
          value={String(kpis.scheduled.upcomingWeek)}
          icon={Calendar}
          sub={
            kpis.scheduled.pendingApproval > 0 ? (
              <Link
                href="#queue"
                className="font-medium text-amber-600 hover:underline dark:text-amber-400"
              >
                {kpis.scheduled.pendingApproval} need review
              </Link>
            ) : (
              <span>{kpis.scheduled.today} today</span>
            )
          }
        />
        <StatCard
          label="Goal"
          value={`${kpis.goal.percentComplete}%`}
          icon={Target}
          sub={
            kpis.goal.hasGoal ? (
              <span className="tabular-nums">
                {kpis.goal.achieved.toLocaleString()} / {kpis.goal.target.toLocaleString()}
              </span>
            ) : (
              <Link href="/dashboard/goals" className="text-primary hover:underline">
                Set a goal
              </Link>
            )
          }
        />
      </div>

      {/* Content queue + trends */}
      <div id="queue" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Content queue */}
        <Card className="gap-0">
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
                    <p className="text-xs font-medium text-foreground">
                      Nothing scheduled
                    </p>
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
                    <p className="text-xs font-medium text-foreground">
                      Nothing to review
                    </p>
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

        {/* Industry trends */}
        <Card className="gap-0">
          <CardHeader className="border-b [.border-b]:pb-3">
            <CardTitle className="truncate text-sm font-medium">
              Trending in {workspace.industry}
            </CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRefreshTrends}
                disabled={isRefreshingTrends}
                aria-label="Refresh trends"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    isRefreshingTrends ? "animate-spin text-primary" : "text-muted-foreground"
                  }`}
                />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-0.5 p-2">
            {trends.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">No trends found.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefreshTrends}
                  disabled={isRefreshingTrends}
                  className="mt-2 text-xs"
                >
                  Refresh
                </Button>
              </div>
            ) : (
              trends.slice(0, 5).map((trend, idx) => (
                <div
                  key={trend.id || idx}
                  className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted/60"
                >
                  <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={trend.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs font-medium text-foreground hover:underline"
                    >
                      {trend.title}
                    </a>
                    <p className="text-[10px] text-muted-foreground">
                      {trend.source || "News"}
                      {trend.pubDate && (
                        <>
                          {" · "}
                          {new Date(trend.pubDate).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/ai-studio?topic=${encodeURIComponent(trend.title)}`}
                    title="Generate a post from this trend"
                  >
                    <Button variant="ghost" size="icon-sm" aria-label="Generate post from trend">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connected channels */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Channels</span>
        {connectedPlatforms.map((channel) => (
          <Link
            key={channel.platform}
            href="/dashboard/integrations"
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                channel.isConnected
                  ? "bg-emerald-500"
                  : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
            {platformLabel(channel.platform)}
            {!channel.isConnected && <span className="text-muted-foreground">+</span>}
          </Link>
        ))}
      </div>

      <QuickGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
