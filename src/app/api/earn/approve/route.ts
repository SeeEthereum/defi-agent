import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import { encodeApprove, parseAmount } from "@/lib/fluid/ftokens";
import { getFToken } from "@/lib/fluid/constants";
import { FLUID_CHAIN_IDS } from "@/lib/chains";
import { z } from "zod";

const schema = z.object({
  fTokenSymbol: z.string().min(1),
  amount: z.string().min(1),
  chainIndex: z.number().refine((n) => FLUID_CHAIN_IDS.includes(n)),
  fTokenAddress: z.string().regex(/^0x[0-9a-f]{40}$/).optional(),
  underlyingAddress: z.string().regex(/^0x[0-9a-f]{40}$/).optional(),
  decimals: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fTokenSymbol, amount, chainIndex, fTokenAddress, underlyingAddress, decimals } =
      schema.parse(body);

    const fToken = getFToken(chainIndex, fTokenSymbol);
    const tokenAddress = fToken?.address ?? fTokenAddress;
    const tokenUnderlying = fToken?.underlying ?? underlyingAddress;
    const tokenDecimals = fToken?.underlyingDecimals ?? decimals;

    if (!tokenAddress || !tokenUnderlying || tokenDecimals === undefined) {
      return NextResponse.json(
        { success: false, error: `fToken ${fTokenSymbol} not found on chain ${chainIndex}` },
        { status: 400 }
      );
    }

    const rawAmount = parseAmount(amount, tokenDecimals);

    // Approve the fToken contract to spend underlying tokens
    const approveCalldata = encodeApprove(tokenAddress as `0x${string}`, rawAmount);

    const result = await walletContractCall({
      to: tokenUnderlying,
      chain: String(chainIndex),
      inputData: approveCalldata,
    });

    return NextResponse.json({
      success: true,
      data: { approveTxHash: (result.data as { txHash?: string })?.txHash },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approve failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
