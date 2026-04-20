import { NextRequest, NextResponse } from "next/server";
import { hlPrices } from "@/lib/hyperliquid/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const coin = searchParams.get("coin") ?? undefined;
    const data = await hlPrices(coin);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch prices";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
