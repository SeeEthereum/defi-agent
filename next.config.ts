import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Landing photos: 60 for the hero (it sits under a fade), 70 for the
    // custody photo, 75 is Next's default for everything else.
    qualities: [60, 70, 75],
  },
  experimental: {
    // Render restores .next/cache between deploys, and a warm Turbopack
    // build cache once shipped the previous global stylesheet with new
    // pages. Production builds start cold; `next dev` keeps its own cache.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
