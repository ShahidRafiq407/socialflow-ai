"use client";

/**
 * PAGE PREVIEW — the article as a web page, at real widths
 *
 * The Article tab is an editing surface: it inherits the dashboard's theme, its
 * width is whatever the column is, and it is missing everything a published page
 * has around the words — the H1, the byline, the hero image, a container that
 * stops at a readable measure. So "does this look right on my site?" could not be
 * answered here, and the honest answer to that question needs a page, not a div.
 *
 * This renders one, inside a sandboxed iframe. The iframe is the point:
 *
 *   - it carries its own stylesheet, so the dashboard's CSS cannot leak in and
 *     flatter the result;
 *   - it is a real viewport, so `1280px` and `390px` mean what they mean, and
 *     media queries and long tables break the way they will break in public;
 *   - `sandbox` without `allow-same-origin` puts the document on an opaque
 *     origin, so markup pasted into the HTML tab cannot read this app.
 *
 * What it does not claim: this is not the user's theme. Their fonts, colours and
 * container are their own. The label under the toggle says so.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { resolveLanguage } from "./constants";

export interface PagePreviewProps {
  /** The article HTML, exactly as it would be published. */
  html: string;
  title: string;
  siteName: string;
  /** The workspace's website, used for the address bar. Blank shows the path only. */
  siteUrl?: string;
  slug?: string;
  authorName?: string;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
  excerpt?: string;
  /** The label from the brief, e.g. "Urdu" — sets `lang` and, where it applies, RTL. */
  language?: string;
  /** Already counted by the editor; drives the reading-time line. */
  wordCount: number;
}

type Viewport = "desktop" | "mobile";

const VIEWPORTS: {
  key: Viewport;
  label: string;
  icon: typeof Monitor;
  width: number;
  height: number;
}[] = [
  { key: "desktop", label: "Desktop", icon: Monitor, width: 1280, height: 800 },
  { key: "mobile", label: "Mobile", icon: Smartphone, width: 390, height: 780 },
];

/** For text dropped into markup or an attribute. The article HTML is not escaped — it is the content. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

/** `example.com/slug`, or just the path when no website is on file. */
function addressLine(siteUrl: string, slug: string): string {
  const path = `/${slug || "article"}`;
  const raw = (siteUrl || "").trim();
  if (!raw) return path;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return `${url.host}${path}`;
  } catch {
    return path;
  }
}

/**
 * The preview page's own stylesheet — deliberately plain, and deliberately not
 * the dashboard's tokens. Element selectors only, plus the class names the
 * generator emits (`.article-callout`), because generated HTML never passes
 * through Tailwind.
 */
const PAGE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: #ffffff;
  color: #14181f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 17px;
  line-height: 1.75;
}
.site-header {
  border-bottom: 1px solid #e4e7ec;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.site-mark {
  width: 26px; height: 26px; border-radius: 7px;
  background: #14181f; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; letter-spacing: -0.02em;
}
.site-name { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.wrap { max-width: 720px; margin: 0 auto; padding: 44px 24px 64px; }
h1.headline {
  margin: 0;
  font-size: 42px; line-height: 1.15; font-weight: 800; letter-spacing: -0.028em;
}
.standfirst { margin: 16px 0 0; font-size: 19px; line-height: 1.6; color: #4b5563; }
.byline {
  margin-top: 22px; padding-top: 18px; border-top: 1px solid #e4e7ec;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  font-size: 13px; color: #5c6672;
}
.byline .who { font-weight: 700; color: #14181f; }
.byline .dot { color: #c3c9d2; }
.hero { margin: 30px 0 8px; }
.hero img { display: block; width: 100%; height: auto; border-radius: 14px; }
`;

/** The article itself. Mirrors `.article-body` in globals.css, in flat colours. */
const BODY_CSS = `
.post { margin-top: 30px; word-break: break-word; }
.post > * + * { margin-top: 1.15rem; }
.post h2, .post h3, .post h4 {
  font-weight: 800; letter-spacing: -0.015em; line-height: 1.25; color: #14181f;
}
.post h2 {
  font-size: 27px; margin-top: 2.4rem;
  padding-bottom: 0.45rem; border-bottom: 1px solid #e4e7ec;
}
.post h3 { font-size: 21px; margin-top: 1.9rem; }
.post h4 { font-size: 17.5px; margin-top: 1.5rem; }
.post p { margin: 0; }
.post a {
  color: #1d4ed8; font-weight: 600;
  text-decoration: underline; text-underline-offset: 2px;
}
.post strong { font-weight: 700; }
.post ul, .post ol { padding-inline-start: 1.4rem; margin: 0; }
.post ul { list-style: disc; }
.post ol { list-style: decimal; }
.post li + li { margin-top: 0.4rem; }
.post li::marker { color: #1d4ed8; }
.post blockquote {
  margin: 0; padding: 0.9rem 1.15rem;
  border-inline-start: 3px solid #1d4ed8; background: #eff4ff;
  border-radius: 12px; font-style: italic; color: #4b5563;
}
.post table {
  width: 100%; border-collapse: collapse; border: 1px solid #e4e7ec;
  font-size: 15px; display: block; overflow-x: auto;
}
.post th, .post td {
  border: 1px solid #e4e7ec; padding: 0.6rem 0.75rem;
  text-align: start; vertical-align: top;
}
.post th { background: #eff4ff; font-weight: 700; }
.post tbody tr:nth-child(even) { background: #f8f9fb; }
.post figure {
  margin: 2rem 0; border: 1px solid #e4e7ec; border-radius: 16px;
  overflow: hidden; background: #fff;
}
.post figure img { display: block; width: 100%; height: auto; border-radius: 0; }
.post figcaption { padding: 0.65rem 0.85rem; background: #f8f9fb; color: #6b7280; font-size: 12.5px; }
.post img { max-width: 100%; height: auto; border-radius: 12px; }
.post iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 16px; }
.post code { background: #f3f4f6; border-radius: 5px; padding: 0.1rem 0.35rem; font-size: 0.85em; }
.post pre { background: #f3f4f6; border: 1px solid #e4e7ec; border-radius: 12px; padding: 1rem; overflow-x: auto; }
.post hr { border: 0; border-top: 1px solid #e4e7ec; margin: 2rem 0; }
.post .article-callout {
  border: 1px solid #c7d7fe; background: #f5f8ff;
  border-radius: 16px; padding: 1.15rem 1.25rem;
}
.post .media-selected { outline: 0; }
.site-footer {
  border-top: 1px solid #e4e7ec; padding: 26px 24px 40px;
  text-align: center; font-size: 12.5px; color: #6b7280;
}
@media (max-width: 640px) {
  .wrap { padding: 28px 18px 48px; }
  h1.headline { font-size: 30px; letter-spacing: -0.022em; }
  .standfirst { font-size: 17px; }
  .post h2 { font-size: 23px; }
  .post h3 { font-size: 19px; }
}
`;

/**
 * The whole page, as one document. Every interpolated value is escaped except
 * `html` — that one is the article, and rendering it verbatim is the only way the
 * preview can be trusted. The frame it lands in is sandboxed for that reason.
 */
function buildDoc(
  props: PagePreviewProps,
  dateLabel: string,
  minutes: number
): string {
  const title = escapeHtml((props.title || "Untitled article").trim());
  const site = escapeHtml((props.siteName || "").trim());
  const initial = escapeHtml(((props.siteName || "").trim().charAt(0) || "•").toUpperCase());
  const author = (props.authorName || "").trim();
  const locale = resolveLanguage(props.language || "");

  const hero = props.featuredImageUrl
    ? `<figure class="hero"><img src="${escapeHtml(props.featuredImageUrl)}" alt="${escapeHtml(
        props.featuredImageAlt || (props.title || "").trim()
      )}"></figure>`
    : "";

  const deck = (props.excerpt || "").trim()
    ? `<p class="standfirst">${escapeHtml((props.excerpt || "").trim())}</p>`
    : "";

  // Only the facts we hold: an author line appears when a name was entered.
  const byline = [
    author ? `<span class="who">By ${escapeHtml(author)}</span>` : "",
    escapeHtml(dateLabel),
    `${minutes} min read`,
  ]
    .filter(Boolean)
    .join(' <span class="dot">·</span> ');

  return `<!doctype html>
<html lang="${locale.code}" dir="${locale.rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<base target="_blank">
<style>${PAGE_CSS}${BODY_CSS}</style>
</head>
<body>
${
  site
    ? `<header class="site-header">
  <span class="site-mark">${initial}</span>
  <span class="site-name">${site}</span>
</header>`
    : ""
}
<main class="wrap">
  <article>
    <h1 class="headline">${title}</h1>
    ${deck}
    <div class="byline">${byline}</div>
    ${hero}
    <div class="post">${props.html}</div>
  </article>
</main>
<footer class="site-footer">© ${new Date().getFullYear()}${site ? ` ${site}` : ""}</footer>
</body>
</html>`;
}

export default function PagePreview(props: PagePreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const shell = useRef<HTMLDivElement | null>(null);
  /** The width we have to fit the frame into. 0 until it has been measured. */
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    const measure = () => setAvailable(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const frame = VIEWPORTS.find((v) => v.key === viewport) ?? VIEWPORTS[0];
  // A real 1280px viewport, drawn smaller. Never scaled up past 1:1.
  const scale = available > 0 ? Math.min(1, available / frame.width) : 1;
  const offset = Math.max(0, Math.round((available - frame.width * scale) / 2));

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    []
  );
  const minutes = Math.max(1, Math.round(props.wordCount / 220));
  const address = addressLine(props.siteUrl || "", props.slug || slugify(props.title || ""));

  const doc = useMemo(
    () => buildDoc(props, dateLabel, minutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.html,
      props.title,
      props.siteName,
      props.authorName,
      props.excerpt,
      props.featuredImageUrl,
      props.featuredImageAlt,
      props.language,
      dateLabel,
      minutes,
    ]
  );

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {VIEWPORTS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setViewport(v.key)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                viewport === v.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {frame.width} × {frame.height} px
          {scale < 1 ? ` · shown at ${Math.round(scale * 100)}%` : " · actual size"}
        </span>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        A plain article page at real widths, so you can see the shape of it — the headline
        length, where the images fall, how a table behaves on a phone. Your own theme&apos;s
        fonts, colours and container will differ. Pictures load from their live URLs.
      </p>

      <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="flex gap-1" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          </span>
          <span className="truncate rounded-md bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {address}
          </span>
        </div>
        <div ref={shell} className="relative" style={{ height: Math.round(frame.height * scale) }}>
          {available > 0 && (
            <iframe
              title="Page preview"
              srcDoc={doc}
              /**
               * No `allow-same-origin`: the document sits on an opaque origin, so
               * markup pasted into the HTML tab cannot read this app's DOM,
               * cookies or storage. Scripts are allowed so embedded video plays;
               * popups so a link in the article can be clicked and followed.
               */
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              className="absolute top-0 border-0 bg-white"
              style={{
                left: offset,
                width: frame.width,
                height: frame.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
