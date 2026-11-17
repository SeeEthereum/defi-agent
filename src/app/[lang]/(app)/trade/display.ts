/**
 * Hyperliquid figures for people. Units follow Hyperliquid's API:
 * `returnOnEquity` is a fraction (0.05 = 5%, the skill's sample position
 * has 123.45 PnL on 1,205 margin and "0.102"); prices and USDC values are
 * plain decimal strings; `liquidationPx` is null when there is none (the
 * server maps that to "0").
 *
 * Words come from the "trade" dictionary through the translator the page
 * passes in (useT("trade")); numbers take the page's language.
 */

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import type { Paths, Translator } from "@/i18n/translate";
import { FEATURED_MARKETS } from "@/lib/hyperliquid/markets";
import { MISSING, formatAmount, formatPercent, formatPrice } from "@/lib/format";

/** A key of the "trade" dictionary. */
export type TradeKey = Paths<Messages["trade"]>;
/** The trade page's words: useT("trade") on the page, createTranslator(en, "en", "trade") in tests. */
export type TradeT = Translator<TradeKey>;

/** "Bitcoin" for "BTC", or null for a coin outside the curated list. */
export function coinLabel(coin: string): string | null {
  return FEATURED_MARKETS.find((m) => m.coin === coin)?.label ?? null;
}

/** Hyperliquid's own coin logo, for coins the icon set does not know. */
export function coinLogoUrl(coin: string): string | null {
  return /^[A-Z0-9]{1,16}$/i.test(coin) ? `https://app.hyperliquid.xyz/coins/${coin}.svg` : null;
}

/** Return on margin: Hyperliquid's fraction as a signed percent, "+5%". */
export function formatRoe(value: unknown, locale: Locale): string {
  if (value === null || value === undefined || value === "") return MISSING;
  const n = Number(value);
  return Number.isFinite(n) ? formatPercent(n * 100, { sign: true, locale }) : MISSING;
}

/** "Cross" or "Isolated"; nothing for anything else. */
export function leverageTypeLabel(type: unknown, t: TradeT): string {
  if (type === "cross") return t("cross");
  if (type === "isolated") return t("isolated");
  return "";
}

/**
 * Open orders come from Hyperliquid's `openOrders`, which has no order
 * type: every resting order there is a limit order. Reduce-only orders
 * (take-profit, stop-loss, closes) can only shrink a position.
 */
export function orderTypeLabel(o: { type?: unknown; reduceOnly?: unknown }, t: TradeT): string {
  const raw = typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
  const base =
    raw === "" || raw === "limit"
      ? t("typeLimit")
      : raw === "market"
        ? t("typeMarket")
        : raw.includes("take profit")
          ? t("takeProfit")
          : raw.includes("stop")
            ? t("stopLoss")
            : t("typeLimit");
  return o.reduceOnly === true ? t("closeOnly", { type: base }) : base;
}

/** A liquidation price, or "–" when there is none. */
export function formatLiquidation(value: unknown, locale: Locale): string {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n) || n <= 0) return MISSING;
  return formatPrice(n, locale);
}

/**
 * A price exactly as typed or as Hyperliquid stores it, with "$" and
 * thousands separators but no rounding: "$64,000.5", "$0.12345"; in
 * Italian "64.000,5 $", the way lib/format writes money. For the values an
 * order is placed with, which must read as sent.
 */
export function formatExactPrice(value: unknown, locale: Locale): string {
  const s = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d+)?$/.test(s)) return formatPrice(typeof value === "number" || typeof value === "string" ? value : null, locale);
  const [group, decimal] = locale === "it" ? [".", ","] : [",", "."];
  const [int, frac] = s.split(".");
  const whole = int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const digits = frac ? `${whole}${decimal}${frac}` : whole;
  return locale === "it" ? `${digits} $` : `$${digits}`;
}

/**
 * A number exactly as typed or sent ("0.5"), never rounded, with the
 * language's decimal mark: "0,5" in Italian. English shows it untouched.
 */
export function formatExactNumber(value: string, locale: Locale): string {
  return locale === "it" ? value.replace(".", ",") : value;
}

/** An amount of USDC: "50 USDC", "1,234.56 USDC", or null when unreadable. */
function usdc(value: unknown, locale: Locale): string | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return `${formatAmount(n, { decimals: 2, locale })} USDC`;
}

function shortAddress(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** "Under a minute", "About 1 min", "About 5 min". */
function arrival(seconds: unknown, t: TradeT): string | null {
  const s = Number(seconds);
  if (seconds === null || seconds === undefined || seconds === "" || !Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return t("fundRows.underAMinute");
  return t("fundRows.aboutMinutes", { minutes: Math.ceil(s / 60) });
}

/**
 * The summary of a deposit or withdrawal preview, from the payload that
 * lib/hyperliquid/cli builds (deposit: amount, from, est_arrival_seconds;
 * withdraw: amount, destination, fee_usdc, net_usdc, total_debited). Only
 * the figures a person needs, in their words; flags, chain ids, contract
 * addresses and the API's own message are left out.
 */
export function fundPreviewRows(
  mode: "deposit" | "withdraw",
  p: Record<string, unknown>,
  t: TradeT,
  locale: Locale
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: string | null) => {
    if (value) rows.push([label, value]);
  };
  if (mode === "deposit") {
    const amount = usdc(p.amount, locale);
    const fee = p.fee_usdc === undefined ? null : Number(p.fee_usdc);
    push(t("fundRows.youDeposit"), amount);
    // Hyperliquid's bridge takes no fee on deposits; only a payload fee is shown.
    push(t("fee"), fee !== null && Number.isFinite(fee) && fee > 0 ? usdc(fee, locale) : t("fundRows.noHyperliquidFee"));
    push(t("fundRows.youReceive"), usdc(fee !== null && Number.isFinite(fee) && fee > 0 ? Number(p.amount) - fee : p.amount, locale));
    push(t("fundRows.arrivesIn"), arrival(p.est_arrival_seconds, t) ?? t("fundRows.twoToFiveMin"));
    const from = shortAddress(p.from);
    push(t("fundRows.fromYourWallet"), from);
  } else {
    push(t("fundRows.youWithdraw"), usdc(p.amount, locale));
    push(t("fee"), usdc(p.fee_usdc, locale));
    push(t("fundRows.totalDebited"), usdc(p.total_debited, locale));
    push(t("fundRows.youReceive"), usdc(p.net_usdc ?? p.amount, locale));
    push(t("fundRows.arrivesIn"), arrival(p.est_arrival_seconds, t) ?? t("fundRows.twoToFiveMin"));
    push(t("fundRows.toYourWallet"), shortAddress(p.destination));
  }
  return rows;
}
