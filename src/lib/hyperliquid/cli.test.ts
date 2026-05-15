/**
 * Unit tests for the pure helpers exported from cli.ts.
 *
 * These functions encode Hyperliquid's tick-size and slippage rules. Bugs
 * here cause "Price must be divisible by tick size" or unfilled market
 * triggers — both visible only at order time, after the user clicked
 * confirm. Tests pin the rules to the documented behavior.
 */
import { describe, it, expect } from "vitest";
import { roundSize, roundPrice, tpslWorstFillPx } from "./cli";

describe("roundSize", () => {
  it("truncates (does not round) toward zero — HL rejects up-rounded sizes that exceed user intent", () => {
    // 0.0123456 → 0.01234 at 5 dp (BTC szDecimals). NOT 0.01235.
    expect(roundSize(0.0123456, 5)).toBe("0.01234");
  });

  it("formats to exactly szDecimals digits, padding with zeros", () => {
    expect(roundSize(0.01, 5)).toBe("0.01000");
    expect(roundSize(1.5, 4)).toBe("1.5000");
  });

  it("handles integer sizes for szDecimals=0", () => {
    expect(roundSize(42, 0)).toBe("42");
  });
});

describe("roundPrice", () => {
  it("BTC (szDecimals=5) rounds to integers — both the 5-sigfig and (6-5)=1-decimal caps apply, integer wins", () => {
    // mid ~ 67234.5 → integer (matches plugin docs: "BTC → integers").
    // Uses Math.round, so half-values round up: 67234.5 → 67235.
    expect(roundPrice(67234.5, 5)).toBe("67235");
    expect(roundPrice(67234.1, 5)).toBe("67234");
    expect(roundPrice(100000, 5)).toBe("100000");
  });

  it("ETH (szDecimals=4) rounds to 1 decimal place — capped by 5-sigfigs at this magnitude", () => {
    expect(roundPrice(3456.2, 4)).toBe("3456.2");
    expect(roundPrice(3456.789, 4)).toBe("3456.8");
  });

  it("SOL (szDecimals=2) rounds to 2 decimal places", () => {
    expect(roundPrice(145.67, 2)).toBe("145.67");
    expect(roundPrice(145.679, 2)).toBe("145.68");
  });

  it("low-magnitude tokens get the (6 - szDecimals) decimal cap, not unlimited precision", () => {
    // szDecimals=0 → max 6 decimals. Five sigfigs would require 7+, but cap wins.
    expect(roundPrice(0.0000123, 0)).toBe("0.000012");
  });

  it("returns input as string for non-finite or non-positive prices (defensive)", () => {
    expect(roundPrice(0, 5)).toBe("0");
    expect(roundPrice(-1, 5)).toBe("-1");
    expect(roundPrice(NaN, 5)).toBe("NaN");
    expect(roundPrice(Infinity, 5)).toBe("Infinity");
  });
});

describe("tpslWorstFillPx", () => {
  it("closing a long (sell) accepts 10% BELOW the trigger", () => {
    // Long position; SL trigger at $95k; we'll accept fills down to $85.5k.
    expect(tpslWorstFillPx(95000, false)).toBeCloseTo(85500, 5);
    // TP on long at $110k → accept down to $99k.
    expect(tpslWorstFillPx(110000, false)).toBeCloseTo(99000, 5);
  });

  it("closing a short (buy) accepts 10% ABOVE the trigger", () => {
    // Short position; SL at $105k → accept up to $115.5k.
    expect(tpslWorstFillPx(105000, true)).toBeCloseTo(115500, 5);
    // TP on short at $90k → accept up to $99k.
    expect(tpslWorstFillPx(90000, true)).toBeCloseTo(99000, 5);
  });

  it("returns triggerPx * 0.9 or 1.1 (close to — IEEE-754 floats; final rounding handled by roundPrice downstream)", () => {
    expect(tpslWorstFillPx(100, false)).toBeCloseTo(90, 10);
    expect(tpslWorstFillPx(100, true)).toBeCloseTo(110, 10);
  });
});
