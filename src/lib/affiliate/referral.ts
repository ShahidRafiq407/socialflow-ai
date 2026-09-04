// ============================================================================
// AFFILIATE — ATTRIBUTION AND THE FRAUD WALL
//
// Three questions live here:
//
//   "Who brought this signup?"  — the ref cookie, dropped by middleware when a
//                                 visitor arrives with ?ref=CODE, read exactly
//                                 once, when the person's User row is born.
//   "May they be credited?"     — the fraud wall. Strict by design: a signup
//                                 through a VPN, proxy, Tor, a relay or a
//                                 datacenter IP is refused, as is a disposable
//                                 email, a self-referral, or a network/device
//                                 that matches the referrer's own. The referrer
//                                 earns from real people on real connections.
//   "When is it money?"         — never in this file. Conversion happens in the
//                                 billing webhook; the lock, the payout and the
//                                 credit conversion live elsewhere.
//
// What is stored about an attempt is deliberately narrow: salted hashes of the
// IP and of a coarse device string, the network verdict, and the score. No raw
// IP, no email, no fingerprint — the same posture as the trial guard, whose
// hashing this shares so an IP recognised there is recognised here.
// ============================================================================

import { cookies, headers } from "next/headers";
import prisma from "@/lib/db";
import {
  isDisposableDomain,
  lookupIpIntel,
  normaliseEmail,
  readClientIp,
  signalHash,
} from "@/lib/billing/trial-guard";
import { AFFILIATE, commissionFor } from "@/lib/affiliate/config";

// ─────────────────────────────────────────────────────────────────────────────
// The referral code
// ─────────────────────────────────────────────────────────────────────────────

// No 0/O/1/I: a code someone reads aloud over a call must be unambiguous.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateCode(): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * The user's affiliate code, created on first use. Existing users have no code
 * until they open the Affiliate tab, so nothing is backfilled and a code is
 * never generated for someone who never asked for one.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const row = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: generateCode() },
        select: { referralCode: true },
      });
      return row.referralCode!;
    } catch (err) {
      // P2002 = the roll produced a code already taken. Astronomically rare,
      // but the retry is free.
      if ((err as { code?: string })?.code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate a referral code");
}

// ─────────────────────────────────────────────────────────────────────────────
// The fraud wall
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every signal's weight. Each of the anonymised-network signals blocks on its
 * own: the program's deal is a referral from a real person on a real
 * connection, and the operator chose strictness over volume here.
 */
const SIGNAL_WEIGHTS = {
  self_referral: 100,
  email_match: 100,
  tor: 100,
  vpn: 65,
  proxy: 65,
  relay: 65,
  datacenter: 65,
  disposable_email: 60,
  ip_match_referrer: 80,
  ip_repeat: 70,
  device_repeat: 70,
  signup_farm: 80,
} as const;

type SignalKey = keyof typeof SIGNAL_WEIGHTS;

const SIGNAL_REASONS: Record<SignalKey, string> = {
  self_referral: "Your own account cannot be referred by you.",
  email_match: "The referred account has the same email as the referrer.",
  tor: "Signups through Tor are not eligible for referral credit.",
  vpn: "Signups through a VPN are not eligible for referral credit.",
  proxy: "Signups through a proxy are not eligible for referral credit.",
  relay: "Signups through a relay are not eligible for referral credit.",
  datacenter: "Signups from a datacenter IP are not eligible for referral credit.",
  disposable_email: "Signups with a disposable email address are not eligible for referral credit.",
  ip_match_referrer: "The signup came from the same network as the referrer's own account.",
  ip_repeat: "Too many referred signups have come from this network.",
  device_repeat: "A device that already signed up through this link was seen again.",
  signup_farm: "Too many signups from one network have been attributed to this referrer.",
};

/** The coarse device signal available without any client-side script. */
async function readUaHash(): Promise<string | null> {
  const h = await headers();
  const ua = h.get("user-agent") || "";
  if (!ua) return null;
  const lang = h.get("accept-language") || "";
  return signalHash("ua", `${ua}|${lang}`);
}

/**
 * Reads the referral cookie. Called from the moment a User row is born; the
 * answer is written once into a Referral row and the cookie is never consulted
 * again — a code changed mid-session cannot re-attribute a person.
 */
export async function attributeReferral(userId: string): Promise<void> {
  // One attribution per person, decided once, at signup.
  const existing = await prisma.referral.findUnique({
    where: { referredId: userId },
    select: { id: true },
  });
  if (existing) return;

  const store = await cookies();
  const rawCode = store.get(AFFILIATE.cookieName)?.value?.trim().toUpperCase() || "";
  if (!rawCode || !/^[A-Z0-9]{4,24}$/.test(rawCode)) return;

  const referrer = await prisma.user.findUnique({
    where: { referralCode: rawCode },
    select: { id: true, email: true },
  });
  // An unknown code is ignored rather than recorded: there is nothing to
  // attribute and no referrer to protect. Checked before the IP-intelligence
  // call so a dead link costs nothing.
  if (!referrer) return;

  const h = await headers();
  const ip = readClientIp(h);
  const ipHash = ip ? signalHash("ip", ip) : null;
  const uaHash = await readUaHash();

  const referred = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const score: Record<SignalKey, number> = {} as Record<SignalKey, number>;
  const fired: SignalKey[] = [];
  const add = (key: SignalKey) => {
    if (!(key in score)) {
      score[key] = SIGNAL_WEIGHTS[key];
      fired.push(key);
    }
  };

  // ── Self-referral, in both spellings ──────────────────────────────────────
  if (referrer.id === userId) add("self_referral");

  const referrerEmailNorm = normaliseEmail(referrer.email);
  const referredEmailNorm = referred?.email ? normaliseEmail(referred.email) : "";
  if (referredEmailNorm && referrerEmailNorm === referredEmailNorm) {
    add("email_match");
  }

  // ── The network, as the IP-intelligence providers see it ──────────────────
  const intel = await lookupIpIntel(ip).catch(() => null);
  if (intel?.isTor) add("tor");
  if (intel?.isVpn) add("vpn");
  if (intel?.isProxy) add("proxy");
  if (intel?.isRelay) add("relay");
  if (intel?.isDatacenter) add("datacenter");

  // ── Disposable mailbox ─────────────────────────────────────────────────────
  const domain = referredEmailNorm.split("@")[1] || "";
  if (domain && isDisposableDomain(domain)) add("disposable_email");

  // Only the checks that need a real address remain.
  if (ipHash) {
    // The referrer's own signup/trial history: the same network reappearing
    // behind a new account is the single strongest self-dealing signal.
    const referrerClaims = await prisma.trialClaim.findMany({
      where: { userId: referrer.id },
      select: { ipHash: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    if (referrerClaims.some((claim) => claim.ipHash === ipHash)) add("ip_match_referrer");

    // Prior referrals from this referrer on the same network / same device.
    const priorFromIp = await prisma.referral.count({
      where: { referrerId: referrer.id, signupIpHash: ipHash },
    });
    if (priorFromIp > 0) add("ip_repeat");
    if (priorFromIp >= AFFILIATE.maxSignupsPerIp) add("signup_farm");

    if (uaHash) {
      const priorFromDevice = await prisma.referral.count({
        where: { referrerId: referrer.id, signupUaHash: uaHash },
      });
      if (priorFromDevice > 0) add("device_repeat");
    }
  }

  const total = fired.reduce((sum, key) => sum + score[key], 0);

  const blocked = total >= AFFILIATE.blockScore;
  const reason = blocked
    ? SIGNAL_REASONS[fired.find((key) => SIGNAL_WEIGHTS[key] >= AFFILIATE.blockScore) ?? fired[0]]
    : null;

  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      referredId: userId,
      status: blocked ? "REJECTED" : "PENDING",
      rejectReason: reason,
      signupIpHash: ipHash,
      signupUaHash: uaHash,
      ipCountry: intel?.country ?? null,
      asn: intel?.asn ?? null,
      isVpn: intel?.isVpn ?? false,
      isProxy: intel?.isProxy ?? false,
      isTor: intel?.isTor ?? false,
      isDatacenter: intel?.isDatacenter ?? false,
      isRelay: intel?.isRelay ?? false,
      riskScore: Math.min(100, total),
      riskFlags: fired,
    },
  }).catch((err) => {
    // Attribution is bookkeeping; it must never take the signup down with it.
    console.error("[affiliate] attribution failed:", err);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion — called from the billing webhook only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The referred user's FIRST paid plan went live. Idempotent by construction:
 * only a PENDING referral converts, and the row becomes CONVERTED in the same
 * update that could ever match it again.
 *
 * A trial is deliberately not a conversion — the $1 trial is not a paid plan,
 * and crediting it would pay the affiliate for a customer who has not decided
 * anything yet. The caller enforces that; this function trusts the webhook.
 */
export async function markReferralConverted(
  userId: string,
  info: { plan: string; amountCents: number | null }
): Promise<void> {
  const referral = await prisma.referral.findUnique({
    where: { referredId: userId },
    select: { id: true, status: true, referrerId: true },
  });
  if (!referral || referral.status !== "PENDING") return;

  const basis = info.amountCents && info.amountCents > 0 ? info.amountCents : 0;
  const amountCents = commissionFor(basis);

  await prisma.$transaction(async (tx) => {
    const converted = await tx.referral.updateMany({
      where: { id: referral.id, status: "PENDING" },
      data: {
        status: "CONVERTED",
        convertedAt: new Date(),
        planPurchased: info.plan,
        firstPaymentCents: basis,
      },
    });
    if (converted.count === 0) return;

    await tx.commission.create({
      data: {
        referralId: referral.id,
        referrerId: referral.referrerId,
        amountCents,
        basisCents: basis,
        status: "LOCKED",
        unlocksAt: new Date(Date.now() + AFFILIATE.lockDays * 24 * 60 * 60 * 1000),
      },
    });
  }).catch((err) => {
    console.error("[affiliate] conversion failed:", err);
  });
}

/**
 * The qualifying payment was refunded. The commission dies whatever state it is
 * in — locked or available — because the money it was earned from has gone
 * back. Best-effort by design: never fails the webhook that called it.
 */
export async function rejectReferralForRefund(userId: string): Promise<void> {
  const referral = await prisma.referral.findUnique({
    where: { referredId: userId },
    select: { id: true },
  });
  if (!referral) return;

  await prisma.$transaction([
    prisma.referral.updateMany({
      where: { id: referral.id, status: { not: "REJECTED" } },
      data: { status: "REJECTED", rejectReason: "The qualifying payment was refunded." },
    }),
    prisma.commission.updateMany({
      where: { referralId: referral.id, status: { in: ["LOCKED", "AVAILABLE"] } },
      data: { status: "REJECTED", rejectReason: "Payment refunded" },
    }),
  ]).catch((err) => {
    console.error("[affiliate] refund rejection failed:", err);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The lock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flips commissions whose refund window has passed to AVAILABLE. Runs lazily
 * when an affiliate opens their tab and from the billing-maintenance cron, so
 * an unused tab still unlocks on schedule.
 */
export async function unlockMaturedCommissions(userId?: string): Promise<number> {
  const result = await prisma.commission.updateMany({
    where: {
      status: "LOCKED",
      unlocksAt: { lte: new Date() },
      ...(userId ? { referrerId: userId } : {}),
    },
    data: { status: "AVAILABLE" },
  }).catch(() => null);
  return result?.count ?? 0;
}
