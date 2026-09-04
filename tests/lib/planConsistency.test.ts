/**
 * TRACE SUITE — the plan table cannot contradict itself
 *
 * WHY THIS EXISTS: `plans.ts` and `actions.ts` are two tables that have to agree,
 * and nothing checked that they did. Every defect this suite locks was real and
 * shipped:
 *
 *   Free advertised "AI best-time scheduling, 60 posts a month" on a plan granted
 *   zero credits, and `schedule.bestTime` costs one. `checkAction`'s wallet branch
 *   refuses at `available < cost`, so the plan's headline feature was refused on
 *   the first press.
 *
 *   Free had a cap for `brandDna.analyze` but not the feature, so onboarding's
 *   "Generate Magic Profile" — the first AI call a new account makes — hit a
 *   feature refusal instead.
 *
 *   The trial's card promised more credits of work than its grant could buy.
 *
 *   `chat.message` was a flat 25 credits over up to twelve model calls, so an
 *   Agency turn that used its whole loop allowance cost ~$0.73 and charged $0.25.
 *   At two months free that put Agency's yearly floor at -$1.99: the more a
 *   customer used the product, the more the plan lost.
 *
 * None of those are type errors and none would fail a build. They are arithmetic
 * between two tables, which is what this suite checks.
 *
 * The margin floors below are the load-bearing ones. `MIN_FLOOR_USD` is the number
 * the business launched on; if a re-price drops a plan under it, that is a decision
 * to take deliberately by changing this constant, not by discovering it on an
 * invoice.
 */
import { describe, it, expect } from "vitest";

import {
  ACTION_CATALOG,
  ACTION_GROUPS,
  ACTION_KEYS,
  actionCredits,
  type ActionKey,
} from "@/lib/billing/actions";
import {
  CREDIT_USD,
  FEATURE_KEYS,
  PLAN_CATALOG,
  PLAN_ENTITLEMENTS,
  PLAN_TIERS,
  UNLIMITED,
  featureCap,
  getEntitlements,
  isUnlimited,
  lowestPlanWith,
  planPrice,
  planRank,
  type FeatureKey,
  type PlanTier,
} from "@/lib/billing/plans";

/** The plans a customer pays for every period. TRIAL is one-time, FREE is not sold. */
const PAID_TIERS: PlanTier[] = ["GO", "PRO", "AGENCY"];

/**
 * The thinnest cover in the action catalogue, measured from the `basis` lines:
 * `ai.post.single` charges 25 credits ($0.25) against ~$0.17 of measured spend.
 * A plan's worst case is its whole grant spent here and nowhere else.
 */
const THINNEST_COVER = 25 / 0.17;

/** The launch margin. Below this a plan is not thin, it is wrong. */
const MIN_FLOOR_USD = 5;

/** What a grant can cost us if it is spent entirely on the worst-covered action. */
function worstCaseCostUsd(credits: number): number {
  return (credits * CREDIT_USD) / THINNEST_COVER;
}

describe("the action catalogue is internally consistent", () => {
  it("has one catalogue row per key, and no orphan rows", () => {
    expect(Object.keys(ACTION_CATALOG).sort()).toEqual([...ACTION_KEYS].sort());
    for (const key of ACTION_KEYS) {
      expect(ACTION_CATALOG[key].key, `${key} names itself`).toBe(key);
    }
  });

  it("prices every action above zero", () => {
    // A zero-credit action is a model call outside the ledger. There is no such
    // thing as a free provider request, so there is no such thing as a free action.
    for (const key of ACTION_KEYS) {
      expect(actionCredits(key), `${key} costs something`).toBeGreaterThan(0);
    }
  });

  it("points every action at features that exist", () => {
    const known = new Set<string>(FEATURE_KEYS);
    for (const key of ACTION_KEYS) {
      const spec = ACTION_CATALOG[key];
      expect(known.has(spec.feature), `${key}.feature = ${spec.feature}`).toBe(true);
      if (spec.countsAgainst) {
        expect(known.has(spec.countsAgainst), `${key}.countsAgainst = ${spec.countsAgainst}`).toBe(true);
      }
    }
  });

  it("records a derivation on every price", () => {
    // The `basis` line is the reason a price can be argued with. A row without one
    // is a number nobody can safely change.
    for (const key of ACTION_KEYS) {
      const spec = ACTION_CATALOG[key];
      expect(spec.basis.length, `${key} has a basis`).toBeGreaterThan(40);
      expect(spec.description.length, `${key} has a description`).toBeGreaterThan(20);
      expect(spec.label.length, `${key} has a label`).toBeGreaterThan(2);
    }
  });

  it("shows every action on the billing page exactly once", () => {
    // The price list a customer reads is this table, so an action missing from the
    // groups is a charge that appears on a bill and nowhere else.
    const listed = ACTION_GROUPS.flatMap((g) => g.actions);
    expect([...listed].sort()).toEqual([...ACTION_KEYS].sort());
  });

  it("holds credits for anything slow enough or dear enough to race", () => {
    // Reserved, not debited: anything a second tab can start again while the first
    // is still running, or anything expensive enough that going negative matters.
    for (const key of ACTION_KEYS) {
      const spec = ACTION_CATALOG[key];
      if (spec.credits >= 100) {
        expect(spec.reserve, `${key} costs ${spec.credits} credits and must be held`).toBe(true);
      }
      if (spec.reserve) {
        expect(spec.reserveMs, `${key} is held, so it needs a TTL`).toBeGreaterThan(0);
      }
    }
  });
});

describe("every plan can afford what it advertises", () => {
  it("grants credits to every plan that has a priced feature", () => {
    // Free is the case that broke: a plan whose features include priced actions but
    // whose balance is zero refuses its own headline on the first press.
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      const reachable = ACTION_KEYS.filter((key) => ent.features.includes(ACTION_CATALOG[key].feature));
      if (reachable.length === 0) continue;
      const cheapest = Math.min(...reachable.map((key) => actionCredits(key)));
      expect(ent.monthlyCredits, `${tier} can afford its cheapest action`).toBeGreaterThanOrEqual(cheapest);
    }
  });

  it("gives every capped feature to the plan that caps it", () => {
    // A cap without the feature is a promise the gate refuses one step earlier —
    // `featureCap` returns 0 for a feature the plan does not have, so the cap is
    // not even the thing doing the refusing.
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      for (const feature of Object.keys(ent.caps) as FeatureKey[]) {
        expect(ent.features.includes(feature), `${tier} caps ${feature} without granting it`).toBe(true);
      }
    }
  });

  it("keeps the sum of every capped ceiling inside the grant", () => {
    // The caps are the countable promises on the plan cards. If they add up to more
    // than the balance can buy, the last one refuses for a reason the card never
    // mentioned — the customer is told "12 videos" and stopped at nine.
    //
    // Priced at the DEAREST action a plan can reach through each counter, because
    // that is the promise: `article.quick: 4` on a plan that can write a 150-credit
    // article means 600 credits, whatever cheaper buttons share the counter.
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      let ceiling = 0;
      for (const [feature, cap] of Object.entries(ent.caps) as [FeatureKey, number][]) {
        if (isUnlimited(cap)) continue;
        const drawing = ACTION_KEYS.filter(
          (key) =>
            (ACTION_CATALOG[key].countsAgainst ?? ACTION_CATALOG[key].feature) === feature &&
            // Only what this plan can actually start. `media.imagePro` draws on the
            // `media.image` counter but is refused a tier earlier.
            ent.features.includes(ACTION_CATALOG[key].feature)
        );
        if (drawing.length === 0) continue;
        ceiling += cap * Math.max(...drawing.map((key) => actionCredits(key)));
      }
      expect(ceiling, `${tier}'s capped promises fit in ${ent.monthlyCredits} credits`).toBeLessThanOrEqual(
        ent.monthlyCredits
      );
    }
  });

  it("never lets a cheap helper spend a promise it does not name", () => {
    // The defect: `article.serp` (2 credits) and `article.assist` (4) both gate on
    // the article tab, and both used to count against `article.quick`. On a trial
    // capped at one article, pressing "suggest titles" once left nothing to write
    // the article with.
    //
    // The rule is about CAPPED counters only. `aistudio.generate` spans 3 to 60
    // credits and that is fine — it is uncapped on every plan, so there is no
    // promise to spend and the credit balance does the limiting. The moment a
    // counter is capped, the cap becomes a sentence on a plan card, and it can only
    // be one sentence: a cap over prices an order of magnitude apart describes
    // neither of them.
    const capped = new Set<string>();
    for (const tier of PLAN_TIERS) {
      for (const [feature, cap] of Object.entries(getEntitlements(tier).caps)) {
        if (!isUnlimited(cap)) capped.add(feature);
      }
    }

    const counters = new Map<string, ActionKey[]>();
    for (const key of ACTION_KEYS) {
      const spec = ACTION_CATALOG[key];
      const counter = spec.countsAgainst ?? spec.feature;
      if (!capped.has(counter)) continue;
      counters.set(counter, [...(counters.get(counter) ?? []), key]);
    }

    expect(counters.size, "some counter is capped somewhere").toBeGreaterThan(0);
    for (const [counter, keys] of counters) {
      if (keys.length < 2) continue;
      const prices = keys.map((key) => actionCredits(key));
      const spread = Math.max(...prices) / Math.min(...prices);
      // Four-to-one is the line. `media.image`/`media.imagePro` at 2:1 share a
      // counter on purpose — both are "an AI image" to a buyer. 75:1 was the bug.
      expect(spread, `capped counter ${counter} is shared by ${keys.join(", ")}`).toBeLessThanOrEqual(4);
    }
  });

  it("grants the article helpers wherever it grants articles", () => {
    // `article.assist` is a counter, not a tab. If a plan has quick articles without
    // it, `featureCap` returns 0 for the counter and every helper button refuses.
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      if (!ent.features.includes("article.quick")) continue;
      expect(ent.features.includes("article.assist"), `${tier} has articles but no helpers`).toBe(true);
      expect(isUnlimited(featureCap(tier, "article.assist")), `${tier} caps the helpers`).toBe(true);
    }
  });

  it("never advertises a credit figure the plan does not grant", () => {
    // The cards write their own numbers as prose. This catches the copy drifting
    // away from the table underneath it, which is how the trial came to promise 750
    // credits' worth of work on a 500-credit balance.
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      const claims = PLAN_CATALOG[tier].features
        .flatMap((line) => line.match(/([\d,]+)\s+credits/gi) ?? [])
        .map((m) => Number(m.replace(/[^\d]/g, "")));
      for (const claimed of claims) {
        expect(claimed, `${tier}'s card claims ${claimed} credits`).toBe(ent.monthlyCredits);
      }
    }
  });
});

describe("no plan can be used at a loss", () => {
  it("clears the launch margin on every paid monthly price", () => {
    for (const tier of PAID_TIERS) {
      const ent = getEntitlements(tier);
      const floor = planPrice(tier, "monthly") - worstCaseCostUsd(ent.monthlyCredits);
      expect(floor, `${tier} monthly floor`).toBeGreaterThanOrEqual(MIN_FLOOR_USD);
    }
  });

  it("clears the launch margin on the yearly discount too", () => {
    // The yearly price is the one that broke: the same grant twelve times against
    // ten months' money. A discount that is safe on the sticker price and not on the
    // real one is not a discount, it is a subsidy.
    for (const tier of PAID_TIERS) {
      const ent = getEntitlements(tier);
      const perMonth = planPrice(tier, "yearly") / 12;
      const floor = perMonth - worstCaseCostUsd(ent.monthlyCredits);
      expect(floor, `${tier} yearly floor at $${perMonth.toFixed(2)}/mo`).toBeGreaterThanOrEqual(
        MIN_FLOOR_USD
      );
    }
  });

  it("charges the trial more than its own grant can cost", () => {
    // The trial is an acquisition cost, but a bounded one: $7 against a grant that
    // cannot cost more than $5.44 even spent entirely on the worst-covered action.
    const trial = PLAN_CATALOG.TRIAL;
    expect(trial.oneTimePrice).toBeGreaterThan(0);
    expect(worstCaseCostUsd(getEntitlements("TRIAL").monthlyCredits)).toBeLessThan(
      trial.oneTimePrice as number
    );
  });

  it("bounds a chat turn by the rounds it is allowed, on every plan", () => {
    // The defect this replaces: `chat.message` was flat while the number of model
    // calls behind it scaled with `chatMaxToolLoops`. The fix is that the rounds
    // beyond the first are their own action, so the price of a turn grows with it.
    const perRound = actionCredits("chat.toolLoop");
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      if (!ent.features.includes("chat.message")) continue;
      const worstTurn = actionCredits("chat.message") + Math.max(0, ent.chatMaxToolLoops - 1) * perRound;
      // A single turn must never be able to spend the whole period's balance.
      expect(worstTurn, `${tier}'s dearest chat turn`).toBeLessThan(ent.monthlyCredits / 2);
      // And a plan that allows tool rounds must price them.
      if (ent.chatMaxToolLoops > 1) {
        expect(ent.features.includes("chat.tools"), `${tier} allows rounds it cannot charge for`).toBe(true);
      }
    }
  });

  it("prices the per-round action at least as high as the answer call", () => {
    // A later round costs MORE than the first — it carries the whole transcript so
    // far as input. Pricing it below the answer call would make a long turn the
    // cheapest way to buy model time.
    expect(actionCredits("chat.toolLoop")).toBeGreaterThanOrEqual(actionCredits("chat.message"));
  });
});

describe("the ladder goes one way", () => {
  const ranked = PLAN_TIERS.filter((t) => t !== "TRIAL").sort((a, b) => planRank(a) - planRank(b));

  it("never takes a feature away as the price goes up", () => {
    // TRIAL is excluded: it deliberately carries features Go does not, because it
    // exists to show them. Everything else has to be a superset of the tier below.
    for (let i = 1; i < ranked.length; i += 1) {
      const lower = getEntitlements(ranked[i - 1]).features;
      const higher = new Set<string>(getEntitlements(ranked[i]).features);
      for (const feature of lower) {
        expect(higher.has(feature), `${ranked[i]} dropped ${feature} that ${ranked[i - 1]} has`).toBe(true);
      }
    }
  });

  it("never takes credits, workspaces or accounts away as the price goes up", () => {
    for (let i = 1; i < ranked.length; i += 1) {
      const lo = getEntitlements(ranked[i - 1]);
      const hi = getEntitlements(ranked[i]);
      expect(hi.monthlyCredits, `${ranked[i]} credits`).toBeGreaterThanOrEqual(lo.monthlyCredits);
      for (const field of ["workspaces", "seats", "storageMb", "analyticsRetentionDays"] as const) {
        if (isUnlimited(hi[field])) continue;
        expect(isUnlimited(lo[field]), `${ranked[i - 1]}.${field} is unlimited above a limit`).toBe(false);
        expect(hi[field], `${ranked[i]}.${field}`).toBeGreaterThanOrEqual(lo[field]);
      }
    }
  });

  it("never raises a cap below the tier under it", () => {
    for (let i = 1; i < ranked.length; i += 1) {
      const lo = getEntitlements(ranked[i - 1]);
      for (const feature of Object.keys(lo.caps) as FeatureKey[]) {
        const below = featureCap(ranked[i - 1], feature);
        const above = featureCap(ranked[i], feature);
        if (isUnlimited(above)) continue;
        expect(isUnlimited(below), `${ranked[i - 1]}.${feature} unlimited above a cap`).toBe(false);
        expect(above, `${ranked[i]}.${feature}`).toBeGreaterThanOrEqual(below);
      }
    }
  });

  it("never sends an upgrade prompt to the trial", () => {
    // `lowestPlanWith` writes the "this needs Pro" message. Naming the trial there
    // would sell a three-day plan as the fix for a permanent limit.
    for (const feature of FEATURE_KEYS) {
      expect(lowestPlanWith(feature), `lowestPlanWith(${feature})`).not.toBe("TRIAL");
    }
  });

  it("names a plan that actually has the feature", () => {
    for (const feature of FEATURE_KEYS) {
      const tier = lowestPlanWith(feature);
      expect(getEntitlements(tier).features.includes(feature), `${tier} has ${feature}`).toBe(true);
    }
  });
});

describe("the cards describe the plans they are for", () => {
  it("gives every tier a card that names itself", () => {
    expect(Object.keys(PLAN_CATALOG).sort()).toEqual([...PLAN_TIERS].sort());
    for (const tier of PLAN_TIERS) {
      expect(PLAN_CATALOG[tier].id).toBe(tier);
      expect(PLAN_CATALOG[tier].features.length, `${tier} lists something`).toBeGreaterThan(2);
      expect(PLAN_CATALOG[tier].ctaLabel.length, `${tier} has a button`).toBeGreaterThan(2);
      expect(PLAN_CATALOG[tier].blurb.length, `${tier} has a blurb`).toBeGreaterThan(40);
    }
  });

  it("prices Free at nothing and everything else at something", () => {
    expect(planPrice("FREE", "monthly")).toBe(0);
    expect(planPrice("FREE", "yearly")).toBe(0);
    for (const tier of PAID_TIERS) {
      expect(planPrice(tier, "monthly"), `${tier} monthly`).toBeGreaterThan(0);
      expect(planPrice(tier, "yearly"), `${tier} yearly`).toBeGreaterThan(0);
      // Yearly is a discount, not a surcharge.
      expect(planPrice(tier, "yearly")).toBeLessThan(planPrice(tier, "monthly") * 12);
    }
  });

  it("charges the trial once rather than per period", () => {
    const trial = PLAN_CATALOG.TRIAL;
    expect(trial.priceMonthly).toBe(0);
    expect(trial.priceYearly).toBe(0);
    expect(trial.trialDays).toBeGreaterThan(0);
    expect(trial.convertsTo).toBeTruthy();
    // `planPrice` has to return the one-time figure for both cycles, or a yearly
    // toggle would show the trial as free.
    expect(planPrice("TRIAL", "monthly")).toBe(trial.oneTimePrice);
    expect(planPrice("TRIAL", "yearly")).toBe(trial.oneTimePrice);
  });

  it("never tells a buyer a plan lacks something it has", () => {
    // `notIncluded` is the honest half of a card, which makes a stale line there
    // worse than a missing one: it talks a buyer out of a plan that would have done.
    const described: Partial<Record<PlanTier, FeatureKey[]>> = {
      GO: ["goals.autopilot", "article.deep", "media.imagePro"],
      PRO: ["article.deep", "media.imagePro"],
      TRIAL: ["article.deep", "media.imagePro"],
    };
    for (const [tier, features] of Object.entries(described) as [PlanTier, FeatureKey[]][]) {
      for (const feature of features) {
        expect(getEntitlements(tier).features.includes(feature), `${tier} should not have ${feature}`).toBe(
          false
        );
      }
    }
  });

  it("caps connected accounts at six on every plan", () => {
    // Six is the number of platforms the product can actually publish to. A plan
    // that offered more would be selling a connection with nowhere to go.
    for (const tier of PLAN_TIERS) {
      expect(getEntitlements(tier).socialAccountsPerWorkspace, `${tier} accounts`).toBe(6);
    }
  });

  it("only offers the premium image model where it is charged", () => {
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      if (ent.imageQuality === "premium") {
        expect(ent.features.includes("media.imagePro"), `${tier} renders premium unbilled`).toBe(true);
      }
    }
  });

  it("only lets a plan buy top-ups if it can spend them", () => {
    for (const tier of PLAN_TIERS) {
      const ent = getEntitlements(tier);
      if (!ent.canBuyTopUps) continue;
      // Free and the trial cannot buy credits; anything that can must have somewhere
      // worth spending them, or the purchase is a dead end.
      expect(ent.features.includes("aistudio.generate"), `${tier} sells credits it cannot spend`).toBe(true);
    }
  });
});

describe("the free plan's exposure is exactly what it advertises", () => {
  const free = getEntitlements("FREE");

  it("counts every action a free account can reach", () => {
    // The whole argument for granting Free any credits at all is that its exposure
    // is enumerable. If an uncapped priced action ever becomes reachable, the grant
    // stops being a ceiling and this test is how we find out.
    const reachable = ACTION_KEYS.filter((key) => free.features.includes(ACTION_CATALOG[key].feature));
    for (const key of reachable) {
      const counter = ACTION_CATALOG[key].countsAgainst ?? ACTION_CATALOG[key].feature;
      const cap = featureCap("FREE", counter);
      expect(isUnlimited(cap), `${key} is uncapped on Free`).toBe(false);
      expect(cap, `${key} is capped above zero on Free`).toBeGreaterThan(0);
    }
  });

  it("costs less than a dollar at its ceiling", () => {
    expect(worstCaseCostUsd(free.monthlyCredits)).toBeLessThan(1);
  });

  it("gives a free account no chat and no tool rounds", () => {
    expect(free.features.includes("chat.message")).toBe(false);
    expect(free.chatMaxToolLoops).toBe(0);
  });

  it("lets a new free account finish onboarding", () => {
    // "Generate Magic Profile" is the first thing the product asks for and it is a
    // model call. A free plan that refuses it turns the opening minute into a wall.
    expect(free.features.includes("brandDna.analyze")).toBe(true);
    expect(featureCap("FREE", "brandDna.analyze")).toBeGreaterThan(0);
    expect(free.monthlyCredits).toBeGreaterThanOrEqual(actionCredits("brand.analyze"));
  });
});

describe("the trial shows the whole product", () => {
  const trial = getEntitlements("TRIAL");

  it("reaches every tab the product sells", () => {
    // The trial's reason to exist. Each of these is a tab a buyer is being asked to
    // pay for, and a trial that cannot open one is not a trial of this product.
    for (const feature of [
      "aistudio.generate",
      "media.image",
      "media.video",
      "chat.message",
      "chat.tools",
      "article.quick",
      "goals.manage",
      "goals.autopilot",
      "optimize.run",
      "schedule.bestTime",
      "brandDna.analyze",
    ] as FeatureKey[]) {
      expect(trial.features.includes(feature), `trial reaches ${feature}`).toBe(true);
    }
  });

  it("affords a five-slide carousel and a video in the same trial", () => {
    const deck = actionCredits("media.image") * 5;
    const video = actionCredits("media.video");
    const campaign = actionCredits("ai.post.campaign");
    expect(featureCap("TRIAL", "media.image")).toBeGreaterThanOrEqual(5);
    expect(featureCap("TRIAL", "media.video")).toBeGreaterThanOrEqual(1);
    expect(trial.monthlyCredits, "a deck, a video and a campaign all fit").toBeGreaterThan(
      deck + video + campaign
    );
  });

  it("leaves the editor's small buttons uncapped", () => {
    // Every cheap button in the editor draws on `aistudio.generate`, and so do
    // `goal.taskPost` and `media.reelScript`. A count small enough to feel like a
    // trial is spent by pressing "regenerate hashtags" twice.
    expect(isUnlimited(featureCap("TRIAL", "aistudio.generate"))).toBe(true);
  });

  it("counts chat messages rather than model calls", () => {
    // The card promises six messages. That only stays true while the rounds a
    // message takes are counted somewhere else.
    const spec = ACTION_CATALOG["chat.toolLoop"];
    const counter = spec.countsAgainst ?? spec.feature;
    expect(counter).not.toBe("chat.message");
    expect(featureCap("TRIAL", "chat.message")).toBe(6);
    expect(isUnlimited(featureCap("TRIAL", "chat.tools"))).toBe(true);
  });

  it("withholds the two things one run of which would empty it", () => {
    expect(trial.features.includes("article.deep")).toBe(false);
    expect(trial.features.includes("media.imagePro")).toBe(false);
    // Both would fit the balance, which is exactly why the refusal has to be a
    // feature and not a price: one deep article is 44% of the trial's credits.
    expect(actionCredits("article.deep")).toBeLessThan(trial.monthlyCredits);
  });

  it("cannot be topped up", () => {
    // A trial that can buy credits is a paid plan with a three-day clock on it, and
    // the anti-abuse work in `trialGuard.ts` assumes a fixed maximum exposure.
    expect(trial.canBuyTopUps).toBe(false);
  });
});

describe("unknown plans and unknown features fail closed", () => {
  it("treats an unrecognised tier as Free", () => {
    // A null plan reaches here from a user row written before the billing tables
    // existed. Defaulting up would hand out Agency to anyone whose subscription row
    // failed to write.
    for (const value of [null, undefined, "", "ENTERPRISE", "pro", "Agency"]) {
      expect(getEntitlements(value as PlanTier | null), `getEntitlements(${String(value)})`).toBe(
        PLAN_ENTITLEMENTS.FREE
      );
    }
  });

  it("gives a feature the plan lacks a cap of zero, not unlimited", () => {
    // `featureCap` returning UNLIMITED for a missing feature would invert the gate:
    // the plans that do not have a feature would be the ones with no ceiling on it.
    expect(featureCap("FREE", "article.deep")).toBe(0);
    expect(featureCap("GO", "article.deep")).toBe(0);
    expect(featureCap("AGENCY", "article.deep")).toBe(UNLIMITED);
  });

  it("ranks the tiers in the order they are priced", () => {
    expect(planRank("FREE")).toBeLessThan(planRank("GO"));
    expect(planRank("GO")).toBeLessThan(planRank("PRO"));
    expect(planRank("PRO")).toBeLessThan(planRank("AGENCY"));
  });
});
