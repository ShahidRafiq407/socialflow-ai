# Article Writer — final implementation plan

Scope agreed with the workspace owner: turn the Article Writer into a staged,
multi-agent research-and-writing pipeline whose every claim is traceable, whose
progress is real, and which publishes to WordPress, Shopify or a hand-coded
site. Nothing invented, nothing hard-coded, no placeholder data anywhere.

## The two constraints that shape everything

**1. Vercel caps a serverless function at 300s.** The current design runs the
whole article inside one POST with a 235s internal budget. An 8-agent pipeline
with fact-checking, originality and three audits cannot fit in that. So a run
stops being one request and becomes a **sequence of stages**, each its own
request, with the state of the run persisted between them. This is also what
makes honest progress possible: today the UI counts elapsed seconds because the
server cannot report back mid-flight.

**2. A claim with no source is a liability.** Every agent that produces a fact
must carry the URL it came from, and the fact-checker must be able to fail a
claim. Where a source cannot be found the claim is removed, not softened.

## Stage machine

```
ArticleRun row  ─ stage ─ state(json) ─ artifacts(json) ─ score ─ status
        ▲                                    │
        └──── POST /api/article-writer { step: "advance", runId } ────┘
```

Each advance runs exactly one stage, writes its artifacts back to the row, and
returns the next stage name. The client renders artifacts as they land, so the
editor fills in progressively instead of staying blank for four minutes.

| # | Stage | Quick | Deep | Produces |
|---|-------|-------|------|----------|
| 1 | `business` | ✓ | ✓ | BusinessProfile — Brand DNA + site crawl, `unknown` where the site does not say |
| 2 | `inventory` | | ✓ | Existing pages, posts, services, internal-link pool, cannibalisation warnings |
| 3 | `intent` | ✓ | ✓ | Intent class + deeper intent + "what answer would satisfy this" |
| 4 | `serp` | ✓ | ✓ | Live SERP, competitor headings, PAA, related searches |
| 5 | `gaps` | | ✓ | What the top results all cover vs. what none of them answer |
| 6 | `strategy` | ✓ | ✓ | ArticleStrategy: unique angle, questions, entities, claims to prove, sources needed, link targets, media plan, CTA |
| 7 | `outline` | ✓ | ✓ | Intent-driven H2/H3 tree — no fixed template |
| 8 | `research` | | ✓ | Claim → source → verified/confidence ledger |
| 9 | `write` | ✓ | ✓ | Sections, batched across advances for long pieces |
| 10 | `originality` | | ✓ | Shingle similarity against the competitor text already fetched |
| 11 | `factcheck` | | ✓ | Per-claim keep / modify / remove, applied to the draft |
| 12 | `eeat` | | ✓ | Trust audit; strips any experience the business cannot evidence |
| 13 | `seo` | ✓ | ✓ | The existing checklist, extended with entity coverage and canonical |
| 14 | `links` | ✓ | ✓ | Internal links resolved against the inventory; external against verified sources |
| 15 | `media` | ✓ | ✓ | Featured + in-article images, alt, caption, placement; video only when it helps |
| 16 | `schema` | ✓ | ✓ | Article/BlogPosting + Breadcrumb + Organization/Person, context-chosen |
| 17 | `editor` | | ✓ | Human-quality pass, rewriting named sections only |
| 18 | `score` | ✓ | ✓ | Content Quality Score, weighted |
| 19 | `gate` | ✓ | ✓ | Publish gate — every blocker named |

Quick mode is 11 stages, Deep is 19. Mode is a per-run choice, not a plan tier
decision baked into code.

## Agents

`src/lib/agents/article/` — one file per agent, each a LangGraph node with a
typed input and a typed artifact out. They compose into `articleGraph.ts`, which
the stage runner steps through one node at a time rather than invoking end to
end.

1. **Business analyst** — Brand DNA (including the JSON blob in
   `brandDNA.writingStyle`, which currently reaches the writer unparsed) plus a
   crawl of the connected site. Anything the site does not state is `unknown`.
   No invented USP, credential or experience.
2. **Search intent** — classifies and, more usefully, writes down what a
   satisfied reader would have learned.
3. **SERP researcher** — information landscape, explicitly not source material.
4. **Gap analyst** — the difference between what everyone covers and what the
   reader still needs.
5. **Content strategist** — the angle. This is the agent that stops the output
   reading like every other page on the keyword.
6. **Writer** — receives business context, audience, intent, research, strategy,
   verified sources and real link targets. Never a bare keyword list.
7. **Fact checker** — claim, source, supported?, still current? → keep, modify
   or remove.
8. **SEO auditor** — intent match first, mechanics second. No word-count worship.
9. **E-E-A-T / trust** — the hard rule lives here: no "our technicians have
   repaired thousands of…" unless the business profile evidences it.
10. **Quality editor** — reads as a customer, rewrites only the sections that
    fail, never the whole article.

## Scores

**Content Quality Score** (not "Google score" — Google publishes no such
number): intent 15, helpfulness 20, original value 15, trust/fact accuracy 15,
business relevance 10, completeness 10, SEO fundamentals 5, readability 5,
internal linking 2.5, media/UX 2.5. Bands: 90+ publish, 80–89 minor fixes,
70–79 revise, <70 regenerate.

**Content Opportunity Score** on each suggested topic: search demand, business
relevance, intent match, competition, content gap, conversion potential,
existing authority. Computed only for the shortlist, because each score costs a
live SERP call.

## Phases

**Phase 1 — the page as it stands** (in progress)
Header trimmed; Brand DNA JSON parsed into real business facts and fed to the
writer; stock library search fixed and given real empty/not-configured states;
featured image chosen by hero position rather than array index; a Live page
preview that renders the article the way a published page would, with a mobile
width toggle; connect guide for a hand-coded site.

**Phase 2 — stage machine + agents**
`ArticleRun` model, the advance endpoint, the nineteen stages, the ten agents,
both scores, the publish gate. The single-POST path stays until the staged path
is green, then becomes a thin wrapper over it.

**Phase 3 — business intelligence panel**
"We analysed your business" with real counts: service pages, content
opportunities, unanswered questions, competitor gaps, internal-link
opportunities. Every number clickable through to what produced it.

**Phase 4 — Search Console**
OAuth with `webmasters.readonly`, tokens in `UserConnection`, per-article query
and position tracking, and the optimisation agent that notices an article is
taking impressions for a question it never answers. Separate build: new OAuth
scope, new cron, and a real risk of quota limits, so it ships on its own.

## Notes carried into implementation

- FAQ sections stay because readers use them; they are no longer sold as a
  rich-result feature, and FAQ schema is not advertised as an SEO win.
- Word count is a target the user sets, never a quality signal in the score.
- "100% original" is never claimed. The originality number is a measured
  similarity against pages actually fetched, and it is labelled as that.
- Schema changes need `npx prisma db push` — this repo has no migrations
  directory.
