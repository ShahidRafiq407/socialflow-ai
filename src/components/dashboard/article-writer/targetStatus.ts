/**
 * PUBLISH TARGET STATUS — the vocabulary both screens share
 *
 * Connecting a site happens in the Plugins tab; the Article Writer only reports
 * whether a destination is there and healthy. Both screens describe the same
 * row, so the wording and the colours live here rather than being written twice
 * and drifting apart.
 */

import type { CmsTargetSummary } from "./types";

export function statusTone(status: string): string {
  if (status === "connected") return "bg-primary/10 text-primary border-primary/30";
  if (status === "error") return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

/** A dot, for places too tight for a badge. */
export function statusDot(status: string): string {
  if (status === "connected") return "bg-primary";
  if (status === "error") return "bg-destructive";
  return "bg-muted-foreground";
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never checked";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never checked";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "checked just now";
  if (minutes < 60) return `checked ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `checked ${hours}h ago`;
  return `checked ${Math.round(hours / 24)}d ago`;
}

/**
 * One line for the card header. Counts are counted, not estimated — a target
 * whose last verification failed is reported as needing attention rather than
 * being folded into the connected total.
 */
export function describeTargets(targets: CmsTargetSummary[]): string {
  if (targets.length === 0) return "no destination connected";
  const connected = targets.filter((t) => t.status === "connected").length;
  const failing = targets.filter((t) => t.status === "error").length;
  const parts: string[] = [];
  if (connected > 0) parts.push(`${connected} connected`);
  if (failing > 0) parts.push(`${failing} needs attention`);
  const other = targets.length - connected - failing;
  if (other > 0) parts.push(`${other} unverified`);
  return parts.join(" · ");
}
