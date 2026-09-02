import type { AttributionRow, GrowthMetrics } from "@/lib/growth/metrics";
import type {
  GrowthActivityItem,
} from "@/actions/goals";
import type {
  GrowthKPIs,
  GrowthStrategy,
  LeadEventItem,
  PublishHistoryItem,
  TrackingStatus,
} from "@/lib/types/growth";
import type { ChannelAdvice } from "@/lib/growth/channelAdvisor";
import type { WordPressSiteView } from "@/actions/wordpressSite";

/**
 * Everything the Lead Goal HQ tabs need, resolved once on the server.
 *
 * Kept in its own module (not a `"use server"` file) so both the page and the
 * client components can import the type without pulling server code into the
 * browser bundle.
 */
export interface GoalHQData {
  workspaceId: string;
  workspaceName: string;
  industry: string;
  website: string;
  /** False when the workspace has no name/industry yet — the AI refuses to guess. */
  hasBrandDNA: boolean;

  goal: any | null;
  kpis: GrowthKPIs;
  strategy: GrowthStrategy | null;
  metrics: GrowthMetrics;
  needsSetup: boolean;

  connectedPlatforms: string[];

  /** "Post here" advice, so the user never has to guess at a checkbox list. */
  advice: ChannelAdvice;

  activity: GrowthActivityItem[];
  history: PublishHistoryItem[];
  leads: LeadEventItem[];
  attribution: {
    byPlatform: AttributionRow[];
    byPillar: AttributionRow[];
    byChannel: AttributionRow[];
  };
  tracking: TrackingStatus;
  wordpress: WordPressSiteView;

  /** Absolute app origin, used to build the website tag snippet. */
  appBaseUrl: string;
}

/**
 * Four tabs, and only four: what you want, the two places leads can come from,
 * and the switch that runs it. Everything else is a section inside one of them.
 */
export type GoalTabKey = "goal" | "social" | "website" | "autopilot";

/** The inner rail shared by both channel tabs. */
export type ChannelSection = "plan" | "today" | "published" | "leads";
