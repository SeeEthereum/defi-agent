import { describe, it, expect } from "vitest";
import { leaderRow, numberOrNull, signalRow, tradesLabel, walletTypeLabels } from "./display";

describe("walletTypeLabels", () => {
  it("names OKX's signal codes", () => {
    expect(walletTypeLabels("1")).toEqual(["Smart money"]);
    expect(walletTypeLabels("2")).toEqual(["Influencer"]);
    expect(walletTypeLabels("3")).toEqual(["Whale"]);
  });

  it("reads comma lists and arrays, without repeats", () => {
    expect(walletTypeLabels("1,3")).toEqual(["Smart money", "Whale"]);
    expect(walletTypeLabels(["1", "smartMoney"], "3")).toEqual(["Smart money", "Whale"]);
  });

  it("names the leaderboard's types", () => {
    expect(walletTypeLabels("smartMoney")).toEqual(["Smart money"]);
    expect(walletTypeLabels("influencer")).toEqual(["Influencer"]);
    expect(walletTypeLabels("dev")).toEqual(["Token creator"]);
  });

  it("never prints a code it does not know", () => {
    expect(walletTypeLabels("7")).toEqual([]);
    expect(walletTypeLabels("weird_type")).toEqual([]);
    expect(walletTypeLabels(undefined, null, { a: 1 })).toEqual([]);
  });
});

describe("numberOrNull", () => {
  it("drops missing and broken values", () => {
    expect(numberOrNull(undefined)).toBeNull();
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("abc")).toBeNull();
    expect(numberOrNull(NaN)).toBeNull();
    expect(numberOrNull(true)).toBeNull();
    expect(numberOrNull("0.5")).toBe(0.5);
    expect(numberOrNull(0)).toBe(0);
  });
});

describe("signalRow", () => {
  // Shape from OKX's `signal list` documentation.
  const item = {
    timestamp: "1731830400000",
    chainIndex: "42161",
    price: "0.000000937",
    walletType: "1",
    triggerWalletCount: "4",
    triggerWalletAddress: "0xa,0xb",
    amountUsd: "15420.5",
    soldRatioPercent: "10.5",
    token: {
      tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
      symbol: "PEPE",
      name: "Pepe the Frog",
      logo: "https://static.okx.com/pepe.png",
      marketCapUsd: "2050000000",
      holders: "1000",
      top10HolderPercent: "45.2",
    },
  };

  it("reads the documented fields", () => {
    const r = signalRow(item);
    expect(r.title).toBe("PEPE");
    expect(r.subtitle).toBe("Pepe the Frog");
    expect(r.chainIndex).toBe(42161);
    expect(r.wallets).toBe(4);
    expect(r.boughtUsd).toBe(15420.5);
    expect(r.marketCapUsd).toBe(2050000000);
    expect(r.price).toBeCloseTo(0.000000937);
    expect(r.logo).toBe("https://static.okx.com/pepe.png");
    expect(r.walletTypes).toEqual(["Smart money"]);
  });

  it("keeps the sold share in percent, never as a ratio", () => {
    expect(signalRow(item).soldPercent).toBe(10.5);
    // 0.5 means half a percent, not 50%.
    expect(signalRow({ ...item, soldRatioPercent: "0.5" }).soldPercent).toBe(0.5);
    expect(signalRow({ ...item, soldRatioPercent: "n/a" }).soldPercent).toBeNull();
  });

  it("cleans OKX's machine symbols and chain-named natives", () => {
    const r = signalRow({ ...item, token: { ...item.token, symbol: "ARB_ETH", name: "Arbitrum One", tokenAddress: "" } });
    expect(r.title).toBe("ETH");
    expect(r.subtitle).toBe("Ether");
  });

  it("hides a name that only repeats the symbol", () => {
    expect(signalRow({ ...item, token: { ...item.token, name: "PEPE" } }).subtitle).toBeNull();
    expect(signalRow({ ...item, token: { ...item.token, name: "Pepe" } }).subtitle).toBeNull();
  });

  it("says Unknown token rather than ???", () => {
    const r = signalRow({ ...item, token: { ...item.token, symbol: "" } });
    expect(r.title).toBe("Unknown token");
    expect(r.subtitle).toBeNull();
  });

  it("leaves missing figures empty", () => {
    const r = signalRow({});
    expect(r.wallets).toBeNull();
    expect(r.boughtUsd).toBeNull();
    expect(r.marketCapUsd).toBeNull();
    expect(r.price).toBeNull();
    expect(r.soldPercent).toBeNull();
    expect(r.walletTypes).toEqual([]);
  });
});

describe("leaderRow", () => {
  // Shape from OKX's `leaderboard list` documentation.
  const entry = {
    walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    realizedPnlUsd: "12345.67",
    realizedPnlPercent: "0.5",
    winRatePercent: "62.5",
    avgBuyValueUsd: "800",
    txVolume: "1200000",
    txs: "1204",
    lastActiveTimestamp: "1731830400000",
  };

  it("reads percentages in percent: 0.5 is 0.5%, not 50%", () => {
    const r = leaderRow(entry);
    expect(r.returnPercent).toBe(0.5);
    expect(r.winRatePercent).toBe(62.5);
    expect(leaderRow({ ...entry, winRatePercent: "1" }).winRatePercent).toBe(1);
  });

  it("reads dollars and counts", () => {
    const r = leaderRow(entry);
    expect(r.pnlUsd).toBe(12345.67);
    expect(r.volumeUsd).toBe(1200000);
    expect(r.trades).toBe(1204);
    expect(r.address).toBe(entry.walletAddress);
  });

  it("leaves missing figures empty", () => {
    const r = leaderRow({});
    expect(r.pnlUsd).toBeNull();
    expect(r.returnPercent).toBeNull();
    expect(r.winRatePercent).toBeNull();
    expect(r.trades).toBeNull();
    expect(r.address).toBe("");
  });
});

describe("tradesLabel", () => {
  it("counts trades", () => {
    expect(tradesLabel(1)).toBe("1 trade");
    expect(tradesLabel(1204)).toBe("1,204 trades");
    expect(tradesLabel(null)).toBeNull();
  });
});
