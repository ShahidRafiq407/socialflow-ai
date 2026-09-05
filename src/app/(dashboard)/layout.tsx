import React from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ConfigSync } from "@/components/dashboard/ConfigSync";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getWorkspaceContext } from "@/lib/workspace/active";
import { isAdminUser } from "@/lib/admin/auth";
import { getAccountBlock } from "@/lib/admin/block";
import {
  ensureRuntimeConfig,
  getFlags,
  runtimeConfigLoaded,
  DEFAULT_FLAGS,
  type FeatureFlags,
} from "@/lib/admin/runtimeConfig";
import { touchLastSeen } from "@/lib/admin/presence";
import { accessSnapshot } from "@/lib/billing/access.server";
import type { AccessSnapshot } from "@/lib/billing/access";
import prisma from "@/lib/db";

/** Resolves to `value` after `ms`, so one slow read cannot hold up the shell. */
function fallbackAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  let userDetails = null;
  let workspaces: { id: string; name: string }[] = [];
  let activeWorkspaceId: string | null = null;
  let isAdmin = false;
  let block: { blockedAt: string; reason: string } | null = null;
  let maintenance: string | null = null;
  let flags: FeatureFlags = DEFAULT_FLAGS;
  let access: AccessSnapshot | null = null;

  if (userId) {
    try {
      // The workspace list and the active id come from the same read, so the
      // header can never highlight a workspace the pages are not loading.
      const [user, context, admin, accountBlock, configReady, snapshot] = await Promise.all([
        Promise.race([currentUser(), fallbackAfter(2500, null)]),
        Promise.race([
          getWorkspaceContext(userId),
          fallbackAfter(2500, {
            workspaces: [] as { id: string; name: string }[],
            activeWorkspaceId: null,
          }),
        ]),
        Promise.race([isAdminUser(userId), fallbackAfter(2500, false)]).catch(() => false),
        // Suspension is independent of the settings cache — it only needs the
        // admin schema and one row — so it is raced on its own. Chaining it
        // behind `ensureRuntimeConfig()` meant a slow settings read decided
        // whether a suspended account was caught at all.
        Promise.race([getAccountBlock(userId), fallbackAfter(2500, null)]).catch(() => null),
        Promise.race([ensureRuntimeConfig().then(() => true), fallbackAfter(2500, false)]).catch(
          () => false
        ),
        // What this plan may press, for every lock in the product. Raced like the
        // rest, and a timeout resolves to `null`, which the provider reads as "not
        // known" and allows — the server gate behind each button still refuses, so
        // a slow read costs a late refusal rather than a dashboard of dead controls.
        // Request-cached, so the gated pages below share this one read.
        Promise.race([accessSnapshot(userId), fallbackAfter(2500, null)]).catch(() => null),
      ]);

      const primaryEmail = user?.emailAddresses?.[0]?.emailAddress || "";
      const fullName = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : null;
      const avatarUrl = user?.imageUrl || null;

      userDetails = {
        name: fullName || "User",
        email: primaryEmail,
      };

      if (primaryEmail) {
        // Auto-heal DB user record if it was born with placeholder or missing name/avatar
        prisma.user
          .updateMany({
            where: {
              id: userId,
              OR: [
                { email: { contains: "@placeholder" } },
                { name: null },
                { avatar: null },
              ],
            },
            data: {
              email: primaryEmail,
              ...(fullName ? { name: fullName } : {}),
              ...(avatarUrl ? { avatar: avatarUrl } : {}),
            },
          })
          .catch(() => {});
      }

      workspaces = context?.workspaces || [];
      activeWorkspaceId = context?.activeWorkspaceId ?? null;
      isAdmin = admin;
      block = accountBlock;
      access = snapshot;
      // Only read the flags when the settings really loaded. On a cold instance
      // whose read timed out, `getFlags()` answers with the code defaults, which
      // would quietly drop the maintenance banner the admin switched on.
      if (configReady && runtimeConfigLoaded()) {
        flags = getFlags();
        maintenance = flags.maintenanceEnabled
          ? flags.maintenanceMessage ||
            "Scheduled maintenance is in progress. Some features may be briefly unavailable."
          : null;
      }
      touchLastSeen(userId);
    } catch (err) {
      console.warn("[DashboardLayout] Fast fallback for user/workspaces:", err);
    }
  }

  return (
    <DashboardShell
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      userDetails={userDetails}
      isAdmin={isAdmin}
      accountBlock={block}
      maintenanceMessage={maintenance}
      affiliateEnabled={flags.affiliateEnabled}
      access={access}
    >
      {/* Watches for admin changes so an open tab never serves a stale catalogue. */}
      {userId && <ConfigSync />}
      {children}
    </DashboardShell>
  );
}
