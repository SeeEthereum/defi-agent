import type { MetadataRoute } from "next";

// Public pages only: everything else needs a signed-in wallet.
const SITE = (process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/welcome`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/auth`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
