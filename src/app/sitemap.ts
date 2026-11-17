import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";

// Public pages only, in every language, each pointing at its translations
// (hreflang). Everything else needs a signed-in wallet.
const SITE = (process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PAGES: Array<{ path: string; changeFrequency: "weekly" | "monthly"; priority: number }> = [
  { path: "/welcome", changeFrequency: "weekly", priority: 1 },
  { path: "/auth", changeFrequency: "monthly", priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap(({ path, changeFrequency, priority }) =>
    LOCALES.map((locale) => ({
      url: `${SITE}/${locale}${path}`,
      changeFrequency,
      priority,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE}/${l}${path}`])) },
    }))
  );
}
