import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicClient } from "@/lib/fluid/client";
import { APPROVAL_CODE_CODE } from "@/lib/api/send-state";
import { ApprovalCodeError, OkxCliError, walletApprovalCodeVerify } from "./cli";

/**
 * Approval verification (OKX's "double confirmation"), end to end.
 *
 * A user can turn it on in OKX's Agentic Wallet policy settings; only they
 * can, on OKX's site, and our server cannot turn it off. With it on, OKX
 * holds every token approval (the one transaction type its spending limits
 * do not cover) until the user types a 6-digit code OKX emails them.
 *
 * 1. A route asks for an approval; onchainos answers "code sent" and
 *    nothing is broadcast. runCli throws ApprovalCodeError; the route
 *    answers 428 `approval_code` (approvalPromptResponseFor).
 * 2. The page asks the user for the code (lib/api/approval-code-retry) and
 *    sends the same request again with `approvalCode`.
 * 3. The route first calls releasePausedApproval: onchainos checks the code
 *    and broadcasts the paused approval, unchanged; we wait until it is
 *    mined. Then the route runs its normal flow, which now finds the
 *    allowance in place and does not approve again.
 *
 * "Send a new code" and "Cancel" go through /api/wallet/approval-code.
 */

/** Body field: the code from the user's email. */
export const approvalCode = z
  .string()
  .regex(/^\d{6}$/, "The code has 6 digits")
  .optional();

/** The CLI's error codes, in words the user can act on. */
const MESSAGES: Record<string, string> = {
  approval_code_invalid: "That code is not right. Check the email from OKX and try again, or ask for a new code.",
  approval_code_expired: "The code has expired. Ask for a new one.",
  approval_code_attempts_exceeded: "Too many wrong codes. Wait 10 minutes, then start again.",
  approval_code_send_too_frequent: "A code was sent a moment ago. Wait a minute before asking for another.",
  approval_code_send_failed: "OKX could not send the code. Nothing was sent. Try again.",
  approval_code_verify_failed: "OKX could not check the code. Nothing was sent. Try again.",
  approval_verification_not_found: "This approval is no longer waiting for a code. Start again.",
  approval_verification_not_pending: "This approval is no longer waiting for a code. Start again.",
  approval_verification_expired: "This approval waited too long and was dropped. Start again.",
  approval_verification_context_changed: "The account changed since the code was sent. Start again.",
  approval_verification_unavailable: "Approval verification is not available right now. Nothing was sent. Try again.",
  approval_risk_warning_after_verification:
    "OKX flagged this approval after the code was checked, so it was not sent.",
};

/** Codes after which the same paused approval can still take a (new) code. */
const STILL_WAITING = new Set(["approval_code_invalid", "approval_code_expired", "approval_code_send_too_frequent"]);

/** A user-facing message for an approval-verification error code, or null. */
export function approvalErrorMessage(errorCode: string | undefined): string | null {
  if (!errorCode) return null;
  return MESSAGES[errorCode] ?? (errorCode.startsWith("approval_") ? "The approval was not sent. Try again." : null);
}

/**
 * 428 when OKX paused an approval for the email code; 400 with the CLI's
 * code when checking or sending a code failed. Null for any other error.
 */
export function approvalPromptResponseFor(error: unknown): NextResponse | null {
  if (error instanceof ApprovalCodeError) {
    console.info("[approval-code] OKX paused an approval for an email code", { command: error.command });
    return NextResponse.json(
      {
        success: false,
        code: APPROVAL_CODE_CODE,
        error: "OKX sent a 6-digit code to the email of your account. Enter it to send this approval.",
      },
      { status: 428 }
    );
  }
  if (error instanceof OkxCliError) {
    const message = approvalErrorMessage(error.errorCode);
    if (message) {
      return NextResponse.json(
        { success: false, code: error.errorCode, error: message, retryable: STILL_WAITING.has(error.errorCode!) },
        { status: 400 }
      );
    }
  }
  return null;
}

/**
 * How long to wait for the released approval to be mined. The whole
 * request must stay under Cloudflare's 100 s limit in front of Render.
 */
const RECEIPT_TIMEOUT_MS = 45_000;

/**
 * Check the code and let OKX send the paused approval, then wait until it
 * is mined so the caller's allowance check sees it. Returns its hash.
 */
export async function releasePausedApproval(code: string, chainIndex: number | string): Promise<string | null> {
  const result = await walletApprovalCodeVerify(code);
  const txHash = result.data?.txHash;
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null;
  let client;
  try {
    client = getPublicClient(Number(chainIndex));
  } catch {
    return txHash; // a chain we cannot read: the caller's own checks decide
  }
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: RECEIPT_TIMEOUT_MS,
    });
  } catch {
    // Sent, not yet mined (or the RPC is slow). Every flow checks the
    // allowance before approving, so starting again will not approve twice.
    throw new Error("The approval was sent and is still confirming. Wait a minute, then start again.");
  }
  if (receipt.status !== "success") {
    throw new Error("The approval was sent but failed on chain. Nothing else was sent.");
  }
  return txHash;
}
