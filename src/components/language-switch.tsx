"use client";

import { usePathname } from "next/navigation";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { pathInLocale } from "@/i18n/navigation";

const SHORT: Record<Locale, string> = { en: "EN", it: "IT" };

/**
 * English / Italiano, as a two-option pill group like the theme switch.
 * Choosing loads the same page in the other language (a full load, so
 * every message, including the server's, comes back in it); the proxy
 * remembers the choice for the next visit.
 */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname() ?? "/";
  const t = useT("language");

  const go = (next: Locale) => {
    if (next === locale) return;
    window.location.assign(pathInLocale(next, pathname, window.location.search, window.location.hash));
  };

  return (
    <div role="radiogroup" aria-label={t("label")} className={`theme-switch lang-switch ${className}`}>
      {LOCALES.map((l) => {
        const checked = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={LOCALE_NAMES[l]}
            lang={l}
            title={LOCALE_NAMES[l]}
            tabIndex={checked ? 0 : -1}
            data-locale={l}
            onClick={() => go(l)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = LOCALES.indexOf(locale);
              go(LOCALES[(i + (e.key === "ArrowRight" ? 1 : LOCALES.length - 1)) % LOCALES.length]);
            }}
          >
            {SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
