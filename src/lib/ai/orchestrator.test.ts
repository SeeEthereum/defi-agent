import { beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fluid/client", () => ({ getPublicClient: () => ({ readContract }) }));

const { executeToolCall } = await import("./orchestrator");
const { clearTokenInfoCache } = await import("./token-amount");

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const USDC_BSC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
const USDC_ARB = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

beforeEach(() => {
  clearTokenInfoCache();
  readContract.mockReset();
  readContract.mockImplementation(async ({ address, functionName }: { address: string; functionName: string }) => {
    if (functionName === "symbol") return "USDC";
    return address === USDC_BSC ? 18 : 6;
  });
});

describe("propose_swap", () => {
  it("converts the amount with the token's on-chain decimals (18 for USDC on BNB Chain)", async () => {
    const result = (await executeToolCall("propose_swap", {
      fromToken: USDC_BSC,
      toToken: NATIVE,
      amount: "1.5",
      chain: "bsc",
    })) as { action: string; params: Record<string, unknown> };

    expect(result.action).toBe("swap");
    expect(result.params).toMatchObject({
      amount: "1500000000000000000",
      amountDisplay: "1.5",
      fromSymbol: "USDC",
      toSymbol: "BNB",
    });
  });

  it("refuses more decimals than the token has, so no card is made", async () => {
    await expect(
      executeToolCall("propose_swap", { fromToken: USDC_ARB, toToken: NATIVE, amount: "1.1234567", chain: "arbitrum" })
    ).rejects.toThrow(/6 decimals/);
  });
});

describe("propose_bridge", () => {
  it("converts on the source chain and ignores model-written output and provider", async () => {
    const result = (await executeToolCall("propose_bridge", {
      fromChain: "42161",
      toChain: "56",
      fromToken: USDC_ARB,
      toToken: USDC_BSC,
      fromAmount: "100",
      estimatedOutput: "1000 USDC",
      bridge: "trust-me",
    })) as { params: Record<string, unknown> };

    expect(result.params).toEqual({
      fromChain: "42161",
      toChain: "56",
      fromToken: USDC_ARB,
      toToken: USDC_BSC,
      fromAmount: "100000000",
      amountDisplay: "100",
      fromSymbol: "USDC",
      toSymbol: "USDC",
    });
  });
});

describe("propose_hl_order", () => {
  const order = { coin: "BTC", side: "buy", size: "0.01" };

  it("needs a leverage chosen by the user", async () => {
    const result = (await executeToolCall("propose_hl_order", order)) as { error?: string; reasons?: string[] };
    expect(result.error).toBe("parameters rejected");
    expect(result.reasons?.join(" ")).toMatch(/leverage/);
  });

  it("keeps the order type, and a limit order needs a price", async () => {
    const limit = (await executeToolCall("propose_hl_order", { ...order, leverage: 3, type: "limit" })) as {
      reasons?: string[];
    };
    expect(limit.reasons?.join(" ")).toMatch(/price/);

    const ok = (await executeToolCall("propose_hl_order", {
      ...order,
      leverage: 3,
      type: "limit",
      price: "60000",
    })) as { params: Record<string, unknown> };
    expect(ok.params).toMatchObject({ type: "limit", price: "60000", leverage: 3 });

    const market = (await executeToolCall("propose_hl_order", { ...order, leverage: 2 })) as {
      params: Record<string, unknown>;
    };
    expect(market.params.type).toBe("market");
  });
});
