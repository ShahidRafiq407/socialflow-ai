/**
 * BRAND PROFILE — one parser for the Brand DNA record
 *
 * `BrandDNA.writingStyle` is not a writing style. `saveWorkspaceBrandDNA` stores a
 * JSON blob in it:
 *
 *   {"ctaOffer":"…","painPoints":"…","differentiator":"…","competitors":"…","rules":"…"}
 *
 * so anything that reads the column raw either prints JSON at the user or feeds
 * JSON to a model. Both were happening: the Article Writer header rendered
 * `Style: {"ctaOffer":…}` as a fact chip, and the generate route passed the same
 * string to the writer prompt as `writingStyle`, which meant the four richest
 * facts about the business — what it offers, what it fixes, why it wins, who it
 * competes with — never reached the article.
 *
 * This module is the single place that unpacks it. It is a plain module (no
 * "use server", no Prisma import) so the dashboard, the API route and the agents
 * all parse identically.
 */

/** The blob inside `BrandDNA.writingStyle`, once parsed. */
export interface BrandMetadata {
  ctaOffer: string;
  painPoints: string;
  differentiator: string;
  competitors: string;
  rules: string;
}

/** What the rest of the app should read instead of the raw columns. */
export interface BrandProfile {
  brandName: string;
  website: string;
  industry: string;
  tone: string;
  targetAudience: string;
  /** The "what does your business do" answer. */
  missionVision: string;
  /** Customer problems the business solves, as written by the owner. */
  painPoints: string;
  /** Why a customer picks them over the alternatives. */
  differentiator: string;
  /** The default offer/lead magnet an article should close towards. */
  ctaOffer: string;
  /** Benchmark competitor brands, free text. */
  competitors: string;
  /** Actual writing rules the owner typed, i.e. `rules` from the blob. */
  writingRules: string;
  forbiddenWords: string[];
}

/** The shape this module needs from a `Workspace` row with `brandDNA` included. */
export interface BrandProfileSource {
  name?: string | null;
  website?: string | null;
  industry?: string | null;
  brandDNA?: {
    tone?: string | null;
    missionVision?: string | null;
    targetAudience?: string | null;
    writingStyle?: string | null;
    forbiddenWords?: string[] | null;
  } | null;
}

const EMPTY_METADATA: BrandMetadata = {
  ctaOffer: "",
  painPoints: "",
  differentiator: "",
  competitors: "",
  rules: "",
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the JSON blob out of `writingStyle`. A value that is not JSON is treated
 * as what it looks like — writing rules typed straight into the column, which is
 * what older rows contain.
 */
export function parseBrandMetadata(writingStyle?: string | null): BrandMetadata {
  const raw = str(writingStyle);
  if (!raw) return { ...EMPTY_METADATA };
  if (!raw.startsWith("{")) return { ...EMPTY_METADATA, rules: raw };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ctaOffer: str(parsed.ctaOffer),
      painPoints: str(parsed.painPoints),
      differentiator: str(parsed.differentiator),
      competitors: str(parsed.competitors),
      rules: str(parsed.rules),
    };
  } catch {
    // Malformed JSON is not writing guidance — do not hand it to a model.
    return { ...EMPTY_METADATA };
  }
}

/** Flattens a Workspace + BrandDNA row into the profile everything else uses. */
export function buildBrandProfile(source: BrandProfileSource | null | undefined): BrandProfile {
  const dna = source?.brandDNA ?? null;
  const meta = parseBrandMetadata(dna?.writingStyle);
  return {
    brandName: str(source?.name),
    website: str(source?.website),
    industry: str(source?.industry),
    tone: str(dna?.tone),
    targetAudience: str(dna?.targetAudience),
    missionVision: str(dna?.missionVision),
    painPoints: meta.painPoints,
    differentiator: meta.differentiator,
    ctaOffer: meta.ctaOffer,
    competitors: meta.competitors,
    writingRules: meta.rules,
    forbiddenWords: (dna?.forbiddenWords ?? []).map((w) => str(w)).filter(Boolean),
  };
}

/**
 * Splits the free-text list fields (competitors, pain points) the way the owner
 * most likely meant them: newlines, semicolons, bullets, or commas.
 */
export function splitBrandList(value: string, limit = 8): string[] {
  return value
    .split(/[\n;•]+|,(?=\s)/g)
    .map((part) => part.replace(/^[\s\-–*]+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** True when the profile has enough in it to brief a writer on the business. */
export function hasBusinessContext(profile: BrandProfile): boolean {
  return Boolean(
    profile.missionVision ||
      profile.targetAudience ||
      profile.painPoints ||
      profile.differentiator ||
      profile.ctaOffer
  );
}

export interface BrandFact {
  label: string;
  value: string;
}

const FACT_VALUE_LIMIT = 90;

function truncate(value: string, limit = FACT_VALUE_LIMIT): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

/**
 * The chips shown under the page heading. Only facts the owner actually filled
 * in appear — an empty Brand DNA shows no chips rather than empty labels, and
 * nothing here can ever render as JSON.
 */
export function describeBrandFacts(profile: BrandProfile, limit = 5): BrandFact[] {
  const facts: BrandFact[] = [
    { label: "Industry", value: profile.industry },
    { label: "Audience", value: profile.targetAudience },
    { label: "Tone", value: profile.tone },
    { label: "Solves", value: profile.painPoints },
    { label: "Edge", value: profile.differentiator },
    { label: "Offer", value: profile.ctaOffer },
  ];
  return facts
    .filter((fact) => Boolean(fact.value))
    .slice(0, limit)
    .map((fact) => ({ label: fact.label, value: truncate(fact.value) }));
}
