import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import { encodeWithdraw, encodeRedeem, parseAmount } from "@/lib/fluid/ftokens";
import { getFToken } from "@/lib/fluid/constants";
import { FLUID_CHAIN_IDS } from "@/lib/chains";
import { normalizeAddress } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  fTokenSymbol: z.string().min(1),
  amount: z.string().min(1), // UI units (underlying)
  chainIndex: z.number().refine((n) => FLUID_CHAIN_IDS.includes(n)),
  walletAddress: z.string().regex(/^0x[0-9a-f]{40}$/),
  // Optional: pass fToken address directly for dynamically discovered tokens
  fTokenAddress: z.string().regex(/^0x[0-9a-f]{40}$/).optional(),
  decimals: z.number().optional(),
  // If true, use redeem(shares) instead of withdraw(assets) to avoid rounding issues
  isAll: z.boolean().optional(),
  shares: z.string().optional(), // raw shares bigint string, used when isAll=true
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fTokenSymbol, amount, chainIndex, walletAddress, fTokenAddress, decimals, isAll, shares } =
      schema.parse(body);

    // Try hardcoded lookup first, fall back to provided address
    const fToken = getFToken(chainIndex, fTokenSymbol);
    const tokenAddress = fToken?.address ?? fTokenAddress;
    const tokenDecimals = fToken?.underlyingDecimals ?? decimals;

    if (!tokenAddress || tokenDecimals === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: `fToken ${fTokenSymbol} not found on chain ${chainIndex}`,
        },
        { status: 400 }
      );
    }

    const wallet = normalizeAddress(walletAddress) as `0x${string}`;

    // Use redeem(shares) for "withdraw all" to avoid rounding dust issues
    // Use withdraw(assets) for partial withdrawals
    const withdrawCalldata =
      isAll && shares
        ? encodeRedeem(BigInt(shares), wallet, wallet)
        : encodeWithdraw(parseAmount(amount, tokenDecimals), wallet, wallet);

    const result = await walletContractCall({
      to: tokenAddress,
      chain: String(chainIndex),
      inputData: withdrawCalldata,
      force: true, // Skip simulation — may fail due to timing
    });

    return NextResponse.json({
      success: true,
      data: {
        txHash: (result.data as { txHash?: string })?.txHash,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Withdraw failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
