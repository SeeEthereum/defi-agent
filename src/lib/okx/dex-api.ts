/**
 * OKX DEX Aggregator API client — direct HTTP calls for full token support.
 *
 * This replaces the limited `onchainos swap` CLI commands.
 * The DEX aggregator supports ANY token on any supported chain,
 * aggregating 500+ DEX sources for optimal routing.
 *
 * Docs: https://web3.okx.com/it/onchainos/dev-docs/home/run-your-first-dapp
 */

import { okxGet } from "./openapi";

// ── Generic API caller ────────────────────────────────────────────────────────

/**
 * GET an aggregator path and return the first item of `data`. Signing,
 * the 10 s timeout and error handling live in ./openapi, shared with the
 * market data. The DEX API is not part of OKX's metered market tiers.
 */
async function dexGet<T = unknown>(path: string, params: Record<string, string>): Promise<T> {
  const data = await okxGet<T[]>(`/api/v6/${path}`, params);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`OKX DEX API returned no data (${path})`);
  }
  return data[0];
}

/**
 * OKX's `priceImpactProtectionPercent` is a percentage: "0.9" means 0.9 %,
 * not 90 % (checked 2026-11-17: a 1.08 % trade gets code 82112 "higher
 * than 0.9%"). We used to send "0.9" everywhere, so any quote or swap that
 * moved the price by more than 0.9 % failed outright, and the warning the
 * app shows from 3 % was never reached.
 *
 * Quotes ask with the ceiling off, so the page sees the real impact and
 * judges it (warn from 3 %, refuse above 10 %); the swap itself carries the
 * same 10 % ceiling, so OKX refuses it too if the market moved in between.
 */
export const QUOTE_IMPACT_PROTECTION = "100";
export const SWAP_IMPACT_PROTECTION = "10";

// ── Public API functions ──────────────────────────────────────────────────────

export interface DexQuoteResult {
  toTokenAmount: string;
  fromTokenAmount: string;
  estimateGasFee: string;
  priceImpactPercentage: string;
  tradeFee: string;
  fromToken: {
    tokenSymbol: string;
    decimal: string;
    tokenContractAddress: string;
    tokenUnitPrice: string;
  };
  toToken: {
    tokenSymbol: string;
    decimal: string;
    tokenContractAddress: string;
    tokenUnitPrice: string;
  };
  dexRouterList: Array<{
    router: string;
    routerPercent: string;
    subRouterList: Array<{
      dexProtocol: Array<{ dexName: string; percent: string }>;
    }>;
  }>;
}

/**
 * Get a swap quote from the DEX aggregator.
 * Supports ANY token pair on supported chains.
 */
export async function dexQuote(params: {
  chainIndex: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippagePercent?: string;
  autoSlippage?: boolean;
  priceImpactProtectionPercent?: string;
}): Promise<DexQuoteResult> {
  const p: Record<string, string> = {
    chainIndex: params.chainIndex,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
  };

  if (params.autoSlippage) {
    p.autoSlippage = "true";
  } else {
    p.slippagePercent = params.slippagePercent ?? "0.5";
  }

  p.priceImpactProtectionPercent = params.priceImpactProtectionPercent ?? QUOTE_IMPACT_PROTECTION;

  return dexGet<DexQuoteResult>("dex/aggregator/quote", p);
}

export interface DexApproveResult {
  data: string; // approve calldata
  dexContractAddress: string; // spender (router) address
  gasLimit: string;
  gasPrice: string;
}

/**
 * Get the approve transaction calldata for an ERC-20 token.
 * Returns the calldata to call approve() on the token contract.
 */
export async function dexApproveTransaction(params: {
  chainIndex: string;
  tokenContractAddress: string;
  approveAmount: string;
}): Promise<DexApproveResult> {
  return dexGet<DexApproveResult>("dex/aggregator/approve-transaction", {
    chainIndex: params.chainIndex,
    tokenContractAddress: params.tokenContractAddress,
    approveAmount: params.approveAmount,
  });
}

export interface DexSwapResult {
  routerResult: {
    toTokenAmount: string;
    fromTokenAmount: string;
    estimateGasFee: string;
    tradeFee: string;
    dexRouterList: unknown[];
  };
  tx: {
    from: string;
    to: string;
    value: string;
    data: string;
    gas: string;
    gasPrice: string;
  };
}

/**
 * Get swap transaction calldata from the DEX aggregator.
 * Returns tx data to be broadcast via wallet contract-call.
 */
export async function dexSwap(params: {
  chainIndex: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  slippagePercent?: string;
  autoSlippage?: boolean;
  priceImpactProtectionPercent?: string;
}): Promise<DexSwapResult> {
  const p: Record<string, string> = {
    chainIndex: params.chainIndex,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    userWalletAddress: params.userWalletAddress,
  };

  if (params.autoSlippage) {
    p.autoSlippage = "true";
  } else {
    p.slippagePercent = params.slippagePercent ?? "0.5";
  }

  p.priceImpactProtectionPercent = params.priceImpactProtectionPercent ?? SWAP_IMPACT_PROTECTION;

  return dexGet<DexSwapResult>("dex/aggregator/swap", p);
}
