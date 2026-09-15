import { NextRequest, NextResponse } from "next/server";
import { bridgeStatus } from "@/lib/bridge/lifi";
import { withSession } from "@/lib/session/session";

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const txHash = searchParams.get("txHash");
    const fromChain = searchParams.get("fromChain");
    const toChain = searchParams.get("toChain");
    // Optional: the tool key from the original quote (e.g. "across", "hop").
    // Passing it avoids INVALID responses for routes LI.FI can't auto-detect.
    const bridge = searchParams.get("bridge") ?? undefined;

    if (!txHash || !fromChain || !toChain) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: txHash, fromChain, toChain" },
        { status: 400 }
      );
    }

    const status = await bridgeStatus(txHash, fromChain, toChain, bridge);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get bridge status";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
