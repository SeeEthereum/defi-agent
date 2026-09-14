/**
 * Tests for the pure helpers in cli.ts.
 *
 * The gasLimit normalization regression is documented in commit dbe77c5
 * (fix(bridge): normalize hex gasLimit before passing to onchainos CLI).
 * This test pins that behavior so a future cleanup doesn't accidentally
 * undo it.
 */
import { describe, it, expect } from "vitest";
import { normalizeGasLimit, parseGasStationConfirming, parseLastJsonDoc } from "./cli";

describe("normalizeGasLimit", () => {
  it("converts hex strings (LI.FI shape) to decimal", () => {
    // The exact value from the original bug report.
    expect(normalizeGasLimit("0x298dfa")).toBe("2723322");
  });

  it("handles hex with leading zeros", () => {
    expect(normalizeGasLimit("0x0001")).toBe("1");
    expect(normalizeGasLimit("0x00")).toBe("0");
  });

  it("passes decimal strings through unchanged", () => {
    expect(normalizeGasLimit("2723322")).toBe("2723322");
    expect(normalizeGasLimit("21000")).toBe("21000");
    expect(normalizeGasLimit("0")).toBe("0");
  });

  it("converts large hex values correctly (28-bit boundary)", () => {
    // 0x0FFFFFFF = 268435455 — typical "high but reasonable" gas estimate
    expect(normalizeGasLimit("0x0FFFFFFF")).toBe("268435455");
  });

  it("handles mixed-case hex (Ethereum tools are inconsistent)", () => {
    expect(normalizeGasLimit("0xABcDeF")).toBe("11259375");
  });
});

describe("parseGasStationConfirming", () => {
  it("returns null for non-confirming JSON", () => {
    expect(parseGasStationConfirming({ ok: true, data: {} })).toBeNull();
    expect(parseGasStationConfirming({ confirming: false })).toBeNull();
  });

  it("returns null for x402 payment notifications (confirming but no GS markers)", () => {
    expect(
      parseGasStationConfirming({
        confirming: true,
        notifications: [{ code: "MARKET_API_OLD_USER_POST_GRACE_QUOTA" }],
        message: "Payment required for Market API access",
      })
    ).toBeNull();
  });

  it("detects the scene enum embedded in the message", () => {
    const parsed = parseGasStationConfirming({
      confirming: true,
      message:
        "gasStationStatus: FIRST_TIME_PROMPT — Gas Station first-time activation required",
      next: JSON.stringify({
        gasStationTokenList: [
          { feeTokenAddress: "0xUSDT", relayerId: "r1", sufficient: true },
          { feeTokenAddress: "0xUSDC", relayerId: "r2", sufficient: false },
        ],
      }),
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe("FIRST_TIME_PROMPT");
    expect(parsed!.tokenList).toHaveLength(2);
    expect(parsed!.tokenList[0].feeTokenAddress).toBe("0xUSDT");
    expect(parsed!.tokenList[0].relayerId).toBe("r1");
  });

  it("prefers the explicit gasStationStatus field over message parsing", () => {
    const parsed = parseGasStationConfirming({
      confirming: true,
      gasStationStatus: "REENABLE_ONLY",
      message: "Gas Station was disabled on this chain",
    });
    expect(parsed!.status).toBe("REENABLE_ONLY");
  });

  it("detects Scene C prompts that mention Gas Station without an enum", () => {
    const parsed = parseGasStationConfirming({
      confirming: true,
      message: "Gas Station is active on this chain. Choose a token to pay gas",
      next: JSON.stringify({
        tokenList: [{ feeTokenAddress: "0xUSDC", relayerId: "r2" }],
        defaultGasTokenAddress: "0xUSDT",
      }),
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBeUndefined();
    expect(parsed!.defaultGasTokenAddress).toBe("0xUSDT");
    expect(parsed!.tokenList[0].feeTokenAddress).toBe("0xUSDC");
  });

  it("tolerates a free-text (non-JSON) next field", () => {
    const parsed = parseGasStationConfirming({
      confirming: true,
      message: "gasStationStatus: INSUFFICIENT_ALL",
      next: "Top up your wallet first",
    });
    expect(parsed!.status).toBe("INSUFFICIENT_ALL");
    expect(parsed!.tokenList).toEqual([]);
  });

  it("drops malformed token entries missing feeTokenAddress", () => {
    const parsed = parseGasStationConfirming({
      confirming: true,
      message: "gasStationStatus: PENDING_UPGRADE",
      next: JSON.stringify({
        gasStationTokenList: [
          { feeTokenAddress: "0xOK", relayerId: "r1" },
          { symbol: "BROKEN" },
          null,
        ],
      }),
    });
    expect(parsed!.tokenList).toHaveLength(1);
    expect(parsed!.tokenList[0].feeTokenAddress).toBe("0xOK");
  });
});

describe("parseLastJsonDoc", () => {
  it("returns the last of multiple concatenated JSON documents, unwrapping {ok,data}", () => {
    const raw = `{
  "ok": true,
  "data": { "accountId": "abc", "isNew": false }
}
{
  "ok": true,
  "data": { "recommendation": "READY", "tokenList": [] }
}`;
    expect(parseLastJsonDoc(raw)).toEqual({
      recommendation: "READY",
      tokenList: [],
    });
  });

  it("returns a single document as-is when there is no envelope", () => {
    expect(parseLastJsonDoc('{"recommendation":"READY"}')).toEqual({
      recommendation: "READY",
    });
  });

  it("ignores braces inside JSON strings", () => {
    const raw = '{"data":{"message":"set {token} now","x":1}}';
    expect(parseLastJsonDoc(raw)).toEqual({ message: "set {token} now", x: 1 });
  });

  it("returns undefined for non-JSON text", () => {
    expect(parseLastJsonDoc("Session expired. Please log in")).toBeUndefined();
  });

  it("skips malformed segments and keeps the last valid one", () => {
    const raw = '{"broken": }\n{"data":{"good":true}}';
    expect(parseLastJsonDoc(raw)).toEqual({ good: true });
  });
});

describe("parseGasStationConfirming — CLI v4 additions", () => {
  it("recognizes NOT_SUPPORT_INTENTION (new in v4)", () => {
    const parsed = parseGasStationConfirming({
      confirming: true,
      message: "gasStationStatus: NOT_SUPPORT_INTENTION",
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe("NOT_SUPPORT_INTENTION");
  });

  it("parses a compact (non-pretty) v4 payload — v4 prints single-line JSON", () => {
    const parsed = parseGasStationConfirming({
      confirming: true,
      gasStationStatus: "FIRST_TIME_PROMPT",
      message: "Gas Station first-time activation required",
      next: '{"gasStationTokenList":[{"feeTokenAddress":"0xUSDT","relayerId":"r1","sufficient":true}]}',
    });
    expect(parsed!.tokenList).toHaveLength(1);
    expect(parsed!.tokenList[0].relayerId).toBe("r1");
  });
});
