"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Plug,
  Server as ServerIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  RefreshCw,
  TrendingUp,
  Copy,
  Check,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { fetchLiveTrendingNews, TrendItem } from "@/actions/trends";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import type { ConnectorView } from "@/actions/connections";
import type { McpServerView } from "@/actions/mcpServers";
import type { TrackingStatus } from "@/lib/types/growth";
import {
  PLUGIN_CATALOG,
  PLUGIN_SECTIONS,
  getPluginEntry,
  pluginsInSection,
  resolvePluginKey,
  type PluginCatalogEntry,
} from "@/lib/plugins/catalog";
import { ConnectConnectorModal } from "./plugins/ConnectConnectorModal";
import { ConnectCmsTargetModal } from "./plugins/ConnectCmsTargetModal";
import { AddMcpServerModal } from "./plugins/AddMcpServerModal";
import { McpServerCard } from "./plugins/McpServerCard";
import { WebsiteTagCard } from "./plugins/WebsiteTagCard";
import { PluginLogoTile } from "./plugins/BrandLogos";
import { PluginSection, type PluginRowStatus } from "./plugins/PluginDirectory";
import PublishTargetsPanel from "./article-writer/PublishTargetsPanel";
import type { PublishTargetsView } from "./article-writer/PublishTargetsPanel";
import CustomSiteGuide from "./plugins/CustomSiteGuide";

/** How many rows a category shows before the rest fold into an overflow row. */
const VISIBLE_PER_SECTION = 4;

/**
 * MCP servers are matched to their catalog row by hostname, not by the whole URL:
 * Zapier hands out a personal URL and GitMCP takes a repo path, so the paths
 * differ per workspace while the host is what identifies the service.
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

interface PluginsHQProps {
  workspaceId: string;
  connections: ConnectorView[];
  mcpServers: McpServerView[];
  tracking: TrackingStatus;
  publishTargets: PublishTargetsView;
}

// Deep link from the chat controller or the Goal page:
// /dashboard/plugins?connector=<key>. Every spelling it might use — "wp",
// "Google Drive", "lead-tag" — resolves through the catalog's own alias table, so
// a new one is a line in the catalog instead of another Set in this file.

export default function PluginsHQ({
  workspaceId,
  connections,
  mcpServers,
  tracking,
  publishTargets,
}: PluginsHQProps) {
  const [activeTab, setActiveTab] = useState<"connectors" | "trends">("connectors");

  const [connectionsState, setConnectionsState] = useState<ConnectorView[]>(connections);
  const [mcpServersState, setMcpServersState] = useState<McpServerView[]>(mcpServers);
  const [trackingState, setTrackingState] = useState<TrackingStatus>(tracking);

  const [activeConnectorKey, setActiveConnectorKey] = useState<string | null>(null);
  const [activeCmsKey, setActiveCmsKey] = useState<string | null>(null);
  const [mcpPresetKey, setMcpPresetKey] = useState<string | null>(null);
  const [showAddMcpModal, setShowAddMcpModal] = useState(false);
  const [focusedConnector, setFocusedConnector] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [publishTargetsState, setPublishTargetsState] = useState(publishTargets);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Live Google News Trend & Competitor Spy State
  const [spyMode, setSpyMode] = useState<"trend" | "competitor">("trend");
  const [trendQuery, setTrendQuery] = useState("");
  const [competitorQuery, setCompetitorQuery] = useState("");
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [isFetchingTrends, startTransition] = useTransition();
  const [trendError, setTrendError] = useState<string | null>(null);
  const [copiedTrendId, setCopiedTrendId] = useState<string | null>(null);

  const getConnection = (key: string) => connectionsState.find((c) => c.providerKey === key);

  /** Which MCP hosts this workspace already has a server for. */
  const mcpByHost = useMemo(() => {
    const map = new Map<string, McpServerView>();
    for (const server of mcpServersState) {
      const host = hostOf(server.url);
      if (host) map.set(host, server);
    }
    return map;
  }, [mcpServersState]);

  /**
   * One status per directory row, whichever of the four backends owns it. A row
   * does not know which table it came from, and it should not have to.
   */
  const statusFor = (entry: PluginCatalogEntry): PluginRowStatus => {
    if (entry.backend === "connector") {
      const conn = getConnection(entry.key);
      if (conn?.status === "connected") return "connected";
      if (conn?.status === "failed" && conn.hasCredentials) return "error";
      return "idle";
    }
    if (entry.backend === "cms") {
      const target = publishTargetsState.targets.find((t) => t.providerKey === entry.key);
      if (target?.status === "connected") return "connected";
      return target?.status === "error" ? "error" : "idle";
    }
    if (entry.backend === "mcp") {
      const host = entry.mcp ? hostOf(entry.mcp.url) : null;
      const server = host ? mcpByHost.get(host) : undefined;
      if (!server) return "idle";
      return server.lastError ? "error" : "connected";
    }
    return trackingState.installed ? "connected" : "idle";
  };

  const search = searchQuery.trim().toLowerCase();
  const sections = useMemo(
    () =>
      PLUGIN_SECTIONS.map((section) => ({
        ...section,
        entries: pluginsInSection(section.key).filter(
          (entry) =>
            !search ||
            `${entry.name} ${entry.blurb} ${entry.can.join(" ")}`.toLowerCase().includes(search)
        ),
      })).filter((section) => section.entries.length > 0),
    [search]
  );

  const installedEntries = PLUGIN_CATALOG.filter((entry) => statusFor(entry) === "connected");
  /** A hand-typed MCP server has no catalog row to sit under, so it gets its own tile. */
  const customMcpServers = mcpServersState.filter((server) => {
    const host = hostOf(server.url);
    return !host || !PLUGIN_CATALOG.some((e) => e.mcp && hostOf(e.mcp.url) === host);
  });
  const installedCount = installedEntries.length + customMcpServers.length;

  /**
   * Only the platforms that are actually connected need publishing defaults —
   * the connect forms themselves live in the directory rows above.
   */
  const connectedCmsProviders = publishTargetsState.providers.filter((provider) =>
    publishTargetsState.targets.some((target) => target.providerKey === provider.key)
  );

  /** A row click opens whichever dialog that plugin's backend needs. */
  const openPlugin = (entry: PluginCatalogEntry) => {
    setActiveTab("connectors");

    if (entry.backend === "connector") {
      setActiveConnectorKey(entry.key);
      return;
    }
    if (entry.backend === "cms") {
      setActiveCmsKey(entry.key);
      return;
    }
    if (entry.backend === "mcp") {
      const host = entry.mcp ? hostOf(entry.mcp.url) : null;
      const existing = host ? mcpByHost.get(host) : undefined;
      if (existing) {
        // Already attached: its own card owns re-checking, disabling and removal,
        // and adding it twice would just fail on the duplicate URL.
        setFocusedConnector(null);
        document
          .getElementById(`mcp-${existing.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      setMcpPresetKey(entry.key);
      setShowAddMcpModal(true);
      return;
    }

    // The lead tag has no dialog — the snippet and the install check are the card.
    setFocusedConnector("website-tag");
    setTimeout(() => {
      document
        .getElementById("connector-website-tag")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    setTimeout(() => setFocusedConnector(null), 4200);
  };

  // A ?connector= link lands on the connectors tab with that row scrolled to and
  // ringed. If it is not connected yet the connect dialog opens too — that link
  // only exists because something still needs connecting. The param is consumed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = resolvePluginKey(new URLSearchParams(window.location.search).get("connector"));

    const url = new URL(window.location.href);
    if (url.searchParams.has("connector")) {
      url.searchParams.delete("connector");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
    if (!key) return;

    const entry = getPluginEntry(key);
    if (!entry) return;

    setActiveTab("connectors");
    setFocusedConnector(key);
    // The row may be folded into "see more" — scrolling to something hidden looks
    // like a dead link, so open its category first.
    setExpandedSections((prev) => (prev.includes(entry.section) ? prev : [...prev, entry.section]));

    const scroll = setTimeout(() => {
      document
        .getElementById(entry.backend === "tag" ? "connector-website-tag" : `plugin-${key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    // The website tag has no dialog — its whole form is on the card, so landing
    // on it is enough.
    const open =
      statusFor(entry) === "connected" || entry.backend === "tag"
        ? undefined
        : setTimeout(() => openPlugin(entry), 620);

    const unring = setTimeout(() => setFocusedConnector(null), 4200);

    return () => {
      clearTimeout(scroll);
      if (open) clearTimeout(open);
      clearTimeout(unring);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateConnection = (key: string, view: ConnectorView | undefined) => {

    setConnectionsState((prev) => {
      const rest = prev.filter((c) => c.providerKey !== key);
      if (!view) return rest;
      // listConnections returns all registry connectors; keep full set
      const registryKeys = CONNECTOR_REGISTRY.map((c) => c.key);
      const merged = registryKeys.map((k) => {
        if (k === key) return view;
        const existing = prev.find((c) => c.providerKey === k);
        return (
          existing || {
            providerKey: k,
            status: "pending",
            accountLabel: null,
            hasCredentials: false,
            lastVerifiedAt: null,
            lastError: null,
          }
        );
      });
      return merged;
    });
  };

  const handleScanTrends = (modeOverride?: "trend" | "competitor") => {
    const currentMode = modeOverride || spyMode;
    const query = currentMode === "competitor" ? competitorQuery.trim() : trendQuery.trim();
    if (!query) {
      setTrendError(
        currentMode === "competitor"
          ? "Enter a competitor brand or product name first."
          : "Enter a topic to scan first."
      );
      return;
    }
    startTransition(async () => {
      setTrendError(null);
      const queryToScan =
        currentMode === "competitor" ? `${query} new OR launch OR feature OR release` : query;
      const res = await fetchLiveTrendingNews(queryToScan, 8);
      if (res.success && res.trends) {
        setTrends(res.trends);
      } else {
        setTrendError(res.error || "Failed to fetch live trends.");
      }
    });
  };

  const handleCopyTrendPrompt = async (item: TrendItem) => {
    const prompt =
      spyMode === "competitor"
        ? `Write a competitive counter-post about "${item.title}" (source: ${item.source}, ${item.pubDate}). Compare our positioning against this news with factual citations, and draft it for my top social platform.`
        : `Write a thought-leadership social media post based on this trending news: "${item.title}" (source: ${item.source}, ${item.pubDate}). Include a strong hook and a clear call to action.`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedTrendId(item.id);
      setTimeout(() => setCopiedTrendId(null), 2500);
    } catch {
      setTrendError("Could not copy to clipboard. Copy the headline manually and paste it in AI Chat.");
    }
  };

  const activeConnector = activeConnectorKey
    ? CONNECTOR_REGISTRY.find((c) => c.key === activeConnectorKey)
    : null;

  const activeCmsProvider = activeCmsKey
    ? publishTargetsState.providers.find((p) => p.key === activeCmsKey)
    : undefined;

  const mcpPreset = mcpPresetKey ? getPluginEntry(mcpPresetKey) : undefined;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Plugins</h1>
          <p className="mt-2 flex items-center gap-2 text-base text-slate-500 dark:text-slate-400">
            Work with AI CEO across your favorite tools.
            <button type="button" title="Overview: connect a plugin once, then ask AI CEO to use it from chat." aria-label="Plugin user guide overview" className="rounded-full border border-slate-300 px-1.5 text-[10px] font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600">?</button>
          </p>
        </div>
        <label className="relative block w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search plugins" className="h-14 w-full rounded-full border border-slate-200 bg-white pl-12 pr-5 text-base text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        </label>
      </div>
      <div className="flex items-end justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Installed</h2>
          <p className="mt-1 text-xs text-slate-500">
            {installedCount} plugin{installedCount === 1 ? "" : "s"} connected — mention them by name
            in{" "}
            <a
              href="/dashboard/chat"
              className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              AI CEO chat
            </a>
            .
          </p>
        </div>
        <button
          onClick={() => {
            setMcpPresetKey(null);
            setShowAddMcpModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ServerIcon className="h-4 w-4" /> Add MCP
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {installedEntries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            title={`${entry.name} — ${entry.blurb}`}
            onClick={() => openPlugin(entry)}
            className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <PluginLogoTile id={entry.logo} size="lg" className="shadow-sm" />
            <span className="sr-only">{entry.name}</span>
          </button>
        ))}
        {customMcpServers.map((server) => (
          <button
            key={server.id}
            type="button"
            title={`${server.name} — ${server.toolCount} tool${server.toolCount === 1 ? "" : "s"}`}
            onClick={() =>
              document
                .getElementById(`mcp-${server.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <PluginLogoTile id="mcp" size="lg" className="shadow-sm" />
            <span className="sr-only">{server.name}</span>
          </button>
        ))}
        {installedCount === 0 && (
          <span className="text-sm text-slate-400">Connect a plugin below to see it here.</span>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("connectors")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === "connectors"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Plug className="h-4 w-4" />
          Connections
        </button>
        <button
          onClick={() => setActiveTab("trends")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === "trends"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Real-Time News Engine
          <span className="ml-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            FREE
          </span>
        </button>
      </div>

      {/* TAB 1: CONNECTIONS */}
      {activeTab === "connectors" && (
        <div className="space-y-8">
          {sections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Nothing in the directory matches &ldquo;{searchQuery.trim()}&rdquo;. Any MCP server
                can still be added by URL with the button above.
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <PluginSection
                key={section.key}
                title={section.title}
                entries={section.entries}
                statusFor={statusFor}
                focusedKey={focusedConnector}
                visible={VISIBLE_PER_SECTION}
                expanded={!!search || expandedSections.includes(section.key)}
                onExpand={() =>
                  setExpandedSections((prev) =>
                    prev.includes(section.key) ? prev : [...prev, section.key]
                  )
                }
                onOpen={openPlugin}
              />
            ))
          )}

          {/* The lead tag is the one plugin whose whole form is its card, so the
              directory row scrolls here instead of opening a dialog. */}
          <WebsiteTagCard
            workspaceId={workspaceId}
            status={trackingState}
            onStatus={setTrackingState}
            focused={focusedConnector === "website-tag"}
          />

          {/* Publishing defaults for the platforms that are already connected.
              Connecting happens in the directory above, so only connected
              providers are passed in — two connect forms for one platform is how
              a user ends up with two half-filled ones. */}
          {connectedCmsProviders.length > 0 && (
            <PublishTargetsPanel
              workspaceId={workspaceId}
              targets={publishTargetsState.targets}
              providers={connectedCmsProviders}
              encryptionReady={publishTargetsState.encryptionReady}
              selectedTargetId={selectedTargetId}
              onSelect={setSelectedTargetId}
              onChange={setPublishTargetsState}
              onNotify={(tone, text) => {
                if (tone === "error") console.error(text);
              }}
            />
          )}


          {/* The receiving end, for the sites that have to write one themselves. */}
          <CustomSiteGuide />

          {/* Attached MCP servers. Connecting one is a directory row above; this is
              where the ones already attached are re-checked, paused and removed. */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Attached MCP servers
              </h3>
              <button
                onClick={() => {
                  setMcpPresetKey(null);
                  setShowAddMcpModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 transition-all"
              >
                <ServerIcon className="h-3.5 w-3.5" />
                Add by URL
              </button>
            </div>

            {mcpServersState.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-400/40 bg-violet-500/5 p-6">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Nothing attached yet — the free servers are in the directory above
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Pick one from <strong>Free MCP servers</strong> and its URL is filled in for you.
                  Anything else that speaks the Model Context Protocol — your own server, a private
                  one, a Zapier endpoint — goes in by URL. We connect, list its tools and only then
                  save it, so the AI CEO can call them straight from chat.
                </p>
                <button
                  onClick={() => {
                    setMcpPresetKey(null);
                    setShowAddMcpModal(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500 transition-all"
                >
                  <ServerIcon className="h-3.5 w-3.5" />
                  Add a server by URL
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mcpServersState.map((server) => (
                  <div key={server.id} id={`mcp-${server.id}`}>
                    <McpServerCard
                      workspaceId={workspaceId}
                      server={server}
                      onUpdated={(updated) =>
                        setMcpServersState((prev) =>
                          prev.map((s) => (s.id === updated.id ? updated : s))
                        )
                      }
                      onDeleted={(id) =>
                        setMcpServersState((prev) => prev.filter((s) => s.id !== id))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: REAL-TIME GOOGLE NEWS ENGINE */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          {/* Engine Banner */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Free Unlimited Real-Time Engine
              </div>
              <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Google News Real-Time Live RSS Search
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                No API keys or quotas required. Scan live breaking news across any keyword or
                competitor, then hand the story to your AI CEO.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                0 Quota Limit
              </span>
            </div>
          </div>

          {/* Mode Selector Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setSpyMode("trend");
                if (trendQuery.trim()) handleScanTrends("trend");
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                spyMode === "trend"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              Mode 1: Live Industry Trend Scout
            </button>
            <button
              onClick={() => {
                setSpyMode("competitor");
                if (competitorQuery.trim()) handleScanTrends("competitor");
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                spyMode === "competitor"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              Mode 2: Real-Time Competitor Spy Radar
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={spyMode === "trend" ? trendQuery : competitorQuery}
                onChange={(e) =>
                  spyMode === "trend"
                    ? setTrendQuery(e.target.value)
                    : setCompetitorQuery(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScanTrends();
                }}
                placeholder={
                  spyMode === "trend"
                    ? "Type any trend topic (e.g. AI marketing, B2B SaaS, e-commerce)..."
                    : "Type competitor brand(s) (e.g. OpenAI, Notion, HubSpot)..."
                }
                className={`w-full rounded-xl border bg-white dark:bg-slate-900 pl-12 pr-4 py-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                  spyMode === "competitor"
                    ? "border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20"
                    : "border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/20"
                }`}
              />
            </div>
            <button
              onClick={() => handleScanTrends()}
              disabled={isFetchingTrends}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60 transition-all ${
                spyMode === "competitor"
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20"
              }`}
            >
              {isFetchingTrends ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isFetchingTrends
                ? "Scanning Google News..."
                : spyMode === "competitor"
                ? "Spy Rival News"
                : "Scan Live News"}
            </button>
          </div>

          {/* Error Message */}
          {trendError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {trendError}
            </div>
          )}

          {/* Trend Cards Grid */}
          {trends.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {trends.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        {item.category}
                      </span>
                      <span className="text-xs font-medium text-slate-400">{item.pubDate}</span>
                    </div>
                    <h4 className="mt-3 text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {item.title}
                    </h4>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {item.snippet}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                    >
                      <span>Source: {item.source}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyTrendPrompt(item)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                          spyMode === "competitor"
                            ? "bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400"
                            : "bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400"
                        }`}
                        title="Copy an AI CEO prompt for this story, then paste it in AI Chat"
                      >
                        {copiedTrendId === item.id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedTrendId === item.id ? "Copied!" : "Copy AI prompt"}
                      </button>
                      <a
                        href="/dashboard/chat"
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                        title="Open AI Chat"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {trends.length === 0 && !isFetchingTrends && !trendError && (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                Enter a topic above and scan live Google News to see breaking stories here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Connectors: an API key or an OAuth triple, stored write-only. */}
      {activeConnector && (
        <ConnectConnectorModal
          workspaceId={workspaceId}
          connector={activeConnector}
          connection={getConnection(activeConnector.key)}
          onClose={() => setActiveConnectorKey(null)}
          onUpdate={(view) => updateConnection(activeConnector.key, view)}
        />
      )}

      {/* Publishing platforms: same dialog shape, different backend. */}
      {activeCmsProvider && (
        <ConnectCmsTargetModal
          workspaceId={workspaceId}
          provider={activeCmsProvider}
          target={publishTargetsState.targets.find((t) => t.providerKey === activeCmsProvider.key)}
          encryptionReady={publishTargetsState.encryptionReady}
          onClose={() => setActiveCmsKey(null)}
          onUpdate={setPublishTargetsState}
        />
      )}

      {/* MCP servers, prefilled when the click came from a directory row. */}
      {showAddMcpModal && (
        <AddMcpServerModal
          workspaceId={workspaceId}
          preset={mcpPreset}
          onClose={() => {
            setShowAddMcpModal(false);
            setMcpPresetKey(null);
          }}
          onAdded={(server) => setMcpServersState((prev) => [server, ...prev])}
        />
      )}
    </div>
  );
}
