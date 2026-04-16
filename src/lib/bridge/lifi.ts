/**
 * LI.FI Bridge Aggregator API client
 *
 * Free, no API key required.
 * Docs: https://docs.li.fi/
 */

const BASE_URL = "https://li.quest/v1";

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
}): Promise<BridgeQuote> {
  const qs = new URLSearchParams({
    fromChain: params.fromChain,
    toChain: params.toChain,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
  });

  const res = await fetch(`${BASE_URL}/quote?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `LI.FI quote error (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = json.message || json.error || message;
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  return res.json();
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
      method: "GET",
      headers: { Accept: "application/json" },
    }
  );

  if (!res.ok) {
    throw new Error(`LI.FI tokens error (${res.status})`);
  }

  const data = await res.json();
  return data.tokens ?? data;
}

/**
 * Get the status of a bridge transaction.
 */
export async function bridgeStatus(
  txHash: string,
  fromChain: string,
  toChain: string
): Promise<BridgeStatus> {
  const qs = new URLSearchParams({
    txHash,
    bridge: "lifi",
    fromChain,
    toChain,
  });

  const res = await fetch(`${BASE_URL}/status?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`LI.FI status error (${res.status})`);
  }

  return res.json();
}
