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
  Sparkles,
  Zap,
  Target,
  Calendar,
  Clock,
  Compass,
  ArrowRight,
  ArrowLeft,
  Lightbulb,
  Check,
  Eye,
} from "lucide-react";

export const GUIDE_STEPS = [
  {
    elementId: "quick-create",
    icon: Sparkles,
    badge: "Quick Create",
    title: "1. Quick Create Hub",
    headline: "Yahan aap kya kar sakte ho:",
    desc: "Draft multi-platform posts and campaign concepts in seconds. Type any topic, product launch, or prompt — AI Studio generates tailored copy and visuals instantly.",
    tip: "Press Enter inside the box to immediately launch AI Studio with this topic.",
    actionLabel: "Focus Quick Create",
    href: "#quick-create",
    accentBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    elementId: "plan-status",
    icon: Zap,
    badge: "Credits & Quota",
    title: "2. Plan & Credit Status",
    headline: "Yahan aap kya kar sakte ho:",
    desc: "Monitor your monthly AI points balance, active billing cycle, and connected social channels. Hover or tap any stat card to inspect detailed credit limits.",
    tip: "Free credits refresh every month. Upgrade to Pro for unlimited generation.",
    actionLabel: "Manage Subscription",
    href: "/dashboard/billing",
    accentBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    elementId: "kpi-cards",
    icon: Target,
    badge: "Growth KPIs",
    title: "3. Measured Growth Metrics",
    headline: "Yahan aap kya kar sakte ho:",
    desc: "Track real verified clicks on your links, confirmed leads captured by your website tags, and 30-day publishing volume. Pure signal without vanity numbers.",
    tip: "Hover cursor on PC (or tap on mobile) over any KPI card to see its exact measurement rationale.",
    actionLabel: "Set Lead Target",
    href: "/dashboard/goals",
    accentBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    elementId: "weekly-runway",
    icon: Calendar,
    badge: "7-Day Runway",
    title: "4. Weekly Content Runway",
    headline: "Yahan aap kya kar sakte ho:",
    desc: "A 7-day rolling visual schedule showing what posts are queued and when they will go live. On mobile, swipe horizontally to inspect every day of the week.",
    tip: "Click '+ Slot' on any day to immediately draft and schedule content for that date.",
    actionLabel: "Open Content Library",
    href: "/dashboard/content",
    accentBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    elementId: "queue",
    icon: Clock,
    badge: "Publishing Queue",
    title: "5. Content Queue & Approval",
    headline: "Yahan aap kya kar sakte ho:",
    desc: "Inspect upcoming scheduled posts and approve AI-generated drafts waiting in 'Needs Review'. Approved posts publish automatically at their exact scheduled time.",
    tip: "Posts awaiting review will never go live until you click 'Approve'.",
    actionLabel: "Review Queue",
    href: "#queue",
    accentBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    elementId: "radar-trends",
    icon: Compass,
    badge: "AI Radar & Trends",
    title: "6. Optimal Times & Breaking Trends",
    headline: "Yahan aap kya kar sakte ho:",
    desc: "Discover your audience's peak engagement hours per channel and scan real-time breaking industry news. Click 'Draft Post' on any trend to write about it instantly.",
    tip: "Click 'Schedule' on any optimal posting box to auto-fill the highest-converting time slot.",
    actionLabel: "Open AI Studio",
    href: "/dashboard/ai-studio",
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

  // Smoothly scroll to and highlight the section on the dashboard behind the dialog
  const scrollToSection = (idx: number) => {
    const stepObj = GUIDE_STEPS[idx];
    if (!stepObj?.elementId || typeof document === "undefined") return;

    try {
      const el = document.getElementById(stepObj.elementId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2", "transition-all");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
        }, 2200);
      }
    } catch {}
  };

  const handleStepChange = (newIdx: number) => {
    setCurrentStep(newIdx);
    scrollToSection(newIdx);
  };

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
      const nextIdx = Math.min(currentStep + 1, GUIDE_STEPS.length - 1);
      handleStepChange(nextIdx);
    }
  };

  const handlePrev = () => {
    const prevIdx = Math.max(currentStep - 1, 0);
    handleStepChange(prevIdx);
  };

  const handleActionClick = (href: string) => {
    if (href.startsWith("#")) {
      handleComplete();
      const el = document.getElementById(href.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = el.querySelector("input");
        if (input) input.focus();
      }
    } else {
      handleComplete();
    }
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
        <DialogHeader className="space-y-1 text-left pb-1">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Section {currentStep + 1} of {GUIDE_STEPS.length}
            </span>
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Dashboard Guide
            </span>
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground pt-1">
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {step.headline}
          </DialogDescription>
        </DialogHeader>

        {/* Step Progress Segments */}
        <div className="flex items-center gap-1.5 py-1.5">
          {GUIDE_STEPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleStepChange(idx)}
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
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${step.accentBg}`}
            >
              <step.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {step.badge}
              </span>
              <p className="text-xs font-medium text-foreground leading-relaxed mt-0.5">
                {step.desc}
              </p>
            </div>
          </div>

          {/* Pro tip */}
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5 text-[11px] text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
            <span className="leading-relaxed">{step.tip}</span>
          </div>

          {/* Action Link / Button */}
          {step.href.startsWith("#") ? (
            <button
              type="button"
              onClick={() => handleActionClick(step.href)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-0.5"
            >
              <span>{step.actionLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Link
              href={step.href}
              onClick={() => handleActionClick(step.href)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-0.5"
            >
              <span>{step.actionLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
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

