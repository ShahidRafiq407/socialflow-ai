// ============================================================================
// SETTINGS — SHARED TYPES
//
// The server page resolves everything once and hands it to the client shell as
// plain JSON. No tokens or credentials ever appear in this shape — connection
// state is booleans only.
// ============================================================================

import type { PlanTier } from "@/lib/billing/plans";

export type SettingsView = "profile" | "workspace" | "preferences" | "billing" | "data" | "danger";

export const SETTINGS_VIEW_KEYS: SettingsView[] = [
  "profile",
  "workspace",
  "preferences",
  "billing",
  "data",
  "danger",
];

export function isSettingsView(value: string): value is SettingsView {
  return (SETTINGS_VIEW_KEYS as string[]).includes(value);
}

/** The AI-assistant defaults the user can tune from Preferences. */
export interface ChatSettingsSummary {
  replyLanguage: "auto" | "english" | "roman-urdu" | "urdu";
  replyStyle: "executive" | "detailed" | "concise";
  autonomy: "auto" | "confirm";
  memoryEnabled: boolean;
  customInstructions: string;
}

export interface SettingsBillingData {
  tier: PlanTier;
  status: string;
  /**
   * The subscription came from a Lemon Squeezy test store, so no real money moved.
   * Worth saying on screen: a test-mode subscription grants nothing in production.
   */
  testMode: boolean;
  /** Spendable right now — this period's grant plus purchased credits, net of holds. */
  creditsAvailable: number;
  /** What the plan grants at the start of each period. */
  monthlyGrant: number;
  /** Share of this period's grant already spent, 0-100. */
  percentUsed: number;
  /**
   * The plan as the SERVER sees it, admin overrides included.
   *
   * These are passed down rather than read from `plans.ts` in the card, because
   * the card is a client component: the browser's copy of the plan tables is the
   * code default and has never had the back office's overrides applied to it, so
   * a renamed plan or an edited price showed correctly in the server HTML and then
   * changed back on hydration.
   */
  planName: string;
  priceMonthly: number;
  oneTimePrice?: number;
  /** Connected-account ceiling per workspace, -1 for unlimited. */
  socialAccountsPerWorkspace: number;
  hasAiGeneration: boolean;
  hasAiVideo: boolean;
}

export interface SettingsWorkspaceData {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  createdAt: string;
  /** trackingKey present → the website lead tag can be installed/verified. */
  trackingInstalled: boolean;
  workspaceCount: number;
}

export interface SettingsCounts {
  // Current workspace (first workspace — same one the rest of the app uses).
  posts: number;
  socialAccounts: number;
  scheduledPosts: number;
  chatSessions: number;
  connectors: number;
  mcpServers: number;

  // Across every workspace the user owns — shown in the close-account dialog.
  totalWorkspaces: number;
  totalPosts: number;
  totalSocialAccounts: number;
  totalScheduledPosts: number;
  totalChatSessions: number;
}

export interface SettingsData {
  workspace: SettingsWorkspaceData;
  chatSettings: ChatSettingsSummary;
  billing: SettingsBillingData;
  counts: SettingsCounts;
}

/** Toast shape shared by every settings section. */
export interface SettingsToast {
  id: string;
  tone: "success" | "error" | "info";
  text: string;
}
