import { describe, it, expect } from "vitest";
import { bridgeCost, formatBridgeCost, formatCostShare } from "./cost";

// A live LI.FI quote for 0.00001 ETH from Optimism to Arbitrum (Layerswap):
// $0.0181 sent, three priced lines adding up to about $0.00196.
const SMALL_TRANSFER = {
  feeCosts: [{ amountUSD: "0.0001" }, { amountUSD: "0.001758" }],
  gasCosts: [{ amountUSD: "0.0001" }],
  fromAmountUSD: "0.0181",
};

describe("bridgeCost", () => {
  it("adds fees and gas and relates them to the amount sent", () => {
    const cost = bridgeCost(SMALL_TRANSFER.feeCosts, SMALL_TRANSFER.gasCosts, SMALL_TRANSFER.fromAmountUSD);
    expect(cost.usd).toBeCloseTo(0.001958, 6);
    expect(cost.partial).toBe(false);
    expect(cost.shareOfAmount).toBeCloseTo(0.1082, 3);
  });

  it("marks a sum with unpriced lines as partial", () => {
    const cost = bridgeCost([{ amountUSD: "1.5" }, {}], [{ amountUSD: "0.25" }], "100");
    expect(cost.usd).toBeCloseTo(1.75, 6);
    expect(cost.partial).toBe(true);
  });

  it("has no figure when nothing is priced, and no share without the amount's value", () => {
    expect(bridgeCost([{}], [{}]).usd).toBeNull();
    expect(bridgeCost([{ amountUSD: "2" }], []).shareOfAmount).toBeNull();
  });
});

describe("formatBridgeCost", () => {
  it("never shows $0.00 for a cost under a cent", () => {
    expect(formatBridgeCost(bridgeCost(SMALL_TRANSFER.feeCosts, SMALL_TRANSFER.gasCosts))).toBe("Less than $0.01");
  });

  it("shows dollars and cents, with thousands separators", () => {
    expect(formatBridgeCost({ usd: 0.3, partial: false, shareOfAmount: null })).toBe("$0.30");
    expect(formatBridgeCost({ usd: 1234.5, partial: false, shareOfAmount: null })).toBe("$1,234.50");
  });

  it("says when the figure is only a lower bound", () => {
    expect(formatBridgeCost({ usd: 1.75, partial: true, shareOfAmount: null })).toBe("At least $1.75");
    expect(formatBridgeCost({ usd: 0.004, partial: true, shareOfAmount: null })).toBe("Not fully priced");
    expect(formatBridgeCost({ usd: null, partial: true, shareOfAmount: null })).toBe("Not given");
  });

  it("keeps a real zero as $0.00", () => {
    expect(formatBridgeCost({ usd: 0, partial: false, shareOfAmount: 0 })).toBe("$0.00");
  });
});

describe("formatCostShare", () => {
  it("reports the share from 1% up", () => {
    expect(formatCostShare({ usd: 0.002, partial: false, shareOfAmount: 0.1082 })).toBe("11%");
    expect(formatCostShare({ usd: 2.4, partial: false, shareOfAmount: 0.024 })).toBe("2.4%");
  });

  it("stays quiet below 1% or without the amount's value", () => {
    expect(formatCostShare({ usd: 0.3, partial: false, shareOfAmount: 0.003 })).toBeNull();
    expect(formatCostShare({ usd: 0.3, partial: false, shareOfAmount: null })).toBeNull();
  });
});
