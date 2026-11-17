"use client";

/**
 * Links and navigation that stay in the page's language. Pages keep writing
 * app paths without a language ("/swap", "/wallet?tab=receive"); these add
 * it ("/it/swap"). External links pass through untouched.
 */

import NextLink from "next/link";
import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";
import { useCallback, useMemo, type ComponentProps } from "react";
import { localizedPath, stripLocale, type Locale } from "./config";
import { useLocale } from "./client";

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & { href: string };

/** next/link with the language added to app paths. */
export function Link({ href, ...props }: LinkProps) {
  const locale = useLocale();
  return <NextLink href={localizedPath(locale, href)} {...props} />;
}

/** (path) → the same path in the page's language: for window.location and the like. */
export function useLocalizedPath(): (href: string) => string {
  const locale = useLocale();
  return useCallback((href: string) => localizedPath(locale, href), [locale]);
}

/** next/navigation's router, with push, replace and prefetch kept in the page's language. */
export function useRouter() {
  const router = useNextRouter();
  const locale = useLocale();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(localizedPath(locale, href), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(localizedPath(locale, href), options),
      prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(localizedPath(locale, href), options),
    }),
    [router, locale]
  );
}

/** The current path without its language ("/it/swap" → "/swap"), for active states. */
export function usePathname(): string {
  return stripLocale(useNextPathname() ?? "/");
}

/** The current page in another language, query and hash kept. */
export function pathInLocale(locale: Locale, pathname: string, search = "", hash = ""): string {
  return localizedPath(locale, `${stripLocale(pathname)}${search}${hash}`);
}
