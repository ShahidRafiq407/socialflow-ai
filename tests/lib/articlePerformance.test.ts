/**
 * THE NUMBERS ON THE PERFORMANCE CARD, AND WHAT RAISED A PROPOSAL
 *
 * WHY THIS EXISTS: every figure the performance panel draws is computed by
 * `performance.ts`, on both sides of the wire — the server totals rows with it and
 * the browser re-guards the answer with it. So a mistake in this file does not throw.
 * It puts a wrong number on a screen next to the word "impressions", and somebody
 * approves a change to a live page because of it.
 *
 * Four things are pinned here rather than trusted:
 *
 *   1. `keys` is positional. `dimensions: ["query", "date"]` means `keys[0]` is the
 *      query and `keys[1]` the day. Swapping them stores dates as queries and never
 *      errors, so the order is asserted.
 *   2. Position is impression-weighted, the way Search Console averages it. A flat
 *      mean invents problems that are not there, and the comment in `performance.ts`
 *      names the exact case — 400 impressions at 8 plus 2 at 60 is a position-8 query.
 *   3. A candidate is a measurement, not a verdict, and the three kinds mean three
 *      different things. A query in a heading and ranking is not a candidate at all.
 *   4. `verified` cannot be typed. `optimizationStatus` coerces anything that is not
 *      one of the five states, on both sides, so a row from an older build cannot
 *      surface a state the panel has no meaning for.
 *
 * The Search Console helpers are here too, because "which property covers this page"
 * and "which spelling of this URL does `equals` accept" are the two places this
 * connector silently returns nothing instead of failing.
 */
import { describe, it, expect } from "vitest";

import {
  OPTIMIZATION_STATUSES,
  contentTokens,
  optimizationStatus,
  rankOpportunities,
  readOpportunities,
  readOptimizationProposal,
  readOptimizations,
  readPerformanceSummary,
  readPublications,
  summarizePerformance,
  toPerformanceRows,
  type PerformanceRow,
} from "@/lib/article/performance";
import {
  dayRange,
  isoDay,
  normalizePageUrl,
  pageMatchCandidates,
  resolveProperty,
  type SearchConsoleProperty,
} from "@/lib/connectors/searchConsole";

const PAGE = "https://example.com/blog/epoxy-floor-cost";

/** One stored row, with only the fields a test cares about spelled out. */
function row(over: Partial<PerformanceRow> = {}): PerformanceRow {
  return {
    page: PAGE,
    query: "epoxy floor cost",
    date: "2026-08-01",
    impressions: 100,
    clicks: 5,
    ctr: 0.05,
    position: 8,
    ...over,
  };
}

describe("toPerformanceRows", () => {
  it("reads keys positionally — query first, day second", () => {
    const [out] = toPerformanceRows(PAGE, [
      { keys: ["Epoxy Floor Cost", "2026-08-01"], clicks: 3, impressions: 90, ctr: 0.033, position: 7.4 },
    ]);
    expect(out.query).toBe("epoxy floor cost");
    expect(out.date).toBe("2026-08-01");
    expect(out.page).toBe(PAGE);
    expect(out.impressions).toBe(90);
  });

  it("drops a row whose day is not a day, rather than storing a query as a date", () => {
    expect(
      toPerformanceRows(PAGE, [
        { keys: ["2026-08-01", "epoxy floor cost"], clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
        { keys: ["epoxy floor cost", "August 2026"], clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
        { keys: ["", "2026-08-01"], clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
      ])
    ).toEqual([]);
  });

  it("clamps what Google could not have meant", () => {
    const [out] = toPerformanceRows(PAGE, [
      {
        keys: ["q word", "2026-08-02"],
        clicks: -4,
        impressions: 12.6,
        ctr: 4,
        position: -2,
      },
    ]);
    expect(out.clicks).toBe(0);
    expect(out.impressions).toBe(13);
    expect(out.ctr).toBe(1);
    expect(out.position).toBe(0);
  });

  it("survives a response with no rows and a row with no keys", () => {
    expect(toPerformanceRows(PAGE, [])).toEqual([]);
    expect(
      toPerformanceRows(PAGE, [
        { keys: [] as string[], clicks: 0, impressions: 0, ctr: 0, position: 0 },
      ])
    ).toEqual([]);
  });
});

describe("summarizePerformance", () => {
  it("weights position by impressions rather than averaging it flat", () => {
    // The case named in performance.ts: a flat mean would call this 34 and invent
    // a problem. 400 impressions at 8 and 2 at 60 is a position-8 query.
    const summary = summarizePerformance([
      row({ impressions: 400, position: 8, clicks: 20, date: "2026-08-01" }),
      row({ impressions: 2, position: 60, clicks: 0, date: "2026-08-02" }),
    ]);
    expect(summary.position).toBeCloseTo((400 * 8 + 2 * 60) / 402, 5);
    expect(summary.position).toBeLessThan(9);
    expect(summary.queries[0].position).toBeCloseTo(summary.position, 5);
  });

  it("counts days a query appeared on, not rows", () => {
    const summary = summarizePerformance([
      row({ date: "2026-08-01" }),
      row({ date: "2026-08-01", query: "epoxy floor cost per square metre" }),
      row({ date: "2026-08-03" }),
    ]);
    expect(summary.days).toBe(2);
    expect(summary.from).toBe("2026-08-01");
    expect(summary.to).toBe("2026-08-03");
    const main = summary.queries.find((entry) => entry.query === "epoxy floor cost");
    expect(main?.days).toBe(2);
    expect(main?.firstSeen).toBe("2026-08-01");
    expect(main?.lastSeen).toBe("2026-08-03");
  });

  it("computes CTR from the totals rather than averaging the reported ones", () => {
    const summary = summarizePerformance([
      row({ impressions: 100, clicks: 1, ctr: 0.01 }),
      row({ impressions: 900, clicks: 99, ctr: 0.11, date: "2026-08-02" }),
    ]);
    expect(summary.clicks).toBe(100);
    expect(summary.impressions).toBe(1000);
    expect(summary.ctr).toBeCloseTo(0.1, 6);
  });

  it("orders queries by impressions, highest first", () => {
    const summary = summarizePerformance([
      row({ query: "small", impressions: 10 }),
      row({ query: "large", impressions: 900 }),
      row({ query: "middle", impressions: 100 }),
    ]);
    expect(summary.queries.map((entry) => entry.query)).toEqual(["large", "middle", "small"]);
  });

  it("returns a page and zeros for no rows, so nothing downstream divides by nothing", () => {
    const summary = summarizePerformance([], PAGE);
    expect(summary).toEqual({
      page: PAGE,
      from: "",
      to: "",
      days: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      position: 0,
      queries: [],
    });
  });

  it("takes the page off the rows when the caller did not name one", () => {
    expect(summarizePerformance([row()]).page).toBe(PAGE);
  });
});

describe("contentTokens", () => {
  it("keeps question words, drops punctuation and short filler", () => {
    expect(contentTokens("How much does an epoxy floor cost, per m²?")).toEqual([
      "how",
      "much",
      "epoxy",
      "floor",
      "cost",
      "per",
    ]);
  });

  it("is empty for a string with nothing to match on", () => {
    expect(contentTokens("the and for — !!")).toEqual([]);
    expect(contentTokens("")).toEqual([]);
  });
});

describe("rankOpportunities", () => {
  const summary = (queries: Array<{ query: string; impressions: number; position: number }>) =>
    summarizePerformance(
      queries.map((entry) =>
        row({
          query: entry.query,
          impressions: entry.impressions,
          position: entry.position,
          clicks: 0,
        })
      )
    );

  it("calls a query absent when a word of it is nowhere on the page", () => {
    const [found] = rankOpportunities(
      summary([{ query: "epoxy floor curing time", impressions: 200, position: 14 }]),
      { title: "Epoxy floor cost", headings: ["What it costs"], body: "Epoxy floor cost per metre." }
    );
    expect(found.kind).toBe("absent");
    expect(found.missingTerms).toEqual(["curing", "time"]);
    expect(found.reason).toContain("appears nowhere on the page");
    expect(found.reason).toContain("200 impressions");
  });

  it("calls it unheaded when the words are in the text but not in a heading", () => {
    const [found] = rankOpportunities(
      summary([{ query: "epoxy curing", impressions: 200, position: 14 }]),
      {
        title: "Epoxy floor cost",
        headings: ["What it costs"],
        body: "Epoxy floors need curing before use.",
      }
    );
    expect(found.kind).toBe("unheaded");
    expect(found.missingTerms).toEqual(["curing"]);
    expect(found.reason).toContain("not in any heading");
  });

  it("calls it underperforming when everything is in a heading and it still ranks badly", () => {
    const [found] = rankOpportunities(
      summary([{ query: "epoxy curing", impressions: 200, position: 22 }]),
      { title: "Epoxy curing", headings: ["Epoxy curing"], body: "Epoxy curing takes a week." }
    );
    expect(found.kind).toBe("underperforming");
    expect(found.missingTerms).toEqual([]);
    expect(found.reason).toContain("covered, and still not chosen");
  });

  it("is not a candidate when the page has it in a heading and ranks for it", () => {
    expect(
      rankOpportunities(summary([{ query: "epoxy curing", impressions: 200, position: 3 }]), {
        title: "Epoxy curing",
        headings: ["Epoxy curing"],
        body: "Epoxy curing takes a week.",
      })
    ).toEqual([]);
  });

  it("treats a bare plural as the same subject, so it does not propose a section twice", () => {
    expect(
      rankOpportunities(summary([{ query: "epoxy floors", impressions: 200, position: 3 }]), {
        title: "Epoxy floor",
        headings: ["Epoxy floor"],
        body: "An epoxy floor lasts years.",
      })
    ).toEqual([]);
  });

  it("counts a word in a heading as being on the page even when the body omits it", () => {
    const [found] = rankOpportunities(
      summary([{ query: "epoxy curing", impressions: 200, position: 20 }]),
      { title: "", headings: ["Epoxy curing"], body: "" }
    );
    expect(found.kind).toBe("underperforming");
  });

  it("ignores a query one person searched once", () => {
    expect(
      rankOpportunities(summary([{ query: "epoxy curing time", impressions: 3, position: 40 }]), {
        title: "Epoxy floor cost",
        headings: [],
        body: "Epoxy floor cost.",
      })
    ).toEqual([]);
  });

  it("honours a loosened threshold and the limit, ordering by weight", () => {
    const page = { title: "Epoxy", headings: [], body: "Epoxy." };
    const found = rankOpportunities(
      summary([
        { query: "epoxy curing time", impressions: 20, position: 30 },
        { query: "epoxy resin price", impressions: 300, position: 30 },
        { query: "epoxy garage kit", impressions: 90, position: 30 },
      ]),
      page,
      { minImpressions: 10, limit: 2 }
    );
    expect(found).toHaveLength(2);
    expect(found[0].query).toBe("epoxy resin price");
    expect(found[0].weight).toBeGreaterThan(found[1].weight);
  });

  it("skips a query with nothing matchable in it at all", () => {
    expect(
      rankOpportunities(summary([{ query: "the and for", impressions: 500, position: 40 }]), {
        title: "Epoxy",
        headings: [],
        body: "Epoxy.",
      })
    ).toEqual([]);
  });
});

describe("readOpportunities", () => {
  it("coerces a stored trigger row and keeps the numbers that raised it", () => {
    const [out] = readOpportunities([
      {
        query: "Epoxy Curing Time",
        impressions: 12.4,
        clicks: -2,
        ctr: 3,
        position: -1,
        days: 2.6,
        kind: "unheaded",
        missingTerms: ["curing", "", "time"],
        reason: " it was measured ",
        weight: 7.5,
      },
    ]);
    expect(out.query).toBe("epoxy curing time");
    expect(out.impressions).toBe(12);
    expect(out.clicks).toBe(0);
    expect(out.ctr).toBe(1);
    expect(out.position).toBe(0);
    expect(out.days).toBe(3);
    expect(out.kind).toBe("unheaded");
    expect(out.missingTerms).toEqual(["curing", "time"]);
    expect(out.reason).toBe("it was measured");
  });

  it("falls back to absent for a kind this build does not know, and drops the queryless", () => {
    expect(readOpportunities([{ query: "q word", kind: "invented" }])[0].kind).toBe("absent");
    expect(readOpportunities([{ kind: "absent" }])).toEqual([]);
    expect(readOpportunities("not an array")).toEqual([]);
    expect(readOpportunities(null)).toEqual([]);
  });
});

describe("readOptimizationProposal", () => {
  it("refuses a proposal that cannot be summarised", () => {
    expect(readOptimizationProposal({ sections: [{ heading: "h", covers: ["c"] }] })).toBeNull();
    expect(readOptimizationProposal({ summary: "   " })).toBeNull();
    expect(readOptimizationProposal([])).toBeNull();
    expect(readOptimizationProposal(null)).toBeNull();
  });

  it("drops a section with no heading or nothing to cover, rather than repairing it", () => {
    const proposal = readOptimizationProposal({
      summary: "Add curing time.",
      sections: [
        { heading: "How long it takes to cure", covers: ["days at 20°C"], queries: ["Epoxy Curing"] },
        { heading: "", covers: ["something"] },
        { heading: "No points", covers: [] },
      ],
    });
    expect(proposal?.sections).toHaveLength(1);
    expect(proposal?.sections[0].queries).toEqual(["epoxy curing"]);
    expect(proposal?.sections[0].placeAfter).toBe("");
    expect(proposal?.sections[0].needsResearch).toEqual([]);
  });

  it("keeps an edit only when it names both a target and a change", () => {
    const proposal = readOptimizationProposal({
      summary: "Fix the cost line.",
      edits: [
        { target: "What it costs", change: "Say what the figure excludes.", queries: ["COST"] },
        { target: "What it costs", change: "" },
        { target: "", change: "Say something." },
      ],
    });
    expect(proposal?.edits).toHaveLength(1);
    expect(proposal?.edits[0].queries).toEqual(["cost"]);
  });

  it("keeps answered and declined rows, which are results rather than changes", () => {
    const proposal = readOptimizationProposal({
      summary: "Mostly covered already.",
      answered: [{ query: "Epoxy Cost", where: "the pricing table" }, { query: "", where: "nowhere" }],
      declined: [
        { query: "Epoxy Vs Tile", reason: "A comparison belongs on its own page." },
        { query: "no reason given", reason: "" },
      ],
    });
    expect(proposal?.answered).toEqual([{ query: "epoxy cost", where: "the pricing table" }]);
    expect(proposal?.declined).toEqual([
      { query: "epoxy vs tile", reason: "A comparison belongs on its own page." },
    ]);
  });
});

describe("optimizationStatus", () => {
  it("passes the five states through", () => {
    for (const status of OPTIMIZATION_STATUSES) {
      expect(optimizationStatus(status)).toBe(status);
    }
  });

  it("refuses to invent a state, on either side of the wire", () => {
    expect(optimizationStatus("verified ")).toBe("verified");
    expect(optimizationStatus("approved")).toBe("proposed");
    expect(optimizationStatus("")).toBe("proposed");
    expect(optimizationStatus(undefined)).toBe("proposed");
    expect(optimizationStatus(7)).toBe("proposed");
  });
});

describe("readPublications", () => {
  it("keeps a row with an id and a URL, and clamps the open count", () => {
    const [out] = readPublications([
      {
        id: " pub_1 ",
        url: PAGE,
        title: "What an epoxy floor costs",
        keyword: "epoxy floor cost",
        status: "publish",
        providerKey: "wordpress",
        runId: "run_1",
        publishedAt: "2026-08-01T00:00:00.000Z",
        lastDataDay: "2026-08-30",
        openProposals: -3,
      },
    ]);
    expect(out.id).toBe("pub_1");
    expect(out.openProposals).toBe(0);
    expect(out.lastDataDay).toBe("2026-08-30");
  });

  it("drops a row with no id or no URL, and a day that is not a day", () => {
    expect(readPublications([{ url: PAGE }, { id: "pub_2" }])).toEqual([]);
    expect(readPublications([{ id: "pub_3", url: PAGE, lastDataDay: "last Tuesday" }])[0].lastDataDay).toBe("");
    expect(readPublications(undefined)).toEqual([]);
  });
});

describe("readOptimizations", () => {
  it("coerces the status and reads the triggers and proposal back through their own guards", () => {
    const [out] = readOptimizations([
      {
        id: "opt_1",
        publicationId: "pub_1",
        page: PAGE,
        title: "What an epoxy floor costs",
        status: "approved",
        triggers: [{ query: "Epoxy Curing", kind: "unheaded", impressions: 30 }],
        proposal: { summary: "Add curing time.", sections: [{ heading: "h", covers: ["c"] }] },
        verifyRunId: "run_2",
        note: "raised by a scan",
        raisedAt: "2026-09-01T00:00:00.000Z",
        verifiedAt: "",
        appliedAt: "",
      },
    ]);
    expect(out.status).toBe("proposed");
    expect(out.triggers[0].query).toBe("epoxy curing");
    expect(out.proposal?.sections).toHaveLength(1);
    expect(out.verifyRunId).toBe("run_2");
  });

  it("keeps a row whose proposal is unreadable, so the panel can say so", () => {
    const [out] = readOptimizations([{ id: "opt_2", proposal: { sections: [] } }]);
    expect(out.proposal).toBeNull();
    expect(out.triggers).toEqual([]);
    expect(readOptimizations([{ publicationId: "pub_1" }])).toEqual([]);
  });
});

describe("readPerformanceSummary", () => {
  it("makes a summary off the wire safe to format without recomputing it", () => {
    const out = readPerformanceSummary({
      page: PAGE,
      from: "2026-08-01",
      to: "2026-08-28",
      days: 28,
      impressions: 1000,
      clicks: 100,
      ctr: 0.1,
      position: 8.42,
      queries: [
        { query: "Epoxy Floor Cost", impressions: 900, clicks: 99, ctr: 0.11, position: 8, days: 20, firstSeen: "2026-08-01", lastSeen: "2026-08-28" },
        { query: "", impressions: 1 },
      ],
    });
    expect(out.page).toBe(PAGE);
    expect(out.days).toBe(28);
    expect(out.queries).toHaveLength(1);
    expect(out.queries[0].query).toBe("epoxy floor cost");
    // The panel calls .toFixed on these, so they have to be numbers whatever arrived.
    expect(typeof out.position).toBe("number");
    expect(out.position).toBeCloseTo(8.42, 5);
  });

  it("returns an empty summary for anything that is not a summary", () => {
    expect(readPerformanceSummary(null)).toEqual({
      page: "",
      from: "",
      to: "",
      days: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      position: 0,
      queries: [],
    });
    expect(readPerformanceSummary([{ page: PAGE }]).page).toBe("");
  });

  it("clamps a rate and a count that could not have been reported", () => {
    const out = readPerformanceSummary({
      page: PAGE,
      ctr: 9,
      position: -4,
      impressions: "many",
      queries: [{ query: "q word", ctr: -1, position: null, days: 2.4 }],
    });
    expect(out.ctr).toBe(1);
    expect(out.position).toBe(0);
    expect(out.impressions).toBe(0);
    expect(out.queries[0].ctr).toBe(0);
    expect(out.queries[0].position).toBe(0);
    expect(out.queries[0].days).toBe(2);
  });
});

describe("normalizePageUrl", () => {
  it("lowercases the host and keeps the path exactly, because equals is case-sensitive", () => {
    expect(normalizePageUrl("HTTPS://Example.COM/Blog/Post?utm=x#top")).toBe(
      "https://example.com/Blog/Post"
    );
  });

  it("refuses anything that is not an http(s) URL", () => {
    expect(normalizePageUrl("mailto:someone@example.com")).toBe("");
    expect(normalizePageUrl("example.com/blog")).toBe("");
    expect(normalizePageUrl("")).toBe("");
    expect(normalizePageUrl(null)).toBe("");
  });
});

describe("pageMatchCandidates", () => {
  it("offers both trailing-slash forms, the given one first", () => {
    expect(pageMatchCandidates("https://example.com/guide")).toEqual([
      "https://example.com/guide",
      "https://example.com/guide/",
    ]);
    expect(pageMatchCandidates("https://example.com/guide/")).toEqual([
      "https://example.com/guide/",
      "https://example.com/guide",
    ]);
  });

  it("offers the bare origin both ways, and nothing for a URL it cannot read", () => {
    expect(pageMatchCandidates("https://example.com")).toEqual([
      "https://example.com/",
      "https://example.com",
    ]);
    expect(pageMatchCandidates("not a url")).toEqual([]);
  });
});

describe("resolveProperty", () => {
  const prop = (siteUrl: string, readable = true): SearchConsoleProperty => ({
    siteUrl,
    permissionLevel: readable ? "siteOwner" : "siteUnverifiedUser",
    readable,
  });

  it("prefers the longest URL prefix that actually contains the page", () => {
    const found = resolveProperty(PAGE, [
      prop("https://example.com/"),
      prop("https://example.com/blog/"),
      prop("sc-domain:example.com"),
    ]);
    expect(found?.siteUrl).toBe("https://example.com/blog/");
  });

  it("falls back to the domain property, including for a subdomain", () => {
    expect(resolveProperty(PAGE, [prop("sc-domain:example.com")])?.siteUrl).toBe(
      "sc-domain:example.com"
    );
    expect(
      resolveProperty("https://shop.example.com/x", [prop("sc-domain:example.com")])?.siteUrl
    ).toBe("sc-domain:example.com");
  });

  it("skips a property the account cannot read, and one that does not cover the page", () => {
    expect(resolveProperty(PAGE, [prop("https://example.com/blog/", false)])).toBeNull();
    expect(resolveProperty(PAGE, [prop("https://example.com/shop/")])).toBeNull();
    expect(resolveProperty(PAGE, [prop("sc-domain:notexample.com")])).toBeNull();
    expect(resolveProperty(PAGE, [])).toBeNull();
  });

  it("does not treat a prefix that only shares a path segment as covering the page", () => {
    // "/blog" must not match "/blogging-tips" — the boundary is a slash, not a substring.
    expect(
      resolveProperty("https://example.com/blogging-tips/x", [prop("https://example.com/blog")])
    ).toBeNull();
  });

  it("returns null for a page it cannot parse", () => {
    expect(resolveProperty("not a url", [prop("sc-domain:example.com")])).toBeNull();
  });
});

/** Whole days between two `YYYY-MM-DD` strings. UTC on both sides, like `isoDay`. */
function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000;
}

describe("dayRange", () => {
  it("ends today and spans the number of days asked for, inclusive", () => {
    // Both bounds of the clock read either side of the call, because a run that
    // straddles UTC midnight must not be a failing test.
    const before = isoDay(new Date());
    const window = dayRange(28);
    const after = isoDay(new Date());
    expect([before, after]).toContain(window.endDate);
    expect(daysBetween(window.startDate, window.endDate)).toBe(27);
  });

  it("clamps a nonsense span rather than asking Google for one", () => {
    expect(daysBetween(dayRange(0).startDate, dayRange(0).endDate)).toBe(27);
    expect(dayRange(1).startDate).toBe(dayRange(1).endDate);
    expect(daysBetween(dayRange(10_000).startDate, dayRange(10_000).endDate)).toBe(479);
    expect(daysBetween(dayRange(-5).startDate, dayRange(-5).endDate)).toBe(0);
  });
});
