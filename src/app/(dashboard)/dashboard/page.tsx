"use client";

import { useState, useEffect } from "react";
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
  TrendingUp,
  Users,
  Calendar,
  Target,
  Sparkles,
  Bot,
  ArrowRight,
  Clock,
  Award,
  Lightbulb,
  Zap,
  Plus,
  Link2,
  Video,
  Share2,
  MessageSquare,
  Globe,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  Edit2,
  FileText,
  UploadCloud,
  Wand2,
  Megaphone,
  CheckSquare,
  Square,
  AlertTriangle,
  RefreshCw,
  Terminal,
} from "lucide-react";

export default function DashboardOverviewPage() {
  const [greeting, setGreeting] = useState("Welcome");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting("Good morning");
    } else if (hour < 17) {
      setGreeting("Good afternoon");
    } else {
      setGreeting("Good evening");
    }
  }, []);

  return (
    <div className="space-y-6 pb-8 font-sans">
      {/* Top Welcome Bar - Centered with Animations & Premium Effects */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-b from-slate-50/80 via-white to-slate-50/30 dark:from-slate-900/80 dark:via-slate-900 dark:to-slate-900/30 p-6 shadow-xs transition-all">
        {/* Decorative subtle background glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-center justify-center text-center">
          {/* Centered Greeting with Premium Gradient & Sparkle Animation */}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center justify-center gap-2.5">
            <Sparkles className="h-6 w-6 text-primary animate-pulse shrink-0" />
            <span className="bg-gradient-to-r from-slate-900 via-indigo-600 to-primary dark:from-white dark:via-indigo-300 dark:to-primary bg-clip-text text-transparent">
              {greeting}, Shahid — Acme Corp Marketing
            </span>
          </h1>
        </div>
      </div>

      {/* QUICK ACTIONS ROW (7 SPECIFIC BUTTONS - DENSE AD MANAGER TOOLBAR) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
            Quick Actions Toolbar
          </span>
          <span className="text-[10px] text-slate-400">7 Active Workflows</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <Link href="/dashboard/content">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 shadow-2xs font-medium"
            >
              <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="truncate">Generate Post</span>
            </Button>
          </Link>

          <Link href="/dashboard/content">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 shadow-2xs font-medium"
            >
              <Video className="h-3.5 w-3.5 text-purple-500 shrink-0" />
              <span className="truncate">Generate Reel</span>
            </Button>
          </Link>

          <Link href="/dashboard/content">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 shadow-2xs font-medium"
            >
              <Share2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">Generate Carousel</span>
            </Button>
          </Link>

          <Link href="/dashboard/goals">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 shadow-2xs font-medium"
            >
              <Megaphone className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="truncate">Create Campaign</span>
            </Button>
          </Link>

          <Link href="/dashboard/brand">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 shadow-2xs font-medium"
            >
              <UploadCloud className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
              <span className="truncate">Upload Knowledge</span>
            </Button>
          </Link>

          <Link href="/dashboard/integrations">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 shadow-2xs font-medium"
            >
              <Link2 className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              <span className="truncate">Connect Social</span>
            </Button>
          </Link>

          <Link href="/dashboard/ai-studio">
            <Button
              variant="outline"
              className="w-full h-9 text-xs justify-start gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 shadow-2xs font-medium"
            >
              <Wand2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span className="truncate">Open AI Studio</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* DENSE KPI CARDS ROW (4 COLUMNS: Reach, Followers, Scheduled Posts, Goal Progress) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: REACH */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono">
              Reach (Impressions)
            </span>
            <Users className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Today:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">3,120</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">This Week:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">18,450</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">This Month:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">74,200</span>
            </div>
            <Separator className="my-1.5" />
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Growth %:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                +14.2%
              </span>
            </div>
          </div>
        </Card>

        {/* KPI 3: FOLLOWERS */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono">
              Followers
            </span>
            <BarChart2 className="h-3.5 w-3.5 text-purple-500" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Total Followers:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">42,850</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">New (30 Days):</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">+620</span>
            </div>
            <Separator className="my-1.5" />
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Growth %:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                +3.4%
              </span>
            </div>
          </div>
        </Card>

        {/* KPI 4: SCHEDULED POSTS */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono">
              Scheduled Posts
            </span>
            <Calendar className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Today:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">2 posts</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Upcoming (Week):</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">14 posts</span>
            </div>
            <Separator className="my-1.5" />
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Pending Approval:</span>
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-0 text-[10px] font-mono px-1.5"
              >
                3 action req
              </Badge>
            </div>
          </div>
        </Card>

        {/* KPI 5: GOAL PROGRESS */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase font-mono truncate">
              Goal Progress
            </span>
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate text-[11px]">
              Q3 Lead Pipeline
            </p>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-slate-500">68% Complete</span>
              <span className="font-semibold text-primary">680 / 1,000</span>
            </div>
            <Progress value={68} className="h-1.5" />
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-0.5">
              <span>Remaining: 320</span>
              <span>Est: Aug 18, 2026</span>
            </div>
          </div>
        </Card>
      </div>

      {/* MAIN 2-COLUMN DENSE EXECUTIVE TERMINAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLUMN 1: TODAY'S SCHEDULE (Detailed Table/List) */}
        <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-xs">
          <div>
            <CardHeader className="p-3 pb-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase font-mono tracking-wider">
                    Today&apos;s Schedule
                  </CardTitle>
                  <CardDescription className="text-[11px] mt-0.5 font-mono text-slate-500">
                    Publishing queue &amp; content status
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-slate-300 dark:border-slate-700"
                >
                  4 ITEMS QUEUED
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-3 space-y-2">
              {/* Table/List Item 1 */}
              <div className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white shrink-0">
                    <Share2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Thought Leadership Carousel
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>LinkedIn</span>
                      <span>●</span>
                      <span>10:00 AM EST</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-0 text-[10px] font-mono">
                    Scheduled
                  </Badge>
                  <Link href="/dashboard/content">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Edit2 className="h-3 w-3 text-slate-400" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Table/List Item 2 */}
              <div className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 dark:bg-slate-700 text-white shrink-0">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Product Feature Thread
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>X (Twitter)</span>
                      <span>●</span>
                      <span>1:30 PM EST</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-0 text-[10px] font-mono">
                    Pending
                  </Badge>
                  <Link href="/dashboard/content">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Edit2 className="h-3 w-3 text-slate-400" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Table/List Item 3 */}
              <div className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white shrink-0">
                    <Share2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Case Study Infographic
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>LinkedIn</span>
                      <span>●</span>
                      <span>4:00 PM EST</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-0 text-[10px] font-mono">
                    Scheduled
                  </Badge>
                  <Link href="/dashboard/content">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Edit2 className="h-3 w-3 text-slate-400" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Table/List Item 4 */}
              <div className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white shrink-0">
                    <Video className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Behind-the-Scenes Reel
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>Instagram</span>
                      <span>●</span>
                      <span>8:00 PM EST</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-mono"
                  >
                    Draft
                  </Badge>
                  <Link href="/dashboard/content">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Edit2 className="h-3 w-3 text-slate-400" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </div>

          <div className="p-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Link href="/dashboard/content" className="w-full block">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-mono justify-between"
              >
                <span>View Full Content Calendar</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </Card>

        {/* COLUMN 3: PLATFORM TRENDING TOPICS (Real-time Viral Topics with Publish action) */}
        <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-xs">
          <div>
            <CardHeader className="p-3 pb-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase font-mono tracking-wider">
                    Platform Trending Topics
                  </CardTitle>
                  <CardDescription className="text-[11px] mt-0.5 font-mono text-slate-500">
                    Real-time viral topics detected across social channels
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-1"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-3 space-y-2.5 text-xs">
              {/* Trend 1: LinkedIn */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-primary/40 transition-all flex flex-col justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white shrink-0 mt-0.5">
                    <Share2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 uppercase">
                        LinkedIn
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                        ▲ +88% velocity
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      Autonomous SaaS &amp; Agentic Workflows
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      142k posts this week • High B2B engagement
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <Link href="/dashboard/ai-studio" className="w-full block">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-xs font-medium bg-white dark:bg-slate-900 hover:bg-primary hover:text-primary-foreground border-slate-300 dark:border-slate-700 transition-colors justify-center"
                    >
                      <span>Publish this topic</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Trend 2: X (Twitter) */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-primary/40 transition-all flex flex-col justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 dark:bg-slate-700 text-white shrink-0 mt-0.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase">
                        X (Twitter)
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                        #1 Tech Trend
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      AI Models vs Open Source Dev Tools
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      89k posts today • Viral developer discourse
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <Link href="/dashboard/ai-studio" className="w-full block">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-xs font-medium bg-white dark:bg-slate-900 hover:bg-primary hover:text-primary-foreground border-slate-300 dark:border-slate-700 transition-colors justify-center"
                    >
                      <span>Publish this topic</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Trend 3: Instagram Reels */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-primary/40 transition-all flex flex-col justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white shrink-0 mt-0.5">
                    <Video className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase">
                        Instagram Reels
                      </span>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-semibold">
                        Viral Sound #12
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      60-Second AI Automation Breakdowns
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      4.2M avg reach • 3.4x higher shares
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <Link href="/dashboard/ai-studio" className="w-full block">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-xs font-medium bg-white dark:bg-slate-900 hover:bg-primary hover:text-primary-foreground border-slate-300 dark:border-slate-700 transition-colors justify-center"
                    >
                      <span>Publish this topic</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Trend 4: YouTube Shorts */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-primary/40 transition-all flex flex-col justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-red-600 text-white shrink-0 mt-0.5">
                    <Globe className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-red-600 dark:text-red-400 uppercase">
                        YouTube Shorts
                      </span>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-semibold">
                        High Retention
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      SaaS Founder Build-in-Public Metrics
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      68k videos • High organic CTR
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <Link href="/dashboard/ai-studio" className="w-full block">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-xs font-medium bg-white dark:bg-slate-900 hover:bg-primary hover:text-primary-foreground border-slate-300 dark:border-slate-700 transition-colors justify-center"
                    >
                      <span>Publish this topic</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </div>

          <div className="p-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Link href="/dashboard/ai-studio" className="w-full block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs font-mono justify-center text-primary hover:text-primary/80 font-medium"
              >
                <span>Open AI Studio for Custom Topics</span>
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* DASHBOARD NOTIFICATIONS / ALERTS TERMINAL MONITOR */}
      <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="p-3 pb-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <CardTitle className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase font-mono tracking-wider">
                System Alerts &amp; AI Worker Health Monitor
              </CardTitle>
            </div>
            <Link href="/dashboard/settings" className="text-xs text-primary font-mono hover:underline">
              View All Logs →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Monitor Box 1: AI Finished Tasks */}
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                  AI Finished Tasks
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                12 Completed
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                Creative Agent &amp; Copywriter
              </div>
            </div>

            {/* Monitor Box 2: Failed Publishing */}
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                  Failed Publishing
                </span>
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-0 text-[10px] px-1.5 font-mono">
                  0 ERRORS
                </Badge>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                All Systems OK
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                LinkedIn &amp; X API active
              </div>
            </div>

            {/* Monitor Box 3: Token Expiry */}
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                  Token Expiry
                </span>
                <Clock className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                24 Days Left
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                Valid through Aug 2026
              </div>
            </div>

            {/* Monitor Box 4: New Trend Found */}
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                  New Trend Found
                </span>
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                2 Signals
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                AI Agents &amp; SaaS Automation
              </div>
            </div>

            {/* Monitor Box 5: System Update */}
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                  System Update
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-primary/40 text-primary px-1.5"
                >
                  v2.4 LIVE
                </Badge>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Dialog Approved
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                Shadcn modal integrated
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
