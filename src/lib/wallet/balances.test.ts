import { beforeEach, describe, expect, it, vi } from "vitest";

const walletBalance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/okx/cli", () => ({ walletBalance }));

const { allBalances, chainSlice, invalidateBalances } = await import("./balances");

const ALL = {
  accountId: "a",
  totalValueUsd: "3.50",
  details: [
    {
      tokenAssets: [
        { symbol: "OP_ETH", chainIndex: "10", usdValue: "1.00" },
        { symbol: "ARB_ETH", chainIndex: "42161", usdValue: "2.25" },
        { symbol: "USD₮0", chainIndex: "42161", usdValue: "0.25" },
      ],
    },
  ],
};

beforeEach(() => {
  walletBalance.mockReset();
  walletBalance.mockResolvedValue({ ok: true, data: ALL, raw: "" });
  invalidateBalances("s1");
});

describe("balances", () => {
  it("cuts one chain out of the all-chains answer, in the per-chain shape", () => {
    expect(chainSlice(ALL, "42161")).toEqual({
      details: [{ tokenAssets: [ALL.details[0].tokenAssets[1], ALL.details[0].tokenAssets[2]] }],
      totalValueUsd: "2.50",
    });
    expect(chainSlice(ALL, "1")).toEqual({ details: [{ tokenAssets: [] }], totalValueUsd: "0.00" });
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
});
