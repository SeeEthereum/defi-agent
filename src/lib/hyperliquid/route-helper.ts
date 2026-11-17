/**
 * Shared helpers for /api/perp/* routes.
 *
 * Every perp endpoint returns one of:
 *   { success: true,  data }                                    — happy path
 *   { success: false, error, errorCode?, suggestion? }  (400)   — domain error from HL
 *     (e.g. insufficient margin, min-notional, signer rejection — all the
 *      structured failures mapped in hyperliquid/cli.ts)
 *   { success: false, error: "Hyperliquid request failed" } (500)
 *     — unexpected failures; actionable messages (not logged in,
 *       insufficient, max leverage, stop-loss, take-profit, withdrawable,
 *       deposit) stay visible, everything else is logged server-side.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { HlResult } from "./cli";
import { reportServerError } from "@/lib/monitoring/report";

// ── Shared zod validators ───────────────────────────────────────────────────
// Most HL routes take numeric values as JSON strings (the native SDK also
// expects stringified decimals for size/price to avoid float rounding), so
// we validate the shape at the edge rather than coercing to Number and
// stringifying again. `positiveDecimalString` rejects negatives, NaN, "",
// and exponents — the three things that would slip through a bare
// `z.string().min(1)`.

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** Non-empty decimal string, > 0 (rejects "0" and "0.0"). */
export const positiveDecimalString = z
  .string()
  .regex(DECIMAL_RE, "must be a decimal number (e.g. 1.5)")
  .refine((v) => Number(v) > 0, "must be > 0");

/** Decimal string, >= 0. Accepts "0". */
export const nonNegativeDecimalString = z
  .string()
  .regex(DECIMAL_RE, "must be a decimal number (e.g. 1.5)");

/** Whole-number string — used for HL order IDs which are uint64. */
export const nonNegativeIntegerString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer")
  .refine((v) => v.length <= 20, "order id out of range");

export function respond<T>(result: HlResult<T>): NextResponse {
  if (result.ok) {
    return NextResponse.json({ success: true, data: result.data });
  }
  return NextResponse.json(
    {
      success: false,
      error: result.error,
      errorCode: result.errorCode,
      suggestion: result.suggestion,
    },
    { status: 400 }
  );
}

const ACTIONABLE_HL_MESSAGE =
  /not logged in|insufficient|max leverage|stop-loss|take-profit|withdrawable|deposit/i;

export function respondBinError(error: unknown, fallback: string): NextResponse {
  console.error("[perp] route error:", error);
  // Same as lib/api/validation publicErrorMessage: the user needs what went
  // wrong, not the internal command name ("onchainos wallet addresses failed: ").
  const message = (error instanceof Error ? error.message : "").replace(/^onchainos [\w -]+ failed:\s*/i, "");
  const visible = ACTIONABLE_HL_MESSAGE.test(message);
  if (!visible) reportServerError("perp", error);
  void fallback;
  return NextResponse.json(
    { success: false, error: visible ? message : "Hyperliquid request failed" },
    { status: 500 }
  );
}
