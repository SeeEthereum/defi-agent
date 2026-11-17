import { beforeEach, describe, expect, it, vi } from "vitest";

const walletBalance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/okx/cli", () => ({ walletBalance }));

const { allBalances, chainSlice, invalidateBalances, supportedTotals } = await import("./balances");
const { readHistory, resetHistoryForTests } = await import("@/lib/portfolio/history");

const ALL = {
  accountId: "a",
  totalValueUsd: "3.50",
  details: [
    {
      tokenAssets: [
        { symbol: "OP_ETH", chainIndex: "10", usdValue: "1.00" },
        { symbol: "ARB_ETH", chainIndex: "42161", usdValue: "2.25" },
        { symbol: "USD₮0", chainIndex: "42161", usdValue: "0.25" },
        // Solana: in OKX's total, not on any page of albicocca.
        { symbol: "SOL", chainIndex: "501", usdValue: "40" },
      ],
    },
  ],
};

beforeEach(() => {
  walletBalance.mockReset();
  walletBalance.mockResolvedValue({ ok: true, data: ALL, raw: "" });
  invalidateBalances("s1");
  resetHistoryForTests();
});

describe("balances", () => {
  it("cuts one chain out of the all-chains answer, in the per-chain shape", () => {
    expect(chainSlice(ALL, "42161")).toEqual({
      details: [{ tokenAssets: [ALL.details[0].tokenAssets[1], ALL.details[0].tokenAssets[2]] }],
      totalValueUsd: "2.5",
    });
    expect(chainSlice(ALL, "1")).toEqual({ details: [{ tokenAssets: [] }], totalValueUsd: "0" });
  });

  it("makes one onchainos call for a page's six per-chain requests", async () => {
    await Promise.all(["1", "42161", "8453", "56", "137", "10"].map(() => allBalances("s1")));
    expect(walletBalance).toHaveBeenCalledTimes(1);
    expect(walletBalance).toHaveBeenCalledWith();
  });

  it("asks again after a transaction", async () => {
    await allBalances("s1");
    invalidateBalances("s1");
    await allBalances("s1");
    expect(walletBalance).toHaveBeenCalledTimes(2);
  });

  it("totals the six supported chains, as the dashboard does", () => {
    const { total, byChain } = supportedTotals(ALL);
    expect(total).toBeCloseTo(3.5);
    expect(byChain).toEqual({ "1": 0, "42161": 2.5, "8453": 0, "56": 0, "137": 0, "10": 1 });
  });

  it("writes each fresh reading to the account's value history, cached ones not again", async () => {
    await allBalances("s1");
    await allBalances("s1");
    const { points } = await readHistory("a", "1d");
    expect(points).toHaveLength(1);
    expect(points[0].usd).toBeCloseTo(3.5);
    expect(walletBalance).toHaveBeenCalledTimes(1);
  });

  it("records nothing when OKX does not say which account it read", async () => {
    walletBalance.mockResolvedValue({ ok: true, data: { ...ALL, accountId: undefined }, raw: "" });
    await allBalances("s1");
    expect((await readHistory("a", "1d")).points).toEqual([]);
  });
});
