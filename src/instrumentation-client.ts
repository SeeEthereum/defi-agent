/**
 * Browser-side monitoring. Runs before the app becomes interactive.
 *
 * Off unless NEXT_PUBLIC_SENTRY_DSN was set at build time: the value is
 * inlined, so without it the import below is dead code and pages ship no
 * Sentry bytes. With it, the SDK loads in its own chunk after start-up, so
 * the landing's first paint does not wait for it. Same privacy options as
 * the server (lib/monitoring/sentry-options): no replay, no PII, every event
 * scrubbed of addresses, hashes, emails and tokens.
 */

import { SENTRY_DSN, sentryOptions } from "@/lib/monitoring/sentry-options";

type NavigationType = "push" | "replace" | "traverse";
let captureTransition: ((href: string, navigationType: NavigationType) => void) | undefined;

if (SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init(sentryOptions());
    captureTransition = Sentry.captureRouterTransitionStart;
  });
}

export function onRouterTransitionStart(href: string, navigationType: NavigationType) {
  captureTransition?.(href, navigationType);
}
