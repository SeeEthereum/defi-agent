import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import {
  encodeDeposit,
  encodeDepositNative,
  parseAmount,
} from "@/lib/fluid/ftokens";
import { getFToken, isNativeUnderlying } from "@/lib/fluid/constants";
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
  amount: decimalAmount,
  chainIndex: chainIdSchema,
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { fTokenSymbol, amount, chainIndex: chainId } = schema.parse(body);

    const fToken = getFToken(chainId, fTokenSymbol);
    if (!fToken) {
      return NextResponse.json(
        { success: false, error: "Unknown market" },
        { status: 400 }
      );
    }

    const receiver = (await sessionEvmAddress(String(chainId))) as `0x${string}`;
    const rawAmount = parseAmount(amount, fToken.underlyingDecimals);
    const native = isNativeUnderlying(chainId, fTokenSymbol);

    const depositResult = await walletContractCall({
      to: fToken.address,
      chain: String(chainId),
      inputData: native
        ? encodeDepositNative(receiver)
        : encodeDeposit(rawAmount, receiver),
      ...(native ? { amt: rawAmount.toString() } : {}),
      force: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        depositTxHash: (depositResult.data as { txHash?: string })?.txHash,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("earn/supply", error, "Supply failed");
  }
});
