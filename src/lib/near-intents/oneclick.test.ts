import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Fresh module per test: the token list is cached at module level.
async function load() {
  vi.resetModules();
  return import("./oneclick");
}

beforeEach(() => {
  vi.stubEnv("NEAR_INTENTS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("listConfidentialTokens", () => {
  it("keeps only this app's chains and maps native coins to the native sentinel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          { assetId: "nep141:arb.omft.near", blockchain: "arb", symbol: "ETH", decimals: 18, contractAddress: null, price: 2600 },
          { assetId: "nep141:arb-0xaf88.omft.near", blockchain: "arb", symbol: "USDC", decimals: 6, contractAddress: "0xAF88d065e77c8cC2239327C5EDb3A432268e5831" },
          { assetId: "nep141:sol.omft.near", blockchain: "sol", symbol: "SOL", decimals: 9, contractAddress: null },
          { assetId: "bad", blockchain: "base", symbol: "BAD", decimals: 18, contractAddress: "not-an-address" },
        ])
      )
    );
    const { listConfidentialTokens } = await load();
    const tokens = await listConfidentialTokens();

    expect(tokens).toEqual([
      { chainIndex: 42161, address: NATIVE, symbol: "ETH", decimals: 18, assetId: "nep141:arb.omft.near", priceUsd: 2600 },
      { chainIndex: 42161, address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", symbol: "USDC", decimals: 6, assetId: "nep141:arb-0xaf88.omft.near", priceUsd: null },
    ]);
  });

  it("serves the second call from cache", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const { listConfidentialTokens } = await load();
    await listConfidentialTokens();
    await listConfidentialTokens();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("requestConfidentialQuote", () => {
  it("always asks for a confidential, exact-input quote that refunds on the origin chain", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      void init;
      return jsonResponse({ quote: { amountIn: "1", amountInFormatted: "1", amountOut: "2", amountOutFormatted: "2", minAmountOut: "2", timeEstimate: 20 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestConfidentialQuote } = await load();

    await requestConfidentialQuote({
      dry: true,
      originAsset: "a",
      destinationAsset: "b",
      amount: "100",
      recipient: "0x1111111111111111111111111111111111111111",
      refundTo: "0x2222222222222222222222222222222222222222",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://1click.chaindefuser.com/v0/quote");
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe("test-key");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      dry: true,
      swapType: "EXACT_INPUT",
      confidentiality: "basic",
      depositType: "ORIGIN_CHAIN",
      recipientType: "DESTINATION_CHAIN",
      refundType: "ORIGIN_CHAIN",
      refundTo: "0x2222222222222222222222222222222222222222",
    });
  });

  it("surfaces the upstream message on an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "Amount is too low" }, 400)));
    const { requestConfidentialQuote, OneClickError } = await load();
    const call = requestConfidentialQuote({
      dry: true, originAsset: "a", destinationAsset: "b", amount: "1",
      recipient: "0x1111111111111111111111111111111111111111",
      refundTo: "0x2222222222222222222222222222222222222222",
    });
    await expect(call).rejects.toBeInstanceOf(OneClickError);
    await expect(call).rejects.toThrow("Amount is too low");
  });

  it("fails closed without an API key and never calls out", async () => {
    vi.stubEnv("NEAR_INTENTS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { listConfidentialTokens } = await load();
    await expect(listConfidentialTokens()).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getSwapStatus", () => {
  it("extracts the destination tx hash and rejects unknown statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "SUCCESS",
          swapDetails: {
            amountOutFormatted: "99.97",
            destinationChainTxHashes: [{ hash: "0xabc", explorerUrl: "" }],
          },
        })
      )
    );
    const { getSwapStatus } = await load();
    expect(await getSwapStatus("0x1")).toEqual({
      status: "SUCCESS",
      amountOutFormatted: "99.97",
      refundedAmountFormatted: undefined,
      destinationTxHash: "0xabc",
      originTxHash: undefined,
    });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "WEIRD" })));
    await expect(getSwapStatus("0x1")).rejects.toThrow(/Unknown/);
  });
});
