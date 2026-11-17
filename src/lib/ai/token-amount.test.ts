import { beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fluid/client", () => ({ getPublicClient: () => ({ readContract }) }));

const { AmountError, clearTokenInfoCache, fromBaseUnits, toBaseUnits, tokenInfo } = await import("./token-amount");

const USDC_BSC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";

beforeEach(() => {
  readContract.mockReset();
  clearTokenInfoCache();
});

describe("toBaseUnits", () => {
  it("converts with the token's own decimals", () => {
    expect(toBaseUnits("1.5", 6)).toBe("1500000");
    expect(toBaseUnits("1.5", 18)).toBe("1500000000000000000");
    expect(toBaseUnits("100", 6)).toBe("100000000");
    expect(toBaseUnits("0,25", 6)).toBe("250000");
  });

  it("refuses more decimals than the token has, zero, and anything not a plain number", () => {
    expect(() => toBaseUnits("1.1234567", 6)).toThrow(AmountError);
    expect(() => toBaseUnits("0", 6)).toThrow(/greater than zero/);
    expect(() => toBaseUnits("1e6", 6)).toThrow(AmountError);
    expect(() => toBaseUnits("-1", 6)).toThrow(AmountError);
  });
});

describe("fromBaseUnits", () => {
  it("reads base units back, trimmed", () => {
    expect(fromBaseUnits("1500000", 6)).toBe("1.5");
    expect(fromBaseUnits("1234567891234567891", 18, 4)).toBe("1.2345");
    expect(fromBaseUnits("2000000", 6)).toBe("2");
  });
});

describe("tokenInfo", () => {
  it("knows the native coin without a network call", async () => {
    await expect(tokenInfo(56, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")).resolves.toEqual({ decimals: 18, symbol: "BNB" });
    expect(readContract).not.toHaveBeenCalled();
  });

  it("reads decimals and symbol from the contract and caches them", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "decimals" ? 18 : "USDC"
    );
    await expect(tokenInfo(56, USDC_BSC)).resolves.toEqual({ decimals: 18, symbol: "USDC" });
    await tokenInfo(56, USDC_BSC.toUpperCase().replace("0X", "0x"));
    expect(readContract).toHaveBeenCalledTimes(2);
  });

  it("fails clearly for an address that is not a token", async () => {
    readContract.mockRejectedValue(new Error("execution reverted"));
    await expect(tokenInfo(1, USDC_BSC)).rejects.toThrow(/is not a token on Ethereum/);
  });

  it("keeps working when the symbol cannot be read", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "decimals") return 6;
      throw new Error("no symbol");
    });
    await expect(tokenInfo(1, USDC_BSC)).resolves.toEqual({ decimals: 6, symbol: "0x8ac7…580d" });
  });
});
