"use client";

/**
 * SEO SIDEBAR — only what was measured
 *
 * Every number here comes from `article.seoMetrics` and every row of the checklist
 * from `article.seoChecklist`, both produced by the generator after it read the
 * finished HTML. The old sidebar recomputed a score in the browser with its own
 * invented weights, printed a fixed eight-item "100/100" list, and filled gaps
 * with `internalLinksCount || 3`. When there is nothing to show, this says so.
 */

import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ExternalLink,
  Gauge,
  Image as ImageIcon,
  Link2,
  ListTree,
  MessageCircleQuestion,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import type { GeneratedArticle } from "./types";

export interface SeoSidebarProps {
  article: GeneratedArticle;
  keyword: string;
}

function scoreTone(score: number): { text: string; stroke: string } {
  if (score >= 80) return { text: "text-primary", stroke: "var(--primary)" };
  if (score >= 60) return { text: "text-secondary", stroke: "var(--secondary)" };
  return { text: "text-destructive", stroke: "var(--destructive)" };
}

function Row({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[11px] text-muted-foreground">
        {label}
        {hint ? <span className="block text-[10px] opacity-70">{hint}</span> : null}
      </span>
      <span
        className={`text-[11px] font-semibold shrink-0 ${
          ok === undefined ? "text-foreground" : ok ? "text-primary" : "text-destructive"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
function Panel({
  title,
  icon: Icon,
  children,
  count,
}: {
  title: string;
  icon: typeof Target;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2.5">
        <Icon className="w-3.5 h-3.5 text-primary" />
        {title}
        {count !== undefined && (
          <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-foreground">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

export default function SeoSidebar({ article, keyword }: SeoSidebarProps) {
  const m = article.seoMetrics;
  const tone = scoreTone(m.seoScore);
  const circumference = 2 * Math.PI * 42;
  const dash = (Math.max(0, Math.min(100, m.seoScore)) / 100) * circumference;
  const accuracyPct = Math.round((m.wordCountAccuracy || 0) * 100);
  const passed = article.seoChecklist.filter((c) => c.passed).length;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 96 96" className="w-24 h-24 -rotate-90">
              <circle cx="48" cy="48" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle
                cx="48"
                cy="48"
                r="42"
                fill="none"
                stroke={tone.stroke}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-black ${tone.text}`}>{m.seoScore}</span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">/ 100</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">SEO score</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {passed} of {article.seoChecklist.length} checks passed, weighted. Measured
              from the finished HTML, not estimated.
            </p>
            {article.searchIntent && (
              <p className="mt-1.5 inline-flex rounded-md bg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                {article.searchIntent} intent
              </p>
            )}
          </div>
        </div>
      </section>
      <Panel title="Length & readability" icon={Gauge}>
        <Row
          label="Words written"
          value={m.wordCount.toLocaleString()}
          ok={m.targetWordCount > 0 ? accuracyPct >= 95 : undefined}
        />
        {m.targetWordCount > 0 ? (
          <>
            <Row label="Words requested" value={m.targetWordCount.toLocaleString()} />
            <Row
              label="Hit rate"
              value={`${accuracyPct}%`}
              ok={accuracyPct >= 95}
              hint={
                m.wordCount === m.targetWordCount
                  ? "Exactly the requested length"
                  : `${m.wordCount > m.targetWordCount ? "Over" : "Under"} by ${Math.abs(
                      m.wordCount - m.targetWordCount
                    ).toLocaleString()}`
              }
            />
          </>
        ) : (
          <Row label="Words requested" value="No target set" />
        )}
        <Row label="Reading time" value={`${m.readingTimeMinutes} min`} />
        <Row
          label="Readability"
          value={m.readabilityScore}
          ok={m.readabilityValue >= 50}
          hint={`Flesch reading ease ${m.readabilityValue}`}
        />
        <Row
          label="Average sentence"
          value={`${m.avgSentenceWords} words`}
          ok={m.avgSentenceWords > 0 && m.avgSentenceWords <= 22}
          hint="Long sentences are what make copy read like a machine wrote it"
        />
      </Panel>
      <Panel title="Checks that were run" icon={BadgeCheck} count={article.seoChecklist.length}>
        {article.seoChecklist.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            The generator returned no checklist for this article.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {article.seoChecklist.map((check) => (
              <li key={check.rule} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 w-4 h-4 rounded-full shrink-0 inline-flex items-center justify-center ${
                    check.passed
                      ? "bg-primary/15 text-primary"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {check.passed ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium text-foreground">
                    {check.rule}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      weight {check.weight}
                    </span>
                  </span>
                  <span className="block text-[10px] text-muted-foreground leading-snug">
                    {check.details}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="E-E-A-T pillars" icon={ShieldCheck} count={article.pillarCoverage.length}>
        {article.pillarCoverage.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No pillar mapping came back for this article.
          </p>
        ) : (
          <ul className="space-y-2">
            {article.pillarCoverage.map((p) => (
              <li key={p.pillar}>
                <p className="text-[11px] font-semibold text-foreground">{p.pillar}</p>
                {p.sections.length > 0 ? (
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {p.sections.join(" · ")}
                  </p>
                ) : (
                  <p className="text-[10px] text-destructive">
                    Nothing in the article covers this one.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Keyword" icon={Target}>
        <p className="mb-1.5 truncate rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
          {keyword || article.title}
        </p>
        <Row
          label="Density"
          value={`${m.keywordDensity}%`}
          ok={m.keywordDensity >= 0.5 && m.keywordDensity <= 2.5}
          hint={`${m.keywordCount} mentions in ${m.wordCount.toLocaleString()} words`}
        />
        <Row label="In the title" value={m.keywordInTitle ? "Yes" : "No"} ok={m.keywordInTitle} />
        <Row label="In the opening" value={m.keywordInIntro ? "Yes" : "No"} ok={m.keywordInIntro} />
        <Row label="In an H2" value={m.keywordInH2 ? "Yes" : "No"} ok={m.keywordInH2} />
        <Row
          label="In the meta description"
          value={m.keywordInMetaDescription ? "Yes" : "No"}
          ok={m.keywordInMetaDescription}
        />
      </Panel>
      <Panel title="Structure" icon={ListTree}>
        <Row
          label="Meta title"
          value={`${m.metaTitleLength} chars`}
          ok={m.metaTitleLength >= 30 && m.metaTitleLength <= 60}
          hint="Google truncates past about 60"
        />
        <Row
          label="Meta description"
          value={`${m.metaDescriptionLength} chars`}
          ok={m.metaDescriptionLength >= 120 && m.metaDescriptionLength <= 160}
          hint="120–160 shows in full"
        />
        <Row label="H2 sections" value={String(m.headingCount.h2)} ok={m.headingCount.h2 >= 3} />
        <Row label="H3 sub-sections" value={String(m.headingCount.h3)} />
        <Row
          label="Table of contents"
          value={m.hasToc ? `${article.tableOfContents.length} entries` : "Not included"}
          ok={m.hasToc}
        />
        <Row
          label="Schema markup"
          value={m.hasSchemaMarkup ? "Present" : "Missing"}
          ok={m.hasSchemaMarkup}
        />
        <Row
          label="Key takeaways"
          value={article.keyTakeaways.length ? `${article.keyTakeaways.length} listed` : "None"}
        />
        {article.tableOfContents.length > 0 && (
          <ol className="mt-2 space-y-0.5 border-t border-border pt-2">
            {article.tableOfContents.map((item) => (
              <li
                key={item.id}
                className="truncate text-[10px] text-muted-foreground"
                style={{ paddingLeft: `${Math.max(0, item.level - 2) * 10}px` }}
              >
                {item.text}
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel title="Questions answered" icon={MessageCircleQuestion} count={m.faqCount}>
        {article.faqItems.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No FAQ block. It is what wins the People-also-ask slot, so turn it on before
            generating.
          </p>
        ) : (
          <ul className="space-y-1">
            {article.faqItems.map((f) => (
              <li key={f.question} className="text-[11px] leading-snug text-foreground">
                {f.question}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Images" icon={ImageIcon} count={m.imageCount}>
        {m.imageCount === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No images in the HTML. Add one from the media studio above the editor.
          </p>
        ) : (
          <Row
            label="With alt text"
            value={`${m.imagesWithAlt} of ${m.imageCount}`}
            ok={m.imagesWithAlt === m.imageCount}
            hint="An image with no alt text is invisible to search and to a screen reader"
          />
        )}
        {article.youtube && (
          <Row label="Video embedded" value="Yes" ok hint={article.youtube.title} />
        )}
      </Panel>
      <Panel title="Internal links" icon={Link2} count={m.internalLinksCount}>
        {article.internalLinks.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            None. Connect the site you publish to and the writer links to its real pages
            instead of inventing paths.
          </p>
        ) : (
          <ul className="space-y-1">
            {article.internalLinks.map((l) => (
              <li key={`${l.url}-${l.anchorText}`} className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-foreground">
                  {l.anchorText}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">{l.url}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="External sources" icon={ExternalLink} count={m.externalLinksCount}>
        {article.externalLinks.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            None cited. An outbound citation to a source that can be checked is the clearest
            trust signal an article carries.
          </p>
        ) : (
          <ul className="space-y-1">
            {article.externalLinks.map((l) => (
              <li key={`${l.url}-${l.anchorText}`} className="min-w-0">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[11px] font-medium text-primary hover:text-secondary"
                >
                  {l.anchorText}
                </a>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {l.label || l.url}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {article.warnings.length > 0 && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
            <AlertTriangle className="w-3.5 h-3.5" />
            What could not be done
          </h3>
          <ul className="space-y-1">
            {article.warnings.map((w) => (
              <li key={w} className="text-[11px] leading-snug text-foreground">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
