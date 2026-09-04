"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sparkles,
  TrendingUp,
  Users,
  Calendar,
  Target,
  Bot,
  ArrowRight,
  Clock,
  Zap,
  Share2,
  Globe,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  Edit2,
  FileText,
  Wand2,
  Megaphone,
  RefreshCw,
  CreditCard,
  Layers,
  ExternalLink,
  Check,
  Newspaper,
  Dna,
  Link2,
  MousePointerClick,
  Award,
} from "lucide-react";
import {
  DashboardOverviewData,
  DashboardPostItem,
  approveDashboardPost,
  rejectDashboardPost,
  refreshDashboardTrends,
} from "@/actions/dashboard";
import { TrendItem } from "@/actions/trends";

interface DashboardOverviewClientProps {
  initialData: DashboardOverviewData;
}

export function DashboardOverviewClient({ initialData }: DashboardOverviewClientProps) {
  const [data, setData] = useState<DashboardOverviewData>(initialData);
  const [trends, setTrends] = useState<TrendItem[]>(initialData.trends || []);
  const [isRefreshingTrends, setIsRefreshingTrends] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Dynamic greeting based on current local hour
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Quick Post Approval handler directly on dashboard
  const handleApprove = (postId: string) => {
    setPendingApprovalId(postId);
    startTransition(async () => {
      try {
        const res = await approveDashboardPost(postId);
        if (res.success) {
          setActionMessage("Post approved and placed into scheduled queue!");
          // Move from pending to upcoming
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

  // Refresh real-time trends on demand
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

  const { user, workspace, credits, analytics, growthGoal, connectedPlatforms, kpis } =
    data;

  // Platform icon helper
  const renderPlatformBadge = (platformName: string) => {
    const p = (platformName || "").toLowerCase();
    let label = platformName;
    let badgeClass = "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";

    if (p.includes("linkedin")) {
      label = "LinkedIn";
      badgeClass = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
    } else if (p.includes("instagram")) {
      label = "Instagram";
      badgeClass = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
    } else if (p.includes("facebook")) {
      label = "Facebook";
      badgeClass = "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200";
    } else if (p.includes("youtube")) {
      label = "YouTube";
      badgeClass = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
    } else if (p.includes("tiktok")) {
      label = "TikTok";
      badgeClass = "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300";
    } else if (p.includes("pinterest")) {
      label = "Pinterest";
      badgeClass = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200";
    }

    return (
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${badgeClass}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* 1. TOP WELCOME & WORKSPACE CONTEXT (NO GRADIENTS) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {greeting}, {user.firstName} — {workspace.name}
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 pl-9 font-medium">
              Industry: <span className="text-slate-700 dark:text-slate-300">{workspace.industry}</span>
              {data.brandTone && (
                <>
                  <span className="mx-2">•</span>
                  Brand Tone: <span className="text-primary font-medium">{data.brandTone}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Link href="/dashboard/ai-studio">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold gap-1.5 shadow-xs">
                <Wand2 className="h-3.5 w-3.5" />
                <span>Create AI Post</span>
              </Button>
            </Link>
            <Link href="/dashboard/chat">
              <Button size="sm" variant="outline" className="border-secondary text-secondary hover:bg-secondary/10 text-xs font-semibold gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                <span>Automate Task</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. USER SUBSCRIPTION & CREDIT STATUS (NO GRADIENTS - PRIMARY & SECONDARY THEMED) */}
      <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            {/* Left: Plan Tier & Credits info */}
            <div className="space-y-2.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-[11px] px-2.5 py-0.5">
                  {credits.planName}
                </Badge>
                <Badge variant="outline" className="text-[11px] font-mono border-secondary text-secondary bg-secondary/10">
                  {credits.status}
                </Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {credits.tagline}
                </span>
              </div>

              {/* Progress & Remaining Credits Bar */}
              <div className="space-y-1.5 max-w-xl">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-secondary" />
                    <span>AI Generation Credits</span>
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {credits.isUnlimited ? (
                      <span className="text-primary font-bold">Unlimited (Agency Active)</span>
                    ) : credits.creditsTotal === 0 ? (
                      <span className="text-slate-500">0 / 0 Credits (Free Tier)</span>
                    ) : (
                      <span>
                        <strong className="text-primary">{credits.creditsLeft}</strong> / {credits.creditsTotal} Credits Left
                      </span>
                    )}
                  </span>
                </div>

                {!credits.isUnlimited && credits.creditsTotal > 0 && (
                  <Progress
                    value={credits.percentUsed}
                    className="h-2 bg-slate-100 dark:bg-slate-800"
                  />
                )}
                {credits.isUnlimited && (
                  <div className="h-2 w-full bg-primary/20 rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-full" />
                  </div>
                )}
              </div>
            </div>

            {/* Right: Quotas & Upgrade Button */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-6 shrink-0">
              <div className="text-xs space-y-1">
                <div className="text-slate-500 dark:text-slate-400">
                  Channels Connected:
                </div>
                <div className="font-semibold font-mono text-slate-900 dark:text-slate-100">
                  {credits.connectedAccounts} / {credits.maxSocialAccounts} Accounts
                </div>
              </div>

              <div className="text-xs space-y-1">
                <div className="text-slate-500 dark:text-slate-400">
                  Video Engine:
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {credits.canGenerateVideo ? (
                    <span className="text-primary font-mono">Enabled</span>
                  ) : (
                    <span className="text-slate-400 font-mono">Pro+ Only</span>
                  )}
                </div>
              </div>

              <Link href="/dashboard/billing">
                <Button
                  size="sm"
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/90 text-xs font-semibold gap-1.5 shadow-xs"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>{credits.plan === "AGENCY" ? "Manage Billing" : "Upgrade & Add Credits"}</span>
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Flash Alert (if any) */}
      {actionMessage && (
        <div className="p-3 rounded-lg border border-primary/30 bg-primary/10 text-primary text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {actionMessage}
          </span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-mono hover:underline text-slate-600 dark:text-slate-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. QUICK ACTIONS TOOLBAR (NO GRADIENTS - CONNECTED DIRECTLY TO APP TABS) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Quick Actions Command Center
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Real Workflows</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <Link href="/dashboard/ai-studio">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary shadow-2xs font-medium"
            >
              <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">Content Studio</span>
            </Button>
          </Link>

          <Link href="/dashboard/article-writer">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary shadow-2xs font-medium"
            >
              <Newspaper className="h-3.5 w-3.5 text-secondary shrink-0" />
              <span className="truncate">Article Writer</span>
            </Button>
          </Link>

          <Link href="/dashboard/content">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary shadow-2xs font-medium"
            >
              <FileText className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300 shrink-0" />
              <span className="truncate">Content Library</span>
            </Button>
          </Link>

          <Link href="/dashboard/goals">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary shadow-2xs font-medium"
            >
              <Target className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">Lead Goals</span>
            </Button>
          </Link>

          <Link href="/dashboard/chat">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary shadow-2xs font-medium"
            >
              <Bot className="h-3.5 w-3.5 text-secondary shrink-0" />
              <span className="truncate">Automate Task</span>
            </Button>
          </Link>

          <Link href="/dashboard/brand">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary shadow-2xs font-medium"
            >
              <Dna className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300 shrink-0" />
              <span className="truncate">Brand DNA</span>
            </Button>
          </Link>

          <Link href="/dashboard/integrations">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:text-primary shadow-2xs font-medium"
            >
              <Share2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">Integrations</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 4. REAL DENSE KPI CARDS (PRODUCTION READY - REACH, AUDIENCE GAINED, SCHEDULED, GOAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: REACH (IMPRESSIONS) */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono">
              Reach (Impressions)
            </span>
            <Users className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Today:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {kpis.reach.today.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">This Week:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {kpis.reach.thisWeek.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">This Month:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {kpis.reach.thisMonth.toLocaleString()}
              </span>
            </div>
            <Separator className="my-1.5" />
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Growth %:</span>
              <span className="font-semibold text-primary flex items-center gap-0.5 font-mono">
                <TrendingUp className="h-3 w-3" />
                {kpis.reach.growthPct >= 0 ? `+${kpis.reach.growthPct}%` : `${kpis.reach.growthPct}%`}
              </span>
            </div>
          </div>
        </Card>

        {/* KPI 2: AUDIENCE / FOLLOWERS GAINED (THROUGH THIS PLATFORM SINCE SIGNUP) */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono">
              Audience Gained
            </span>
            <BarChart2 className="h-3.5 w-3.5 text-secondary" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Total Gained:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {kpis.followers.totalFollowersGained.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">New (30 Days):</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                +{kpis.followers.new30Days.toLocaleString()}
              </span>
            </div>
            <Separator className="my-1.5" />
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Growth %:</span>
              <span className="font-semibold text-primary flex items-center gap-0.5 font-mono">
                <TrendingUp className="h-3 w-3" />
                {kpis.followers.growthPct >= 0 ? `+${kpis.followers.growthPct}%` : `${kpis.followers.growthPct}%`}
              </span>
            </div>
          </div>
        </Card>

        {/* KPI 3: SCHEDULED POSTS */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono">
              Scheduled Posts
            </span>
            <Calendar className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Today:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {kpis.scheduled.today} posts
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Upcoming (Week):</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {kpis.scheduled.upcomingWeek} posts
              </span>
            </div>
            <Separator className="my-1.5" />
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Pending Approval:</span>
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-0 text-[10px] font-mono px-1.5"
              >
                {kpis.scheduled.pendingApproval} action req
              </Badge>
            </div>
          </div>
        </Card>

        {/* KPI 4: GOAL PROGRESS */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono truncate">
              Goal Progress
            </span>
            <Target className="h-3.5 w-3.5 text-secondary shrink-0" />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate text-[11px]">
              {kpis.goal.title}
            </p>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-slate-500">{kpis.goal.percentComplete}% Complete</span>
              <span className="font-semibold text-primary font-mono">
                {kpis.goal.achieved.toLocaleString()} / {kpis.goal.target.toLocaleString()}
              </span>
            </div>
            <Progress value={kpis.goal.percentComplete} className="h-1.5 bg-slate-100 dark:bg-slate-800" />
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-0.5">
              <span>Remaining: {kpis.goal.remaining.toLocaleString()}</span>
              <span>Est: {kpis.goal.estDate}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. MAIN 2-COLUMN SECTION: REAL SCHEDULE & TRENDING PULSE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLUMN 1: PUBLISHING QUEUE & REVIEW SCHEDULE (REAL POSTS FROM DATABASE) */}
        <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-xs">
          <div>
            <CardHeader className="p-3.5 pb-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase font-mono tracking-wider">
                    Content Queue &amp; Approval
                  </CardTitle>
                  <CardDescription className="text-[11px] mt-0.5 font-mono text-slate-500">
                    Real scheduled &amp; pending posts from database
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-slate-300 dark:border-slate-700"
                >
                  {data.upcomingPosts.length + data.pendingPosts.length} ACTIVE
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-3.5">
              <Tabs defaultValue={data.pendingPosts.length > 0 ? "pending" : "scheduled"} className="w-full">
                <TabsList className="grid grid-cols-2 h-8 mb-3 bg-slate-100 dark:bg-slate-800/80">
                  <TabsTrigger value="scheduled" className="text-xs font-medium">
                    Scheduled ({data.upcomingPosts.length})
                  </TabsTrigger>
                  <TabsTrigger value="pending" className="text-xs font-medium">
                    Needs Review ({data.pendingPosts.length})
                  </TabsTrigger>
                </TabsList>

                {/* SCHEDULED TAB */}
                <TabsContent value="scheduled" className="space-y-2 mt-0">
                  {data.upcomingPosts.length === 0 ? (
                    <div className="text-center py-6 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      <Clock className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        No scheduled posts in queue
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                        Use Content Studio to create and schedule your next post.
                      </p>
                      <Link href="/dashboard/ai-studio">
                        <Button size="sm" variant="outline" className="text-xs border-primary text-primary hover:bg-primary/10">
                          Launch AI Content Studio
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    data.upcomingPosts.map((post) => (
                      <div
                        key={post.id}
                        className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground shrink-0 text-xs font-bold">
                            {post.platform.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {post.content ? post.content.slice(0, 55) : "Scheduled Media Post"}...
                            </p>
                            <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                              {renderPlatformBadge(post.platform)}
                              <span>●</span>
                              <span>
                                {post.scheduledFor
                                  ? new Date(post.scheduledFor).toLocaleString([], {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "Pending Time"}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge className="bg-primary/15 text-primary border-0 text-[10px] font-mono">
                            Scheduled
                          </Badge>
                          <Link href="/dashboard/content">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <Edit2 className="h-3 w-3 text-slate-400" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* PENDING APPROVAL TAB */}
                <TabsContent value="pending" className="space-y-2 mt-0">
                  {data.pendingPosts.length === 0 ? (
                    <div className="text-center py-6 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      <CheckCircle2 className="h-6 w-6 text-primary mx-auto mb-1.5" />
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Queue is clean!
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        All generated content has been reviewed and scheduled.
                      </p>
                    </div>
                  ) : (
                    data.pendingPosts.map((post) => (
                      <div
                        key={post.id}
                        className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded bg-secondary text-secondary-foreground shrink-0 text-xs font-bold">
                            {post.platform.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {post.content ? post.content.slice(0, 50) : "Draft post"}...
                            </p>
                            <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                              {renderPlatformBadge(post.platform)}
                              <span>●</span>
                              <span>Action Required</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            disabled={isPending && pendingApprovalId === post.id}
                            onClick={() => handleApprove(post.id)}
                            className="h-7 text-[11px] px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            <span>Approve</span>
                          </Button>
                          <Link href="/dashboard/content">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Edit2 className="h-3 w-3 text-slate-400" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </div>

          <div className="p-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Link href="/dashboard/content" className="w-full block">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-mono justify-between text-slate-700 dark:text-slate-300 hover:text-primary"
              >
                <span>Open Full Content Library</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </Card>

        {/* COLUMN 2: REAL-TIME PLATFORM TRENDS RADAR (NO GRADIENTS) */}
        <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-xs">
          <div>
            <CardHeader className="p-3.5 pb-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase font-mono tracking-wider">
                    Industry Trends Radar
                  </CardTitle>
                  <CardDescription className="text-[11px] mt-0.5 font-mono text-slate-500">
                    Live market signals tailored to {workspace.industry}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRefreshTrends}
                    disabled={isRefreshingTrends}
                    className="h-6 w-6 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    title="Refresh trends"
                  >
                    <RefreshCw className={`h-3 w-3 ${isRefreshingTrends ? "animate-spin text-primary" : ""}`} />
                  </Button>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono border-primary text-primary bg-primary/10 flex items-center gap-1"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    LIVE
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3.5 space-y-2.5 text-xs">
              {trends.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Globe className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                  <p>No recent news detected for this keyword.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefreshTrends}
                    className="mt-2 text-xs"
                  >
                    Try Refreshing
                  </Button>
                </div>
              ) : (
                trends.slice(0, 4).map((trend, idx) => (
                  <div
                    key={trend.id || idx}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-primary/40 transition-all flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary shrink-0 mt-0.5 font-mono text-xs font-semibold">
                        #{idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-secondary uppercase truncate">
                            {trend.source || "News"}
                          </span>
                          {trend.pubDate && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(trend.pubDate).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-1">
                          {trend.title}
                        </p>
                        {trend.snippet && (
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5 line-clamp-1">
                            {trend.snippet}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                      <a
                        href={trend.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-mono flex items-center gap-1"
                      >
                        <span>Source</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <Link
                        href={`/dashboard/ai-studio?topic=${encodeURIComponent(trend.title)}`}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] font-medium border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                        >
                          <span>Generate Campaign</span>
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </div>

          <div className="p-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Link href="/dashboard/ai-studio" className="w-full block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs font-mono justify-center text-primary hover:text-primary/80 font-medium"
              >
                <span>Launch Multi-Agent Campaign in Studio</span>
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* 6. CONNECTED CHANNELS & SYSTEM HEALTH (REAL DATA ONLY - NO HARDCODED ALERTS) */}
      <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="p-3.5 pb-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <CardTitle className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase font-mono tracking-wider">
                Social Platform Connections &amp; Health Monitor
              </CardTitle>
            </div>
            <Link href="/dashboard/integrations" className="text-xs text-primary font-mono hover:underline">
              Manage Integrations →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {connectedPlatforms.map((channel) => (
              <div
                key={channel.platform}
                className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                    {channel.platform}
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      channel.isConnected ? "bg-primary" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  />
                </div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {channel.isConnected ? channel.handle || "Connected" : "Disconnected"}
                </div>
                <div className="mt-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                  <Link
                    href="/dashboard/integrations"
                    className="text-[10px] font-mono text-primary hover:underline flex items-center justify-between"
                  >
                    <span>{channel.isConnected ? "Settings" : "Connect"}</span>
                    <ChevronRight className="h-2.5 w-2.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
