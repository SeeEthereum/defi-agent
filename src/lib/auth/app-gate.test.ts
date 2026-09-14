/**
 * Tests for the access gate's token signing.
 *
 * A bug here fails silently and in the worst direction — a forged or
 * expired token being accepted means an open wallet — so the forgery and
 * expiry paths are pinned explicitly.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  isGateConfigured,
  SESSION_TTL_MS,
} from "./app-gate";

const ORIGINAL = process.env.APP_PASSWORD;

beforeEach(() => {
  process.env.APP_PASSWORD = "correct horse battery staple";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = ORIGINAL;
});

describe("isGateConfigured", () => {
  it("is false when APP_PASSWORD is unset or empty", () => {
    delete process.env.APP_PASSWORD;
    expect(isGateConfigured()).toBe(false);
    process.env.APP_PASSWORD = "";
    expect(isGateConfigured()).toBe(false);
  });

  it("is true when a password is set", () => {
    expect(isGateConfigured()).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("accepts the exact password and rejects near-misses", () => {
    expect(verifyPassword("correct horse battery staple")).toBe(true);
    expect(verifyPassword("correct horse battery stapl")).toBe(false);
    expect(verifyPassword("Correct horse battery staple")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });

  it("rejects everything when no password is configured", () => {
    delete process.env.APP_PASSWORD;
    expect(verifyPassword("anything")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a freshly issued token", () => {
    const token = createSessionToken();
    expect(token).not.toBeNull();
    expect(verifySessionToken(token!)).toBe(true);
  });

  it("rejects a token once it expires", () => {
    const now = Date.now();
    const token = createSessionToken(now)!;
    expect(verifySessionToken(token, now + SESSION_TTL_MS - 1000)).toBe(true);
    expect(verifySessionToken(token, now + SESSION_TTL_MS + 1000)).toBe(false);
  });

  it("rejects a tampered expiry — the signature covers it", () => {
    const token = createSessionToken()!;
    const [, mac] = token.split(".");
    const forged = `${Date.now() + 10 * SESSION_TTL_MS}.${mac}`;
    expect(verifySessionToken(forged)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken()!;
    const [exp, mac] = token.split(".");
    expect(verifySessionToken(`${exp}.${mac.slice(0, -1)}X`)).toBe(false);
    expect(verifySessionToken(`${exp}.`)).toBe(false);
  });

  it("rejects tokens signed under a different password (rotation revokes)", () => {
    const token = createSessionToken()!;
    process.env.APP_PASSWORD = "a different password";
    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "nonsense", ".", "abc.def", "..", "12345"]) {
      expect(verifySessionToken(bad)).toBe(false);
    }
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it("issues nothing and trusts nothing when the gate is unconfigured", () => {
    delete process.env.APP_PASSWORD;
    expect(createSessionToken()).toBeNull();
    expect(verifySessionToken("anything.atall")).toBe(false);
  });
});
