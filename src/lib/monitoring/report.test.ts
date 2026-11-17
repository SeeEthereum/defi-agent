import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureException = vi.fn();
let initialized = true;

vi.mock("@sentry/nextjs", () => ({
  isInitialized: () => initialized,
  captureException: (e: unknown) => captureException(e),
  withScope: (fn: (scope: { setTag: () => void }) => void) => fn({ setTag: () => {} }),
}));

const { reportServerError } = await import("./report");

describe("reportServerError", () => {
  beforeEach(() => {
    captureException.mockClear();
    initialized = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("sends an unexpected error", () => {
    reportServerError("swap/execute", new Error("LI.FI answered 502"));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("keeps errors a user causes out of Sentry", () => {
    for (const message of [
      "onchainos wallet balance failed: Not logged in. Please sign in first.",
      "Insufficient balance for this swap",
      "Service not available in your region",
      "Slippage too high",
    ]) {
      reportServerError("wallet/balances", new Error(message));
    }
    expect(captureException).not.toHaveBeenCalled();
  });

  it("sends the same error from the same route at most once a minute", () => {
    reportServerError("tokens/search", new Error("Market data quota exceeded (code 81001)"));
    reportServerError("tokens/search", new Error("Market data quota exceeded (code 81002)"));
    expect(captureException).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    reportServerError("tokens/search", new Error("Market data quota exceeded (code 81003)"));
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  it("does nothing when Sentry is off", () => {
    initialized = false;
    reportServerError("bridge/quote", new Error("timeout"));
    expect(captureException).not.toHaveBeenCalled();
  });
});
