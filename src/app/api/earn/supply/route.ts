import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import { encodeDeposit, parseAmount } from "@/lib/fluid/ftokens";
import { getFToken } from "@/lib/fluid/constants";
import { FLUID_CHAIN_IDS } from "@/lib/chains";
import { normalizeAddress } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  fTokenSymbol: z.string().min(1),
  amount: z.string().min(1), // UI units (e.g. "100" for 100 USDC)
  chainIndex: z.number().refine((n) => FLUID_CHAIN_IDS.includes(n)),
  walletAddress: z.string().regex(/^0x[0-9a-f]{40}$/),
  // Optional: pass addresses directly for dynamically discovered tokens
  fTokenAddress: z.string().regex(/^0x[0-9a-f]{40}$/).optional(),
  underlyingAddress: z.string().regex(/^0x[0-9a-f]{40}$/).optional(),
  decimals: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fTokenSymbol, amount, chainIndex, walletAddress, fTokenAddress, underlyingAddress, decimals } =
      schema.parse(body);

    // ALWAYS prefer hardcoded lookup — it's verified on-chain per chain
    const fToken = getFToken(chainIndex, fTokenSymbol);
    const tokenAddress = fToken?.address ?? fTokenAddress;
    const tokenUnderlying = fToken?.underlying ?? underlyingAddress;
    const tokenDecimals = fToken?.underlyingDecimals ?? decimals;

    // Safety: log which address we're using to catch address mismatches
    console.log(`[Earn/Supply] chain=${chainIndex} symbol=${fTokenSymbol} fToken=${tokenAddress} (hardcoded=${fToken?.address ?? "none"}, frontend=${fTokenAddress ?? "none"})`);

    if (!tokenAddress || !tokenUnderlying || tokenDecimals === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: `fToken ${fTokenSymbol} not found on chain ${chainIndex}`,
        },
        { status: 400 }
      );
    }

    const rawAmount = parseAmount(amount, tokenDecimals);
    const wallet = normalizeAddress(walletAddress) as `0x${string}`;

    // Deposit into fToken (approve must have been called first via /api/earn/approve)
    // force:true bypasses backend pre-simulation — approve may not be mined yet
    const depositCalldata = encodeDeposit(rawAmount, wallet);

    const depositResult = await walletContractCall({
      to: tokenAddress,
      chain: String(chainIndex),
      inputData: depositCalldata,
      force: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        depositTxHash: (depositResult.data as { txHash?: string })?.txHash,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Supply failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
