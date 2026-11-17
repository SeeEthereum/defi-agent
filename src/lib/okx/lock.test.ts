import { describe, expect, it } from "vitest";
import { runWithSession } from "@/lib/session/session";
import { MAX_QUEUED_PER_SESSION, SessionBusyError, withOnchainosLock } from "./lock";

const A = { sid: "a".repeat(43), home: "/tmp/lock-test-a" };
const B = { sid: "b".repeat(43), home: "/tmp/lock-test-b" };

describe("withOnchainosLock", () => {
  it("runs one call at a time per session", async () => {
    const order: string[] = [];
    const slow = (name: string) => async () => {
      order.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${name}`);
    };
    await runWithSession(A, () => Promise.all([withOnchainosLock(slow("1")), withOnchainosLock(slow("2"))]));
    expect(order).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });

  it("refuses calls beyond the per-session queue, without touching other sessions", async () => {
    let open!: () => void;
    const opened = new Promise<void>((r) => (open = r));
    const queued = runWithSession(A, () =>
      Array.from({ length: MAX_QUEUED_PER_SESSION }, () => withOnchainosLock(() => opened))
    );
    await expect(runWithSession(A, () => withOnchainosLock(async () => "x"))).rejects.toBeInstanceOf(SessionBusyError);
    await expect(runWithSession(B, () => withOnchainosLock(async () => "b"))).resolves.toBe("b");

    open();
    await Promise.all(queued);
    await expect(runWithSession(A, () => withOnchainosLock(async () => "again"))).resolves.toBe("again");
  });
});
