/**
 * Server-side monitoring (Next.js instrumentation hook).
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
}

export const onRequestError = Sentry.captureRequestError;
