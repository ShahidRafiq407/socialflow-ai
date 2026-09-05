"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Dna,
  Sparkles,
  CheckCircle2,
  BarChart2,
  ArrowRight,
  ArrowLeft,
  Lightbulb,
  Check,
} from "lucide-react";

export const GUIDE_STEPS = [
  {
    icon: Share2,
    badge: "Channels",
    title: "Connect your social accounts",
    desc: "Link Instagram, LinkedIn, Facebook, and YouTube in one click. Securely authenticated and ready for scheduled publishing.",
    tip: "Connect at least one channel to enable automated publishing and live metrics.",
    actionLabel: "Connect Channels",
    href: "/dashboard/integrations",
    accentBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    icon: Dna,
    badge: "Brand DNA",
    title: "Define your brand voice",
    desc: "Set your company's tone, audience profile, and key messaging pillars. AI content automatically aligns with your guidelines.",
    tip: "Your brand settings shape every generated post, article, and caption.",
    actionLabel: "Set Brand Voice",
    href: "/dashboard/brand",
    accentBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    icon: Sparkles,
    badge: "AI Studio",
    title: "Draft campaigns with AI",
    desc: "Turn ideas, product launches, or trending news into multi-channel posts, SEO articles, and media assets in seconds.",
    tip: "Use the Quick Create bar on your dashboard for instantaneous drafts.",
    actionLabel: "Open AI Studio",
    href: "/dashboard/ai-studio",
    accentBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    icon: CheckCircle2,
    badge: "Queue",
    title: "Review & schedule content",
    desc: "Inspect upcoming posts on your weekly runway. Approve drafts, customize publishing times, or enable Autopilot.",
    tip: "Posts awaiting review will never go live until you explicitly approve them.",
    actionLabel: "View Content Queue",
    href: "/dashboard/content",
    accentBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: BarChart2,
    badge: "Growth",
    title: "Track clicks & verified leads",
    desc: "Monitor tracked clicks, verified lead conversions, and channel performance in real time without vanity metrics.",
    tip: "Set a milestone in the Goals tab to track conversion pace and runway.",
    actionLabel: "Explore Analytics",
    href: "/dashboard/analytics",
    accentBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
] as const;

export function QuickGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);

  // Reset to first step whenever reopened
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    }
  }, [open]);

  const step = GUIDE_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === GUIDE_STEPS.length - 1;

  const handleComplete = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("postloom_guide_completed", "true");
      } catch {}
    }
    onOpenChange(false);
  };

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, GUIDE_STEPS.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          handleComplete();
        } else {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent className="w-[92vw] max-w-md p-5 sm:p-6 rounded-2xl shadow-xl border bg-card">
        <DialogHeader className="space-y-1 text-left pb-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Step {currentStep + 1} of {GUIDE_STEPS.length}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Quick Guide
            </span>
          </div>
          <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight text-foreground pt-1">
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Follow this 5-step walkthrough to get the most out of your workspace.
          </DialogDescription>
        </DialogHeader>

        {/* Step Progress Segments */}
        <div className="flex items-center gap-1.5 py-2">
          {GUIDE_STEPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentStep(idx)}
              aria-label={`Jump to step ${idx + 1}`}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                idx === currentStep
                  ? "bg-primary ring-2 ring-primary/20"
                  : idx < currentStep
                  ? "bg-primary/50"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Active Step Content Card */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${step.accentBg}`}
            >
              <step.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {step.badge}
              </span>
              <p className="text-xs font-medium text-foreground leading-snug">
                {step.desc}
              </p>
            </div>
          </div>

          {/* Pro tip */}
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5 text-[11px] text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
            <span className="leading-relaxed">{step.tip}</span>
          </div>

          {/* Action Link */}
          <Link
            href={step.href}
            onClick={handleComplete}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-0.5"
          >
            <span>{step.actionLabel}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={isFirst}
            className="text-xs h-8 px-2.5 text-muted-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleComplete}
              className="text-xs h-8 px-3"
            >
              Skip
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="text-xs h-8 px-3.5 gap-1.5 font-medium shadow-xs"
            >
              {isLast ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
