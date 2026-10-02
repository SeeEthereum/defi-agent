import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, withSession } from "@/lib/session/session";
import { walletSend, GasStationConfirmingError } from "@/lib/okx/cli";
import { gasStationResponseFor } from "@/lib/okx/gas-station";
import { checkQuote, outputDegraded, quoteFingerprint } from "@/lib/api/quote-store";
import { rateLimit } from "@/lib/api/rate-limit";
import { badRequest, EVM_ADDRESS_RE, NATIVE_TOKEN, sessionEvmAddress } from "@/lib/api/validation";
import {
  findConfidentialToken,
  requestConfidentialQuote,
  submitDepositTx,
} from "@/lib/near-intents/oneclick";
import { checkRecipient } from "@/lib/near-intents/recipient";
import { claimQuote, registerDeposit, releaseQuote } from "@/lib/near-intents/deposits";
import { confidentialError, confidentialRequest } from "@/lib/near-intents/route-helpers";

const schema = confidentialRequest.extend({
  quoteId: z
    .string({ error: "Missing quote. Refresh the quote and try again." })
    .min(1, "Missing quote. Refresh the quote and try again."),
});

function refuse(error: string, status: number, code?: string): NextResponse {
  return NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });
}

// POST /api/confidential/execute — live quote, then transfer to its deposit address.
export const POST = withSession(async (request: NextRequest) => {
  let claimedQuoteId: string | null = null;
  let sendAttempted = false;
  try {
    const limited = rateLimit("confidential-execute:" + currentSession().sid, 5, 60_000);
    if (!limited.ok) return refuse("Too many attempts, wait a minute.", 429);

    const { fromChain, toChain, fromToken, toToken, amount, recipient, quoteId } = schema.parse(
      await request.json()
    );

    const sender = await sessionEvmAddress(fromChain);
    const target = checkRecipient(recipient, sender);
    if (!target.ok) return refuse(target.error, 400, "invalid_recipient");

    // The quote the user saw must be for exactly this pair, amount and recipient.
    const bound = checkQuote(
      quoteId,
      quoteFingerprint(["confidential", fromChain, toChain, fromToken, toToken, amount, target.address])
    );
    if (!bound.ok) return refuse(bound.error, 409, "quote_invalid");

    if (!claimQuote(quoteId)) {
      return refuse(
        "This quote already started a transfer. Check your wallet history before trying again.",
        409,
        "already_started"
      );
    }
    claimedQuoteId = quoteId;

    const [origin, destination] = await Promise.all([
      findConfidentialToken(fromChain, fromToken),
      findConfidentialToken(toChain, toToken),
    ]);
    if (!origin || !destination) {
      releaseQuote(quoteId);
      return refuse("This token is not available for confidential swaps.", 400);
    }

    const live = await requestConfidentialQuote({
      dry: false,
      originAsset: origin.assetId,
      destinationAsset: destination.assetId,
      amount,
      recipient: target.address,
      refundTo: sender,
    });

    // Nothing has been sent yet, so every check below can still back out.
    const depositAddress = live.depositAddress?.toLowerCase();
    if (!depositAddress || !EVM_ADDRESS_RE.test(depositAddress) || live.depositMemo) {
      releaseQuote(quoteId);
      return refuse("The swap service returned an unusable deposit address.", 502);
    }
    if (live.amountIn !== amount) {
      releaseQuote(quoteId);
      return refuse("The swap service changed the amount. Refresh the quote.", 409, "quote_invalid");
    }
    if (outputDegraded(bound.expectedOut, live.amountOut, 1)) {
      releaseQuote(quoteId);
      return refuse("Price moved since the quote. Refresh and try again.", 409, "price_moved");
    }

    // Register first, so the swap can still be tracked if the send's response is lost.
    registerDeposit(depositAddress);

    sendAttempted = true;
    const sendResult = await walletSend({
      amtMinimal: amount,
      recipient: depositAddress,
      chain: String(fromChain),
      contractToken: fromToken === NATIVE_TOKEN ? undefined : fromToken,
      // Server-side constant: the client cannot control `force`.
      force: true,
    });

    const data = sendResult.data as Record<string, unknown> | null;
    const txHash =
      [data?.txHash, data?.hash, data?.transactionHash].find(
        (v): v is string => typeof v === "string" && v.startsWith("0x")
      ) ?? null;

    if (data?.status === "failed" || data?.status === "reverted") {
      return refuse("The deposit transaction failed on-chain. Nothing was swapped.", 400);
    }

    if (txHash) {
      // Optional speed-up; 1Click also detects the deposit on its own.
      await submitDepositTx(depositAddress, txHash).catch((error) =>
        console.error("[confidential/execute] deposit submit", error)
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        depositAddress,
        txHash,
        recipient: target.address,
        amountOutFormatted: live.amountOutFormatted,
        timeEstimate: live.timeEstimate,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    // Keep the claim once a send may have broadcast. A Gas Station prompt is
    // the exception: it is raised before anything leaves the wallet.
    if (claimedQuoteId && (!sendAttempted || error instanceof GasStationConfirmingError)) {
      releaseQuote(claimedQuoteId);
    }
    const gasStation = gasStationResponseFor(error);
    if (gasStation) return gasStation;
    return confidentialError("confidential/execute", error, "Confidential swap failed");
  }
});
