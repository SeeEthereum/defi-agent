/**
 * Server start-up (Next.js instrumentation hook): monitoring, sealing any
 * session keyring identity left in the clear, and the idle sign-out sweep
 * on the Node.js server.
 *
 * Starts Sentry on the Node.js server when NEXT_PUBLIC_SENTRY_DSN is set
 * (options and scrubbing in lib/monitoring). `onRequestError` reports errors
 * Next.js itself catches: Server Components, route handlers that throw, the
 * proxy. Errors a route catches and answers itself go through
 * lib/monitoring/report instead.
 */

import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions());
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // No onchainos call runs yet: seal identities from older versions or
    // from a call cut short by a crash (lib/session/keyring-seal).
    const [{ sealAllSessions }, { sessionsRoot }] = await Promise.all([
      import("@/lib/session/keyring-seal"),
      import("@/lib/session/session"),
    ]);
    sealAllSessions(sessionsRoot());
    // Signs out sessions idle for 30 minutes (lib/session/activity).
    const { startIdleSweeper } = await import("@/lib/session/idle-sweeper");
    startIdleSweeper();
  }
}

export const onRequestError = Sentry.captureRequestError;
