/**
 * Curated list of liquid perpetual markets for the Trade page.
 *
 * Hyperliquid lists 230+ perp coins plus hundreds of spot index aliases
 * (`@1`, `@10`, …). We surface only a curated subset so the UI is fast and
 * the ticker shows genuinely-tradeable markets.
 *
 * `MATIC` has been renamed to `POL` on HL; we always use `POL`.
 */

export interface HlMarket {
  /** Canonical coin symbol used by HL (e.g. "BTC", "ETH") */
  coin: string;
  /** Display label for the UI */
  label: string;
  /** Emoji or tag for quick visual id */
  badge?: string;
  /** Min notional ($) — HL enforces $10 globally but some coins are stricter */
  minNotionalUsd?: number;
}

export const FEATURED_MARKETS: HlMarket[] = [
  { coin: "BTC", label: "Bitcoin", badge: "BTC" },
  { coin: "ETH", label: "Ethereum", badge: "ETH" },
  { coin: "SOL", label: "Solana", badge: "SOL" },
  { coin: "HYPE", label: "Hyperliquid", badge: "HYPE" },
  { coin: "ARB", label: "Arbitrum", badge: "ARB" },
  { coin: "AVAX", label: "Avalanche", badge: "AVAX" },
  { coin: "POL", label: "Polygon", badge: "POL" },
  { coin: "LINK", label: "Chainlink", badge: "LINK" },
  { coin: "DOGE", label: "Dogecoin", badge: "DOGE" },
  { coin: "SUI", label: "Sui", badge: "SUI" },
  { coin: "XRP", label: "Ripple", badge: "XRP" },
  { coin: "AAVE", label: "Aave", badge: "AAVE" },
  { coin: "BNB", label: "BNB", badge: "BNB" },
  { coin: "APT", label: "Aptos", badge: "APT" },
  { coin: "OP", label: "Optimism", badge: "OP" },
  { coin: "INJ", label: "Injective", badge: "INJ" },
];

export const FEATURED_COINS = FEATURED_MARKETS.map((m) => m.coin);

/** Filter a raw HL prices dict to only the curated markets, preserving order. */
export function filterFeaturedPrices(
  raw: Record<string, string>
): Array<{ coin: string; price: string; label: string }> {
  return FEATURED_MARKETS.filter((m) => raw[m.coin] !== undefined).map((m) => ({
    coin: m.coin,
    label: m.label,
    price: raw[m.coin],
  }));
}

/** Return all non-alias (i.e. real perp) coin names from a raw prices dict. */
export function allPerpCoins(raw: Record<string, string>): string[] {
  return Object.keys(raw)
    .filter((k) => !k.startsWith("@"))
    .sort();
}
