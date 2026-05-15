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
    // `amount` is validated by the schema but not forwarded — we always
    // approve max uint256 (see comment further down where the actual
    // approve calldata is built). Keep it in the schema so callers
    // continue to send it without a 400, but extract only what we use.
    const { token, chain } = schema.parse(body);

    const chainConfig = getChainBySwapName(chain);
    if (!chainConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown chain: ${chain}` },
        { status: 400 }
      );
    }

    const chainIndex = String(chainConfig.chainIndex);
    const tokenAddr = normalizeAddress(token);

    // Get approve calldata from OKX DEX Aggregator API.
    // Use max uint256 to avoid issues where the router needs slightly more
    // than the exact swap amount (fees, rounding). This is standard practice
    // for DEX approvals — the user already confirmed the swap action.
    const MAX_UINT256 =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const approveData = await dexApproveTransaction({
      chainIndex,
      tokenContractAddress: tokenAddr,
      approveAmount: MAX_UINT256,
    });

    if (!approveData?.data) {
      // No calldata = allowance already sufficient
      return NextResponse.json({
        success: true,
        data: { txHash: null, alreadyApproved: true },
      });
    }

    // USDT requires resetting allowance to 0 before setting a new one.
    // Known USDT addresses across chains:
    const USDT_ADDRESSES = [
      "0xdac17f958d2ee523a2206206994597c13d831ec7", // Ethereum
      "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // Arbitrum
      "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // Polygon
      "0x55d398326f99059ff775485246999027b3197955", // BNB Chain
    ];
    if (USDT_ADDRESSES.includes(tokenAddr)) {
      try {
        const resetData = await dexApproveTransaction({
          chainIndex,
          tokenContractAddress: tokenAddr,
          approveAmount: "0",
        });
        if (resetData?.data) {
          await walletContractCall({
            to: tokenAddr,
            chain: chainIndex,
            inputData: resetData.data,
            force: true,
          });
          // Brief pause to let the reset propagate
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch {
        // Reset is best-effort — continue with the actual approval
      }
    }

    // Broadcast the approve tx via wallet contract-call.
    // The `to` address is the TOKEN contract (calling approve() on it).
    const callResult = await walletContractCall({
      to: tokenAddr,
      chain: chainIndex,
      inputData: approveData.data,
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
