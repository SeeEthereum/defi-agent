/**
 * LI.FI Bridge Aggregator API client
 *
 * Free, no API key required.
 * Docs: https://docs.li.fi/
 */

const BASE_URL = "https://li.quest/v1";
const FETCH_TIMEOUT_MS = 10_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface BridgeToken {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  name: string;
  logoURI?: string;
  priceUSD?: string;
}

export interface BridgeQuote {
  id: string;
  type: string;
  tool: string;
  toolDetails?: {
    key: string;
    name: string;
    logoURI?: string;
  };
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: BridgeToken;
    toToken: BridgeToken;
    fromAmount: string;
    fromAddress: string;
    toAddress?: string;
    slippage?: number;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress?: string;
    executionDuration: number;
    feeCosts?: Array<{
      name: string;
      description?: string;
      percentage: string;
      token: BridgeToken;
      amount: string;
      amountUSD?: string;
    }>;
    gasCosts?: Array<{
      type: string;
      estimate: string;
      limit: string;
      amount: string;
      amountUSD?: string;
      token: BridgeToken;
    }>;
  };
  transactionRequest: {
    from: string;
    to: string;
    chainId: number;
    data: string;
    value: string;
    gasLimit: string;
    gasPrice?: string;
  };
}

export interface BridgeStatus {
  transactionId?: string;
  sending: {
    txHash: string;
    txLink?: string;
    amount?: string;
    token?: BridgeToken;
    chainId?: number;
    gasPrice?: string;
    gasUsed?: string;
    gasToken?: BridgeToken;
    gasAmount?: string;
    gasAmountUSD?: string;
    amountUSD?: string;
    value?: string;
    timestamp?: number;
  };
  receiving?: {
    txHash?: string;
    txLink?: string;
    amount?: string;
    token?: BridgeToken;
    chainId?: number;
    gasPrice?: string;
    gasUsed?: string;
    gasToken?: BridgeToken;
    gasAmount?: string;
    gasAmountUSD?: string;
    amountUSD?: string;
    value?: string;
    timestamp?: number;
  };
  lifiExplorerLink?: string;
  fromAddress?: string;
  toAddress?: string;
  tool?: string;
  status: "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?: string;
  substatusMessage?: string;
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

function unexpected(label: string, body: unknown): never {
  console.error(`[lifi/${label}]`, body);
  throw new Error("Bridge service returned an unexpected response");
}

async function readJson(res: Response, label: string): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`[lifi/${label}]`, res.status, text);
    throw new Error("Bridge service request failed");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    unexpected(label, text);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuote(data: unknown): data is BridgeQuote {
  if (!isRecord(data)) return false;
  if (!isRecord(data.action) || !isRecord(data.estimate)) return false;
  if (!isRecord(data.transactionRequest)) return false;
  return (
    typeof data.transactionRequest.to === "string" &&
    typeof data.transactionRequest.data === "string"
  );
}

function isStatus(data: unknown): data is BridgeStatus {
  if (!isRecord(data)) return false;
  return typeof data.status === "string" && isRecord(data.sending);
}

function isTokenMap(data: unknown): data is Record<string, BridgeToken[]> {
  return isRecord(data);
}

const fetchInit: RequestInit = {
  method: "GET",
  headers: { Accept: "application/json" },
};

// ── API functions ────────────────────────────────────────────────────────────

/**
 * Get a bridge quote including transaction calldata.
 * LI.FI uses EVM chainId numbers (1, 42161, 8453, etc.).
 */
export async function bridgeQuote(params: {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
}): Promise<BridgeQuote> {
  const qs = new URLSearchParams({
    fromChain: params.fromChain,
    toChain: params.toChain,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
  });
  if (params.toAddress) qs.set("toAddress", params.toAddress);

  const res = await fetch(`${BASE_URL}/quote?${qs.toString()}`, {
    ...fetchInit,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const data = await readJson(res, "quote");
  if (!isQuote(data)) unexpected("quote", data);
  return data;
}

/**
 * Get available bridge tokens for given chains.
 * Returns a map of chainId -> token list.
 */
export async function bridgeTokens(
  fromChain: string,
  toChain: string
): Promise<Record<string, BridgeToken[]>> {
  const res = await fetch(
    `${BASE_URL}/tokens?chains=${fromChain},${toChain}`,
    {
      ...fetchInit,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );

  const data = await readJson(res, "tokens");
  if (!isRecord(data)) unexpected("tokens", data);
  const tokens = data.tokens ?? data;
  if (!isTokenMap(tokens)) unexpected("tokens", data);
  return tokens;
}

/**
 * Get the status of a bridge transaction.
 *
 * The `bridge` parameter is the tool key returned by `bridgeQuote` as
 * `quote.tool` (e.g. "across", "hop", "stargate", "cbridge"). When omitted,
 * LI.FI attempts to auto-detect but the call can return INVALID for some
 * routes, so always pass the tool if available.
 */
export async function bridgeStatus(
  txHash: string,
  fromChain: string,
  toChain: string,
  bridge?: string
): Promise<BridgeStatus> {
  const qs = new URLSearchParams({
    txHash,
    fromChain,
    toChain,
  });
  if (bridge) qs.set("bridge", bridge);

  const res = await fetch(`${BASE_URL}/status?${qs.toString()}`, {
    ...fetchInit,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const data = await readJson(res, "status");
  if (!isStatus(data)) unexpected("status", data);
  return data;
}
