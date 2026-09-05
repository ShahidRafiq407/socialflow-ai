// ============================================================================
// ADMIN — SERVER ACTIONS
//
// Every write the back office can make. Each one: checks the caller is an admin,
// validates its input with zod, does the work, writes an audit row, and
// revalidates the pages that show the result. Nothing here trusts the client
// beyond the ids it names, and no secret ever comes back in a return value.
// ============================================================================

"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireAdmin, isEnvAdmin, AdminAccessError } from "@/lib/admin/auth";
import { recordAudit } from "@/lib/admin/audit";
import { forgetAccountBlock } from "@/lib/admin/block";
import {
  MANAGED_KEYS,
  MODEL_ROLE_KEYS,
  SecretStorageError,
  deleteSetting,
  ensureRuntimeConfig,
  getFlags,
  maskValue,
  refreshRuntimeConfig,
  setSetting,
  type FeatureFlags,
  type AffiliateTerms,
} from "@/lib/admin/runtimeConfig";
import { purgeUserData } from "@/lib/account/purge";
import { forgetConfigRevision, forgetAccountRevision } from "@/lib/admin/revision";
import { providerSpec } from "@/lib/providers/registry";
import { testModel, type ProviderTestResult } from "@/lib/providers/gateway";
import { defaultRoleModel, type ModelRole } from "@/lib/agents/llm";
import { isKnownModel } from "@/lib/billing/modelPricing";
import { adjustCredits, syncPeriodGrant } from "@/lib/billing/wallet";
import { getPlanContext, effectivePlanFor } from "@/lib/billing/entitlements";
import {
  FEATURE_KEYS,
  PLAN_TIERS,
  isPlanTier,
  type PlanOverride,
  type PlanOverrides,
  type PlanTier,
} from "@/lib/billing/plans";
import { ensureAdminSchema } from "@/lib/admin/schema";

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

function fail(err: unknown): { success: false; error: string } {
  if (err instanceof AdminAccessError || err instanceof SecretStorageError) return { success: false, error: err.message };
  if (err instanceof z.ZodError) return { success: false, error: err.issues[0]?.message || "Invalid input." };
  console.error("[admin-action]", err);
  return { success: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

/**
 * An admin write that users can see. Drops the derived config revision so the
 * next poll from any open tab notices immediately instead of within its memo
 * window, and invalidates the server-rendered dashboard shell (sidebar plan
 * badge, credit counter, maintenance banner) so a `router.refresh()` on the
 * client actually returns new HTML.
 */
function publishToUsers(): void {
  forgetConfigRevision();
  revalidatePath("/dashboard", "layout");
}

/**
 * The same, for a write that changed one account rather than the deployment.
 *
 * A plan grant, a suspension, a role change or a credit adjustment moves nothing
 * in `AppSetting` or `AiModel`, so the shared half of the revision token cannot
 * see it. Without this the user's own tab kept rendering the plan it had before —
 * suspension included — until they happened to navigate.
 *
 * Call it *after* the write, and after any notification the action sends: the
 * per-account half of the token is derived from those rows, so dropping the memo
 * first would just re-cache the old value.
 */
function publishToUser(userId: string): void {
  forgetAccountRevision(userId);
  revalidatePath("/dashboard", "layout");
}

const userIdSchema = z.string().trim().min(1).max(120);

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

export async function blockUserAction(input: { userId: string; reason: string }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ userId: userIdSchema, reason: z.string().trim().min(3).max(500) }).parse(input);
    if (data.userId === admin.userId) return { success: false, error: "You cannot block yourself." };

    const target = await prisma.user.findUnique({ where: { id: data.userId }, select: { role: true, email: true } });
    if (!target) return { success: false, error: "User not found." };
    if (target.role === "ADMIN" || isEnvAdmin(data.userId, target.email)) {
      return { success: false, error: "Remove admin access before blocking this account." };
    }

    await prisma.user.update({
      where: { id: data.userId },
      data: { blockedAt: new Date(), blockedReason: data.reason, blockedBy: admin.userId },
    });
    forgetAccountBlock(data.userId);

    await prisma.userNotification.create({
      data: {
        userId: data.userId,
        tone: "error",
        title: "Your account has been suspended",
        body: data.reason,
        sentBy: admin.userId,
      },
    });

    await recordAudit(admin, { action: "user.block", targetType: "user", targetId: data.userId, details: { reason: data.reason } });
    revalidatePath(`/adminshahid/users/${data.userId}`);
    revalidatePath("/adminshahid/users");
    publishToUser(data.userId);
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function unblockUserAction(input: { userId: string }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ userId: userIdSchema }).parse(input);
    await prisma.user.update({
      where: { id: data.userId },
      data: { blockedAt: null, blockedReason: null, blockedBy: null },
    });
    forgetAccountBlock(data.userId);
    await prisma.userNotification.create({
      data: {
        userId: data.userId,
        tone: "success",
        title: "Your account is active again",
        body: "The suspension has been lifted. Everything on your plan is available.",
        sentBy: admin.userId,
      },
    });
    await recordAudit(admin, { action: "user.unblock", targetType: "user", targetId: data.userId });
    revalidatePath(`/adminshahid/users/${data.userId}`);
    revalidatePath("/adminshahid/users");
    publishToUser(data.userId);
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setUserRoleAction(input: { userId: string; role: "USER" | "ADMIN" }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ userId: userIdSchema, role: z.enum(["USER", "ADMIN"]) }).parse(input);
    if (data.userId === admin.userId && data.role === "USER") {
      return { success: false, error: "You cannot remove your own admin access." };
    }
    const target = await prisma.user.findUnique({ where: { id: data.userId }, select: { email: true } });
    if (!target) return { success: false, error: "User not found." };
    if (data.role === "USER" && isEnvAdmin(data.userId, target.email)) {
      return { success: false, error: "This admin is set in the ADMIN_USERS environment variable and cannot be demoted here." };
    }
    // "MANUAL" is what keeps this grant out of the allowlist sync's reach: an
    // ENV-sourced role is revoked when the address leaves ADMIN_USERS, one
    // granted here is not.
    await prisma.user.update({
      where: { id: data.userId },
      data: { role: data.role, roleSource: data.role === "ADMIN" ? "MANUAL" : null },
    });
    await recordAudit(admin, { action: "user.role", targetType: "user", targetId: data.userId, details: { role: data.role } });
    revalidatePath(`/adminshahid/users/${data.userId}`);
    revalidatePath("/adminshahid/users");
    publishToUser(data.userId);
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveAdminNotesAction(input: { userId: string; notes: string }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ userId: userIdSchema, notes: z.string().max(5000) }).parse(input);
    await prisma.user.update({ where: { id: data.userId }, data: { adminNotes: data.notes.trim() || null } });
    await recordAudit(admin, { action: "user.notes", targetType: "user", targetId: data.userId });
    revalidatePath(`/adminshahid/users/${data.userId}`);
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function adjustCreditsAction(input: {
  userId: string;
  credits: number;
  note: string;
  notify?: boolean;
}): Promise<Result<{ balance: number }>> {
  try {
    const admin = await requireAdmin();
    const data = z
      .object({
        userId: userIdSchema,
        credits: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, "Enter a non-zero amount."),
        note: z.string().trim().min(3, "Say why — the note appears on the customer's statement.").max(300),
        notify: z.boolean().optional(),
      })
      .parse(input);

    const ctx = await getPlanContext(data.userId);
    const result = await adjustCredits({
      userId: data.userId,
      credits: data.credits,
      note: `Adjustment by support: ${data.note}`,
      plan: ctx.plan,
    });
    if (!result.ok) return { success: false, error: "The wallet could not be updated." };

    if (data.notify !== false) {
      const positive = data.credits > 0;
      await prisma.userNotification.create({
        data: {
          userId: data.userId,
          tone: positive ? "success" : "warning",
          title: positive
            ? `${data.credits.toLocaleString()} credits added to your account`
            : `${Math.abs(result.applied ?? data.credits).toLocaleString()} credits removed from your account`,
          body: data.note,
          href: "/dashboard/billing",
          linkLabel: "View balance",
          sentBy: admin.userId,
        },
      });
    }

    await recordAudit(admin, {
      action: "credits.adjust",
      targetType: "user",
      targetId: data.userId,
      details: { credits: data.credits, applied: result.applied, note: data.note, balanceAfter: result.balance },
    });
    revalidatePath(`/adminshahid/users/${data.userId}`);
    publishToUser(data.userId);
    return { success: true, balance: result.balance ?? 0 };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Puts an account on a plan by hand, outside Lemon Squeezy.
 *
 * For a comped account, a partner, or fixing a webhook that never arrived. The
 * subscription row is written as ACTIVE for `days` with no LS ids, so the
 * billing webhook cannot later mistake it for a paid subscription, and the
 * period's credits are granted through the same idempotent path a renewal uses.
 */
export async function setUserPlanAction(input: {
  userId: string;
  plan: PlanTier;
  days?: number;
  grantCredits?: boolean;
  note?: string;
}): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z
      .object({
        userId: userIdSchema,
        plan: z.enum(PLAN_TIERS),
        days: z.number().int().min(1).max(3650).optional(),
        grantCredits: z.boolean().optional(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input);

    const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
    if (!user) return { success: false, error: "User not found." };

    const now = new Date();
    const days = data.days ?? 30;
    const periodEnd = new Date(now.getTime() + days * 86_400_000);

    if (data.plan === "FREE") {
      await prisma.subscription.upsert({
        where: { userId: data.userId },
        create: {
          userId: data.userId,
          plan: "FREE",
          status: "NONE",
          periodStart: now,
          periodEnd,
          endsAt: now,
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
        },
        update: {
          plan: "FREE",
          status: "NONE",
          endsAt: now,
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
        },
      });
    } else {
      // Create and update have to agree. They did not: a first-time row stored
      // plan=TRIAL while an existing row was rewritten to GO, so the same support
      // action produced two different rows and the two read back differently on
      // any screen that shows the stored tier.
      const storedPlan = data.plan;
      const status = data.plan === "TRIAL" ? "TRIALING" : "ACTIVE";
      const shape = {
        plan: storedPlan,
        status,
        periodStart: now,
        periodEnd,
        trialEndsAt: data.plan === "TRIAL" ? periodEnd : null,
        endsAt: null,
        cancelAtPeriodEnd: false,
        testMode: false,
      } as const;
      await prisma.subscription.upsert({
        where: { userId: data.userId },
        create: { userId: data.userId, cycle: "MONTHLY", renewsAt: null, ...shape },
        update: { ...shape },
      });

      if (data.grantCredits !== false) {
        await syncPeriodGrant({
          userId: data.userId,
          plan: data.plan,
          periodStart: now,
          periodEnd,
          note: `${data.plan} plan credits granted by support${data.note ? `: ${data.note}` : ""}`,
        });
      }
    }

    await prisma.userNotification.create({
      data: {
        userId: data.userId,
        tone: "info",
        title: data.plan === "FREE" ? "Your plan has been changed to Free" : `Your plan has been changed to ${data.plan}`,
        body: data.note || (data.plan === "FREE" ? "Paid features are no longer available." : `Active for the next ${days} days.`),
        href: "/dashboard/billing",
        linkLabel: "View plan",
        sentBy: admin.userId,
      },
    });

    await recordAudit(admin, {
      action: "user.plan",
      targetType: "user",
      targetId: data.userId,
      details: { plan: data.plan, days, grantCredits: data.grantCredits !== false, note: data.note },
    });
    revalidatePath(`/adminshahid/users/${data.userId}`);
    revalidatePath("/adminshahid/users");
    // The user's own sidebar badge, credit counter and billing page read this.
    // Per-account rather than global: this write moves no `AppSetting` or
    // `AiModel` row, so the shared half of the revision token would not budge and
    // the tab would compare two identical tokens and refresh nothing.
    publishToUser(data.userId);
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteUserAction(input: { userId: string; confirmEmail: string }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ userId: userIdSchema, confirmEmail: z.string().trim() }).parse(input);
    if (data.userId === admin.userId) return { success: false, error: "You cannot delete your own account from here." };

    const target = await prisma.user.findUnique({ where: { id: data.userId }, select: { email: true, role: true } });
    if (!target) return { success: false, error: "User not found." };
    if (target.email.toLowerCase() !== data.confirmEmail.toLowerCase()) {
      return { success: false, error: "The email you typed does not match this account." };
    }
    if (target.role === "ADMIN" || isEnvAdmin(data.userId, target.email)) {
      return { success: false, error: "Remove admin access before deleting this account." };
    }

    // Audit first: after the purge there is no row to attach the trail to.
    await recordAudit(admin, { action: "user.delete", targetType: "user", targetId: data.userId, details: { email: target.email } });

    await purgeUserData(data.userId);

    try {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(data.userId);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status !== 404) {
        console.error("[admin] Clerk deletion failed:", err);
        return { success: false, error: "Data erased, but the login could not be removed. Run delete again to retry." };
      }
    }

    revalidatePath("/adminshahid/users");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

const noticeSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().max(2000).optional(),
  tone: z.enum(["info", "success", "warning", "error"]).default("info"),
  href: z.string().trim().max(512).optional(),
  linkLabel: z.string().trim().max(80).optional(),
});

export async function sendUserNotificationAction(input: {
  userIds: string[];
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "error";
  href?: string;
  linkLabel?: string;
}): Promise<Result<{ sent: number }>> {
  try {
    const admin = await requireAdmin();
    const data = noticeSchema.extend({ userIds: z.array(userIdSchema).min(1).max(500) }).parse(input);
    await ensureAdminSchema();
    const created = await prisma.userNotification.createMany({
      data: data.userIds.map((userId) => ({
        userId,
        tone: data.tone,
        title: data.title,
        body: data.body || null,
        href: data.href || null,
        linkLabel: data.href ? data.linkLabel || null : null,
        sentBy: admin.userId,
      })),
    });
    await recordAudit(admin, {
      action: "notification.send",
      targetType: "user",
      targetId: data.userIds.length === 1 ? data.userIds[0] : undefined,
      details: { recipients: data.userIds.length, title: data.title, tone: data.tone },
    });
    for (const id of data.userIds.slice(0, 20)) revalidatePath(`/adminshahid/users/${id}`);
    // Each recipient's bell is driven by the per-account revision token, whose
    // notification half we just moved. Drop their memos so a tab polling right now
    // lights up on this poll rather than the next one.
    for (const id of data.userIds) forgetAccountRevision(id);
    revalidatePath("/dashboard", "layout");
    return { success: true, sent: created.count };
  } catch (err) {
    return fail(err);
  }
}

/** Sends to every account matching a plan filter — "everyone on Pro", "everyone". */
export async function sendSegmentNotificationAction(input: {
  plan: PlanTier | "ALL" | "PAID";
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "error";
  href?: string;
  linkLabel?: string;
}): Promise<Result<{ sent: number }>> {
  try {
    const admin = await requireAdmin();
    const data = noticeSchema.extend({ plan: z.enum([...PLAN_TIERS, "ALL", "PAID"]) }).parse(input);
    await ensureAdminSchema();

    // Coarse filter in SQL, exact tier in code. Classifying on the stored enums
    // alone sent "your Pro plan" to accounts whose period ended months ago, and
    // dropped an expired paid account out of the Free segment too — so a lapsed
    // user was in no segment at all. `effectivePlanFor` is the same decision the
    // dashboard, the user list and the entitlements use.
    const GRANTING_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"];
    const coarse =
      data.plan === "ALL" || data.plan === "FREE"
        ? { blockedAt: null }
        : { blockedAt: null, subscription: { status: { in: GRANTING_STATUSES } } };

    const candidates = await prisma.user.findMany({
      where: coarse as never,
      select: {
        id: true,
        subscription: {
          select: { plan: true, status: true, periodEnd: true, trialEndsAt: true, endsAt: true, testMode: true },
        },
      },
    });

    const now = new Date();
    const recipients = candidates
      .filter((u) => {
        if (data.plan === "ALL") return true;
        const tier = effectivePlanFor(u.subscription, now);
        if (data.plan === "PAID") return tier !== "FREE" && tier !== "TRIAL";
        return tier === data.plan;
      })
      .map((u) => u.id);

    if (recipients.length === 0) return { success: true, sent: 0 };

    let sent = 0;
    for (let i = 0; i < recipients.length; i += 500) {
      const created = await prisma.userNotification.createMany({
        data: recipients.slice(i, i + 500).map((userId) => ({
          userId,
          tone: data.tone,
          title: data.title,
          body: data.body || null,
          href: data.href || null,
          linkLabel: data.href ? data.linkLabel || null : null,
          sentBy: admin.userId,
        })),
      });
      sent += created.count;
    }
    await recordAudit(admin, {
      action: "notification.segment",
      details: { segment: data.plan, recipients: sent, title: data.title, tone: data.tone },
    });
    // A segment send can be thousands of accounts, so clear the whole per-account
    // memo rather than walking the list — it is rebuilt lazily, one entry per tab
    // that actually polls, and the alternative is thousands of map deletes for
    // entries that mostly are not there.
    forgetAccountRevision();
    revalidatePath("/dashboard", "layout");
    return { success: true, sent };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Models
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when this id is something the platform can already route to without a
 * custom row: a priced entry on the rate card, or the code default for a role.
 */
function isBuiltInModelId(id: string): boolean {
  if (isKnownModel(id)) return true;
  return MODEL_ROLE_KEYS.some((role) => {
    try {
      return defaultRoleModel(role as ModelRole) === id;
    } catch {
      return false;
    }
  });
}

const modelSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-zA-Z0-9._:\/-]+$/, "Model ids may only contain letters, numbers, dots, dashes, colons and slashes."),
  label: z.string().trim().min(1).max(80),
  blurb: z.string().trim().max(300).optional(),
  provider: z.string().trim().max(40).default("vertex"),
  baseUrl: z
    .string()
    .trim()
    .max(512)
    .refine((v) => !v || /^https?:\/\//i.test(v), "The base URL must start with http:// or https://.")
    .nullable()
    .optional(),
  apiKeyRef: z.string().trim().max(80).nullable().optional(),
  contextWindow: z.number().int().min(0).max(20_000_000).nullable().optional(),
  maxOutputTokens: z.number().int().min(0).max(1_000_000).nullable().optional(),
  kind: z.enum(["text", "image", "video", "embed"]).default("text"),
  inputPerMTok: z.number().min(0).max(10_000).default(0),
  outputPerMTok: z.number().min(0).max(10_000).default(0),
  cachedPerMTok: z.number().min(0).max(10_000).nullable().optional(),
  perImage: z.number().min(0).max(100).nullable().optional(),
  perVideoSecond: z.number().min(0).max(100).nullable().optional(),
  supportsThinking: z.boolean().default(true),
  supportsTools: z.boolean().default(true),
  supportsVision: z.boolean().default(true),
  tier: z.enum(["frontier", "fast", "legacy"]).default("frontier"),
  enabledForChat: z.boolean().default(false),
  chatCredits: z.number().int().min(0).max(10_000).nullable().optional(),
  minPlan: z.enum(PLAN_TIERS).nullable().optional(),
  isDefaultChat: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
});

export type AdminModelInput = z.input<typeof modelSchema>;

/**
 * Normalises a parsed row into what the database stores. A blank base URL or key
 * reference becomes NULL rather than "", so `resolveConfig` falls back to the
 * provider's registry default instead of treating an empty string as an override.
 */
function modelRowData(data: z.output<typeof modelSchema>) {
  const spec = providerSpec(data.provider);
  return {
    ...data,
    blurb: data.blurb || null,
    // The built-in Google path has no endpoint and no key of its own.
    baseUrl: spec.wire === "vertex" ? null : data.baseUrl?.trim().replace(/\/+$/, "") || null,
    apiKeyRef: spec.wire === "vertex" ? null : data.apiKeyRef?.trim() || null,
    contextWindow: data.contextWindow ?? null,
    maxOutputTokens: data.maxOutputTokens ?? null,
  };
}

export async function upsertModelAction(
  input: AdminModelInput & { originalId?: string | null }
): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = modelSchema.parse(input);
    const originalId = typeof input?.originalId === "string" ? input.originalId.trim() : "";
    // An edit that changed the id is a rename, not a new row: without this the
    // upsert creates a duplicate and the old row stays enabled in the picker.
    const renamingFrom = originalId && originalId !== data.id ? originalId : null;
    await ensureAdminSchema();

    const spec = providerSpec(data.provider);
    if (spec.requiresBaseUrl && !data.baseUrl?.trim()) {
      throw new Error(`${spec.label} has no default endpoint. Enter the base URL for your deployment.`);
    }
    if (spec.wire !== "vertex" && !spec.baseUrl && !data.baseUrl?.trim()) {
      throw new Error(`${spec.label} needs a base URL.`);
    }
    // A chat row with no price and no per-token rate would be metered at zero.
    if (data.enabledForChat && data.kind === "text") {
      const hasRate = data.inputPerMTok > 0 || data.outputPerMTok > 0;
      const hasFlat = typeof data.chatCredits === "number" && data.chatCredits > 0;
      if (!hasRate && !hasFlat) {
        throw new Error(
          "A model users can pick needs a price: set the per-million-token rates, or a flat credits-per-turn."
        );
      }
    }
    if (renamingFrom) {
      const collision = await prisma.aiModel.findUnique({ where: { id: data.id }, select: { id: true } });
      if (collision) throw new Error(`A model with the id "${data.id}" already exists.`);
    }

    const row = modelRowData(data);
    await prisma.$transaction(async (tx) => {
      if (renamingFrom) {
        // Carry the created-by and the archive state across, then drop the old id.
        const previous = await tx.aiModel.findUnique({ where: { id: renamingFrom } });
        await tx.aiModel.create({
          data: { ...row, createdBy: previous?.createdBy || admin.userId, archived: false },
        });
        await tx.aiModel.delete({ where: { id: renamingFrom } }).catch(() => undefined);
      } else {
        await tx.aiModel.upsert({
          where: { id: data.id },
          create: { ...row, createdBy: admin.userId, archived: false },
          update: { ...row, archived: false },
        });
      }
      if (data.isDefaultChat) {
        await tx.aiModel.updateMany({
          where: { isDefaultChat: true, NOT: { id: data.id } },
          data: { isDefaultChat: false },
        });
      }
    });

    // Role pointers are settings, not foreign keys, so a rename has to move them
    // or every role pinned to the old id silently falls back to its code default.
    if (renamingFrom) {
      for (const role of MODEL_ROLE_KEYS) {
        const current = await prisma.appSetting.findUnique({ where: { key: `ai.model.${role}` } });
        if (current && current.value === renamingFrom) {
          await setSetting(`ai.model.${role}`, data.id, { updatedBy: admin.userId });
        }
      }
    }

    // Keep the CHAT_CONTROLLER pointer honest in both directions. Only writing it
    // when the box is ticked left a stale pointer behind when it was unticked, and
    // the picker would then default to a model it no longer offers.
    const chatDefaultKey = "ai.model.CHAT_CONTROLLER";
    if (data.isDefaultChat && data.enabledForChat && data.kind === "text") {
      await setSetting(chatDefaultKey, data.id, { updatedBy: admin.userId });
    } else {
      const pointer = await prisma.appSetting.findUnique({ where: { key: chatDefaultKey } });
      if (pointer && (pointer.value === data.id || (renamingFrom && pointer.value === renamingFrom))) {
        await deleteSetting(chatDefaultKey);
      }
    }
    // A row that is no longer the default must not keep the column set either.
    if (!data.isDefaultChat) {
      await prisma.aiModel
        .updateMany({ where: { id: data.id, isDefaultChat: true }, data: { isDefaultChat: false } })
        .catch(() => undefined);
    }

    await refreshRuntimeConfig();
    await recordAudit(admin, {
      action: renamingFrom ? "model.rename" : "model.upsert",
      targetType: "model",
      targetId: data.id,
      details: { ...row, ...(renamingFrom ? { renamedFrom: renamingFrom } : {}) },
    });
    revalidatePath("/adminshahid/models");
    // The chat surface reads the catalogue, so it has to be told as well.
    publishToUsers();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Sends one real, minimal request to the vendor so a misconfigured row is caught
 * on this screen instead of by a user mid-conversation. Never persists anything.
 */
export async function testModelAction(input: AdminModelInput): Promise<Result<{ test: ProviderTestResult }>> {
  try {
    await requireAdmin();
    const data = modelSchema.parse(input);
    // The gateway resolves credentials through the runtime-config key resolver,
    // which is only installed once the cache has loaded at least once.
    await ensureRuntimeConfig();
    const test = await testModel({
      modelId: data.id,
      provider: data.provider,
      baseUrl: data.baseUrl ?? null,
      apiKeyRef: data.apiKeyRef ?? null,
      maxOutputTokens: data.maxOutputTokens ?? null,
    });
    return { success: true, test };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveModelAction(input: { id: string }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ id: z.string().trim().min(1) }).parse(input);
    await ensureAdminSchema();
    await prisma.aiModel.update({ where: { id: data.id }, data: { archived: true, enabledForChat: false, isDefaultChat: false } });
    // A role pinned to the archived model falls back to its default.
    for (const role of MODEL_ROLE_KEYS) {
      const current = await prisma.appSetting.findUnique({ where: { key: `ai.model.${role}` } });
      if (current && current.value === data.id) await deleteSetting(`ai.model.${role}`);
    }
    await refreshRuntimeConfig();
    await recordAudit(admin, { action: "model.archive", targetType: "model", targetId: data.id });
    revalidatePath("/adminshahid/models");
    publishToUsers();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setRoleModelAction(input: { role: string; modelId: string | null }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z
      .object({ role: z.enum(MODEL_ROLE_KEYS), modelId: z.string().trim().min(1).max(120).nullable() })
      .parse(input);
    if (data.modelId) {
      // A typo here used to be accepted and then failed at request time, once per
      // user turn, with a vendor 404. Check the id is something we can actually
      // route to before pinning a role to it.
      await ensureAdminSchema();
      const row = await prisma.aiModel
        .findUnique({ where: { id: data.modelId }, select: { archived: true, kind: true, enabledForChat: true } })
        .catch(() => null);
      const builtIn = !row && isBuiltInModelId(data.modelId);
      if (!row && !builtIn) {
        throw new Error(`No model with the id "${data.modelId}". Add it under Models first.`);
      }
      if (row?.archived) {
        throw new Error(`"${data.modelId}" is archived. Restore it before assigning it to a role.`);
      }
      // The chat picker only ever offers text models it is allowed to show, so a
      // controller pinned to an image row or a chat-disabled row is unusable.
      if (data.role === "CHAT_CONTROLLER" && row) {
        if (row.kind !== "text") {
          throw new Error(`"${data.modelId}" is a ${row.kind} model. The chat controller has to be a text model.`);
        }
        if (!row.enabledForChat) {
          throw new Error(`"${data.modelId}" is not enabled for chat. Tick "available in chat" on it first.`);
        }
      }
      await setSetting(`ai.model.${data.role}`, data.modelId, { updatedBy: admin.userId });
    } else {
      await deleteSetting(`ai.model.${data.role}`);
    }
    // CHAT_CONTROLLER is the default the picker shows; the catalogue has to be
    // rebuilt for `setChatModelCatalog` to learn the new default.
    await refreshRuntimeConfig();
    await recordAudit(admin, { action: "model.role", targetType: "setting", targetId: `ai.model.${data.role}`, details: { modelId: data.modelId } });
    revalidatePath("/adminshahid/models");
    publishToUsers();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Keys
// ─────────────────────────────────────────────────────────────────────────────

export async function setManagedKeyAction(input: { name: string; value: string }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ name: z.string().trim().min(1), value: z.string().max(8_000) }).parse(input);
    const spec = MANAGED_KEYS.find((k) => k.name === data.name);
    if (!spec) return { success: false, error: "That key is not managed from the dashboard." };

    const value = data.value.trim();
    if (!value) {
      await deleteSetting(`keys.${spec.name}`);
    } else {
      await setSetting(`keys.${spec.name}`, value, { secret: spec.secret, updatedBy: admin.userId });
    }
    // A provider key just changed, so the gateway's cached clients are stale.
    await refreshRuntimeConfig();
    await recordAudit(admin, {
      action: value ? "key.set" : "key.clear",
      targetType: "key",
      targetId: spec.name,
      details: { preview: value ? (spec.secret ? maskValue(value) : value) : null },
    });
    revalidatePath("/adminshahid/keys");
    forgetConfigRevision();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plans, flags, affiliate terms
// ─────────────────────────────────────────────────────────────────────────────

const planOverrideSchema = z.object({
  name: z.string().trim().max(40).optional(),
  tagline: z.string().trim().max(120).optional(),
  priceMonthly: z.number().min(0).max(100_000).optional(),
  priceYearly: z.number().min(0).max(1_000_000).optional(),
  monthlyCredits: z.number().int().min(0).max(10_000_000).optional(),
  workspaces: z.number().int().min(-1).max(10_000).optional(),
  socialAccountsPerWorkspace: z.number().int().min(-1).max(100).optional(),
  storageMb: z.number().int().min(-1).max(100_000_000).optional(),
  analyticsRetentionDays: z.number().int().min(-1).max(36_500).optional(),
  seats: z.number().int().min(-1).max(10_000).optional(),
  chatMaxToolLoops: z.number().int().min(0).max(64).optional(),
  imageQuality: z.enum(["standard", "premium"]).optional(),
  canBuyTopUps: z.boolean().optional(),
  features: z.array(z.enum(FEATURE_KEYS)).optional(),
  caps: z.record(z.string(), z.number().int().min(-1)).optional(),
});

/**
 * The authoritative value of a shared settings map, read straight from the row.
 *
 * Several settings are one JSON blob holding every tier or every flag, and the
 * actions that edit one member have to merge into the rest. Merging into
 * `peekSetting()` is not safe: a server action POST is its own request and can
 * land on an instance whose module cache was never warmed, in which case the
 * merge base is `{}` and the write deletes every other member. A read of the
 * row itself cannot be cold or stale.
 */
async function authoritativeMap<T extends object>(key: string): Promise<T> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
    const value = row?.value;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
  } catch {
    // Falling back to the cache is still better than starting from nothing, and
    // `setSetting` below would fail on the same database anyway.
    return {} as T;
  }
}

export async function savePlanOverrideAction(input: { plan: PlanTier; override: PlanOverride | null }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    if (!isPlanTier(input?.plan)) return { success: false, error: "Unknown plan." };
    const override = input.override === null ? null : planOverrideSchema.parse(input.override);

    // All five tiers share one row, so the merge base has to be the row.
    const current = { ...(await authoritativeMap<PlanOverrides>("billing.plans")) };
    if (override === null || Object.keys(override).length === 0) {
      delete current[input.plan];
    } else {
      // Only touch `caps` when the editor actually sent caps. Writing `caps: {}`
      // for a price-only edit would read back as "this tier has no ceilings",
      // which turns every metered feature on that plan unlimited.
      let caps: PlanOverride["caps"] | undefined;
      if (override.caps !== undefined) {
        const filtered: Record<string, number> = {};
        for (const [key, value] of Object.entries(override.caps)) {
          if ((FEATURE_KEYS as readonly string[]).includes(key)) filtered[key] = value;
        }
        caps = filtered as PlanOverride["caps"];
      }
      const previous = current[input.plan];
      current[input.plan] = {
        ...override,
        // A tier that already had caps keeps them through an unrelated edit.
        ...(caps !== undefined ? { caps } : previous?.caps ? { caps: previous.caps } : {}),
      } as PlanOverride;
    }
    await setSetting("billing.plans", current as never, { updatedBy: admin.userId });
    await recordAudit(admin, { action: "plan.override", targetType: "plan", targetId: input.plan, details: { override } });
    revalidatePath("/adminshahid/plans");
    revalidatePath("/dashboard/billing");
    revalidatePath("/pricing");
    revalidatePath("/", "layout");
    publishToUsers();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

const flagsSchema = z.object({
  maintenanceEnabled: z.boolean(),
  maintenanceMessage: z.string().trim().max(500),
  affiliateEnabled: z.boolean(),
  trialEnabled: z.boolean(),
  topUpsEnabled: z.boolean(),
  chatModelPickerEnabled: z.boolean(),
  chatFeedbackEnabled: z.boolean(),
});

export async function saveFlagsAction(input: FeatureFlags): Promise<Result> {
  try {
    const admin = await requireAdmin();
    // The editor posts every flag, but merging into the stored row as well means
    // a future flag added by a newer deploy is not dropped by an older tab.
    const stored = await authoritativeMap<Partial<FeatureFlags>>("flags");
    const data = flagsSchema.parse({ ...getFlags(), ...stored, ...input });
    await setSetting("flags", data, { updatedBy: admin.userId });
    await recordAudit(admin, { action: "flags.update", targetType: "setting", targetId: "flags", details: data });
    revalidatePath("/adminshahid/settings");
    revalidatePath("/", "layout");
    publishToUsers();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

const affiliateTermsSchema = z.object({
  commissionPercent: z.number().int().min(0).max(100),
  flatCommissionCents: z.number().int().min(0).max(1_000_000),
  minPayoutCents: z.number().int().min(0).max(10_000_000),
  lockDays: z.number().int().min(0).max(365),
});

export async function saveAffiliateTermsAction(input: AffiliateTerms): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = affiliateTermsSchema.parse(input);
    await setSetting("affiliate.terms", data, { updatedBy: admin.userId });
    await recordAudit(admin, { action: "affiliate.terms", targetType: "setting", targetId: "affiliate.terms", details: data });
    revalidatePath("/adminshahid/affiliate");
    revalidatePath("/dashboard/affiliate");
    publishToUsers();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors and feedback triage
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveErrorAction(input: { id: string; resolved: boolean }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z.object({ id: z.string().trim().min(1), resolved: z.boolean() }).parse(input);
    await prisma.errorEvent.update({
      where: { id: data.id },
      data: data.resolved ? { resolvedAt: new Date(), resolvedBy: admin.userId } : { resolvedAt: null, resolvedBy: null },
    });
    await recordAudit(admin, { action: data.resolved ? "error.resolve" : "error.reopen", targetType: "error", targetId: data.id });
    revalidatePath("/adminshahid/errors");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveAllErrorsAction(): Promise<Result<{ count: number }>> {
  try {
    const admin = await requireAdmin();
    const result = await prisma.errorEvent.updateMany({
      where: { resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedBy: admin.userId },
    });
    await recordAudit(admin, { action: "error.resolveAll", details: { count: result.count } });
    revalidatePath("/adminshahid/errors");
    return { success: true, count: result.count };
  } catch (err) {
    return fail(err);
  }
}

export async function triageFeedbackAction(input: {
  id: string;
  status: "reviewed" | "actioned" | "dismissed" | null;
  adminNote?: string;
}): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = z
      .object({
        id: z.string().trim().min(1),
        status: z.enum(["reviewed", "actioned", "dismissed"]).nullable(),
        adminNote: z.string().trim().max(1000).optional(),
      })
      .parse(input);
    await prisma.chatFeedback.update({
      where: { id: data.id },
      data: {
        status: data.status,
        // An empty box means "clear the note", which is a null column rather than
        // an empty string — every reader tests the column for null.
        adminNote: data.adminNote === undefined ? undefined : data.adminNote || null,
        reviewedBy: data.status ? admin.userId : null,
        reviewedAt: data.status ? new Date() : null,
      },
    });
    await recordAudit(admin, { action: "feedback.triage", targetType: "feedback", targetId: data.id, details: { status: data.status } });
    revalidatePath("/adminshahid/feedback");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

/** Re-reads every setting from the database on this instance, for "I changed it and don't see it". */
export async function refreshConfigAction(): Promise<Result> {
  try {
    await requireAdmin();
    await refreshRuntimeConfig();
    revalidatePath("/adminshahid", "layout");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}
