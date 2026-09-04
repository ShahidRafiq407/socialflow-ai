import prisma from "@/lib/db";
import { getAttribution } from "@/lib/growth/metrics";
import { isCaptionLinkClickable } from "@/lib/growth/ctaLinks";
import { LeadSource, leadTypeLabel } from "@/lib/types/growth";

/**
 * "Which platforms should I actually post on?"
 *
 * Answered the moment the user picks a lead source, before any plan exists, so
 * they never have to guess at a checkbox list. Three rules:
 *
 *   1. A platform the workspace has already used is ranked on its own measured
 *      clicks and confirmed leads — never on a guess.
 *   2. Without that history the ranking comes from the lead type, the industry
 *      and one hard platform fact (can a link in the caption be clicked), and it
 *      says so. No invented numbers, ever.
 *   3. The AI may reorder and explain, but it cannot introduce a platform this
 *      app cannot publish to.
 */

/** Every platform this app can publish to. Nothing outside this list is offered. */
export const SUPPORTED_PLATFORMS = [
  "linkedin",
  "instagram",
  "facebook",
  "x",
  "youtube",
  "tiktok",
  "pinterest",
] as const;

export const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  twitter: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};

export function platformLabel(key: string): string {
  const k = String(key || "").toLowerCase();
  return PLATFORM_LABEL[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : "");
}

export interface ChannelSuggestion {
  /** Lower-case canonical key. */
  platform: string;
  label: string;
  connected: boolean;
  /** True when the AI puts this platform in the starting line-up. */
  recommended: boolean;
  priority: "HIGH" | "MEDIUM" | "LOW";
  /** Plain-language reason, safe to show verbatim. */
  reason: string;
  /** Only present once this workspace has real numbers for the platform. */
  measured: { clicks: number; leads: number; conversionRate: string } | null;
}

export interface ChannelAdvice {
  suggestions: ChannelSuggestion[];
  /** Set when Website is a lead source — what the article channel is for. */
  websiteNote: string | null;
  /** How the ranking was produced, shown to the user as a chip. */
  basis: "MEASURED" | "AI" | "RULES";
  /** True when nothing is connected yet, so the advice is only a shortlist. */
  nothingConnected: boolean;
  /**
   * True only when the model ran and its answer survived the checks below.
   *
   * `basis` cannot answer that question: a workspace with tracked clicks keeps
   * `basis: "MEASURED"` whether the AI pass ran or not, and every failure path in
   * here returns the deterministic advice rather than an error. The biller needs
   * the difference, because a shortlist arithmetic produced is not something to
   * charge a credit for.
   */
  aiWritten: boolean;
  generatedAt: string;
  /** Set when the plan, not the data, is why `aiWritten` is false. */
  error?: string;
  /** True alongside `error` when an upgrade is what would fix it. */
  upgrade?: boolean;
}

/**
 * The one platform fact worth ranking on without data: whether a link in the
 * caption is clickable. For lead generation that is the difference between a
 * tracked click and a screenshot of a URL.
 */
function baseRank(platform: string, leadType: string): number {
  const clickable = isCaptionLinkClickable(platform) ? 2 : 0;
  const wantsForms = /FORM|WEBSITE|INQUIR|BOOK/i.test(leadType || "");
  const wantsChat = /WHATSAPP|CALL|DM|MESSAGE/i.test(leadType || "");

  const shape: Record<string, number> = {
    linkedin: 3,
    facebook: 2,
    x: 2,
    youtube: 2,
    instagram: wantsChat ? 3 : 1,
    tiktok: wantsChat ? 2 : 1,
    pinterest: 1,
  };

  return clickable + (shape[platform] ?? 1) + (wantsForms && clickable ? 1 : 0);
}

function ruleReason(platform: string, connected: boolean, leadType: string): string {
  const label = platformLabel(platform);
  const clickable = isCaptionLinkClickable(platform);
  const many = leadTypeLabel(leadType);
  const one = leadTypeLabel(leadType, 1);

  if (!clickable) {
    return `${label} does not make links in the caption clickable, so it earns ${many} through profile and bio traffic rather than a direct click. Worth keeping if your audience is there, but it will not be the fastest path.`;
  }
  if (!connected) {
    return `${label} lets a post carry a clickable tracked link, which is how a ${one} gets counted. Connect it and it can start earning from the first day.`;
  }
  return `${label} lets a post carry a clickable tracked link, so every visit it sends is measured and attributed back to the exact post.`;
}

/** Deterministic advice — used on its own, and as the fallback if the AI fails. */
function ruleAdvice(params: {
  connected: Set<string>;
  attribution: Map<string, { clicks: number; leads: number }>;
  leadType: string;
  leadSources: LeadSource[];
  maxRecommended: number;
}): ChannelAdvice {
  const { connected, attribution, leadType, leadSources, maxRecommended } = params;

  const scored = SUPPORTED_PLATFORMS.map((platform) => {
    const m = attribution.get(platform) || null;
    const measuredScore = m ? m.leads * 10 + Math.min(m.clicks, 100) / 10 : 0;
    return {
      platform,
      measured: m,
      score: measuredScore + baseRank(platform, leadType) + (connected.has(platform) ? 4 : 0),
    };
  }).sort((a, b) => b.score - a.score);

  const anyMeasured = scored.some((s) => s.measured && (s.measured.clicks > 0 || s.measured.leads > 0));
  const connectedCount = scored.filter((s) => connected.has(s.platform)).length;

  // Only connected platforms can be in the starting line-up — anything else
  // would put a task in the plan that could never publish.
  let picked = 0;
  const suggestions: ChannelSuggestion[] = scored.map((s) => {
    const isConnected = connected.has(s.platform);
    const recommended = isConnected && picked < maxRecommended;
    if (recommended) picked += 1;

    const measured =
      s.measured && (s.measured.clicks > 0 || s.measured.leads > 0)
        ? {
            clicks: s.measured.clicks,
            leads: s.measured.leads,
            conversionRate:
              s.measured.clicks > 0
                ? `${((s.measured.leads / s.measured.clicks) * 100).toFixed(1)}%`
                : "—",
          }
        : null;

    return {
      platform: s.platform,
      label: platformLabel(s.platform),
      connected: isConnected,
      recommended,
      priority: recommended ? (picked <= 2 ? "HIGH" : "MEDIUM") : isConnected ? "MEDIUM" : "LOW",
      reason: measured
        ? `${platformLabel(s.platform)} has produced ${measured.clicks} tracked click${
            measured.clicks === 1 ? "" : "s"
          } and ${measured.leads} confirmed lead${measured.leads === 1 ? "" : "s"} for you so far (${
            measured.conversionRate
          }). That is your own measured result, not a benchmark.`
        : ruleReason(s.platform, isConnected, leadType),
      measured,
    };
  });

  return {
    suggestions,
    websiteNote: leadSources.includes("WEBSITE")
      ? "Your own site is the only channel you fully own. Articles published there keep earning search traffic months later, and the tag on your site attributes a form submit or WhatsApp click back to the post that sent the visitor."
      : null,
    basis: anyMeasured ? "MEASURED" : "RULES",
    nothingConnected: connectedCount === 0,
    aiWritten: false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Builds the advice. The LLM only rewrites reasons and reorders the shortlist —
 * it cannot add a platform, invent a number, or recommend something that is not
 * connected.
 *
 * Nothing is gated or charged in here, on purpose: with `fast` this is pure
 * arithmetic over the workspace's own rows and the Lead Goal tab runs it on every
 * load, so a gate here would put a plan check on a page render. Without `fast` it
 * makes exactly one frontier-model call, and the caller that asked for that —
 * `getChannelAdvice` — is where the `goal.channelAdvice` ticket lives. `aiWritten`
 * on the result is how that caller knows whether the model actually contributed.
 */
export async function suggestChannels(params: {
  workspaceId: string;
  leadSources: LeadSource[];
  leadTarget: number;
  timeframeDays: number;
  leadType: string;
  /** Skip the LLM call — used when the caller only needs the deterministic list. */
  fast?: boolean;
}): Promise<ChannelAdvice> {
  const { workspaceId, leadSources, leadTarget, timeframeDays, leadType } = params;

  const [workspace, accounts, attribution] = await Promise.all([
    prisma.workspace
      .findUnique({
        where: { id: workspaceId },
        select: { name: true, industry: true, website: true, targetAudience: true } as any,
      })
      .catch(() => null),
    prisma.socialAccount
      .findMany({ where: { workspaceId }, select: { platform: true } })
      .catch(() => [] as { platform: string }[]),
    getAttribution(workspaceId).catch(() => ({ byPlatform: [], byPillar: [], byChannel: [] })),
  ]);

  const connected = new Set(
    accounts.map((a) => {
      const key = String(a.platform).toLowerCase();
      return key === "twitter" ? "x" : key;
    })
  );

  const attributionMap = new Map<string, { clicks: number; leads: number }>();
  for (const row of attribution.byPlatform || []) {
    const key = String(row.key || "").toLowerCase();
    const norm = key === "twitter" ? "x" : key;
    const cur = attributionMap.get(norm) || { clicks: 0, leads: 0 };
    attributionMap.set(norm, { clicks: cur.clicks + row.clicks, leads: cur.leads + row.leads });
  }

  // How many platforms are worth running at this size of goal. A small target
  // spread over six accounts produces six weak channels instead of two good
  // ones, so the shortlist grows with the target, not with what is connected.
  const perDay = leadTarget / Math.max(1, timeframeDays);
  const maxRecommended = Math.max(1, Math.min(4, perDay >= 1.5 ? 4 : perDay >= 0.5 ? 3 : 2));

  const rules = ruleAdvice({
    connected,
    attribution: attributionMap,
    leadType,
    leadSources,
    maxRecommended,
  });

  const hasBrand = Boolean((workspace as any)?.name || (workspace as any)?.industry);
  if (params.fast || !hasBrand || !leadSources.includes("SOCIAL")) return rules;

  // ── Let the AI explain the shortlist in the user's own business terms.
  try {
    const { vertexProvider, MODELS } = await import("@/lib/agents/llm");

    const measuredLines = rules.suggestions
      .filter((s) => s.measured)
      .map((s) => `- ${s.label}: ${s.measured!.clicks} clicks, ${s.measured!.leads} leads (${s.measured!.conversionRate})`)
      .join("\n");

    const prompt = `You advise on which social platforms a business should post on to generate leads.

BUSINESS
- Name: ${(workspace as any)?.name || "unknown"}
- Industry: ${(workspace as any)?.industry || "unknown"}
- Audience: ${(workspace as any)?.targetAudience || "unknown"}
- Website: ${(workspace as any)?.website || "none"}

GOAL
- ${leadTarget} ${leadTypeLabel(leadType)} in ${timeframeDays} days
- Lead sources chosen by the user: ${leadSources.join(", ")}

CONNECTED ACCOUNTS: ${Array.from(connected).map(platformLabel).join(", ") || "none"}
NOT CONNECTED: ${SUPPORTED_PLATFORMS.filter((p) => !connected.has(p)).map(platformLabel).join(", ") || "none"}

MEASURED RESULTS SO FAR (this workspace's own tracked links):
${measuredLines || "None yet — this workspace has no tracked clicks or confirmed leads."}

PLATFORM FACT: a link in the caption is clickable on LinkedIn, Facebook, X, YouTube and Pinterest. It is NOT clickable on Instagram and TikTok, where traffic has to go through the profile/bio link.

RULES
- Only use these platform keys: ${SUPPORTED_PLATFORMS.join(", ")}.
- "recommended": true for at most ${maxRecommended} platforms, and ONLY for platforms in CONNECTED ACCOUNTS. A platform that is not connected cannot be posted to.
- If a platform has measured results above, rank it on those results and say the real numbers. If it has none, do NOT state any number, percentage or estimate for it.
- Each "reason" is one or two sentences, plain language, written to the business owner, explaining what that platform is for in THIS business and why it earns this lead type. Never mention that you are an AI or that these are rules.
- Every one of the listed platform keys must appear exactly once in your output.

Return JSON only:
{"platforms":[{"platform":"linkedin","recommended":true,"priority":"HIGH","reason":"…"}],"websiteNote":"one sentence on what publishing articles to their own site adds, or null"}`;

    const res: any = await vertexProvider.generateJSON([{ role: "user", content: prompt }], {
      modelName: MODELS.ORCHESTRATOR,
      temperature: 0.4,
    });

    const rows: any[] = Array.isArray(res?.platforms) ? res.platforms : [];
    if (rows.length === 0) return rules;

    const byKey = new Map(rules.suggestions.map((s) => [s.platform, s]));
    const seen = new Set<string>();
    const merged: ChannelSuggestion[] = [];
    let picked = 0;

    for (const row of rows) {
      const key = String(row?.platform || "").toLowerCase();
      const base = byKey.get(key === "twitter" ? "x" : key);
      if (!base || seen.has(base.platform)) continue;
      seen.add(base.platform);

      // The model cannot promote a platform that has no connected account, and
      // cannot exceed the shortlist size.
      const recommended = Boolean(row?.recommended) && base.connected && picked < maxRecommended;
      if (recommended) picked += 1;

      const reason = typeof row?.reason === "string" ? row.reason.trim() : "";
      const priority = ["HIGH", "MEDIUM", "LOW"].includes(String(row?.priority).toUpperCase())
        ? (String(row.priority).toUpperCase() as "HIGH" | "MEDIUM" | "LOW")
        : base.priority;

      merged.push({
        ...base,
        recommended,
        priority: recommended ? priority : base.connected ? "MEDIUM" : "LOW",
        // A measured platform keeps its counted sentence; the AI only gets to
        // explain platforms it cannot put numbers on.
        reason: base.measured ? base.reason : reason.length > 20 ? reason : base.reason,
      });
    }

    // Anything the model dropped keeps its deterministic entry.
    for (const s of rules.suggestions) {
      if (!seen.has(s.platform)) merged.push({ ...s, recommended: false });
    }

    // If the model recommended nothing usable, fall back rather than showing an
    // empty line-up.
    if (picked === 0) return rules;

    const websiteNote =
      leadSources.includes("WEBSITE") && typeof res?.websiteNote === "string" && res.websiteNote.trim()
        ? res.websiteNote.trim()
        : rules.websiteNote;

    return {
      suggestions: merged,
      websiteNote,
      basis: rules.basis === "MEASURED" ? "MEASURED" : "AI",
      nothingConnected: rules.nothingConnected,
      aiWritten: true,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return rules;
  }
}
