// ============================================================================
// A BROWSER SIGNATURE FOR THE TRIAL GUARD
//
// Not a tracking fingerprint and not trying to be one: no canvas, no fonts, no
// audio, nothing that survives a profile change. It is a coarse device signature —
// screen, timezone, language, platform — hashed so the raw values never leave the
// page, and it exists for one purpose: noticing the same browser claiming a second
// $1 trial under a different email.
//
// The server treats it as a soft signal precisely because it is weak. Two colleagues
// on identical laptops can collide, so on its own it flags rather than refuses; and
// a missing value is fine, which is why every branch here returns something rather
// than throwing.
// ============================================================================

const HEX = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Fallback when SubtleCrypto is unavailable (any non-secure origin). */
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function signals(): string {
  if (typeof window === "undefined") return "server";
  const nav = window.navigator;
  const screen = window.screen;
  return [
    screen?.width ?? 0,
    screen?.height ?? 0,
    screen?.colorDepth ?? 0,
    window.devicePixelRatio ?? 1,
    new Date().getTimezoneOffset(),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    nav?.language ?? "",
    (nav?.languages ?? []).join(","),
    nav?.platform ?? "",
    nav?.hardwareConcurrency ?? 0,
    (nav as Navigator & { deviceMemory?: number })?.deviceMemory ?? 0,
    nav?.maxTouchPoints ?? 0,
  ].join("|");
}

/**
 * Returns a 32-hex-character signature, or an empty string if even the fallback
 * fails. An empty string is a valid answer — the checkout route treats a missing
 * fingerprint as one fewer signal, not as a reason to refuse the trial.
 */
export async function browserFingerprint(): Promise<string> {
  const raw = signals();
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest("SHA-256", new TextEncoder().encode(raw));
      return HEX(new Uint8Array(digest)).slice(0, 32);
    }
    return djb2(raw).repeat(4).slice(0, 32);
  } catch {
    return "";
  }
}
