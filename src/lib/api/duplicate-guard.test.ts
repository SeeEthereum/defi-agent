import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { runWithSession } from "@/lib/session/session";
import {
  bodyHash,
  guardDuplicates,
  markOutcomeUnknown,
  RECENT_MS,
  resetDuplicateGuard,
  UNKNOWN_OUTCOME_MS,
} from "./duplicate-guard";

const SESSION_A = { sid: "a".repeat(43), home: "/tmp/never-used-a" };
const SESSION_B = { sid: "b".repeat(43), home: "/tmp/never-used-b" };
const TX = "0x" + "12".repeat(32);

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** A handler whose answer the test decides, after it has started. */
function deferredHandler() {
  let resolve!: (res: Response) => void;
  const handler = vi.fn(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      })
  );
  return { handler, finish: (res: Response) => resolve(res) };
}

function call(
  route: (req: NextRequest, ctx: unknown) => Promise<Response>,
  body: unknown,
  session = SESSION_A
): Promise<Response> {
  return runWithSession(session, () => route(post(body), {}));
}

beforeEach(() => resetDuplicateGuard());
afterEach(() => vi.useRealTimers());

describe("guardDuplicates", () => {
  it("refuses the same request while the first one is running", async () => {
    const { handler, finish } = deferredHandler();
    const route = guardDuplicates("swap/execute", handler);

    const first = call(route, { amount: "1" });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const second = await call(route, { amount: "1" });

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ success: false, code: "duplicate_in_flight" });
    expect(handler).toHaveBeenCalledTimes(1);

    finish(json({ success: true, data: { txHash: TX } }));
    expect((await first).status).toBe(200);
  });

  it("refuses a repeat right after a success, with the hash already sent", async () => {
    const handler = vi.fn(async () => json({ success: true, data: { txHash: TX } }));
    const route = guardDuplicates("wallet/send", handler);

    expect((await call(route, { amount: "1", to: "x" })).status).toBe(200);
    const repeat = await call(route, { to: "x", amount: "1" });

    expect(repeat.status).toBe(409);
    expect(await repeat.json()).toMatchObject({ code: "duplicate_recent", txHash: TX });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("lets the repeat through once the window has passed", async () => {
    vi.useFakeTimers();
    const handler = vi.fn(async () => json({ success: true, data: { txHash: TX } }));
    const route = guardDuplicates("wallet/send", handler);

    await call(route, { amount: "1" });
    vi.advanceTimersByTime(RECENT_MS + 1);
    expect((await call(route, { amount: "1" })).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("lets a different request, another session or another route through", async () => {
    const handler = vi.fn(async () => json({ success: true, data: {} }));
    const send = guardDuplicates("wallet/send", handler);
    const supply = guardDuplicates("earn/supply", handler);

    await call(send, { amount: "1" });
    expect((await call(send, { amount: "2" })).status).toBe(200);
    expect((await call(send, { amount: "1" }, SESSION_B)).status).toBe(200);
    expect((await call(supply, { amount: "1" })).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it("allows an immediate retry after a failure", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(json({ success: false, error: "Insufficient funds" }, 400))
      .mockResolvedValueOnce(json({ success: false, requiresGasStation: true }))
      .mockResolvedValueOnce(json({ success: true, data: {} }));
    const route = guardDuplicates("swap/execute", handler);

    expect((await call(route, { amount: "1" })).status).toBe(400);
    expect((await call(route, { amount: "1" })).status).toBe(200);
    expect((await call(route, { amount: "1" })).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("frees the entry when the handler throws", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(json({ success: true, data: {} }));
    const route = guardDuplicates("swap/execute", handler);

    await expect(call(route, { amount: "1" })).rejects.toThrow("boom");
    expect((await call(route, { amount: "1" })).status).toBe(200);
  });

  it("with recentMs 0 only blocks while running", async () => {
    const handler = vi.fn(async () => json({ success: true, data: {} }));
    const route = guardDuplicates("perp/order", handler, { recentMs: 0 });

    await call(route, { size: "1" });
    expect((await call(route, { size: "1" })).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("treats a timed-out broadcast as unknown and blocks retries for longer", async () => {
    vi.useFakeTimers();
    const handler = vi.fn(async () => {
      markOutcomeUnknown();
      return json({ success: false, error: "Swap failed" }, 500);
    });
    const route = guardDuplicates("swap/execute", handler);

    const first = await call(route, { amount: "1" });
    expect(first.status).toBe(504);
    expect(await first.json()).toMatchObject({ code: "outcome_unknown" });

    vi.advanceTimersByTime(RECENT_MS + 1);
    const retry = await call(route, { amount: "1" });
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({ code: "outcome_unknown" });

    vi.advanceTimersByTime(UNKNOWN_OUTCOME_MS);
    await call(route, { amount: "1" });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not consume the body the handler reads", async () => {
    const route = guardDuplicates("wallet/send", async (req: NextRequest) =>
      json({ success: true, data: await req.json() })
    );
    const res = await call(route, { amount: "7" });
    expect(await res.json()).toMatchObject({ data: { amount: "7" } });
  });
});

describe("bodyHash", () => {
  it("ignores key order and the risk acknowledgement", () => {
    const base = bodyHash(JSON.stringify({ a: 1, b: { c: 2, d: 3 } }));
    expect(bodyHash(JSON.stringify({ b: { d: 3, c: 2 }, a: 1 }))).toBe(base);
    expect(bodyHash(JSON.stringify({ a: 1, b: { c: 2, d: 3 }, acknowledgeRisk: true }))).toBe(base);
    expect(bodyHash(JSON.stringify({ a: 2, b: { c: 2, d: 3 } }))).not.toBe(base);
  });

  it("hashes non-JSON bodies as text", () => {
    expect(bodyHash("not json")).toBe(bodyHash("not json"));
    expect(bodyHash("not json")).not.toBe(bodyHash("other"));
  });
});
