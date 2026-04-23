/**
 * Shared helpers for /api/perp/* routes.
 *
 * Every perp endpoint returns one of:
 *   { success: true,  data }                                    — happy path
 *   { success: false, error, errorCode?, suggestion? }  (400)   — domain error from HL
 *     (e.g. insufficient margin, min-notional, signer rejection — all the
 *      structured failures mapped in hyperliquid/cli.ts)
 *   { success: false, error: "<throw message>" }        (500)   — unexpected
 *     failures (network / keystore / panics) that couldn't be mapped to a
 *     user-facing error code.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { HlResult } from "./cli";

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

export function respondBinError(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  console.error("[perp] route error:", error);
  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}

/** Friendly Italian/English messages for common HL error codes. */
export const HL_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE:
    "Saldo USDC su Arbitrum insufficiente. Deposita USDC sul tuo indirizzo Arbitrum prima di riprovare.",
  INSUFFICIENT_MARGIN:
    "Margine insufficiente per questa posizione. Riduci la size o aumenta il deposito HL.",
  SIGNING_FAILED:
    "La firma del wallet è fallita. Verifica che onchainos sia autenticato (aggiorna se necessario).",
  NOT_REGISTERED:
    "Hyperliquid non è stato ancora configurato. Esegui prima la registrazione del wallet.",
  MIN_NOTIONAL:
    "L'ordine è sotto il minimo notional di $10 USDC. Aumenta la size.",
  PRICE_OUT_OF_BAND:
    "Prezzo limite troppo lontano dal mid. Usa un prezzo più vicino al market.",
  REDUCE_ONLY_VIOLATION:
    "L'ordine reduce-only non può aprire o aumentare una posizione esistente.",
};

export function friendlyMessage(errorCode?: string, fallback?: string): string {
  if (errorCode && HL_ERROR_MESSAGES[errorCode]) return HL_ERROR_MESSAGES[errorCode];
  return fallback ?? "Operazione fallita.";
}
