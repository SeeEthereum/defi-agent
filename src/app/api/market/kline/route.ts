import { NextRequest, NextResponse } from "next/server";
import { marketKline } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chain = searchParams.get("chain");
    const bar = searchParams.get("bar") ?? undefined;
    const limit = searchParams.get("limit") ?? undefined;

    if (!address || !chain) {
      return NextResponse.json(
        { success: false, error: "address and chain parameters are required" },
        { status: 400 }
      );
    }

    const result = await marketKline({ address, chain, bar, limit });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kline query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
