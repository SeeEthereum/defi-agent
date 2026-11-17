/**
 * Hyperliquid figures for people. Units follow Hyperliquid's API:
 * `returnOnEquity` is a fraction (0.05 = 5%, the skill's sample position
 * has 123.45 PnL on 1,205 margin and "0.102"); prices and USDC values are
 * plain decimal strings; `liquidationPx` is null when there is none (the
 * server maps that to "0").
 */

import { FEATURED_MARKETS } from "@/lib/hyperliquid/markets";
import { MISSING, formatAmount, formatPercent, formatPrice } from "@/lib/format";

/** "Bitcoin" for "BTC", or null for a coin outside the curated list. */
export function coinLabel(coin: string): string | null {
  return FEATURED_MARKETS.find((m) => m.coin === coin)?.label ?? null;
}

/** Hyperliquid's own coin logo, for coins the icon set does not know. */
export function coinLogoUrl(coin: string): string | null {
  return /^[A-Z0-9]{1,16}$/i.test(coin) ? `https://app.hyperliquid.xyz/coins/${coin}.svg` : null;
}

/** Return on margin: Hyperliquid's fraction as a signed percent, "+5%". */
export function formatRoe(value: unknown): string {
  if (value === null || value === undefined || value === "") return MISSING;
  const n = Number(value);
  return Number.isFinite(n) ? formatPercent(n * 100, { sign: true }) : MISSING;
}

/** "Cross" or "Isolated"; nothing for anything else. */
export function leverageTypeLabel(type: unknown): string {
  if (type === "cross") return "Cross";
  if (type === "isolated") return "Isolated";
  return "";
}

/**
 * Open orders come from Hyperliquid's `openOrders`, which has no order
 * type: every resting order there is a limit order. Reduce-only orders
 * (take-profit, stop-loss, closes) can only shrink a position.
 */
export function orderTypeLabel(o: { type?: unknown; reduceOnly?: unknown }): string {
  const raw = typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
  const base =
    raw === "" || raw === "limit"
      ? "Limit"
      : raw === "market"
        ? "Market"
        : raw.includes("take profit")
          ? "Take-profit"
          : raw.includes("stop")
            ? "Stop-loss"
            : "Limit";
  return o.reduceOnly === true ? `${base} · close only` : base;
}

/** A liquidation price, or "–" when there is none. */
export function formatLiquidation(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n) || n <= 0) return MISSING;
  return formatPrice(n);
}

/**
 * A price exactly as typed or as Hyperliquid stores it, with "$" and
 * thousands separators but no rounding: "$64,000.5", "$0.12345". For the
 * values an order is placed with, which must read as sent.
 */
export function formatExactPrice(value: unknown): string {
  const s = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d+)?$/.test(s)) return formatPrice(typeof value === "number" || typeof value === "string" ? value : null);
  const [int, frac] = s.split(".");
  const whole = int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `$${whole}.${frac}` : `$${whole}`;
}

/** An amount of USDC: "50 USDC", "1,234.56 USDC", or null when unreadable. */
function usdc(value: unknown): string | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return `${formatAmount(n, { decimals: 2 })} USDC`;
}

function shortAddress(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** "Under a minute", "About 1 min", "About 5 min". */
function arrival(seconds: unknown): string | null {
  const s = Number(seconds);
  if (seconds === null || seconds === undefined || seconds === "" || !Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return "Under a minute";
  return `About ${Math.ceil(s / 60)} min`;
}

/**
 * The summary of a deposit or withdrawal preview, from the payload that
 * lib/hyperliquid/cli builds (deposit: amount, from, est_arrival_seconds;
 * withdraw: amount, destination, fee_usdc, net_usdc, total_debited). Only
 * the figures a person needs, in their words; flags, chain ids, contract
 * addresses and the API's own message are left out.
 */
export function fundPreviewRows(mode: "deposit" | "withdraw", p: Record<string, unknown>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: string | null) => {
    if (value) rows.push([label, value]);
  };
  if (mode === "deposit") {
    const amount = usdc(p.amount);
    const fee = p.fee_usdc === undefined ? null : Number(p.fee_usdc);
    push("You deposit", amount);
    // Hyperliquid's bridge takes no fee on deposits; only a payload fee is shown.
    push("Fee", fee !== null && Number.isFinite(fee) && fee > 0 ? usdc(fee) : "No Hyperliquid fee");
    push("You receive", usdc(fee !== null && Number.isFinite(fee) && fee > 0 ? Number(p.amount) - fee : p.amount));
    push("Arrives in", arrival(p.est_arrival_seconds) ?? "2 to 5 min");
    const from = shortAddress(p.from);
    push("From your wallet", from);
  } else {
    push("You withdraw", usdc(p.amount));
    push("Fee", usdc(p.fee_usdc));
    push("Total debited", usdc(p.total_debited));
    push("You receive", usdc(p.net_usdc ?? p.amount));
    push("Arrives in", arrival(p.est_arrival_seconds) ?? "2 to 5 min");
    push("To your wallet", shortAddress(p.destination));
  }
  return rows;
}
