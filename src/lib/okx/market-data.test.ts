import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const okxGet = vi.fn();
const okxPost = vi.fn();

vi.mock("./openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./openapi")>();
  return { ...actual, okxGet: (...a: unknown[]) => okxGet(...a), okxPost: (...a: unknown[]) => okxPost(...a) };
});

import { MarketDataPausedError, OkxApiError } from "./openapi";
import {
  addressTrackerActivities,
  clearStaleMarketData,
  heldTokens,
  leaderboardList,
  marketKline,
  marketPrice,
  namedCandles,
  parseTokenList,
  resolveChain,
  resolveChains,
  securityDappScan,
  securityTokenScan,
  signalList,
  tokenHotTokens,
  tokenSearch,
} from "./market-data";
import { invalidate, _peekCache } from "@/lib/cache";

function clearCache() {
  for (const { key } of _peekCache()) invalidate(key);
  clearStaleMarketData();
}

beforeEach(() => {
  clearCache();
  okxGet.mockReset();
  okxPost.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("chains", () => {
  it("resolves names and aliases the CLI accepted, and passes ids through", () => {
    expect(resolveChain("ethereum")).toBe("1");
    expect(resolveChain("BSC")).toBe("56");
    expect(resolveChain("x layer")).toBe("196");
    expect(resolveChain("8453")).toBe("8453");
    expect(resolveChains(" eth , sol,42161")).toBe("1,501,42161");
  });
});

describe("requests match what the CLI sent", () => {
  it("price: one POST item, trimmed address, error on no data", async () => {
    okxPost.mockResolvedValueOnce([{ price: "1" }]);
    const r = await marketPrice({ address: " 0xAbC ", chain: "ethereum" });
    expect(okxPost).toHaveBeenCalledWith("/api/v6/dex/market/price", [{ chainIndex: "1", tokenContractAddress: "0xAbC" }]);
    expect(r).toEqual({ ok: true, data: [{ price: "1" }], raw: "" });

    okxPost.mockResolvedValueOnce([]);
    await expect(marketPrice({ address: "0xdef", chain: "1" })).rejects.toThrow(/No price data/);
  });

  it("kline: defaults bar 1H and limit 100, candles become named objects", async () => {
    okxGet.mockResolvedValueOnce([["1", "2", "3", "4", "5", "6", "7", "1", "x"]]);
    const r = await marketKline({ address: "0xa", chain: "base" });
    expect(okxGet).toHaveBeenCalledWith("/api/v6/dex/market/candles", {
      chainIndex: "8453",
      tokenContractAddress: "0xa",
      bar: "1H",
      limit: "100",
    });
    expect(r.data).toEqual([{ ts: "1", o: "2", h: "3", l: "4", c: "5", vol: "6", volUsd: "7", confirm: "1", unknown: "x" }]);
    expect(namedCandles({ not: "an array" })).toEqual({ not: "an array" });
  });

  it("token search: chains default to 1,501, limit 20, empty query refused", async () => {
    okxGet.mockResolvedValueOnce([]);
    await tokenSearch("usdc");
    expect(okxGet).toHaveBeenCalledWith("/api/v6/dex/market/token/search", { chains: "1,501", search: "usdc", limit: "20" });
    await expect(tokenSearch("  ")).rejects.toBeInstanceOf(OkxApiError);
  });

  it("hot tokens: ranking type 4 and limit 20", async () => {
    okxGet.mockResolvedValueOnce([]);
    await tokenHotTokens({ chain: "solana", rankBy: "5", timeFrame: "4" });
    expect(okxGet).toHaveBeenCalledWith("/api/v6/dex/market/token/hot-token", {
      rankingType: "4",
      chainIndex: "501",
      rankBy: "5",
      rankingTimeFrame: "4",
      riskFilter: undefined,
      limit: "20",
    });
  });

  it("signals: chainIndex and limit 20, only the filters given", async () => {
    okxPost.mockResolvedValueOnce([]);
    await signalList({ chain: "1", walletType: "1,2", minAmountUsd: "" });
    expect(okxPost).toHaveBeenCalledWith("/api/v6/dex/market/signal/list", { chainIndex: "1", limit: "20", walletType: "1,2" });
  });

  it("leaderboard and tracker: named types become codes", async () => {
    okxGet.mockResolvedValue([]);
    await leaderboardList({ chain: "1", timeFrame: "1", sortBy: "1", walletType: "smartMoney" });
    expect(okxGet).toHaveBeenLastCalledWith("/api/v6/dex/market/leaderboard/list", {
      chainIndex: "1",
      timeFrame: "1",
      sortBy: "1",
      walletType: "1",
    });
    await addressTrackerActivities({ trackerType: "kol", chain: "bsc" });
    expect(okxGet).toHaveBeenLastCalledWith(
      "/api/v6/dex/market/address-tracker/trades",
      expect.objectContaining({ trackerType: "2", chainIndex: "56" })
    );
    await expect(addressTrackerActivities({ trackerType: "multi_address" })).rejects.toThrow(/wallet address/);
  });

  it("token scan: chain:address list with our source", async () => {
    okxPost.mockResolvedValueOnce([{ isHoneypot: false }]);
    const r = await securityTokenScan({ tokens: "1:0xa, bsc:0xb" });
    expect(okxPost).toHaveBeenCalledWith("/api/v6/security/token-scan", {
      source: "albicocca",
      tokenList: [
        { chainId: "1", contractAddress: "0xa" },
        { chainId: "56", contractAddress: "0xb" },
      ],
    });
    expect(r.data).toEqual([{ isHoneypot: false }]);
    expect(() => parseTokenList("0xa")).toThrow(/chain:address/);
  });

  it("token scan by address: scans every held token, in batches of 50", async () => {
    const assets = Array.from({ length: 60 }, (_, i) => ({ chainIndex: "1", tokenContractAddress: `0x${i}` }));
    okxGet.mockResolvedValueOnce([{ tokenAssets: [...assets, { chainIndex: "1", tokenContractAddress: "" }] }]);
    okxPost.mockResolvedValueOnce(Array(50).fill({})).mockResolvedValueOnce(Array(10).fill({}));
    const r = await securityTokenScan({ address: "0xuser", chain: "1" });
    expect(okxGet).toHaveBeenCalledWith("/api/v6/dex/balance/all-token-balances-by-address", {
      address: "0xuser",
      filter: "1",
      chains: "1",
    });
    expect(okxPost).toHaveBeenCalledTimes(2);
    expect((r.data as unknown[]).length).toBe(60);
  });

  it("held tokens: accepts a flat list or tokenAssets, skips native coins", () => {
    expect(heldTokens([{ chainIndex: "1", tokenContractAddress: "0xa" }, { chainIndex: "1", tokenContractAddress: "" }])).toEqual([
      { chainId: "1", contractAddress: "0xa" },
    ]);
    expect(heldTokens({ tokenAssets: [{ chainIndex: "56", tokenContractAddress: "0xb" }] })).toEqual([
      { chainId: "56", contractAddress: "0xb" },
    ]);
    expect(heldTokens(null)).toEqual([]);
  });

  it("dapp scan: trimmed url with our source", async () => {
    okxPost.mockResolvedValueOnce({ isMalicious: false });
    await securityDappScan(" app.uniswap.org ");
    expect(okxPost).toHaveBeenCalledWith("/api/v6/security/dapp-scan", { source: "albicocca", url: "app.uniswap.org" });
  });
});

describe("cache and stale answers", () => {
  it("serves everyone from one call while fresh", async () => {
    okxPost.mockResolvedValue([{ price: "1" }]);
    await marketPrice({ address: "0xa", chain: "1" });
    await marketPrice({ address: "0xA", chain: "ethereum" });
    expect(okxPost).toHaveBeenCalledTimes(1);
  });

  it("serves the last good answer when the free share is used up or OKX is down", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 17, 12));
    okxPost.mockResolvedValueOnce([{ n: 1 }]);
    await signalList({ chain: "1" });

    vi.setSystemTime(Date.UTC(2026, 10, 17, 12, 10)); // past the cache, within 6 h
    okxPost.mockRejectedValueOnce(new MarketDataPausedError("premium"));
    expect((await signalList({ chain: "1" })).data).toEqual([{ n: 1 }]);
    okxPost.mockRejectedValueOnce(new OkxApiError("/x", "timeout", "OKX did not answer. Please try again."));
    expect((await signalList({ chain: "1" })).data).toEqual([{ n: 1 }]);

    // A real error (bad request) is not hidden.
    okxPost.mockRejectedValueOnce(new OkxApiError("/x", "51000", "OKX: Parameter chainIndex error"));
    await expect(signalList({ chain: "1" })).rejects.toThrow(/Parameter/);

    // Too old: the error comes through.
    vi.setSystemTime(Date.UTC(2026, 10, 17, 19));
    okxPost.mockRejectedValueOnce(new MarketDataPausedError("premium"));
    await expect(signalList({ chain: "1" })).rejects.toBeInstanceOf(MarketDataPausedError);
  });
});
