import { describe, it, expect } from "vitest";
import {
  EVM_ADDRESS,
  allowanceLabel,
  approvalRisk,
  isUnlimitedAllowance,
  networkName,
  parseAddresses,
  riskLabels,
  riskTier,
  taxIsHigh,
  taxLabel,
  tokenRisk,
  tokenTitle,
  tokensParam,
} from "./display";

describe("risk levels", () => {
  it("reads OKX's words and the older numbers", () => {
    expect(riskTier("CRITICAL")).toBe("critical");
    expect(riskTier("HIGH")).toBe("high");
    expect(riskTier("medium")).toBe("medium");
    expect(riskTier("LOW")).toBe("low");
    expect(riskTier("1")).toBe("low");
    expect(riskTier("2")).toBe("medium");
    expect(riskTier(3)).toBe("high");
    expect(riskTier("??")).toBeNull();
    expect(riskTier(undefined)).toBeNull();
  });

  it("labels a token's risk without raw codes", () => {
    expect(tokenRisk("CRITICAL")).toEqual({ label: "Dangerous", tone: "bad" });
    expect(tokenRisk("HIGH")).toEqual({ label: "High risk", tone: "bad" });
    expect(tokenRisk("MEDIUM")).toEqual({ label: "Medium risk", tone: "warn" });
    expect(tokenRisk("LOW")).toEqual({ label: "Looks safe", tone: "ok" });
    expect(tokenRisk("SOMETHING_NEW")).toEqual({ label: "Not rated", tone: "flat" });
  });

  it("labels an approval's risk in plain words, or not at all", () => {
    expect(approvalRisk("2")?.label).toBe("Medium risk");
    expect(approvalRisk("medium")?.label).toBe("Medium risk");
    expect(approvalRisk("1")?.label).toBe("Low risk");
    expect(approvalRisk("HIGH")?.label).toBe("High risk");
    expect(approvalRisk("x")).toBeNull();
    expect(approvalRisk(null)).toBeNull();
  });
});

describe("networkName", () => {
  it("names a chain and never prints its id", () => {
    expect(networkName("42161")).toBe("Arbitrum");
    expect(networkName(1)).toBe("Ethereum");
    expect(networkName("999999")).toBe("Unknown network");
    expect(networkName(undefined)).toBe("Unknown network");
  });
});

describe("taxes (OKX sends percent)", () => {
  it("prints the percent as sent", () => {
    expect(taxLabel("5")).toBe("5%");
    expect(taxLabel("0")).toBe("0%");
    expect(taxLabel("12.5")).toBe("12.5%");
    expect(taxLabel(3)).toBe("3%");
  });

  it("never prints NaN", () => {
    expect(taxLabel(null)).toBe("–");
    expect(taxLabel(undefined)).toBe("–");
    expect(taxLabel("")).toBe("–");
    expect(taxLabel("abc")).toBe("–");
  });

  it("flags taxes above 5%", () => {
    expect(taxIsHigh("10")).toBe(true);
    expect(taxIsHigh("5")).toBe(false);
    expect(taxIsHigh("abc")).toBe(false);
    expect(taxIsHigh(null)).toBe(false);
  });
});

describe("tokenTitle", () => {
  it("cleans the symbol", () => {
    expect(tokenTitle({ symbol: "USD₮0", chainIndex: "42161", address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" }).title).toBe("USDT");
    expect(tokenTitle({ symbol: "PEPE", chainIndex: 1, address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" }).title).toBe("PEPE");
  });

  it("names a token without symbol by its address, never by an id", () => {
    const t = tokenTitle({ address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" });
    expect(t.title).toBe("Token 0x6982…1933");
    expect(t.iconSymbol).toBe("?");
    expect(t.named).toBe(false);
    expect(tokenTitle({}).title).toBe("Unknown token");
  });
});

describe("riskLabels", () => {
  it("turns OKX's flags into plain words", () => {
    expect(riskLabels({ isLowLiquidity: true, isNotOpenSource: true, isMintable: true })).toEqual([
      "Low liquidity",
      "Code is not public",
    ]);
  });

  it("does not repeat the same label", () => {
    expect(riskLabels({ isWash: true, isWash2: true })).toEqual(["Fake trading volume"]);
  });

  it("only counts the asset-edit flag on Solana", () => {
    expect(riskLabels({ isHasAssetEditAuth: true, chainId: "1" })).toEqual([]);
    expect(riskLabels({ isHasAssetEditAuth: true, chainId: "501" })).toEqual(["Owner can change balances"]);
  });

  it("never shows JSON or internal codes from a risk list", () => {
    const labels = riskLabels({
      riskItems: [
        { name: "SPENDER_ADDRESS_BLACK", description: { en: "x" } },
        { foo: 1 },
        "isLowLiquidity",
        "SOME_UNKNOWN_CODE",
        "Liquidity is very thin",
      ],
    });
    expect(labels).toEqual(["Spender is blacklisted", "Low liquidity", "Liquidity is very thin"]);
    for (const l of labels) expect(l).not.toMatch(/[{}_]/);
  });

  it("says when OKX flags a token without naming a reason", () => {
    expect(riskLabels({ riskLevel: "HIGH" })).toEqual(["Flagged by OKX's checks"]);
    expect(riskLabels({ riskLevel: "LOW" })).toEqual([]);
    expect(riskLabels({ riskLevel: "CRITICAL", isHoneypot: true })).toEqual([]);
  });
});

describe("allowances", () => {
  it("spots unlimited allowances", () => {
    expect(isUnlimitedAllowance("unlimited")).toBe(true);
    expect(isUnlimitedAllowance("115792089237316195423570985008687907853269984665640564039457584007913129639935")).toBe(true);
    expect(isUnlimitedAllowance("1000000")).toBe(false);
    expect(isUnlimitedAllowance(undefined)).toBe(false);
  });

  it("never shows base units", () => {
    expect(allowanceLabel({ remainAmtPrecise: "1500.5" }, false)).toBe("1,500.5");
    expect(allowanceLabel({ remainAmtPrecise: "0.000123" }, false)).toBe("0.000123");
    expect(allowanceLabel({}, false)).toBe("Not known");
    expect(allowanceLabel({ remainAmtPrecise: "abc" }, false)).toBe("Not known");
    expect(allowanceLabel({ remainAmtPrecise: "5" }, true)).toBe("Unlimited");
  });
});

describe("manual scan input", () => {
  it("splits pasted addresses", () => {
    expect(parseAddresses(" 0xa, 0xb\n0xc  ")).toEqual(["0xa", "0xb", "0xc"]);
    expect(parseAddresses("")).toEqual([]);
  });

  it("checks the address shape", () => {
    expect(EVM_ADDRESS.test("0xdac17f958d2ee523a2206206994597c13d831ec7")).toBe(true);
    expect(EVM_ADDRESS.test("1:0xdac17f958d2ee523a2206206994597c13d831ec7")).toBe(false);
    expect(EVM_ADDRESS.test("0x123")).toBe(false);
  });

  it("builds the API's chain:address list", () => {
    expect(tokensParam("1", ["0xa", "0xb"])).toBe("1:0xa,1:0xb");
    expect(tokensParam(42161, ["0xa"])).toBe("42161:0xa");
  });
});
