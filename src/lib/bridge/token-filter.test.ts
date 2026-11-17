import { describe, it, expect } from "vitest";
import { cleanTokenList, isJunkToken } from "./token-filter";

const token = (over: Record<string, unknown>) => ({
  address: "0x0000000000000000000000000000000000000001",
  symbol: "TKN",
  name: "Token",
  decimals: 18,
  priceUSD: "1",
  verificationStatus: "verified",
  ...over,
});

describe("isJunkToken", () => {
  it("drops tokens LI.FI's security provider flagged", () => {
    expect(isJunkToken(token({ verificationStatus: "flagged" }))).toBe(true);
  });

  it("drops a price no real token has (live example: USDCEURe at $100M)", () => {
    expect(isJunkToken(token({ symbol: "USDCEURe", priceUSD: "100090082.10439873" }))).toBe(true);
  });

  it("keeps expensive real tokens and tokens without a price", () => {
    expect(isJunkToken(token({ symbol: "WBTC", priceUSD: "64742.7" }))).toBe(false);
    expect(isJunkToken(token({ symbol: "tBTC", priceUSD: "522012.25" }))).toBe(false);
    expect(isJunkToken(token({ priceUSD: undefined }))).toBe(false);
    expect(isJunkToken(token({ verificationStatus: "unverified" }))).toBe(false);
  });
});

describe("cleanTokenList", () => {
  it("keeps the order and only the fields the picker uses", () => {
    const list = [
      token({ symbol: "USDC", name: "USD Coin", coinKey: "USDC", verificationStatusBreakdown: [{}] }),
      token({ symbol: "JUNK", verificationStatus: "flagged" }),
      token({ symbol: "WETH", name: "Wrapped Ether", logoURI: "https://example.com/weth.png" }),
    ];
    expect(cleanTokenList(list)).toEqual([
      { address: list[0].address, symbol: "USDC", name: "USD Coin", decimals: 18, logoURI: undefined, priceUSD: "1" },
      { address: list[2].address, symbol: "WETH", name: "Wrapped Ether", decimals: 18, logoURI: "https://example.com/weth.png", priceUSD: "1" },
    ]);
  });
});
