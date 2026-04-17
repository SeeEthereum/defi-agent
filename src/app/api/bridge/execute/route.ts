import { NextRequest, NextResponse } from "next/server";
import { bridgeQuote } from "@/lib/bridge/lifi";
import { walletContractCall } from "@/lib/okx/cli";
import { z } from "zod";
import { getChainByIndex } from "@/lib/chains";
import { toUiUnits } from "@/lib/utils";
import { encodeApprove } from "@/lib/fluid/ftokens";

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

export async function POST(request: NextRequest) {
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

    if (!isNativeToken(fromToken) && approvalAddress) {
      try {
        const approveCalldata = encodeApprove(
          approvalAddress.toLowerCase() as `0x${string}`,
          BigInt(fromAmount)
        );

        const approveResult = await walletContractCall({
          to: fromToken.toLowerCase(),
          chain: fromChain,
          inputData: approveCalldata,
          // Our own OKX-style calldata — safe to append Builder Code
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
      } catch (approveError) {
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

    // ── STEP 2: Execute the bridge transaction ──────────────────────────────
    // Convert value from wei to UI units (walletContractCall expects decimal format)
    const valueWei = txReq.value ?? "0";
    const valueUi =
      valueWei && valueWei !== "0" && valueWei !== "0x0"
        ? toUiUnits(
            BigInt(valueWei).toString(),
            chainConfig.nativeDecimals
          )
        : "0";

    // Execute via wallet contract-call (source chain).
    // IMPORTANT: skipBuilderCode=true because LI.FI calldata is third-party;
    // appending bytes could corrupt validation in the bridge router contract.
    const callResult = await walletContractCall({
      to: txReq.to,
      chain: fromChain,
      inputData: txReq.data,
      value: valueUi,
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
          error: "Bridge transaction reverted on-chain. The route may have changed or the approval may not have confirmed yet — try again in a few seconds.",
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
    const message =
      error instanceof Error ? error.message : "Bridge execution failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
