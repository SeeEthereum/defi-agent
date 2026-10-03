import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Landing photos: 60 for the hero (it sits under a fade), 70 for the
    // custody photo, 75 is Next's default for everything else.
    qualities: [60, 70, 75],
  },
};

export default nextConfig;
