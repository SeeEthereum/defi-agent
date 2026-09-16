/**
 * Per-session mutex for onchainos binary invocations.
 *
 * Each session's keystore is a single-threaded file-based resource: two
 * concurrent process spawns on the same ONCHAINOS_HOME (e.g. a Hyperliquid
 * signTypedData overlapping a walletBalance lookup) can corrupt lock files,
 * race nonces, or force the backend into 429/500. Every module that shells
 * out to the onchainos binary MUST serialize through this lock. Different
 * sessions have different keystores, so they run in parallel.
 *
 * Usage (inside a `withSession` route handler):
 *   import { withOnchainosLock } from "@/lib/okx/lock";
 *   await withOnchainosLock(() => execFileAsync(ONCHAINOS_BIN, args));
 *
 * Each lock is a promise chain keyed by ONCHAINOS_HOME — Node's
 * single-threaded event loop guarantees atomic chaining. `.finally`
 * releases the next waiter regardless of success/failure, and the entry is
 * dropped once its chain is idle.
 */

import { currentSession } from "@/lib/session/session";

const locks = new Map<string, Promise<void>>();

export function withOnchainosLock<T>(fn: () => Promise<T>): Promise<T> {
  const key = currentSession().home;
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, tail);
  return prev.then(fn).finally(() => {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  });
}
