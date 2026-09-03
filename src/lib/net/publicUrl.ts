// ============================================================================
// PUBLIC URL GUARD — RESOLVED
//
// assertPublicHttpUrl (src/lib/cms/types.ts) pattern-matches the hostname and
// so stops the obvious literal private addresses. It cannot stop a hostname
// that only *resolves* inside: numeric/octal IPv4 spellings, IPv4-mapped IPv6,
// or a DNS name that points at a private range. This module resolves the host
// the way the fetch that follows will, and rejects any private result.
//
// Server-only: imports node:dns. Never import from a client component.
// ============================================================================

import { lookup } from "node:dns/promises";

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed — refuse rather than guess
  }
  const [a, b] = parts as [number, number];
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  );
}

function isPrivateIPv6(ip: string): boolean {
  const raw = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (raw === "::" || raw === "::1") return true;
  // IPv4-mapped: ::ffff:a.b.c.d is just the IPv4 address in disguise.
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const firstGroup = raw.split(":")[0] || "";
  if (/^f[cd]/.test(firstGroup)) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(firstGroup)) return true; // link-local fe80::/10
  return false;
}

export function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * Resolves a URL's hostname and throws when any resolved address is private or
 * loopback. Call this immediately before the fetch it guards, on a URL that has
 * already passed the sync literal checks.
 *
 * Resolution-then-fetch still races a determined rebinder (the fetch re-resolves
 * on its own); this closes every practical bypass — numeric spellings, mapped
 * IPv6, and hostnames with private records — which is the bar a user-supplied
 * URL has to clear before our server talks to it.
 */
export async function assertResolvesPublicly(url: URL, field = "URL"): Promise<URL> {
  const hostname = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`${field}'s host could not be resolved.`);
  }
  if (addresses.length === 0) {
    throw new Error(`${field}'s host could not be resolved.`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`${field} must be a public address, not a private or local one.`);
    }
  }
  return url;
}
