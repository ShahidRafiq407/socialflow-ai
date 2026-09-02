"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  getAttribution,
  getGrowthMetrics,
  getLeadEvents,
  getPublishHistory,
  getTrackingStatus,
  COUNTED_LEAD_STATUSES,
  EMPTY_METRICS,
} from "@/lib/growth/metrics";
import {
  LeadChannel,
  LeadEventItem,
  PublishHistoryItem,
  TrackingStatus,
} from "@/lib/types/growth";
import { buildTagSnippet, ensureTrackingKey } from "@/lib/growth/ctaLinks";

/**
 * Leads, history and website-tag actions for Lead Goal HQ.
 *
 * Two rules hold everywhere in this file:
 *   1. Every number is counted from a row — LinkClick for clicks, LeadEvent for
 *      leads, PublishLog for what actually went out. Nothing is estimated.
 *   2. This is a `"use server"` module, so every export below is a public HTTP
 *      endpoint that receives `workspaceId` from the browser. Each one therefore
 *      proves the signed-in user owns that workspace before touching a row.
 *      Unlike `@/actions/goals`, nothing here is called by the cron, so a real
 *      Clerk session is always required.
 */

const VALID_STATUSES = ["NEW", "CONFIRMED", "QUALIFIED", "WON", "LOST"];

const NOT_YOURS = "You do not have access to this workspace.";

const EMPTY_TRACKING: TrackingStatus = {
  installed: false,
  trackingKey: null,
  domain: null,
  verifiedAt: null,
  snippet: "",
  leadsCaptured: 0,
  stale: false,
};

/** True when the signed-in user owns `workspaceId`. */
async function ownsWorkspace(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;

  const { userId } = await auth().catch(() => ({ userId: null }) as any);
  if (!userId) return false;

  const owned = await prisma.workspace
    .findFirst({ where: { id: workspaceId, userId }, select: { id: true } })
    .catch(() => null);

  return Boolean(owned);
}

function normalizeDomain(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

// ============================================================================
// LEADS — CRUD
// ============================================================================

export interface LogLeadInput {
  /** History row this lead came from — attribution lives here. */
  publishLogId?: string | null;
  postId?: string | null;
  trackedLinkId?: string | null;
  platform?: string | null;
  channel?: LeadChannel;
  leadType?: string;
  contactName?: string | null;
  contactInfo?: string | null;
  value?: number | null;
  note?: string | null;
  status?: string;
  occurredAt?: string | Date | null;
  action?: string | null;
}

/**
 * The "Lead aaya" button. A lead is only ever created by an explicit human
 * confirmation or by the website tag — never inferred from a click.
 */
export async function logLead(
  workspaceId: string,
  input: LogLeadInput
): Promise<{ success: boolean; lead?: LeadEventItem; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    let postId = input.postId || null;
    let trackedLinkId = input.trackedLinkId || null;
    let platform = input.platform || null;
    let channel: LeadChannel = input.channel || "SOCIAL";

    // Resolve attribution from the history row when the UI passes one
    if (input.publishLogId) {
      const log = await (prisma as any).publishLog
        .findFirst({ where: { id: input.publishLogId, workspaceId } })
        .catch(() => null);
      if (log) {
        postId = postId || log.postId || null;
        trackedLinkId = trackedLinkId || log.trackedLinkId || null;
        platform = platform || log.platform || null;
        channel = (log.channel as LeadChannel) || channel;
      }
    }

    const status = VALID_STATUSES.includes(String(input.status)) ? String(input.status) : "CONFIRMED";
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    const row = await (prisma as any).leadEvent.create({
      data: {
        workspaceId,
        trackedLinkId,
        postId,
        platform,
        source: "MANUAL",
        channel,
        action: input.action || null,
        leadType: input.leadType || "QUALIFIED_LEADS",
        contactName: input.contactName?.trim() || null,
        contactInfo: input.contactInfo?.trim() || null,
        value: input.value != null && !isNaN(Number(input.value)) ? Number(input.value) : null,
        note: input.note?.trim() || null,
        status,
        occurredAt: isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      },
    });

    // Keep the link's denormalised counter honest
    if (trackedLinkId && COUNTED_LEAD_STATUSES.includes(status)) {
      await (prisma as any).trackedLink
        .update({ where: { id: trackedLinkId }, data: { leadCount: { increment: 1 } } })
        .catch(() => null);
    }

    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/analytics");

    return {
      success: true,
      lead: {
        id: row.id,
        source: row.source,
        channel: row.channel,
        platform: row.platform,
        action: row.action,
        leadType: row.leadType,
        contactName: row.contactName,
        contactInfo: row.contactInfo,
        value: row.value,
        note: row.note,
        status: row.status,
        occurredAt: new Date(row.occurredAt).toISOString(),
        postId: row.postId,
      },
    };
  } catch (error: any) {
    console.error("[logLead] error:", error);
    return { success: false, error: error?.message || "Failed to save the lead." };
  }
}

export async function updateLead(
  workspaceId: string,
  leadId: string,
  patch: {
    status?: string;
    contactName?: string | null;
    contactInfo?: string | null;
    value?: number | null;
    note?: string | null;
    leadType?: string;
    occurredAt?: string | Date | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const existing = await (prisma as any).leadEvent.findFirst({ where: { id: leadId, workspaceId } });
    if (!existing) return { success: false, error: "Lead not found." };

    if (patch.status && !VALID_STATUSES.includes(patch.status)) {
      return { success: false, error: `Status must be one of ${VALID_STATUSES.join(", ")}.` };
    }

    const data: any = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.contactName !== undefined) data.contactName = patch.contactName?.trim() || null;
    if (patch.contactInfo !== undefined) data.contactInfo = patch.contactInfo?.trim() || null;
    if (patch.note !== undefined) data.note = patch.note?.trim() || null;
    if (patch.leadType !== undefined) data.leadType = patch.leadType;
    if (patch.value !== undefined)
      data.value = patch.value != null && !isNaN(Number(patch.value)) ? Number(patch.value) : null;
    if (patch.occurredAt) {
      const when = new Date(patch.occurredAt);
      if (!isNaN(when.getTime())) data.occurredAt = when;
    }

    await (prisma as any).leadEvent.update({ where: { id: leadId }, data });

    // A status change can move the lead in or out of the counted set
    if (patch.status && existing.trackedLinkId) {
      const wasCounted = COUNTED_LEAD_STATUSES.includes(existing.status);
      const isCounted = COUNTED_LEAD_STATUSES.includes(patch.status);
      if (wasCounted !== isCounted) {
        await (prisma as any).trackedLink
          .update({
            where: { id: existing.trackedLinkId },
            data: { leadCount: isCounted ? { increment: 1 } : { decrement: 1 } },
          })
          .catch(() => null);
      }
    }

    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to update the lead." };
  }
}

/** Delete counterpart of "Lead aaya" — returns the row so the UI can offer Undo. */
export async function deleteLead(
  workspaceId: string,
  leadId: string
): Promise<{ success: boolean; deleted?: LogLeadInput & { leadType?: string }; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const existing = await (prisma as any).leadEvent.findFirst({ where: { id: leadId, workspaceId } });
    if (!existing) return { success: false, error: "Lead not found." };

    await (prisma as any).leadEvent.delete({ where: { id: leadId } });

    if (existing.trackedLinkId && COUNTED_LEAD_STATUSES.includes(existing.status)) {
      await (prisma as any).trackedLink
        .update({ where: { id: existing.trackedLinkId }, data: { leadCount: { decrement: 1 } } })
        .catch(() => null);
    }

    revalidatePath("/dashboard/goals");
    return {
      success: true,
      deleted: {
        postId: existing.postId,
        trackedLinkId: existing.trackedLinkId,
        platform: existing.platform,
        channel: existing.channel,
        leadType: existing.leadType,
        contactName: existing.contactName,
        contactInfo: existing.contactInfo,
        value: existing.value,
        note: existing.note,
        status: existing.status,
        occurredAt: existing.occurredAt,
        action: existing.action,
      },
    };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to delete the lead." };
  }
}

export async function listLeads(
  workspaceId: string,
  filters?: { channel?: LeadChannel | "ALL"; status?: string | "ALL"; limit?: number }
): Promise<LeadEventItem[]> {
  if (!(await ownsWorkspace(workspaceId))) return [];
  return getLeadEvents(workspaceId, filters || {});
}

export async function getLeadsOverview(workspaceId: string): Promise<{
  leads: LeadEventItem[];
  attribution: Awaited<ReturnType<typeof getAttribution>>;
  metrics: Awaited<ReturnType<typeof getGrowthMetrics>>;
}> {
  if (!(await ownsWorkspace(workspaceId))) {
    return {
      leads: [],
      attribution: { byPlatform: [], byPillar: [], byChannel: [] },
      metrics: EMPTY_METRICS,
    };
  }

  const [leads, attribution, metrics] = await Promise.all([
    getLeadEvents(workspaceId, { limit: 100 }),
    getAttribution(workspaceId),
    getGrowthMetrics(workspaceId, null),
  ]);
  return { leads, attribution, metrics };
}

// ============================================================================
// HISTORY
// ============================================================================

export async function listPublishHistory(
  workspaceId: string,
  filters?: {
    channel?: LeadChannel | "ALL";
    platform?: string | "ALL";
    status?: "PUBLISHED" | "FAILED" | "ALL";
    from?: string | null;
    to?: string | null;
    limit?: number;
  }
): Promise<PublishHistoryItem[]> {
  if (!(await ownsWorkspace(workspaceId))) return [];
  return getPublishHistory(workspaceId, filters || {});
}

/** Delete one history row (the user's own record — nothing else depends on it). */
export async function deletePublishHistoryRow(
  workspaceId: string,
  logId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const row = await (prisma as any).publishLog.findFirst({ where: { id: logId, workspaceId } });
    if (!row) return { success: false, error: "History row not found." };

    await (prisma as any).publishLog.delete({ where: { id: logId } });
    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to delete the row." };
  }
}

/** Retry counterpart for a FAILED row — re-queues the underlying post. */
export async function retryPublishHistoryRow(
  workspaceId: string,
  logId: string
): Promise<{ success: boolean; liveUrl?: string | null; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const row = await (prisma as any).publishLog.findFirst({ where: { id: logId, workspaceId } });
    if (!row) return { success: false, error: "History row not found." };
    if (row.status !== "FAILED") return { success: false, error: "This item did not fail." };
    if (row.channel === "WEBSITE") {
      return {
        success: false,
        error: "Re-run the article task from the Today tab — the WordPress publish needs the article body again.",
      };
    }
    if (!row.postId) {
      return { success: false, error: "The original post is no longer available, so it cannot be retried." };
    }

    const post = await prisma.post.findFirst({ where: { id: row.postId, workspaceId } });
    if (!post) {
      return { success: false, error: "The original post has been cleaned up, so it cannot be retried." };
    }

    await prisma.post.update({
      where: { id: post.id },
      data: { status: "SCHEDULED", scheduledFor: new Date(Date.now() - 1000), publishError: null },
    });

    const { publishDuePosts } = await import("@/lib/publishing/dispatch");
    const result = await publishDuePosts({ postIds: [post.id], limit: 1 });
    const outcome = result.results[0];

    revalidatePath("/dashboard/goals");

    if (!outcome || outcome.status === "FAILED") {
      return { success: false, error: outcome?.error || "Retry failed." };
    }
    return { success: true, liveUrl: outcome.liveUrl || null };
  } catch (error: any) {
    return { success: false, error: error?.message || "Retry failed." };
  }
}

/** CSV export of the permanent history — real values only, no filler columns. */
export async function exportPublishHistoryCsv(
  workspaceId: string,
  filters?: {
    channel?: LeadChannel | "ALL";
    platform?: string | "ALL";
    status?: "PUBLISHED" | "FAILED" | "ALL";
    from?: string | null;
    to?: string | null;
  }
): Promise<{ success: boolean; csv?: string; filename?: string; rows?: number; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const history = await getPublishHistory(workspaceId, { ...(filters || {}), limit: 1000 });

    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = [
      "published_at",
      "channel",
      "platform",
      "format",
      "status",
      "topic",
      "keyword",
      "excerpt",
      "live_url",
      "tracked_link",
      "clicks",
      "leads",
      "autopilot",
      "error",
    ];

    const lines = [header.join(",")];
    for (const r of history) {
      lines.push(
        [
          new Date(r.publishedAt).toISOString(),
          r.channel,
          r.platform,
          r.format || "",
          r.status,
          r.topic || "",
          r.keyword || "",
          r.excerpt,
          r.liveUrl || "",
          r.shortUrl || "",
          r.clicks,
          r.leads,
          r.isAutopilot ? "yes" : "no",
          r.error || "",
        ]
          .map(escape)
          .join(",")
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return {
      success: true,
      csv: lines.join("\n"),
      filename: `publish-history-${stamp}.csv`,
      rows: history.length,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || "Export failed." };
  }
}

export async function exportLeadsCsv(
  workspaceId: string
): Promise<{ success: boolean; csv?: string; filename?: string; rows?: number; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const leads = await getLeadEvents(workspaceId, { limit: 200 });
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = [
      "occurred_at",
      "source",
      "channel",
      "platform",
      "action",
      "lead_type",
      "status",
      "contact_name",
      "contact_info",
      "value",
      "note",
      "attributed_to",
    ];

    const lines = [header.join(",")];
    for (const l of leads) {
      lines.push(
        [
          new Date(l.occurredAt).toISOString(),
          l.source,
          l.channel,
          l.platform || "",
          l.action || "",
          l.leadType,
          l.status,
          l.contactName || "",
          l.contactInfo || "",
          l.value ?? "",
          l.note || "",
          l.attributedTo || "",
        ]
          .map(escape)
          .join(",")
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return { success: true, csv: lines.join("\n"), filename: `leads-${stamp}.csv`, rows: leads.length };
  } catch (error: any) {
    return { success: false, error: error?.message || "Export failed." };
  }
}

// ============================================================================
// WEBSITE TAG
// ============================================================================

export async function getWebsiteTrackingStatus(workspaceId: string): Promise<TrackingStatus> {
  // The status carries the tracking key, so a non-owner gets the empty shape.
  if (!(await ownsWorkspace(workspaceId))) return EMPTY_TRACKING;
  return getTrackingStatus(workspaceId);
}

/**
 * Creates the tracking key (if needed) and returns the snippet to paste. The key
 * is a random token, not derived from the workspace id, so it cannot be guessed
 * from a public URL.
 */
export async function setupWebsiteTracking(
  workspaceId: string,
  domain?: string | null
): Promise<{ success: boolean; status?: TrackingStatus; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const key = await ensureTrackingKey(workspaceId);
    if (!key) return { success: false, error: "Could not create the tracking key. Try again." };

    if (domain !== undefined) {
      const host = normalizeDomain(domain || "");
      await prisma.workspace
        .update({ where: { id: workspaceId }, data: { trackingDomain: host || null } as any })
        .catch(() => null);
    }

    revalidatePath("/dashboard/goals");
    return { success: true, status: await getTrackingStatus(workspaceId) };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to set up website tracking." };
  }
}

/**
 * "Verify installation": reports whether the tag has actually reported a lead
 * yet. It does not fake a success — until a real event arrives it says so.
 */
export async function verifyWebsiteTracking(
  workspaceId: string
): Promise<{ success: boolean; verified: boolean; status: TrackingStatus; message: string }> {
  if (!(await ownsWorkspace(workspaceId))) {
    return { success: false, verified: false, status: EMPTY_TRACKING, message: NOT_YOURS };
  }

  const status = await getTrackingStatus(workspaceId);

  if (!status.trackingKey) {
    return {
      success: false,
      verified: false,
      status,
      message: "Generate the snippet first, then paste it into your website.",
    };
  }
  if (!status.verifiedAt) {
    return {
      success: true,
      verified: false,
      status,
      message:
        "The snippet has not reported anything yet. Paste it before </body> on your site, then submit a test form or click a WhatsApp/email link — it will verify itself within seconds.",
    };
  }
  return {
    success: true,
    verified: true,
    status,
    message: `Installed and working — ${status.leadsCaptured} lead${status.leadsCaptured === 1 ? "" : "s"} captured so far.`,
  };
}

/** Regenerates the key — the old snippet stops working immediately. */
export async function rotateTrackingKey(
  workspaceId: string
): Promise<{ success: boolean; status?: TrackingStatus; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    await prisma.workspace
      .update({
        where: { id: workspaceId },
        data: { trackingKey: null, trackingVerifiedAt: null } as any,
      })
      .catch(() => null);

    const key = await ensureTrackingKey(workspaceId);
    if (!key) return { success: false, error: "Could not create a new tracking key." };

    revalidatePath("/dashboard/goals");
    return { success: true, status: await getTrackingStatus(workspaceId) };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to rotate the key." };
  }
}

/** Remove counterpart of Install — stops website lead capture. */
export async function disableWebsiteTracking(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { trackingKey: null, trackingDomain: null, trackingVerifiedAt: null } as any,
    });
    revalidatePath("/dashboard/goals");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to disable website tracking." };
  }
}

/** Snippet text on its own, for the copy button. */
export async function getTrackingSnippet(workspaceId: string): Promise<{ snippet: string; key: string | null }> {
  if (!(await ownsWorkspace(workspaceId))) return { snippet: "", key: null };

  const status = await getTrackingStatus(workspaceId);
  return {
    snippet: status.trackingKey ? buildTagSnippet(status.trackingKey) : "",
    key: status.trackingKey,
  };
}
