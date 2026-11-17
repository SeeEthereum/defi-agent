import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MarketDataPausedError,
  OkxApiError,
  dailyShare,
  meterState,
  okxGet,
  okxPost,
  resetOpenApiState,
  signature,
  tierOf,
  truncateTokenMetadata,
} from "./openapi";

vi.mock("@/lib/monitoring/report", () => ({ reportServerError: vi.fn() }));

const CONFIG = {
  code: "0",
  data: [{ endpointList: { "/api/v6/dex/market/price": "basic", "/api/v6/dex/market/signal/list": "premium" } }],
};

function reply(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

/** fetch stub: the config endpoint answers CONFIG, everything else `handler`. */
function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/api/v6/dex/market/config")) return reply(CONFIG);
      return handler(url, init);
    })
  );
  return calls;
}

beforeEach(() => {
  resetOpenApiState();
  process.env.OKX_API_KEY = "key";
  process.env.OKX_SECRET_KEY = "secret";
  process.env.OKX_PASSPHRASE = "pass";
  process.env.OKX_PROJECT_ID = "project";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("signature", () => {
  it("is base64 HMAC-SHA256 of timestamp + method + path + body", () => {
    // Known value computed with Python's hmac for the same inputs.
    expect(signature("secret", "2026-11-17T12:00:00.000Z", "GET", "/api/v6/x?a=1", "")).toBe(
      "0oDbigvB1Njde9gtto5ntZUcbIjXwutIjuSA7n/FSaA="
    );
    expect(signature("secret", "t", "GET", "/p", "")).not.toBe(signature("secret", "t", "POST", "/p", ""));
  });
});

describe("truncateTokenMetadata", () => {
  it("cuts token names and symbols at 80 characters, everywhere", () => {
    const long = "x".repeat(81);
    const data = [{ tokenName: long, tokenSymbol: "OK", nested: { token: { name: long, symbol: long } } }];
    truncateTokenMetadata(data);
    expect(data[0].tokenName).toBe("x".repeat(80) + "...");
    expect(data[0].tokenSymbol).toBe("OK");
    expect(data[0].nested.token.name).toBe("x".repeat(80) + "...");
    expect(data[0].nested.token.symbol).toBe("x".repeat(80) + "...");
  });

  it("leaves a bare name alone (chains, DEXes, EIP-712 data)", () => {
    const data = { name: "y".repeat(100), chainIndex: "1" };
    truncateTokenMetadata(data);
    expect(data.name).toHaveLength(100);
  });
});

describe("requests", () => {
  it("signs a GET with the query string and sends the key headers", async () => {
    const calls = stubFetch(() => reply({ code: "0", data: [{ ok: 1 }] }));
    const data = await okxGet("/api/v6/dex/pre-transaction/gas-price", { chainIndex: "1", empty: "", none: undefined });
    expect(data).toEqual([{ ok: 1 }]);
    const call = calls.find((c) => c.url.includes("gas-price"))!;
    expect(call.url).toBe("https://web3.okx.com/api/v6/dex/pre-transaction/gas-price?chainIndex=1");
    const h = call.init.headers as Record<string, string>;
    expect(h["OK-ACCESS-KEY"]).toBe("key");
    expect(h["OK-ACCESS-PROJECT"]).toBe("project");
    expect(h["User-Agent"]).toMatch(/albicocca/);
    expect(h["OK-ACCESS-SIGN"]).toBe(
      signature("secret", h["OK-ACCESS-TIMESTAMP"], "GET", "/api/v6/dex/pre-transaction/gas-price?chainIndex=1", "")
    );
  });

  it("signs a POST with its JSON body", async () => {
    const calls = stubFetch(() => reply({ code: "0", data: [] }));
    await okxPost("/api/v6/dex/market/price", [{ chainIndex: "1", tokenContractAddress: "0xa" }]);
    const call = calls.find((c) => c.url.endsWith("/market/price"))!;
    const h = call.init.headers as Record<string, string>;
    expect(call.init.body).toBe('[{"chainIndex":"1","tokenContractAddress":"0xa"}]');
    expect(h["OK-ACCESS-SIGN"]).toBe(signature("secret", h["OK-ACCESS-TIMESTAMP"], "POST", "/api/v6/dex/market/price", String(call.init.body)));
  });

  it("turns an OKX error code into OkxApiError", async () => {
    stubFetch(() => reply({ code: "50011", msg: "Too many requests", data: [] }));
    await expect(okxGet("/api/v6/security/token-scan")).rejects.toMatchObject({ code: "50011", message: "OKX: Too many requests" });
  });

  it("turns a non-JSON answer (e.g. a Cloudflare block page) into OkxApiError", async () => {
    stubFetch(() => reply("error code: 1010", { status: 403 }));
    await expect(okxGet("/api/v6/security/token-scan")).rejects.toBeInstanceOf(OkxApiError);
  });

  it("refuses to run without an API key", async () => {
    delete process.env.OKX_API_KEY;
    stubFetch(() => reply({ code: "0", data: [] }));
    await expect(okxGet("/api/v6/security/token-scan")).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("the free quota", () => {
  it("reads the tiers from OKX's config", async () => {
    stubFetch(() => reply({ code: "0", data: [] }));
    expect(await tierOf("/api/v6/dex/market/signal/list")).toBe("premium");
    expect(await tierOf("/api/v6/security/token-scan")).toBeNull();
  });

  it("spreads the monthly quota over the days of the month", () => {
    const nov = Date.UTC(2026, 10, 17);
    expect(dailyShare("premium", nov)).toBe(Math.floor(90_000 / 30));
    expect(dailyShare("basic", Date.UTC(2026, 1, 3))).toBe(Math.floor(90_000 / 28));
  });

  it("stops a tier once today's share is used, without calling OKX", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 17, 12));
    const calls = stubFetch(() => reply({ code: "0", data: [] }));
    const share = dailyShare("premium");
    for (let i = 0; i < share; i++) await okxPost("/api/v6/dex/market/signal/list", {});
    await expect(okxPost("/api/v6/dex/market/signal/list", {})).rejects.toBeInstanceOf(MarketDataPausedError);
    expect(calls.filter((c) => c.url.endsWith("signal/list"))).toHaveLength(share);
    // Unmetered paths keep working.
    await expect(okxGet("/api/v6/security/token-scan")).resolves.toEqual([]);
    // A new day gives a new share.
    vi.setSystemTime(Date.UTC(2026, 10, 18, 0, 1));
    await expect(okxPost("/api/v6/dex/market/signal/list", {})).resolves.toEqual([]);
  });

  it("pauses a tier when OKX asks for a payment, and never pays", async () => {
    const calls = stubFetch(() => reply({ code: "0", data: [] }, { status: 402, headers: { "payment-required": "e30=" } }));
    await expect(okxPost("/api/v6/dex/market/price", [])).rejects.toBeInstanceOf(MarketDataPausedError);
    expect(meterState().basic.paused).toBe(true);
    await expect(okxPost("/api/v6/dex/market/price", [])).rejects.toBeInstanceOf(MarketDataPausedError);
    expect(calls.filter((c) => c.url.endsWith("market/price"))).toHaveLength(1);
    for (const c of calls) {
      const h = c.init.headers as Record<string, string>;
      expect(Object.keys(h).map((k) => k.toLowerCase())).not.toContain("payment-signature");
    }
  });
});
