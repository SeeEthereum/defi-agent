import { describe, expect, it } from "vitest";
import { bridgeReview, exactAmount, minusPercent, readable, REVIEW_TTL_MS, swapReview } from "./quote-review";
import { createTranslator } from "@/i18n/translate";
import { en } from "@/i18n/messages/en";
import { it as itMessages } from "@/i18n/messages/it";

// The card's words, as the assistant page passes them.
const EN = { t: createTranslator(en, "en", "quoteReview"), locale: "en" as const };
const IT = { t: createTranslator(itMessages, "it", "quoteReview"), locale: "it" as const };

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

describe("exactAmount / readable / minusPercent", () => {
  it("keeps every digit of base units, without floating point", () => {
    expect(exactAmount("2512345678", 6)).toBe("2512.345678");
    expect(exactAmount("1000000000000000000", 18)).toBe("1");
    expect(exactAmount("1", 18)).toBe("0.000000000000000001");
    expect(exactAmount("1.5", 6)).toBeNull();
  });

  it("formats base units as people read them, never rounding up", () => {
    expect(readable("2512345678", 6)).toBe("2,512.3456");
    expect(readable("1000000000000000000", 18)).toBe("1");
    expect(readable("5", 6)).toBe("0.000005");
    // Four significant digits below 1, cut rather than rounded (0.00098765 → 0.0009876).
    expect(readable("98765", 8)).toBe("0.0009876");
    expect(readable("123456789012345678901234567890", 18)).toBe("123.46B");
  });

  it("shows dust as dust, not as 0, and a dash for a broken amount", () => {
    expect(readable("1", 18)).toBe("< 0.00000001");
    expect(readable("1200000000000", 18)).toBe("0.0000012");
    expect(readable("0", 6)).toBe("0");
    expect(readable("1.5", 6)).toBe("–");
  });

  it("takes slippage off in basis points, rounding down", () => {
    expect(minusPercent("1000000", "0.5")).toBe("995000");
    expect(minusPercent("999", "1")).toBe("989");
  });
});

describe("swapReview", () => {
  it("shows what the quote route returned, with its id and an expiry", () => {
    const review = swapReview(swapQuote, swapParams, EN, NOW)!;
    expect(review.quoteId).toBe("q-1");
    expect(review.expiresAt).toBe(NOW + REVIEW_TTL_MS);
    expect(review.rows).toEqual([
      { label: "You pay", value: "1 ETH" },
      { label: "You receive", value: "2,512.3456 USDC (about $2,512.35)" },
      { label: "Minimum received", value: "2,499.7839 USDC (slippage 0.5%)" },
      { label: "Price impact", value: "0.12%" },
      { label: "Route", value: "Uniswap V3" },
    ]);
    expect(review.warning).toBeNull();
    expect(review.blocked).toBeNull();
  });

  it("uses the card's slippage for the minimum", () => {
    const review = swapReview(swapQuote, { ...swapParams, slippage: "1" }, EN, NOW)!;
    expect(review.rows[2].value).toBe("2,487.2222 USDC (slippage 1%)");
  });

  it("names tokens as people know them: USD₮0 is USDT, ARB_ETH is ETH", () => {
    const review = swapReview(
      {
        ...swapQuote,
        fromToken: { tokenSymbol: "ARB_ETH", tokenContractAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", decimal: "18" },
        toToken: { tokenSymbol: "USD₮0", decimal: "6", tokenUnitPrice: "1" },
      },
      { ...swapParams, chain: "arbitrum" },
      EN,
      NOW
    )!;
    expect(review.rows[0].value).toBe("1 ETH");
    expect(review.rows[1].value).toBe("2,512.3456 USDT (about $2,512.35)");
  });

  it("shows the chain's own coin for a native token on BNB Chain", () => {
    const review = swapReview(
      { ...swapQuote, fromToken: { tokenSymbol: "ETH", tokenContractAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", decimal: "18" } },
      { ...swapParams, chain: "bsc" },
      EN,
      NOW
    )!;
    expect(review.rows[0].value).toBe("1 BNB");
  });

  it("shows a tiny output instead of 0, valued from the exact amount", () => {
    const review = swapReview({ ...swapQuote, toTokenAmount: "5" }, swapParams, EN, NOW)!;
    expect(review.rows[1].value).toBe("0.000005 USDC (less than $0.01)");
  });

  it("warns from 3% price impact and blocks above 10%", () => {
    expect(swapReview({ ...swapQuote, priceImpactPercentage: "4.2" }, swapParams, EN, NOW)!.warning).toMatch(/4\.2%/);
    const blocked = swapReview({ ...swapQuote, priceImpactPercentage: "-12.5" }, swapParams, EN, NOW)!;
    expect(blocked.blocked).toMatch(/12\.5%/);
    expect(blocked.warning).toBeNull();
  });

  it("refuses a response without a quote id or an output", () => {
    expect(swapReview({ ...swapQuote, quoteId: undefined }, swapParams, EN, NOW)).toBeNull();
    expect(swapReview({ ...swapQuote, toTokenAmount: "1.5" }, swapParams, EN, NOW)).toBeNull();
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
    const review = bridgeReview(bridgeQuote, params, EN, NOW)!;
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

  it("cleans LI.FI's token symbols", () => {
    const usdt0 = {
      ...bridgeQuote,
      action: { fromToken: { symbol: "USDC", decimals: 6 }, toToken: { symbol: "USD₮0", decimals: 6, chainId: 42161 } },
      estimate: { ...bridgeQuote.estimate, toAmount: "99500000", toAmountMin: "99000000" },
    };
    const review = bridgeReview(usdt0, params, EN, NOW)!;
    expect(review.rows[1].value).toBe("99.5 USDT");
    expect(review.rows[2].value).toBe("99 USDT");
  });

  it("warns when fees take 5% or more of a small transfer", () => {
    const small = { ...bridgeQuote, estimate: { ...bridgeQuote.estimate, fromAmountUSD: "5" } };
    expect(bridgeReview(small, params, EN, NOW)!.warning).toMatch(/10%/);
  });

  it("refuses a response without a quote id", () => {
    expect(bridgeReview({ ...bridgeQuote, quoteId: "" }, params, EN, NOW)).toBeNull();
  });
});

describe("in Italian", () => {
  it("labels the rows and writes the numbers the Italian way", () => {
    const review = swapReview(swapQuote, { ...swapParams, amountDisplay: "0.5", slippage: "0.5" }, IT, NOW)!;
    expect(review.rows.map((r) => r.label)).toEqual(["Paghi", "Ricevi", "Minimo ricevuto", "Impatto sul prezzo", "Percorso"]);
    expect(review.rows[0].value).toBe("0,5 ETH");
    expect(review.rows[1].value).toBe("2.512,3456 USDC (circa 2.512,35 $)");
    expect(review.rows[2].value).toBe("2.499,7839 USDC (slippage 0,5%)");
    expect(review.rows[3].value).toBe("0,12%");
  });

  it("says why a trade is held back, in Italian", () => {
    expect(swapReview({ ...swapQuote, priceImpactPercentage: "4.2" }, swapParams, IT, NOW)!.warning).toBe(
      "Impatto sul prezzo alto (4,2%): ricevi parecchio meno del prezzo di mercato."
    );
    expect(swapReview({ ...swapQuote, priceImpactPercentage: "-12.5" }, swapParams, IT, NOW)!.blocked).toMatch(/^L'impatto sul prezzo è 12,5%/);
  });
});
