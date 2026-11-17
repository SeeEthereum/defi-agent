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

/**
 * Calls one session may have running or waiting at once. A page load needs
 * a handful; a script looping a route would otherwise queue without end,
 * each waiter holding a request open.
 */
export const MAX_QUEUED_PER_SESSION = 12;

export const SESSION_BUSY_MESSAGE =
  "Too many wallet requests at once from this browser. Wait a few seconds and try again.";

export class SessionBusyError extends Error {
  constructor() {
    super(SESSION_BUSY_MESSAGE);
    this.name = "SessionBusyError";
  }
}

const locks = new Map<string, Promise<void>>();
const depth = new Map<string, number>();

export function withOnchainosLock<T>(fn: () => Promise<T>): Promise<T> {
  const key = currentSession().home;
  const queued = depth.get(key) ?? 0;
  if (queued >= MAX_QUEUED_PER_SESSION) return Promise.reject(new SessionBusyError());
  depth.set(key, queued + 1);

  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, tail);
  return prev.then(fn).finally(() => {
    release();
    if (locks.get(key) === tail) locks.delete(key);
    const left = (depth.get(key) ?? 1) - 1;
    if (left <= 0) depth.delete(key);
    else depth.set(key, left);
  });
}
