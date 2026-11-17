/**
 * Amounts the assistant proposes, converted by the server.
 *
 * The model writes amounts the way people say them ("1.5" USDC). Turning
 * that into base units needs the token's decimals, which the model used to
 * supply from memory: a wrong guess (USDC has 18 decimals on BNB Chain, not
 * 6) moves a different amount by orders of magnitude. Decimals and symbol
 * are read from the token contract on its chain instead, and cached.
 */

import { erc20Abi, formatUnits, parseUnits } from "viem";
import { getChainByIndex } from "@/lib/chains";
import { getPublicClient } from "@/lib/fluid/client";
import { NATIVE_TOKEN } from "@/lib/api/validation";
import { cleanSymbol } from "@/lib/tokens/display";

export interface TokenInfo {
  decimals: number;
  symbol: string;
}

const cache = new Map<string, TokenInfo>();
const MAX_CACHE = 2000;

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

/** Decimals and symbol of a token (or the chain's native coin), read on-chain. */
export async function tokenInfo(chainIndex: number, token: string): Promise<TokenInfo> {
  const address = token.toLowerCase();
  const chain = getChainByIndex(chainIndex);
  if (!chain) throw new AmountError(`Unsupported chain ${chainIndex}`);
  if (address === NATIVE_TOKEN) return { decimals: chain.nativeDecimals, symbol: chain.nativeSymbol };

  const key = `${chainIndex}:${address}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const client = getPublicClient(chainIndex);
  const contract = { address: address as `0x${string}`, abi: erc20Abi } as const;
  let decimals: number;
  try {
    decimals = Number(await client.readContract({ ...contract, functionName: "decimals" }));
  } catch {
    throw new AmountError(`${address} is not a token on ${chain.name}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new AmountError(`${address} reports invalid decimals on ${chain.name}`);
  }
  // A symbol is only for display; some old tokens return bytes32 or nothing.
  const symbol = await client
    .readContract({ ...contract, functionName: "symbol" })
    .then(displaySymbol)
    .catch(() => null);

  const info = { decimals, symbol: symbol ?? `${address.slice(0, 6)}…${address.slice(-4)}` };
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, info);
  return info;
}

/**
 * A contract's symbol() made fit to print, or null. Tether's USD₮0 becomes
 * USDT (lib/tokens/display); control characters, other non-ASCII text and
 * absurd lengths are refused, so the card falls back to the address.
 */
export function displaySymbol(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 40 || /[\x00-\x1f\x7f]/.test(raw)) return null;
  const clean = cleanSymbol(raw);
  return /^[\x20-\x7e]{1,20}$/.test(clean) ? clean : null;
}

/**
 * "1.5" in a token with `decimals` decimals, as a base-unit string. Refuses
 * zero and more fractional digits than the token has (rounding would move
 * a different amount than the one the user read).
 */
export function toBaseUnits(amount: string, decimals: number): string {
  const normalized = amount.trim().replace(",", ".");
  if (!/^\d{1,30}(\.\d{1,36})?$/.test(normalized)) {
    throw new AmountError(`"${amount}" is not a plain decimal amount`);
  }
  const fraction = normalized.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new AmountError(`this token has ${decimals} decimals; "${amount}" has ${fraction.length}`);
  }
  const base = parseUnits(normalized, decimals);
  if (base <= 0n) throw new AmountError("amount must be greater than zero");
  return base.toString();
}

/** Base units back to a readable amount, trimmed to at most `maxFraction` digits. */
export function fromBaseUnits(base: string, decimals: number, maxFraction = 8): string {
  if (!/^\d+$/.test(base)) return base;
  const full = formatUnits(BigInt(base), decimals);
  const [int, frac = ""] = full.split(".");
  const cut = frac.slice(0, maxFraction).replace(/0+$/, "");
  return cut ? `${int}.${cut}` : int;
}

/** Test helper. */
export function clearTokenInfoCache(): void {
  cache.clear();
}
