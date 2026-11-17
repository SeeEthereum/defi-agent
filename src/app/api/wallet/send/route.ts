import { NextRequest, NextResponse } from "next/server";
import { walletSend } from "@/lib/okx/cli";
import { gasStationResponseFor } from "@/lib/okx/gas-station";
import { acknowledgeRisk, forceAfterConsent, riskResponseFor } from "@/lib/okx/risk-confirmation";
import { z } from "zod";
import { withSession } from "@/lib/session/session";
import { guardDuplicates } from "@/lib/api/duplicate-guard";
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
  acknowledgeRisk,
});

export const POST = withSession(guardDuplicates("wallet/send", async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { amount, recipient, chain, contractToken, acknowledgeRisk } = schema.parse(body);

    const result = await walletSend({
      amount,
      recipient,
      chain: String(chain),
      contractToken,
      force: forceAfterConsent(acknowledgeRisk),
    });

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const gasStation = gasStationResponseFor(error);
    if (gasStation) return gasStation;
    const risk = riskResponseFor(error);
    if (risk) return risk;

    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/send", error, "Transfer failed");
  }
}));
