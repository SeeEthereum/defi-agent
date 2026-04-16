import { NextRequest, NextResponse } from "next/server";
import { gatewayGas } from "@/lib/okx/cli";

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

    const result = await gatewayGas(chain);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gas query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
