/**
 * Public market and security data, straight from OKX's REST API (./openapi).
 *
 * These functions replace the onchainos CLI commands of the same name and
 * return the same `data` the CLI printed (request fields, defaults and
 * response transforms follow cli/src/commands/* of onchainos v4.6.11), so
 * routes and the assistant read them unchanged. Unlike the CLI they work for
 * a visitor who has not signed in, and spawn no process.
 *
 * Wallet-bound calls stay on the CLI, under the user's own login: the PnL of
 * the user's addresses, the approvals list, the transaction pre-check and a
 * scan of "my tokens".
 *
 * Every answer is cached for everyone, longer for the "premium" tier whose
 * free monthly quota is small. When OKX is out of reach or the free share is
 * used up, the last good answer (up to 6 hours old) is served instead of an
 * error.
 */

import { memoTTL } from "@/lib/cache";
import type { CliResult } from "./types";
import { MarketDataPausedError, OkxApiError, okxGet, okxPost } from "./openapi";

const SOURCE = "albicocca";

// ── chains ───────────────────────────────────────────────────────────────────

/** Chain names the CLI accepted (cli/src/chains.rs); numeric ids pass through. */
const CHAIN_INDEX: Record<string, string> = {
  ethereum: "1", eth: "1",
  solana: "501", sol: "501",
  bsc: "56", bnb: "56",
  polygon: "137", matic: "137",
  arbitrum: "42161", arb: "42161",
  base: "8453",
  xlayer: "196", "x layer": "196", "x-layer": "196", okb: "196",
  avalanche: "43114", avax: "43114",
  optimism: "10", op: "10",
  fantom: "250", ftm: "250",
  linea: "59144",
  scroll: "534352",
  zksync: "324",
  arc: "5042",
};

export function resolveChain(chain: string): string {
  return CHAIN_INDEX[chain.toLowerCase()] ?? chain;
}

/** A comma-separated list of chains, each trimmed and resolved. */
export function resolveChains(chains: string): string {
  return chains
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map(resolveChain)
    .join(",");
}

// ── cache with a stale fallback ──────────────────────────────────────────────

const STALE_MAX_MS = 6 * 60 * 60_000;
const MAX_STALE_ENTRIES = 2000;
const lastGood = new Map<string, { value: unknown; at: number }>();

function remember(key: string, value: unknown): void {
  lastGood.delete(key);
  lastGood.set(key, { value, at: Date.now() });
  if (lastGood.size > MAX_STALE_ENTRIES) lastGood.delete(lastGood.keys().next().value as string);
}

/** Errors worth hiding behind an older answer: OKX unreachable, busy, or the free share used up. */
function temporary(error: unknown): boolean {
  if (error instanceof MarketDataPausedError) return true;
  if (!(error instanceof OkxApiError)) return false;
  return ["timeout", "network", "rate_limited", "50011"].includes(error.code) || /^http_5\d\d$/.test(error.code);
}

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<CliResult<T>> {
  const fullKey = `okx-rest|${key}`;
  try {
    const data = await memoTTL(fullKey, ttlMs, fetcher);
    remember(fullKey, data);
    return { ok: true, data, raw: "" };
  } catch (error) {
    const stale = lastGood.get(fullKey);
    if (temporary(error) && stale && Date.now() - stale.at < STALE_MAX_MS) {
      return { ok: true, data: stale.value as T, raw: "" };
    }
    throw error;
  }
}

/** Test hook. */
export function clearStaleMarketData(): void {
  lastGood.clear();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// ── market (basic tier) ──────────────────────────────────────────────────────

export async function marketPrice(params: { address: string; chain: string }) {
  const chainIndex = resolveChain(params.chain);
  const address = params.address.trim();
  if (!address) throw new OkxApiError("/api/v6/dex/market/price", "invalid", "A token address is required.");
  return cached(`price|${chainIndex}|${address.toLowerCase()}`, 60 * SECOND, async () => {
    const data = await okxPost<unknown[]>("/api/v6/dex/market/price", [{ chainIndex, tokenContractAddress: address }]);
    if (!Array.isArray(data) || data.length === 0) {
      throw new OkxApiError("/api/v6/dex/market/price", "no_data", "No price data found for this token.");
    }
    return data;
  });
}

const CANDLE_FIELDS = ["ts", "o", "h", "l", "c", "vol", "volUsd", "confirm"];

/** OKX candles are arrays; the CLI turned each into an object keyed by position. */
export function namedCandles(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((candle) => {
    if (!Array.isArray(candle)) return candle;
    const out: Record<string, unknown> = {};
    candle.forEach((value, i) => {
      out[CANDLE_FIELDS[i] ?? "unknown"] = value;
    });
    return out;
  });
}

export async function marketKline(params: { address: string; chain: string; bar?: string; limit?: string }) {
  const chainIndex = resolveChain(params.chain);
  const bar = params.bar || "1H";
  const limit = params.limit || "100";
  return cached(`kline|${chainIndex}|${params.address.toLowerCase()}|${bar}|${limit}`, 2 * MINUTE, async () =>
    namedCandles(
      await okxGet("/api/v6/dex/market/candles", {
        chainIndex,
        tokenContractAddress: params.address,
        bar,
        limit,
      })
    )
  );
}

export async function tokenSearch(query: string, chains?: string) {
  if (!query.trim()) throw new OkxApiError("/api/v6/dex/market/token/search", "invalid", "A search query is required.");
  const chainList = resolveChains(chains || "1,501");
  return cached(`search|${chainList}|${query.toLowerCase()}`, 10 * MINUTE, () =>
    okxGet("/api/v6/dex/market/token/search", { chains: chainList, search: query, limit: "20" })
  );
}

export async function tokenHotTokens(params?: { chain?: string; rankBy?: string; timeFrame?: string; riskFilter?: string }) {
  const chainIndex = params?.chain ? resolveChain(params.chain) : undefined;
  return cached(
    `hot|${chainIndex ?? ""}|${params?.rankBy ?? ""}|${params?.timeFrame ?? ""}|${params?.riskFilter ?? ""}`,
    2 * MINUTE,
    () =>
      okxGet("/api/v6/dex/market/token/hot-token", {
        rankingType: "4",
        chainIndex,
        rankBy: params?.rankBy,
        rankingTimeFrame: params?.timeFrame,
        riskFilter: params?.riskFilter,
        limit: "20",
      })
  );
}

// ── market (premium tier: 100,000 free calls a month) ────────────────────────

export async function signalList(params: {
  chain: string;
  walletType?: string;
  minAmountUsd?: string;
  maxAmountUsd?: string;
  minAddressCount?: string;
  tokenAddress?: string;
  minMarketCapUsd?: string;
  maxMarketCapUsd?: string;
  minLiquidityUsd?: string;
  maxLiquidityUsd?: string;
}) {
  const body: Record<string, string> = { chainIndex: resolveChain(params.chain), limit: "20" };
  const optional = [
    "walletType", "minAmountUsd", "maxAmountUsd", "minAddressCount", "tokenAddress",
    "minMarketCapUsd", "maxMarketCapUsd", "minLiquidityUsd", "maxLiquidityUsd",
  ] as const;
  for (const name of optional) {
    const value = params[name];
    if (value) body[name] = value;
  }
  return cached(`signals|${JSON.stringify(body)}`, 3 * MINUTE, () => okxPost("/api/v6/dex/market/signal/list", body));
}

const LEADERBOARD_WALLET_TYPES: Record<string, string> = {
  smartMoney: "1", influencer: "2", sniper: "3", dev: "4", fresh: "5", pump: "6",
};

export async function leaderboardList(params: { chain: string; timeFrame: string; sortBy: string; walletType?: string }) {
  const query = {
    chainIndex: resolveChain(params.chain),
    timeFrame: params.timeFrame,
    sortBy: params.sortBy,
    walletType: params.walletType ? (LEADERBOARD_WALLET_TYPES[params.walletType] ?? params.walletType) : undefined,
  };
  return cached(`leaderboard|${JSON.stringify(query)}`, 15 * MINUTE, () =>
    okxGet("/api/v6/dex/market/leaderboard/list", query)
  );
}

// ── not metered ──────────────────────────────────────────────────────────────

const TRACKER_TYPES: Record<string, string> = { smart_money: "1", kol: "2", multi_address: "3" };

export async function addressTrackerActivities(params: {
  trackerType: string;
  walletAddress?: string;
  tradeType?: string;
  chain?: string;
  minVolume?: string;
  maxVolume?: string;
  minMarketCap?: string;
  maxMarketCap?: string;
}) {
  const trackerType = TRACKER_TYPES[params.trackerType] ?? params.trackerType;
  if (trackerType === "3" && !params.walletAddress) {
    throw new OkxApiError("/api/v6/dex/market/address-tracker/trades", "invalid", "A wallet address is required for this tracker.");
  }
  const query = {
    trackerType,
    walletAddress: params.walletAddress,
    tradeType: params.tradeType,
    chainIndex: params.chain ? resolveChain(params.chain) : undefined,
    minVolume: params.minVolume,
    maxVolume: params.maxVolume,
    minMarketCap: params.minMarketCap,
    maxMarketCap: params.maxMarketCap,
  };
  return cached(`tracker|${JSON.stringify(query)}`, MINUTE, () =>
    okxGet("/api/v6/dex/market/address-tracker/trades", query)
  );
}

export async function gatewayGas(chain: string) {
  const chainIndex = resolveChain(chain);
  return cached(`gas|${chainIndex}`, 15 * SECOND, () => okxGet("/api/v6/dex/pre-transaction/gas-price", { chainIndex }));
}

// ── security ─────────────────────────────────────────────────────────────────

const SCAN_BATCH = 50;

async function scanTokens(pairs: Array<{ chainId: string; contractAddress: string }>): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < pairs.length; i += SCAN_BATCH) {
    const data = await okxPost<unknown[]>("/api/v6/security/token-scan", {
      source: SOURCE,
      tokenList: pairs.slice(i, i + SCAN_BATCH),
    });
    if (Array.isArray(data)) out.push(...data);
  }
  return out;
}

/** "chain:address,chain:address" as the CLI's --tokens took it. */
export function parseTokenList(tokens: string): Array<{ chainId: string; contractAddress: string }> {
  return tokens
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const at = item.indexOf(":");
      if (at <= 0 || at === item.length - 1) {
        throw new OkxApiError("/api/v6/security/token-scan", "invalid", `Invalid token "${item}": use chain:address.`);
      }
      return { chainId: resolveChain(item.slice(0, at)), contractAddress: item.slice(at + 1) };
    });
}

type BalanceItem = { chainIndex?: unknown; tokenContractAddress?: unknown; tokenAssets?: unknown };

/** Token pairs held by an address, from either balance response shape. */
export function heldTokens(data: unknown): Array<{ chainId: string; contractAddress: string }> {
  const items: BalanceItem[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const item = value as BalanceItem;
      if (Array.isArray(item.tokenAssets)) visit(item.tokenAssets);
      else items.push(item);
    }
  };
  visit(data);
  return items
    .filter((t) => typeof t.chainIndex === "string" && typeof t.tokenContractAddress === "string" && t.tokenContractAddress !== "")
    .map((t) => ({ chainId: t.chainIndex as string, contractAddress: t.tokenContractAddress as string }));
}

/**
 * Scan the given tokens, or every token an address holds. A scan of the
 * signed-in user's own tokens (no tokens, no address) needs their login and
 * stays on the CLI.
 */
export async function securityTokenScan(params: { tokens?: string; address?: string; chain?: string }) {
  if (params.tokens) {
    const pairs = parseTokenList(params.tokens);
    if (pairs.length > SCAN_BATCH) {
      throw new OkxApiError("/api/v6/security/token-scan", "invalid", `At most ${SCAN_BATCH} tokens per scan.`);
    }
    return cached(`token-scan|${JSON.stringify(pairs).toLowerCase()}`, 10 * MINUTE, () => scanTokens(pairs));
  }
  if (params.address) {
    const address = params.address;
    const chains = params.chain ? resolveChain(params.chain) : undefined;
    return cached(`address-scan|${address.toLowerCase()}|${chains ?? ""}`, 5 * MINUTE, async () => {
      const balances = await okxGet("/api/v6/dex/balance/all-token-balances-by-address", { address, filter: "1", chains });
      const pairs = heldTokens(balances);
      return pairs.length ? scanTokens(pairs) : [];
    });
  }
  throw new OkxApiError("/api/v6/security/token-scan", "invalid", "Tokens or an address are required.");
}

export async function securityDappScan(domain: string) {
  const url = domain.trim();
  return cached(`dapp-scan|${url.toLowerCase()}`, 60 * MINUTE, () =>
    okxPost("/api/v6/security/dapp-scan", { source: SOURCE, url })
  );
}
