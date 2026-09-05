"use client";

/**
 * A LOCK, ITS REASON, AND WHERE THE REASON LEADS
 *
 * Three ways to refuse a control, and which one to use is a layout decision, not a
 * policy decision — the policy is already in the snapshot:
 *
 *   FeatureGate   wraps any control. Dims it, takes it out of the tab order, marks
 *                 it with a lock, and puts the reason on hover and on focus.
 *   LockBadge     the sidebar's lock. Icon only, same reason on hover.
 *   FeatureNotice a sentence in the page, for where a whole panel is unavailable.
 *
 * The tooltip is hand-rolled CSS rather than a library because this project has no
 * tooltip primitive and one lock does not justify a new dependency. It opens on
 * hover AND on focus, which is the part a `title` attribute cannot do: a keyboard
 * user tabbing through a locked control gets the same sentence a mouse user gets.
 *
 * No copy is written here. Every sentence rendered below came from
 * `buildAccess`, which composed it on the server with the admin's live plan names
 * and prices — so a renamed plan renames itself in every lock in the product.
 */

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { useFeatures } from "./AccessProvider";
import type { FeatureAccess } from "@/lib/billing/access";
import type { FeatureKey } from "@/lib/billing/plans";

/**
 * Where the fix is.
 *
 * A plan refusal carries the plan to pre-select, so billing opens on the card that
 * lifts it rather than on a grid the customer has to re-read. A spent allowance
 * that no plan raises has nowhere better to go than the plans themselves, and a
 * credits refusal goes to the top-up packs.
 */
export function upgradeHref(access: FeatureAccess): string {
  if (access.blocker === "credits") return "/dashboard/billing?tab=credits";
  if (access.requiredPlan) return `/dashboard/billing?plan=${access.requiredPlan}`;
  return "/dashboard/billing";
}

/** The word on the button, matched to which of the three refusals this is. */
export function upgradeLabel(access: FeatureAccess): string {
  if (access.blocker === "credits") return "Top up credits";
  if (access.requiredPlanName) return `Upgrade to ${access.requiredPlanName}`;
  if (access.blocker === "cap") return "See your usage";
  return "See plans";
}

/**
 * The bubble. Rendered next to whatever it explains, shown by the parent's hover
 * or focus, and never in the layout's way — it is absolutely positioned and
 * `pointer-events-none`, so it cannot swallow the click it is describing.
 */
export function LockTip({ reason, side = "top" }: { reason: string; side?: "top" | "bottom" | "right" }) {
  const place =
    side === "bottom"
      ? "top-full mt-2 left-1/2 -translate-x-1/2"
      : side === "right"
        ? "left-full ml-2 top-1/2 -translate-y-1/2"
        : "bottom-full mb-2 left-1/2 -translate-x-1/2";
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 w-60 rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] font-medium leading-snug text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/lock:opacity-100 group-focus-within/lock:opacity-100 ${place}`}
    >
      {reason}
    </span>
  );
}

export interface FeatureGateProps {
  /** One key, or several when a control needs all of them. */
  feature: FeatureKey | FeatureKey[];
  children: React.ReactNode;
  /** Where the bubble opens. Defaults to above. */
  side?: "top" | "bottom" | "right";
  /** `block` for a control that fills its row, `inline-flex` otherwise. */
  display?: "inline" | "block";
  className?: string;
  /** Set when the lock should not also link to billing — a locked page body, say. */
  linkless?: boolean;
}

/**
 * Any control, refused honestly.
 *
 * When the feature is available this renders exactly its children and adds nothing
 * — no wrapper class, no extra span in the layout — so putting a gate around a
 * button cannot change how that button looks for the customers who own it.
 *
 * When it is not, three things happen together, and all three are needed:
 *   `inert` takes the child out of the tab order and out of reach of the mouse, so
 *     a locked control cannot be pressed by any route, including a screen reader's;
 *   the overlay is a real link, so hovering it shows the reason and clicking it
 *     goes to the one page that fixes the problem;
 *   the child stays visible, dimmed. A hidden feature teaches nobody what the next
 *     plan is for.
 */
export function FeatureGate({
  feature,
  children,
  side = "top",
  display = "inline",
  className = "",
  linkless = false,
}: FeatureGateProps) {
  const keys = Array.isArray(feature) ? feature : [feature];
  const access = useFeatures(keys);
  if (access.allowed) return <>{children}</>;

  const wrap = display === "block" ? "flex w-full" : "inline-flex";
  const reason = access.reason ?? `${access.label} is not available on your plan.`;

  return (
    <span className={`group/lock relative ${wrap} ${className}`}>
      <span inert className={`${wrap} opacity-45 grayscale`}>
        {children}
      </span>
      {linkless ? (
        <span
          tabIndex={0}
          role="note"
          aria-label={reason}
          className="absolute inset-0 z-10 cursor-not-allowed rounded-[inherit]"
        />
      ) : (
        <Link
          href={upgradeHref(access)}
          aria-label={`${reason} ${upgradeLabel(access)}.`}
          className="absolute inset-0 z-10 rounded-[inherit]"
        />
      )}
      <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background shadow-sm">
        <Lock className="h-2.5 w-2.5 text-muted-foreground" />
      </span>
      <LockTip reason={reason} side={side} />
    </span>
  );
}

/**
 * The sidebar's lock, and anywhere else a row is still clickable but not usable.
 *
 * Icon plus the reason, and nothing else — no link of its own. That is deliberate:
 * putting a second interactive element inside a nav link is invalid HTML and gives
 * a keyboard user two stops for one row, so the badge relies on its parent for
 * both. **The parent must carry `group/lock relative`**, which is also what makes
 * the tooltip appear when the row is focused rather than only when it is hovered.
 *
 * A locked tab stays navigable on purpose. A nav item that does nothing when
 * pressed reads as a bug; the page behind it renders its own locked state, which is
 * where a customer can actually see what the feature does and what it costs.
 */
export function LockBadge({
  feature,
  side = "right",
  className = "",
}: {
  feature: FeatureKey | FeatureKey[];
  side?: "top" | "bottom" | "right";
  className?: string;
}) {
  const keys = Array.isArray(feature) ? feature : [feature];
  const access = useFeatures(keys);
  if (access.allowed) return null;
  const reason = access.reason ?? `${access.label} is not available on your plan.`;
  return (
    <>
      <Lock
        aria-hidden
        className={`h-3 w-3 shrink-0 text-muted-foreground ${className}`}
      />
      <span className="sr-only">Locked. {reason}</span>
      <LockTip reason={reason} side={side} />
    </>
  );
}

/**
 * The reason as a sentence in the page, with the fix next to it.
 *
 * For a panel that cannot be dimmed into something meaningful — an empty analytics
 * chart, a tab body with nothing in it. Renders nothing at all when the feature is
 * available, so it is safe to leave in place above a working panel.
 */
export function FeatureNotice({
  feature,
  className = "",
}: {
  feature: FeatureKey | FeatureKey[];
  className?: string;
}) {
  const keys = Array.isArray(feature) ? feature : [feature];
  const access = useFeatures(keys);
  if (access.allowed) return null;
  const reason = access.reason ?? `${access.label} is not available on your plan.`;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 ${className}`}
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-muted-foreground">
        {reason}
      </p>
      <Link
        href={upgradeHref(access)}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"
      >
        {upgradeLabel(access)}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
