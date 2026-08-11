"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Search,
  Image as ImageIcon,
  Film,
  Loader2,
  Download,
  Heart,
  Eye,
  ChevronDown,
  TrendingUp,
  Sparkles,
  Camera,
  Check,
} from "lucide-react";
import { searchStockMedia, type StockHit } from "@/actions/stock-media";

/* ─── CATEGORY DATA ────────────────────────────────────────────── */
const CATEGORIES = [
  { label: "Trending",    icon: "🔥", query: "trending" },
  { label: "Business",    icon: "💼", query: "business" },
  { label: "Technology",  icon: "💻", query: "technology" },
  { label: "Nature",      icon: "🌿", query: "nature" },
  { label: "People",      icon: "👥", query: "people" },
  { label: "Food",        icon: "🍕", query: "food" },
  { label: "Travel",      icon: "✈️", query: "travel" },
  { label: "Architecture",icon: "🏛️", query: "architecture" },
  { label: "Health",      icon: "🏥", query: "health" },
  { label: "Animals",     icon: "🐾", query: "animals" },
  { label: "Sports",      icon: "⚽", query: "sports" },
  { label: "Music",       icon: "🎵", query: "music" },
  { label: "Education",   icon: "📚", query: "education" },
  { label: "Fashion",     icon: "👗", query: "fashion" },
  { label: "Fitness",     icon: "💪", query: "fitness" },
  { label: "Cars",        icon: "🚗", query: "cars" },
  { label: "Robotics",    icon: "🤖", query: "robotics" },
  { label: "Marketing",   icon: "📈", query: "marketing" },
  { label: "E-Commerce",  icon: "🛒", query: "e-commerce" },
  { label: "Real Estate", icon: "🏠", query: "real estate" },
];

const TRENDING_TAGS = [
  "AI generated", "Abstract", "Sunset", "Office", "Laptop",
  "Social media", "Coffee", "Mountains", "City", "Flowers",
  "Ocean", "Night sky", "Minimal", "Workspace", "Startup",
];

/* ─── COMPONENT ────────────────────────────────────────────────── */
interface StockMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: StockHit) => void;
}

export default function StockMediaModal({ isOpen, onClose, onSelect }: StockMediaModalProps) {
  /* state */
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Trending");
  const [results, setResults] = useState<StockHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* fetch helper */
  const doSearch = useCallback(async (searchTerm: string, type: "image" | "video") => {
    setLoading(true);
    setHasSearched(true);
    setSelectedId(null);
    try {
      const res = await searchStockMedia(searchTerm || "trending", type);
      if (res.success && res.hits) setResults(res.hits);
      else setResults([]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  /* auto-fetch on open */
  useEffect(() => {
    if (isOpen) {
      doSearch("trending", mediaType);
      setTimeout(() => inputRef.current?.focus(), 200);
    } else {
      setResults([]);
      setQuery("");
      setActiveCategory("Trending");
      setHasSearched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* search on Enter */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setActiveCategory("");
      doSearch(query, mediaType);
    }
  };

  /* category click */
  const handleCategory = (cat: typeof CATEGORIES[0]) => {
    setActiveCategory(cat.label);
    setQuery(cat.query);
    doSearch(cat.query, mediaType);
    gridRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* type toggle */
  const handleTypeSwitch = (type: "image" | "video") => {
    setMediaType(type);
    doSearch(query || activeCategory || "trending", type);
  };

  /* tag click */
  const handleTagClick = (tag: string) => {
    setQuery(tag);
    setActiveCategory("");
    doSearch(tag, mediaType);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex animate-in fade-in duration-200">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* main panel */}
      <div className="relative z-10 flex flex-col w-full h-full bg-white dark:bg-[#0f1117]">
        {/* ════════════ TOP HEADER BAR ════════════ */}
        <header className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0f1117]/95 backdrop-blur-md">
          {/* Row 1: Logo + Search + Close */}
          <div className="flex items-center gap-4 px-5 py-3">
            {/* Logo */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Camera className="h-5 w-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">Stock Media</h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Powered by Pixabay</p>
              </div>
            </div>

            {/* Search bar */}
            <div className="flex-1 max-w-2xl relative">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all">
                {/* Type dropdown */}
                <div className="flex-shrink-0 border-r border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => handleTypeSwitch(mediaType === "image" ? "video" : "image")}
                    className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-colors"
                  >
                    {mediaType === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
                    {mediaType === "image" ? "Photos" : "Videos"}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </div>
                {/* Input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search free stock photos & videos..."
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                />
                {/* Search button */}
                <button
                  onClick={() => { setActiveCategory(""); doSearch(query, mediaType); }}
                  className="flex-shrink-0 m-1 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-500/20"
                >
                  <Search className="h-3.5 w-3.5" />
                  Search
                </button>
              </div>
            </div>

            {/* Type tabs */}
            <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => handleTypeSwitch("image")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  mediaType === "image"
                    ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> Photos
              </button>
              <button
                onClick={() => handleTypeSwitch("video")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  mediaType === "video"
                    ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Film className="h-3.5 w-3.5" /> Videos
              </button>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Row 2: Trending tags */}
          <div className="flex items-center gap-2 px-5 pb-2.5 overflow-x-auto scrollbar-hide">
            <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Trending:
            </span>
            {TRENDING_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 transition-all border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800"
              >
                {tag}
              </button>
            ))}
          </div>
        </header>

        {/* ════════════ BODY: SIDEBAR + GRID ════════════ */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar – categories */}
          <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d0f14] overflow-y-auto py-3">
            <div className="px-4 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Categories</span>
            </div>
            {CATEGORIES.map(cat => (
              <button
                key={cat.label}
                onClick={() => handleCategory(cat)}
                className={`flex items-center gap-2.5 px-4 py-2 text-xs font-semibold transition-all ${
                  activeCategory === cat.label
                    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-r-2 border-emerald-500"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span className="text-sm">{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </aside>

          {/* Main results area */}
          <main ref={gridRef} className="flex-1 overflow-y-auto p-4 sm:p-5">
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Searching Pixabay...</p>
              </div>
            )}

            {/* Empty state (before first search) */}
            {!loading && !hasSearched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400/20 to-teal-500/20 flex items-center justify-center">
                  <Camera className="h-10 w-10 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Discover stunning free media</h3>
                  <p className="text-sm text-slate-500 mt-1">Search millions of royalty-free photos & videos</p>
                </div>
              </div>
            )}

            {/* No results */}
            {!loading && hasSearched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Search className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">No results found</h3>
                <p className="text-xs text-slate-500">Try a different search term or browse categories</p>
              </div>
            )}

            {/* ── Results Grid (Masonry-like) ── */}
            {!loading && results.length > 0 && (
              <>
                {/* Result count */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {results.length} {mediaType === "video" ? "videos" : "photos"} found
                    {query && <span className="text-slate-400"> for &ldquo;{query || activeCategory}&rdquo;</span>}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Sparkles className="h-3 w-3" /> Free for commercial use
                  </div>
                </div>

                {/* Grid */}
                <div className={`grid gap-3 ${
                  mediaType === "video"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                }`}>
                  {results.map(item => (
                    <div
                      key={item.id}
                      className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 ${
                        selectedId === item.id
                          ? "ring-3 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900"
                          : ""
                      } ${mediaType === "video" ? "aspect-video" : "aspect-[4/3]"}`}
                      onClick={() => {
                        setSelectedId(item.id);
                        onSelect(item);
                        onClose();
                      }}
                    >
                      {/* Media */}
                      {item.type === "video" ? (
                        <video
                          src={item.url}
                          className="w-full h-full object-cover bg-slate-900"
                          muted
                          loop
                          autoPlay
                          playsInline
                        />
                      ) : (
                        <img
                          src={item.previewUrl}
                          alt={item.tags}
                          loading="lazy"
                          className="w-full h-full object-cover bg-slate-200 dark:bg-slate-800 group-hover:scale-105 transition-transform duration-300"
                        />
                      )}

                      {/* Video badge */}
                      {item.type === "video" && (
                        <div className="absolute top-2 left-2 z-10">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[9px] font-bold uppercase border border-white/10">
                            <Film className="h-3 w-3 text-rose-400" /> VIDEO
                          </span>
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-between p-3">
                        {/* Top row */}
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="p-1.5 rounded-lg bg-white/20 backdrop-blur-md hover:bg-white/40 text-white transition-colors"
                            onClick={e => { e.stopPropagation(); }}
                          >
                            <Heart className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {/* Bottom row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[10px] text-white/80 font-medium">
                            <Eye className="h-3 w-3" />
                            Free
                          </div>
                          <button className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-lg">
                            <Download className="h-3 w-3" />
                            Use This
                          </button>
                        </div>
                      </div>

                      {/* Selected checkmark */}
                      {selectedId === item.id && (
                        <div className="absolute top-2 right-2 z-20">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </main>
        </div>

        {/* ════════════ BOTTOM FOOTER ════════════ */}
        <footer className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0f1117]/95 backdrop-blur-md px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Camera className="h-3.5 w-3.5" />
            All media is royalty-free from Pixabay • No attribution required
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">{results.length} results</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors"
            >
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
