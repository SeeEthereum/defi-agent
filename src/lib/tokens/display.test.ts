import { describe, expect, it } from "vitest";
import { cleanSymbol, displayToken, tokenWithChain } from "./display";

describe("displayToken", () => {
  it("turns OKX's native coin records into the coin people know", () => {
    // As OKX `wallet balance` returns them (2026-11-17).
    const arb = displayToken({ symbol: "ARB_ETH", tokenName: "Arbitrum One", chainIndex: "42161", tokenAddress: "" });
    expect(arb).toMatchObject({ symbol: "ETH", name: "Ether", chainName: "Arbitrum", isNative: true, iconKey: "eth" });
    expect(tokenWithChain(arb)).toBe("ETH on Arbitrum");

    const op = displayToken({ symbol: "OP_ETH", tokenName: "Optimism", chainIndex: "10", tokenAddress: "" });
    expect(op).toMatchObject({ symbol: "ETH", name: "Ether", chainName: "Optimism" });

    const bnb = displayToken({ symbol: "BNB", tokenName: "BNB Chain", chainIndex: 56, tokenAddress: "" });
    expect(bnb).toMatchObject({ symbol: "BNB", name: "BNB", chainName: "BNB Chain" });

    const pol = displayToken({ symbol: "POL", chainIndex: 137, tokenContractAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" });
    expect(pol).toMatchObject({ symbol: "POL", isNative: true });
  });

  it("calls USD₮0 what it is for people: USDT", () => {
    const t = displayToken({ symbol: "USD₮0", tokenName: "USD₮0", chainIndex: "42161", tokenAddress: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" });
    expect(t).toMatchObject({ symbol: "USDT", name: "Tether USD (USDT0)", iconKey: "usdt", isNative: false });
  });

  it("keeps a token's own name, cut when it is long", () => {
    const t = displayToken({ tokenSymbol: "PHIGHT", tokenName: "Phight Company", chainIndex: "1", tokenContractAddress: "0x7efd" });
    expect(t).toMatchObject({ symbol: "PHIGHT", name: "Phight Company", chainName: "Ethereum" });
    const long = displayToken({ symbol: "X".repeat(30), tokenName: "Y".repeat(80) });
    expect(long.symbol).toHaveLength(12);
    expect(Array.from(long.name)).toHaveLength(32);
    expect(long.chainName).toBeNull();
  });

  it("finds the underlying logo for Fluid's tokens and bridged USDC", () => {
    expect(displayToken({ symbol: "fUSDC" }).iconKey).toBe("usdc");
    expect(displayToken({ symbol: "USDC.e" })).toMatchObject({ symbol: "USDC.e", name: "USD Coin (bridged)", iconKey: "usdc" });
  });

  it("names chains outside the trading list", () => {
    expect(displayToken({ symbol: "SOL", chainIndex: "501", tokenAddress: "" })).toMatchObject({ symbol: "SOL", chainName: "Solana", name: "Solana" });
  });
});

describe("cleanSymbol", () => {
  it("only strips chain prefixes in front of a known coin", () => {
    expect(cleanSymbol("BASE_ETH")).toBe("ETH");
    expect(cleanSymbol("MY_TOKEN")).toBe("MY_TOKEN");
    expect(cleanSymbol("  pepe ")).toBe("pepe");
  });
});
