import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedDbPing,
  cachedOnchainosCheck,
  CHECK_CACHE_MS,
  checkOnchainos,
  deployedVersion,
  healthReport,
  resetHealthCacheForTests,
  type OnchainosCheck,
} from "./health";
import { pingDb } from "@/lib/db/ping";

let dir: string;

function script(name: string, body: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "health-test-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetHealthCacheForTests());

describe("checkOnchainos", () => {
  it("reads the version of a working binary, with no secrets in its environment", async () => {
    const bin = script("ok", 'if [ -n "$SESSION_SECRET$OPENAI_API_KEY$DATABASE_URL" ]; then exit 3; fi\necho "onchainos 9.9.9"');
    vi.stubEnv("SESSION_SECRET", "x".repeat(40));
    try {
      expect(await checkOnchainos(bin)).toEqual({ status: "ok", version: "onchainos 9.9.9" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports a missing or non-executable binary", async () => {
    expect(await checkOnchainos(path.join(dir, "nope"))).toEqual({ status: "missing", version: null });
    const file = path.join(dir, "not-exec");
    fs.writeFileSync(file, "x", { mode: 0o644 });
    expect((await checkOnchainos(file)).status).toBe("missing");
  });

  it("reports a binary that fails", async () => {
    expect(await checkOnchainos(script("fails", "exit 1"))).toEqual({ status: "broken", version: null });
  });

  it("gives up on a binary that hangs", async () => {
    const started = Date.now();
    expect(await checkOnchainos(script("hangs", "exec sleep 5"), 200)).toEqual({ status: "timeout", version: null });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("caching", () => {
  it("runs each check at most once a minute, sharing the run", async () => {
    const check = vi.fn(async (): Promise<OnchainosCheck> => ({ status: "ok", version: "v" }));
    const t0 = 1_000_000;
    await Promise.all([cachedOnchainosCheck(t0, check), cachedOnchainosCheck(t0, check)]);
    await cachedOnchainosCheck(t0 + CHECK_CACHE_MS - 1, check);
    expect(check).toHaveBeenCalledTimes(1);
    await cachedOnchainosCheck(t0 + CHECK_CACHE_MS, check);
    expect(check).toHaveBeenCalledTimes(2);

    const ping = vi.fn(async () => "ok" as const);
    await cachedDbPing(t0, ping);
    await cachedDbPing(t0 + 1, ping);
    expect(ping).toHaveBeenCalledTimes(1);
  });
});

describe("pingDb", () => {
  it("is absent without a database, ok or error with one", async () => {
    expect(await pingDb(100, () => null)).toBe("absent");
    const ok = { query: vi.fn(async () => [{ "?column?": 1 }]) };
    expect(await pingDb(100, () => ok as never)).toBe("ok");
    const down = { query: vi.fn(async () => Promise.reject(new Error("password=hunter2 host=db.example"))) };
    expect(await pingDb(100, () => down as never)).toBe("error");
    const hangs = { query: vi.fn(() => new Promise(() => {})) };
    expect(await pingDb(50, () => hangs as never)).toBe("error");
  });
});

describe("healthReport", () => {
  it("is ok with a working binary, whatever the database says", async () => {
    const report = await healthReport({
      onchainos: async () => ({ status: "ok", version: "onchainos 9.9.9" }),
      db: async () => "error",
    });
    expect(report.status).toBe("ok");
    expect(report.checks).toEqual({ onchainos: { status: "ok", version: "onchainos 9.9.9" }, db: "error" });
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("stays up on a slow binary, goes down on a missing or broken one", async () => {
    const db = async () => "absent" as const;
    expect((await healthReport({ onchainos: async () => ({ status: "timeout", version: null }), db })).status).toBe("ok");
    expect((await healthReport({ onchainos: async () => ({ status: "missing", version: null }), db })).status).toBe(
      "unavailable"
    );
    expect((await healthReport({ onchainos: async () => ({ status: "broken", version: null }), db })).status).toBe(
      "unavailable"
    );
  });

  it("reports the deployed commit, nothing else from the environment", () => {
    expect(deployedVersion("0123abcd0123abcd0123abcd0123abcd0123abcd")).toBe("0123abcd0123abcd0123abcd0123abcd0123abcd");
    expect(deployedVersion("")).toBeNull();
    expect(deployedVersion("postgres://user:pass@host/db")).toBeNull();
  });
});

describe("GET /api/health", () => {
  it("answers without a session and is never cached", async () => {
    vi.stubEnv("ONCHAINOS_PATH", path.join(dir, "absent-bin"));
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    try {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET();
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("set-cookie")).toBeNull();
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["checks", "status", "uptimeSeconds", "version"]);
      expect(body.checks.db).toBe("absent");
      // ONCHAINOS_BIN is resolved when lib/okx/cli loads: ONCHAINOS_PATH, absent.
      expect(res.status).toBe(503);
      expect(body.status).toBe("unavailable");
      expect(body.checks.onchainos).toEqual({ status: "missing", version: null });
      expect(JSON.stringify(body)).not.toContain(dir);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
