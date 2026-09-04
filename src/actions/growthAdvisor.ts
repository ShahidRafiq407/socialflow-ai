"use server";

import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { suggestChannels, type ChannelAdvice } from "@/lib/growth/channelAdvisor";
import type { LeadSource } from "@/lib/types/growth";
import {
  completeAction,
  failAction,
  isEntitlementError,
  requireAction,
  type ActionTicket,
} from "@/lib/billing/entitlements";
import { withMeterContext } from "@/lib/billing/meter";

/**
 * The one action behind "which platforms should I post on?".
 *
 * Like every other `"use server"` export it is a public HTTP endpoint that
 * receives `workspaceId` from the browser, so it proves ownership first. The
 * heavy lifting lives in `@/lib/growth/channelAdvisor`, which the page also
 * calls directly on the server for the first render.
 *
 * This entrance is the one that spends a frontier-model call, and it is behind a
 * button the user can press as often as they like — so it is gated and charged as
 * `goal.channelAdvice`. The page's own render uses `fast`, makes no model call and
 * is charged nothing, which is why the gate is here and not in the library.
 *
 * A refusal still returns a real shortlist. The ranking is arithmetic over the
 * workspace's own tracked clicks and leads, and withholding it would be punishing
 * the plan for something that costs nothing; only the AI-written reasons are
 * withheld, and `error` says so.
 */

const EMPTY: ChannelAdvice = {
  suggestions: [],
  websiteNote: null,
  basis: "RULES",
  nothingConnected: true,
  aiWritten: false,
  generatedAt: new Date().toISOString(),
};

function normalizeSources(value: any): LeadSource[] {
  const list = Array.isArray(value) ? value : [];
  const out = list
    .map((v) => String(v).toUpperCase())
    .filter((v): v is LeadSource => v === "SOCIAL" || v === "WEBSITE");
  return out.length ? Array.from(new Set(out)) : ["SOCIAL"];
}

export async function getChannelAdvice(
  workspaceId: string,
  input: {
    leadSources?: LeadSource[] | string[];
    leadTarget?: number;
    timeframeDays?: number;
    leadType?: string;
  } = {}
): Promise<ChannelAdvice> {
  let ticket: ActionTicket | null = null;
  try {
    if (!workspaceId) return EMPTY;

    const { userId } = await auth().catch(() => ({ userId: null }) as any);
    if (!userId) return EMPTY;

    const owned = await prisma.workspace
      .findFirst({ where: { id: workspaceId, userId }, select: { id: true } })
      .catch(() => null);
    if (!owned) return EMPTY;

    // Anything the caller leaves out falls back to the saved goal rather than to
    // a made-up default, so the advice always matches what will actually run.
    const goal = await (prisma as any).growthGoal
      .findUnique({ where: { workspaceId } })
      .catch(() => null);

    const params = {
      workspaceId,
      leadSources: normalizeSources(input.leadSources ?? goal?.leadSources),
      leadTarget: Math.max(1, Number(input.leadTarget ?? goal?.leadTarget ?? 10)),
      timeframeDays: Math.max(1, Number(input.timeframeDays ?? goal?.timeframeDays ?? 30)),
      leadType: String(input.leadType ?? goal?.leadType ?? "LEADS"),
    };

    try {
      ticket = await requireAction({
        userId,
        action: "goal.channelAdvice",
        workspaceId,
        referenceId: params.leadType,
      });
    } catch (gateErr) {
      if (!isEntitlementError(gateErr)) throw gateErr;
      const rules = await suggestChannels({ ...params, fast: true }).catch(() => EMPTY);
      return { ...rules, error: gateErr.gate.message, upgrade: true };
    }

    const advice = await withMeterContext(
      {
        userId,
        workspaceId,
        feature: "goals",
        action: "goal.channelAdvice",
        referenceId: params.leadType,
      },
      () => suggestChannels(params)
    );

    // `suggestChannels` swallows its own model failures and hands back the
    // arithmetic, so a resolved value is not proof that anything was spent. Only
    // `aiWritten` is, and a shortlist we could have produced without a model is
    // not worth a credit.
    if (advice.aiWritten) {
      await completeAction({
        ticket,
        measureCost: true,
        referenceType: "channel_advice",
        referenceId: workspaceId,
      });
    } else {
      await failAction(ticket, { note: "Refunded: the shortlist came from your own data" }).catch(
        () => null
      );
    }
    ticket = null;

    return advice;
  } catch (error) {
    console.warn("[getChannelAdvice] falling back to empty advice:", error);
    if (ticket) {
      await failAction(ticket, { note: "Refunded: the advisor could not be reached" }).catch(
        () => null
      );
    }
    return EMPTY;
  }
}
