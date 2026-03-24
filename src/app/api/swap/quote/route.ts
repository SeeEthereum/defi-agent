import { NextRequest, NextResponse } from "next/server";
import { dexQuote } from "@/lib/okx/dex-api";
import { z } from "zod";
import { normalizeAddress } from "@/lib/utils";
import { getChainBySwapName } from "@/lib/chains";

const schema = z.object({
  fromToken: z.string().min(1),
  toToken: z.string().min(1),
  amount: z.string().min(1), // minimal units (wei)
  chain: z.string().min(1), // swap chain name (ethereum, arbitrum, etc.)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromToken, toToken, amount, chain } = schema.parse(body);

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
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Quote failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
