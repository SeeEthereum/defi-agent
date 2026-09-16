import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import {
  encodeWithdraw,
  encodeRedeem,
  encodeWithdrawNative,
  encodeRedeemNative,
  parseAmount,
} from "@/lib/fluid/ftokens";
import { getFToken, isNativeUnderlying } from "@/lib/fluid/constants";
import { getPublicClient } from "@/lib/fluid/client";
import { erc20Abi } from "@/lib/fluid/abis";
import { withSession } from "@/lib/session/session";
import {
  decimalAmount,
  chainId as chainIdSchema,
  badRequest,
  apiError,
  sessionEvmAddress,
} from "@/lib/api/validation";
import { z } from "zod";

const schema = z.object({
  fTokenSymbol: z.string().min(1),
  amount: decimalAmount.optional(),
  chainIndex: chainIdSchema,
  isAll: z.boolean().optional(),
  shares: z.string().regex(/^[0-9]+$/).optional(),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { fTokenSymbol, amount, chainIndex: chainId, isAll, shares } =
      schema.parse(body);

    const fToken = getFToken(chainId, fTokenSymbol);
    if (!fToken) {
      return NextResponse.json(
        { success: false, error: "Unknown market" },
        { status: 400 }
      );
    }

    const owner = (await sessionEvmAddress(String(chainId))) as `0x${string}`;
    const native = isNativeUnderlying(chainId, fTokenSymbol);

    let withdrawCalldata: `0x${string}`;
    if (native && isAll) {
      // A full exit must redeem shares, never withdraw an asset amount, or
      // rounding leaves dust behind. When the caller did not pass its share
      // balance (the AI flow does not know it), read it on-chain.
      const sharesToRedeem = shares
        ? BigInt(shares)
        : ((await getPublicClient(chainId).readContract({
            address: fToken.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          })) as bigint);
      if (sharesToRedeem <= 0n) {
        return NextResponse.json(
          { success: false, error: "No position to withdraw" },
          { status: 400 }
        );
      }
      withdrawCalldata = encodeRedeemNative(sharesToRedeem, owner, owner);
    } else if (native) {
      if (!amount) {
        return NextResponse.json(
          { success: false, error: "amount is required" },
          { status: 400 }
        );
      }
      withdrawCalldata = encodeWithdrawNative(
        parseAmount(amount, fToken.underlyingDecimals),
        owner,
        owner
      );
    } else if (isAll) {
      // A full exit must redeem shares, never withdraw an asset amount, or
      // rounding leaves dust behind. When the caller did not pass its share
      // balance (the AI flow does not know it), read it on-chain.
      const sharesToRedeem = shares
        ? BigInt(shares)
        : ((await getPublicClient(chainId).readContract({
            address: fToken.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          })) as bigint);
      if (sharesToRedeem <= 0n) {
        return NextResponse.json(
          { success: false, error: "No position to withdraw" },
          { status: 400 }
        );
      }
      withdrawCalldata = encodeRedeem(sharesToRedeem, owner, owner);
    } else {
      if (!amount) {
        return NextResponse.json(
          { success: false, error: "amount is required" },
          { status: 400 }
        );
      }
      withdrawCalldata = encodeWithdraw(
        parseAmount(amount, fToken.underlyingDecimals),
        owner,
        owner
      );
    }

    const result = await walletContractCall({
      to: fToken.address,
      chain: String(chainId),
      inputData: withdrawCalldata,
      force: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        txHash: (result.data as { txHash?: string })?.txHash,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("earn/withdraw", error, "Withdraw failed");
  }
});
