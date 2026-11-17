import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// ── Security headers ─────────────────────────────────────────────────────────
//
// Kept in this file, with no imports from src/, because Node loads
// next.config.ts with its own TypeScript loader (relative .ts imports would
// need extensions). src/next-config.test.ts checks the result against the
// app (every RPC in lib/chains must be allowed, no `*` sources).

/**
 * Hosts the browser itself calls. Everything else (OKX, LI.FI, Hyperliquid,
 * NEAR Intents, OpenAI) goes through the app's own /api routes. These are the
 * public RPCs the swap, earn and assistant pages poll for a transaction
 * receipt (lib/chains rpcUrl, plus the copies in swap/page and earn/page).
 */
export const BROWSER_RPC_ORIGINS = [
  "https://ethereum-rpc.publicnode.com",
  "https://arb1.arbitrum.io",
  "https://mainnet.base.org",
  "https://bsc-dataseed.binance.org",
  "https://polygon-bor-rpc.publicnode.com",
  "https://mainnet.optimism.io",
] as const;

/**
 * Origin the browser SDK posts events to, from the public DSN
 * (https://<key>@o123.ingest.<region>.sentry.io/<project>). There is no
 * tunnel route, so this is the only Sentry host. Null when unset or invalid:
 * the browser SDK is then not loaded at all (instrumentation-client).
 */
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export interface SecurityHeaderOptions {
  /** `next dev`: React needs eval for its debugging stacks, HMR needs a websocket. */
  dev: boolean;
  /** Production build: adds HSTS (Render and Cloudflare serve HTTPS only). */
  production: boolean;
  sentryDsn?: string;
}

/**
 * Content-Security-Policy.
 *
 * Scripts: 'self' 'unsafe-inline', no nonce. Next.js 16's guide offers two
 * ways for the App Router: a per-request nonce set in the proxy, which makes
 * every page dynamically rendered (no static landing, no CDN caching, more
 * work per view on a free instance) and needs layout.tsx to pass the nonce
 * to its own inline theme script; or a static header with 'unsafe-inline'
 * ("Without Nonces"). This app uses the second. Plainly: an injected inline
 * <script> would run. What the policy still guarantees is that no script
 * loads from another host, nothing can call home except the listed hosts
 * (connect-src), no plugin or <base> hijack, no form posts elsewhere, and
 * the app cannot be framed. Moving to nonces later means: generate the nonce
 * in src/proxy.ts, add 'nonce-…' 'strict-dynamic' here instead of
 * 'unsafe-inline', and opt pages into dynamic rendering.
 * No hash for the theme script: a hash would make browsers ignore
 * 'unsafe-inline' and block Next's own inline bootstrap.
 *
 * Styles need 'unsafe-inline' too (style attributes from React, motion and
 * sonner). Images come from arbitrary token-logo hosts (CoinGecko, OKX CDNs,
 * LI.FI logoURIs on GitHub, Hyperliquid), so img-src allows any https host.
 * Fonts are self-hosted by next/font/local.
 * No upgrade-insecure-requests: it would break `next start` over plain
 * http://localhost, and on the HTTPS site browsers already upgrade mixed
 * image URLs before img-src is checked.
 */
export function contentSecurityPolicy({ dev, sentryDsn }: SecurityHeaderOptions): string {
  const sentry = sentryIngestOrigin(sentryDsn);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      ...BROWSER_RPC_ORIGINS,
      ...(sentry ? [sentry] : []),
      // Older Safari does not count same-origin websockets as 'self'.
      ...(dev ? ["ws:", "wss:"] : []),
    ],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // frame-ancestors covers modern browsers; this covers the rest.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    // Two years, subdomains included; no `preload` (that is a submission to
    // the browsers' list, not a header to turn on in passing).
    ...(options.production
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
      : []),
  ];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Landing photos: 60 for the hero (it sits under a fade), 70 for the
    // custody photo, 75 is Next's default for everything else.
    qualities: [60, 70, 75],
  },
  env: {
    // Tags Sentry events with the deployed commit (Render sets it at build).
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.RENDER_GIT_COMMIT ?? "",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          dev: process.env.NODE_ENV === "development",
          production: process.env.NODE_ENV === "production",
          // Read at build time, like the browser SDK's own copy of the DSN.
          sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        }),
      },
      {
        // The service worker (public/sw.js): never from a cache, so a fix
        // reaches every installed app on its next page load.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  turbopack: {
    // Turbopack's own debug IDs (Next 16.4) add their snippet at the top of
    // each server chunk but offset the source map by one line too few, so
    // Sentry could not map a single server frame ("Invalid location in
    // sourcemap"). With them off, @sentry/nextjs injects its own debug IDs
    // after the build and shifts the maps to match.
    debugIds: false,
  },
  experimental: {
    // Render restores .next/cache between deploys, and a warm Turbopack
    // build cache once shipped the previous global stylesheet with new
    // pages. Production builds start cold; `next dev` keeps its own cache.
    turbopackFileSystemCacheForBuild: false,
  },
};

// Source maps go to Sentry only when the build has an auth token (plus
// SENTRY_ORG and SENTRY_PROJECT); without one the config is left untouched.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      telemetry: false,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;
