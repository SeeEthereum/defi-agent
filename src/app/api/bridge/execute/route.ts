import { NextRequest, NextResponse } from "next/server";
import { bridgeQuote } from "@/lib/bridge/lifi";
import { walletContractCall } from "@/lib/okx/cli";
import { z } from "zod";
import { getChainByIndex } from "@/lib/chains";
import { toUiUnits } from "@/lib/utils";

const schema = z.object({
  fromChain: z.string().min(1),
  toChain: z.string().min(1),
  fromToken: z.string().min(1),
  toToken: z.string().min(1),
  fromAmount: z.string().min(1),
  fromAddress: z.string().min(1),
});

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

    // Convert value from wei to human-readable for walletContractCall
    const valueWei = txReq.value ?? "0";
    const valueUi =
      valueWei && valueWei !== "0" && valueWei !== "0x0"
        ? toUiUnits(
            BigInt(valueWei).toString(),
            chainConfig.nativeDecimals
          )
        : "0";

    // Execute via wallet contract-call (source chain)
    const callResult = await walletContractCall({
      to: txReq.to,
      chain: fromChain,
      inputData: txReq.data,
      value: valueUi,
      gasLimit: txReq.gasLimit,
      force: true,
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
          error: "Bridge transaction was sent but reverted on-chain. You may have insufficient balance.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        txHash: txHash ?? null,
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
