import { NextRequest, NextResponse } from "next/server";
import { dexApproveTransaction } from "@/lib/okx/dex-api";
import { walletContractCall } from "@/lib/okx/cli";
import { z } from "zod";
import { normalizeAddress } from "@/lib/utils";
import { getChainBySwapName } from "@/lib/chains";

const schema = z.object({
  token: z.string().min(1),
  amount: z.string().min(1), // minimal units
  chain: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, amount, chain } = schema.parse(body);

    const chainConfig = getChainBySwapName(chain);
    if (!chainConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown chain: ${chain}` },
        { status: 400 }
      );
    }

    const chainIndex = String(chainConfig.chainIndex);
    const tokenAddr = normalizeAddress(token);

    // Get approve calldata from OKX DEX Aggregator API
    const approveData = await dexApproveTransaction({
      chainIndex,
      tokenContractAddress: tokenAddr,
      approveAmount: amount,
    });

    if (!approveData?.data) {
      // No calldata = allowance already sufficient
      return NextResponse.json({
        success: true,
        data: { txHash: null, alreadyApproved: true },
      });
    }

    // Broadcast the approve tx via wallet contract-call.
    // The `to` address is the TOKEN contract (calling approve() on it).
    const callResult = await walletContractCall({
      to: tokenAddr,
      chain: chainIndex,
      inputData: approveData.data,
      gasLimit: approveData.gasLimit,
      force: true, // Skip backend simulation — may race with recent txs
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callData = callResult.data as any;
    const txHash =
      callData?.txHash ??
      callData?.hash ??
      (typeof callData === "string" && callData.startsWith("0x")
        ? callData
        : null);

    return NextResponse.json({
      success: true,
      data: { txHash, ...callData },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Approve failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
