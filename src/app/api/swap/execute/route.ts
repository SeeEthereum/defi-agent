import { NextRequest, NextResponse } from "next/server";
import { dexSwap } from "@/lib/okx/dex-api";
import { walletContractCall, securityTxScan } from "@/lib/okx/cli";
import { z } from "zod";
import { normalizeAddress, toUiUnits } from "@/lib/utils";
import { getChainBySwapName } from "@/lib/chains";

// Chains that support MEV protection
const MEV_SUPPORTED_CHAINS = ["ethereum", "bsc", "base"];

const schema = z.object({
  fromToken: z.string().min(1),
  toToken: z.string().min(1),
  amount: z.string().min(1),
  chain: z.string().min(1),
  wallet: z.string().min(1),
  slippage: z.string().optional(),
  gasLevel: z.enum(["slow", "average", "fast"]).optional(),
  mevProtection: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fromToken,
      toToken,
      amount,
      chain,
      wallet,
      slippage,
      gasLevel,
      mevProtection,
    } = schema.parse(body);

    const chainConfig = getChainBySwapName(chain);
    if (!chainConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown chain: ${chain}` },
        { status: 400 }
      );
    }

    const chainIndex = String(chainConfig.chainIndex);

    // Get swap calldata from OKX DEX Aggregator API
    const swapResult = await dexSwap({
      chainIndex,
      fromTokenAddress: normalizeAddress(fromToken),
      toTokenAddress: normalizeAddress(toToken),
      amount,
      userWalletAddress: normalizeAddress(wallet),
      slippagePercent: slippage ?? "0.5",
    });

    const tx = swapResult?.tx;
    if (!tx) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The swap service did not return transaction data. The pair or amount may not be supported.",
        },
        { status: 400 }
      );
    }

    // ── Security tx-scan (pre-execution check) ──────────────────────────────
    let securityWarning: string | null = null;
    try {
      const scanResult = await securityTxScan({
        from: normalizeAddress(wallet),
        to: normalizeAddress(tx.to),
        chain,
        data: tx.data,
        value: tx.value !== "0" ? tx.value : undefined,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scan = scanResult.data as any;
      const riskLevel =
        scan?.riskLevel ?? scan?.risk_level ?? scan?.level ?? "";
      const riskItems: string[] = scan?.riskItems ?? scan?.risks ?? [];
      if (
        riskLevel === "HIGH" ||
        riskLevel === "high" ||
        riskLevel === "3"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Security scan flagged this transaction as HIGH RISK: ${riskItems.join(", ") || "Potential malicious activity detected."}`,
            securityScan: scan,
          },
          { status: 400 }
        );
      }
      if (
        riskLevel === "MEDIUM" ||
        riskLevel === "medium" ||
        riskLevel === "2"
      ) {
        securityWarning = `Security scan flagged medium risk: ${riskItems.join(", ") || "Proceed with caution."}`;
      }
    } catch {
      // Security scan is best-effort — don't block if it fails
    }

    // ── Execute via wallet contract-call ────────────────────────────────────
    const valueUi =
      tx.value && tx.value !== "0"
        ? toUiUnits(tx.value, chainConfig.nativeDecimals)
        : "0";

    const useMev = mevProtection && MEV_SUPPORTED_CHAINS.includes(chain);

    const callResult = await walletContractCall({
      to: normalizeAddress(tx.to),
      chain: chainIndex,
      inputData: tx.data,
      value: valueUi,
      gasLimit: tx.gas,
      mevProtection: useMev,
      force: true, // Skip backend simulation — approval may not be reflected yet
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

    if (
      callData?.status === "failed" ||
      callData?.status === "reverted"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Transaction was sent but reverted on-chain. You may have insufficient balance or the price moved too much.",
        },
        { status: 400 }
      );
    }

    if (callData?.confirming) {
      return NextResponse.json({
        success: true,
        data: {
          status: "confirming",
          message:
            "Transaction signed and broadcast. Waiting for on-chain confirmation.",
          txHash: callData.txHash ?? null,
          mevProtected: useMev ?? false,
          securityWarning,
          ...callData,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: "broadcast",
        message: txHash
          ? "Transaction broadcast successfully."
          : "Transaction submitted.",
        txHash: txHash ?? null,
        mevProtected: useMev ?? false,
        gasLevel: gasLevel ?? "average",
        securityWarning,
        routerResult: swapResult?.routerResult ?? null,
        ...callData,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Swap execution failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
