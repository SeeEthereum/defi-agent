import { describe, expect, it } from "vitest";
import { exceedsSpendable, fromBaseUnits, gasReserve, knownDecimals, maxSpendable, toBaseUnits } from "./amount-guards";

const ETH_MAINNET = { native: true, chainIndex: 1, decimals: 18 };
const ETH_BASE = { native: true, chainIndex: 8453, decimals: 18 };
const USDC = { native: false, chainIndex: 8453, decimals: 6 };

describe("gasReserve", () => {
  it("keeps 0.002 on Ethereum and 0.0005 elsewhere, like swap's Max", () => {
    expect(gasReserve(1)).toBe("0.002");
    expect(gasReserve("1")).toBe("0.002");
    expect(gasReserve(42161)).toBe("0.0005");
    expect(gasReserve(null)).toBe("0.0005");
  });
});

describe("base units", () => {
  it("round-trips and cuts extra digits", () => {
    expect(toBaseUnits("1.5", 6)).toBe(1_500_000n);
    expect(toBaseUnits("1,5", 6)).toBe(1_500_000n);
    expect(toBaseUnits("0.1234567", 6)).toBe(123_456n);
    expect(toBaseUnits("1e-7", 18)).toBeNull();
    expect(toBaseUnits("", 18)).toBeNull();
    expect(fromBaseUnits(1_500_000n, 6)).toBe("1.5");
    expect(fromBaseUnits(5n, 6)).toBe("0.000005");
    expect(fromBaseUnits(0n, 6)).toBe("0");
  });
});

describe("maxSpendable", () => {
  it("keeps the gas reserve on the native coin", () => {
    expect(maxSpendable("0.01", ETH_MAINNET)).toEqual({ amount: "0.008", reserved: "0.002" });
    expect(maxSpendable("0.01", ETH_BASE)).toEqual({ amount: "0.0095", reserved: "0.0005" });
  });

  it("gives nothing when the native balance does not cover the reserve", () => {
    expect(maxSpendable("0.0004", ETH_BASE)).toEqual({ amount: null, reserved: "0.0005" });
    expect(maxSpendable("0.0005", ETH_BASE)).toEqual({ amount: null, reserved: "0.0005" });
  });

  it("uses the full balance of a token", () => {
    expect(maxSpendable("12.345678", USDC)).toEqual({ amount: "12.345678", reserved: null });
  });

  it("gives nothing for an unreadable balance", () => {
    expect(maxSpendable("abc", USDC)).toEqual({ amount: null, reserved: null });
  });
});

describe("exceedsSpendable", () => {
  it("compares tokens to the full balance", () => {
    expect(exceedsSpendable("12.345678", "12.345678", USDC)).toBe(false);
    expect(exceedsSpendable("12.345679", "12.345678", USDC)).toBe(true);
  });

  it("compares the native coin to the balance less the reserve", () => {
    expect(exceedsSpendable("0.008", "0.01", ETH_MAINNET)).toBe(false);
    expect(exceedsSpendable("0.0081", "0.01", ETH_MAINNET)).toBe(true);
    expect(exceedsSpendable("0.0001", "0.0004", ETH_BASE)).toBe(true);
  });

  it("is null when a number can't be read", () => {
    expect(exceedsSpendable("", "1", USDC)).toBeNull();
    expect(exceedsSpendable("1", "1e-7", USDC)).toBeNull();
  });
});

describe("knownDecimals", () => {
  it("reads numbers and numeric strings", () => {
    expect(knownDecimals(6)).toBe(6);
    expect(knownDecimals("18")).toBe(18);
    expect(knownDecimals(0)).toBe(0);
    expect(knownDecimals("0")).toBe(0);
  });

  it("is null when the data lacks them, never 18 by default", () => {
    for (const raw of [undefined, null, "", "  ", "abc", 6.5, -1, 256, true]) {
      expect(knownDecimals(raw), String(raw)).toBeNull();
    }
  });

  it("falls back to the chain's native decimals when given", () => {
    expect(knownDecimals(undefined, 18)).toBe(18);
    expect(knownDecimals("", 18)).toBe(18);
    expect(knownDecimals("6", 18)).toBe(6);
  });
});
