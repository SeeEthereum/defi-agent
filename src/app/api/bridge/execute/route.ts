import { NextRequest, NextResponse } from "next/server";
import { bridgeQuote } from "@/lib/bridge/lifi";
import { walletContractCall } from "@/lib/okx/cli";
import { gasStationResponseFor } from "@/lib/okx/gas-station";
import { z } from "zod";
import { getChainByIndex } from "@/lib/chains";
import { encodeApprove } from "@/lib/fluid/ftokens";
import { getPublicClient } from "@/lib/fluid/client";
import { erc20Abi, maxUint256 } from "viem";
import { withSession } from "@/lib/session/session";

const schema = z.object({
  fromChain: z.string().min(1),
  toChain: z.string().min(1),
  fromToken: z.string().min(1),
  toToken: z.string().min(1),
  fromAmount: z.string().min(1),
  fromAddress: z.string().min(1),
});

// LI.FI's native token sentinels — both cases exist; normalize via lowercase
const NATIVE_ZERO = "0x0000000000000000000000000000000000000000";
const NATIVE_EEE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function isNativeToken(address: string): boolean {
  const a = address.toLowerCase();
  return a === NATIVE_ZERO || a === NATIVE_EEE;
}

/**
 * Read the current ERC-20 allowance on-chain.
 * Returns null if the chain is not supported by viem client.
 */
async function readAllowance(
  chainIndex: number,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`
): Promise<bigint | null> {
  try {
    const client = getPublicClient(chainIndex);
    return await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    });
  } catch {
    return null;
  }
}

/**
 * Poll on-chain allowance every 2 s until it is ≥ required,
 * or throw after 40 s timeout (enough for most chains).
 */
async function waitForAllowance(
  chainIndex: number,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  required: bigint
): Promise<void> {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const current = await readAllowance(chainIndex, token, owner, spender);
    // If we can't read (unsupported chain for viem), assume it'll be fine and proceed
    if (current === null || current >= required) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    "Approval confirmation timed out after 40 s. Please retry — the approve may still be pending."
  );
}

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { fromChain, toChain, fromToken, toToken, fromAmount, fromAddress } =
      schema.parse(body);

    // Validate source chain
    const chainConfig = getChainByIndex(Number(fromChain));
    if (!chainConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown source chain: ${fromChain}` },
        { status: 400 }
      );
    }

    // Get bridge quote with transaction data from LI.FI
    const quote = await bridgeQuote({
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
    });

    const txReq = quote.transactionRequest;
    if (!txReq || !txReq.to || !txReq.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Bridge service did not return transaction data. The route may not be supported.",
        },
        { status: 400 }
      );
    }

    // ── STEP 1: ERC-20 approve (if bridging a non-native token) ─────────────
    // LI.FI returns `estimate.approvalAddress` — the router/bridge contract
    // that needs allowance to pull the fromToken from the user.
    // Skip for native tokens (ETH/BNB/MATIC) — they don't require approval.
    let approveTxHash: string | null = null;
    const approvalAddress = quote.estimate.approvalAddress;
    const chainIndex = Number(fromChain);
    const fromTokenAddr = fromToken.toLowerCase() as `0x${string}`;
    const ownerAddr = fromAddress.toLowerCase() as `0x${string}`;
    const requiredAmount = BigInt(fromAmount);

    if (!isNativeToken(fromToken) && approvalAddress) {
      const spenderAddr = approvalAddress.toLowerCase() as `0x${string}`;

      // ── 1a. Check existing allowance — skip approve if already sufficient ──
      const existingAllowance = await readAllowance(
        chainIndex,
        fromTokenAddr,
        ownerAddr,
        spenderAddr
      );

      const needsApprove =
        existingAllowance === null || existingAllowance < requiredAmount;

      if (needsApprove) {
        try {
          // Approve MaxUint256 so future bridges on this route don't need
          // another approve transaction. The bridge contract can only pull
          // what it's explicitly bridging, so this is safe in practice.
          const approveCalldata = encodeApprove(spenderAddr, maxUint256);

          const approveResult = await walletContractCall({
            to: fromTokenAddr,
            chain: fromChain,
            inputData: approveCalldata,
            // Our own calldata — safe to append Builder Code
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const approveData = approveResult.data as any;
          approveTxHash =
            approveData?.txHash ??
            approveData?.hash ??
            approveData?.transactionHash ??
            null;

          if (
            approveData?.status === "failed" ||
            approveData?.status === "reverted"
          ) {
            return NextResponse.json(
              {
                success: false,
                error:
                  "Approval transaction reverted. You may have insufficient balance for gas.",
              },
              { status: 400 }
            );
          }

          // ── 1b. Wait for the approve to be mined before bridging ───────────
          // The OKX CLI broadcasts the tx and returns immediately. If we call
          // the bridge contract-call before the approve is confirmed, the gas
          // estimation fails with "execution reverted" because allowance = 0.
          await waitForAllowance(
            chainIndex,
            fromTokenAddr,
            ownerAddr,
            spenderAddr,
            requiredAmount
          );
        } catch (approveError) {
          // Gas Station can trigger on the approve call too (it's the
          // first contract-call of the flow) — surface the picker, don't
          // bury it in the approve-failed message.
          const gasStation = gasStationResponseFor(approveError);
          if (gasStation) return gasStation;

          const msg =
            approveError instanceof Error
              ? approveError.message
              : "Approval failed";
          return NextResponse.json(
            {
              success: false,
              error: `Failed to approve token for bridge: ${msg}`,
            },
            { status: 400 }
          );
        }
      }
    }

    // ── STEP 2: Execute the bridge transaction ──────────────────────────────
    // onchainos `--amt` expects minimal units (wei) as a whole-number string,
    // not a decimal UI value. Normalize hex → decimal; "0" / missing → omit.
    const rawValue = txReq.value ?? "0";
    const amtWei =
      rawValue && rawValue !== "0" && rawValue !== "0x0"
        ? BigInt(rawValue).toString()
        : "0";

    // Execute via wallet contract-call (source chain).
    // IMPORTANT: skipBuilderCode=true because LI.FI calldata is third-party;
    // appending bytes could corrupt validation in the bridge router contract.
    const callResult = await walletContractCall({
      to: txReq.to,
      chain: fromChain,
      inputData: txReq.data,
      amt: amtWei,
      gasLimit: txReq.gasLimit,
      force: true,
      skipBuilderCode: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callData = callResult.data as any;

    const txHash =
      callData?.txHash ??
      callData?.hash ??
      callData?.transactionHash ??
      (typeof callData === "string" && callData.startsWith("0x")
        ? callData
        : null);

    if (callData?.status === "failed" || callData?.status === "reverted") {
      return NextResponse.json(
        {
          success: false,
          error: "Bridge transaction reverted on-chain. The route may have changed — try again in a few seconds.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        txHash: txHash ?? null,
        approveTxHash,
        bridge: quote.tool,
        estimatedTime: quote.estimate.executionDuration,
        toAmount: quote.estimate.toAmount,
        toAmountMin: quote.estimate.toAmountMin,
        fromChain,
        toChain,
        ...(callData?.confirming ? { status: "confirming" } : { status: "broadcast" }),
      },
    });
  } catch (error) {
    const gasStation = gasStationResponseFor(error);
    if (gasStation) return gasStation;

    const message =
      error instanceof Error ? error.message : "Bridge execution failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
