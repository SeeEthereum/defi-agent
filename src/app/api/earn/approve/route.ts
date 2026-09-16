import { NextRequest, NextResponse } from "next/server";
import { walletContractCall } from "@/lib/okx/cli";
import { encodeApprove, parseAmount } from "@/lib/fluid/ftokens";
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

const USDT_ADDRESSES = new Set([
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // Ethereum
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // Arbitrum
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // Polygon
  "0x55d398326f99059ff775485246999027b3197955", // BNB Chain
]);

const schema = z.object({
  fTokenSymbol: z.string().min(1),
  amount: decimalAmount,
  chainIndex: chainIdSchema,
});

function txHashOf(data: unknown): `0x${string}` | null {
  if (typeof data === "string" && data.startsWith("0x")) {
    return data as `0x${string}`;
  }
  if (data && typeof data === "object") {
    const rec = data as {
      txHash?: string;
      hash?: string;
      transactionHash?: string;
    };
    const hash = rec.txHash ?? rec.hash ?? rec.transactionHash;
    if (hash?.startsWith("0x")) return hash as `0x${string}`;
  }
  return null;
}

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

    // Native deposits use msg.value — no ERC-20 allowance to set.
    if (isNativeUnderlying(chainId, fTokenSymbol)) {
      return NextResponse.json({
        success: true,
        data: { txHash: null, alreadyApproved: true },
      });
    }

    const owner = (await sessionEvmAddress(String(chainId))) as `0x${string}`;
    const rawAmount = parseAmount(amount, fToken.underlyingDecimals);
    const spender = fToken.address;
    const token = fToken.underlying;

    const client = getPublicClient(chainId);
    const allowance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    });

    if (allowance >= rawAmount) {
      return NextResponse.json({
        success: true,
        data: { txHash: null, alreadyApproved: true },
      });
    }

    if (USDT_ADDRESSES.has(token) && allowance > 0n) {
      const resetResult = await walletContractCall({
        to: token,
        chain: String(chainId),
        inputData: encodeApprove(spender, 0n),
        force: true,
      });
      const resetHash = txHashOf(resetResult.data);
      if (resetHash) {
        await client.waitForTransactionReceipt({ hash: resetHash });
      } else {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const result = await walletContractCall({
      to: token,
      chain: String(chainId),
      inputData: encodeApprove(spender, rawAmount),
      force: true,
    });

    return NextResponse.json({
      success: true,
      data: { txHash: txHashOf(result.data) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("earn/approve", error, "Approve failed");
  }
});
