// ============================================================================
// DETERMINISTIC ARTICLE ASSEMBLY
//
// Everything in this file is a pure function. The model writes prose; the code
// decides structure, injects links and images, and *measures* the result.
//
// Why it matters: the previous build asked the model to report its own SEO score
// and link counts, so the scorecard was fiction. Here every number on the
// scorecard is counted off the HTML that actually ships, and every checklist row
// is produced by the same measurement that feeds the score.
// ============================================================================

export interface TOCItem {
  id: string;
  text: string;
  level: number;
}

export interface SEOCheckItem {
  rule: string;
  passed: boolean;
  details: string;
  /** Weight this rule contributes to the 0–100 score. */
  weight: number;
}

export interface ArticleSectionPart {
  heading: string;
  level: 2 | 3;
  /** Inner HTML for the section — paragraphs, lists, tables. No heading tag. */
  html: string;
  /** Which E-E-A-T pillar this section is carrying. */
  pillar?: string;
  anchorId: string;
}

export interface ArticleImage {
  url: string;
  alt: string;
  caption?: string;
  credit?: string;
  /** Insert after this section index (0-based). -1 = hero, above the intro. */
  afterSectionIndex: number;
  source?: string;
}

export interface ArticleLink {
  anchorText: string;
  url: string;
  /** Publisher / page title, used for the citation list and the checklist copy. */
  label?: string;
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

export function countHtmlWords(html: string): number {
  return countWords(stripHtml(html));
}

export function slugify(value: string, maxLength = 70): string {
  const slug = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-[^-]*$/, "").replace(/-$/, "");
}

// ---------------------------------------------------------------------------
// MODEL OUTPUT CLEAN-UP
// ---------------------------------------------------------------------------

/**
 * Turns the two literal characters `\` + `n` back into a real newline.
 *
 * Models building HTML inside a JSON field routinely emit the escape sequence
 * verbatim. The previous build passed that straight to WordPress, where readers
 * saw `\n` printed between paragraphs.
 */
export function fixEscapedNewlines(html: string): string {
  return String(html || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ");
}

/**
 * Removes the wrappers a chat model likes to add (fenced code blocks, a stray
 * H1 that would fight the CMS title, `<html>`/`<body>` shells) and strips any
 * `<script>`/`<style>`/`<iframe>` the model invented. Our own YouTube embed and
 * JSON-LD are added afterwards by code, so nothing legitimate is lost.
 */
export function sanitizeModelHtml(raw: string): string {
  let html = fixEscapedNewlines(String(raw || "").trim());

  html = html
    .replace(/^```(?:html|HTML)?\s*/g, "")
    .replace(/```\s*$/g, "")
    .replace(/<\/?(?:html|head|body|main|article)[^>]*>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");

  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");

  // A model-written H1 duplicates the post title in every CMS we publish to.
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "");

  return html.replace(/\n{3,}/g, "\n\n").trim();
}

/** Splits an HTML fragment into text/tag segments (odd indices are tags). */
function segmentHtml(html: string): string[] {
  return html.split(/(<[^>]+>)/g);
}

/**
 * Wraps the first plain-text occurrence of `anchorText` in a link.
 *
 * Walks text nodes only, so it can never corrupt an attribute, and skips text
 * already inside an `<a>` or a heading — a link inside an H2 is a WordPress
 * theme hazard and a double link is a Google spam signal.
 */
export function injectLink(
  html: string,
  anchorText: string,
  href: string,
  options?: { external?: boolean; title?: string }
): { html: string; applied: boolean } {
  const needle = (anchorText || "").trim();
  if (!needle || !href) return { html, applied: false };
  if (html.includes(`href="${href}"`)) return { html, applied: false };

  const parts = segmentHtml(html);
  let anchorDepth = 0;
  let headingDepth = 0;

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const tag = parts[i];
      if (/^<a\b/i.test(tag)) anchorDepth++;
      else if (/^<\/a>/i.test(tag)) anchorDepth = Math.max(0, anchorDepth - 1);
      else if (/^<h[1-6]\b/i.test(tag)) headingDepth++;
      else if (/^<\/h[1-6]>/i.test(tag)) headingDepth = Math.max(0, headingDepth - 1);
      continue;
    }
    if (anchorDepth > 0 || headingDepth > 0) continue;

    const segment = parts[i];
    if (!segment.trim()) continue;

    const idx = segment.toLowerCase().indexOf(needle.toLowerCase());
    if (idx === -1) continue;

    const matched = segment.slice(idx, idx + needle.length);
    const attrs = options?.external
      ? ` target="_blank" rel="noopener"`
      : "";
    const titleAttr = options?.title ? ` title="${escapeHtml(options.title)}"` : "";
    parts[i] =
      segment.slice(0, idx) +
      `<a href="${escapeHtml(href)}"${titleAttr}${attrs}>${matched}</a>` +
      segment.slice(idx + needle.length);

    return { html: parts.join(""), applied: true };
  }

  return { html, applied: false };
}

// ---------------------------------------------------------------------------
// READABILITY (real Flesch Reading Ease, not a vibe)
// ---------------------------------------------------------------------------

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface ReadabilityResult {
  score: number;
  label: string;
  avgSentenceWords: number;
}

export function computeReadability(text: string): ReadabilityResult {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) {
    return { score: 0, label: "Not enough text", avgSentenceWords: 0 };
  }

  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  const score = Math.max(
    0,
    Math.min(100, 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord)
  );

  let label = "Very difficult";
  if (score >= 80) label = "Very easy";
  else if (score >= 70) label = "Easy";
  else if (score >= 60) label = "Plain English";
  else if (score >= 50) label = "Fairly difficult";
  else if (score >= 30) label = "Difficult";

  return {
    score: Math.round(score),
    label,
    avgSentenceWords: Math.round(wordsPerSentence * 10) / 10,
  };
}

/** Case-insensitive whole-phrase occurrences of the focus keyword. */
export function countKeywordOccurrences(text: string, keyword: string): number {
  const kw = (keyword || "").trim();
  if (!kw) return 0;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const matches = text.match(new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu"));
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// BLOCK BUILDERS
// ---------------------------------------------------------------------------

/**
 * Figure markup. `aspect-[16/9]` is deliberately NOT forced here — the old build
 * cropped every vertical or square image into a letterbox. Intrinsic size is
 * declared instead so the browser reserves the right box (no layout shift, which
 * is a Core Web Vitals signal).
 */
export function buildFigure(image: {
  url: string;
  alt: string;
  caption?: string;
  credit?: string;
  hero?: boolean;
  width?: number;
  height?: number;
}): string {
  if (!image?.url) return "";
  const cls = image.hero ? "hero-cover-image" : "article-inline-image";
  const dims =
    image.width && image.height ? ` width="${image.width}" height="${image.height}"` : "";
  const captionText = [image.caption, image.credit].filter(Boolean).join(" · ");
  const caption = captionText
    ? `<figcaption>${escapeHtml(captionText)}</figcaption>`
    : "";
  return `<figure class="${cls}"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(
    image.alt || ""
  )}"${dims} loading="lazy" decoding="async" />${caption}</figure>`;
}

export function buildTableOfContents(items: TOCItem[], heading: string): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item) =>
        `<li class="toc-level-${item.level}"><a href="#${escapeHtml(item.id)}">${escapeHtml(
          item.text
        )}</a></li>`
    )
    .join("");
  return `<nav class="article-toc" aria-label="${escapeHtml(
    heading
  )}"><h2 class="toc-title">${escapeHtml(heading)}</h2><ol>${rows}</ol></nav>`;
}

export function buildKeyTakeaways(points: string[], heading: string): string {
  const clean = points.map((p) => stripHtml(p)).filter(Boolean);
  if (clean.length === 0) return "";
  const items = clean.map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  return `<aside class="key-takeaways"><h2>${escapeHtml(
    heading
  )}</h2><ul>${items}</ul></aside>`;
}

export function buildFaqSection(
  faqItems: { question: string; answer: string }[],
  heading: string
): string {
  const clean = faqItems.filter((f) => f?.question && f?.answer);
  if (clean.length === 0) return "";
  const blocks = clean
    .map(
      (f) =>
        `<div class="faq-item"><h3 class="faq-question">${escapeHtml(
          f.question
        )}</h3><div class="faq-answer">${f.answer.trim().startsWith("<") ? f.answer : `<p>${escapeHtml(f.answer)}</p>`}</div></div>`
    )
    .join("");
  return `<section class="article-faq" id="faq"><h2>${escapeHtml(heading)}</h2>${blocks}</section>`;
}

/**
 * The questions and answers back out of a finished page.
 *
 * The pattern matched is the one `buildFaqSection` above emits, which is why the
 * two live together: a parser kept anywhere else drifts from the builder the
 * first time the markup changes, and then the structured data describes an FAQ
 * the page does not have. Reads only what is on the page — nothing is recovered
 * from the outline, because a question the writer never answered is not an FAQ.
 */
export function parseFaqSection(html: string): { question: string; answer: string }[] {
  const matches = Array.from(
    html.matchAll(
      /<div class="faq-item">\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/div>/gi
    )
  );
  return matches
    .map((match) => ({
      question: stripHtml(match[1]),
      answer: stripHtml(match[2]),
    }))
    .filter((item) => item.question && item.answer);
}

export function buildSourcesSection(links: ArticleLink[], heading: string): string {
  if (links.length === 0) return "";
  const items = links
    .map(
      (l) =>
        `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(
          l.label || l.anchorText || l.url
        )}</a></li>`
    )
    .join("");
  return `<section class="article-sources"><h2>${escapeHtml(
    heading
  )}</h2><ul>${items}</ul></section>`;
}

/**
 * Gives every H2/H3 a stable, unique id and returns the table of contents built
 * from the headings that really exist in the document.
 */
export function injectHeadingIds(html: string): { html: string; toc: TOCItem[] } {
  const toc: TOCItem[] = [];
  const used = new Set<string>();

  const out = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_full, levelRaw: string, attrs: string, inner: string) => {
      const level = Number(levelRaw);
      const text = stripHtml(inner);
      if (!text) return `<h${levelRaw}${attrs}>${inner}</h${levelRaw}>`;

      const existing = attrs.match(/\sid\s*=\s*"([^"]+)"/i);
      let id = existing?.[1] || slugify(text, 60) || `section-${toc.length + 1}`;
      let n = 2;
      while (used.has(id)) id = `${id}-${n++}`;
      used.add(id);

      // Skip our own scaffolding headings (TOC / takeaways) in the TOC itself.
      const isScaffold = /toc-title/.test(attrs) || /key-takeaways/.test(attrs);
      if (!isScaffold) toc.push({ id, text, level });

      const cleanedAttrs = attrs.replace(/\sid\s*=\s*"[^"]*"/i, "");
      return `<h${levelRaw}${cleanedAttrs} id="${id}">${inner}</h${levelRaw}>`;
    }
  );

  return { html: out, toc };
}

// ---------------------------------------------------------------------------
// ASSEMBLY
// ---------------------------------------------------------------------------

export interface AssemblyLabels {
  toc: string;
  takeaways: string;
  faq: string;
  sources: string;
}

export interface AssemblyInput {
  title: string;
  intro: string;
  sections: ArticleSectionPart[];
  conclusion: string;
  keyTakeaways: string[];
  faqItems: { question: string; answer: string }[];
  images: ArticleImage[];
  youtube?: { embedHtml: string; afterSectionIndex: number } | null;
  internalLinks: ArticleLink[];
  externalLinks: ArticleLink[];
  includeToc: boolean;
  includeTakeaways: boolean;
  includeFaq: boolean;
  includeSources: boolean;
  labels: AssemblyLabels;
}

export interface AssemblyResult {
  html: string;
  toc: TOCItem[];
  internalLinksApplied: ArticleLink[];
  externalLinksApplied: ArticleLink[];
  imagesUsed: number;
}

export function assembleArticle(input: AssemblyInput): AssemblyResult {
  // ── 1. Link injection, into the prose only ────────────────────────────────
  const sections = input.sections.map((s) => ({ ...s }));
  let intro = input.intro;
  const internalApplied: ArticleLink[] = [];
  const externalApplied: ArticleLink[] = [];

  const applyLink = (link: ArticleLink, external: boolean): boolean => {
    for (const section of sections) {
      const res = injectLink(section.html, link.anchorText, link.url, {
        external,
        title: link.label,
      });
      if (res.applied) {
        section.html = res.html;
        return true;
      }
    }
    const introRes = injectLink(intro, link.anchorText, link.url, {
      external,
      title: link.label,
    });
    if (introRes.applied) {
      intro = introRes.html;
      return true;
    }
    return false;
  };

  for (const link of input.internalLinks) {
    if (applyLink(link, false)) internalApplied.push(link);
  }
  for (const link of input.externalLinks) {
    if (applyLink(link, true)) externalApplied.push(link);
  }

  // ── 2. Body ───────────────────────────────────────────────────────────────
  const hero = input.images.find((img) => img.afterSectionIndex < 0);
  const blocks: string[] = [];
  let imagesUsed = 0;

  if (hero?.url) {
    blocks.push(buildFigure({ ...hero, hero: true, width: 1200, height: 630 }));
    imagesUsed++;
  }
  if (intro.trim()) blocks.push(intro.trim());
  if (input.includeTakeaways) {
    const box = buildKeyTakeaways(input.keyTakeaways, input.labels.takeaways);
    if (box) blocks.push(box);
  }

  const tocPlaceholder = "<!--POSTLOOM_TOC-->";
  if (input.includeToc) blocks.push(tocPlaceholder);

  sections.forEach((section, index) => {
    blocks.push(`<h${section.level}>${escapeHtml(section.heading)}</h${section.level}>`);
    blocks.push(section.html.trim());

    for (const image of input.images) {
      if (image.afterSectionIndex === index && image.url) {
        blocks.push(buildFigure({ ...image, width: 1200, height: 630 }));
        imagesUsed++;
      }
    }
    if (input.youtube && input.youtube.afterSectionIndex === index) {
      blocks.push(input.youtube.embedHtml);
    }
  });

  if (input.conclusion.trim()) blocks.push(input.conclusion.trim());
  if (input.includeFaq) {
    const faq = buildFaqSection(input.faqItems, input.labels.faq);
    if (faq) blocks.push(faq);
  }
  if (input.includeSources && externalApplied.length > 0) {
    const sources = buildSourcesSection(externalApplied, input.labels.sources);
    if (sources) blocks.push(sources);
  }

  // ── 3. Heading ids + real TOC ─────────────────────────────────────────────
  const body = blocks.filter(Boolean).join("\n\n");
  const withIds = injectHeadingIds(body);
  const toc = withIds.toc.filter((item) => item.text !== input.labels.toc);

  const html = input.includeToc
    ? withIds.html.replace(tocPlaceholder, buildTableOfContents(toc, input.labels.toc))
    : withIds.html.replace(tocPlaceholder, "");

  return {
    html: html.trim(),
    toc,
    internalLinksApplied: internalApplied,
    externalLinksApplied: externalApplied,
    imagesUsed,
  };
}

// ---------------------------------------------------------------------------
// STRUCTURED DATA
// ---------------------------------------------------------------------------

export interface SchemaInput {
  title: string;
  metaDescription: string;
  slug: string;
  keyword: string;
  brandName?: string;
  siteUrl?: string;
  authorName?: string;
  heroImageUrl?: string;
  faqItems: { question: string; answer: string }[];
  wordCount: number;
  publishedAt?: string;
  /**
   * BCP-47 tag for `inLanguage`. Defaults to "en".
   *
   * A page written in Urdu that declares itself English is a wrong statement
   * about the page, so the caller passes what it actually wrote.
   */
  language?: string;
}

/**
 * One JSON-LD @graph: BlogPosting + FAQPage + BreadcrumbList.
 *
 * Only fields we actually know are emitted. A schema block claiming an author or
 * a publisher that does not exist is a Trust violation, which is the one pillar
 * of E-E-A-T you cannot fake your way past.
 */
export function buildSchemaMarkup(input: SchemaInput): string {
  const site = (input.siteUrl || "").replace(/\/+$/, "");
  const pageUrl = site && input.slug ? `${site}/${input.slug}` : undefined;
  const published = input.publishedAt || new Date().toISOString();

  const graph: any[] = [];

  const article: any = {
    "@type": "BlogPosting",
    headline: input.title.slice(0, 110),
    description: input.metaDescription,
    keywords: input.keyword,
    wordCount: input.wordCount,
    datePublished: published,
    dateModified: published,
    inLanguage: (input.language || "en").trim() || "en",
  };
  if (pageUrl) {
    article["@id"] = `${pageUrl}#article`;
    article.mainEntityOfPage = { "@type": "WebPage", "@id": pageUrl };
    article.url = pageUrl;
  }
  if (input.heroImageUrl) {
    article.image = { "@type": "ImageObject", url: input.heroImageUrl };
  }
  if (input.authorName) {
    article.author = { "@type": "Person", name: input.authorName };
  }
  if (input.brandName) {
    article.publisher = {
      "@type": "Organization",
      name: input.brandName,
      ...(site ? { url: site } : {}),
    };
  }
  graph.push(article);

  const faqs = input.faqItems.filter((f) => f?.question && f?.answer);
  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: stripHtml(f.answer) },
      })),
    });
  }

  if (site) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: site },
        ...(pageUrl
          ? [{ "@type": "ListItem", position: 2, name: input.title.slice(0, 90), item: pageUrl }]
          : []),
      ],
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

// ---------------------------------------------------------------------------
// MEASUREMENT + SCORE
// ---------------------------------------------------------------------------

export interface ArticleMeasurement {
  wordCount: number;
  keywordCount: number;
  keywordDensity: number;
  headingCount: { h2: number; h3: number };
  keywordInH2: boolean;
  metaTitleLength: number;
  metaDescriptionLength: number;
  readabilityScore: string;
  readabilityValue: number;
  avgSentenceWords: number;
  readingTimeMinutes: number;
  internalLinksCount: number;
  externalLinksCount: number;
  imageCount: number;
  imagesWithAlt: number;
  hasSchemaMarkup: boolean;
  hasToc: boolean;
  faqCount: number;
  keywordInTitle: boolean;
  keywordInIntro: boolean;
  keywordInMetaDescription: boolean;
  seoScore: number;
}

export interface MeasureInput {
  html: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keyword: string;
  schemaMarkup: string;
  faqCount: number;
  /** The word count the user asked for, so the score can grade against it. */
  targetWordCount: number;
  /** Host of the site being published to — decides internal vs external links. */
  siteHost?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function measureArticle(input: MeasureInput): {
  metrics: ArticleMeasurement;
  checklist: SEOCheckItem[];
} {
  const text = stripHtml(input.html);
  const wordCount = countWords(text);
  const keywordCount = countKeywordOccurrences(text, input.keyword);
  const keywordDensity =
    wordCount > 0 ? Math.round((keywordCount / wordCount) * 10000) / 100 : 0;

  const h2 = (input.html.match(/<h2\b/gi) || []).length;
  const h3 = (input.html.match(/<h3\b/gi) || []).length;

  const h2Texts = Array.from(input.html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)).map((m) =>
    stripHtml(m[1]).toLowerCase()
  );
  const kwLower = input.keyword.trim().toLowerCase();
  const keywordInH2 = kwLower ? h2Texts.some((t) => t.includes(kwLower)) : false;

  const anchors = Array.from(input.html.matchAll(/<a\b[^>]*href\s*=\s*"([^"]+)"/gi)).map(
    (m) => m[1]
  );
  const siteHost = (input.siteHost || "").replace(/^www\./i, "").toLowerCase();
  let internalLinksCount = 0;
  let externalLinksCount = 0;
  for (const href of anchors) {
    if (href.startsWith("#") || href.startsWith("mailto:")) continue;
    const h = hostOf(href);
    if (!h || (siteHost && h === siteHost)) internalLinksCount++;
    else externalLinksCount++;
  }

  const imgTags = Array.from(input.html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  const imageCount = imgTags.length;
  const imagesWithAlt = imgTags.filter((tag) => /\salt\s*=\s*"[^"]+"/i.test(tag)).length;

  const readability = computeReadability(text);
  const firstWords = text.split(/\s+/).slice(0, 120).join(" ");

  const keywordInTitle = kwLower ? input.title.toLowerCase().includes(kwLower) : false;
  const keywordInIntro = kwLower ? firstWords.toLowerCase().includes(kwLower) : false;
  const keywordInMetaDescription = kwLower
    ? input.metaDescription.toLowerCase().includes(kwLower)
    : false;
  const hasSchemaMarkup = input.schemaMarkup.trim().length > 40;
  const hasToc = /class="article-toc"/.test(input.html);

  const target = Math.max(0, input.targetWordCount);
  const wordDelta = target > 0 ? Math.abs(wordCount - target) / target : 0;

  // Every row is a measurement of the shipped HTML. The score is the weighted
  // sum of the rows that passed — there is no separate "model said 94" path.
  const checks: SEOCheckItem[] = [
    {
      rule: "Word count matches the requested length",
      passed: target === 0 ? wordCount >= 600 : wordDelta <= 0.05,
      details:
        target === 0
          ? `${wordCount} words`
          : `${wordCount} of ${target} requested (${wordCount >= target ? "+" : "−"}${Math.abs(
              wordCount - target
            )})`,
      weight: 12,
    },
    {
      rule: "Focus keyword in the title",
      passed: keywordInTitle,
      details: keywordInTitle ? `"${input.keyword}" present` : `"${input.keyword}" missing`,
      weight: 8,
    },
    {
      rule: "Focus keyword in the opening 120 words",
      passed: keywordInIntro,
      details: keywordInIntro ? "Found in the intro" : "Not found in the intro",
      weight: 6,
    },
    {
      rule: "Keyword density between 0.6% and 2.5%",
      passed: keywordDensity >= 0.6 && keywordDensity <= 2.5,
      details: `${keywordDensity}% (${keywordCount} uses)`,
      weight: 8,
    },
    {
      rule: "SEO title length 45–62 characters",
      passed: input.metaTitle.length >= 45 && input.metaTitle.length <= 62,
      details: `${input.metaTitle.length} characters`,
      weight: 6,
    },
    {
      rule: "Meta description length 130–160 characters",
      passed: input.metaDescription.length >= 130 && input.metaDescription.length <= 160,
      details: `${input.metaDescription.length} characters`,
      weight: 6,
    },
    {
      rule: "At least 3 H2 sections",
      passed: h2 >= 3,
      details: `${h2} H2 headings`,
      weight: 6,
    },
    {
      rule: "H3 sub-structure present",
      passed: h3 >= 1,
      details: `${h3} H3 headings`,
      weight: 4,
    },
    {
      rule: "Focus keyword in at least one H2",
      passed: keywordInH2,
      details: keywordInH2 ? "Present in a section heading" : "Not in any H2",
      weight: 4,
    },
    {
      rule: "Internal link to your own site",
      passed: internalLinksCount >= 1,
      details:
        internalLinksCount >= 1
          ? `${internalLinksCount} internal link${internalLinksCount === 1 ? "" : "s"}`
          : "None — connect a site so real URLs can be linked",
      weight: 8,
    },
    {
      rule: "At least 2 external authority citations",
      passed: externalLinksCount >= 2,
      details: `${externalLinksCount} external link${externalLinksCount === 1 ? "" : "s"}`,
      weight: 8,
    },
    {
      rule: "At least one image",
      passed: imageCount >= 1,
      details: `${imageCount} image${imageCount === 1 ? "" : "s"}`,
      weight: 6,
    },
    {
      rule: "Every image has alt text",
      passed: imageCount > 0 && imagesWithAlt === imageCount,
      details: `${imagesWithAlt}/${imageCount} with alt text`,
      weight: 2,
    },
    {
      rule: "FAQ block for People Also Ask coverage",
      passed: input.faqCount >= 3,
      details: `${input.faqCount} questions answered`,
      weight: 4,
    },
    {
      rule: "JSON-LD structured data",
      passed: hasSchemaMarkup,
      details: hasSchemaMarkup ? "BlogPosting + FAQ + Breadcrumb graph" : "Missing",
      weight: 4,
    },
    {
      rule: "Table of contents",
      passed: hasToc,
      details: hasToc ? "Jump links generated from real headings" : "Not included",
      weight: 2,
    },
    {
      rule: "Readability (Flesch) 50 or better",
      passed: readability.score >= 50,
      details: `${readability.score} — ${readability.label}, ${readability.avgSentenceWords} words/sentence`,
      weight: 6,
    },
  ];

  // The weights above total exactly 100, so the score needs no normalisation —
  // but it is normalised anyway so editing a rule can never produce 103/100.
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0) || 1;
  const earned = checks.reduce((sum, c) => (c.passed ? sum + c.weight : sum), 0);
  const seoScore = Math.round((earned / totalWeight) * 100);

  const metrics: ArticleMeasurement = {
    wordCount,
    keywordCount,
    keywordDensity,
    headingCount: { h2, h3 },
    keywordInH2,
    metaTitleLength: input.metaTitle.length,
    metaDescriptionLength: input.metaDescription.length,
    readabilityScore: readability.label,
    readabilityValue: readability.score,
    avgSentenceWords: readability.avgSentenceWords,
    readingTimeMinutes: Math.max(1, Math.round(wordCount / 225)),
    internalLinksCount,
    externalLinksCount,
    imageCount,
    imagesWithAlt,
    hasSchemaMarkup,
    hasToc,
    faqCount: input.faqCount,
    keywordInTitle,
    keywordInIntro,
    keywordInMetaDescription,
    seoScore,
  };

  return { metrics, checklist: checks };
}
