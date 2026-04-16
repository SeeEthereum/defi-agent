import { NextRequest, NextResponse } from "next/server";
import { bridgeStatus } from "@/lib/bridge/lifi";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const txHash = searchParams.get("txHash");
    const fromChain = searchParams.get("fromChain");
    const toChain = searchParams.get("toChain");

    if (!txHash || !fromChain || !toChain) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: txHash, fromChain, toChain" },
        { status: 400 }
      );
    }

    const status = await bridgeStatus(txHash, fromChain, toChain);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get bridge status";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
