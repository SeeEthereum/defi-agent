import { NextRequest, NextResponse } from "next/server";
import { dexQuote } from "@/lib/okx/dex-api";
import { z } from "zod";
import { normalizeAddress } from "@/lib/utils";
import { getChainBySwapName } from "@/lib/chains";
import { withSession } from "@/lib/session/session";
import { issueQuote, quoteFingerprint } from "@/lib/api/quote-store";
import {
  tokenAddress,
  baseUnitAmount,
  slippagePercent,
  badRequest,
  apiError,
} from "@/lib/api/validation";

function swapQuotedOut(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as {
    toTokenAmount?: unknown;
    routerResult?: { toTokenAmount?: unknown };
    data?: Array<{ toTokenAmount?: unknown }>;
  };
  if (typeof r.toTokenAmount === "string") return r.toTokenAmount;
  if (typeof r.routerResult?.toTokenAmount === "string") return r.routerResult.toTokenAmount;
  const nested = r.data?.[0]?.toTokenAmount;
  return typeof nested === "string" ? nested : null;
}

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

    const chainIndex = String(chainConfig.chainIndex);
    const fromTokenNorm = normalizeAddress(fromToken);
    const toTokenNorm = normalizeAddress(toToken);

    const result = await dexQuote({
      chainIndex,
      fromTokenAddress: fromTokenNorm,
      toTokenAddress: toTokenNorm,
      amount,
      autoSlippage: autoSlippage ?? false,
      slippagePercent: slippage,
      priceImpactProtectionPercent: priceImpactProtection ?? "0.9",
    });

    const fingerprint = quoteFingerprint(["swap", chainIndex, fromTokenNorm, toTokenNorm, amount]);
    const quoteId = issueQuote(fingerprint, swapQuotedOut(result));

    return NextResponse.json({ success: true, data: { ...result, quoteId } });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("swap/quote", error, "Quote failed");
  }
});
