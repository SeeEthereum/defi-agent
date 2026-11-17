/**
 * Languages: English and Italian.
 *
 * Every page lives under its language: /en/swap, /it/swap (Next.js's own
 * internationalization guide: app/[lang]). A path without one (an old link,
 * the installed app's start page, a shortcut) is redirected by the proxy to
 * the visitor's language: the one they last used (LOCALE_COOKIE), else the
 * best match in their browser's Accept-Language, else English.
 *
 * Plain module, no Node or React: the proxy, the server and the browser all
 * import it.
 */

export const LOCALES = ["en", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Remembers the last language used. Readable by scripts (the offline page reads it). */
export const LOCALE_COOKIE = "albicocca-lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** BCP 47 tags for Intl (numbers, dates) and <html lang>. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", it: "it-IT" };

/** Each language in its own name, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", it: "Italiano" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best supported language for an Accept-Language header
 * ("it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"), or null when none matches.
 */
export function negotiateLocale(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((r) => r.lang && r.lang !== "*" && r.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return ranked.map((r) => r.lang).find(isLocale) ?? null;
}

/** The language a path starts with (/it/swap → "it"), or null. */
export function localeOfPath(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : null;
}

/** The path without its language: /it/swap → /swap, /it → /. */
export function stripLocale(pathname: string): string {
  const locale = localeOfPath(pathname);
  if (!locale) return pathname;
  const rest = pathname.slice(locale.length + 1);
  return rest === "" ? "/" : rest;
}

/** An app path in a language: ("it", "/swap?x=1") → "/it/swap?x=1"; external links untouched. */
export function localizedPath(locale: Locale, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const path = cut < 0 ? href : href.slice(0, cut);
  const rest = cut < 0 ? "" : href.slice(cut);
  const bare = stripLocale(path);
  return `/${locale}${bare === "/" ? "" : bare}${rest}`;
}

/**
 * Paths that are pages, so they get a language. Not: the API, Next's own
 * files, the metadata routes (robots, sitemap, manifest, icons, share
 * images) and any file name with an extension (sw.js, offline.html).
 */
export function isLocalizablePath(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname === "/api" || pathname.startsWith("/_next/")) return false;
  if (/^\/(opengraph-image|twitter-image|icon|apple-icon)(?:[-/?.]|$)/.test(pathname)) return false;
  const last = pathname.split("/").pop() ?? "";
  return !last.includes(".");
}
