// ============================================================================
// CONTROLLER TOOLS — THE BOUNDARY
//
// One tool: report_limitation. It is what turns "sorry, I can't do that" from a
// sentence that disappears into a chat log into a row the people who build this
// product can read, count and act on.
//
// Design notes that matter:
//   • It is NOT in MUTATING_TOOLS. An apology must never sit behind a confirm
//     prompt — the user asked for something impossible, they get told at once.
//   • It never fails the turn. If the write fails the model still receives a
//     result telling it to be honest with the user anyway.
//   • The fix link comes from a small enum the model picks from, not a URL the
//     model invents, so "click here to turn it on" always lands somewhere real.
// ============================================================================

import type { ToolDef } from "@/lib/agents/chat/tools";
import { isLimitReason, limitFix, requestsPanelLink, REPORT_LIMITATION_TOOL } from "../limits";
import { recordFeatureRequest } from "../requests";

export const LIMIT_TOOLS: ToolDef[] = [
  {
    name: REPORT_LIMITATION_TOOL,
    description:
      "Record something the user asked for that this product cannot do right now — a switched-off setting, an " +
      "unconnected integration, a plan-locked or unbuilt feature, or anything no tool here covers. Call this in the " +
      "same turn you tell the user, so the ask reaches the people who build this product and can be added later. " +
      "Use it for the part you cannot do even when you completed the rest of the request. Do not call it for a tool " +
      "that merely errored — that is a failure to retry or report, not a missing feature.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short name of the missing capability, as a feature would be named on a roadmap — e.g. 'Publish to " +
            "Pinterest via API', 'Connect Mailchimp'. Keep the wording stable: the same title twice is counted as " +
            "the same ask instead of filed twice.",
        },
        request: {
          type: "string",
          description: "What the user actually asked for, in their own words where possible.",
        },
        reason: {
          type: "string",
          enum: ["setting_off", "not_connected", "plan_locked", "not_built", "out_of_scope"],
          description:
            "Why it cannot be done: setting_off (a switch in this chat's Settings is off), not_connected (no " +
            "credentials saved), plan_locked (the plan excludes it), not_built (on the roadmap, no tool exists), " +
            "out_of_scope (nothing in this product covers it).",
        },
        detail: {
          type: "string",
          description: "One line on the exact blocker, specific enough for a developer to act on it.",
        },
        nearest: {
          type: "string",
          description: "The closest thing you did or offered instead, if anything.",
        },
        fixTab: {
          type: "string",
          enum: ["settings", "plugins", "integrations", "billing"],
          description:
            "Where the user can lift this themselves, if they can. Omit when there is genuinely nothing to click.",
        },
      },
      required: ["title", "request", "reason"],
    },
    execute: async (args, ctx) => {
      const reason = isLimitReason(args?.reason) ? args.reason : "out_of_scope";
      const fix = limitFix({ reason, tab: typeof args?.fixTab === "string" ? args.fixTab : null });

      const result = await recordFeatureRequest(ctx.workspaceId, {
        title: String(args?.title || ""),
        request: String(args?.request || args?.title || ""),
        reason,
        detail: typeof args?.detail === "string" ? args.detail : null,
        nearest: typeof args?.nearest === "string" ? args.nearest : null,
        sessionId: ctx.sessionId || null,
      });

      return {
        recorded: result.recorded,
        slug: result.slug,
        reason,
        timesAsked: result.timesAsked,
        firstTime: result.firstTime,
        fix,
        requestsUrl: requestsPanelLink(),
        note: result.recorded
          ? result.firstTime
            ? "Logged for the product team. Tell the user plainly what is blocked, why, and what you did instead — " +
              "and that the request has been passed on. Do not promise a date."
            : `Logged — this is ask #${result.timesAsked} for the same thing. Mention it has been passed on again, ` +
              `not that it is coming.`
          : "Could not be saved. Still tell the user the truth about what is blocked and why — never pretend it worked.",
      };
    },
  },
];
