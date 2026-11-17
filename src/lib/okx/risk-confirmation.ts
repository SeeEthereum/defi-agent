import { NextResponse } from "next/server";
import { z } from "zod";
import { RISK_CONFIRMATION_CODE } from "@/lib/api/send-state";
import { RiskConfirmingError } from "./cli";

/**
 * The wallet backend's risk prompts, end to end.
 *
 * A route that signs a user's transaction runs the CLI without `--force`.
 * If the backend flags the transaction, runCli throws RiskConfirmingError
 * and the route answers 428 `risk_confirmation` with the backend's message.
 * The app layout shows that message to the user; if they accept, it sends
 * the same request again with `acknowledgeRisk: true`, and only then does
 * the route pass `--force`. Nothing is signed in between.
 */

/** Body field set by the page after the user accepted the wallet's warning. */
export const acknowledgeRisk = z.boolean().optional();

/** `--force` only after the user saw and accepted the backend's warning. */
export function forceAfterConsent(acknowledged: boolean | undefined): boolean {
  return acknowledged === true;
}

/** True when the wallet stopped to ask, before signing anything. */
export function isRiskPrompt(error: unknown): error is RiskConfirmingError {
  return error instanceof RiskConfirmingError;
}

/** 428 response carrying the backend's prompt, or null for any other error. */
export function riskResponseFor(error: unknown): NextResponse | null {
  if (!isRiskPrompt(error)) return null;
  console.info("[risk] wallet asked for confirmation", { command: error.command });
  return NextResponse.json(
    { success: false, code: RISK_CONFIRMATION_CODE, error: error.prompt },
    { status: 428 }
  );
}
