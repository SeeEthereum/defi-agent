import { NextResponse } from "next/server";
import { z } from "zod";
import { publicErrorMessage, baseUnitAmount, chainId, tokenAddress } from "@/lib/api/validation";
import { OneClickError } from "./oneclick";

/** Body shared by the confidential quote and execute routes. */
export const confidentialRequest = z.object({
  fromChain: chainId,
  toChain: chainId,
  fromToken: tokenAddress,
  toToken: tokenAddress,
  amount: baseUnitAmount,
  recipient: z.string().max(100),
});

/**
 * Error response for the confidential routes.
 *
 * 1Click's own 4xx messages ("Amount is too low…", "Pair not supported")
 * tell the user what to change, so they pass through, trimmed. Auth and
 * server-side failures stay generic and go to the log.
 */
export function confidentialError(scope: string, error: unknown, fallback: string): NextResponse {
  if (error instanceof OneClickError) {
    console.error(`[${scope}]`, error.status, error.message);
    const userFacing = error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403;
    const message = error.status === null ? error.message : userFacing ? error.message.slice(0, 200) : fallback;
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
  return NextResponse.json(
    { success: false, error: publicErrorMessage(scope, error, fallback) },
    { status: 500 }
  );
}
