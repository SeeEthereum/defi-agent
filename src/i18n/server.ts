/**
 * The language on the server: dictionaries, and the language of a request.
 *
 * Server Components read their language from the URL (next/root-params,
 * `lang`). Route handlers cannot (root params are not available there yet,
 * per the Next.js 16 docs), so they read the cookie the app keeps with the
 * last language used, then the browser's Accept-Language.
 */

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, negotiateLocale, type Locale } from "./config";
import { en, type Messages } from "./messages/en";
import { it } from "./messages/it";
import { createTranslator, type At, type MessageTree, type Namespaces, type Paths, type Translator } from "./translate";

const DICTIONARIES: Record<Locale, Messages> = { en, it };

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}

/** A translator for one namespace, outside React (server code, route handlers). */
export function translator<N extends Namespaces<Messages>>(locale: Locale, namespace: N): Translator<Paths<At<Messages, N>>> {
  return createTranslator<Paths<At<Messages, N>>>(DICTIONARIES[locale] as unknown as MessageTree, locale, namespace);
}

/** What the browser gets: the dictionary without the API's own messages. */
export function clientMessages(locale: Locale): MessageTree {
  const { ...all } = DICTIONARIES[locale] as unknown as MessageTree;
  delete all.api;
  return all;
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** The language of an API request: the app's cookie, else the browser's, else English. */
export function localeFromRequest(request: Request): Locale {
  const fromCookie = cookieValue(request.headers.get("cookie"), LOCALE_COOKIE);
  if (isLocale(fromCookie)) return fromCookie;
  return negotiateLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}
