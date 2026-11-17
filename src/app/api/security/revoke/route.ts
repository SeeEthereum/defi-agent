import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import { encodeApprove } from "@/lib/fluid/ftokens";
import { gasStationResponseFor } from "@/lib/okx/gas-station";
import { acknowledgeRisk, forceAfterConsent, riskResponseFor } from "@/lib/okx/risk-confirmation";
import { z } from "zod";
import { withSession } from "@/lib/session/session";
import { guardDuplicates } from "@/lib/api/duplicate-guard";
import {
  apiError,
  badRequest,
  chainId,
  evmAddress,
} from "@/lib/api/validation";

const schema = z.object({
  tokenAddress: evmAddress,
  spenderAddress: evmAddress,
  chainIndex: chainId,
  acknowledgeRisk,
});

export const POST = withSession(guardDuplicates("security/revoke", async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { tokenAddress, spenderAddress, chainIndex, acknowledgeRisk } = schema.parse(body);

    // Revoke = approve(spender, 0)
    const revokeCalldata = encodeApprove(
      spenderAddress as `0x${string}`,
      BigInt(0)
    );

    console.log(
      `[Security/Revoke] chain=${chainIndex} token=${tokenAddress} spender=${spenderAddress}`
    );

    const result = await walletContractCall({
      to: tokenAddress,
      chain: String(chainIndex),
      inputData: revokeCalldata,
      force: forceAfterConsent(acknowledgeRisk),
    });

    return NextResponse.json({
      success: true,
      data: { txHash: (result.data as { txHash?: string })?.txHash },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    const prompt = gasStationResponseFor(error) ?? riskResponseFor(error);
    if (prompt) return prompt;
    return apiError("security/revoke", error, "Request failed");
  }
}));
