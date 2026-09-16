import { NextRequest, NextResponse } from "next/server";
import { dexQuote } from "@/lib/okx/dex-api";
import { z } from "zod";
import { normalizeAddress } from "@/lib/utils";
import { getChainBySwapName } from "@/lib/chains";
import { withSession } from "@/lib/session/session";
import {
  tokenAddress,
  baseUnitAmount,
  slippagePercent,
  badRequest,
  apiError,
} from "@/lib/api/validation";

const schema = z.object({
  fromToken: tokenAddress,
  toToken: tokenAddress,
  amount: baseUnitAmount,
  chain: z.string().min(1), // swap chain name (ethereum, arbitrum, etc.)
  autoSlippage: z.boolean().optional(),
  slippage: slippagePercent.optional(),
  priceImpactProtection: z.string().optional(),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { fromToken, toToken, amount, chain, autoSlippage, slippage, priceImpactProtection } = schema.parse(body);

    const chainConfig = getChainBySwapName(chain);
    if (!chainConfig) {
      return NextResponse.json(
        { success: false, error: `Unsupported chain: ${chain}` },
        { status: 400 }
      );
    }

    const result = await dexQuote({
      chainIndex: String(chainConfig.chainIndex),
      fromTokenAddress: normalizeAddress(fromToken),
      toTokenAddress: normalizeAddress(toToken),
      amount,
      autoSlippage: autoSlippage ?? false,
      slippagePercent: slippage,
      priceImpactProtectionPercent: priceImpactProtection ?? "0.9",
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("swap/quote", error, "Quote failed");
  }
});
