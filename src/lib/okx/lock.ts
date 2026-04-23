/**
 * Process-wide mutex for onchainos binary invocations.
 *
 * The onchainos keystore is a single-threaded file-based resource: two
 * concurrent process spawns (e.g. a Hyperliquid signTypedData overlapping
 * a walletBalance lookup) can corrupt lock files, race nonces, or force
 * the backend into 429/500. Every module that shells out to the onchainos
 * binary MUST serialize through this single lock.
 *
 * Usage:
 *   import { withOnchainosLock } from "@/lib/okx/lock";
 *   await withOnchainosLock(() => execFileAsync(ONCHAINOS_BIN, args));
 *
 * The lock is a single module-level promise chain — Node's single-threaded
 * event loop guarantees atomic chaining (no need for a real semaphore).
 * Each acquirer `.then(fn)` after the previous holder, and `.finally`
 * releases the next waiter regardless of success/failure.
 */

let lock: Promise<void> = Promise.resolve();

export function withOnchainosLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release!: () => void;
  lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  return prev.then(fn).finally(() => release());
}
