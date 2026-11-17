import { beforeEach, describe, expect, it, vi } from "vitest";

const okxGet = vi.hoisted(() => vi.fn());
vi.mock("./openapi", () => ({ okxGet }));

const { dexQuote, dexSwap } = await import("./dex-api");

beforeEach(() => {
  okxGet.mockReset();
  okxGet.mockResolvedValue([{ ok: true }]);
});

describe("price impact protection", () => {
  // OKX reads it as a percentage: "0.9" refused anything above 0.9 %.
  it("leaves quotes uncapped so the page sees the real impact", async () => {
    await dexQuote({ chainIndex: "42161", fromTokenAddress: "0xa", toTokenAddress: "0xb", amount: "1" });
    expect(okxGet.mock.calls[0][1]).toMatchObject({ priceImpactProtectionPercent: "100" });
  });

  it("caps the swap itself at the 10 % the app refuses above", async () => {
    await dexSwap({
      chainIndex: "42161",
      fromTokenAddress: "0xa",
      toTokenAddress: "0xb",
      amount: "1",
      userWalletAddress: "0xc",
    });
    expect(okxGet.mock.calls[0][1]).toMatchObject({ priceImpactProtectionPercent: "10" });
  });
});
