/**
 * Send an API error to Sentry, if it is worth knowing about.
 *
 * Routes catch their errors and answer with a JSON message, so Next.js never
 * sees them as failures: this is where they reach Sentry. Errors a user
 * causes or expects (signed out, not enough funds, a region block, slippage)
 * stay out. The same error from the same route is sent at most once a minute
 * per server process, so a broken upstream (e.g. the market-data quota) shows
 * up as one issue instead of eating the plan's monthly allowance.
 */

import * as Sentry from "@sentry/nextjs";

const EXPECTED = [/not logged in/i, /not available in your region/i, /insufficient/i, /slippage/i, /no active session/i];

const THROTTLE_MS = 60_000;
const lastSent = new Map<string, number>();

/** Digits and hex runs vary between occurrences of one error; group without them. */
function errorKey(scope: string, message: string): string {
  return `${scope}|${message.replace(/0x[0-9a-f]+/gi, "0x").replace(/\d+/g, "#").slice(0, 200)}`;
}

export function reportServerError(scope: string, error: unknown): void {
  if (!Sentry.isInitialized()) return;
  const message = error instanceof Error ? error.message : String(error);
  if (EXPECTED.some((re) => re.test(message))) return;

  const key = errorKey(scope, message);
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < THROTTLE_MS) return;
  lastSent.set(key, now);
  if (lastSent.size > 500) lastSent.delete(lastSent.keys().next().value as string);

  Sentry.withScope((scope_) => {
    scope_.setTag("api_scope", scope);
    Sentry.captureException(error instanceof Error ? error : new Error(message));
  });
}
