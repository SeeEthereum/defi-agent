import { describe, it, expect } from "vitest";
import { searchTokens } from "./token-search";

// The order LI.FI returned for "USDC" on Ethereum in a live check: a pool
// token whose name mentions USDC came before USDC itself.
const LIST = [
  { symbol: "3Crv", name: "DAI / USDC / USDT", address: "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490" },
  { symbol: "WETH", name: "Wrapped Ether", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
  { symbol: "aEthUSDC", name: "Aave Ethereum USDC", address: "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c" },
  { symbol: "USDC.e", name: "Bridged USDC", address: "0x0000000000000000000000000000000000000001" },
  { symbol: "USDC", name: "USD Coin", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  { symbol: "usdcPlus", name: "USDC Plus", address: "0x0000000000000000000000000000000000000002" },
];

const symbols = (q: string) => searchTokens(LIST, q).map((t) => t.symbol);

describe("searchTokens", () => {
  it("puts the exact symbol first, then symbols that start with the query", () => {
    expect(symbols("USDC")).toEqual(["USDC", "USDC.e", "usdcPlus", "aEthUSDC", "3Crv"]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(symbols("  usdc ")[0]).toBe("USDC");
  });

  it("finds a token by its pasted contract address", () => {
    expect(symbols("0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eB48")).toEqual(["USDC"]);
  });

  it("ranks a name that starts with the query above a symbol that only contains it", () => {
    expect(symbols("wrapped")).toEqual(["WETH"]);
    expect(symbols("usd")).toEqual(["USDC.e", "USDC", "usdcPlus", "aEthUSDC", "3Crv"]);
  });

  it("keeps the list order within the same rank", () => {
    expect(symbols("eth")).toEqual(["WETH", "aEthUSDC"]);
  });

  it("returns the list unchanged for an empty query and nothing for no match", () => {
    expect(searchTokens(LIST, "")).toBe(LIST);
    expect(symbols("doge")).toEqual([]);
  });
});
