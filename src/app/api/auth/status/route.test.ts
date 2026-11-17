import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A plain function, not vi.fn: with a throwing vi.fn here (called inside the
// session's AsyncLocalStorage), vitest reported the error as a test failure
// although the route caught it and answered correctly.
const impl = vi.hoisted(() => ({ walletStatus: async (): Promise<unknown> => ({}) }));
vi.mock("@/lib/okx/cli", () => ({ walletStatus: () => impl.walletStatus() }));
vi.mock("@/lib/accounts/labels", () => ({ getLabels: async () => ({}) }));

const { GET } = await import("./route");
const { mintSessionToken, SESSION_COOKIE } = await import("@/lib/session/token");
const { SessionBusyError } = await import("@/lib/okx/lock");
const { SealedSessionError } = await import("@/lib/session/keyring-seal");

async function request() {
  const token = await mintSessionToken();
  return new NextRequest("http://localhost/api/auth/status", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

describe("GET /api/auth/status", () => {
  it("reports a signed-in wallet", async () => {
    impl.walletStatus = async () => ({
      ok: true,
      data: { loggedIn: true, email: "", currentAccountId: "a", currentAccountName: "Account 1", accountCount: 1 },
      raw: "",
    });
    const res = await GET(await request(), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, authenticated: true });
  });

  it("does not call a slow or busy server a sign-out", async () => {
    impl.walletStatus = async () => {
      throw new SessionBusyError();
    };
    const res = await GET(await request(), {});
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, code: "status_unknown" });
  });

  it("treats a session that no longer opens as signed out", async () => {
    impl.walletStatus = async () => {
      throw new SealedSessionError();
    };
    const res = await GET(await request(), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, authenticated: false });
  });
});
