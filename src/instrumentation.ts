/**
 * Server start-up (Next.js instrumentation hook): monitoring, and the idle
 * sign-out sweep on the Node.js server.
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
    // Signs out sessions idle for 30 minutes (lib/session/activity).
    const { startIdleSweeper } = await import("@/lib/session/idle-sweeper");
    startIdleSweeper();
  }
}

export const onRequestError = Sentry.captureRequestError;
