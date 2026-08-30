import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/** Server-only helpers. Never import this module from client-reachable code. */

function encKey(): Buffer {
  const raw = process.env["GOOGLE_TOKEN_ENC_KEY"];
  if (!raw) throw new Error("GOOGLE_TOKEN_ENC_KEY is not set");
  // Normalise any secret string into a 32-byte AES key.
  return createHash("sha256").update(raw).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function stateSecret(): string {
  const raw = process.env["GOOGLE_OAUTH_STATE_SECRET"];
  if (!raw) throw new Error("GOOGLE_OAUTH_STATE_SECRET is not set");
  return raw;
}

/** HMAC-signed, expiring payload. Used for CSRF state and short-lived proxy links. */
export function signPayload(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }));
  const sig = b64url(createHmac("sha256", stateSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyPayload<T = Record<string, unknown>>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", stateSecret()).update(body).digest());
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i += 1) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const parsed = JSON.parse(fromB64url(body).toString("utf8")) as { exp?: number };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function randomNonce(): string {
  return randomBytes(16).toString("hex");
}
