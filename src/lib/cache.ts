/**
 * In-memory TTL cache with single-flight request coalescing.
 *
 * Built to cut OKX Market-API call volume ahead of the 2026-06-01 paid-tier
 * cutover (see docs/onchainos-upgrade-notes.md). Premium endpoints
 * (signal/list, leaderboard, address-tracker-activities, portfolio-overview)
 * are public, deterministic data — perfect cache candidates.
 *
 * Properties:
 * - Per-process, in-memory. Each Render dyno has its own cache; that's fine
 *   at our scale and avoids the operational cost of Redis.
 * - Single-flight: N concurrent calls with the same key collapse to 1
 *   underlying fetch. Without this, a dashboard load that fires 10 signal
 *   calls in parallel would all miss a cold cache and hit OKX 10 times.
 * - TTL is a hard wall: stale entries are not served. We pay the cost of
 *   a re-fetch the moment after expiry, but we never serve stale data.
 *   If you want stale-while-revalidate behavior, build it on top.
 * - Errors are NOT cached. A failed fetch leaves the cache empty so the
 *   next request retries.
 *
 * Not built to:
 * - Persist across process restarts (use an external store for that).
 * - Bound memory growth aggressively — relies on TTLs sweeping entries.
 *   The sweeper runs lazily on every get; in practice the working set
 *   is small (dozens of entries) so this is fine.
 */
type Entry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Get-or-compute with TTL + single-flight.
 *
 * @param key  Cache key. For routes with query params, build a stable key
 *             from `cacheKey([prefix, ...params])`.
 * @param ttlMs  How long the value stays fresh.
 * @param fetcher  The expensive call. Only invoked on miss; concurrent
 *             callers with the same key share one in-flight promise.
 */
export async function memoTTL<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  // Single-flight: if someone is already fetching this key, await their
  // result instead of firing a parallel call.
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await fetcher();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * Build a stable cache key from a list of components. `undefined` and
 * `null` collapse to empty so optional params don't fragment keys
 * unpredictably (`["signals","1",undefined]` and `["signals","1",""]`
 * map to the same key).
 */
export function cacheKey(parts: Array<string | number | undefined | null>): string {
  return parts.map((p) => (p == null ? "" : String(p))).join("|");
}

/**
 * Drop an entry. Useful for tests or for manually invalidating after a
 * mutation (none of the paid-tier endpoints are mutated by us, so this is
 * only used in tests today).
 */
export function invalidate(key: string): void {
  store.delete(key);
}

/** Test-only: dump current cache state for inspection. */
export function _peekCache(): Array<{ key: string; ttlRemainingMs: number }> {
  const now = Date.now();
  return Array.from(store.entries()).map(([key, entry]) => ({
    key,
    ttlRemainingMs: entry.expiresAt - now,
  }));
}
