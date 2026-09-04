"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Dna,
  Sparkles,
  CheckCircle2,
  BarChart2,
  ArrowRight,
} from "lucide-react";

const GUIDE_STEPS = [
  {
    icon: Share2,
    title: "Connect channels",
    desc: "Link Instagram, LinkedIn, Facebook and more.",
    href: "/dashboard/integrations",
  },
  {
    icon: Dna,
    title: "Set your brand",
    desc: "Tone and voice used by every AI generation.",
    href: "/dashboard/brand",
  },
  {
    icon: Sparkles,
    title: "Create with AI",
    desc: "Posts, articles and campaigns in seconds.",
    href: "/dashboard/ai-studio",
  },
  {
    icon: CheckCircle2,
    title: "Review & schedule",
    desc: "Approve the queue — posts publish on time.",
    href: "/dashboard/content",
  },
  {
    icon: BarChart2,
    title: "Track growth",
    desc: "Reach, audience and lead goal progress.",
    href: "/dashboard/analytics",
  },
] as const;

export function QuickGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick guide</DialogTitle>
          <DialogDescription>
            Five steps from signup to publishing.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-0.5">
          {GUIDE_STEPS.map((step, i) => (
            <li key={step.href}>
              <Link
                href={step.href}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <step.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {i + 1}. {step.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {step.desc}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
