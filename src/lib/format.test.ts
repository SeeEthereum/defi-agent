import { describe, expect, it } from "vitest";
import { MISSING, formatAmount, formatCompactUsd, formatPercent, formatPrice, formatUsd } from "./format";

describe("formatUsd", () => {
  it("reads like money", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd("0.004")).toBe("< $0.01");
    expect(formatUsd(-0.004)).toBe("> -$0.01");
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatUsd(-12.3)).toBe("-$12.30");
    expect(formatUsd(12.3, { sign: true })).toBe("+$12.30");
    expect(formatUsd(1_234_567)).toBe("$1.23M");
    expect(formatUsd(2_000_000_000)).toBe("$2B");
    expect(formatUsd(undefined)).toBe(MISSING);
    expect(formatUsd("abc")).toBe(MISSING);
  });
});

describe("formatPrice", () => {
  it("never uses scientific notation", () => {
    expect(formatPrice(91234.567)).toBe("$91,234.57");
    expect(formatPrice(1)).toBe("$1.00");
    expect(formatPrice(0.99968788)).toBe("$0.9997");
    expect(formatPrice(0.0000937)).toBe("$0.0000937");
    expect(formatPrice(9.37e-7)).toBe("$0.0₆937");
    expect(formatPrice(1.13e-10)).toBe("$0.0₉113");
    expect(formatPrice("0.000132")).toBe("$0.000132");
    expect(formatPrice(0)).toBe("$0");
    expect(formatPrice(null)).toBe(MISSING);
  });
});

describe("formatAmount", () => {
  it("shows dust readably, without exponents", () => {
    expect(formatAmount("0.000002")).toBe("0.000002");
    expect(formatAmount("0.0000271234")).toBe("0.00002712");
    expect(formatAmount(1e-9)).toBe("< 0.00000001");
    expect(formatAmount("1234.567891")).toBe("1,234.5679");
    expect(formatAmount(0.5)).toBe("0.5");
    expect(formatAmount(12_345_678_901)).toBe("12.35B");
    expect(formatAmount(0)).toBe("0");
    expect(formatAmount(undefined)).toBe(MISSING);
  });
});

describe("formatCompactUsd and formatPercent", () => {
  it("compacts big figures", () => {
    expect(formatCompactUsd(950)).toBe("$950");
    expect(formatCompactUsd(12_400)).toBe("$12.4K");
    expect(formatCompactUsd(3_100_000)).toBe("$3.1M");
    expect(formatCompactUsd(5.5)).toBe("$5.5");
  });

  it("formats percentages", () => {
    expect(formatPercent(3.2)).toBe("3.2%");
    expect(formatPercent(3.2, { sign: true })).toBe("+3.2%");
    expect(formatPercent(-12.345)).toBe("-12.3%");
    expect(formatPercent(0.004)).toBe("< 0.01%");
    expect(formatPercent(250)).toBe("250%");
    expect(formatPercent(0)).toBe("0%");
  });
});
