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

  /** Absolute app origin, used to show the external-cron URL and the tag snippet. */
  appBaseUrl: string;
}

export type GoalTabKey = "goal" | "plan" | "today" | "history" | "leads" | "autopilot";
