import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, withSession } from "@/lib/session/session";
import { issueQuote, quoteFingerprint } from "@/lib/api/quote-store";
import { rateLimit } from "@/lib/api/rate-limit";
import { badRequest, sessionEvmAddress } from "@/lib/api/validation";
import { findConfidentialToken, requestConfidentialQuote } from "@/lib/near-intents/oneclick";
import { checkRecipient } from "@/lib/near-intents/recipient";
import { confidentialError, confidentialRequest } from "@/lib/near-intents/route-helpers";

// POST /api/confidential/quote — dry confidential quote, bound to the recipient.
export const POST = withSession(async (request: NextRequest) => {
  try {
    const limited = rateLimit("confidential-quote:" + currentSession().sid, 20, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { success: false, error: "Too many quotes, slow down." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
      );
    }

    const { fromChain, toChain, fromToken, toToken, amount, recipient } =
      confidentialRequest.parse(await request.json());

    const sender = await sessionEvmAddress(fromChain);
    const target = checkRecipient(recipient, sender);
    if (!target.ok) {
      return NextResponse.json(
        { success: false, error: target.error, code: "invalid_recipient" },
        { status: 400 }
      );
    }

    const [origin, destination] = await Promise.all([
      findConfidentialToken(fromChain, fromToken),
      findConfidentialToken(toChain, toToken),
    ]);
    if (!origin || !destination) {
      return NextResponse.json(
        { success: false, error: "This token is not available for confidential swaps." },
        { status: 400 }
      );
    }
    if (origin.assetId === destination.assetId) {
      return NextResponse.json(
        { success: false, error: "Pick a different token or network to receive." },
        { status: 400 }
      );
    }

    const quote = await requestConfidentialQuote({
      dry: true,
      originAsset: origin.assetId,
      destinationAsset: destination.assetId,
      amount,
      recipient: target.address,
      refundTo: sender,
    });

    const quoteId = issueQuote(
      quoteFingerprint(["confidential", fromChain, toChain, fromToken, toToken, amount, target.address]),
      quote.amountOut
    );

    return NextResponse.json({
      success: true,
      data: {
        quoteId,
        recipient: target.address,
        amountIn: quote.amountIn,
        amountInFormatted: quote.amountInFormatted,
        amountInUsd: quote.amountInUsd ?? null,
        amountOut: quote.amountOut,
        amountOutFormatted: quote.amountOutFormatted,
        amountOutUsd: quote.amountOutUsd ?? null,
        minAmountOut: quote.minAmountOut,
        timeEstimate: quote.timeEstimate,
        toDecimals: destination.decimals,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return confidentialError("confidential/quote", error, "Could not get a confidential quote");
  }
});
