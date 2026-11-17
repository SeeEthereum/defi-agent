import type { MetadataRoute } from "next";

// Crawlers may read the public pages (landing, sign-in) and the share images.
// The app itself needs a signed-in wallet, and the API is not for indexing.
const SITE = (process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/ai", "/wallet", "/swap", "/bridge", "/earn", "/trade", "/signals", "/security"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
