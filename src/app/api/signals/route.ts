import { NextRequest, NextResponse } from "next/server";
import { signalList } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get("chain");

    if (!chain) {
      return NextResponse.json(
        { success: false, error: "chain parameter is required" },
        { status: 400 }
      );
    }

    const walletType = searchParams.get("walletType") ?? undefined;
    const minAmountUsd = searchParams.get("minAmountUsd") ?? undefined;
    const maxAmountUsd = searchParams.get("maxAmountUsd") ?? undefined;
    const minAddressCount = searchParams.get("minAddressCount") ?? undefined;
    const tokenAddress = searchParams.get("tokenAddress") ?? undefined;
    const minMarketCapUsd = searchParams.get("minMarketCapUsd") ?? undefined;
    const minLiquidityUsd = searchParams.get("minLiquidityUsd") ?? undefined;

    const result = await signalList({
      chain,
      walletType,
      minAmountUsd,
      maxAmountUsd,
      minAddressCount,
      tokenAddress,
      minMarketCapUsd,
      minLiquidityUsd,
    });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Signal query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
