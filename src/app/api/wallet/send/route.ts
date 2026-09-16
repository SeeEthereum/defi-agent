import { NextRequest, NextResponse } from "next/server";
import { walletSend } from "@/lib/okx/cli";
import { gasStationResponseFor } from "@/lib/okx/gas-station";
import { z } from "zod";
import { withSession } from "@/lib/session/session";
import {
  apiError,
  badRequest,
  chainId,
  decimalAmount,
  evmAddress,
  tokenAddress,
} from "@/lib/api/validation";

const schema = z.object({
  amount: decimalAmount,
  recipient: evmAddress,
  chain: chainId,
  contractToken: tokenAddress.optional(),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { amount, recipient, chain, contractToken } = schema.parse(body);

    const result = await walletSend({
      amount,
      recipient,
      chain: String(chain),
      contractToken,
      // Server-side constant: the client cannot control `force`.
      force: true,
    });

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const gasStation = gasStationResponseFor(error);
    if (gasStation) return gasStation;

    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/send", error, "Transfer failed");
  }
});
