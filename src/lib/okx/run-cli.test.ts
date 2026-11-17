/**
 * runCli against a fake onchainos binary: how process failures turn into
 * errors the routes and the duplicate guard can act on.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exec = vi.hoisted(() => vi.fn());

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const { promisify } = await import("node:util");
  const execFile = Object.assign(() => {
    throw new Error("only the promisified form is used");
  }, { [promisify.custom]: (...args: unknown[]) => exec(...args) });
  return { ...actual, execFile, default: { ...actual, execFile } };
});

const { runCli, OkxCliError } = await import("./cli");
const { runWithSession } = await import("@/lib/session/session");
const { guardDuplicates, resetDuplicateGuard } = await import("@/lib/api/duplicate-guard");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "run-cli-test-"));
const SESSION = { sid: "t".repeat(43), home };

afterAll(() => fs.rmSync(home, { recursive: true, force: true }));
beforeEach(() => {
  exec.mockReset();
  resetDuplicateGuard();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** What execFile rejects with when its timeout kills the process. */
function killedByTimeout() {
  return Object.assign(new Error("Command failed"), {
    killed: true,
    signal: "SIGKILL",
    code: null,
    stdout: "",
    stderr: "",
  });
}

function inSession<T>(fn: () => Promise<T>): Promise<T> {
  return runWithSession(SESSION, fn);
}

describe("runCli timeouts", () => {
  it("says a timed-out broadcast may still go through", async () => {
    exec.mockRejectedValue(killedByTimeout());
    const error = await inSession(() => runCli(["wallet", "contract-call"], { to: "0x1" })).catch((e) => e);
    expect(error).toBeInstanceOf(OkxCliError);
    expect(error.message).toMatch(/may still go through/);
  });

  it("asks for a plain retry when a read times out", async () => {
    exec.mockRejectedValue(killedByTimeout());
    const error = await inSession(() => runCli(["wallet", "balance"])).catch((e) => e);
    expect(error.message).toMatch(/did not answer in time\. Please try again/);
  });

  it("makes the guard block a blind retry after a timed-out broadcast", async () => {
    exec.mockRejectedValue(killedByTimeout());
    const route = guardDuplicates("wallet/send", async () => {
      try {
        await runCli(["wallet", "send"], { amt: "1" });
        return Response.json({ success: true, data: {} });
      } catch {
        return Response.json({ success: false, error: "Transfer failed" }, { status: 500 });
      }
    });
    const request = () =>
      new NextRequest("http://localhost/api/wallet/send", { method: "POST", body: '{"amount":"1"}' });

    const first = await inSession(() => route(request(), {}));
    expect(first.status).toBe(504);
    expect(await first.json()).toMatchObject({ code: "outcome_unknown" });

    const retry = await inSession(() => route(request(), {}));
    expect(retry.status).toBe(409);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("does not block a retry after a read timed out", async () => {
    exec.mockRejectedValue(killedByTimeout());
    const route = guardDuplicates("wallet/send", async () => {
      try {
        await runCli(["wallet", "addresses"]);
        return Response.json({ success: true, data: {} });
      } catch {
        return Response.json({ success: false, error: "Transfer failed" }, { status: 500 });
      }
    });
    const request = () =>
      new NextRequest("http://localhost/api/wallet/send", { method: "POST", body: '{"amount":"1"}' });

    expect((await inSession(() => route(request(), {}))).status).toBe(500);
    expect((await inSession(() => route(request(), {}))).status).toBe(500);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});
