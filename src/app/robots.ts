import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";

// Crawlers may read the public pages (landing, sign-in, in every language)
// and the share images. The app itself needs a signed-in wallet, and the
// API is not for indexing.
const SITE = (process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const APP_PAGES = ["/ai", "/wallet", "/swap", "/bridge", "/earn", "/trade", "/signals", "/security"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...LOCALES.flatMap((l) => APP_PAGES.map((p) => `/${l}${p}`)), ...APP_PAGES],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
