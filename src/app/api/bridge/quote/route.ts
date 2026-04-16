import { NextRequest, NextResponse } from "next/server";
import { bridgeQuote } from "@/lib/bridge/lifi";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const fromChain = searchParams.get("fromChain");
    const toChain = searchParams.get("toChain");
    const fromToken = searchParams.get("fromToken");
    const toToken = searchParams.get("toToken");
    const fromAmount = searchParams.get("fromAmount");
    const fromAddress = searchParams.get("fromAddress");

    if (!fromChain || !toChain || !fromToken || !toToken || !fromAmount || !fromAddress) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: fromChain, toChain, fromToken, toToken, fromAmount, fromAddress" },
        { status: 400 }
      );
    }

    const quote = await bridgeQuote({
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
    });

    return NextResponse.json({ success: true, data: quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get bridge quote";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
