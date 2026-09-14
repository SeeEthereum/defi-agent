import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Single-operator access gate.
 *
 * This app drives ONE shared wallet: every visitor who can reach the
 * deployment acts as its owner and can move real funds (wallet/send,
 * swap/execute, bridge/execute, perp/*, earn/*, security/revoke). There is
 * no per-user identity to authenticate, so the gate is deliberately a
 * single shared password rather than a user system — adding accounts would
 * imply an isolation that does not exist.
 *
 * The password is never stored in a cookie. On success we hand out a
 * session token that is just an expiry stamped with an HMAC, so the server
 * can verify it without keeping state (Render's free plan restarts freely,
 * and the proxy is explicitly documented as not being able to rely on
 * shared module state).
 *
 * The signing key is derived from the password itself, so there is exactly
 * one secret to configure. Rotating the password therefore invalidates
 * every outstanding session, which is the behaviour you want from a
 * password change.
 */

const COOKIE_NAME = "defi_gate";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Domain separation for the derived key — keeps this HMAC from colliding
// with any other use of the same password.
const KEY_INFO = "defi-agent:app-gate:v1";

export { COOKIE_NAME, SESSION_TTL_MS };

function appPassword(): string | undefined {
  const raw = process.env.APP_PASSWORD;
  return raw && raw.length > 0 ? raw : undefined;
}

/** Whether a gate password is configured at all. */
export function isGateConfigured(): boolean {
  return appPassword() !== undefined;
}

/**
 * In production the gate is mandatory: if APP_PASSWORD is missing we fail
 * closed rather than silently serving an open wallet. Locally it is
 * optional so `npm run dev` needs no setup.
 */
export function isGateRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

function signingKey(password: string): Buffer {
  return createHmac("sha256", KEY_INFO).update(password).digest();
}

/** Constant-time compare over fixed-length digests (no length leak). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function verifyPassword(candidate: string): boolean {
  const password = appPassword();
  if (!password) return false;
  return safeEqual(candidate, password);
}

/** Build a signed session token valid for SESSION_TTL_MS. */
export function createSessionToken(now = Date.now()): string | null {
  const password = appPassword();
  if (!password) return null;
  const expiresAt = String(now + SESSION_TTL_MS);
  const mac = createHmac("sha256", signingKey(password))
    .update(expiresAt)
    .digest("base64url");
  return `${expiresAt}.${mac}`;
}

/**
 * Validate a session token: correct signature AND not expired. Returns
 * false for anything malformed — never throws, since it runs on
 * attacker-controlled input.
 */
export function verifySessionToken(
  token: string | undefined,
  now = Date.now()
): boolean {
  const password = appPassword();
  if (!password || !token) return false;

  const sep = token.indexOf(".");
  if (sep <= 0) return false;

  const expiresAt = token.slice(0, sep);
  const mac = token.slice(sep + 1);
  if (!/^\d+$/.test(expiresAt) || mac.length === 0) return false;

  const expected = createHmac("sha256", signingKey(password))
    .update(expiresAt)
    .digest("base64url");
  if (!safeEqual(mac, expected)) return false;

  return Number(expiresAt) > now;
}
