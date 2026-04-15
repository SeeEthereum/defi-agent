/**
 * OKX DEX Aggregator API client — direct HTTP calls for full token support.
 *
 * This replaces the limited `onchainos swap` CLI commands.
 * The DEX aggregator supports ANY token on any supported chain,
 * aggregating 500+ DEX sources for optimal routing.
 *
 * Docs: https://web3.okx.com/it/onchainos/dev-docs/home/run-your-first-dapp
 */

import { createHmac } from "crypto";

const BASE_URL = "https://web3.okx.com";

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getCredentials() {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) {
    throw new Error(
      "Missing OKX API credentials. Set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, OKX_PROJECT_ID."
    );
  }

  return { apiKey, secretKey, passphrase, projectId };
}

function getHeaders(
  method: "GET" | "POST",
  requestPath: string,
  queryString = "",
  body = ""
): Record<string, string> {
  const { apiKey, secretKey, passphrase, projectId } = getCredentials();
  const timestamp = new Date().toISOString();

  // Signature: timestamp + method + requestPath + queryString (GET) or body (POST)
  const stringToSign =
    timestamp + method + requestPath + (method === "GET" ? queryString : body);

  const sign = createHmac("sha256", secretKey)
    .update(stringToSign)
    .digest("base64");

  return {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "OK-ACCESS-PROJECT": projectId,
  };
}

// ── Generic API caller ────────────────────────────────────────────────────────

interface OkxApiResponse<T = unknown> {
  code: string;
  msg?: string;
  data: T[];
}

async function dexGet<T = unknown>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const requestPath = `/api/v6/${path}`;
  const queryString = "?" + new URLSearchParams(params).toString();
  const headers = getHeaders("GET", requestPath, queryString);

  const url = `${BASE_URL}${requestPath}${queryString}`;
  const res = await fetch(url, { headers, method: "GET" });
  const json = (await res.json()) as OkxApiResponse<T>;

  if (json.code !== "0") {
    throw new Error(
      `OKX DEX API error (${path}): ${json.msg || `code ${json.code}`}`
    );
  }

  return json.data[0];
}

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

  if (params.priceImpactProtectionPercent) {
    p.priceImpactProtectionPercent = params.priceImpactProtectionPercent;
  }

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

  if (params.priceImpactProtectionPercent) {
    p.priceImpactProtectionPercent = params.priceImpactProtectionPercent;
  }

  return dexGet<DexSwapResult>("dex/aggregator/swap", p);
}
