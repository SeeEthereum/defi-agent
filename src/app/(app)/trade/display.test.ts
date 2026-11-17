import { describe, it, expect } from "vitest";
import {
  coinLabel,
  coinLogoUrl,
  formatExactPrice,
  formatLiquidation,
  formatRoe,
  fundPreviewRows,
  leverageTypeLabel,
  orderTypeLabel,
} from "./display";

describe("formatRoe (Hyperliquid sends a fraction)", () => {
  it("shows 0.05 as +5%", () => {
    expect(formatRoe("0.05")).toBe("+5%");
    expect(formatRoe("0.102")).toBe("+10.2%");
    expect(formatRoe("-0.0123")).toBe("-1.23%");
    expect(formatRoe("1.5")).toBe("+150%");
    expect(formatRoe("0")).toBe("0%");
  });

  it("never shows NaN", () => {
    expect(formatRoe(undefined)).toBe("–");
    expect(formatRoe("")).toBe("–");
    expect(formatRoe("abc")).toBe("–");
  });
});

describe("labels", () => {
  it("names leverage modes", () => {
    expect(leverageTypeLabel("cross")).toBe("Cross");
    expect(leverageTypeLabel("isolated")).toBe("Isolated");
    expect(leverageTypeLabel(undefined)).toBe("");
    expect(leverageTypeLabel("weird")).toBe("");
  });

  it("names order types; open orders without a type are limits", () => {
    expect(orderTypeLabel({})).toBe("Limit");
    expect(orderTypeLabel({ type: "limit" })).toBe("Limit");
    expect(orderTypeLabel({ reduceOnly: false })).toBe("Limit");
    expect(orderTypeLabel({ reduceOnly: true })).toBe("Limit · close only");
    expect(orderTypeLabel({ type: "Take Profit Market", reduceOnly: true })).toBe("Take-profit · close only");
    expect(orderTypeLabel({ type: "Stop Market" })).toBe("Stop-loss");
  });

  it("names coins", () => {
    expect(coinLabel("BTC")).toBe("Bitcoin");
    expect(coinLabel("HYPE")).toBe("Hyperliquid");
    expect(coinLabel("kPEPE")).toBeNull();
  });

  it("builds a logo address only for plain tickers", () => {
    expect(coinLogoUrl("HYPE")).toBe("https://app.hyperliquid.xyz/coins/HYPE.svg");
    expect(coinLogoUrl("@1")).toBeNull();
    expect(coinLogoUrl("../x")).toBeNull();
  });
});

describe("prices", () => {
  it("shows no liquidation price as a dash", () => {
    expect(formatLiquidation("0")).toBe("–");
    expect(formatLiquidation(null)).toBe("–");
    expect(formatLiquidation("52000.0")).toBe("$52,000.00");
  });

  it("keeps entered prices exact, with $ and separators", () => {
    expect(formatExactPrice("64000.5")).toBe("$64,000.5");
    expect(formatExactPrice("0.12345")).toBe("$0.12345");
    expect(formatExactPrice("1234567")).toBe("$1,234,567");
    expect(formatExactPrice("007.5")).toBe("$7.5");
    expect(formatExactPrice(undefined)).toBe("–");
    expect(formatExactPrice("abc")).toBe("–");
  });
});

describe("fundPreviewRows", () => {
  // Payloads as lib/hyperliquid/cli builds them.
  const deposit = {
    preview: true,
    amount: "50",
    from: "0x1234567890abcdef1234567890abcdef12345678",
    to: "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7",
    chain: "42161",
    est_arrival_seconds: 60,
    message: "Preview: deposit 50 USDC from Arbitrum to Hyperliquid (bridge 0x2Df1…). Resend with confirm:true.",
  };
  const withdraw = {
    preview: true,
    amount: "50",
    destination: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    fee_usdc: 1,
    net_usdc: "50",
    total_debited: "51.00",
    message: "Preview: withdraw 50 USDC received, 51.00 debited (fee $1) → 0xabc…. Resend with confirm:true.",
  };

  it("summarises a deposit", () => {
    expect(fundPreviewRows("deposit", deposit)).toEqual([
      ["You deposit", "50 USDC"],
      ["Fee", "No Hyperliquid fee"],
      ["You receive", "50 USDC"],
      ["Arrives in", "About 1 min"],
      ["From your wallet", "0x1234…5678"],
    ]);
  });

  it("summarises a withdrawal", () => {
    expect(fundPreviewRows("withdraw", withdraw)).toEqual([
      ["You withdraw", "50 USDC"],
      ["Fee", "1 USDC"],
      ["Total debited", "51 USDC"],
      ["You receive", "50 USDC"],
      ["Arrives in", "2 to 5 min"],
      ["To your wallet", "0xabcd…abcd"],
    ]);
  });

  it("never shows flags, chain ids, the bridge or the API message", () => {
    for (const [mode, payload] of [
      ["deposit", deposit],
      ["withdraw", withdraw],
    ] as const) {
      const text = fundPreviewRows(mode, payload).flat().join(" ");
      expect(text).not.toMatch(/true|42161|confirm|Preview|0x2Df1|seconds|NaN|undefined/);
    }
  });

  it("drops rows it cannot read", () => {
    expect(fundPreviewRows("withdraw", { amount: "abc" })).toEqual([["Arrives in", "2 to 5 min"]]);
  });
});
