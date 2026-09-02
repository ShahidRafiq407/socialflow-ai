// ============================================================================
// DEEP LINKS
//
// The controller's answer to "give me a link and clicking it opens that exact
// thing in its own tab". Every tab that can be targeted declares its route and
// the query parameter that focuses one object, so links are built in one place
// and the receiving pages read one documented param.
//
// Pure module — safe on both server and client.
// ============================================================================

export type DashboardTab =
  | "dashboard"
  | "ai-studio"
  | "chat"
  | "content"
  | "goals"
  | "brand"
  | "analytics"
  | "article-writer"
  | "integrations"
  | "plugins"
  | "billing"
  | "settings";

interface TabSpec {
  tab: DashboardTab;
  label: string;
  path: string;
  /** Query param that focuses a single object on that page, when it has one. */
  focusParam?: string;
  /** What the focus param points at, used in tool descriptions. */
  focusDescription?: string;
}

export const DASHBOARD_TABS: Record<DashboardTab, TabSpec> = {
  dashboard: { tab: "dashboard", label: "Dashboard", path: "/dashboard" },
  "ai-studio": {
    tab: "ai-studio",
    label: "Content Studio",
    path: "/dashboard/ai-studio",
    focusParam: "postId",
    focusDescription: "a Post id — the studio opens loaded with that post's platform, format, copy and media",
  },
  chat: { tab: "chat", label: "Automate Task", path: "/dashboard/chat", focusParam: "session" },
  content: {
    tab: "content",
    label: "Content Library",
    path: "/dashboard/content",
    focusParam: "focus",
    focusDescription: "a Post id — the library scrolls to and highlights that post",
  },
  goals: {
    tab: "goals",
    label: "Lead Goal",
    path: "/dashboard/goals",
    focusParam: "view",
    focusDescription: 'one of "goal" | "plan" | "today" | "history" | "leads" | "autopilot"',
  },
  brand: { tab: "brand", label: "Brand DNA", path: "/dashboard/brand" },
  analytics: { tab: "analytics", label: "Analytics", path: "/dashboard/analytics" },
  "article-writer": { tab: "article-writer", label: "Article Writer", path: "/dashboard/article-writer" },
  integrations: {
    tab: "integrations",
    label: "Integrations",
    path: "/dashboard/integrations",
    focusParam: "platform",
    focusDescription: "a platform key such as instagram / linkedin / facebook",
  },
  plugins: {
    tab: "plugins",
    label: "Plugin",
    path: "/dashboard/plugins",
    focusParam: "connector",
    focusDescription: "a connector key such as github / heygen",
  },
  billing: { tab: "billing", label: "Billing", path: "/dashboard/billing" },
  settings: { tab: "settings", label: "Settings", path: "/dashboard/settings" },
};

export function isDashboardTab(value: unknown): value is DashboardTab {
  return typeof value === "string" && value in DASHBOARD_TABS;
}

/** Builds an in-app link, optionally focused on one object. */
export function buildDeepLink(
  tab: DashboardTab,
  focus?: string | null,
  extra?: Record<string, string | number | boolean | undefined | null>
): string {
  const spec = DASHBOARD_TABS[tab];
  const params = new URLSearchParams();

  if (focus && spec.focusParam) params.set(spec.focusParam, String(focus));
  for (const [key, value] of Object.entries(extra || {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${spec.path}?${qs}` : spec.path;
}

/** Human label for the deep-link button on an artifact card. */
export function deepLinkLabel(tab: DashboardTab): string {
  return `Open in ${DASHBOARD_TABS[tab].label}`;
}

/** The canonical place to review/edit a generated post. */
export function studioLinkForPost(postId: string): string {
  return buildDeepLink("ai-studio", postId);
}

/** The canonical place to find a post in the library. */
export function libraryLinkForPost(postId: string): string {
  return buildDeepLink("content", postId);
}

/** Compact catalogue injected into the controller prompt so it links correctly. */
export function describeDashboardTabs(): string {
  return (Object.values(DASHBOARD_TABS) as TabSpec[])
    .map((spec) => {
      const focus = spec.focusParam
        ? ` — focus with ?${spec.focusParam}=<value>${spec.focusDescription ? ` (${spec.focusDescription})` : ""}`
        : "";
      return `- ${spec.label} (tab id "${spec.tab}"): ${spec.path}${focus}`;
    })
    .join("\n");
}
