/**
 * Signed session cookie.
 *
 * Every browser gets its own random session id (256 bits). The cookie value
 * is `<sid>.<hmac>` so the server never creates a keystore directory for a
 * forged or guessed id. Web Crypto only, so this module runs both in
 * src/proxy.ts and in route handlers.
 */

export const SESSION_COOKIE = "albicocca_sid";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** base64url of 32 random bytes. */
export const SID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const DEV_SECRET = "albicocca-dev-only-session-secret-do-not-use-in-prod";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (at least 32 characters) in production");
  }
  return DEV_SECRET;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(sid: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sid));
  return toBase64Url(new Uint8Array(mac));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a new `<sid>.<hmac>` cookie value. */
export async function mintSessionToken(): Promise<string> {
  const sid = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return `${sid}.${await sign(sid)}`;
}

/** Return the session id if the cookie value is well-formed and signed by us. */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const sid = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!SID_PATTERN.test(sid)) return null;
  return constantTimeEqual(mac, await sign(sid)) ? sid : null;
}
