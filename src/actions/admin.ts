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
  getFlags,
  getPlanOverrides,
  maskValue,
  refreshRuntimeConfig,
  setSetting,
  type FeatureFlags,
  type AffiliateTerms,
} from "@/lib/admin/runtimeConfig";
import { purgeUserData } from "@/lib/account/purge";
import { adjustCredits, syncPeriodGrant } from "@/lib/billing/wallet";
import { getPlanContext } from "@/lib/billing/entitlements";
import { FEATURE_KEYS, PLAN_TIERS, isPlanTier, type PlanOverride, type PlanTier } from "@/lib/billing/plans";
import { ensureAdminSchema } from "@/lib/admin/schema";

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

function fail(err: unknown): { success: false; error: string } {
  if (err instanceof AdminAccessError || err instanceof SecretStorageError) return { success: false, error: err.message };
  if (err instanceof z.ZodError) return { success: false, error: err.issues[0]?.message || "Invalid input." };
  console.error("[admin-action]", err);
  return { success: false, error: err instanceof Error ? err.message : "Something went wrong." };
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
    revalidatePath(`/dashboard/admin/users/${data.userId}`);
    revalidatePath("/dashboard/admin/users");
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
    revalidatePath(`/dashboard/admin/users/${data.userId}`);
    revalidatePath("/dashboard/admin/users");
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
    await prisma.user.update({ where: { id: data.userId }, data: { role: data.role } });
    await recordAudit(admin, { action: "user.role", targetType: "user", targetId: data.userId, details: { role: data.role } });
    revalidatePath(`/dashboard/admin/users/${data.userId}`);
    revalidatePath("/dashboard/admin/users");
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
    revalidatePath(`/dashboard/admin/users/${data.userId}`);
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
    revalidatePath(`/dashboard/admin/users/${data.userId}`);
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
        create: { userId: data.userId, plan: "FREE", status: "NONE", periodStart: now, periodEnd },
        update: {
          plan: "FREE",
          status: "NONE",
          endsAt: now,
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
        },
      });
    } else {
      await prisma.subscription.upsert({
        where: { userId: data.userId },
        create: {
          userId: data.userId,
          plan: data.plan,
          status: data.plan === "TRIAL" ? "TRIALING" : "ACTIVE",
          cycle: "MONTHLY",
          periodStart: now,
          periodEnd,
          trialEndsAt: data.plan === "TRIAL" ? periodEnd : null,
          renewsAt: null,
          endsAt: null,
          cancelAtPeriodEnd: false,
          testMode: false,
        },
        update: {
          plan: data.plan === "TRIAL" ? "GO" : data.plan,
          status: data.plan === "TRIAL" ? "TRIALING" : "ACTIVE",
          periodStart: now,
          periodEnd,
          trialEndsAt: data.plan === "TRIAL" ? periodEnd : null,
          endsAt: null,
          cancelAtPeriodEnd: false,
          testMode: false,
        },
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
    revalidatePath(`/dashboard/admin/users/${data.userId}`);
    revalidatePath("/dashboard/admin/users");
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

    revalidatePath("/dashboard/admin/users");
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
    for (const id of data.userIds.slice(0, 20)) revalidatePath(`/dashboard/admin/users/${id}`);
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

    const where =
      data.plan === "ALL"
        ? { blockedAt: null }
        : data.plan === "PAID"
          ? { blockedAt: null, subscription: { status: { in: ["ACTIVE", "PAST_DUE", "CANCELLED"] }, plan: { in: ["GO", "PRO", "AGENCY"] } } }
          : data.plan === "FREE"
            ? { blockedAt: null, OR: [{ subscription: null }, { subscription: { status: { in: ["NONE", "EXPIRED", "UNPAID", "PAUSED"] } } }] }
            : data.plan === "TRIAL"
              ? { blockedAt: null, subscription: { status: "TRIALING" } }
              : { blockedAt: null, subscription: { plan: data.plan, status: { in: ["ACTIVE", "PAST_DUE", "CANCELLED"] } } };

    const users = await prisma.user.findMany({ where: where as never, select: { id: true } });
    if (users.length === 0) return { success: true, sent: 0 };

    const created = await prisma.userNotification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        tone: data.tone,
        title: data.title,
        body: data.body || null,
        href: data.href || null,
        linkLabel: data.href ? data.linkLabel || null : null,
        sentBy: admin.userId,
      })),
    });
    await recordAudit(admin, {
      action: "notification.segment",
      details: { segment: data.plan, recipients: created.count, title: data.title, tone: data.tone },
    });
    return { success: true, sent: created.count };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Models
// ─────────────────────────────────────────────────────────────────────────────

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

export async function upsertModelAction(input: AdminModelInput): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const data = modelSchema.parse(input);
    await ensureAdminSchema();

    if (data.isDefaultChat) {
      await prisma.aiModel.updateMany({ where: { isDefaultChat: true, NOT: { id: data.id } }, data: { isDefaultChat: false } });
    }
    await prisma.aiModel.upsert({
      where: { id: data.id },
      create: { ...data, blurb: data.blurb || null, createdBy: admin.userId, archived: false },
      update: { ...data, blurb: data.blurb || null, archived: false },
    });
    if (data.isDefaultChat && data.enabledForChat) {
      await setSetting("ai.model.CHAT_CONTROLLER", data.id, { updatedBy: admin.userId });
    }
    await refreshRuntimeConfig();
    await recordAudit(admin, { action: "model.upsert", targetType: "model", targetId: data.id, details: { ...data } });
    revalidatePath("/dashboard/admin/models");
    return { success: true };
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
    revalidatePath("/dashboard/admin/models");
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
      await setSetting(`ai.model.${data.role}`, data.modelId, { updatedBy: admin.userId });
    } else {
      await deleteSetting(`ai.model.${data.role}`);
    }
    await recordAudit(admin, { action: "model.role", targetType: "setting", targetId: `ai.model.${data.role}`, details: { modelId: data.modelId } });
    revalidatePath("/dashboard/admin/models");
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
    await recordAudit(admin, {
      action: value ? "key.set" : "key.clear",
      targetType: "key",
      targetId: spec.name,
      details: { preview: value ? (spec.secret ? maskValue(value) : value) : null },
    });
    revalidatePath("/dashboard/admin/keys");
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

export async function savePlanOverrideAction(input: { plan: PlanTier; override: PlanOverride | null }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    if (!isPlanTier(input?.plan)) return { success: false, error: "Unknown plan." };
    const override = input.override === null ? null : planOverrideSchema.parse(input.override);

    const current = { ...getPlanOverrides() };
    if (override === null || Object.keys(override).length === 0) {
      delete current[input.plan];
    } else {
      const caps: Record<string, number> = {};
      for (const [key, value] of Object.entries(override.caps ?? {})) {
        if ((FEATURE_KEYS as readonly string[]).includes(key)) caps[key] = value;
      }
      current[input.plan] = { ...override, caps: caps as PlanOverride["caps"] } as PlanOverride;
    }
    await setSetting("billing.plans", current as never, { updatedBy: admin.userId });
    await recordAudit(admin, { action: "plan.override", targetType: "plan", targetId: input.plan, details: { override } });
    revalidatePath("/dashboard/admin/plans");
    revalidatePath("/dashboard/billing");
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
    const data = flagsSchema.parse({ ...getFlags(), ...input });
    await setSetting("flags", data, { updatedBy: admin.userId });
    await recordAudit(admin, { action: "flags.update", targetType: "setting", targetId: "flags", details: data });
    revalidatePath("/dashboard/admin/settings");
    revalidatePath("/dashboard", "layout");
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
    revalidatePath("/dashboard/admin/affiliate");
    revalidatePath("/dashboard/affiliate");
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
    revalidatePath("/dashboard/admin/errors");
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
    revalidatePath("/dashboard/admin/errors");
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
        adminNote: data.adminNote ?? undefined,
        reviewedBy: data.status ? admin.userId : null,
        reviewedAt: data.status ? new Date() : null,
      },
    });
    await recordAudit(admin, { action: "feedback.triage", targetType: "feedback", targetId: data.id, details: { status: data.status } });
    revalidatePath("/dashboard/admin/feedback");
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
    revalidatePath("/dashboard/admin", "layout");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}
