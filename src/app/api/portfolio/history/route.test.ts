import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Plain functions, not vi.fn (see api/auth/status/route.test.ts).
const impl = vi.hoisted(() => ({ walletBalance: async (): Promise<unknown> => ({}) }));
vi.mock("@/lib/okx/cli", () => ({ walletBalance: () => impl.walletBalance() }));

const { GET } = await import("./route");
const { mintSessionToken, SESSION_COOKIE } = await import("@/lib/session/token");
const { storeValue, resetHistoryForTests, HOUR_MS } = await import("@/lib/portfolio/history");

const BALANCES = {
  accountId: "acct-1",
  details: [{ tokenAssets: [{ chainIndex: "8453", usdValue: "12.5" }, { chainIndex: "501", usdValue: "99" }] }],
};

async function request(query: string) {
  const token = await mintSessionToken();
  return new NextRequest(`http://localhost/api/portfolio/history${query}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

beforeEach(() => {
  delete process.env.DATABASE_URL;
  resetHistoryForTests();
  impl.walletBalance = async () => ({ ok: true, data: BALANCES, raw: "" });
});

describe("GET /api/portfolio/history", () => {
  it("answers with the session account's points and the total now", async () => {
    const now = Date.now();
    await storeValue("acct-1", 10, {}, now - 3 * HOUR_MS);
    await storeValue("someone-else", 5000, {}, now - 3 * HOUR_MS);
    const res = await GET(await request("?range=1d"), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.range).toBe("1d");
    // The stored point, plus the reading this request itself recorded.
    expect(body.data.points.map((p: { usd: number }) => p.usd)).toEqual([10, 12.5]);
    // Six supported chains only, like the dashboard: Solana's 99 is left out.
    expect(body.data.current.usd).toBe(12.5);
    expect(body.data.since).toBeLessThan(now);
  });

  it("accepts the viewer's UTC offset and ignores a broken one", async () => {
    for (const query of ["?range=all&offset=60", "?range=all&offset=-300", "?range=all&offset=abc", "?range=all&offset=100000"]) {
      const res = await GET(await request(query), {});
      expect(res.status, query).toBe(200);
    }
  });

  it("refuses ranges it does not know", async () => {
    const res = await GET(await request("?range=10y"), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown range");
  });

  it("answers in the language the app last used (withSession localizes on the way out)", async () => {
    const token = await mintSessionToken();
    const req = new NextRequest("http://localhost/api/portfolio/history?range=10y", {
      headers: { cookie: `${SESSION_COOKIE}=${token}; albicocca-lang=it` },
    });
    const res = await GET(req, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Periodo sconosciuto", code: "invalid_request" });
  });

  it("says so when OKX does not name the account", async () => {
    impl.walletBalance = async () => ({ ok: true, data: { details: [] }, raw: "" });
    const res = await GET(await request("?range=1w"), {});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "not_signed_in" });
  });

  it("does not leak the reason when reading balances fails", async () => {
    impl.walletBalance = async () => {
      throw new Error("spawn /home/render/.local/bin/onchainos ENOENT");
    };
    const res = await GET(await request("?range=1w"), {});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Could not load your value history.");
  });
});
