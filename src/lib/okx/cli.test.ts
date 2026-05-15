/**
 * Tests for the pure helpers in cli.ts.
 *
 * The gasLimit normalization regression is documented in commit dbe77c5
 * (fix(bridge): normalize hex gasLimit before passing to onchainos CLI).
 * This test pins that behavior so a future cleanup doesn't accidentally
 * undo it.
 */
import { describe, it, expect } from "vitest";
import { normalizeGasLimit } from "./cli";

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
