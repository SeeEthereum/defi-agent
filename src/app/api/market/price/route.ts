import { NextRequest, NextResponse } from "next/server";
import { marketPrice } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chain = searchParams.get("chain");

    if (!address || !chain) {
      return NextResponse.json(
        { success: false, error: "address and chain parameters are required" },
        { status: 400 }
      );
    }

    const result = await marketPrice({ address, chain });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Price query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
