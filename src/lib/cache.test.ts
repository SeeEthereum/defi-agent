/**
 * Tests for the TTL + single-flight cache in cache.ts.
 *
 * Targets the three properties we rely on for the x402 paid-tier
 * mitigation:
 *   1. TTL is a hard wall — stale entries are never served.
 *   2. Single-flight collapses concurrent misses into one fetch.
 *   3. Errors are not cached.
 * Plus the cacheKey() stability guarantee.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoTTL, cacheKey, invalidate, _peekCache } from "./cache";

beforeEach(() => {
  // Drop any state leaked across tests.
  for (const { key } of _peekCache()) invalidate(key);
});

describe("cacheKey", () => {
  it("joins parts with a delimiter that won't collide with realistic input", () => {
    expect(cacheKey(["signals", "1", "smart_money"])).toBe("signals|1|smart_money");
  });

  it("collapses undefined and null to empty so optional params don't fragment keys", () => {
    expect(cacheKey(["signals", "1", undefined])).toBe(cacheKey(["signals", "1", null]));
    expect(cacheKey(["signals", "1", undefined])).toBe(cacheKey(["signals", "1", ""]));
  });

  it("preserves order — same components in different order produce different keys", () => {
    expect(cacheKey(["a", "b"])).not.toBe(cacheKey(["b", "a"]));
  });
});

describe("memoTTL", () => {
  it("returns cached value within TTL without calling the fetcher again", async () => {
    const fetcher = vi.fn().mockResolvedValue("hello");
    const v1 = await memoTTL("k1", 10_000, fetcher);
    const v2 = await memoTTL("k1", 10_000, fetcher);
    expect(v1).toBe("hello");
    expect(v2).toBe("hello");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn()
        .mockResolvedValueOnce("first")
        .mockResolvedValueOnce("second");
      const v1 = await memoTTL("k-ttl", 1_000, fetcher);
      vi.advanceTimersByTime(1_500);
      const v2 = await memoTTL("k-ttl", 1_000, fetcher);
      expect(v1).toBe("first");
      expect(v2).toBe("second");
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("single-flight: N concurrent calls with the same key collapse to one fetch", async () => {
    let resolveFetcher: ((value: string) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetcher = resolve;
        })
    );
    // Fire 5 concurrent reads BEFORE resolving the underlying fetch.
    const promises = [
      memoTTL("k-sf", 60_000, fetcher),
      memoTTL("k-sf", 60_000, fetcher),
      memoTTL("k-sf", 60_000, fetcher),
      memoTTL("k-sf", 60_000, fetcher),
      memoTTL("k-sf", 60_000, fetcher),
    ];
    // Underlying fetcher only invoked once despite 5 callers.
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetcher!("shared");
    const results = await Promise.all(promises);
    expect(results).toEqual(["shared", "shared", "shared", "shared", "shared"]);
  });

  it("does NOT cache errors — next call retries", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("recovered");
    await expect(memoTTL("k-err", 60_000, fetcher)).rejects.toThrow("transient");
    // Second call should retry, not serve a cached failure.
    const v = await memoTTL("k-err", 60_000, fetcher);
    expect(v).toBe("recovered");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("isolates entries by key — different keys don't collide", async () => {
    const fetcherA = vi.fn().mockResolvedValue("A");
    const fetcherB = vi.fn().mockResolvedValue("B");
    const a = await memoTTL("key-a", 60_000, fetcherA);
    const b = await memoTTL("key-b", 60_000, fetcherB);
    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(fetcherA).toHaveBeenCalledTimes(1);
    expect(fetcherB).toHaveBeenCalledTimes(1);
  });
});

describe("invalidate", () => {
  it("drops the entry so the next call refetches", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    await memoTTL("inv-key", 60_000, fetcher);
    invalidate("inv-key");
    const v = await memoTTL("inv-key", 60_000, fetcher);
    expect(v).toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
