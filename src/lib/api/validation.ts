/**
 * Shared request validation for the API routes.
 *
 * Every route that moves funds validates its body with these schemas before
 * anything reaches the onchainos CLI: amounts must be plain positive
 * numbers (no exponent, no comma, no sign), addresses must be real EVM
 * addresses, chains must be in the supported set, and slippage is capped.
 *
 * `sessionEvmAddress()` returns the address of the wallet logged into the
 * *current session*. Routes must use it instead of an address taken from
 * the request body: the CLI always signs with the session wallet, so a
 * client-supplied address could otherwise redirect the proceeds of a swap
 * or a bridge to someone else.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_CHAIN_IDS } from "@/lib/chains";
import { OkxCliError, walletAddresses } from "@/lib/okx/cli";

export const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** OKX/LI.FI sentinel for the chain's native coin. */
export const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

/** An EVM address, normalized to lowercase. */
export const evmAddress = z
  .string()
  .regex(EVM_ADDRESS_RE, "must be a 0x-prefixed 20-byte EVM address")
  .transform((v) => v.toLowerCase());

/** A token address or the native sentinel, normalized to lowercase. */
export const tokenAddress = evmAddress;

/** An amount already expressed in base units (wei / smallest unit). */
export const baseUnitAmount = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{0,77}$/, "amount must be a positive integer in base units");

/**
 * A human-readable amount ("1.5"). Accepts the Italian decimal comma and
 * rejects exponent notation, signs and zero.
 */
export const decimalAmount = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => /^\d{1,30}(\.\d{1,18})?$/.test(v), "amount must be a positive decimal number")
  .refine((v) => Number(v) > 0, "amount must be greater than zero");

/** One of the chains this app supports. */
export const chainId = z.coerce
  .number()
  .int()
  .refine((n) => SUPPORTED_CHAIN_IDS.includes(n), "unsupported chain");

/** Slippage in percent. Capped: above this a swap is sandwich bait. */
export const MAX_SLIPPAGE_PERCENT = 5;
export const slippagePercent = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "slippage must be a number")
  .refine(
    (v) => Number(v) > 0 && Number(v) <= MAX_SLIPPAGE_PERCENT,
    `slippage must be between 0 and ${MAX_SLIPPAGE_PERCENT} percent`
  );

/** 400 response carrying the first validation message. */
export function badRequest(error: z.ZodError): NextResponse {
  return NextResponse.json(
    { success: false, error: error.issues[0]?.message ?? "Invalid request", code: "invalid_request" },
    { status: 400 }
  );
}

// Messages the user can act on. Everything else (CLI stderr, file paths,
// upstream bodies) stays server-side.
const SAFE_MESSAGE_PATTERNS = [
  /not logged in/i,
  /not available in your region/i,
  /insufficient/i,
  /gas station/i,
  /slippage/i,
  /quota/i,
];

/**
 * Log the real error, return something safe for the client.
 */
export function publicErrorMessage(scope: string, error: unknown, fallback: string): string {
  console.error(`[${scope}]`, error);
  const raw = error instanceof Error ? error.message : "";
  // Drop the "onchainos wallet send failed: " style prefix — the user does
  // not need the internal command name, only what went wrong.
  const message = raw.replace(/^onchainos [\w -]+ failed:\s*/i, "");
  if (message && SAFE_MESSAGE_PATTERNS.some((re) => re.test(message))) return message;
  return fallback;
}

/** Log the real error and build the client response in one call. */
export function apiError(
  scope: string,
  error: unknown,
  fallback: string,
  status = 500
): NextResponse {
  return NextResponse.json(
    { success: false, error: publicErrorMessage(scope, error, fallback) },
    { status }
  );
}

interface AddressRecord {
  address?: string;
  chainIndex?: string;
}

/**
 * The EVM address of the wallet logged into the current session — the
 * address that will actually sign. Never trust an address from the request
 * body for this.
 */
export async function sessionEvmAddress(chainIndex?: string | number): Promise<string> {
  const result = await walletAddresses();
  const data = result.data as { evm?: AddressRecord[] } | null;
  const evm = data?.evm ?? [];
  const wanted = chainIndex !== undefined ? String(chainIndex) : undefined;
  const record = (wanted && evm.find((e) => e.chainIndex === wanted)) || evm[0];
  const address = record?.address?.toLowerCase();
  if (!address || !EVM_ADDRESS_RE.test(address)) {
    throw new OkxCliError("wallet addresses", null, "Not logged in. Please sign in first.");
  }
  return address;
}
