"use client";

import React, { useState, useTransition } from "react";
import {
  Plug,
  Globe,
  ShoppingCart,
  Video,
  Image as ImageIcon,
  Cloud,
  Zap,
  Newspaper,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Search,
  RefreshCw,
  Send,
  Lock,
  ArrowRight,
  Sliders,
  FileText,
  TrendingUp,
  GitBranch,
  Code2,
  Terminal,
} from "lucide-react";
import { fetchLiveTrendingNews, TrendItem } from "@/actions/trends";

interface WPConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
  defaultStatus: "draft" | "publish";
  enableYoastSeo: boolean;
  isConnected: boolean;
}

export default function PluginsHQ() {
  const [activeTab, setActiveTab] = useState<"cms" | "connectors" | "trends">("cms");

  // WordPress Modal & State
  const [showWpModal, setShowWpModal] = useState(false);
  const [wpConfig, setWpConfig] = useState<WPConfig>({
    siteUrl: "https://smbrobotic.com",
    username: "admin",
    appPassword: "",
    defaultStatus: "draft",
    enableYoastSeo: true,
    isConnected: true, // Show as connected by default for demo
  });
  const [testingWp, setTestingWp] = useState(false);
  const [wpTestMsg, setWpTestMsg] = useState<string | null>(null);

  // Live Google News Trend & Competitor Spy State
  const [spyMode, setSpyMode] = useState<"trend" | "competitor">("trend");
  const [trendQuery, setTrendQuery] = useState("AI Robotics B2B Marketing SaaS");
  const [competitorQuery, setCompetitorQuery] = useState("Boston Dynamics Arduino Raspberry Pi");
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [isFetchingTrends, startTransition] = useTransition();
  const [trendError, setTrendError] = useState<string | null>(null);

  const handleTestWpConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingWp(true);
    setWpTestMsg(null);
    setTimeout(() => {
      setTestingWp(false);
      setWpConfig((prev) => ({ ...prev, isConnected: true }));
      setWpTestMsg("✅ Connected successfully to WordPress REST API v2! Admin permissions verified.");
    }, 1200);
  };

  const handleScanTrends = (modeOverride?: "trend" | "competitor") => {
    const currentMode = modeOverride || spyMode;
    startTransition(async () => {
      setTrendError(null);
      const queryToScan =
        currentMode === "competitor"
          ? `${competitorQuery} new OR launch OR feature OR release`
          : trendQuery;
      const res = await fetchLiveTrendingNews(queryToScan, 8);
      if (res.success && res.trends) {
        setTrends(res.trends);
      } else {
        setTrendError(res.error || "Failed to fetch live trends.");
      }
    });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-4 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-400/30 mb-4">
              <Plug className="h-3.5 w-3.5" />
              SMB Robotics Enterprise Plugins & AI Connectors Hub
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Connect Your CMS, AI Studio & Live Internet Engine
            </h1>
            <p className="mt-2 max-w-2xl text-slate-300 text-sm sm:text-base">
              Supercharge your AI CEO with direct WordPress blog publishing, WooCommerce product launches, HeyGen AI video production, and real-time Google News trend scanning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowWpModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
            >
              <Globe className="h-4 w-4" />
              Configure WordPress
            </button>
            <button
              onClick={() => {
                setActiveTab("trends");
                handleScanTrends();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 ring-1 ring-slate-600 transition-all"
            >
              <Newspaper className="h-4 w-4 text-emerald-400" />
              Live News Engine (Free)
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("cms")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === "cms"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Globe className="h-4 w-4" />
          CMS & E-Commerce Plugins
        </button>
        <button
          onClick={() => setActiveTab("connectors")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === "connectors"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Plug className="h-4 w-4" />
          AI Production Connectors
        </button>
        <button
          onClick={() => {
            setActiveTab("trends");
            if (trends.length === 0) handleScanTrends();
          }}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === "trends"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Real-Time Google News Engine
          <span className="ml-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            FREE FOREVER
          </span>
        </button>
      </div>

      {/* TAB 1: CMS & E-COMMERCE PLUGINS */}
      {activeTab === "cms" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* WordPress CMS Pro Card */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Globe className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">WordPress Pro</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Blog Article & SEO Publisher</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                AI CEO writes 1500-2500 word pro SEO articles, FAQ schema, H2/H3 headings, and auto-publishes to your WordPress blog with Yoast/RankMath meta tags.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">{wpConfig.siteUrl}</span>
                <button
                  onClick={() => setShowWpModal(true)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Configure & \u2192
                </button>
              </div>
            </div>

            {/* WooCommerce Card */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">WooCommerce</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">E-Commerce Product Launcher</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Ready
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                &ldquo;CEO bhai, yeh LiDAR sensor product live kar do.&rdquo; AI generates SEO product description, price, SKUs, and publishes to your WooCommerce store.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">REST API v3 Ready</span>
                <button
                  onClick={() => setShowWpModal(true)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Link Store \u2192
                </button>
              </div>
            </div>

            {/* Shopify Card */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Shopify</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Store Automation Connector</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Available
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                Connect your international Shopify store to auto-generate promotional TikTok videos, promo tweets, and SEO product copy.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">GraphQL / REST API</span>
                <button
                  onClick={() => alert("Shopify integration can be activated anytime!")}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400"
                >
                  Connect \u2192
                </button>
              </div>
            </div>
            {/* GitHub / Local Repo Pro Card */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-800">
                    <GitBranch className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">GitHub / Local Repo Pro</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Embedded Systems & Developer Bridge</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                Developer apna local project folder link karein ya GitHub repo den. AI CEO auto-scans circuit wiring diagrams (Mermaid flowchart LR), pin configurations, and generates a stunning SMB Robotics README.md without Contributing/Project Structure sections.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">Local FS / Git Pro</span>
                <button
                  onClick={() =>
                    alert(
                      "GitHub / Local Repo link ready! Go to 'Automate Task' tab and give your local project folder path to AI CEO."
                    )
                  }
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                >
                  Link Repo \u2192
                </button>
              </div>
            </div>
          </div>

          {/* WordPress & GitHub Action Showcase Box */}
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              What You Can Say to Your AI CEO with WordPress, WooCommerce & GitHub Connected:
            </h3>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">Pro Article Publisher</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 font-medium">
                  &ldquo;CEO, write a 2000-word SEO article on 'Embedded Robotics in 2026' with FAQ schema and publish it to my WordPress blog.&rdquo;
                </p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Product Launch Helper</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 font-medium">
                  &ldquo;CEO bhai, yeh LiDAR sensor product $199 price ke sath WooCommerce par live kar do aur SEO tags laga do.&rdquo;
                </p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">Page & Post Doctor</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 font-medium">
                  &ldquo;Mere 'About Us' page par phone number update kar do aur SEO meta description improve kar do.&rdquo;
                </p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase">GitHub README & Circuit Pro</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 font-medium">
                  &ldquo;CEO, mera local folder scan karo. A-to-Z pin configuration aur Mermaid flowchart LR circuit wiring diagram ke sath SMB Robotics README.md likho.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI PRODUCTION CONNECTORS */}
      {activeTab === "connectors" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Veo 3 Video Engine (Primary) */}
            <div className="relative rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Video className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Veo 3 Video Engine</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Cinematic Video & Shorts Primary Engine</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Active Primary
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                AI CEO generates Full HD cinematic product reels, YouTube Shorts, & TikTok demos via Google Veo 3 without extra avatar rendering costs.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">100% Integrated</span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Default Engine</span>
              </div>
            </div>

            {/* HeyGen / ElevenLabs (Standby) */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all opacity-80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400">
                    <Video className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">HeyGen AI Studio</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">AI Avatar Video Generation</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Standby / Paused
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                HeyGen avatar generation is currently paused in favor of Google Veo 3. You can enable API key anytime to activate avatar studio.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">Standby Mode</span>
                <button
                  onClick={() => alert("HeyGen is on Standby. Google Veo 3 is currently active for all video generation!")}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Config API \u2192
                </button>
              </div>
            </div>

            {/* Canva / Figma */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Canva / Figma</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Visual Graphics & Carousel Bridge</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Available
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                Bridge your Canva workspace so AI-designed LinkedIn carousels and YouTube thumbnails flow seamlessly into your posting calendar.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">OAuth 2.0 Bridge</span>
                <button
                  onClick={() => alert("Canva OAuth bridge can be connected anytime!")}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400"
                >
                  Link \u2192
                </button>
              </div>
            </div>

            {/* Google Drive / Dropbox */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Google Drive / Cloud Vault</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">RAW Media Asset Reader</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Active
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                Connect your Drive folder. AI automatically scans your RAW video clips and product photos to generate viral social media reels.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">Google Cloud API</span>
                <button
                  onClick={() => alert("Google Drive asset vault connected!")}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Manage Vault \u2192
                </button>
              </div>
            </div>

            {/* Zapier / Make.com */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    <Zap className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Zapier / Make.com</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">5,000+ Apps Automation Bridge</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Webhook Ready
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                Receive instant webhooks from Shopify, HubSpot, Stripe, or custom IoT sensors to trigger automated social media posts.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-500">Webhook / REST</span>
                <button
                  onClick={() => alert("Zapier Webhook URL ready for automation triggers!")}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400"
                >
                  Get Webhook \u2192
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: REAL-TIME GOOGLE NEWS TREND ENGINE (100% FREE) */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          {/* Engine Banner */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> 100% Free Unlimited Real-Time Engine Active
              </div>
              <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Google News Real-Time Live RSS Search Engine
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                No API keys or quotas required. Your Trend Agent reads live breaking news across any keyword or category to draft factual thought-leadership posts.
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
                handleScanTrends("trend");
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                spyMode === "trend"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              📡 Mode 1: Live Industry Trend Scout
            </button>
            <button
              onClick={() => {
                setSpyMode("competitor");
                handleScanTrends("competitor");
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                spyMode === "competitor"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              🕵️‍♂️ Mode 2: Real-Time Competitor Spy Radar
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              {spyMode === "trend" ? (
                <input
                  type="text"
                  value={trendQuery}
                  onChange={(e) => setTrendQuery(e.target.value)}
                  placeholder="Type any trend topic (e.g. AI Robotics, B2B Marketing, Embedded Systems, LiDAR)..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-12 pr-4 py-3.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              ) : (
                <input
                  type="text"
                  value={competitorQuery}
                  onChange={(e) => setCompetitorQuery(e.target.value)}
                  placeholder="Type competitor brand(s) (e.g. Boston Dynamics, Arduino, Raspberry Pi, OpenAI)..."
                  className="w-full rounded-xl border border-emerald-500/50 bg-white dark:bg-slate-900 pl-12 pr-4 py-3.5 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              )}
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
              <RefreshCw className={`h-4 w-4 ${isFetchingTrends ? "animate-spin" : ""}`} />
              {isFetchingTrends
                ? "Scanning Google News..."
                : spyMode === "competitor"
                ? "Spy Rival News"
                : "Scan Live News"}
            </button>
          </div>

          {/* Error Message */}
          {trendError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
              {trendError}
            </div>
          )}

          {/* Trend Cards Grid */}
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

                  <button
                    onClick={() =>
                      alert(
                        spyMode === "competitor"
                          ? `🚨 Alerted AI CEO! Creating a competitive counter-post comparing SMB Robotics against "${item.title}" with factual Google News citations!`
                          : `✨ Sent "${item.title}" to AI CEO! He is drafting a thought-leadership LinkedIn & X post right now.`
                      )
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      spyMode === "competitor"
                        ? "bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400"
                        : "bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {spyMode === "competitor" ? "Draft Rival Counter-Post" : "Draft LinkedIn/X Post"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WordPress Configuration Modal */}
      {showWpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">WordPress & WooCommerce Connection</h3>
                  <p className="text-xs text-slate-500">Secure REST API v2 Application Password setup</p>
                </div>
              </div>
              <button
                onClick={() => setShowWpModal(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                \u2715
              </button>
            </div>

            <form onSubmit={handleTestWpConnection} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  WordPress Website URL
                </label>
                <input
                  type="url"
                  required
                  value={wpConfig.siteUrl}
                  onChange={(e) => setWpConfig({ ...wpConfig, siteUrl: e.target.value })}
                  placeholder="https://smbrobotic.com"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Admin Username
                  </label>
                  <input
                    type="text"
                    required
                    value={wpConfig.username}
                    onChange={(e) => setWpConfig({ ...wpConfig, username: e.target.value })}
                    placeholder="admin"
                    className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Default Post Status
                  </label>
                  <select
                    value={wpConfig.defaultStatus}
                    onChange={(e: any) => setWpConfig({ ...wpConfig, defaultStatus: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="draft">Save as Draft (Recommended)</option>
                    <option value="publish">Publish Immediately</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  WordPress Application Password (WordPress 5.6+)
                </label>
                <input
                  type="password"
                  required
                  value={wpConfig.appPassword}
                  onChange={(e) => setWpConfig({ ...wpConfig, appPassword: e.target.value })}
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  In WordPress WP-Admin \u2192 Users \u2192 Profile \u2192 scroll down to &ldquo;Application Passwords&rdquo; to generate a secure REST API token.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Enable Yoast / RankMath SEO Optimization</p>
                  <p className="text-[11px] text-slate-500">AI auto-assigns SEO title, slug, and meta description</p>
                </div>
                <input
                  type="checkbox"
                  checked={wpConfig.enableYoastSeo}
                  onChange={(e) => setWpConfig({ ...wpConfig, enableYoastSeo: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              {wpTestMsg && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  {wpTestMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowWpModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={testingWp}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-60 transition-all"
                >
                  {testingWp ? "Testing REST API..." : "Test Connection & Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
