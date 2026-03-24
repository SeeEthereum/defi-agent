import { NextRequest, NextResponse } from "next/server";
import { swapQuote } from "@/lib/okx/cli";
import { z } from "zod";
import { normalizeAddress } from "@/lib/utils";

const schema = z.object({
  fromToken: z.string().min(1),
  toToken: z.string().min(1),
  amount: z.string().min(1), // minimal units (wei)
  chain: z.string().min(1), // swap chain name (ethereum, bsc, etc.)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromToken, toToken, amount, chain } = schema.parse(body);

    const result = await swapQuote({
      from: normalizeAddress(fromToken),
      to: normalizeAddress(toToken),
      amount,
      chain,
    });

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Quote failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
