"use client";

/**
 * The language in the browser: the provider the root layout mounts with the
 * page's language and its dictionary, and the hooks pages use.
 *
 *   const t = useT("swap");          t("notEnough", { symbol: "ETH" })
 *   t.node("note", { link: (s) => <Link href="/auth">{s}</Link> })
 *   const f = useFormat();           f.usd(12.3) → "$12.30" / "12,30 $"
 */

import { Fragment, createContext, use, useMemo, type ReactNode } from "react";
import { formatAmount, formatCompactUsd, formatNumber, formatPercent, formatPrice, formatUsd } from "@/lib/format";
import { INTL_LOCALE, type Locale } from "./config";
import { createTranslator, type At, type MessageTree, type Namespaces, type Paths, type Translator, type Vars } from "./translate";
import type { Messages } from "./messages/en";

interface I18nValue {
  locale: Locale;
  messages: MessageTree;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: MessageTree; children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

function useI18n(): I18nValue {
  const value = use(I18nContext);
  if (!value) throw new Error("useT/useLocale outside I18nProvider");
  return value;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

export type ClientTranslator<K extends string> = Translator<K> & {
  /** rich() as React nodes, ready to render. */
  node(key: K, tags: Record<string, (text: string) => ReactNode>, vars?: Vars): ReactNode;
};

/** A translator for one namespace of the dictionary ("swap", "shell.menu"…). */
export function useT<N extends Namespaces<Messages>>(namespace: N): ClientTranslator<Paths<At<Messages, N>>> {
  const { locale, messages } = useI18n();
  return useMemo(() => {
    // Built untyped, typed at the return: the generic key type is too deep
    // for TypeScript to carry through createTranslator here.
    const t = createTranslator<string>(messages, locale, namespace) as ClientTranslator<string>;
    t.node = (key, tags, vars) => t.rich<ReactNode>(key, tags, vars).map((part, i) => <Fragment key={i}>{part}</Fragment>);
    return t as unknown as ClientTranslator<Paths<At<Messages, N>>>;
  }, [locale, messages, namespace]);
}

export interface Formatters {
  locale: Locale;
  /** BCP 47 tag for Intl ("it-IT"). */
  intl: string;
  usd: (value: Parameters<typeof formatUsd>[0], opts?: { sign?: boolean }) => string;
  compactUsd: (value: Parameters<typeof formatCompactUsd>[0]) => string;
  price: (value: Parameters<typeof formatPrice>[0]) => string;
  amount: (value: Parameters<typeof formatAmount>[0], opts?: { decimals?: number }) => string;
  percent: (value: Parameters<typeof formatPercent>[0], opts?: { sign?: boolean; decimals?: number }) => string;
  number: (value: Parameters<typeof formatNumber>[0], opts?: { decimals?: number }) => string;
  /** A date or time with Intl options, in the page's language. */
  date: (value: number | Date, options: Intl.DateTimeFormatOptions) => string;
}

export function formattersFor(locale: Locale): Formatters {
  const intl = INTL_LOCALE[locale];
  const dateFormats = new Map<string, Intl.DateTimeFormat>();
  return {
    locale,
    intl,
    usd: (value, opts) => formatUsd(value, { ...opts, locale }),
    compactUsd: (value) => formatCompactUsd(value, locale),
    price: (value) => formatPrice(value, locale),
    amount: (value, opts) => formatAmount(value, { ...opts, locale }),
    percent: (value, opts) => formatPercent(value, { ...opts, locale }),
    number: (value, opts) => formatNumber(value, { ...opts, locale }),
    date: (value, options) => {
      const key = JSON.stringify(options);
      let format = dateFormats.get(key);
      if (!format) {
        format = new Intl.DateTimeFormat(intl, options);
        dateFormats.set(key, format);
      }
      return format.format(value);
    },
  };
}

/** Number and date formatting bound to the page's language. */
export function useFormat(): Formatters {
  const locale = useLocale();
  return useMemo(() => formattersFor(locale), [locale]);
}
