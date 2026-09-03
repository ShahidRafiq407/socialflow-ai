# Article Writer — final implementation plan (v2)

A staged, multi-agent research-and-writing pipeline. It learns the business,
reads the site it will publish to, decides what kind of page should exist,
researches the live SERP, finds the gap, gathers evidence, blocks unevidenced
claims from ever reaching the writer, audits what comes back, and keeps
optimising the page after it is live.

## Core rule

Not "AI-written", not "undetectable", not "guaranteed to rank". Useful,
accurate, original, trustworthy, business-specific content that deserves to
rank. Google's spam policies apply regardless of how content was produced, so
the product's job is to make the content genuinely good, not to disguise it.

Never claimed anywhere in the UI: 100% plagiarism-free, guaranteed rankings, a
"Google score", FAQ schema as a ranking or rich-result win.

## Two constraints that shape the design

**Vercel kills a function at 300s.** Today one POST does everything inside a
235s budget. Twenty-three stages cannot fit. A run therefore becomes a sequence
of requests over persisted state — which is also the only way the UI can show
real progress instead of counting elapsed seconds.

**A claim with no source is a liability.** Evidence is a first-class stored
object with provenance, and the `evidence_gate` stage stands between research
and the writer. Blocked claims are never passed downstream.

## Architecture

```
ArticleRun
  ├─ mode            quick | deep
  ├─ currentStage
  ├─ status          idle | running | blocked | done | failed
  ├─ state           accumulated inputs
  ├─ artifacts       one entry per completed stage
  ├─ scores          quality, differentiation, trust, relevance
  ├─ errors          per-stage, named
  └─ timestamps      startedAt, stageStartedAt, finishedAt

POST /api/article-writer { step: "advance", runId }
  → runs exactly one stage, persists the artifact, returns the next stage
```

The client renders persisted stage and artifact state. No simulated progress
bar, no elapsed-time theatre.

## Pipeline

| # | Stage | Quick | Deep |
|---|-------|:-----:|:----:|
| 1 | `business` | ✓ | ✓ |
| 2 | `inventory` | | ✓ |
| 3 | `content_type` | | ✓ |
| 4 | `intent` | ✓ | ✓ |
| 5 | `serp` | ✓ | ✓ |
| 6 | `gaps` | | ✓ |
| 7 | `opportunity` | | ✓ |
| 8 | `strategy` | ✓ | ✓ |
| 9 | `outline` | ✓ | ✓ |
| 10 | `research` | | ✓ |
| 11 | `evidence_gate` | | ✓ |
| 12 | `write` | ✓ | ✓ |
| 13 | `originality` | | ✓ |
| 14 | `factcheck` | ✓ | ✓ |
| 15 | `eeat` | | ✓ |
| 16 | `seo` | ✓ | ✓ |
| 17 | `cannibalization` | | ✓ |
| 18 | `links` | ✓ | ✓ |
| 19 | `media` | | ✓ |
| 20 | `schema` | ✓ | ✓ |
| 21 | `editor` | | ✓ |
| 22 | `score` | ✓ | ✓ |
| 23 | `gate` | ✓ | ✓ |

Quick is 12 stages and must stay genuinely cheap — no crawl, no source
fetching, no third audit. Deep is all 23. Mode is chosen per run and stored on
the row; it is not derived from the subscription plan in code.

## Stage contracts

### 1 `business`
In: website URL, Brand DNA, connected accounts.
Out: `business_name, industry, description, services[], products[],
locations[], audiences[], customer_problems[], usp[], credentials[],
experience_signals[], writing_style{}, verified_business_facts[], unknowns[]`.

If the site does not prove it, the value is `unknown` and the field name goes
into `unknowns[]`. No probably, no assume, no infer-as-fact. A missing
credential stays missing — downstream stages read `unknowns[]` and refuse to
write around it.

### 2 `inventory`
Crawls the connected site: pages, posts, services, products, categories,
authors, URLs, headings, existing internal links, topics covered.
Out: existing content index, internal-link pool, topic coverage map, content
gaps, possible duplicates, cannibalisation warnings.

### 3 `content_type`
Decides what kind of page should exist before assuming an article should:
`article | guide | service_page | product_page | comparison | listicle |
case_study | faq | category | existing_page_update`.

"AC repair Dubai" is a service page. "Why is my AC not cooling?" is a guide.
"Best CRM for small business" is a comparison. When the right answer is
`existing_page_update`, the run says so instead of producing a second URL.

### 4 `intent`
Out: `primary_intent, secondary_intent, user_problem, user_goal,
satisfied_reader_answer, expected_content_type`.

`satisfied_reader_answer` is the field that matters: exactly what the reader
should know or be able to do after reading. Every later audit scores against it.

### 5 `serp`
Live results: ranking pages, title patterns, heading structures, common
questions, PAA, related searches, formats present (tables, images, video),
local intent signals, recurring entities and topics.

The SERP tells us **what exists**. It does not tell us **what is true** — it is
never recorded as a source of fact, only as a map of the landscape.

### 6 `gaps`
Four buckets: **common coverage** (what nearly everyone answers), **weak
coverage** (answered badly), **missing coverage** (answered by nobody), and
**opportunity** (what would genuinely make this page more useful). Typical
finds: no local context, no cost discussion, no decision framework, no worked
example, outdated figures, unclear explanation, missing safety note.

### 7 `opportunity`
Topic score out of 100:

| Signal | Weight |
|---|---:|
| Search demand | 20 |
| Business relevance | 20 |
| Content gap | 15 |
| Intent match | 15 |
| Conversion potential | 10 |
| Competition | 10 |
| Existing authority | 5 |
| Proof availability | 5 |

The live-SERP components are only computed for the shortlist, because each one
costs a real search call.

### 8 `strategy`
Out: `unique_angle, target_reader, main_problem, desired_outcome,
key_questions[], entities[], claims_to_prove[], sources_needed[],
internal_link_targets[], media_plan[], cta`.

The strategy has to answer one question: why does this page deserve to exist
when similar pages already do?

### 9 `outline`
H2/H3 built from intent → questions → information hierarchy. No fixed count of
headings, no keyword in every heading, no template. Word count stays a target
the user sets and never contributes to the quality score.

### 10 `research`
Only the claims `strategy.claims_to_prove` actually needs. Source priority:
official > government > universities > research papers > industry bodies >
manufacturers > professional organisations > reliable publications. SERP results
may be used to *discover* a source; the source itself is then fetched and
assessed on its own.

### Evidence store

A stored row, not a prompt variable:

```json
{
  "id": "",
  "claim": "",
  "source_url": "",
  "source_title": "",
  "source_type": "official | gov | academic | industry | manufacturer | press",
  "source_published_at": "",
  "accessed_at": "",
  "supporting_excerpt": "",
  "confidence": 0.96,
  "status": "verified"
}
```

`status`: `verified | partially_supported | unsupported | outdated |
contradicted | removed`. Full provenance for every factual sentence in the
article, queryable after the fact.

### 11 `evidence_gate`
Sits between research and the writer:

```
research → claim extraction → source verification → EVIDENCE GATE → writer
```

Per claim: does a source exist, is it reachable, does it actually support the
claim, is it current, is it trustworthy? All five yes → `verified`. Any no →
`blocked`. **The writer never receives a blocked claim.** This is the single
most important safeguard in the system.

### 12 `write`
The writer receives business profile + content type + audience + intent + SERP
insight + gaps + strategy + outline + verified evidence + real internal link
targets + brand voice. Never a keyword and a generic prompt.

Priority order: user value, accuracy, originality, clarity, business relevance,
then SEO mechanics.

It may not invent statistics, testimonials, credentials, experience, case
studies, quotes, customers or guarantees. "Our technicians have repaired 10,000
systems" cannot appear unless `verified_business_facts[]` contains it.

### 13 `originality`
Two separate measurements, never merged into one number:

**A. Text similarity** — shingle, phrase, sentence and semantic comparison
against the pages that were actually fetched. Reported as a percentage of
overlap with named URLs.

**B. Content differentiation** — out of 100: business-specific information,
unique analysis, unique examples, local context, an original framework,
competitor gaps addressed, first-party information, decision guidance.

Displayed as `Text similarity 4% · Content differentiation 91/100`. Never
"100% plagiarism-free", never "Google Originality Score" — we do not have
Google's index and cannot make either claim.

### 14 `factcheck`
Every claim in the draft: claim → evidence → supported? → current? →
`KEEP | MODIFY | REMOVE`. An unsupported factual claim is removed. Not softened,
not hedged with "many experts say" — removed.

### 15 `eeat`
Audits experience, expertise, authority, trust, author information, business
claims, credentials, first-party evidence and source quality.

If the site does not prove "our technicians have repaired 10,000 AC systems",
that sentence comes out. Absence of evidence never becomes fictional
experience — the fix is to remove the claim, not to reword it.

### 16 `seo`
Checks intent match, content type, title, H1, H2/H3 structure, topic coverage,
entities, natural terminology, meta title, meta description, slug, canonical,
internal links, external references, images, alt text, author, dates, schema.

Explicitly does **not** reward keyword stuffing, forced exact-match phrases,
sections that exist only for a keyword, keyword-rich city lists, or word-count
padding. Those lower the score rather than raise it.

### 17 `cannibalization`
Compares the new page against the real inventory. Same or near-same intent, and
an existing URL could satisfy it better → **recommend updating that page**
instead of publishing a second one. Also compares canonical and duplication
signals across the pair.

The output the user sees is a decision, not a warning they have to interpret:
either "publish new" with a reason, or "update this URL" with the URL.

### 18 `links`
Internal links come from the crawled inventory only — never invented URLs, never
`/blog/some-guess`. Each link is stored as
`{source_section, target_url, anchor_text, reason}` so the reason is auditable.

External links must resolve, be relevant and be useful to the reader. Nothing is
inserted to move rankings, and there is no automated link exchange, injection or
reciprocal behaviour anywhere in the product.

### 19 `media`
Decides whether this specific page benefits from a featured image, an original
diagram, a comparison table, a chart, a screenshot, a process graphic or a video
— and says no when it does not. "Every article needs three images" is not a
rule; a table often beats a stock photo.

### 20 `schema`
Chosen by context, not by template: Article, BlogPosting, BreadcrumbList,
Organization, Person, Product, LocalBusiness, VideoObject, Recipe, Event.

Consistency is checked three ways: schema data ↔ visible page content ↔ actual
business data. Reviews, ratings, author credentials and organisation details are
never fabricated to fill a required field — if the data does not exist, the
property is omitted or the type is not emitted.

### 21 `editor`
A reader-quality pass that asks eleven questions:

1. Would a real person trust this?
2. Did it answer the question that was asked?
3. Is the answer easy to find, or buried?
4. Is anything generic?
5. Is anything repetitive?
6. Is anything written only for search engines?
7. Does it add something the competing pages do not?
8. Is the business context natural or bolted on?
9. Is it too promotional?
10. Are important questions left unanswered?
11. Is every claim supported?

Only the sections that fail get rewritten. A passing section is left exactly as
it is — rewriting the whole draft loses good work and costs a model call.

### 22 `score` — Content Quality Score

| Dimension | Weight |
|---|---:|
| Search intent satisfaction | 15 |
| Helpfulness | 20 |
| Original / differentiated value | 15 |
| Trust & factual accuracy | 15 |
| Business relevance | 15 |
| Completeness | 7 |
| SEO fundamentals | 5 |
| Readability | 5 |
| Internal linking | 1.5 |
| Media & UX | 1.5 |
| **Total** | **100** |

| Band | Meaning |
|---|---|
| 90-100 | Excellent, publish |
| 80-89 | Strong, minor fixes |
| 70-79 | Needs revision |
| < 70 | Regenerate or research again |

Note where the weight sits: helpfulness alone outweighs every mechanical SEO
signal combined. Word count is not a dimension.

**This is called the Content Quality Score. It is never called a Google Score** —
Google does not publish a content score and we would be inventing an authority
we do not have.

Content differentiation is shown next to it as its own number, with the reasons
behind it on click:

```
Content quality        87/100
Content differentiation 91/100
  ✓ 4 business-specific insights
  ✓ 3 competitor gaps addressed
  ✓ 2 unique decision frameworks
  ✓ Local context added
  ✓ First-party information included
Trust                  94/100
Business relevance     88/100
```

### 23 `gate` — publish gate

Twenty checks, each of which can block: intent satisfied · content type correct ·
no unsupported claims · no invented experience · no fabricated statistics ·
evidence attached to every factual sentence · sources reachable and current ·
originality within threshold · differentiation above threshold · no
cannibalisation conflict · canonical coherent · title and meta within limits ·
slug clean · headings structured · internal links resolve · external links
resolve · images have alt text · schema consistent with the page · author and
dates present · quality score above the band.

**Every failure returns the specific blocker.** Not "SEO failed":

```
Blocked — 4 issues
  ✕ 3 unsupported claims (para 4, 7, 11)
  ✕ 1 conflicting canonical (/services/ac-repair)
  ✕ 2 missing internal links
  ✕ Content differentiation 61/100, below the 70 threshold
```

Each line links to the thing it is about, so the fix is one click away.

## Progress UI

**No fake progress.** No animated bar that finishes when a timer says so. Each
stage is `✓ done`, `● running` or `○ pending`, read from `ArticleRun.currentStage`
and the persisted artifacts. A finished stage shows what it actually produced:

```
✓ Business analysis     14 services, 3 locations, 6 verified facts, 4 unknowns
✓ Content inventory     38 pages, 12 posts, 61 internal link targets
✓ SERP research         42 results, 8 recurring questions, 5 gaps, 3 formats
● Evidence gate         17 claims checked, 3 blocked so far
○ Write
```

Every number on that screen is read from a stored artifact. If a stage produced
nothing, it says so — it does not show a zero dressed up as a result.

## Evidence dashboard

Inside the editor, not on a separate page:

```
37 factual claims
  ✓ 29 verified
  ⚠  5 moderate confidence
  ✕  3 removed
```

Clicking a claim shows the claim, the source, the status and the confidence.
This is the feature that makes the content defensible: for any sentence, the
user can see where it came from, or that it was cut and why.

## Business intelligence panel

"We analysed your business", with counts that came from the crawl:

```
14 service pages · 9 product pages · 23 existing articles
17 content opportunities · 31 unanswered questions
8 competitor gaps · 61 internal link opportunities · 2 cannibalisation risks
```

Every number is clickable and opens the underlying list. No metric on this panel
is estimated, rounded up for effect, or hardcoded. If the site could not be
crawled, the panel says the site could not be crawled.

## Agents

`src/lib/agents/article/`

```
businessAnalyst.ts      inventoryAgent.ts       contentTypeAgent.ts
intentAgent.ts          serpResearcher.ts       gapAnalyst.ts
opportunityAgent.ts     contentStrategist.ts    outlineAgent.ts
researchAgent.ts        evidenceGate.ts         writerAgent.ts
originalityAgent.ts     factChecker.ts          trustAgent.ts
seoAuditor.ts           cannibalizationAgent.ts linkAgent.ts
mediaAgent.ts           schemaAgent.ts          qualityEditor.ts
scoreAgent.ts           publishGate.ts
```

Composed by `articleGraph.ts`. One agent per stage, each with a typed input and
a typed artifact out; a stage that cannot do its job returns the reason, never a
plausible-looking blank.

## Model routing

**No agent names a model.** An agent asks for a capability and the router
resolves it:

| Capability | Used by |
|---|---|
| `fast` | inventory parsing, link resolution, mechanical checks |
| `reasoning` | intent, gaps, opportunity, strategy, evidence gate, score |
| `writing` | writer, editor |
| `research` | research, fact check |
| `vision` | media, screenshot assessment |

The router owns provider and model choice, so swapping a provider is a change in
one file and not twenty-three prompts.

## Data model

`ArticleRun` · `ArticleStage` · `BusinessProfile` · `ContentInventory` ·
`TopicOpportunity` · `SearchIntent` · `SERPResearch` · `ContentGap` ·
`ArticleStrategy` · `ArticleOutline` · `ResearchSource` · `EvidenceClaim` ·
`ArticleDraft` · `OriginalityReport` · `FactCheckReport` · `TrustReport` ·
`SEOReport` · `CannibalizationReport` · `InternalLinkReport` · `MediaPlan` ·
`SchemaArtifact` · `QualityScore` · `PublishResult` · `PerformanceData` ·
`OptimizationRun`

Every one of these is a row, not a field in a JSON blob, because every one of
them is something the user will want to open, sort or re-check months later.

`prisma/` has no migrations directory in this project, so new models land with
`npx prisma db push` — a schema change to run deliberately, not silently.

## Search Console phase

OAuth scope `webmasters.readonly`, credentials encrypted into `UserConnection`
the same way every other connector's are. Tracked per page: queries,
impressions, clicks, CTR, average position, date.

Then the loop that makes the product worth keeping:

```
article → Search Console → new query appears → article does not answer it
  → optimisation opportunity → research → evidence → update draft
  → fact check → publish update
```

Worked example. "Why Is My AC Not Cooling?" starts ranking for `ac not cooling
at night`, which the page never addresses. The system proposes a new section,
routes it through research → evidence → fact check → editor, and only then offers
the update. **It does not silently insert text into a live page.**

## What the system will not do

Mass-produce thin pages. Stuff keywords. Mechanically rewrite competitors. Fake
experience, reviews or statistics. Publish pages whose only purpose is to move a
ranking. Buy or manipulate links. Promise a ranking.

It also will not host unrelated third-party content on a domain to borrow that
domain's authority. Google's August 2026 update continues enforcement against
site-reputation abuse, and "the domain has authority" is not a reason to publish
content the site has no business publishing.

## What it will do

Understand the audience. Answer the real question. Add something that is not
already on the first page. Use reliable sources. Use first-party information the
business actually has. Keep business facts accurate. Apply technical SEO where it
belongs. Write so it can be understood. Keep every page meaningfully different
from every other page on the site.

## Two rules that are easy to get wrong

**FAQ.** An FAQ *section* is fine when readers really do ask those questions. FAQ
*schema* only when it genuinely applies. What is never said in the UI: "FAQ gives
you a rich result" or "FAQ improves rankings" — Google deprecated the FAQ rich
result on 7 May 2026.

**Canonical.** The system may recommend `rel="canonical"`, and describes it as a
hint. Google can and does choose a different canonical, so the UI never reports a
canonical tag as a decision that has been made.

## Where connections live

Connecting a website, WordPress site, Shopify store or custom coded site happens
in the **Plugins tab** — that is where connectors already live, and duplicating
the flow inside the Article Writer would mean two places to debug one credential.

The Article Writer shows only the connection **status** and a link across:

```
Publishing to  ⬤ smbrobotics.com — WordPress, verified 2h ago     Manage in Plugins →
```

Not connected reads `○ No destination connected — Connect one in Plugins →`. The
guide for connecting a hand-coded site (payload shape, HMAC-SHA256 verification
snippet, test ping) lives in the Plugins tab beside the connector it explains.

## Positioning

Not an "AI Article Generator". A **business-aware SEO content engine**: it
researches the business, works out what the audience needs, finds what the
competing pages miss, verifies the facts, produces content with an actual reason
to rank, and keeps improving it after it is published.

## Build order

**Phase 1 — what ships first, on the existing single-request generator.**
Brand DNA parsed once and shared everywhere (done: `src/lib/brand/profile.ts`),
the header blurb and the raw-JSON chip gone (done), the featured image taken from
the generator's real hero marker (done), the stock library searching from real
data with idle / empty / not-configured states (done: `src/actions/stock-media.ts`
labels a fallback instead of passing generic photos off as a match), the Article
Writer's connect UI reduced to status + a link to Plugins (done: the "Where it
publishes" card; `targetStatus.ts` gives both screens one vocabulary), a
live-page preview at desktop and mobile widths (done: `PagePreview.tsx`, a
sandboxed iframe at 1280px and 390px with its own stylesheet, so the dashboard's
theme cannot flatter the result and an Urdu or Arabic draft previews
right-to-left), and the hand-coded-site guide in Plugins (done:
`CustomSiteGuide.tsx`, quoting `customContract.ts` so it cannot describe a
request we do not send).

Phase 1 is complete. Phase 2 is where the plan above starts.

**Phase 2 — the staged pipeline.** `ArticleRun` and `ArticleStage`, the `advance`
endpoint, the twenty-three stages, the twenty-three agents behind
`articleGraph.ts`, the capability router, the evidence store and gate, both
scores, the publish gate with named blockers, and the progress UI reading real
artifacts.

**Phase 3 — business intelligence.** The crawl, the content inventory,
opportunity scoring, and the "we analysed your business" panel with clickable
real counts.

**Phase 4 — Search Console.** OAuth, performance tracking, and the optimisation
loop that proposes updates and routes them through the same verification the
first draft went through.

Phase 1 is useful on its own. Nothing in phase 2 requires the user to lose what
phase 1 gave them — the staged run replaces the single request behind the same
screen.











