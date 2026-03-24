import { NextResponse } from "next/server";
import { getFluidMarkets } from "@/lib/fluid/resolver";

export async function GET() {
  try {
    const markets = await getFluidMarkets();
    return NextResponse.json({ success: true, data: markets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch markets";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
