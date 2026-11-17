import { describe, expect, it } from "vitest";
import { bridgeReview, minusPercent, readable, REVIEW_TTL_MS, swapReview } from "./quote-review";

const NOW = 1_000_000;

const swapQuote = {
  quoteId: "q-1",
  toTokenAmount: "2512345678",
  priceImpactPercentage: "0.12",
  fromToken: { tokenSymbol: "ETH", decimal: "18" },
  toToken: { tokenSymbol: "USDC", decimal: "6", tokenUnitPrice: "1" },
  dexRouterList: [{ subRouterList: [{ dexProtocol: [{ dexName: "Uniswap V3", percent: "100" }] }] }],
};
const swapParams = { amountDisplay: "1", fromSymbol: "ETH", toSymbol: "USDC" };

describe("readable / minusPercent", () => {
  it("formats base units without floating point", () => {
    expect(readable("2512345678", 6)).toBe("2,512.345678");
    expect(readable("1000000000000000000", 18)).toBe("1");
    expect(readable("5", 6)).toBe("0.000005");
    expect(readable("123456789012345678901234567890", 18)).toBe("123,456,789,012.345678");
  });

  it("takes slippage off in basis points, rounding down", () => {
    expect(minusPercent("1000000", "0.5")).toBe("995000");
    expect(minusPercent("999", "1")).toBe("989");
  });
});

describe("swapReview", () => {
  it("shows what the quote route returned, with its id and an expiry", () => {
    const review = swapReview(swapQuote, swapParams, NOW)!;
    expect(review.quoteId).toBe("q-1");
    expect(review.expiresAt).toBe(NOW + REVIEW_TTL_MS);
    expect(review.rows).toEqual([
      { label: "You pay", value: "1 ETH" },
      { label: "You receive", value: "2,512.345678 USDC (about $2,512.35)" },
      { label: "Minimum received", value: "2,499.783949 USDC (slippage 0.5%)" },
      { label: "Price impact", value: "0.12%" },
      { label: "Route", value: "Uniswap V3" },
    ]);
    expect(review.warning).toBeNull();
    expect(review.blocked).toBeNull();
  });

  it("uses the card's slippage for the minimum", () => {
    const review = swapReview(swapQuote, { ...swapParams, slippage: "1" }, NOW)!;
    expect(review.rows[2].value).toBe("2,487.222221 USDC (slippage 1%)");
  });

  it("warns from 3% price impact and blocks above 10%", () => {
    expect(swapReview({ ...swapQuote, priceImpactPercentage: "4.2" }, swapParams, NOW)!.warning).toMatch(/4\.2%/);
    const blocked = swapReview({ ...swapQuote, priceImpactPercentage: "-12.5" }, swapParams, NOW)!;
    expect(blocked.blocked).toMatch(/12\.5%/);
    expect(blocked.warning).toBeNull();
  });

  it("refuses a response without a quote id or an output", () => {
    expect(swapReview({ ...swapQuote, quoteId: undefined }, swapParams, NOW)).toBeNull();
    expect(swapReview({ ...swapQuote, toTokenAmount: "1.5" }, swapParams, NOW)).toBeNull();
  });
});

describe("bridgeReview", () => {
  const bridgeQuote = {
    quoteId: "b-1",
    tool: "across",
    toolDetails: { name: "Across" },
    action: {
      fromToken: { symbol: "USDC", decimals: 6 },
      toToken: { symbol: "USDC", decimals: 18 },
    },
    estimate: {
      toAmount: "99500000000000000000",
      toAmountMin: "99000000000000000000",
      fromAmountUSD: "100",
      executionDuration: 120,
      feeCosts: [{ amountUSD: "0.30" }],
      gasCosts: [{ amountUSD: "0.20" }],
    },
  };
  const params = { amountDisplay: "100", fromSymbol: "USDC", toSymbol: "USDC" };

  it("reads the output with the destination token's own decimals", () => {
    const review = bridgeReview(bridgeQuote, params, NOW)!;
    expect(review.rows).toEqual([
      { label: "You send", value: "100 USDC" },
      { label: "You receive", value: "99.5 USDC" },
      { label: "Minimum received", value: "99 USDC" },
      { label: "Fees and gas", value: "$0.50" },
      { label: "Time", value: "About 2 min" },
      { label: "Provider", value: "Across" },
    ]);
    expect(review.warning).toBeNull();
  });

  it("warns when fees take 5% or more of a small transfer", () => {
    const small = { ...bridgeQuote, estimate: { ...bridgeQuote.estimate, fromAmountUSD: "5" } };
    expect(bridgeReview(small, params, NOW)!.warning).toMatch(/10%/);
  });

  it("refuses a response without a quote id", () => {
    expect(bridgeReview({ ...bridgeQuote, quoteId: "" }, params, NOW)).toBeNull();
  });
});
