import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_RUNNING, MAX_WAIT_MS, MAX_WAITING, processPoolState, WalletBusyError, withProcessSlot } from "./process-pool";

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { opened, open };
}

afterEach(() => vi.useRealTimers());

describe("withProcessSlot", () => {
  it("runs at most MAX_RUNNING at once and hands slots to the waiters in order", async () => {
    const g = gate();
    const started: number[] = [];
    const calls = Array.from({ length: MAX_RUNNING + 2 }, (_, i) =>
      withProcessSlot(async () => {
        started.push(i);
        await g.opened;
        return i;
      })
    );
    await Promise.resolve();
    expect(started).toHaveLength(MAX_RUNNING);
    expect(processPoolState()).toEqual({ running: MAX_RUNNING, waiting: 2 });

    g.open();
    expect(await Promise.all(calls)).toEqual(calls.map((_, i) => i));
    expect(started).toHaveLength(MAX_RUNNING + 2);
    expect(processPoolState()).toEqual({ running: 0, waiting: 0 });
  });

  it("refuses at once when the queue is full, and frees the slot after a failure", async () => {
    const g = gate();
    const held = Array.from({ length: MAX_RUNNING + MAX_WAITING }, () => withProcessSlot(() => g.opened));
    await expect(withProcessSlot(async () => "late")).rejects.toBeInstanceOf(WalletBusyError);
    g.open();
    await Promise.all(held);

    await expect(withProcessSlot(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(processPoolState()).toEqual({ running: 0, waiting: 0 });
  });

  it("gives up after waiting too long", async () => {
    vi.useFakeTimers();
    const g = gate();
    const held = Array.from({ length: MAX_RUNNING }, () => withProcessSlot(() => g.opened));
    const late = withProcessSlot(async () => "late");
    const outcome = expect(late).rejects.toBeInstanceOf(WalletBusyError);
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS + 1);
    await outcome;
    expect(processPoolState().waiting).toBe(0);
    g.open();
    await Promise.all(held);
  });
});
