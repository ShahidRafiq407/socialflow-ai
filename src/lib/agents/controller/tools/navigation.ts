// ============================================================================
// CONTROLLER TOOLS — NAVIGATION
//
// How the controller satisfies "give me a link and clicking it opens that exact
// thing". `open_tab` builds a verified in-app link; the runtime turns whatever
// this returns into a clickable artifact card.
// ============================================================================

import prisma from "@/lib/db";
import type { ToolDef } from "@/lib/agents/chat/tools";
import {
  DASHBOARD_TABS,
  buildDeepLink,
  deepLinkLabel,
  describeDashboardTabs,
  isDashboardTab,
  type DashboardTab,
} from "../navigation";

export const NAVIGATION_TOOLS: ToolDef[] = [
  {
    name: "open_tab",
    description:
      "Give the user a clickable link that opens a specific dashboard tab, optionally focused on one exact object " +
      "(e.g. the Content Studio already loaded with a generated post, or the Content Library scrolled to it). " +
      "Call this whenever the user asks to be taken somewhere, or right after you create something they will want to " +
      "review. The link is rendered as a button in the chat.\n\nAvailable tabs:\n" +
      describeDashboardTabs(),
    parameters: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          enum: Object.keys(DASHBOARD_TABS),
          description: "Which dashboard tab to open",
        },
        focus: {
          type: "string",
          description:
            "Optional id/value that focuses one object on that tab — a Post id for ai-studio/content, a view name for goals, a connector key for plugins.",
        },
        title: { type: "string", description: "Short label for the link card, e.g. 'Instagram feed post'" },
        note: { type: "string", description: "One line explaining what the user will find there" },
      },
      required: ["tab"],
    },
    execute: async (args, ctx) => {
      if (!isDashboardTab(args.tab)) {
        return { error: `Unknown tab "${args.tab}". Valid tabs: ${Object.keys(DASHBOARD_TABS).join(", ")}` };
      }
      const tab = args.tab as DashboardTab;
      const spec = DASHBOARD_TABS[tab];
      const focus = typeof args.focus === "string" && args.focus.trim() ? args.focus.trim() : undefined;

      // A link to a post that does not exist is worse than no link, so verify.
      let verified: Record<string, unknown> | undefined;
      if (focus && (tab === "ai-studio" || tab === "content")) {
        const post = await prisma.post.findFirst({
          where: { id: focus, workspaceId: ctx.workspaceId },
          select: { id: true, platform: true, format: true, status: true, mediaType: true },
        });
        if (!post) {
          return {
            error: `No post with id "${focus}" exists in this workspace. Create or look up the post first, then link to it.`,
          };
        }
        verified = { platform: post.platform, format: post.format, status: post.status, mediaType: post.mediaType };
      }

      const href = buildDeepLink(tab, focus);
      return {
        href,
        tab,
        tabLabel: spec.label,
        label: deepLinkLabel(tab),
        title: args.title || spec.label,
        note: args.note,
        focus,
        target: verified,
      };
    },
  },
];
