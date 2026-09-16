import { NextRequest, NextResponse } from "next/server";
import { bridgeQuote } from "@/lib/bridge/lifi";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import { issueQuote, quoteFingerprint } from "@/lib/api/quote-store";
import {
  apiError,
  badRequest,
  baseUnitAmount,
  chainId,
  sessionEvmAddress,
  tokenAddress,
} from "@/lib/api/validation";

const schema = z.object({
  fromChain: chainId,
  toChain: chainId,
  fromToken: tokenAddress,
  toToken: tokenAddress,
  fromAmount: baseUnitAmount,
});

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const { fromChain, toChain, fromToken, toToken, fromAmount } = schema.parse({
      fromChain: searchParams.get("fromChain"),
      toChain: searchParams.get("toChain"),
      fromToken: searchParams.get("fromToken"),
      toToken: searchParams.get("toToken"),
      fromAmount: searchParams.get("fromAmount"),
    });

    // The CLI signs with the session wallet, so both sender and receiver must be that wallet.
    const fromAddress = await sessionEvmAddress(String(fromChain));

    const quote = await bridgeQuote({
      fromChain: String(fromChain),
      toChain: String(toChain),
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
      toAddress: fromAddress,
    });

    const fingerprint = quoteFingerprint(["bridge", fromChain, toChain, fromToken, toToken, fromAmount]);
    const quoteId = issueQuote(fingerprint, quote.estimate?.toAmount ?? null);

    return NextResponse.json({ success: true, data: { ...quote, quoteId } });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("bridge/quote", error, "Failed to get bridge quote");
  }
});
