import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const walletLogout = vi.hoisted(() => vi.fn(async () => ({ ok: true, data: null, raw: "" })));
vi.mock("@/lib/okx/cli", () => ({ walletLogout }));

const root = fs.mkdtempSync(path.join(os.tmpdir(), "idle-test-"));
process.env.ONCHAINOS_SESSIONS_DIR = root;

const { idleTimeoutMs, lastActiveMs, markActive, wasSignedOutIdle, clearIdleSignOut } = await import("./activity");
const { idleSessions, sweepIdleSessions } = await import("./idle-sweeper");

const MIN = 60_000;
const sid = (c: string) => c.repeat(43);

/** A session directory, optionally signed in, last used `agoMs` ago. */
function makeSession(id: string, { wallet = true, agoMs = 0, marker = true } = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  if (wallet) fs.writeFileSync(path.join(dir, "wallets.json"), "{}");
  const when = new Date(Date.now() - agoMs);
  if (marker) {
    const file = path.join(dir, ".albicocca-active");
    fs.writeFileSync(file, "");
    fs.utimesSync(file, when, when);
  }
  for (const name of fs.readdirSync(dir)) {
    if (name !== ".albicocca-active" || !marker) fs.utimesSync(path.join(dir, name), when, when);
  }
  fs.utimesSync(dir, when, when);
  return { sid: id, home: dir };
}

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  for (const name of fs.readdirSync(root)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
  walletLogout.mockClear();
});

describe("idleTimeoutMs", () => {
  it("is 30 minutes in production, off in development, and configurable", () => {
    expect(idleTimeoutMs({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(30 * MIN);
    expect(idleTimeoutMs({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(0);
    expect(idleTimeoutMs({ NODE_ENV: "development", IDLE_SIGNOUT_MINUTES: "5" } as NodeJS.ProcessEnv)).toBe(5 * MIN);
    expect(idleTimeoutMs({ NODE_ENV: "production", IDLE_SIGNOUT_MINUTES: "0" } as NodeJS.ProcessEnv)).toBe(0);
  });
});

describe("activity marker", () => {
  it("records activity in the session directory, at most every 30 s", () => {
    const s = makeSession(sid("m"), { agoMs: 60 * MIN });
    const now = Date.now();
    markActive(s, now);
    expect(Math.abs(lastActiveMs(s.home) - now)).toBeLessThan(2000);
    const file = path.join(s.home, ".albicocca-active");
    const old = new Date(now - 10 * MIN);
    fs.utimesSync(file, old, old);
    markActive(s, now + 10_000);
    expect(lastActiveMs(s.home)).toBeLessThan(now - 5 * MIN);
  });

  it("does nothing for a session that is not signed in", () => {
    markActive({ sid: sid("n"), home: path.join(root, sid("n")) });
    expect(fs.existsSync(path.join(root, sid("n")))).toBe(false);
  });

  it("falls back to the newest file when there is no marker", () => {
    const s = makeSession(sid("f"), { agoMs: 45 * MIN, marker: false });
    expect(Date.now() - lastActiveMs(s.home)).toBeGreaterThan(40 * MIN);
  });
});

describe("idle sweep", () => {
  it("finds only signed-in sessions idle for longer than the timeout", () => {
    makeSession(sid("a"), { agoMs: 5 * MIN });
    const idle = makeSession(sid("b"), { agoMs: 31 * MIN });
    makeSession(sid("c"), { agoMs: 3 * 60 * MIN, wallet: false });
    makeSession(sid("d"), { agoMs: 2 * 60 * MIN, marker: false });
    expect(idleSessions(30 * MIN).map((s) => s.sid).sort()).toEqual([idle.sid, sid("d")].sort());
    expect(idleSessions(0)).toEqual([]);
  });

  it("signs idle sessions out like the Sign out button and remembers why", async () => {
    const idle = makeSession(sid("e"), { agoMs: 40 * MIN });
    const active = makeSession(sid("g"), { agoMs: 1 * MIN });

    expect(await sweepIdleSessions(30 * MIN)).toBe(1);
    expect(walletLogout).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(idle.home)).toBe(false);
    expect(fs.existsSync(active.home)).toBe(true);
    expect(wasSignedOutIdle(idle.sid)).toBe(true);
    expect(wasSignedOutIdle(active.sid)).toBe(false);

    clearIdleSignOut(idle.sid);
    expect(wasSignedOutIdle(idle.sid)).toBe(false);
  });

  it("deletes the session even when OKX logout fails", async () => {
    walletLogout.mockRejectedValueOnce(new Error("network"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const idle = makeSession(sid("h"), { agoMs: 40 * MIN });
    expect(await sweepIdleSessions(30 * MIN)).toBe(1);
    expect(fs.existsSync(idle.home)).toBe(false);
  });
});
