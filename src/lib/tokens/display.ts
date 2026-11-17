/**
 * How a token is called on screen.
 *
 * OKX's data is written for machines: native ETH on Arbitrum comes back as
 * symbol "ARB_ETH" with the name "Arbitrum One", Optimism's as "OP_ETH",
 * Tether's USDT on Arbitrum as "USD₮0". People know these as ETH (on
 * Arbitrum) and USDT. This turns any token record from OKX, LI.FI or Fluid
 * into a symbol, a plain name and the chain it lives on, and gives the
 * icon a key that finds the right logo.
 */

import { getChainByIndex } from "@/lib/chains";

/** Chains we show by name even where the app does not trade on them. */
const OTHER_CHAINS: Record<number, string> = {
  501: "Solana",
  196: "X Layer",
  43114: "Avalanche",
  59144: "Linea",
  324: "zkSync",
  534352: "Scroll",
  250: "Fantom",
  5042: "Arc",
  784: "Sui",
  195: "Tron",
  0: "Bitcoin",
};

/** Native coin of chains outside CHAINS (lib/chains has the rest). */
const OTHER_NATIVE: Record<number, string> = { 501: "SOL", 196: "OKB", 43114: "AVAX", 250: "FTM", 784: "SUI", 195: "TRX", 0: "BTC" };

/** Names people use for coins and the most common tokens. */
const KNOWN_NAMES: Record<string, string> = {
  ETH: "Ether",
  WETH: "Wrapped Ether",
  BTC: "Bitcoin",
  WBTC: "Wrapped Bitcoin",
  BNB: "BNB",
  WBNB: "Wrapped BNB",
  POL: "Polygon",
  MATIC: "Polygon",
  SOL: "Solana",
  AVAX: "Avalanche",
  OKB: "OKB",
  USDT: "Tether USD",
  USDC: "USD Coin",
  "USDC.E": "USD Coin (bridged)",
  DAI: "Dai",
  ARB: "Arbitrum",
  OP: "Optimism",
};

const NATIVE_ADDRESSES = new Set([
  "",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x0000000000000000000000000000000000000000",
  "11111111111111111111111111111111", // Solana system program
]);

export interface TokenLike {
  symbol?: string | null;
  tokenSymbol?: string | null;
  name?: string | null;
  tokenName?: string | null;
  chainIndex?: string | number | null;
  chainId?: string | number | null;
  tokenAddress?: string | null;
  tokenContractAddress?: string | null;
  address?: string | null;
  isNative?: boolean;
}

export interface TokenDisplay {
  /** What to print: "ETH", "USDT", "PEPE". */
  symbol: string;
  /** A plain name: "Ether", "Tether USD", or the token's own. */
  name: string;
  /** "Arbitrum", or null when the chain is unknown. */
  chainName: string | null;
  chainIndex: number | null;
  isNative: boolean;
  /** Key for TokenIcon's logo lookup ("eth", "usdt"). */
  iconKey: string;
}

/** The chain's display name for an index, or null. */
export function chainName(chainIndex: string | number | null | undefined): string | null {
  const n = Number(chainIndex);
  if (chainIndex === null || chainIndex === undefined || chainIndex === "" || !Number.isFinite(n)) return null;
  return getChainByIndex(n)?.name ?? OTHER_CHAINS[n] ?? null;
}

function nativeSymbol(chainIndex: number | null): string | null {
  if (chainIndex === null) return null;
  return getChainByIndex(chainIndex)?.nativeSymbol ?? OTHER_NATIVE[chainIndex] ?? null;
}

/**
 * A cleaned-up symbol: OKX's chain prefixes off ("ARB_ETH" → "ETH"), the
 * Tether sign spelled out ("USD₮0" → "USDT0"), and USDT0 shown as USDT
 * (it is Tether's own USDT on chains like Arbitrum).
 */
export function cleanSymbol(raw: string | null | undefined): string {
  let s = (raw ?? "").trim().replace(/₮/g, "T");
  const prefixed = /^[A-Z0-9]+_(ETH|BTC|USDC|USDT|BNB|POL|MATIC|AVAX|OKB|SOL)$/i.exec(s);
  if (prefixed) s = prefixed[1];
  if (/^USDT0$/i.test(s)) s = "USDT";
  if (/^usdc\.e$/i.test(s)) s = "USDC.e";
  return s;
}

/** "fUSDC" → "usdc" for the logo of Fluid's lending tokens. */
function iconKeyOf(symbol: string): string {
  const s = symbol.toLowerCase();
  if (/^f(usdc|usdt|weth|eth|wsteth|gho|usds|susds)$/.test(s)) return s.slice(1);
  if (s === "usdc.e") return "usdc";
  return s;
}

/** The logo key for any symbol as received ("ARB_ETH" → "eth", "USD₮0" → "usdt"). */
export function iconKey(symbol: string): string {
  return iconKeyOf(cleanSymbol(symbol));
}

function shorten(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : text;
}

/** Symbol, name and chain of a token record, ready to print. */
export function displayToken(token: TokenLike): TokenDisplay {
  const chainRaw = token.chainIndex ?? token.chainId;
  const chainIndex = chainRaw === null || chainRaw === undefined || chainRaw === "" ? null : Number(chainRaw);
  const chain = chainName(chainIndex);
  const address = (token.tokenAddress ?? token.tokenContractAddress ?? token.address ?? null)?.toLowerCase();
  const rawSymbol = token.symbol ?? token.tokenSymbol ?? "";
  const native =
    token.isNative === true ||
    (address !== null && address !== undefined && NATIVE_ADDRESSES.has(address)) ||
    /^[A-Z0-9]+_ETH$/i.test(rawSymbol.trim());

  let symbol = cleanSymbol(rawSymbol);
  if (native) symbol = nativeSymbol(chainIndex) ?? symbol;
  if (!symbol) symbol = "?";

  const rawName = (token.tokenName ?? token.name ?? "").trim();
  const nameIsChain = rawName !== "" && (rawName === chain || /\b(one|mainnet|chain|network)$/i.test(rawName));
  const known = KNOWN_NAMES[symbol.toUpperCase()];
  let name: string;
  if (native || nameIsChain || !rawName || rawName.replace(/₮/g, "T") === rawSymbol.replace(/₮/g, "T")) {
    name = known ?? symbol;
  } else {
    name = rawName.replace(/₮/g, "T");
  }
  if (symbol === "USDT" && /usdt0|usd₮0/i.test(rawSymbol)) name = "Tether USD (USDT0)";

  return {
    symbol: shorten(symbol, 12),
    name: shorten(name, 32),
    chainName: chain,
    chainIndex: chainIndex !== null && Number.isFinite(chainIndex) ? chainIndex : null,
    isNative: native,
    iconKey: iconKeyOf(symbol),
  };
}

/** "ETH on Arbitrum", or just "ETH" when the chain is unknown. */
export function tokenWithChain(d: TokenDisplay): string {
  return d.chainName ? `${d.symbol} on ${d.chainName}` : d.symbol;
}
