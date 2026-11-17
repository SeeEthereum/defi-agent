/**
 * Sentry options shared by the browser and the server.
 *
 * Off unless NEXT_PUBLIC_SENTRY_DSN is set (a DSN is meant to be public: it
 * only lets someone send events to the project). Privacy by default: nothing
 * collected beyond the error (see dataCollection below), no session replay,
 * and every event and breadcrumb is scrubbed (lib/monitoring/scrub) before it
 * leaves.
 * Performance tracing is off unless SENTRY_TRACES_SAMPLE_RATE says otherwise,
 * to keep the free plan's quota for errors.
 */

import type { BrowserOptions, NodeOptions } from "@sentry/nextjs";
import { scrubDeep, scrubEvent } from "./scrub";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

function tracesSampleRate(): number {
  const raw = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0;
}

export function sentryOptions(): BrowserOptions & NodeOptions {
  return {
    dsn: SENTRY_DSN,
    enabled: Boolean(SENTRY_DSN),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    // Sentry 11 collects a lot by default (cookies, headers, bodies, query
    // strings, local variables, and the prompts and answers of AI SDK calls,
    // i.e. people's questions with their balances). All of it is off here:
    // an error report needs the error, its stack and the route, nothing else.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: tracesSampleRate(),
    beforeSend: (event) => scrubEvent(event),
    // Sentry 11 streams spans (traceLifecycle "stream"), so spans, not
    // transactions, are the unit to scrub if tracing is ever turned on.
    beforeSendSpan: (span) => scrubDeep(span),
    beforeBreadcrumb: (breadcrumb) => scrubEvent(breadcrumb),
  };
}
