"use client";

import React, { useState } from "react";
import { PostProps, PostCard } from "@/components/dashboard/PostCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Layers,
  Filter,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  ArrowRight,
  Camera,
  Briefcase,
  MessageSquare,
  Video,
  Globe,
  Share2,
} from "lucide-react";
import Link from "next/link";

interface ContentBoardClientProps {
  initialPosts: PostProps[];
  workspaceName: string;
}

export function ContentBoardClient({
  initialPosts,
  workspaceName,
}: ContentBoardClientProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const platforms = [
    { id: "ALL", label: "All Platforms", icon: Share2 },
    { id: "LinkedIn", label: "LinkedIn", icon: Briefcase },
    { id: "Instagram", label: "Instagram Reels", icon: Camera },
    { id: "TikTok", label: "TikTok", icon: Video },
    { id: "X", label: "X (Twitter)", icon: MessageSquare },
    { id: "YouTube", label: "YouTube Shorts", icon: Globe },
    { id: "Facebook", label: "Facebook Feed", icon: Share2 },
  ];

  const statuses = [
    { id: "ALL", label: "All Statuses" },
    { id: "DRAFT", label: "Saved Drafts" },
    { id: "SCHEDULED", label: "Scheduled (AI Peak Time)" },
    { id: "PENDING_APPROVAL", label: "Pending Review" },
    { id: "APPROVED", label: "Approved • Scheduled" },
    { id: "PUBLISHED", label: "Published" },
    { id: "REJECTED", label: "Rejected" },
  ];

  // Calculate counts for badges
  const countPending = initialPosts.filter(
    (p) => p.status === "PENDING_APPROVAL"
  ).length;
  const countApproved = initialPosts.filter(
    (p) => p.status === "APPROVED"
  ).length;
  const countPublished = initialPosts.filter(
    (p) => p.status === "PUBLISHED"
  ).length;

  // Filter posts
  const filteredPosts = initialPosts.filter((post) => {
    const matchPlatform =
      selectedPlatform === "ALL" ||
      post.platform.toLowerCase().includes(selectedPlatform.toLowerCase());
    const matchStatus =
      selectedStatus === "ALL" || post.status === selectedStatus;
    return matchPlatform && matchStatus;
  });

  return (
    <div className="flex flex-col space-y-6 w-full font-sans">
      {/* TOP HEADER & STATS BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Content Approval &amp; Peak Release Board
            </h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 font-bold text-xs">
              Brand DNA Grounded
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review, edit, and approve AI-generated campaigns for{" "}
            <strong className="text-slate-800 dark:text-slate-200 font-bold">
              {workspaceName}
            </strong>
            . Each draft is locked to its scientific peak engagement hour.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/dashboard/chat">
            <Button className="h-9 px-4 text-xs font-bold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm hover:opacity-95">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Ask AI CEO for New Campaign</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* EXECUTIVE SUMMARY COUNTER CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          onClick={() => setSelectedStatus("PENDING_APPROVAL")}
          className={`cursor-pointer transition-all border ${
            selectedStatus === "PENDING_APPROVAL"
              ? "border-amber-500 bg-amber-500/10 shadow-sm"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-400"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Pending Review
              </p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                {countPending}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setSelectedStatus("APPROVED")}
          className={`cursor-pointer transition-all border ${
            selectedStatus === "APPROVED"
              ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Approved • Scheduled
              </p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                {countApproved}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setSelectedStatus("PUBLISHED")}
          className={`cursor-pointer transition-all border ${
            selectedStatus === "PUBLISHED"
              ? "border-blue-500 bg-blue-500/10 shadow-sm"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Published Live
              </p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                {countPublished}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Send className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTER BAR: PLATFORMS & STATUSES */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
        {/* PLATFORMS PILLS */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
            Platforms:
          </span>
          {platforms.map((pl) => {
            const Icon = pl.icon;
            const isSelected = selectedPlatform === pl.id;

            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => setSelectedPlatform(pl.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isSelected
                    ? "bg-primary text-white shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{pl.label}</span>
              </button>
            );
          })}
        </div>

        {/* STATUS SELECTOR */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Status:
          </span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 rounded-lg border border-input bg-white dark:bg-slate-900 px-3 text-xs font-bold shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-primary"
          >
            {statuses.map((st) => (
              <option key={st.id} value={st.id}>
                {st.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* POSTS GRID OR EMPTY STATE */}
      {filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-16 rounded-2xl border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 w-full shadow-xs">
          <div className="flex flex-col items-center justify-center max-w-lg mx-auto space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-xs">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              No Campaign Drafts Found in this View
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
              When your Autonomous CEO Agent executes a Review Mode campaign or
              when you create custom content, your platform-specific drafts will
              appear here ready for 1-click approval.
            </p>
            <div className="pt-2">
              <Link href="/dashboard/chat">
                <Button className="h-11 px-7 font-bold bg-primary text-white gap-2 rounded-xl shadow-sm hover:opacity-95">
                  <span>Trigger Autonomous CEO Schedule</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
