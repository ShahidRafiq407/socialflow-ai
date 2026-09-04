// ============================================================================
// CAPABILITY LIMITS
//
// The edge of what this workspace can actually do right now — derived from live
// state, never written down as a list of "things this product cannot do".
//
// Why derived: a hand-written catalogue of missing features goes stale the day a
// connector ships, and it teaches the model to refuse work that now works. Every
// row below comes from something real: a settings toggle that is off, a connector
// with no credentials, a connector that is only planned, a plan that excludes the
// feature, a platform with no publishing API. Anything that is NOT in this list
// and NOT covered by a tool in the prompt is out of scope — that is one rule, not
// a list, so it can never go stale either.
//
// Pure module (only pure imports), so the whole boundary is unit-testable with no
// database, no model and no network.
// ============================================================================

import type { ChatSettings } from "./settingsShape";
import { buildDeepLink, type DashboardTab } from "./navigation";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { PLATFORM_CAPABILITIES } from "@/lib/capabilities/platformCapabilities";
import { getPlanConfig, planHasFeature } from "@/lib/billing/plans";

/** Why something cannot be done. Ordered from "user can fix it" to "we can't". */
export type LimitReason =
  | "setting_off"
  | "not_connected"
  | "plan_locked"
  | "not_built"
  | "out_of_scope";

/** Where the user goes to lift the limit themselves, when they can. */
export interface LimitFix {
  label: string;
  href: string;
  tab: DashboardTab;
}

export interface CapabilityLimit {
  /** Stable id, so the same limit is recognisable across turns. */
  key: string;
  /** What is unavailable, phrased as the user would ask for it. */
  capability: string;
  reason: LimitReason;
  /** One line: why, and what would lift it. */
  detail: string;
  fix: LimitFix | null;
}

/** The slice of the workspace snapshot the boundary is computed from. */
export interface LimitSnapshot {
  connectedPlatforms: string[];
  connectedConnectors: string[];
  hasWordPress: boolean;
}

/** The one tool that turns "I can't" into something the developer will see. */
export const REPORT_LIMITATION_TOOL = "report_limitation";

/**
 * The rule that makes the boundary behaviour real. Lives here rather than inside
 * the prompt template so the contract — apologise once, say the actual reason,
 * offer the nearest thing, record it — is testable.
 */
export const LIMITATION_RULE =
  `**Own the boundary, then record it.** If a request needs something no tool here can do, or something the ` +
  `"What you cannot do right now" section says is off, unconnected, plan-locked or not built yet: do not improvise ` +
  `and do not promise it for later. Say it in one plain sentence, apologise once, name the exact reason, give the ` +
  `user the link that lifts it when there is one, offer the closest thing you CAN do — and call ` +
  `${REPORT_LIMITATION_TOOL} so the ask is logged for the people who build this product. Partly-possible requests ` +
  `are not refusals: do every part you can, then flag only the part you cannot.`;

// ---------------------------------------------------------------------------
// Settings toggles
//
// These matter more than they look: a disabled capability is REMOVED from the
// tool list, so without this the model cannot tell "never existed" from "the
// user switched it off two minutes ago" — and it guesses.
// ---------------------------------------------------------------------------

const SETTING_LIMITS: {
  flag: keyof ChatSettings;
  key: string;
  capability: string;
  toggle: string;
}[] = [
  {
    flag: "allowMediaGen",
    key: "setting:media",
    capability: "Generating an image or a video",
    toggle: "Media generation",
  },
  {
    flag: "allowWebSearch",
    key: "setting:web",
    capability: "Searching the web, checking live search results, or reading a URL",
    toggle: "Web search",
  },
  {
    flag: "allowPublishing",
    key: "setting:publishing",
    capability: "Publishing, approving, scheduling or rescheduling a post",
    toggle: "Publishing",
  },
  {
    flag: "allowPlugins",
    key: "setting:plugins",
    capability: "Plugin work (GitHub, HeyGen) and anything on an MCP server",
    toggle: "Plugins",
  },
  {
    flag: "memoryEnabled",
    key: "setting:memory",
    capability: "Remembering anything after this conversation ends",
    toggle: "Memory",
  },
];

/** Deep link that opens the panel holding the switch, so "turn it on" is one click. */
function chatPanelFix(panel: "settings" | "requests", label: string): LimitFix {
  return { label, href: buildDeepLink("chat", null, { panel }), tab: "chat" };
}

/** Where a captured feature request can be read back. */
export function requestsPanelLink(): string {
  return buildDeepLink("chat", null, { panel: "requests" });
}

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

function titleCasePlatform(id: string): string {
  return id.length <= 2 ? id.toUpperCase() : id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Platforms this product can compose for but cannot publish to over an API —
 * every one of their formats is manual export. Read from the capability table so
 * the day a real publisher lands, this row disappears on its own.
 */
export function manualOnlyPlatforms(): string[] {
  const modes = new Map<string, Set<string>>();
  for (const cap of Object.values(PLATFORM_CAPABILITIES)) {
    if (!cap || cap.category !== "organic") continue;
    const set = modes.get(cap.platform) || new Set<string>();
    set.add(cap.publishingMode);
    modes.set(cap.platform, set);
  }

  const out: string[] = [];
  for (const [platform, set] of modes) {
    if (!set.has("api_direct")) out.push(platform);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------

/**
 * Everything this workspace cannot do at this moment, most fixable first.
 *
 * `planTier` is only passed when billing is actually enforced — with the billing
 * kill-switch off, no plan row appears, because telling a user their plan blocks
 * something that in fact works would be a lie in the other direction.
 */
export function computeLimits(params: {
  settings: ChatSettings;
  snapshot: LimitSnapshot;
  planTier?: string | null;
}): CapabilityLimit[] {
  const { settings, snapshot } = params;
  const limits: CapabilityLimit[] = [];

  for (const entry of SETTING_LIMITS) {
    if (settings[entry.flag] !== false) continue;
    limits.push({
      key: entry.key,
      capability: entry.capability,
      reason: "setting_off",
      detail:
        `Switched off for this workspace — the "${entry.toggle}" switch in this chat's Settings panel turns it ` +
        `back on. The matching tools are not in your list this turn, so do not try to work around it.`,
      fix: chatPanelFix("settings", "Open chat settings"),
    });
  }

  const connected = new Set((snapshot.connectedConnectors || []).map((k) => k.toLowerCase()));
  for (const def of CONNECTOR_REGISTRY) {
    if (connected.has(def.key.toLowerCase())) continue;
    limits.push({
      key: `connector:${def.key}`,
      capability: `${def.name} — ${def.tagline}`,
      reason: "not_connected",
      detail:
        `No ${def.name} credentials are saved for this workspace, so ` +
        `${(def.chatTools || []).slice(0, 3).join(", ") || "its tools"} cannot run.`,
      fix: { label: `Connect ${def.name}`, href: buildDeepLink("plugins", def.key), tab: "plugins" },
    });
  }

  if ((snapshot.connectedPlatforms || []).length === 0) {
    limits.push({
      key: "social:none",
      capability: "Publishing to any social account",
      reason: "not_connected",
      detail:
        "No social account is linked yet. Copy, images, drafts and calendar scheduling all still work — only the " +
        "moment of going live is blocked.",
      fix: { label: "Connect an account", href: buildDeepLink("integrations"), tab: "integrations" },
    });
  }

  if (!snapshot.hasWordPress) {
    limits.push({
      key: "wordpress",
      capability: "Publishing an article or page to WordPress",
      reason: "not_connected",
      detail: "No WordPress site is connected, so an article can be written here but not posted to their site.",
      fix: { label: "Connect WordPress", href: buildDeepLink("plugins"), tab: "plugins" },
    });
  }

  for (const platform of manualOnlyPlatforms()) {
    const name = titleCasePlatform(platform);
    limits.push({
      key: `platform:${platform}`,
      capability: `Publishing straight to ${name}`,
      reason: "not_built",
      detail:
        `${name} has no publishing API in this product yet. You can write it, generate the media and save it — ` +
        `the upload itself is manual.`,
      fix: null,
    });
  }

  if (params.planTier) {
    const tier = params.planTier;
    const plan = getPlanConfig(tier);
    const billingFix: LimitFix = { label: "See plans", href: buildDeepLink("billing"), tab: "billing" };

    // Asked of the entitlement table rather than of a boolean on the plan card,
    // so the answer the chat gives a user is the same answer the gate will give
    // their next request.
    if (!planHasFeature(tier, "aistudio.generate")) {
      limits.push({
        key: "plan:ai",
        capability: "Any AI generation at all — copy, images, video, research",
        reason: "plan_locked",
        detail: `The ${plan.name} plan covers manual composing, scheduling and publishing only.`,
        fix: billingFix,
      });
    } else {
      if (!planHasFeature(tier, "media.video")) {
        limits.push({
          key: "plan:video",
          capability: "AI video generation",
          reason: "plan_locked",
          detail: `Video generation is not part of the ${plan.name} plan. Images and copy are.`,
          fix: billingFix,
        });
      }
      if (!planHasFeature(tier, "export.zip")) {
        limits.push({
          key: "plan:zip",
          capability: "Inspecting a ZIP or a whole project folder",
          reason: "plan_locked",
          detail: `Archive inspection is not part of the ${plan.name} plan. Single documents still work.`,
          fix: billingFix,
        });
      }
    }
  }

  return limits;
}

// ---------------------------------------------------------------------------
// Rendering + lookups
// ---------------------------------------------------------------------------

const REASONS: LimitReason[] = ["setting_off", "not_connected", "plan_locked", "not_built", "out_of_scope"];

export function isLimitReason(value: unknown): value is LimitReason {
  return typeof value === "string" && (REASONS as string[]).includes(value);
}

const REASON_HEADINGS: Record<LimitReason, string> = {
  setting_off: "Switched off in this workspace (the user can turn it back on)",
  not_connected: "Not connected yet (the user can connect it)",
  plan_locked: "Not included in the current plan",
  not_built: "Not built yet — no tool exists for it",
  out_of_scope: "Outside this product",
};

/** Tabs a limit can send the user to, as an enum a model can pick safely. */
export type LimitFixTab = "settings" | "plugins" | "integrations" | "billing";

const FIX_TABS: Record<LimitFixTab, () => LimitFix> = {
  settings: () => chatPanelFix("settings", "Open chat settings"),
  plugins: () => ({ label: "Open Plugins", href: buildDeepLink("plugins"), tab: "plugins" }),
  integrations: () => ({ label: "Open Integrations", href: buildDeepLink("integrations"), tab: "integrations" }),
  billing: () => ({ label: "See plans", href: buildDeepLink("billing"), tab: "billing" }),
};

/**
 * The link that lifts a limit, from either an explicit tab or the reason alone.
 * Returns null when there is genuinely nothing the user can click — a promise of
 * a fix that does not exist is worse than admitting there isn't one.
 */
export function limitFix(params: { reason?: LimitReason | null; tab?: string | null }): LimitFix | null {
  const tab = params.tab as LimitFixTab | undefined | null;
  if (tab && tab in FIX_TABS) return FIX_TABS[tab]();

  switch (params.reason) {
    case "setting_off":
      return FIX_TABS.settings();
    case "plan_locked":
      return FIX_TABS.billing();
    case "not_connected":
      return FIX_TABS.plugins();
    default:
      return null;
  }
}

/**
 * The prompt section. Grouped by reason, because the reason decides what the
 * model should say next: "turn it on", "connect it", "upgrade", or "it doesn't
 * exist yet, and I've logged that you wanted it".
 */
export function describeLimitsForPrompt(limits: CapabilityLimit[]): string {
  if (limits.length === 0) {
    return (
      "Nothing is switched off, unconnected or plan-locked right now. The only boundary left is the tool list " +
      "above: if no tool can do it, it is out of scope — say so and log it."
    );
  }

  const blocks: string[] = [];
  for (const reason of REASONS) {
    const rows = limits.filter((l) => l.reason === reason);
    if (rows.length === 0) continue;
    blocks.push(
      `**${REASON_HEADINGS[reason]}**\n` +
        rows
          .map((row) => {
            const fix = row.fix ? ` → ${row.fix.label}: ${row.fix.href}` : "";
            return `- ${row.capability} — ${row.detail}${fix}`;
          })
          .join("\n")
    );
  }

  return blocks.join("\n\n");
}







