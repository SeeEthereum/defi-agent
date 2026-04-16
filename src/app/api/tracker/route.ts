import { NextRequest, NextResponse } from "next/server";
import { addressTrackerActivities } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackerType = searchParams.get("trackerType") ?? "smart_money";
    const walletAddress = searchParams.get("walletAddress") ?? undefined;
    const tradeType = searchParams.get("tradeType") ?? undefined;
    const chain = searchParams.get("chain") ?? undefined;
    const minVolume = searchParams.get("minVolume") ?? undefined;
    const maxVolume = searchParams.get("maxVolume") ?? undefined;
    const minMarketCap = searchParams.get("minMarketCap") ?? undefined;
    const maxMarketCap = searchParams.get("maxMarketCap") ?? undefined;

    const result = await addressTrackerActivities({
      trackerType,
      walletAddress,
      tradeType,
      chain,
      minVolume,
      maxVolume,
      minMarketCap,
      maxMarketCap,
    });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tracker query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
