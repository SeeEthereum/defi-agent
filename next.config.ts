import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  images: {
    // Landing photos: 60 for the hero (it sits under a fade), 70 for the
    // custody photo, 75 is Next's default for everything else.
    qualities: [60, 70, 75],
  },
  env: {
    // Tags Sentry events with the deployed commit (Render sets it at build).
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.RENDER_GIT_COMMIT ?? "",
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
