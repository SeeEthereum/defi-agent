/**
 * A ceiling on onchainos processes running at once, across all sessions.
 *
 * Every wallet call spawns the binary. The per-session lock (./lock)
 * serializes calls within one session, but nothing bounded the total: a
 * burst from many sessions (or many fresh cookies) could start enough
 * processes to exhaust the instance's memory, taking every user down.
 * Calls beyond the ceiling wait their turn, briefly; when the queue is full
 * or the wait too long they fail with a clear "busy" error instead.
 *
 * Long-running login polls (./login-session) are not counted here: they
 * have their own cap, so a few slow logins cannot starve every other call.
 */

export const BUSY_MESSAGE = "The wallet service is busy. Try again in a few seconds.";

export class WalletBusyError extends Error {
  constructor() {
    super(BUSY_MESSAGE);
    this.name = "WalletBusyError";
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** At most this many processes run at once (env: ONCHAINOS_MAX_PROCESSES). */
export const MAX_RUNNING = positiveInt(process.env.ONCHAINOS_MAX_PROCESSES, 6);
/** At most this many calls wait for a slot; more fail right away. */
export const MAX_WAITING = 50;
/** A call that waited this long for a slot gives up. */
export const MAX_WAIT_MS = 20_000;

let running = 0;
const waiting: Array<{ grant: () => void }> = [];

function acquire(): Promise<void> {
  if (running < MAX_RUNNING) {
    running += 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_WAITING) return Promise.reject(new WalletBusyError());
  return new Promise<void>((resolve, reject) => {
    const waiter = {
      grant: () => {
        clearTimeout(timer);
        resolve();
      },
    };
    const timer = setTimeout(() => {
      const i = waiting.indexOf(waiter);
      if (i >= 0) waiting.splice(i, 1);
      reject(new WalletBusyError());
    }, MAX_WAIT_MS);
    waiting.push(waiter);
  });
}

function release(): void {
  const next = waiting.shift();
  // The slot passes straight to the next caller, so `running` stays the same.
  if (next) next.grant();
  else running -= 1;
}

/** Run `fn` (which spawns one onchainos process) once a slot is free. */
export async function withProcessSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/** For tests and diagnostics. */
export function processPoolState(): { running: number; waiting: number } {
  return { running, waiting: waiting.length };
}
