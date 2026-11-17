/**
 * Remove personal and secret values from anything sent to Sentry.
 *
 * Errors here often carry what the CLI printed: wallet addresses, tx hashes,
 * the session directory (whose name is the session id), sometimes an email.
 * Every string in an event or breadcrumb goes through these patterns before
 * it leaves the server or the browser. Order matters: the longer hex value
 * (a hash) must be replaced before the shorter one (an address) can match it.
 */

const PATTERNS: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]"],
  [/\b0x[a-fA-F0-9]{64}\b/g, "[hash]"],
  [/\b0x[a-fA-F0-9]{40}\b/g, "[address]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/sessions\/[A-Za-z0-9_-]+/g, "sessions/[sid]"],
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[token]"],
];

export function scrubString(value: string): string {
  let out = value;
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

/**
 * Top-level event fields the SDK fills with build metadata, never with user
 * data. `release` is the deployed commit SHA: 40 hex characters that the
 * long-token pattern would otherwise turn into "[token]".
 */
const KEEP = ["release", "dist", "environment"] as const;

/** Scrub a Sentry event or breadcrumb, keeping its build metadata intact. */
export function scrubEvent<T extends object>(event: T): T {
  const out = scrubDeep(event) as Record<string, unknown>;
  for (const key of KEEP) {
    if (key in event) out[key] = (event as Record<string, unknown>)[key];
  }
  return out as T;
}

/** Deep copy of `value` with every string scrubbed. Cycles are cut. */
export function scrubDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return scrubString(value) as T;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[cycle]" as T;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, seen)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) out[key] = scrubDeep(v, seen);
  return out as T;
}
