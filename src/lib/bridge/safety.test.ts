import { describe, expect, it } from "vitest";
import { BRIDGE_SLIPPAGE, checkMinReceived, highRiskMessage, readTokenScan, readTxScan } from "./safety";

describe("checkMinReceived", () => {
  it("accepts a minimum at exactly the requested slippage", () => {
    expect(checkMinReceived("1000000", "995000", 0.005)).toBeNull();
    expect(checkMinReceived("1000000", "1000000", 0.005)).toBeNull();
  });

  it("accepts LI.FI's rounding (live quote: 0.4 ppm under the exact floor)", () => {
    expect(checkMinReceived("19947200000000000", "19847460000000000", 0.005)).toBeNull();
  });

  it("refuses a minimum looser than the requested slippage", () => {
    // 15% slippage, as LI.FI picked on its own for one live route.
    expect(checkMinReceived("29053388", "24695380", BRIDGE_SLIPPAGE)).toMatch(/more than 0.5% below/);
    expect(checkMinReceived("1000000", "994000", 0.005)).not.toBeNull();
  });

  it("refuses a missing, zero or malformed minimum or estimate", () => {
    for (const [to, min] of [
      ["1000000", undefined],
      ["1000000", "0"],
      ["1000000", ""],
      ["1000000", "1e6"],
      [undefined, "995000"],
      ["0", "0"],
    ]) {
      expect(checkMinReceived(to, min, 0.005)).toMatch(/no guaranteed minimum/);
    }
  });
});

describe("readTxScan", () => {
  it("reads the fields swap/execute reads", () => {
    expect(readTxScan({ riskLevel: "HIGH", riskItems: ["drainer"] })).toEqual({ level: "high", reasons: ["drainer"] });
    expect(readTxScan({ risk_level: "3" }).level).toBe("high");
    expect(readTxScan({ level: "medium" }).level).toBe("medium");
    expect(readTxScan({ riskLevel: "2" }).level).toBe("medium");
  });

  it("reads OKX's documented action field", () => {
    const blocked = readTxScan({
      action: "block",
      riskItemDetail: [{ name: "black_tag", description: { en: "Target address is blacklisted" }, action: "block" }],
    });
    expect(blocked).toEqual({ level: "high", reasons: ["Target address is blacklisted"] });
    expect(readTxScan({ action: "warn", riskItemDetail: [{ name: "approve_eoa" }] })).toEqual({
      level: "medium",
      reasons: ["approve eoa"],
    });
  });

  it("takes the worse of the two signals", () => {
    expect(readTxScan({ riskLevel: "LOW", action: "block" }).level).toBe("high");
    expect(readTxScan({ riskLevel: "HIGH", action: "" }).level).toBe("high");
  });

  it("is none for a clean or empty answer", () => {
    expect(readTxScan({ action: "", riskItemDetail: [] })).toEqual({ level: "none", reasons: [] });
    expect(readTxScan(null)).toEqual({ level: "none", reasons: [] });
  });
});

describe("readTokenScan", () => {
  const TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  it("is high for a risk token or a honeypot, matching the address in any case", () => {
    expect(readTokenScan([{ tokenAddress: TOKEN.toLowerCase(), isRiskToken: true }], TOKEN).level).toBe("high");
    const honeypot = readTokenScan([{ tokenAddress: TOKEN, isHoneypot: true }], TOKEN);
    expect(honeypot.level).toBe("high");
    expect(honeypot.reasons[0]).toMatch(/honeypot/);
  });

  it("reads a riskLevel when given", () => {
    expect(readTokenScan([{ tokenAddress: TOKEN, riskLevel: "CRITICAL" }], TOKEN).level).toBe("high");
    expect(readTokenScan([{ tokenAddress: TOKEN, riskLevel: "MEDIUM" }], TOKEN).level).toBe("medium");
  });

  it("does not block a chain OKX cannot scan, or a safe token", () => {
    expect(readTokenScan([{ tokenAddress: TOKEN, isChainSupported: false, isRiskToken: true }], TOKEN).level).toBe("none");
    expect(readTokenScan([{ tokenAddress: TOKEN, isRiskToken: false }], TOKEN).level).toBe("none");
    expect(readTokenScan([], TOKEN).level).toBe("none");
  });

  it("uses a lone record without an address, but not another token's record", () => {
    expect(readTokenScan([{ isRiskToken: true }], TOKEN).level).toBe("high");
    expect(readTokenScan([{ tokenAddress: "0x0000000000000000000000000000000000000001", isRiskToken: true }], TOKEN).level).toBe("none");
  });
});

describe("highRiskMessage", () => {
  it("names the reasons, or a plain default", () => {
    expect(highRiskMessage("bridge", ["a", "b"])).toBe("Security scan flagged this bridge as high risk: a; b. Nothing was sent.");
    expect(highRiskMessage("destination token", [])).toMatch(/possible malicious activity/);
  });
});
