import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import { encodeApprove } from "@/lib/fluid/ftokens";
import { z } from "zod";
import { withSession } from "@/lib/session/session";
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
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { tokenAddress, spenderAddress, chainIndex } = schema.parse(body);

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
    });

    return NextResponse.json({
      success: true,
      data: { txHash: (result.data as { txHash?: string })?.txHash },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("security/revoke", error, "Request failed");
  }
});
