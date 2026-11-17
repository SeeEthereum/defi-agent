/**
 * Numbers as people read them. One place for every price, amount and value
 * in the app, so a page never shows "9.37e-7", "0.00", "NaN" or twelve
 * decimals of dust.
 *
 * - Money: "$1,234.56"; under a cent "< $0.01"; millions "$1.23M".
 * - Prices: two decimals from $1, four significant digits below; very
 *   small prices as "$0.0₆937" (six zeros, then 937), the notation price
 *   sites use, instead of scientific notation.
 * - Amounts: up to four decimals from 1, four significant digits below,
 *   never an exponent.
 * - Missing or broken values: "–".
 *
 * In Italian (`locale: "it"`): comma for decimals, dot for thousands, the
 * dollar sign after the figure, as Italian banking apps write money:
 * "1.234,56 $", "< 0,01 $", "1,23 Mln $", "2 Mld $", "0,0₆937 $", "3,2%".
 * Thousands are always grouped ("1.234", not CLDR's "1234" under 10,000).
 * Pages get these bound to their language from useFormat() (i18n/client).
 */

import type { Locale } from "@/i18n/config";

export const MISSING = "–";

type Num = number | string | null | undefined;

function toNumber(value: Num): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

function subscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
}

/** English separators → the language's: "1,234.56" → "1.234,56" in Italian. */
function separators(text: string, locale: Locale): string {
  if (locale !== "it") return text;
  return text.replace(/[.,]/g, (c) => (c === "." ? "," : "."));
}

/** Plain decimal digits of a small positive number, never an exponent. */
function plainDecimal(n: number, significant: number): string {
  // toFixed accepts up to 100 digits; enough for anything we show.
  const zeros = Math.max(0, -Math.floor(Math.log10(n)) - 1);
  const s = n.toFixed(Math.min(100, zeros + significant));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** 0.000000937 → "0.0₆937" past `maxZeros` leading zeros, else "0.000000937". */
function smallNumber(n: number, significant: number, maxZeros: number): string {
  const zeros = Math.max(0, -Math.floor(Math.log10(n)) - 1);
  if (zeros <= maxZeros) return plainDecimal(n, significant);
  const digits = plainDecimal(n, significant).slice(2 + zeros);
  return `0.0${subscript(zeros)}${digits}`;
}

function grouped(n: number, decimals: number, minimum = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: minimum, maximumFractionDigits: decimals });
}

/** "1.23M" in English; "1.23 Mln" in Italian (written with English separators, swapped later). */
function compact(n: number, locale: Locale): string | null {
  const abs = Math.abs(n);
  const units: Array<[number, string, string]> = [
    [1e12, "T", " Bln"],
    [1e9, "B", " Mld"],
    [1e6, "M", " Mln"],
  ];
  for (const [size, en, it] of units) {
    if (abs >= size) return `${(n / size).toFixed(2).replace(/\.?0+$/, "")}${locale === "it" ? it : en}`;
  }
  return null;
}

/** "$X" in English, "X $" in Italian; `sign` is "", "-" or "+". */
function money(sign: string, digits: string, locale: Locale): string {
  return locale === "it" ? `${sign}${separators(digits, locale)} $` : `${sign}$${digits}`;
}

/**
 * A dollar value: a balance, a fee, a total. `sign` adds "+" to gains (PnL).
 * "$0.00", "< $0.01", "$1,234.56", "$1.23M".
 */
export function formatUsd(value: Num, opts: { sign?: boolean; locale?: Locale } = {}): string {
  const locale = opts.locale ?? "en";
  const n = toNumber(value);
  if (n === null) return MISSING;
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  if (abs === 0) return money("", "0.00", locale);
  if (abs < 0.01) return n < 0 ? `> ${money("-", "0.01", locale)}` : `< ${money("", "0.01", locale)}`;
  const big = compact(abs, locale);
  if (big) return money(sign, big, locale);
  return money(sign, grouped(abs, 2, 2), locale);
}

/** Market cap, liquidity, volume: "$950", "$12.4K", "$3.1M", "$2.05B". */
export function formatCompactUsd(value: Num, locale: Locale = "en"): string {
  const n = toNumber(value);
  if (n === null) return MISSING;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1000) return money(sign, grouped(abs, abs < 10 ? 2 : 0), locale);
  const big = compact(abs, locale);
  if (big) return money(sign, big, locale);
  return money(sign, `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}K`, locale);
}

/** A token's price: "$91,234.56", "$0.9997", "$0.0000937", "$0.0₆937". */
export function formatPrice(value: Num, locale: Locale = "en"): string {
  const n = toNumber(value);
  if (n === null || n < 0) return MISSING;
  if (n === 0) return money("", "0", locale);
  if (n >= 1) return money("", grouped(n, 2, 2), locale);
  return money("", smallNumber(n, 4, 5), locale);
}

/** An amount of a token: "1,234.5678", "0.5", "0.00002712", "< 0.00000001", "12.3M". */
export function formatAmount(value: Num, opts: { decimals?: number; locale?: Locale } = {}): string {
  const locale = opts.locale ?? "en";
  const n = toNumber(value);
  if (n === null) return MISSING;
  if (n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}${separators(compact(abs, locale)!, locale)}`;
  if (abs >= 1) return `${sign}${separators(grouped(abs, opts.decimals ?? 4), locale)}`;
  if (abs < 1e-8) return `${sign}< ${separators("0.00000001", locale)}`;
  return `${sign}${separators(plainDecimal(abs, 4), locale)}`;
}

/** A percentage: "3.2%", "+3.2%" with `sign`, "< 0.01%" for crumbs. */
export function formatPercent(value: Num, opts: { sign?: boolean; decimals?: number; locale?: Locale } = {}): string {
  const locale = opts.locale ?? "en";
  const n = toNumber(value);
  if (n === null) return MISSING;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  if (abs === 0) return "0%";
  if (abs < 0.01) return n < 0 ? `> -${separators("0.01", locale)}%` : `< ${separators("0.01", locale)}%`;
  const decimals = opts.decimals ?? (abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  return `${sign}${separators(abs.toLocaleString("en-US", { maximumFractionDigits: decimals }), locale)}%`;
}

/** A plain number in the language's separators: 1234.5 → "1,234.5" / "1.234,5". */
export function formatNumber(value: Num, opts: { decimals?: number; locale?: Locale } = {}): string {
  const n = toNumber(value);
  if (n === null) return MISSING;
  return separators(grouped(n, opts.decimals ?? 2), opts.locale ?? "en");
}
