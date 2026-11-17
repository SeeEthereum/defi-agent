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

const { runCli, walletSend, OkxCliError, RiskConfirmingError, GasStationConfirmingError } = await import("./cli");
const { riskResponseFor } = await import("./risk-confirmation");
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

/** What execFile rejects with when the binary exits with status 2. */
function exitTwo(payload: unknown) {
  return Object.assign(new Error("Command failed"), {
    killed: false,
    signal: null,
    code: 2,
    stdout: JSON.stringify(payload),
    stderr: "",
  });
}

describe("runCli confirming responses", () => {
  it("turns a risk prompt (exit 2) into RiskConfirmingError, never a success", async () => {
    exec.mockRejectedValue(
      exitTwo({ confirming: true, message: "This transaction may result in significant loss.", next: "re-run with --force" })
    );
    const error = await inSession(() => runCli(["wallet", "send"], { amt: "1" })).catch((e) => e);
    expect(error).toBeInstanceOf(RiskConfirmingError);
    expect(error.prompt).toBe("This transaction may result in significant loss.");
  });

  it("treats a risk prompt printed with exit 0 the same way", async () => {
    exec.mockResolvedValue({ stdout: JSON.stringify({ confirming: true, message: "Risky address" }), stderr: "" });
    const error = await inSession(() => runCli(["wallet", "contract-call"])).catch((e) => e);
    expect(error).toBeInstanceOf(RiskConfirmingError);
  });

  it("still recognizes a Gas Station prompt on exit 2", async () => {
    exec.mockRejectedValue(exitTwo({ confirming: true, message: "gasStationStatus: FIRST_TIME_PROMPT" }));
    const error = await inSession(() => runCli(["wallet", "send"])).catch((e) => e);
    expect(error).toBeInstanceOf(GasStationConfirmingError);
  });

  it("passes the data of a payment notice through, and fails one without data", async () => {
    exec.mockRejectedValueOnce(exitTwo({ confirming: true, notifications: [{ code: "GRACE" }], data: { price: "1" } }));
    await expect(inSession(() => runCli(["market", "price"]))).resolves.toMatchObject({ ok: true, data: { price: "1" } });

    exec.mockRejectedValueOnce(exitTwo({ confirming: true, notifications: [{ code: "OVER_QUOTA" }] }));
    const error = await inSession(() => runCli(["market", "price"])).catch((e) => e);
    expect(error).toBeInstanceOf(OkxCliError);
    expect(error.message).toMatch(/quota/);
  });

  it("reads a plain non-zero exit as a failure with its exit code", async () => {
    exec.mockRejectedValue(
      Object.assign(new Error("Command failed"), { code: 1, stdout: "", stderr: "insufficient funds" })
    );
    const error = await inSession(() => runCli(["wallet", "send"])).catch((e) => e);
    expect(error).toBeInstanceOf(OkxCliError);
    expect(error.exitCode).toBe(1);
    expect(error.message).toMatch(/insufficient funds/);
  });

  it("answers a risk prompt with 428 and the backend's words", async () => {
    const res = riskResponseFor(new RiskConfirmingError("wallet send", "Recipient flagged as phishing"));
    expect(res?.status).toBe(428);
    expect(await res?.json()).toEqual({
      success: false,
      code: "risk_confirmation",
      error: "Recipient flagged as phishing",
    });
    expect(riskResponseFor(new Error("other"))).toBeNull();
  });
});

describe("--force", () => {
  function argsOfLastCall(): string[] {
    return exec.mock.calls.at(-1)?.[1] as string[];
  }

  it("is left out unless the caller asks for it", async () => {
    exec.mockResolvedValue({ stdout: JSON.stringify({ ok: true, data: { txHash: "0x1" } }), stderr: "" });
    await inSession(() => walletSend({ amount: "1", recipient: "0xabc", chain: "1" }));
    expect(argsOfLastCall()).not.toContain("--force");

    await inSession(() => walletSend({ amount: "1", recipient: "0xabc", chain: "1", force: true }));
    expect(argsOfLastCall()).toContain("--force");
  });
});

describe("approval verification (OKX email code)", () => {
  // Shapes printed by onchainos v4.6.11 (cli/src/commands/agentic_wallet/approval_code.rs).
  const codeSent = {
    confirming: true,
    scene: "approval_code_sent",
    message:
      "This approval requires email verification (approval double confirmation is on). A verification code was sent to the bound email. The approval has not been executed yet.",
    next: "Ask the user for the 6-digit code from the bound email, then run `onchainos wallet approval-code verify --verification-code <code>`.",
  };

  it("turns a held approval (exit 2) into ApprovalCodeError, not a risk prompt", async () => {
    const { ApprovalCodeError } = await import("./cli");
    exec.mockRejectedValue(exitTwo(codeSent));
    const error = await inSession(() => runCli(["wallet", "contract-call"], { to: "0x1" })).catch((e) => e);
    expect(error).toBeInstanceOf(ApprovalCodeError);
    expect(error).not.toBeInstanceOf(RiskConfirmingError);
  });

  it("keeps the CLI's errorCode on a coded failure", async () => {
    exec.mockRejectedValue(
      Object.assign(new Error("Command failed"), {
        killed: false,
        code: 1,
        stdout: JSON.stringify({
          ok: false,
          error: "The verification code is incorrect. The approval was not completed.",
          errorCode: "approval_code_invalid",
        }),
        stderr: "",
      })
    );
    const { walletApprovalCodeVerify } = await import("./cli");
    const error = await inSession(() => walletApprovalCodeVerify("123456")).catch((e) => e);
    expect(error).toBeInstanceOf(OkxCliError);
    expect(error.errorCode).toBe("approval_code_invalid");
    expect(exec.mock.calls.at(-1)?.[1]).toEqual(["wallet", "approval-code", "verify", "--verification-code", "123456"]);
  });

  it("counts a resend as done when OKX answers that a code was sent", async () => {
    const { walletApprovalCodeResend } = await import("./cli");
    exec.mockRejectedValue(exitTwo(codeSent));
    await expect(inSession(() => walletApprovalCodeResend())).resolves.toBeUndefined();
  });

  it("answers 428 for a held approval and 400 with the reason for a wrong code", async () => {
    const { ApprovalCodeError } = await import("./cli");
    const { approvalPromptResponseFor } = await import("./approval-code");
    const held = approvalPromptResponseFor(new ApprovalCodeError("wallet contract-call"));
    expect(held?.status).toBe(428);
    expect((await held?.json()).code).toBe("approval_code");

    const wrong = approvalPromptResponseFor(new OkxCliError("wallet approval-code verify", 1, "x", "approval_code_invalid"));
    expect(wrong?.status).toBe(400);
    expect(await wrong?.json()).toMatchObject({ code: "approval_code_invalid", retryable: true });

    const tooMany = approvalPromptResponseFor(
      new OkxCliError("wallet approval-code verify", 1, "x", "approval_code_attempts_exceeded")
    );
    expect(await tooMany?.json()).toMatchObject({ retryable: false, error: expect.stringMatching(/start again/) });

    expect(approvalPromptResponseFor(new OkxCliError("wallet send", 1, "insufficient funds"))).toBeNull();
  });
});
