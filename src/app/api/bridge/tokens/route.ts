import { NextRequest, NextResponse } from "next/server";
import { bridgeTokens } from "@/lib/bridge/lifi";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const fromChain = searchParams.get("fromChain");
    const toChain = searchParams.get("toChain");

    if (!fromChain || !toChain) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: fromChain, toChain" },
        { status: 400 }
      );
    }

    const tokens = await bridgeTokens(fromChain, toChain);

    return NextResponse.json({ success: true, data: tokens });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get bridge tokens";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
