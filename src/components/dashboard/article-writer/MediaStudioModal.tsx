"use client";

/**
 * MEDIA STUDIO — the one place an image or video enters an article
 *
 * Four real sources: a file from the machine, Pixabay stock, an AI render, and a
 * YouTube embed. Two things the old modal did are gone. It called Pixabay from
 * the browser with the API key inlined in the component, which published the key
 * to anyone who opened dev tools; the search now goes through the
 * `searchStockMedia` server action, which reads the key from the environment.
 * And it fell back to a hard-coded Unsplash photo whenever a search or a render
 * came back empty, so an article could ship with a stock lighthouse nobody chose.
 * An empty result now says it is empty.
 *
 * Everything picked is copied onto our own storage through `/api/uploads` before
 * it is inserted, because a published article that hotlinks a CDN breaks the day
 * that CDN changes, and a base64 `data:` URL cannot be published at all.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CirclePlay,
  Image as ImageIcon,
  Loader2,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { searchStockMedia, type StockHit } from "@/actions/stock-media";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AI_IMAGE_SHAPES, IMAGE_STYLE_OPTIONS, extractYouTubeId } from "./constants";

export type MediaTab = "upload" | "stock" | "ai" | "youtube";

export interface MediaPick {
  kind: "image" | "video";
  /** The URL that goes into the article. Always on our own storage for images. */
  url: string;
  alt: string;
  credit?: string;
}

export interface MediaStudioModalProps {
  open: boolean;
  onClose: () => void;
  /** Seeds the stock query and the render prompt. */
  seed: string;
  /** Hides the YouTube tab where an embed makes no sense, e.g. a featured image. */
  allowVideo?: boolean;
  title?: string;
  onInsert: (pick: MediaPick) => void;
  onNotify: (tone: "success" | "error" | "info", text: string) => void;
}

interface Candidate {
  kind: "image" | "video";
  url: string;
  previewUrl: string;
  credit?: string;
  /** True once the file lives on our storage and needs no copy step. */
  hosted: boolean;
}
/** Copies a remote or base64 asset onto our own storage. Returns null on failure. */
async function rehost(url: string, filename: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) {
      const blob = await (await fetch(url)).blob();
      const body = new FormData();
      body.append("file", new File([blob], filename, { type: blob.type || "image/png" }));
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      return res.ok && data?.url ? String(data.url) : null;
    }
    const res = await fetch(`/api/uploads?url=${encodeURIComponent(url)}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.url ? String(data.url) : null;
  } catch {
    return null;
  }
}

export default function MediaStudioModal({
  open,
  onClose,
  seed,
  allowVideo = true,
  title = "Insert media",
  onInsert,
  onNotify,
}: MediaStudioModalProps) {
  const [tab, setTab] = useState<MediaTab>("stock");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [alt, setAlt] = useState("");
  const [inserting, setInserting] = useState(false);

  // Stock
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StockHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [stockNote, setStockNote] = useState<string | null>(null);

  // Upload
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // AI
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiShape, setAiShape] = useState(AI_IMAGE_SHAPES[0].value);
  const [aiStyle, setAiStyle] = useState(IMAGE_STYLE_OPTIONS[0].value);
  const [aiBusy, setAiBusy] = useState(false);

  // YouTube
  const [ytInput, setYtInput] = useState("");
  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    setStockNote(null);
    const result = await searchStockMedia(term || seed || "", "image", 1, 40, "popular", "all");
    setSearching(false);
    if (!result.success) {
      setHits([]);
      setStockNote(result.error || "The stock library could not be reached.");
      return;
    }
    setHits(result.hits || []);
    if (!result.hits || result.hits.length === 0) {
      setStockNote(`Nothing came back for “${term || seed}”. Try a broader word.`);
    }
  }, [seed]);

  // Opening the modal seeds the query from the article's keyword, so the first
  // screen is already relevant instead of empty.
  useEffect(() => {
    if (!open) return;
    setCandidate(null);
    setAlt("");
    setQuery(seed || "");
    setAiPrompt(seed || "");
    setTab("stock");
    if (seed) void runSearch(seed);
  }, [open, seed, runSearch]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        onNotify("error", data?.error || "The file could not be uploaded.");
        return;
      }
      setCandidate({
        kind: file.type.startsWith("video") ? "video" : "image",
        url: String(data.url),
        previewUrl: String(data.url),
        hosted: true,
      });
      setAlt(file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim());
    } finally {
      setUploading(false);
    }
  }
  async function generateAi() {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      onNotify("error", "Describe the picture you want first.");
      return;
    }
    const shape = AI_IMAGE_SHAPES.find((s) => s.value === aiShape) || AI_IMAGE_SHAPES[0];
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generate-media",
          platform: shape.platform,
          format: shape.format,
          mediaType: "image",
          designMode: "photographic",
          aspectRatio: shape.aspectRatio,
          style: aiStyle,
          topic: seed || undefined,
          prompt: `${prompt}. ${IMAGE_STYLE_OPTIONS.find((s) => s.value === aiStyle)?.label || ""} treatment, editorial quality, no text overlay.`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data?.error === "UPGRADE_REQUIRED") {
        onNotify("error", data.message || "AI rendering needs a higher plan.");
        return;
      }
      const url = data?.asset?.url;
      if (!res.ok || !url) {
        // No stand-in image: a picture nobody asked for is worse than none.
        onNotify("error", data?.error || "The render failed. Nothing was inserted.");
        return;
      }
      setCandidate({
        kind: "image",
        url: String(url),
        previewUrl: String(url),
        hosted: !String(url).startsWith("data:") && String(url).includes("/api/media/"),
      });
      setAlt(prompt.slice(0, 120));
    } finally {
      setAiBusy(false);
    }
  }
  async function commit() {
    if (tab === "youtube") {
      const id = extractYouTubeId(ytInput);
      if (!id) {
        onNotify("error", "That is not a YouTube link or video id.");
        return;
      }
      onInsert({ kind: "video", url: `https://www.youtube.com/embed/${id}`, alt: alt.trim() });
      onClose();
      return;
    }

    if (!candidate) return;
    if (candidate.kind === "image" && !alt.trim()) {
      onNotify("error", "Alt text is required — it is read by search engines and screen readers.");
      return;
    }

    setInserting(true);
    try {
      let url = candidate.url;
      if (!candidate.hosted) {
        const copied = await rehost(url, `article-${Date.now()}.png`);
        if (copied) {
          url = copied;
        } else if (url.startsWith("data:")) {
          onNotify("error", "The render could not be saved to storage, so it cannot be published.");
          return;
        } else {
          // A live external URL still works in the article; say what did not happen.
          onNotify(
            "info",
            "The image could not be copied to your storage, so the article links to the original."
          );
        }
      }
      onInsert({ kind: candidate.kind, url, alt: alt.trim(), credit: candidate.credit });
      onClose();
    } finally {
      setInserting(false);
    }
  }

  const tabs: { key: MediaTab; label: string; icon: typeof ImageIcon }[] = [
    { key: "stock", label: "Stock library", icon: Search },
    { key: "upload", label: "From this device", icon: Upload },
    { key: "ai", label: "AI render", icon: Sparkles },
    ...(allowVideo ? [{ key: "youtube" as MediaTab, label: "YouTube", icon: CirclePlay }] : []),
  ];
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Anything you pick is copied to your own storage first, so the published
            article never depends on someone else&apos;s CDN.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === t.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[16rem]">
          {tab === "stock" && (
            <div className="space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runSearch(query);
                }}
                className="flex gap-2"
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What should the picture show?"
                  className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-ring focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Search
                </button>
              </form>
              {stockNote && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
                  {stockNote}
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {hits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => {
                      setCandidate({
                        kind: "image",
                        url: hit.url,
                        previewUrl: hit.previewUrl || hit.thumbnailUrl || hit.url,
                        credit: hit.user ? `Photo: ${hit.user} / Pixabay` : "Pixabay",
                        hosted: false,
                      });
                      setAlt(hit.tags ? hit.tags.split(",")[0].trim() : "");
                    }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                      candidate?.url === hit.url ? "border-primary" : "border-transparent hover:border-border"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={hit.previewUrl || hit.thumbnailUrl}
                      alt={hit.tags}
                      className="w-full h-24 object-cover"
                      loading="lazy"
                    />
                    {candidate?.url === hit.url && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "upload" && (
            <div className="space-y-3">
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="w-full h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
                {uploading ? "Uploading…" : "Choose an image or video"}
              </button>
              <p className="text-[11px] text-muted-foreground">
                Uploaded straight to your workspace storage. Nothing is embedded as
                base64, which is what made earlier drafts impossible to publish.
              </p>
            </div>
          )}

          {tab === "ai" && (
            <div className="space-y-3">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
                placeholder="A wide shot of an engineer reviewing dashboards in a bright office…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-ring focus:outline-none resize-none"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={aiShape}
                  onChange={(e) => setAiShape(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:border-ring focus:outline-none"
                >
                  {AI_IMAGE_SHAPES.map((shape) => (
                    <option key={shape.value} value={shape.value}>
                      {shape.label}
                    </option>
                  ))}
                </select>
                <select
                  value={aiStyle}
                  onChange={(e) => setAiStyle(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:border-ring focus:outline-none"
                >
                  {IMAGE_STYLE_OPTIONS.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void generateAi()}
                disabled={aiBusy}
                className="h-9 px-4 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiBusy ? "Rendering…" : "Render"}
              </button>
            </div>
          )}

          {tab === "youtube" && (
            <div className="space-y-2">
              <input
                value={ytInput}
                onChange={(e) => setYtInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-ring focus:outline-none"
              />
              {extractYouTubeId(ytInput) ? (
                <iframe
                  title="YouTube preview"
                  src={`https://www.youtube.com/embed/${extractYouTubeId(ytInput)}`}
                  className="w-full aspect-video rounded-lg border border-border"
                  allowFullScreen
                />
              ) : (
                ytInput.trim() && (
                  <p className="text-xs text-destructive">
                    No video id in that text. Paste the whole watch or youtu.be link.
                  </p>
                )
              )}
            </div>
          )}
        </div>
        <div className="border-t border-border pt-3 space-y-2">
          {candidate && tab !== "youtube" && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={candidate.previewUrl}
                alt=""
                className="w-16 h-16 rounded-lg object-cover border border-border shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Alt text {candidate.kind === "image" ? <span className="text-destructive">*</span> : null}
                </p>
                <input
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                  placeholder="Describe the picture in a sentence"
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-ring focus:outline-none"
                />
                {candidate.credit && (
                  <p className="text-[10px] text-muted-foreground mt-1">{candidate.credit}</p>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              {tab === "youtube"
                ? "Embedded as a privacy-friendly iframe at the cursor."
                : candidate
                  ? "Inserted at the cursor, or as the featured image."
                  : "Pick something to continue."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void commit()}
                disabled={inserting || (tab === "youtube" ? !extractYouTubeId(ytInput) : !candidate)}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {inserting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {inserting ? "Saving…" : "Insert"}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
