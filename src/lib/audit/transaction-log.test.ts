import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { runWithSession } from "@/lib/session/session";
import { resetDbForTests } from "@/lib/db/client";
import { bodyHash, guardDuplicates, markOutcomeUnknown, resetDuplicateGuard } from "@/lib/api/duplicate-guard";
import {
  hashSessionId,
  logTransactionAttempt,
  MEMORY_LIMIT,
  memoryTransactionLog,
  outcomeFor,
  resetTransactionLogForTests,
  toEntry,
} from "./transaction-log";

const SESSION = { sid: "s".repeat(43), home: "/tmp/never-used-txlog" };
const TX = "0x" + "ab".repeat(32);
const RECIPIENT = "0x" + "77".repeat(20);
const HASH = "f".repeat(64);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function call(route: (req: NextRequest, ctx: unknown) => Promise<Response>, body: unknown): Promise<Response> {
  const request = new NextRequest("http://localhost/api/test", { method: "POST", body: JSON.stringify(body) });
  return runWithSession(SESSION, () => route(request, {}));
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetDbForTests();
  resetTransactionLogForTests();
  resetDuplicateGuard();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("hashSessionId", () => {
  it("is a stable SHA-256 that is neither the id nor its plain hash", () => {
    const h = hashSessionId(SESSION.sid);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionId(SESSION.sid)).toBe(h);
    expect(h).not.toContain(SESSION.sid);
    expect(h).not.toBe(createHash("sha256").update(SESSION.sid).digest("hex"));
    expect(hashSessionId("t".repeat(43))).not.toBe(h);
  });
});

describe("outcomeFor", () => {
  it("maps answers to outcomes", () => {
    expect(outcomeFor(200, true)).toBe("success");
    expect(outcomeFor(200, false)).toBe("failed");
    expect(outcomeFor(400, false)).toBe("failed");
    expect(outcomeFor(500, false)).toBe("failed");
    expect(outcomeFor(409, false)).toBe("declined");
    expect(outcomeFor(428, false)).toBe("declined");
    expect(outcomeFor(429, false)).toBe("declined");
  });
});

describe("toEntry", () => {
  it("keeps only well-formed values and hashes the session", () => {
    const entry = toEntry(
      {
        scope: "wallet/send",
        sid: SESSION.sid,
        bodyHash: HASH,
        startedAt: 1_700_000_000_000,
        outcome: "failed",
        status: 400,
        txHash: "not a hash; DROP TABLE",
        code: "Insufficient funds for 0xabc",
      },
      1_700_000_000_250
    );
    expect(entry).toEqual({
      at: "2023-11-14T22:13:20.000Z",
      scope: "wallet/send",
      sessionHash: hashSessionId(SESSION.sid),
      bodyHash: HASH,
      outcome: "failed",
      status: 400,
      code: null,
      txHash: null,
      durationMs: 250,
    });
  });
});

describe("memory store", () => {
  it("keeps the last MEMORY_LIMIT attempts, oldest dropped first", async () => {
    for (let i = 0; i < MEMORY_LIMIT + 5; i++) {
      logTransactionAttempt({ scope: `s/${i}`, sid: SESSION.sid, bodyHash: HASH, startedAt: Date.now(), outcome: "success", status: 200 });
    }
    await vi.waitFor(() => expect(memoryTransactionLog()).toHaveLength(MEMORY_LIMIT));
    const log = memoryTransactionLog();
    expect(log[0].scope).toBe("s/5");
    expect(log.at(-1)?.scope).toBe(`s/${MEMORY_LIMIT + 4}`);
  });

  it("never throws, even on garbage", () => {
    expect(() =>
      logTransactionAttempt({ scope: undefined, sid: null } as unknown as Parameters<typeof logTransactionAttempt>[0])
    ).not.toThrow();
  });
});

describe("guardDuplicates writes one row per attempt", () => {
  it("records success, a declined repeat, and never the body or the session id", async () => {
    const body = { to: RECIPIENT, amount: "12.5", token: "USDC" };
    const route = guardDuplicates("wallet/send", async () => json({ success: true, data: { txHash: TX } }));

    expect((await call(route, body)).status).toBe(200);
    expect((await call(route, body)).status).toBe(409);

    await vi.waitFor(() => expect(memoryTransactionLog()).toHaveLength(2));
    const [sent, repeat] = memoryTransactionLog();
    expect(sent).toMatchObject({
      scope: "wallet/send",
      sessionHash: hashSessionId(SESSION.sid),
      bodyHash: bodyHash(JSON.stringify(body)),
      outcome: "success",
      status: 200,
      txHash: TX,
      code: null,
    });
    expect(sent.durationMs).toBeGreaterThanOrEqual(0);
    expect(repeat).toMatchObject({ outcome: "declined", status: 409, code: "duplicate_recent", txHash: null });

    const stored = JSON.stringify(memoryTransactionLog());
    for (const secret of [SESSION.sid, RECIPIENT, "12.5", "USDC"]) expect(stored).not.toContain(secret);
  });

  it("records failures with their code, a wallet prompt as declined", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(json({ success: false, error: "Insufficient funds" }, 400))
      .mockResolvedValueOnce(json({ success: false, code: "risk_confirmation", error: "Flagged" }, 428));
    const route = guardDuplicates("swap/execute", handler);

    await call(route, { amount: "1" });
    await call(route, { amount: "1" });

    await vi.waitFor(() => expect(memoryTransactionLog()).toHaveLength(2));
    const [failed, prompt] = memoryTransactionLog();
    expect(failed).toMatchObject({ outcome: "failed", status: 400, code: null, txHash: null });
    expect(prompt).toMatchObject({ outcome: "declined", status: 428, code: "risk_confirmation" });
  });

  it("records an unknown outcome and a thrown handler", async () => {
    const unknown = guardDuplicates("bridge/execute", async () => {
      markOutcomeUnknown();
      return json({ success: false, error: "timeout" }, 500);
    });
    const throws = guardDuplicates("earn/supply", async () => {
      throw new Error("boom");
    });

    expect((await call(unknown, { amount: "1" })).status).toBe(504);
    await expect(call(throws, { amount: "1" })).rejects.toThrow("boom");

    await vi.waitFor(() => expect(memoryTransactionLog()).toHaveLength(2));
    const [u, t] = memoryTransactionLog();
    expect(u).toMatchObject({ scope: "bridge/execute", outcome: "outcome_unknown", status: 504, code: "outcome_unknown" });
    expect(t).toMatchObject({ scope: "earn/supply", outcome: "failed", status: 500 });
  });
});

describe("database failures", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db/client");
    vi.doUnmock("@/lib/monitoring/report");
    vi.resetModules();
  });

  it("are reported, never thrown, and do not hold up the caller", async () => {
    vi.resetModules();
    let rejectWrite!: (e: Error) => void;
    const sql = vi.fn(() => new Promise((_, reject) => (rejectWrite = reject)));
    const reportServerError = vi.fn();
    vi.doMock("@/lib/db/client", () => ({ db: () => sql }));
    vi.doMock("@/lib/monitoring/report", () => ({ reportServerError }));
    const mod = await import("./transaction-log");

    const result = mod.logTransactionAttempt({
      scope: "wallet/send",
      sid: SESSION.sid,
      bodyHash: HASH,
      startedAt: Date.now(),
      outcome: "success",
      status: 200,
    });
    expect(result).toBeUndefined(); // returned while the write is still pending
    await vi.waitFor(() => expect(sql).toHaveBeenCalled());
    expect(reportServerError).not.toHaveBeenCalled();

    rejectWrite(new Error("database down"));
    await vi.waitFor(() =>
      expect(reportServerError).toHaveBeenCalledWith("audit/transaction-log", expect.objectContaining({ message: "database down" }))
    );
    expect(mod.memoryTransactionLog()).toHaveLength(0);
  });
});
