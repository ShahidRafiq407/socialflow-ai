"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  Plug,
  Globe,
  Video,
  Zap,
  ShoppingCart,
  Server as ServerIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  RefreshCw,
  GitBranch,
  TrendingUp,
  Copy,
  Check,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { fetchLiveTrendingNews, TrendItem } from "@/actions/trends";
import { CONNECTOR_REGISTRY, ConnectorCategory } from "@/lib/connectors/registry";
import type { ConnectorView } from "@/actions/connections";
import type { McpServerView } from "@/actions/mcpServers";
import type { TrackingStatus } from "@/lib/types/growth";
import { ConnectConnectorModal } from "./plugins/ConnectConnectorModal";
import { AddMcpServerModal } from "./plugins/AddMcpServerModal";
import { McpServerCard } from "./plugins/McpServerCard";
import { WebsiteTagCard } from "./plugins/WebsiteTagCard";
import PublishTargetsPanel from "./article-writer/PublishTargetsPanel";
import type { PublishTargetsView } from "./article-writer/PublishTargetsPanel";
import CustomSiteGuide from "./plugins/CustomSiteGuide";

const CATEGORY_ICONS: Record<ConnectorCategory, React.ElementType> = {
  dev: GitBranch,
  media: Video,
  ecommerce: ShoppingCart,
  automation: Zap,
};

interface PluginsHQProps {
  workspaceId: string;
  connections: ConnectorView[];
  mcpServers: McpServerView[];
  tracking: TrackingStatus;
  publishTargets: PublishTargetsView;
}

// Deep link from the chat controller or the Goal page:
// /dashboard/plugins?connector=<key>. WordPress and the website lead tag live
// outside CONNECTOR_REGISTRY, so each gets its own alias set.
const WORDPRESS_ALIASES = new Set(["wordpress", "wp", "wordpress-pro", "wpsite"]);
const WEBSITE_TAG_ALIASES = new Set([
  "website-tag",
  "websitetag",
  "website",
  "lead-tag",
  "leadtag",
  "tracking",
  "tracking-tag",
  "lead-capture",
]);

function normalizeConnectorKey(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!value) return null;
  if (WORDPRESS_ALIASES.has(value)) return "wordpress";
  if (WEBSITE_TAG_ALIASES.has(value)) return "website-tag";
  if (CONNECTOR_REGISTRY.some((c) => c.key === value)) return value;
  const byName = CONNECTOR_REGISTRY.find((c) => c.name.toLowerCase().replace(/[\s_]+/g, "-") === value);
  return byName?.key || null;
}

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
  const [showAddMcpModal, setShowAddMcpModal] = useState(false);
  const [focusedConnector, setFocusedConnector] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  const visibleConnectors = CONNECTOR_REGISTRY.filter((connector) =>
    `${connector.name} ${connector.tagline}`.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );
  const connectedCount = connectionsState.filter((connection) => connection.status === "connected").length;
  const connectedCmsTargets = publishTargetsState.targets.filter((target) => target.status === "connected");
  const installedCount = connectedCount + connectedCmsTargets.length;

  // A ?connector= link lands on the connectors tab with that card scrolled to and
  // ringed. If it is not connected yet the connect dialog opens too — that link
  // only exists because something still needs connecting. The param is consumed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = normalizeConnectorKey(new URLSearchParams(window.location.search).get("connector"));

    const url = new URL(window.location.href);
    if (url.searchParams.has("connector")) {
      url.searchParams.delete("connector");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
    if (!key) return;

    setActiveTab("connectors");
    setFocusedConnector(key);

    const connected =
      key === "wordpress"
      ? publishTargetsState.targets.some((target) => target.providerKey === "wordpress" && target.status === "connected")
        : key === "website-tag"
          ? tracking.installed
          : connections.find((c) => c.providerKey === key)?.status === "connected";

    const scroll = setTimeout(() => {
      document
        .getElementById(`connector-${key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    // The website tag has no dialog — its whole form is on the card, so landing
    // on it is enough.
    const open =
      connected || key === "website-tag"
        ? undefined
        : setTimeout(() => {
            if (key !== "wordpress") setActiveConnectorKey(key);
          }, 620);

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
          <p className="mt-1 text-xs text-slate-500">{installedCount} plugin{installedCount === 1 ? "" : "s"} connected</p>
        </div>
        <button onClick={() => setShowAddMcpModal(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><ServerIcon className="h-4 w-4" /> Add MCP</button>
      </div>
      <div className="flex flex-wrap gap-3">
        {connectionsState.filter((connection) => connection.status === "connected").map((connection) => {
          const connector = CONNECTOR_REGISTRY.find((item) => item.key === connection.providerKey);
          return <button key={connection.providerKey} title={connector?.name} onClick={() => setFocusedConnector(connection.providerKey)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-bold text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">{connector?.name.slice(0, 1)}</button>;
        })}
        {connectedCmsTargets.filter((target) => target.providerKey !== "wordpress").map((target) => <button key={target.id} title={target.providerName} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-bold text-emerald-600 shadow-sm dark:border-slate-700 dark:bg-slate-900">{target.providerName.slice(0, 1)}</button>)}
        {installedCount === 0 && <span className="text-sm text-slate-400">Connect a plugin below to see it here.</span>}
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Website lead tag — the other half of the website channel */}
            <WebsiteTagCard
              workspaceId={workspaceId}
              status={trackingState}
              onStatus={setTrackingState}
              focused={focusedConnector === "website-tag"}
            />

            {/* Registry-driven connector cards */}
            {visibleConnectors.map((connector) => {
              const conn = getConnection(connector.key);
              const Icon = CATEGORY_ICONS[connector.category] || Plug;
              const isConnected = conn?.status === "connected";
              const isFailed = conn?.status === "failed" && conn?.hasCredentials;
              return (
                <div
                  key={connector.key}
                  id={`connector-${connector.key}`}
                  className={`relative rounded-2xl border bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all ${
                    focusedConnector === connector.key
                      ? "border-indigo-500 ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-800">
                        <Icon className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">{connector.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{connector.tagline}</p>
                      </div>
                    </div>
                    {isConnected ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </span>
                    ) : isFailed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3 w-3" /> Failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Not connected
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                    {connector.description}
                  </p>
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                    <span className="text-xs font-medium text-slate-500 truncate max-w-[55%]">
                      {isConnected && conn?.accountLabel ? `@${conn.accountLabel}` : "Not connected"}
                    </span>
                    <button
                      onClick={() => setActiveConnectorKey(connector.key)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    >
                      {isConnected ? "Manage →" : "Connect →"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <PublishTargetsPanel
            workspaceId={workspaceId}
            targets={publishTargetsState.targets}
            providers={publishTargetsState.providers}
            encryptionReady={publishTargetsState.encryptionReady}
            selectedTargetId={selectedTargetId}
            onSelect={setSelectedTargetId}
            onChange={setPublishTargetsState}
            onNotify={(tone, text) => {
              if (tone === "error") console.error(text);
            }}
          />

          {/* The receiving end, for the sites that have to write one themselves. */}
          <CustomSiteGuide />

          {/* MCP Servers — user-added external tool servers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                MCP Servers — bring your own tools
              </h3>
              <button
                onClick={() => setShowAddMcpModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 transition-all"
              >
                <ServerIcon className="h-3.5 w-3.5" />
                Add MCP Server
              </button>
            </div>

            {mcpServersState.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-400/40 bg-violet-500/5 p-6">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Connect any MCP server and your AI CEO can use its tools
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Add any service that speaks the Model Context Protocol — docs search, GitHub,
                  Notion, databases, HeyGen-style generators, or your own custom server. We verify
                  the connection and discover its tools; the AI CEO can then call them straight from
                  chat.
                </p>
                <button
                  onClick={() => setShowAddMcpModal(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500 transition-all"
                >
                  <ServerIcon className="h-3.5 w-3.5" />
                  Add your first MCP server
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mcpServersState.map((server) => (
                  <McpServerCard
                    key={server.id}
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

      {/* Generic Connector Modal */}
      {activeConnector && (
        <ConnectConnectorModal
          workspaceId={workspaceId}
          connector={activeConnector}
          connection={getConnection(activeConnector.key)}
          onClose={() => setActiveConnectorKey(null)}
          onUpdate={(view) => updateConnection(activeConnector.key, view)}
        />
      )}

      {/* Add MCP Server Modal */}
      {showAddMcpModal && (
        <AddMcpServerModal
          workspaceId={workspaceId}
          onClose={() => setShowAddMcpModal(false)}
          onAdded={(server) => setMcpServersState((prev) => [server, ...prev])}
        />
      )}
    </div>
  );
}
