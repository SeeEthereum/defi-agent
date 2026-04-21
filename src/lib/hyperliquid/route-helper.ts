/**
 * Shared helpers for /api/perp/* routes.
 *
 * Every perp endpoint returns one of:
 *   { success: true,  data }                                    — happy path
 *   { success: false, error, errorCode?, suggestion? }          — domain error from the plugin
 *   { success: false, error: "<binary failure>" }  (HTTP 500)   — invocation failure
 */
import { NextResponse } from "next/server";
import type { HlResult } from "./cli";

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
