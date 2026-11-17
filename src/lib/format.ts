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
 */

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

function grouped(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function compact(n: number): string | null {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2).replace(/\.?0+$/, "")}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  return null;
}

/**
 * A dollar value: a balance, a fee, a total. `sign` adds "+" to gains (PnL).
 * "$0.00", "< $0.01", "$1,234.56", "$1.23M".
 */
export function formatUsd(value: Num, opts: { sign?: boolean } = {}): string {
  const n = toNumber(value);
  if (n === null) return MISSING;
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return n < 0 ? "> -$0.01" : "< $0.01";
  const big = compact(abs);
  if (big) return `${sign}$${big}`;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Market cap, liquidity, volume: "$950", "$12.4K", "$3.1M", "$2.05B". */
export function formatCompactUsd(value: Num): string {
  const n = toNumber(value);
  if (n === null) return MISSING;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1000) return `${sign}$${grouped(abs, abs < 10 ? 2 : 0)}`;
  const big = compact(abs);
  if (big) return `${sign}$${big}`;
  return `${sign}$${(abs / 1000).toFixed(1).replace(/\.0$/, "")}K`;
}

/** A token's price: "$91,234.56", "$0.9997", "$0.0000937", "$0.0₆937". */
export function formatPrice(value: Num): string {
  const n = toNumber(value);
  if (n === null || n < 0) return MISSING;
  if (n === 0) return "$0";
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${smallNumber(n, 4, 5)}`;
}

/** An amount of a token: "1,234.5678", "0.5", "0.00002712", "< 0.00000001", "12.3M". */
export function formatAmount(value: Num, opts: { decimals?: number } = {}): string {
  const n = toNumber(value);
  if (n === null) return MISSING;
  if (n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}${compact(abs)}`;
  if (abs >= 1) return `${sign}${grouped(abs, opts.decimals ?? 4)}`;
  if (abs < 1e-8) return `${sign}< 0.00000001`;
  return `${sign}${plainDecimal(abs, 4)}`;
}

/** A percentage: "3.2%", "+3.2%" with `sign`, "< 0.01%" for crumbs. */
export function formatPercent(value: Num, opts: { sign?: boolean; decimals?: number } = {}): string {
  const n = toNumber(value);
  if (n === null) return MISSING;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  if (abs === 0) return "0%";
  if (abs < 0.01) return n < 0 ? "> -0.01%" : "< 0.01%";
  const decimals = opts.decimals ?? (abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: decimals })}%`;
}
