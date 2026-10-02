/**
 * NEAR Intents 1Click Swap API — confidential swaps.
 *
 * Flow: quote (dry) → quote (live, returns a one-time deposit address) →
 * the session wallet transfers exactly `amountIn` to that address → solvers
 * settle on the NEAR private shard and pay `recipient` on the destination
 * chain, or refund `refundTo` on the origin chain.
 *
 * Every quote is requested with `confidentiality: "basic"`. The partner key
 * (NEAR_INTENTS_API_KEY) is what authorizes confidential quotes; it stays on
 * the server and is never sent to the browser.
 *
 * Privacy only holds if the recipient is not linked to the sender, so the
 * routes refuse to send to the session wallet itself (see recipient.ts).
 */

import { CHAINS } from "@/lib/chains";
import { NATIVE_TOKEN } from "@/lib/api/validation";

const BASE_URL = "https://1click.chaindefuser.com";
const TIMEOUT_MS = 15_000;
const TOKENS_TTL_MS = 5 * 60_000;

/** 1Click `blockchain` codes for the chains this app supports. */
const BLOCKCHAIN_TO_CHAIN: Record<string, number> = {
  eth: CHAINS.ethereum.chainIndex,
  arb: CHAINS.arbitrum.chainIndex,
  base: CHAINS.base.chainIndex,
  bsc: CHAINS.bnb.chainIndex,
  pol: CHAINS.polygon.chainIndex,
  op: CHAINS.optimism.chainIndex,
};

export class OneClickError extends Error {
  constructor(message: string, public status: number | null = null) {
    super(message);
    this.name = "OneClickError";
  }
}

export interface ConfidentialToken {
  chainIndex: number;
  /** Lowercase ERC-20 address, or NATIVE_TOKEN for the chain's coin. */
  address: string;
  symbol: string;
  decimals: number;
  /** 1Click asset id — never shown to the user, only sent back to 1Click. */
  assetId: string;
  priceUsd: number | null;
}

export interface OneClickQuote {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  minAmountOut: string;
  timeEstimate: number;
  refundFee?: string;
  withdrawFee?: string;
  /** Present only on live (non-dry) quotes. */
  depositAddress?: string;
  depositMemo?: string;
}

export type OneClickStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface OneClickStatusResult {
  status: OneClickStatus;
  amountOutFormatted?: string;
  refundedAmountFormatted?: string;
  destinationTxHash?: string;
  originTxHash?: string;
}

function apiKey(): string {
  const key = process.env.NEAR_INTENTS_API_KEY?.trim();
  if (!key) throw new OneClickError("Confidential swaps are not configured on this server.");
  return key;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey(),
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof OneClickError) throw error;
    throw new OneClickError("The confidential swap service did not respond.");
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const message = typeof body?.message === "string" ? body.message : `HTTP ${res.status}`;
    throw new OneClickError(message, res.status);
  }
  return body as T;
}

let tokensCache: { at: number; tokens: ConfidentialToken[] } | null = null;

/** Tokens 1Click supports on this app's chains. Cached for five minutes. */
export async function listConfidentialTokens(): Promise<ConfidentialToken[]> {
  if (tokensCache && Date.now() - tokensCache.at < TOKENS_TTL_MS) return tokensCache.tokens;

  const raw = await call<Array<Record<string, unknown>>>("/v0/tokens");
  const tokens: ConfidentialToken[] = [];
  for (const t of Array.isArray(raw) ? raw : []) {
    const chainIndex = BLOCKCHAIN_TO_CHAIN[String(t.blockchain)];
    if (!chainIndex || typeof t.assetId !== "string" || typeof t.symbol !== "string") continue;
    const decimals = Number(t.decimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) continue;

    const contract = typeof t.contractAddress === "string" ? t.contractAddress.toLowerCase() : null;
    if (contract !== null && !/^0x[0-9a-f]{40}$/.test(contract)) continue;

    tokens.push({
      chainIndex,
      address: contract ?? NATIVE_TOKEN,
      symbol: t.symbol,
      decimals,
      assetId: t.assetId,
      priceUsd: typeof t.price === "number" ? t.price : null,
    });
  }

  tokensCache = { at: Date.now(), tokens };
  return tokens;
}

/** The 1Click token for an (address, chain) pair, or null if unsupported. */
export async function findConfidentialToken(
  chainIndex: number,
  address: string
): Promise<ConfidentialToken | null> {
  const wanted = address.toLowerCase();
  const tokens = await listConfidentialTokens();
  return tokens.find((t) => t.chainIndex === chainIndex && t.address === wanted) ?? null;
}

/** Slippage tolerance sent to 1Click, in basis points. */
export const SLIPPAGE_BPS = 100;

export async function requestConfidentialQuote(params: {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
}): Promise<OneClickQuote> {
  const body = {
    dry: params.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: params.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: params.destinationAsset,
    amount: params.amount,
    recipient: params.recipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo: params.refundTo,
    refundType: "ORIGIN_CHAIN",
    confidentiality: "basic",
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  const res = await call<{ quote?: OneClickQuote }>("/v0/quote", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.quote || typeof res.quote.amountOut !== "string") {
    throw new OneClickError("The confidential swap service returned no quote.");
  }
  return res.quote;
}

/** Tell 1Click the deposit was sent, so it does not wait for its own indexer. */
export async function submitDepositTx(depositAddress: string, txHash: string): Promise<void> {
  await call("/v0/deposit/submit", {
    method: "POST",
    body: JSON.stringify({ depositAddress, txHash }),
  });
}

const STATUSES = new Set<OneClickStatus>([
  "PENDING_DEPOSIT",
  "KNOWN_DEPOSIT_TX",
  "INCOMPLETE_DEPOSIT",
  "PROCESSING",
  "SUCCESS",
  "REFUNDED",
  "FAILED",
]);

function firstHash(list: unknown): string | undefined {
  if (!Array.isArray(list)) return undefined;
  const hash = (list[0] as { hash?: unknown } | undefined)?.hash;
  return typeof hash === "string" ? hash : undefined;
}

export async function getSwapStatus(depositAddress: string): Promise<OneClickStatusResult> {
  const res = await call<Record<string, unknown>>(
    `/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`
  );
  const status = res.status as OneClickStatus;
  if (!STATUSES.has(status)) throw new OneClickError("Unknown swap status.");
  const details = (res.swapDetails ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    status,
    amountOutFormatted: text(details.amountOutFormatted),
    refundedAmountFormatted: text(details.refundedAmountFormatted),
    destinationTxHash: firstHash(details.destinationChainTxHashes),
    originTxHash: firstHash(details.originChainTxHashes),
  };
}
