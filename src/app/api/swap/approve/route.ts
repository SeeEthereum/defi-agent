import { NextRequest, NextResponse } from "next/server";
import { swapApprove, walletContractCall } from "@/lib/okx/cli";
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

    // onchainos swap approve returns the approval TX DATA — not a broadcast
    const result = await swapApprove({
      token: normalizeAddress(token),
      amount,
      chain,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawData = result.data as any;
    const entry = Array.isArray(rawData) ? rawData[0] : rawData;

    // Extract the tx object (to = token address, data = approve calldata)
    const tx = entry?.tx ?? entry;
    const to = tx?.to ?? tx?.tokenAddress ?? normalizeAddress(token);
    const inputData = tx?.data ?? tx?.inputData;

    if (!inputData) {
      // If no tx data returned, the allowance might already be sufficient
      return NextResponse.json({
        success: true,
        data: { txHash: null, alreadyApproved: true },
      });
    }

    const chainConfig = getChainBySwapName(chain);
    if (!chainConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown chain: ${chain}` },
        { status: 400 }
      );
    }

    // Actually SEND the approval transaction via walletContractCall
    const callResult = await walletContractCall({
      to: normalizeAddress(to),
      chain: String(chainConfig.chainIndex),
      inputData,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callData = callResult.data as any;
    const txHash =
      callData?.txHash ??
      callData?.hash ??
      (typeof callData === "string" && callData.startsWith("0x") ? callData : null);

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
