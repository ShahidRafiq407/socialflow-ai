// ============================================================================
// TRIAL GUARD — ONE TRIAL PER PERSON, NOT ONE PER SIGN-UP FORM
//
// The 3-day trial is deliberately generous enough to be worth abusing: it opens
// the CEO chat, renders a video, writes an article. Sold once at $1 that is a
// customer acquisition cost. Sold fifty times to the same person behind fifty
// email addresses it is a bill we pay to Google with no revenue against it.
//
// So this file answers one question — "has this person already had their trial?"
// — using every independent signal available, because any single one of them is
// cheap to defeat:
//
//   email        Free to create another. Normalised first, so the dots-and-plus
//                trick on Gmail does not produce a new person.
//   IP address   Free to change with a VPN. Which is why the VPN itself is a
//                signal: a residential IP that has already taken a trial is a
//                repeat, and a datacenter IP asking for a trial is not a
//                customer sitting at home.
//   fingerprint  Free to change with a fresh browser profile, but not free to
//                change casually, and refusing to produce one is itself unusual.
//   the card     Not our signal at all — Lemon Squeezy screens it, and a real $1
//                charge is the single most expensive thing to fake here. This is
//                the layer we lean on hardest, and the reason the trial is not
//                free.
//
// None of these is trusted alone. Each contributes to a score, the score decides,
// and every attempt is written down with the signals that fired — so a threshold
// can be changed later and evaluated against attempts that already happened
// rather than against a guess.
//
// A note on what this deliberately does not do: it does not store an IP address,
// an email or a fingerprint. Only salted hashes, which are enough to answer "have
// I seen this before" and useless for anything else.
// ============================================================================

import { createHash } from "node:crypto";
import prisma from "@/lib/db";
import { managedKey } from "@/lib/admin/runtimeConfig";

export type TrialDecisionValue = "ALLOWED" | "BLOCKED" | "FLAGGED";

/** Score at or above which a trial is refused outright. */
const BLOCK_AT = 70;
/** Score at or above which a trial is granted but written down for review. */
const FLAG_AT = 35;

// ─────────────────────────────────────────────────────────────────────────────
// Hashing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The salt that makes these hashes useless outside this database.
 *
 * Without it the table would be a rainbow-table-able list of every email address
 * and IP that ever touched the trial. It must be set in production, and the loud
 * error is there because a silently-empty salt is worse than a crash: it looks
 * like it is working.
 */
function salt(): string {
  const value = process.env.TRIAL_HASH_SALT?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    console.error("[trial-guard] TRIAL_HASH_SALT is not set — trial hashes are unsalted");
  }
  return "postloom-trial-guard-dev-salt";
}

function hash(kind: string, value: string): string {
  return createHash("sha256").update(`${salt()}:${kind}:${value}`).digest("hex");
}

/**
 * The signal hash used across the anti-abuse surfaces (trial guard and the
 * affiliate attribution checks), so an IP hash written by one can be recognised
 * by the other. Salted with TRIAL_HASH_SALT.
 */
export function signalHash(kind: string, value: string): string {
  return hash(kind, value);
}

/**
 * The same mailbox, spelled the same way every time.
 *
 * Gmail ignores dots and everything after a `+`, so `j.o.h.n+trial7@gmail.com`
 * and `john@gmail.com` are one inbox and must be one person. Most other providers
 * honour the `+` convention too, so that part is stripped everywhere; dots are
 * only collapsed for the providers where they genuinely do not matter.
 */
export function normaliseEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);

  const dotless = new Set(["gmail.com", "googlemail.com"]);
  if (dotless.has(domain)) local = local.replace(/\./g, "");

  return `${local}@${domain}`;
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Disposable email
//
// A short list of the providers that exist specifically to be thrown away. It is
// not exhaustive and cannot be — there are thousands of them and new ones daily.
// It is here because it costs one set lookup and catches the laziest attempt, and
// because a request from one of these domains is worth a lot of risk score even
// when nothing else looks wrong.
//
// The IP-intelligence providers below also return a disposable-email verdict on
// their own far larger lists when one is configured; this is the floor, not the
// ceiling.
// ─────────────────────────────────────────────────────────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  "0-mail.com", "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "33mail.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "sharklasers.com", "grr.la", "spam4.me", "mailinator.com", "mailinator.net",
  "maildrop.cc", "mailnesia.com", "tempmail.com", "temp-mail.org",
  "temp-mail.io", "tempmailo.com", "tempr.email", "throwawaymail.com",
  "trashmail.com", "trashmail.de", "dispostable.com", "yopmail.com",
  "yopmail.net", "getnada.com", "nada.email", "inboxkitten.com",
  "emailondeck.com", "fakeinbox.com", "mytemp.email", "mohmal.com",
  "moakt.com", "tmail.ws", "tmpmail.org", "burnermail.io", "mailsac.com",
  "harakirimail.com", "anonaddy.me", "mail-temporaire.fr", "jetable.org",
  "spambox.us", "mailcatch.com", "airmail.cc", "cock.li", "linshiyouxiang.net",
  "1secmail.com", "1secmail.org", "1secmail.net", "vpnapi.dev",
  "minuteinbox.com", "luxusmail.org", "mailtemp.top", "byom.de",
  "smashmail.de", "spamgourmet.com", "wegwerfmail.de", "trbvm.com",
  "tempinbox.com", "fake-email.pp.ua", "internetkeno.com", "mailbox52.ga",
  "email-temp.com", "tmails.net", "disbox.net", "etempmail.net",
]);

export function isDisposableDomain(domain: string): boolean {
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // A handful of services hand out endless subdomains off one parent.
  return [...DISPOSABLE_DOMAINS].some((known) => domain.endsWith(`.${known}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// The client's IP
//
// Behind Vercel the socket address is a load balancer, so the real client is in a
// header. Headers are forgeable, which matters: the LEFTMOST entry of
// `x-forwarded-for` is whatever the client sent and can be a lie, while the
// RIGHTMOST entries are appended by infrastructure we control. Vercel's own
// `x-real-ip` is set by the platform and cannot be spoofed by the caller, so it
// is preferred and the forwarded chain is only a fallback.
// ─────────────────────────────────────────────────────────────────────────────

export function readClientIp(headers: Headers): string | null {
  const direct = headers.get("x-real-ip")?.trim();
  if (direct && isIpish(direct)) return direct;

  const cloudflare = headers.get("cf-connecting-ip")?.trim();
  if (cloudflare && isIpish(cloudflare)) return cloudflare;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Trust the last hop rather than the first: the first is client-supplied.
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (isIpish(parts[i]) && !isPrivateIp(parts[i])) return parts[i];
    }
  }

  return null;
}

function isIpish(value: string): boolean {
  return /^[0-9.]+$/.test(value) || /^[0-9a-f:]+$/i.test(value);
}

function isPrivateIp(value: string): boolean {
  return (
    value === "127.0.0.1" ||
    value === "::1" ||
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(value) ||
    /^fc00:/i.test(value) ||
    /^fe80:/i.test(value)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IP intelligence
//
// "Is this address a VPN, a proxy, a Tor exit or a datacenter?" is not a question
// answerable from the address itself — it needs a maintained database of network
// ownership. Four providers are supported because they all have free tiers with
// different limits, and a project should be able to use whichever it already has
// a key for. Whichever is configured first wins; `ipapi.is` also answers without
// a key, so there is always an answer available in practice.
//
// On failure this fails OPEN, with a risk penalty rather than a refusal. Blocking
// every signup during a third party's outage would cost more than the handful of
// trials that slip through, and the $1 charge and the collision checks below are
// still standing. What it must never do is fail open SILENTLY — hence the flag.
// ─────────────────────────────────────────────────────────────────────────────

export interface IpIntel {
  country: string | null;
  region: string | null;
  asn: string | null;
  asnOrg: string | null;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  isRelay: boolean;
  /** The provider's own abuse verdict, when it has one. 0–100. */
  providerRisk: number | null;
  /** Which provider answered, or null when none could. */
  source: string | null;
}

const UNKNOWN_INTEL: IpIntel = {
  country: null,
  region: null,
  asn: null,
  asnOrg: null,
  isVpn: false,
  isProxy: false,
  isTor: false,
  isDatacenter: false,
  isRelay: false,
  providerRisk: null,
  source: null,
};

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function viaVpnApi(ip: string, key: string): Promise<IpIntel | null> {
  const body = (await getJson(`https://vpnapi.io/api/${encodeURIComponent(ip)}?key=${key}`)) as
    | {
        security?: { vpn?: boolean; proxy?: boolean; tor?: boolean; relay?: boolean };
        location?: { country_code?: string; region?: string };
        network?: { autonomous_system_number?: string; autonomous_system_organization?: string };
      }
    | null;
  if (!body?.security) return null;
  return {
    country: body.location?.country_code ?? null,
    region: body.location?.region ?? null,
    asn: body.network?.autonomous_system_number ?? null,
    asnOrg: body.network?.autonomous_system_organization ?? null,
    isVpn: body.security.vpn === true,
    isProxy: body.security.proxy === true,
    isTor: body.security.tor === true,
    isDatacenter: false,
    isRelay: body.security.relay === true,
    providerRisk: null,
    source: "vpnapi.io",
  };
}

async function viaIpQualityScore(ip: string, key: string): Promise<IpIntel | null> {
  const body = (await getJson(
    `https://ipqualityscore.com/api/json/ip/${key}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`
  )) as
    | {
        success?: boolean;
        proxy?: boolean;
        vpn?: boolean;
        active_vpn?: boolean;
        tor?: boolean;
        active_tor?: boolean;
        connection_type?: string;
        fraud_score?: number;
        recent_abuse?: boolean;
        ASN?: number;
        ISP?: string;
        country_code?: string;
        region?: string;
      }
    | null;
  if (!body?.success) return null;
  const hosting = (body.connection_type ?? "").toLowerCase().includes("data center");
  return {
    country: body.country_code ?? null,
    region: body.region ?? null,
    asn: body.ASN ? `AS${body.ASN}` : null,
    asnOrg: body.ISP ?? null,
    isVpn: body.vpn === true || body.active_vpn === true,
    isProxy: body.proxy === true,
    isTor: body.tor === true || body.active_tor === true,
    isDatacenter: hosting,
    isRelay: false,
    providerRisk: typeof body.fraud_score === "number" ? body.fraud_score : null,
    source: "ipqualityscore.com",
  };
}

async function viaProxyCheck(ip: string, key: string): Promise<IpIntel | null> {
  const suffix = key ? `&key=${key}` : "";
  const body = (await getJson(
    `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=3&asn=1&risk=1${suffix}`
  )) as Record<string, unknown> | null;
  if (!body || body.status !== "ok") return null;

  const record = body[ip] as
    | {
        proxy?: string;
        type?: string;
        risk?: number;
        asn?: string;
        provider?: string;
        isocode?: string;
        region?: string;
      }
    | undefined;
  if (!record) return null;

  const type = (record.type ?? "").toLowerCase();
  const isProxy = record.proxy === "yes";
  return {
    country: record.isocode ?? null,
    region: record.region ?? null,
    asn: record.asn ?? null,
    asnOrg: record.provider ?? null,
    isVpn: isProxy && type.includes("vpn"),
    isProxy,
    isTor: type.includes("tor"),
    isDatacenter: type.includes("hosting") || type.includes("server"),
    isRelay: false,
    providerRisk: typeof record.risk === "number" ? record.risk : null,
    source: "proxycheck.io",
  };
}

async function viaIpApiIs(ip: string, key: string | null): Promise<IpIntel | null> {
  const suffix = key ? `&key=${key}` : "";
  const body = (await getJson(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}${suffix}`)) as
    | {
        is_datacenter?: boolean;
        is_vpn?: boolean;
        is_proxy?: boolean;
        is_tor?: boolean;
        is_abuser?: boolean;
        asn?: { asn?: number; org?: string };
        location?: { country_code?: string; state?: string };
      }
    | null;
  if (!body || typeof body !== "object") return null;
  if (body.is_datacenter === undefined && body.is_vpn === undefined) return null;

  return {
    country: body.location?.country_code ?? null,
    region: body.location?.state ?? null,
    asn: body.asn?.asn ? `AS${body.asn.asn}` : null,
    asnOrg: body.asn?.org ?? null,
    isVpn: body.is_vpn === true,
    isProxy: body.is_proxy === true,
    isTor: body.is_tor === true,
    isDatacenter: body.is_datacenter === true,
    isRelay: false,
    providerRisk: body.is_abuser === true ? 80 : null,
    source: "ipapi.is",
  };
}

export async function lookupIpIntel(ip: string | null): Promise<IpIntel> {
  if (!ip || isPrivateIp(ip)) return { ...UNKNOWN_INTEL, source: ip ? "private" : null };

  const vpnApiKey = managedKey("VPNAPI_IO_KEY") || undefined;
  const ipqsKey = managedKey("IPQUALITYSCORE_KEY") || undefined;
  const proxyCheckKey = managedKey("PROXYCHECK_IO_KEY") || undefined;
  const ipApiIsKey = managedKey("IPAPI_IS_KEY") || null;

  const attempts: Array<() => Promise<IpIntel | null>> = [];
  if (ipqsKey) attempts.push(() => viaIpQualityScore(ip, ipqsKey));
  if (vpnApiKey) attempts.push(() => viaVpnApi(ip, vpnApiKey));
  if (proxyCheckKey) attempts.push(() => viaProxyCheck(ip, proxyCheckKey));
  // Always last, and always available: it answers without a key.
  attempts.push(() => viaIpApiIs(ip, ipApiIsKey));

  for (const attempt of attempts) {
    const result = await attempt();
    if (result) return result;
  }

  return UNKNOWN_INTEL;
}

// ─────────────────────────────────────────────────────────────────────────────
// The signals, and what each one is worth
//
// Every weight below is a judgement about the cost of being wrong in each
// direction, and they are not symmetric. A wrongly refused trial costs a customer
// who can still subscribe directly at full price. A wrongly granted trial costs
// real model spend at $1, repeatable as many times as it works. So signals that
// only a determined abuser produces are weighted to block on their own, and
// signals that ordinary privacy-conscious people produce are weighted to be
// noticed and remembered rather than to refuse.
//
// The numbers are here, named, in one place, so the policy is legible and can be
// retuned against `TrialClaim` rows that already exist rather than against a guess.
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  /** The same mailbox has already had a trial. Not a heuristic — the same person. */
  emailRepeat: 100,
  /** This account has already had one. Same certainty. */
  accountRepeat: 100,
  /**
   * The same browser profile, under a different email. Changing this is a fresh
   * browser or a fresh profile — cheap, but not something anyone does by accident.
   */
  fingerprintRepeat: 80,
  /**
   * One trial per address. Shared addresses are real — offices, campuses, carrier
   * NAT — so this is worth exactly the block line and no more: it refuses on its
   * own, and the refusal says how to get in touch.
   */
  ipRepeat: 70,
  /** Two or more before this one is not a coincidence. */
  ipRepeatAgain: 100,
  /**
   * A network that already produced a trial, where the network is a VPN or a
   * datacenter rather than somebody's ISP. This is the rule that catches the
   * second attempt through a different exit node of the same VPN, and it is
   * deliberately not applied to residential ASNs, where it would mean "one trial
   * per broadband provider".
   */
  vpnAsnRepeat: 45,
  /** Several attempts from one address in a day. Someone is iterating. */
  ipVelocity: 30,
  /** Several attempts from one browser in a day. Same. */
  fingerprintVelocity: 30,
  /**
   * A mailbox that will not exist next week. Refuses on its own: a real
   * subscription needs a receipt, a password reset and a renewal notice to arrive
   * somewhere, so this costs a legitimate customer nothing but retyping.
   */
  disposableEmail: 70,
  /** A commercial VPN. Common among people who simply want privacy. */
  vpn: 32,
  /** An open or anonymising proxy. Less innocent than a VPN. */
  proxy: 34,
  /** Tor. Nobody buys a $1 subscription over Tor by coincidence. */
  tor: 55,
  /** The address belongs to a hosting provider, not a home or a phone. */
  datacenter: 30,
  /** iCloud Private Relay and friends — a mainstream consumer default. */
  relay: 12,
  /** The provider's own abuse verdict, banded. */
  providerRiskHigh: 35,
  providerRiskMedium: 20,
  providerRiskLow: 8,
  /** No fingerprint offered. Privacy browsers do this legitimately. */
  noFingerprint: 15,
  /** Nobody could tell us anything about the network. Noticed, not punished. */
  intelUnavailable: 8,
} as const;

/**
 * What the caller hands over: everything known about one attempt to start a trial.
 *
 * `fingerprint` is whatever the browser produced — this file hashes it and never
 * stores or logs the raw value. `userId` is present when the person is signed in,
 * which they are at checkout; it is optional because a refusal can happen before
 * an account exists.
 */
export interface TrialAttempt {
  email: string;
  ip: string | null;
  fingerprint?: string | null;
  userId?: string | null;
}

export interface TrialAssessment {
  decision: TrialDecisionValue;
  score: number;
  /** Short codes, in the order they were added, for the operator view. */
  flags: string[];
  /** One sentence, written to be quoted back to a customer verbatim. */
  reason: string | null;
  /** The earlier claim this attempt collided with, when there was one. */
  collidedWithId: string | null;
  intel: IpIntel;
  emailHash: string;
  ipHash: string;
  fingerprintHash: string | null;
  isDisposableEmail: boolean;
}

/**
 * Why a trial was refused, in words a support inbox can send as-is.
 *
 * Every one of these ends with a way forward, because in almost every case there
 * is one: the paid plans are not gated on any of this, and someone who genuinely
 * shares an office with a customer should be told what to do rather than left at
 * a dead end.
 */
const REASONS: Record<string, string> = {
  email_repeat:
    "This email address has already used a free trial. You can subscribe to any plan directly — the trial is a one-time offer per person.",
  account_repeat:
    "This account has already used its trial. You can subscribe to any plan directly at any time.",
  fingerprint_repeat:
    "This browser has already been used to start a trial. The trial is a one-time offer per person; any plan can be subscribed to directly.",
  ip_repeat:
    "A trial has already been started from this network. The trial is limited to one per person. If you share an internet connection with an existing customer, contact support and we will sort it out.",
  disposable_email:
    "Please sign up with a permanent email address — a temporary or disposable mailbox cannot receive your receipt, renewal notices or password resets.",
  anonymised_network:
    "We could not verify this connection, which we require for the trial specifically. Turning off a VPN or proxy usually resolves it, or you can subscribe to any plan directly.",
  high_risk:
    "This sign-up did not pass our automated checks for the trial offer. Subscribing to any plan directly is unaffected, or contact support and we will review it.",
};

// ─────────────────────────────────────────────────────────────────────────────
// History
//
// A trial that was FLAGGED was still granted — the flag means "we let it through
// and wrote it down", not "we refused". So both ALLOWED and FLAGGED count as a
// trial already consumed, and only BLOCKED attempts are invisible to these checks.
// Getting that backwards would hand a second trial to everyone whose first was
// merely suspicious.
// ─────────────────────────────────────────────────────────────────────────────

const GRANTED = ["ALLOWED", "FLAGGED"] as const;

const VELOCITY_WINDOW_MS = 24 * 60 * 60_000;
/** Attempts from one address within the window before it counts as iterating. */
const IP_VELOCITY_AT = 3;
/** Same, per browser. Higher, because one person retrying a failed card is normal. */
const FINGERPRINT_VELOCITY_AT = 5;

interface History {
  byEmail: { id: string } | null;
  byAccount: { id: string } | null;
  byIp: { id: string } | null;
  ipCount: number;
  byFingerprint: { id: string } | null;
  byAsn: { id: string } | null;
  ipAttempts: number;
  fingerprintAttempts: number;
}

async function readHistory(args: {
  emailHash: string;
  ipHash: string;
  fingerprintHash: string | null;
  userId: string | null;
  asn: string | null;
  anonymisedNetwork: boolean;
}): Promise<History> {
  const since = new Date(Date.now() - VELOCITY_WINDOW_MS);
  const granted = { in: [...GRANTED] };

  const [byEmail, byAccount, byIp, ipCount, byFingerprint, byAsn, ipAttempts, fingerprintAttempts] =
    await Promise.all([
      prisma.trialClaim.findFirst({
        where: { emailHash: args.emailHash, decision: granted },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
      args.userId
        ? prisma.trialClaim.findFirst({
            where: { userId: args.userId, decision: granted },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.trialClaim.findFirst({
        where: { ipHash: args.ipHash, decision: granted },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
      prisma.trialClaim.count({ where: { ipHash: args.ipHash, decision: granted } }),
      args.fingerprintHash
        ? prisma.trialClaim.findFirst({
            where: { fingerprintHash: args.fingerprintHash, decision: granted },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : Promise.resolve(null),
      // Only meaningful on a network that is already anonymising: on a consumer
      // ISP this would read "one trial per broadband provider".
      args.asn && args.anonymisedNetwork
        ? prisma.trialClaim.findFirst({
            where: { asn: args.asn, decision: granted },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.trialClaim.count({ where: { ipHash: args.ipHash, createdAt: { gte: since } } }),
      args.fingerprintHash
        ? prisma.trialClaim.count({
            where: { fingerprintHash: args.fingerprintHash, createdAt: { gte: since } },
          })
        : Promise.resolve(0),
    ]);

  return {
    byEmail,
    byAccount,
    byIp,
    ipCount,
    byFingerprint,
    byAsn,
    ipAttempts,
    fingerprintAttempts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The assessment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score one attempt and decide, without writing anything.
 *
 * Split from the write so the decision can be tested against fixed inputs, and so
 * a caller that only wants to know — a dashboard banner, an admin view — can ask
 * without leaving a row behind.
 */
export async function assessTrialAttempt(attempt: TrialAttempt): Promise<TrialAssessment> {
  const normalised = normaliseEmail(attempt.email);
  const domain = emailDomain(normalised);
  const disposable = isDisposableDomain(domain);

  const ip = attempt.ip;
  // A missing IP must not become a shared bucket that the first attempt consumes
  // and every later one collides with. It gets a stable hash for the record and is
  // then excluded from every address-based check below.
  const ipKnown = Boolean(ip);
  const emailHash = hash("email", normalised);
  const ipHash = hash("ip", ip ?? "unknown");
  const fingerprint = attempt.fingerprint?.trim();
  const fingerprintHash = fingerprint ? hash("fp", fingerprint) : null;

  const intel = await lookupIpIntel(ip);
  const anonymised = intel.isVpn || intel.isProxy || intel.isTor || intel.isDatacenter;

  const history = await readHistory({
    emailHash,
    ipHash,
    fingerprintHash,
    userId: attempt.userId ?? null,
    asn: intel.asn,
    anonymisedNetwork: anonymised,
  });

  let score = 0;
  const flags: string[] = [];
  let collidedWithId: string | null = null;
  // The flag that will supply the sentence shown to the customer: whichever
  // scored highest, so the explanation matches the actual reason for refusal.
  let topFlag: { code: string; weight: number } | null = null;

  const add = (code: string, weight: number, collided?: string | null) => {
    score += weight;
    flags.push(code);
    if (!topFlag || weight > topFlag.weight) topFlag = { code, weight };
    if (collided && !collidedWithId) collidedWithId = collided;
  };

  if (history.byEmail) add("email_repeat", WEIGHTS.emailRepeat, history.byEmail.id);
  if (history.byAccount) add("account_repeat", WEIGHTS.accountRepeat, history.byAccount.id);
  if (history.byFingerprint)
    add("fingerprint_repeat", WEIGHTS.fingerprintRepeat, history.byFingerprint.id);

  if (ipKnown && history.byIp) {
    const repeated = history.ipCount > 1;
    add(
      repeated ? "ip_repeat_multiple" : "ip_repeat",
      repeated ? WEIGHTS.ipRepeatAgain : WEIGHTS.ipRepeat,
      history.byIp.id
    );
  }
  if (history.byAsn && !history.byIp) add("vpn_asn_repeat", WEIGHTS.vpnAsnRepeat, history.byAsn.id);

  if (ipKnown && history.ipAttempts >= IP_VELOCITY_AT) add("ip_velocity", WEIGHTS.ipVelocity);
  if (history.fingerprintAttempts >= FINGERPRINT_VELOCITY_AT)
    add("fingerprint_velocity", WEIGHTS.fingerprintVelocity);

  if (disposable) add("disposable_email", WEIGHTS.disposableEmail);

  if (intel.isTor) add("tor", WEIGHTS.tor);
  if (intel.isProxy) add("proxy", WEIGHTS.proxy);
  if (intel.isVpn) add("vpn", WEIGHTS.vpn);
  if (intel.isDatacenter) add("datacenter", WEIGHTS.datacenter);
  if (intel.isRelay) add("relay", WEIGHTS.relay);

  if (intel.providerRisk !== null) {
    if (intel.providerRisk >= 85) add("provider_risk_high", WEIGHTS.providerRiskHigh);
    else if (intel.providerRisk >= 70) add("provider_risk_medium", WEIGHTS.providerRiskMedium);
    else if (intel.providerRisk >= 50) add("provider_risk_low", WEIGHTS.providerRiskLow);
  }

  if (!fingerprintHash) add("no_fingerprint", WEIGHTS.noFingerprint);
  if (!ipKnown) add("no_ip", WEIGHTS.intelUnavailable);
  else if (!intel.source) add("intel_unavailable", WEIGHTS.intelUnavailable);

  score = Math.min(100, score);

  const decision: TrialDecisionValue =
    score >= BLOCK_AT ? "BLOCKED" : score >= FLAG_AT ? "FLAGGED" : "ALLOWED";

  return {
    decision,
    score,
    flags,
    reason: decision === "BLOCKED" ? reasonFor(topFlag) : null,
    collidedWithId,
    intel,
    emailHash,
    ipHash,
    fingerprintHash,
    isDisposableEmail: disposable,
  };
}

/**
 * The sentence for a refusal.
 *
 * Falls back through a generic-but-honest message rather than inventing one, and
 * groups the network signals together — telling somebody "your IP is a datacenter"
 * is both confusing and more than they need to know.
 */
function reasonFor(top: { code: string; weight: number } | null): string {
  if (!top) return REASONS.high_risk;
  if (REASONS[top.code]) return REASONS[top.code];
  if (top.code === "ip_repeat_multiple") return REASONS.ip_repeat;
  if (["tor", "proxy", "vpn", "datacenter", "vpn_asn_repeat"].includes(top.code)) {
    return REASONS.anonymised_network;
  }
  return REASONS.high_risk;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing it down
//
// Every attempt gets a row, including the refusals. That is the whole point of
// the table: a threshold is only as good as the evidence you can retune it
// against, and a support conversation about a wrongly blocked customer is
// impossible without knowing which signals fired.
//
// The row holds hashes and network facts. It does not hold the email, the address
// or the fingerprint.
// ─────────────────────────────────────────────────────────────────────────────

export interface TrialClaimRecord extends TrialAssessment {
  /** Null only when the row itself could not be written. */
  claimId: string | null;
}

/**
 * Assess an attempt and record it. This is the one function a route should call.
 *
 * It never throws. A trial guard that can take checkout down because a logging
 * insert failed is a worse outcome than a trial guard that misses one attempt, so
 * a write failure is reported and the assessment is returned regardless.
 */
export async function evaluateTrial(attempt: TrialAttempt): Promise<TrialClaimRecord> {
  const assessment = await assessTrialAttempt(attempt);

  let claimId: string | null = null;
  try {
    const row = await prisma.trialClaim.create({
      data: {
        userId: attempt.userId ?? null,
        emailHash: assessment.emailHash,
        ipHash: assessment.ipHash,
        fingerprintHash: assessment.fingerprintHash,
        ipCountry: assessment.intel.country,
        ipRegion: assessment.intel.region,
        asn: assessment.intel.asn,
        asnOrg: assessment.intel.asnOrg,
        isVpn: assessment.intel.isVpn,
        isProxy: assessment.intel.isProxy,
        isTor: assessment.intel.isTor,
        isDatacenter: assessment.intel.isDatacenter,
        isRelay: assessment.intel.isRelay,
        isDisposableEmail: assessment.isDisposableEmail,
        riskScore: assessment.score,
        riskFlags: assessment.flags,
        decision: assessment.decision,
        reason: assessment.reason,
        collidedWithId: assessment.collidedWithId,
      },
      select: { id: true },
    });
    claimId = row.id;
  } catch (error) {
    console.error("[trial-guard] failed to record trial claim", error);
  }

  return { ...assessment, claimId };
}

/**
 * Attach the Lemon Squeezy ids once checkout has actually been created.
 *
 * Without this the table can say a trial was allowed but not whether it was ever
 * taken up, which is the difference between "we granted 400 trials" and "400
 * people started paying $1".
 */
export async function attachTrialCheckout(
  claimId: string | null,
  ids: { lsCustomerId?: string | null; lsSubscriptionId?: string | null }
): Promise<void> {
  if (!claimId) return;
  try {
    await prisma.trialClaim.update({
      where: { id: claimId },
      data: {
        lsCustomerId: ids.lsCustomerId ?? undefined,
        lsSubscriptionId: ids.lsSubscriptionId ?? undefined,
      },
    });
  } catch (error) {
    console.error("[trial-guard] failed to attach checkout ids", error);
  }
}

/**
 * Has this account already had a trial?
 *
 * The cheap check, for a UI that needs to decide whether to show the trial button
 * at all. It is not a substitute for `evaluateTrial` at the point of purchase —
 * this only knows about the account, which is the one signal the person can change
 * for free.
 */
export async function hasUsedTrial(userId: string): Promise<boolean> {
  const existing = await prisma.trialClaim.findFirst({
    where: { userId, decision: { in: [...GRANTED] } },
    select: { id: true },
  });
  return existing !== null;
}

/** Read the client's trial signals off a request. */
export function readTrialSignals(req: Request): { ip: string | null; fingerprint: string | null } {
  return {
    ip: readClientIp(req.headers),
    // Sent by the client as a header so it survives a GET and an embedded
    // checkout. Absent is normal and scored, never fatal.
    fingerprint: req.headers.get("x-postloom-fp")?.trim() || null,
  };
}
