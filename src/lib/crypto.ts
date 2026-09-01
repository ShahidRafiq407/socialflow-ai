import crypto from "crypto";

/**
 * Small AES-256-GCM helper for credentials we must store but never expose
 * (currently the WordPress application password).
 *
 * Set APP_ENCRYPTION_KEY to a 32-byte secret (hex, base64 or plain text — it is
 * hashed to 32 bytes). When it is missing we refuse to encrypt rather than
 * silently writing plaintext, and callers surface that to the user.
 */

const ENC_PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) return null;
  // Hash whatever the user provided down to a stable 32-byte key
  return crypto.createHash("sha256").update(raw.trim()).digest();
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypts a secret. Returns null when no key is configured so the caller can
 * tell the user to set APP_ENCRYPTION_KEY instead of storing it in the clear.
 */
export function encryptSecret(plain: string): string | null {
  const key = getKey();
  if (!key) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

/**
 * Decrypts a value produced by encryptSecret. Values stored before a key was
 * configured are returned unchanged so existing rows keep working.
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!isEncrypted(stored)) return stored;

  const key = getKey();
  if (!key) return "";

  try {
    const [ivPart, tagPart, dataPart] = stored.slice(ENC_PREFIX.length).split(".");
    if (!ivPart || !tagPart || !dataPart) return "";

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * One-way hash used to flag repeat clicks without ever storing an IP address.
 */
export function hashIdentifier(value: string): string {
  const salt = process.env.APP_ENCRYPTION_KEY || "socialflow";
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}
