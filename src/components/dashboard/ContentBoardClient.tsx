"use client";

import React, { useMemo, useState } from "react";
import { PostProps, PostCard } from "@/components/dashboard/PostCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Library,
  Search,
  CheckCircle2,
  CalendarClock,
  AlertTriangle,
  Eye,
  FileEdit,
  Clock,
  Sparkles,
  ArrowRight,
  Camera,
  Briefcase,
  MessageSquare,
  Video,
  Globe,
  Share2,
  Layers,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

interface ContentBoardClientProps {
  initialPosts: PostProps[];
  workspaceName: string;
}

type StatusTab =
  | "ALL"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "SCHEDULED"
  | "PUBLISHED"
  | "FAILED"
  | "REJECTED";

// APPROVED is a legacy status (approve now schedules directly) — group it
// with Needs Review so those posts can still be approved or rejected.
function tabOf(status: string): StatusTab {
  if (status === "APPROVED") return "PENDING_APPROVAL";
  return (status as StatusTab) || "DRAFT";
}

export function ContentBoardClient({
  initialPosts,
  workspaceName,
}: ContentBoardClientProps) {
  const [activeTab, setActiveTab] = useState<StatusTab>("ALL");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const platforms: { id: string; label: string; icon: LucideIcon }[] = [
    { id: "ALL", label: "All", icon: Layers },
    { id: "LinkedIn", label: "LinkedIn", icon: Briefcase },
    { id: "Instagram", label: "Instagram", icon: Camera },
    { id: "TikTok", label: "TikTok", icon: Video },
    { id: "X", label: "X", icon: MessageSquare },
    { id: "YouTube", label: "YouTube", icon: Globe },
    { id: "Facebook", label: "Facebook", icon: Share2 },
    { id: "Pinterest", label: "Pinterest", icon: Globe },
  ];

  const tabs: { id: StatusTab; label: string; icon: LucideIcon }[] = [
    { id: "ALL", label: "All", icon: Library },
    { id: "PENDING_APPROVAL", label: "Needs Review", icon: Clock },
    { id: "DRAFT", label: "Drafts", icon: FileEdit },
    { id: "SCHEDULED", label: "Scheduled", icon: CalendarClock },
    { id: "PUBLISHED", label: "Published", icon: CheckCircle2 },
    { id: "FAILED", label: "Failed", icon: AlertTriangle },
    { id: "REJECTED", label: "Rejected", icon: Eye },
  ];

  // Per-tab counts (APPROVED folds into Needs Review)
  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      ALL: initialPosts.length,
      DRAFT: 0,
      PENDING_APPROVAL: 0,
      SCHEDULED: 0,
      PUBLISHED: 0,
      FAILED: 0,
      REJECTED: 0,
    };
    for (const p of initialPosts) c[tabOf(p.status)]++;
    return c;
  }, [initialPosts]);

  // Search + platform + tab filtering
  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialPosts.filter((post) => {
      const matchTab = activeTab === "ALL" || tabOf(post.status) === activeTab;
      const matchPlatform =
        selectedPlatform === "ALL" ||
        post.platform.toLowerCase().includes(selectedPlatform.toLowerCase());
      const haystack = `${post.content || ""} ${
        post.campaignTopic || ""
      } ${post.platform}`.toLowerCase();
      const matchSearch = !q || haystack.includes(q);
      return matchTab && matchPlatform && matchSearch;
    });
  }, [initialPosts, activeTab, selectedPlatform, search]);

  const emptyState = useMemo(() => {
    switch (activeTab) {
      case "PENDING_APPROVAL":
        return {
          title: "Nothing needs your review",
          body: "Posts created by the AI CEO (campaign mode) land here for your approval. Everything you create yourself in the Studio goes straight to Drafts or Scheduled.",
        };
      case "DRAFT":
        return {
          title: "No drafts saved yet",
          body: "Use “Save Draft” in AI Studio or ask the AI CEO to write something for you — your saved work will appear here.",
        };
      case "SCHEDULED":
        return {
          title: "No posts scheduled",
          body: "Approve a Needs Review post or use “Schedule” in AI Studio — posts publish automatically at their peak engagement time.",
        };
      case "PUBLISHED":
        return {
          title: "No published history yet",
          body: "Once your posts go live, they stay listed here for 30 days with links to the live content.",
        };
      case "FAILED":
        return {
          title: "No failed publishes",
          body: "If a publish attempt fails (e.g. disconnected account), the post appears here with its error and a retry button.",
        };
      case "REJECTED":
        return {
          title: "No rejected posts",
          body: "When you reject AI CEO content with a reason, it is kept here and the feedback is sent to your CEO chat.",
        };
      default:
        return {
          title: "Your library is empty",
          body: "Generate content in AI Studio or ask the AI CEO for a campaign — everything you save, schedule or publish lives here.",
        };
    }
  }, [activeTab]);

  const statCards = [
    {
      tab: "PENDING_APPROVAL" as StatusTab,
      label: "Needs Review",
      count: counts.PENDING_APPROVAL,
      icon: Clock,
      tileClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      activeClass: "border-amber-500 bg-amber-500/10 shadow-sm",
      hoverClass: "hover:border-amber-400",
    },
    {
      tab: "SCHEDULED" as StatusTab,
      label: "Scheduled",
      count: counts.SCHEDULED,
      icon: CalendarClock,
      tileClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      activeClass: "border-blue-500 bg-blue-500/10 shadow-sm",
      hoverClass: "hover:border-blue-400",
    },
    {
      tab: "PUBLISHED" as StatusTab,
      label: "Published",
      count: counts.PUBLISHED,
      icon: CheckCircle2,
      tileClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
      activeClass: "border-violet-500 bg-violet-500/10 shadow-sm",
      hoverClass: "hover:border-violet-400",
    },
    {
      tab: "FAILED" as StatusTab,
      label: "Failed",
      count: counts.FAILED,
      icon: AlertTriangle,
      tileClass: "bg-red-500/15 text-red-600 dark:text-red-400",
      activeClass: "border-red-500 bg-red-500/10 shadow-sm",
      hoverClass: "hover:border-red-400",
    },
  ];

  return (
    <div className="flex flex-col space-y-4 w-full font-sans">
      {/* HEADER CARD — AI Studio style */}
      <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center shrink-0">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Content Library
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Everything for{" "}
                <strong className="text-slate-800 dark:text-slate-200 font-bold">
                  {workspaceName}
                </strong>{" "}
                — drafts, reviews, schedule &amp; publish history.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link href="/dashboard/ai-studio">
              <Button
                variant="outline"
                className="h-9 px-4 text-xs font-bold gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Open AI Studio</span>
              </Button>
            </Link>
            <Link href="/dashboard/chat">
              <Button className="h-9 px-4 text-xs font-bold gap-1.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Ask AI CEO</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((sc) => {
          const Icon = sc.icon;
          const active = activeTab === sc.tab;
          return (
            <Card
              key={sc.tab}
              onClick={() => setActiveTab(active ? "ALL" : sc.tab)}
              className={`cursor-pointer transition-all border rounded-xl ${
                active
                  ? sc.activeClass
                  : `border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${sc.hoverClass}`
              }`}
            >
              <CardContent className="p-3.5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                    {sc.label}
                  </p>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                    {sc.count}
                  </p>
                </div>
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${sc.tileClass}`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* TABS + SEARCH + PLATFORM FILTER */}
      <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardContent className="p-3 flex flex-col gap-3">
          {/* STATUS TAB PILLS */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              const count = counts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    active
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-900/60"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  <span
                    className={`ml-0.5 px-1.5 py-px rounded-full text-[10px] font-extrabold ${
                      active
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "bg-slate-300/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* SEARCH */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search captions, campaigns, platforms..."
                className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-xs font-semibold shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* PLATFORM PILLS */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {platforms.map((pl) => {
                const Icon = pl.icon;
                const isSelected = selectedPlatform === pl.id;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setSelectedPlatform(pl.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                      isSelected
                        ? "bg-primary text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-primary border border-transparent hover:border-primary"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{pl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* POSTS GRID OR EMPTY STATE */}
      {filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-12 rounded-2xl border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 w-full shadow-xs">
          <div className="flex flex-col items-center justify-center max-w-lg mx-auto space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-xs">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {emptyState.title}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
              {emptyState.body}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <Link href="/dashboard/ai-studio">
                <Button className="h-10 px-6 font-bold bg-primary text-white gap-2 rounded-xl shadow-xs hover:opacity-95">
                  <span>Create in AI Studio</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dashboard/chat">
                <Button
                  variant="outline"
                  className="h-10 px-6 font-bold gap-2 rounded-xl"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Ask AI CEO for a Campaign</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
