import { NextResponse } from "next/server";
import { GasStationConfirmingError } from "./cli";

/**
 * Shared catch-handler for execute routes (swap / bridge / send).
 *
 * A GasStationConfirmingError means the backend wants the user to pick a
 * stablecoin to pay gas before the transaction can proceed. We surface it
 * as HTTP 200 with `requiresGasStation: true` — it's a decision point, not
 * a failure. The client flow is:
 *
 *   1. Show the token picker (payload.tokenList, only sufficient=true
 *      entries) with the service charge visible — Gas Station is NOT free.
 *   2. On pick: POST /api/wallet/gas-station
 *      - status FIRST_TIME_PROMPT / PENDING_UPGRADE / REENABLE_ONLY →
 *        action "setup" (needs explicit user consent: first activation is
 *        an irreversible on-chain step)
 *      - otherwise (enabled but default token insufficient / no default) →
 *        action "update-default-token"
 *   3. Re-run the original execute request unchanged — the backend now
 *      hits the automatic path.
 *
 * INSUFFICIENT_ALL and HAS_PENDING_TX are terminal: show the message,
 * don't retry.
 *
 * Returns null when the error is not Gas Station related, so the caller
 * falls through to its normal error handling.
 */
export function gasStationResponseFor(error: unknown): NextResponse | null {
  if (!(error instanceof GasStationConfirmingError)) return null;
  return NextResponse.json({
    success: false,
    requiresGasStation: true,
    gasStation: error.payload,
  });
}
