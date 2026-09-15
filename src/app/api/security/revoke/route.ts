import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import { encodeApprove } from "@/lib/fluid/ftokens";
import { z } from "zod";
import { withSession } from "@/lib/session/session";

const schema = z.object({
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  spenderAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainIndex: z.number(),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { tokenAddress, spenderAddress, chainIndex } = schema.parse(body);

    // Revoke = approve(spender, 0)
    const revokeCalldata = encodeApprove(
      spenderAddress.toLowerCase() as `0x${string}`,
      BigInt(0)
    );

    console.log(
      `[Security/Revoke] chain=${chainIndex} token=${tokenAddress} spender=${spenderAddress}`
    );

    const result = await walletContractCall({
      to: tokenAddress.toLowerCase(),
      chain: String(chainIndex),
      inputData: revokeCalldata,
    });

    return NextResponse.json({
      success: true,
      data: { txHash: (result.data as { txHash?: string })?.txHash },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Revoke failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
