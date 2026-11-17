/**
 * Clean LI.FI's token list before it reaches the bridge picker.
 *
 * The raw list for one chain holds thousands of tokens (6,824 on Ethereum in
 * a live check, about 2.4 MB of JSON) and some are junk:
 * - 747 were "flagged": LI.FI's security provider (Hypernative) denied them.
 *   None of the main tokens (USDC, USDT, DAI, WETH, WBTC, LINK…) was among them.
 * - 51 had a price above $1M per unit, e.g. "USDCEURe" at $100,090,082. The
 *   dearest real tokens (wrapped bitcoin) trade near $100k, so such a price is
 *   a broken feed or a junk listing, and showing it misleads.
 * Both go. The rest keeps only the fields the picker uses, which halves the
 * payload. A flagged token the user already holds can still be picked from
 * the wallet list on the page.
 */

/** Above this per-unit price a listing is treated as junk. */
export const MAX_TOKEN_PRICE_USD = 1_000_000;

export interface RawListedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: string;
  verificationStatus?: string;
}

export interface PickerToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: string;
}

export function isJunkToken(token: RawListedToken): boolean {
  if (token.verificationStatus === "flagged") return true;
  const price = token.priceUSD != null ? parseFloat(token.priceUSD) : NaN;
  return Number.isFinite(price) && price > MAX_TOKEN_PRICE_USD;
}

export function cleanTokenList(tokens: RawListedToken[]): PickerToken[] {
  return tokens
    .filter((t) => !isJunkToken(t))
    .map(({ address, symbol, name, decimals, logoURI, priceUSD }) => ({ address, symbol, name, decimals, logoURI, priceUSD }));
}
