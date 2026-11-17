import { NextRequest, NextResponse } from "next/server";
import { dexApproveTransaction } from "@/lib/okx/dex-api";
import { walletContractCall } from "@/lib/okx/cli";
import { z } from "zod";
import { normalizeAddress } from "@/lib/utils";
import { getChainBySwapName } from "@/lib/chains";
import { withSession } from "@/lib/session/session";
import { guardDuplicates } from "@/lib/api/duplicate-guard";
import {
  tokenAddress,
  baseUnitAmount,
  badRequest,
  apiError,
  sessionEvmAddress,
} from "@/lib/api/validation";
import { approvalCode, approvalPromptResponseFor, releasePausedApproval } from "@/lib/okx/approval-code";
import { getPublicClient } from "@/lib/fluid/client";
import { erc20Abi } from "viem";

const schema = z.object({
  token: tokenAddress,
  amount: baseUnitAmount,
  chain: z.string().min(1),
  approvalCode,
});

/** Current allowance, or null when the chain cannot be read. */
async function allowanceOf(chainIndex: number, token: string, owner: string, spender: string): Promise<bigint | null> {
  try {
    return await getPublicClient(chainIndex).readContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner as `0x${string}`, spender as `0x${string}`],
    });
  } catch {
    return null;
  }
}

export const POST = withSession(guardDuplicates("swap/approve", async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { token, amount, chain, approvalCode } = schema.parse(body);

    const chainConfig = getChainBySwapName(chain);
    if (!chainConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown chain: ${chain}` },
        { status: 400 }
      );
    }

    const chainIndex = String(chainConfig.chainIndex);
    const tokenAddr = normalizeAddress(token);

    // The user typed OKX's email code: send the approval OKX paused and wait
    // for it, then carry on below, which finds the allowance in place.
    const releasedTx = approvalCode ? await releasePausedApproval(approvalCode, chainIndex) : null;

    // Approve only the amount being swapped.
    const approveData = await dexApproveTransaction({
      chainIndex,
      tokenContractAddress: tokenAddr,
      approveAmount: amount,
    });

    if (!approveData?.data) {
      // No calldata = allowance already sufficient
      return NextResponse.json({
        success: true,
        data: { txHash: releasedTx, alreadyApproved: true },
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
    // Read the allowance ourselves too: right after a released approval,
    // and so a sufficient allowance never gets approved twice.
    const owner = await sessionEvmAddress(chainIndex).catch(() => null);
    const currentAllowance = owner
      ? await allowanceOf(chainConfig.chainIndex, tokenAddr, owner, approveData.dexContractAddress)
      : null;
    if (currentAllowance !== null && currentAllowance >= BigInt(amount)) {
      return NextResponse.json({
        success: true,
        data: { txHash: releasedTx, alreadyApproved: true },
      });
    }

    // Only when the current allowance is above zero: approve(0) otherwise
    // costs gas for nothing (and, with approval verification on, a code).
    if (USDT_ADDRESSES.includes(tokenAddr) && currentAllowance !== 0n) {
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
            // Allowance reset to 0 for the OKX DEX router: it can only lower
            // what the router may spend. The risk prompt comes with the swap.
            force: true,
          });
          // Brief pause to let the reset propagate
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (resetError) {
        // OKX holds the reset for the email code: ask for it now, or the
        // approval below would fail on USDT's non-zero allowance.
        if (approvalPromptResponseFor(resetError)) throw resetError;
        // Otherwise the reset is best-effort: continue with the approval.
      }
    }

    // Broadcast the approve tx via wallet contract-call.
    // The `to` address is the TOKEN contract (calling approve() on it).
    const callResult = await walletContractCall({
      to: tokenAddr,
      chain: chainIndex,
      inputData: approveData.data,
      // Exact-amount approval to the OKX DEX router (spender from OKX's own
      // approve API). The user's risk prompt, if any, comes with the swap.
      force: true,
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
    if (error instanceof z.ZodError) return badRequest(error);
    const prompt = approvalPromptResponseFor(error);
    if (prompt) return prompt;
    return apiError("swap/approve", error, "Approve failed");
  }
}, { recentMs: 0 }));
