"use client";

/**
 * WHAT THIS RUN KNOWS ABOUT YOUR BUSINESS
 *
 * The panel the plan asks for, and the reason it is clickable rather than a line
 * of reassurance: "we analysed your business" is worth nothing on its own, and
 * worth a great deal when opening it shows the four services it could name, the
 * eleven pages it actually read, the two it could not, and — the part that keeps
 * the rest honest — the list of things it could not prove and therefore will not
 * let the writer assert.
 *
 * Every number here is a length or a count of something on screen beside it.
 * There is no percentage, no grade and no "analysis complete": the business stage
 * either read a page or it did not, and this says which.
 *
 * Two stages feed it and they are not the same fact. `business` is stage one and
 * runs in both pipelines. `inventory` is stage two and is deep only — in quick
 * mode it reports as unavailable rather than as pending, because quick mode is
 * never going to crawl the site.
 */

import { Building2, Check, CircleHelp, FileText, Link2 } from "lucide-react";
import type { ArticleRunView } from "@/lib/article/types";
import { AnalysisCard, Block, Chips, OutLink, Stat, StageAbsence } from "./AnalysisShell";
import type { RunAnalysis } from "./runArticle";

export interface BusinessPanelProps {
  run: ArticleRunView;
  analysis: RunAnalysis;
}

/** The host, for a readable link. Falls back to the URL when it cannot be parsed. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

export default function BusinessPanel({ run, analysis }: BusinessPanelProps) {
  const { business, inventory } = analysis;

  // The subtitle is the same counts the open card shows, so a closed card cannot
  // claim more than an open one.
  const summaryBits = [
    business ? `${business.services.length} service${business.services.length === 1 ? "" : "s"} named` : "",
    business?.unverified.length
      ? `${business.unverified.length} thing${business.unverified.length === 1 ? "" : "s"} unproven`
      : "",
    inventory ? `${inventory.pages.length} of ${inventory.discovered} pages read` : "",
  ].filter(Boolean);

  return (
    <AnalysisCard
      title="What this run knows about your business"
      icon={Building2}
      subtitle={
        summaryBits.length
          ? summaryBits.join(" · ")
          : "Open to see what the first two stages could and could not establish."
      }
    >
      <Block title="Your business, as the run read it">
        {business ? (
          <div className="space-y-2">
            <p className="text-[11px] leading-relaxed text-foreground">{business.summary}</p>
            {business.audience && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Who it is for: </span>
                {business.audience}
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Stat value={business.services.length} label="services named" />
              <Stat value={business.proofPoints.length} label="things your site proves" />
              <Stat value={business.unverified.length} label="things it could not prove" />
              <Stat value={business.sourceUrls.length} label="pages read for this" />
            </div>
          </div>
        ) : (
          <StageAbsence
            run={run}
            stage="business"
            unavailable="This pipeline does not include the business stage."
            empty="The business stage ran without producing a profile, so this article was written from your brand details alone."
          />
        )}
      </Block>

      {business && business.services.length > 0 && (
        <Block title="Services it could name">
          <Chips items={business.services} />
        </Block>
      )}

      {business && business.proofPoints.length > 0 && (
        <Block title="What your site demonstrates">
          <ul className="space-y-1">
            {business.proofPoints.map((point, index) => (
              <li key={`${point}-${index}`} className="flex gap-1.5">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span className="text-[11px] leading-snug text-foreground">{point}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {business && business.unverified.length > 0 && (
        <Block title="What it could not prove">
          <ul className="space-y-1">
            {business.unverified.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-1.5">
                <CircleHelp className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-[11px] leading-snug text-foreground">{item}</span>
              </li>
            ))}
          </ul>
          {/* The whole reason the list is shown rather than quietly held: the
              writer is handed these as forbidden, and the person reading this is
              the only one who can turn one of them into a fact. */}
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            None of these is stated in the article. If one of them matters for this
            topic, add it to your brand details and run again — the writer states
            what it can point at and nothing else.
          </p>
        </Block>
      )}

      {business && business.sourceUrls.length > 0 && (
        <Block title="Pages this was read from">
          <ul className="space-y-0.5">
            {business.sourceUrls.map((url) => (
              <li key={url} className="flex gap-1.5">
                <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <OutLink href={url}>{url.replace(/^https?:\/\//i, "")}</OutLink>
              </li>
            ))}
          </ul>
        </Block>
      )}
      <Block title="Your existing content">
        {inventory ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Stat value={inventory.pages.length} label="pages read" />
              <Stat value={inventory.discovered} label="URLs found" />
              <Stat value={inventory.unreadable.length} label="could not be read" />
              <Stat
                value={inventory.pages.filter((page) => page.linkTarget).length}
                label="usable as link targets"
              />
            </div>
            {inventory.site && (
              <p className="text-[10px] text-muted-foreground">
                Crawled <OutLink href={inventory.site}>{hostOf(inventory.site)}</OutLink>. Word
                counts are counted off the text of each page, not estimated.
              </p>
            )}
            {inventory.note && (
              <p className="text-[11px] leading-snug text-muted-foreground">{inventory.note}</p>
            )}
          </div>
        ) : (
          <StageAbsence
            run={run}
            stage="inventory"
            unavailable="The quick pipeline does not crawl your site. Deep mode reads your existing pages, which is what lets it avoid repeating a topic you have already covered and point internal links at real URLs."
            empty="The crawl ran and read nothing, so nothing here was checked against your existing pages."
          />
        )}
      </Block>

      {inventory && inventory.topics.length > 0 && (
        <Block title="Topics your site already covers">
          <Chips items={inventory.topics} limit={40} />
        </Block>
      )}

      {inventory && inventory.pages.length > 0 && (
        <Block title="The pages it read">
          <ul className="space-y-1">
            {inventory.pages.slice(0, 12).map((page) => (
              <li key={page.url} className="flex gap-1.5">
                <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <OutLink href={page.url}>{page.title || hostOf(page.url)}</OutLink>
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    {page.wordCount.toLocaleString()} words
                    {page.headings.length
                      ? ` · ${page.headings.length} heading${page.headings.length === 1 ? "" : "s"}`
                      : ""}
                    {page.linkTarget ? " · link target" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {inventory.pages.length > 12 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              +{inventory.pages.length - 12} more read.
            </p>
          )}
        </Block>
      )}

      {inventory && inventory.unreadable.length > 0 && (
        <Block title="Pages it could not read">
          <ul className="space-y-1">
            {inventory.unreadable.map((page) => (
              <li key={page.url} className="text-[11px] leading-snug">
                <OutLink href={page.url}>{page.url.replace(/^https?:\/\//i, "")}</OutLink>
                <span className="text-muted-foreground"> — {page.reason}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </AnalysisCard>
  );
}
