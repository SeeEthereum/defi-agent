import { NextRequest, NextResponse } from "next/server";
import { hlPositions } from "@/lib/hyperliquid/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const address = searchParams.get("address") ?? undefined;
    const showOrders = searchParams.get("showOrders") === "true";
    const data = await hlPositions(address, showOrders);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
